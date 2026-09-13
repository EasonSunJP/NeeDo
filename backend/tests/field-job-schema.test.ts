import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FIELD_JOB_FULFILLMENT_MODES } from "../src/repositories/field-job.repository";
import {
  buildRolePermissionAssignments,
  FIELD_JOB_PERMISSIONS
} from "../src/constants/permissions.constants";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260913143000_formal_field_job_projection/migration.sql"
  ),
  "utf8"
);

describe("formal field-job schema contract", () => {
  it("indexes the authoritative BookingOrder projection without creating a duplicate table", () => {
    expect(FIELD_JOB_FULFILLMENT_MODES).toEqual(["home", "home_visit"]);
    expect(schema).toContain(
      '@@index([fulfillmentMode, status, createdAt, deletedAt, id], map: "booking_orders_field_job_projection_idx")'
    );
    expect(migration).toContain("booking_orders_field_job_projection_idx");
    expect(migration).not.toMatch(/CREATE TABLE\s+[`"]?field_jobs/i);
  });

  it("deploys dedicated read and exact-address permissions to admin/operator only", () => {
    const assignments = buildRolePermissionAssignments();
    expect(migration).toContain("backoffice:field-jobs:read");
    expect(migration).toContain("backoffice:field-jobs:address:read");
    expect(migration).toContain("roles.code IN ('admin', 'operator')");
    expect(migration).not.toContain("'viewer'");
    expect(migration).not.toContain("'finance'");
    expect(assignments.admin).toEqual(expect.arrayContaining(Object.values(FIELD_JOB_PERMISSIONS)));
    expect(assignments.operator).toEqual(
      expect.arrayContaining(Object.values(FIELD_JOB_PERMISSIONS))
    );
    expect(assignments.viewer).not.toEqual(
      expect.arrayContaining(Object.values(FIELD_JOB_PERMISSIONS))
    );
    expect(assignments.finance).not.toEqual(
      expect.arrayContaining(Object.values(FIELD_JOB_PERMISSIONS))
    );
  });
});
