import fs from "node:fs";
import path from "node:path";

const backendRoot = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(backendRoot, "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(
  backendRoot,
  "prisma/migrations/20260901010000_order_performance_special_cancellation/migration.sql"
);

describe("Order performance schema", () => {
  it("models adverse outcomes, immutable revisions, and rebuildable summaries", () => {
    expect(schema).toContain("enum OrderPerformanceOutcome");
    expect(schema).toContain("TECHNICIAN_CANCELLED");
    expect(schema).toContain("TECHNICIAN_UNCOMPLETED");
    expect(schema).toContain("enum OrderPerformanceTreatment");
    expect(schema).toContain("SPECIAL_EXCLUDED");
    expect(schema).toContain("enum OrderPerformanceRevisionAction");
    expect(schema).toContain("APPLY_SPECIAL_EXCLUSION");
    expect(schema).toContain("REVOKE_SPECIAL_EXCLUSION");

    expect(schema).toContain("model OrderPerformanceAssessment");
    expect(schema).toMatch(/bookingOrderId\s+Int\s+@unique @map\("booking_order_id"\)/);
    expect(schema).toMatch(/currentRevisionId\s+Int\?\s+@unique @map\("current_revision_id"\)/);
    expect(schema).toContain('@@map("order_performance_assessments")');

    expect(schema).toContain("model OrderPerformanceAssessmentRevision");
    expect(schema).toMatch(
      /idempotencyKey\s+String\s+@unique @map\("idempotency_key"\) @db\.VarChar\(160\)/
    );
    expect(schema).toMatch(
      /requestFingerprint\s+String\s+@map\("request_fingerprint"\) @db\.Char\(64\)/
    );
    expect(schema).toContain('@@map("order_performance_assessment_revisions")');

    expect(schema).toContain("model TechnicianPerformanceSummary");
    expect(schema).toMatch(/technicianProfileId\s+Int\s+@unique @map\("technician_profile_id"\)/);
    expect(schema).toMatch(
      /acceptanceRateBps\s+Int\s+@default\(10000\) @map\("acceptance_rate_bps"\)/
    );
    expect(schema).toContain('@@map("technician_performance_summaries")');

    for (const modelName of [
      "OrderPerformanceAssessment",
      "OrderPerformanceAssessmentRevision",
      "TechnicianPerformanceSummary"
    ]) {
      const model = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`))?.[1];
      expect(model).toBeDefined();
      expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/);
      expect(model).toMatch(/updatedAt\s+DateTime\s+@updatedAt @map\("updated_at"\)/);
      expect(model).toMatch(/deletedAt\s+DateTime\?\s+@map\("deleted_at"\)/);
    }
  });

  it("ships deployable checks, foreign keys, and query indexes", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migration = fs.readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE `order_performance_assessments`");
    expect(migration).toContain("CREATE TABLE `order_performance_assessment_revisions`");
    expect(migration).toContain("CREATE TABLE `technician_performance_summaries`");
    expect(migration).toContain("order_performance_assessments_version_chk");
    expect(migration).toContain("technician_performance_summaries_counts_chk");
    expect(migration).toContain("technician_performance_summaries_rate_chk");
    expect(migration).toContain("CHECK (`acceptance_rate_bps` BETWEEN 0 AND 10000)");
    expect(migration).toContain("order_performance_assessments_technician_treatment_deleted_idx");
    expect(migration).toContain("order_performance_revisions_order_created_idx");
    expect(migration).toContain("order_performance_assessments_booking_order_id_fkey");
    expect(migration).toContain("order_performance_assessments_technician_profile_id_fkey");
    expect(migration).toContain("order_performance_assessments_current_revision_id_fkey");
    expect(migration).toContain("order_performance_assessment_revisions_assessment_id_fkey");
    expect(migration).toContain("order_performance_assessment_revisions_actor_user_id_fkey");
    expect(migration).toContain("technician_performance_summaries_technician_profile_id_fkey");

    const overlongMySqlIdentifiers = [...migration.matchAll(/`([^`]+)`/gu)]
      .map((match) => match[1])
      .filter((identifier) => identifier.length > 64);
    expect(overlongMySqlIdentifiers).toEqual([]);

    for (const targetTable of ["booking_orders", "technician_profiles", "users"]) {
      expect(migration).toContain(`REFERENCES \`${targetTable}\`(\`id\`)`);
    }
  });
});
