import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("schedule slot booking query indexes", () => {
  it("indexes service and technician-service availability ranges", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260921123000_schedule_slot_booking_query_indexes/migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain(
      '@@index([serviceId, deletedAt, startsAt, id], map: "schedule_slot_service_deleted_start_id_idx")'
    );
    expect(schema).toContain(
      '@@index([technicianServiceId, deletedAt, startsAt, id], map: "schedule_slot_technician_service_deleted_start_id_idx")'
    );
    expect(migration).toContain("schedule_slot_service_deleted_start_id_idx");
    expect(migration).toContain("schedule_slot_technician_service_deleted_start_id_idx");
  });
});
