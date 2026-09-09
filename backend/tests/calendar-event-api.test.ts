import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import request from "supertest";
import { createApp } from "../src/app";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import {
  CALENDAR_EVENT_PERMISSIONS,
  buildRolePermissionAssignments,
} from "../src/constants/permissions.constants";
import {
  calendarEventListQuerySchema,
  calendarParticipantBusyQuerySchema,
} from "../src/validators/calendar-event.validator";
import { createCalendarEventRoutes } from "../src/routes/calendar-event.routes";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import { AppError } from "../src/utils/app-error";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const routePath = resolve(__dirname, "../src/routes/calendar-event.routes.ts");

describe("calendar event API contract", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps the transformed list query valid when route and controller both validate it", () => {
    const rawQuery = {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
      page: "1",
      page_size: "100",
    };

    expect(() => calendarEventListQuerySchema.parse(calendarEventListQuerySchema.parse(rawQuery)))
      .not.toThrow();
  });

  it("normalizes unique participant busy IDs and remains valid after middleware parsing", () => {
    const parsed = calendarParticipantBusyQuerySchema.parse({
      from: "2026-09-09T00:00:00.000Z",
      to: "2026-09-10T00:00:00.000Z",
      participant_identity_ids: "21,22,21",
      page: "1",
      page_size: "20",
    });

    expect(parsed.participant_identity_ids).toEqual([21, 22]);
    expect(() => calendarParticipantBusyQuerySchema.parse(parsed)).not.toThrow();
    expect(() => calendarParticipantBusyQuerySchema.parse({
      ...parsed,
      to: "2026-09-10T00:00:00.001Z",
    })).toThrow();
  });

  it("mounts authenticated formal calendar routes", async () => {
    await request(createApp())
      .get("/api/v1/calendar-events?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&page=1&page_size=20")
      .timeout({ response: 1_000 })
      .expect(401);

    await request(createApp())
      .get("/api/v1/calendar-events/participant-busy?from=2026-09-09T00:00:00.000Z&to=2026-09-10T00:00:00.000Z&participant_identity_ids=21")
      .timeout({ response: 1_000 })
      .expect(401);
  });

  it("enforces permission and returns an exact privacy-safe busy envelope", async () => {
    jest.spyOn(authServiceFactory, "createAuthServiceForRoutes").mockReturnValue({
      authenticateAccessToken: jest.fn(async (token: string) => ({
        userId: 17,
        currentIdentityId: 17,
        currentIdentityType: "customer",
        permissions: token === "without-read" ? [] : [CALENDAR_EVENT_PERMISSIONS.read],
        roles: ["customer"],
      })),
    } as never);
    const calendarEventService = {
      listParticipantBusy: jest.fn(async () => ({
        list: [{
          participantIdentityId: 21,
          startsAt: "2026-09-09T09:00:00.000Z",
          endsAt: "2026-09-09T10:00:00.000Z",
          status: "locked",
        }],
        total: 1,
        page: 1,
        page_size: 20,
      })),
    };
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createCalendarEventRoutes(env, { calendarEventService } as never));
    app.use(notFoundMiddleware);
    app.use(errorMiddleware);
    const path = "/api/v1/calendar-events/participant-busy?from=2026-09-09T00:00:00.000Z&to=2026-09-10T00:00:00.000Z&participant_identity_ids=21";

    await request(app).get(path).set("Authorization", "Bearer without-read").expect(403);
    const response = await request(app).get(path).set("Authorization", "Bearer reader").expect(200);
    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: {
        list: [{
          participantIdentityId: 21,
          startsAt: "2026-09-09T09:00:00.000Z",
          endsAt: "2026-09-09T10:00:00.000Z",
          status: "locked",
        }],
        total: 1,
        page: 1,
        page_size: 20,
      },
    });
    expect(calendarEventService.listParticipantBusy).toHaveBeenCalledTimes(1);

    calendarEventService.listParticipantBusy.mockRejectedValueOnce(new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.calendar_event.participant_forbidden",
      statusCode: 403,
    }) as never);
    await request(app).get(path.replace("participant_identity_ids=21", "participant_identity_ids=999"))
      .set("Authorization", "Bearer reader")
      .expect(403)
      .expect({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.calendar_event.participant_forbidden", data: null });
  });

  it("declares authenticated, authorized, and Zod-validated CRUD routes", () => {
    const source = readFileSync(routePath, "utf8");
    expect(source).toContain('router.get("/calendar-events"');
    expect(source).toContain('router.get("/calendar-events/participant-busy"');
    expect(source).toContain('router.post("/calendar-events"');
    expect(source).toContain('router.patch("/calendar-events/:id"');
    expect(source).toContain('router.delete("/calendar-events/:id"');
    expect(source.match(/authenticate\(\),/g) ?? []).toHaveLength(5);
    expect(source).toContain("calendarParticipantBusyQuerySchema");
    expect(source).toContain("calendarEventListQuerySchema");
    expect(source).toContain("calendarEventCreateBodySchema");
    expect(source).toContain("calendarEventUpdateBodySchema");
  });

  it("assigns calendar permissions to customer and technician roles only", () => {
    const assignments = buildRolePermissionAssignments();
    expect(assignments.customer).toEqual(
      expect.arrayContaining(Object.values(CALENDAR_EVENT_PERMISSIONS)),
    );
    expect(assignments.technician).toEqual(
      expect.arrayContaining(Object.values(CALENDAR_EVENT_PERMISSIONS)),
    );
    expect(assignments.merchant_owner).not.toEqual(
      expect.arrayContaining(Object.values(CALENDAR_EVENT_PERMISSIONS)),
    );
  });

  it("publishes the formal calendar CRUD contract in OpenAPI", () => {
    const document = createOpenApiDocument(env) as { paths: Record<string, unknown> };
    expect(document.paths[`${env.API_PREFIX}/calendar-events`]).toMatchObject({
      get: expect.any(Object),
      post: expect.any(Object),
    });
    expect(document.paths[`${env.API_PREFIX}/calendar-events/participant-busy`]).toMatchObject({
      get: expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-permission": CALENDAR_EVENT_PERMISSIONS.read,
      }),
    });
    expect(document.paths[`${env.API_PREFIX}/calendar-events/{id}`]).toMatchObject({
      patch: expect.any(Object),
      delete: expect.any(Object),
    });
  });
});
