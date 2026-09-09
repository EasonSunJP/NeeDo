import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import {
  CALENDAR_EVENT_PERMISSIONS,
  buildRolePermissionAssignments,
} from "../src/constants/permissions.constants";

const routePath = resolve(__dirname, "../src/routes/calendar-event.routes.ts");

describe("calendar event API contract", () => {
  it("mounts authenticated formal calendar routes", async () => {
    await request(createApp())
      .get("/api/v1/calendar-events?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&page=1&page_size=20")
      .timeout({ response: 1_000 })
      .expect(401);
  });

  it("declares authenticated, authorized, and Zod-validated CRUD routes", () => {
    const source = readFileSync(routePath, "utf8");
    expect(source).toContain('router.get("/calendar-events"');
    expect(source).toContain('router.post("/calendar-events"');
    expect(source).toContain('router.patch("/calendar-events/:id"');
    expect(source).toContain('router.delete("/calendar-events/:id"');
    expect(source.match(/authenticate\(\),/g) ?? []).toHaveLength(4);
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
    expect(document.paths[`${env.API_PREFIX}/calendar-events/{id}`]).toMatchObject({
      patch: expect.any(Object),
      delete: expect.any(Object),
    });
  });
});
