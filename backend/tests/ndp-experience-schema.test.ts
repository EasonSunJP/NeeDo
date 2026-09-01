import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");

describe("NDP experience persistence contract", () => {
  it("stores version-scoped remainders and immutable financial source links", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    for (const token of [
      "model UserNdpExperienceAccumulator",
      "tierBenefitId",
      "remainderNumerator",
      "ledgerTransactionId",
      "entitlementId",
      "ndpAmount",
      "ndpPerBaseExp",
      "extraThresholdNdp",
      "extraAwardUnits",
      "accumulatorBeforeNumerator",
      "accumulatorAfterNumerator",
      "reversalOfEntryId"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("ships additive tables, indexes and restrictive financial relations", () => {
    const migration = readFileSync(
      join(root, "prisma/migrations/20260901210000_ndp_experience_events/migration.sql"),
      "utf8"
    );
    expect(migration).toContain("user_ndp_experience_accumulators");
    expect(migration).toContain("user_ndp_experience_accumulator_key");
    expect(migration).toContain("user_experience_entries_ledger_transaction_id_key");
    expect(migration).toContain("user_experience_entries_entitlement_id_key");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
  });
});
