import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";

describe("technician manual booking API", () => {
  it("mounts an authenticated formal manual-booking command", async () => {
    await request(createApp()).post("/api/v1/technician/manual-bookings").expect(401);
    const source = readFileSync(resolve(__dirname, "../src/routes/booking.routes.ts"), "utf8");
    expect(source).toContain('router.post(\n    "/technician/manual-bookings"');
    expect(source).toContain("technicianManualBookingBodySchema");
    expect(source).toContain("BOOKING_ROUTE_PERMISSIONS.manualCreate");
  });

  it("grants manual booking only to technicians", () => {
    const assignments = buildRolePermissionAssignments();
    expect(assignments.technician).toContain("technician:booking:manual-create");
    expect(assignments.customer).not.toContain("technician:booking:manual-create");
    expect(assignments.merchant_owner).not.toContain("technician:booking:manual-create");
  });
});
