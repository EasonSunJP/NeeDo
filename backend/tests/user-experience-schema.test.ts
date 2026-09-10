import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("user experience persistence contract", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20260901200000_user_experience_core/migration.sql"),
    "utf8"
  );

  it("keeps one customer account and adds immutable experience entries", () => {
    for (const token of [
      "model UserExperienceAccount",
      "model UserExperienceEntry",
      "totalExpUnits",
      "currentLevel",
      "lockVersion",
      "idempotencyKey",
      "baseUnits",
      "campaignFactorBps",
      "membershipMultiplierBps",
      "extraUnits",
      "finalUnits",
      "reversalOfEntryId"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("initializes missing customer accounts at Lv.1 / 0 without history", () => {
    expect(migration).toContain("INSERT INTO `user_experience_accounts`");
    expect(migration).toContain("FROM `customer_profiles`");
    expect(migration).toContain("NOT EXISTS");
    expect(migration).not.toMatch(/INSERT INTO `user_experience_entries`/);
  });

  it("enforces immutable-source lookup and chronology indexes", () => {
    expect(migration).toContain("user_experience_entries_idempotency_key_key");
    expect(migration).toContain("user_experience_entries_user_occurred_idx");
    expect(migration).toContain("user_experience_entries_source_idx");
    expect(migration).toContain("user_experience_entries_reversal_of_entry_id_fkey");
  });
});
