import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260901101500_order_review_idempotency/migration.sql"
);

describe("order review idempotency persistence", () => {
  it("adds byte-stable idempotency evidence without removing the natural review uniqueness", () => {
    expect(schema).toMatch(
      /idempotencyKey\s+String\s+@unique\([^\n]*\)\s+@map\("idempotency_key"\)\s+@db\.VarChar\(191\)/
    );
    expect(schema).toMatch(
      /requestFingerprint\s+String\s+@map\("request_fingerprint"\)\s+@db\.Char\(64\)/
    );
    expect(schema).toContain("@@unique([bookingOrderId, reviewerUserId, targetType])");
  });

  it("uses a forward-only migration that safely backfills historical rows before enforcing constraints", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("ADD COLUMN `idempotency_key` VARCHAR(191) NULL");
    expect(migration).toContain("ADD COLUMN `request_fingerprint` CHAR(64) NULL");
    expect(migration).toMatch(/UPDATE `order_reviews`[\s\S]*legacy-order-review:/);
    expect(migration).toContain("MODIFY `idempotency_key` VARCHAR(191) NOT NULL");
    expect(migration).toContain("MODIFY `request_fingerprint` CHAR(64) NOT NULL");
    expect(migration).toContain(
      "UNIQUE INDEX `order_reviews_idempotency_key_key`(`idempotency_key`)"
    );
    expect(migration).toMatch(
      /ALTER TABLE `order_review_tags`[\s\S]*MODIFY `label` VARCHAR\(40\) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL/
    );
  });
});
