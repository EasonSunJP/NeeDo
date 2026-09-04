import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { ERROR_CODES } from "../src/constants/error-codes";
import {
  EXCHANGE_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import { validateExchangeIdempotencyKey } from "../src/middlewares/exchange-idempotency-key.middleware";
import {
  exchangeBookingConversionBodySchema,
  exchangeBookingConversionPostIdParamSchema
} from "../src/validators/exchange-booking-conversion.validators";

describe("Exchange matched-result booking conversion contracts", () => {
  it("accepts only a strict positive matching version and post id", () => {
    expect(exchangeBookingConversionPostIdParamSchema.parse({ id: "41" })).toEqual({ id: 41 });
    expect(exchangeBookingConversionBodySchema.parse({ expectedVersion: 7 })).toEqual({
      expectedVersion: 7
    });
    expect(exchangeBookingConversionBodySchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(
      exchangeBookingConversionBodySchema.safeParse({ expectedVersion: 7, createBooking: true }).success
    ).toBe(false);
  });

  it("parses the shared Exchange idempotency key into the common response local", async () => {
    const app = express();
    app.post("/command", validateExchangeIdempotencyKey, (_request, response) => {
      response.status(200).json({ key: response.locals.exchangeIdempotencyKey });
    });
    app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      void _next;
      const appError = error as { code?: number; statusCode?: number };
      response.status(appError.statusCode ?? 500).json({ code: appError.code });
    });

    await request(app)
      .post("/command")
      .set("Idempotency-Key", "exchange-booking-contract-0001")
      .expect(200, { key: "exchange-booking-contract-0001" });
    await request(app).post("/command").expect(400, { code: ERROR_CODES.VALIDATION });
  });

  it("reserves stable booking conversion errors and owner-only booking permission", () => {
    expect(ERROR_CODES).toMatchObject({
      EXCHANGE_MATCH_BOOKING_NOT_ALLOWED: 40313,
      EXCHANGE_MATCH_BOOKING_NOT_FOUND: 40430,
      EXCHANGE_MATCH_BOOKING_INVALID_STATE: 41010,
      EXCHANGE_MATCH_BOOKING_VERSION_CONFLICT: 41011,
      EXCHANGE_MATCH_BOOKING_ALREADY_CREATED: 41012,
      EXCHANGE_MATCH_BOOKING_SLOT_UNAVAILABLE: 41013,
      EXCHANGE_MATCH_BOOKING_IDEMPOTENCY_CONFLICT: 41014,
      EXCHANGE_MATCH_CANCELLATION_REQUIRED: 41015
    });
    expect(EXCHANGE_PERMISSIONS.matchingBookOwn).toBe("exchange:matching:book-own");

    const assignments = buildRolePermissionAssignments();
    expect(assignments.customer).toContain(EXCHANGE_PERMISSIONS.matchingBookOwn);
    expect(assignments.merchant_owner).toContain(EXCHANGE_PERMISSIONS.matchingBookOwn);
    for (const role of ["merchant_staff", "technician"] as const) {
      expect(assignments[role]).toContain(EXCHANGE_PERMISSIONS.matchingReadOwn);
      expect(assignments[role]).not.toContain(EXCHANGE_PERMISSIONS.matchingSelectOwn);
      expect(assignments[role]).not.toContain(EXCHANGE_PERMISSIONS.matchingBookOwn);
    }
  });
});
