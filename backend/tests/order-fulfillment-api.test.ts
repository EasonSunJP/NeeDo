import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import request from "supertest";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import { ERROR_CODES } from "../src/constants/error-codes";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { createAuthorizeMiddleware } from "../src/middlewares/authorize.middleware";
import { BOOKING_ROUTE_PERMISSIONS } from "../src/routes/booking.routes";

const routesSource = readFileSync(resolve(__dirname, "../src/routes/booking.routes.ts"), "utf8");
const controllerSource = readFileSync(
  resolve(__dirname, "../src/controllers/booking.controller.ts"),
  "utf8"
);

describe("formal order fulfillment routes", () => {
  it("publishes only the five guarded fulfillment endpoints and removes legacy bypasses", () => {
    for (const path of [
      '"/orders/:id/service/start"',
      '"/orders/:id/add-ons"',
      '"/orders/:id/add-ons/:addOnId/accept"',
      '"/orders/:id/add-ons/:addOnId/reject"',
      '"/orders/:id/service/end"'
    ]) {
      expect(routesSource).toContain(path);
    }
    expect(routesSource).not.toContain('"/orders/:id/start"');
    expect(routesSource).not.toContain('"/orders/:id/complete"');
    expect(controllerSource).not.toContain("public startOrder");
    expect(controllerSource).not.toContain("public completeOrder");
  });

  it("uses the formal permission codes only for customer and service-provider roles", () => {
    const rolePermissions = buildRolePermissionAssignments();
    expect(BOOKING_ROUTE_PERMISSIONS).toMatchObject({
      serviceStart: "order:service:start",
      addOnWrite: "order:add-on:write",
      serviceEnd: "order:service:end"
    });
    for (const permission of [
      "order:service:start",
      "order:add-on:write",
      "order:service:end"
    ] as const) {
      expect(rolePermissions.customer).toContain(permission);
      expect(rolePermissions.technician).toContain(permission);
      expect(rolePermissions.merchant_owner).not.toContain(permission);
      expect(rolePermissions.operator).not.toContain(permission);
    }
  });

  it("applies strict Task 2 schemas and authenticate/authorize to every route", () => {
    expect(routesSource).toContain("startServiceBodySchema");
    expect(routesSource).toContain("createOrderAddOnBodySchema");
    expect(routesSource).toContain("orderAddOnDecisionBodySchema");
    expect(routesSource).toContain("endServiceBodySchema");
    expect(routesSource.match(/controller\.(startService|createOrderAddOn|acceptOrderAddOn|rejectOrderAddOn|endService)/g)).toHaveLength(5);
    expect(routesSource.match(/authorize\(BOOKING_ROUTE_PERMISSIONS\.(serviceStart|addOnWrite|serviceEnd)\)/g)).toHaveLength(5);
  });

  it("returns a stable 403 before a fulfillment handler when the route permission is absent", async () => {
    const app = express();
    const handler = jest.fn((_request, response) => response.status(200).json({ ok: true }));
    app.use((_request, response, next) => {
      response.locals.auth = { permissions: [], roles: ["customer"], userId: 1 };
      next();
    });
    app.post(
      "/orders/41/service/start",
      createAuthorizeMiddleware(BOOKING_ROUTE_PERMISSIONS.serviceStart),
      handler
    );
    app.use(errorMiddleware);

    await request(app)
      .post("/orders/41/service/start")
      .expect(403)
      .expect({ code: ERROR_CODES.FORBIDDEN, message: "error.forbidden", data: null });
    expect(handler).not.toHaveBeenCalled();
  });
});
