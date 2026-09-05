import request from "supertest";
import type { ExchangeBookingConversionService } from "../src/services/exchange-booking-conversion.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const payload = {
  exchangePostId: 42,
  matchingVersion: 8,
  bookedAt: "2026-09-03T01:02:03.000Z",
  orders: []
};

describe("formal Exchange booking conversion route", () => {
  it("requires JWT and the exact owner booking permission", async () => {
    const service = {
      createBookings: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeBookingConversionService>;
    const fixture = await createStep06Fixture({
      exchangeBookingConversionService: service
    } as never);

    await request(fixture.app)
      .post("/api/v1/exchange/posts/42/matching/bookings")
      .set("Idempotency-Key", "idem-key-0000001")
      .send({ expectedVersion: 7 })
      .expect(401);

    fixture.replaceAdminPermissions(["auth:me", "auth:refresh", "auth:logout"]);
    const token = await fixture.loginAsAdmin();
    await request(fixture.app)
      .post("/api/v1/exchange/posts/42/matching/bookings")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "idem-key-0000001")
      .send({ expectedVersion: 7 })
      .expect(403);
    expect(service.createBookings).not.toHaveBeenCalled();
  });

  it("validates and forwards the exact authenticated command", async () => {
    const service = {
      createBookings: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeBookingConversionService>;
    const fixture = await createStep06Fixture({
      exchangeBookingConversionService: service
    } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      "auth:refresh",
      "auth:logout",
      "exchange:matching:book-own"
    ]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .post("/api/v1/exchange/posts/42/matching/bookings")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "idem-key-0000001")
      .send({ expectedVersion: 7 })
      .expect(200, { code: 0, message: "success", data: payload });

    expect(service.createBookings).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, currentIdentityId: expect.any(Number) }),
      42,
      { expectedVersion: 7 },
      "idem-key-0000001",
      expect.objectContaining({ ip: expect.any(String) })
    );
  });

  it.each([
    [{ expectedVersion: 0 }, "idem-key-0000001"],
    [{ expectedVersion: 7, priceAmount: 1 }, "idem-key-0000001"],
    [{ expectedVersion: 7 }, "short"]
  ])("rejects invalid params, body, or idempotency before the service", async (body, key) => {
    const service = {
      createBookings: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeBookingConversionService>;
    const fixture = await createStep06Fixture({
      exchangeBookingConversionService: service
    } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      "auth:refresh",
      "auth:logout",
      "exchange:matching:book-own"
    ]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .post("/api/v1/exchange/posts/42/matching/bookings")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(400);
    expect(service.createBookings).not.toHaveBeenCalled();
  });
});
