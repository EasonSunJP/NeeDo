import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import {
  TECHNICIAN_AUTOMATION_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const routes = readFileSync(resolve(__dirname, "../src/routes/technician-automation.routes.ts"), "utf8");
const controller = readFileSync(resolve(__dirname, "../src/controllers/technician-automation.controller.ts"), "utf8");

describe("technician automation API contract", () => {
  it("returns an authentication response instead of leaving settings requests pending", async () => {
    await request(createApp())
      .get("/api/v1/technician/automation-settings/booking")
      .timeout({ response: 1_000 })
      .expect(401);
  });

  it("declares authenticated, authorized, Zod-validated read/write/contact routes", () => {
    expect(routes).toContain('"/technician/automation-settings/contacts"');
    expect(routes).toContain('"/technician/automation-settings/:kind"');
    expect(routes).toContain("createAuthenticateMiddleware");
    expect(routes.match(/authenticate\(\),/g) ?? []).toHaveLength(3);
    expect(routes).toContain("createAuthorizeMiddleware(TECHNICIAN_AUTOMATION_PERMISSIONS.read)");
    expect(routes).toContain("createAuthorizeMiddleware(TECHNICIAN_AUTOMATION_PERMISSIONS.write)");
    expect(routes).toContain("technicianAutomationSettingsUpdateSchema");
    expect(controller).toContain("successResponse");
  });

  it("assigns both settings permissions to technicians but not customers", () => {
    expect(TECHNICIAN_AUTOMATION_PERMISSIONS).toEqual({
      read: "technician:automation-settings:read",
      write: "technician:automation-settings:write"
    });
    const assignments = buildRolePermissionAssignments();
    expect(assignments.technician).toEqual(expect.arrayContaining(Object.values(TECHNICIAN_AUTOMATION_PERMISSIONS)));
    expect(assignments.customer).not.toEqual(expect.arrayContaining(Object.values(TECHNICIAN_AUTOMATION_PERMISSIONS)));
  });
});
