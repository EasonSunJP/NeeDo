import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationChecksums = {
  "20260901231000_user_global_policy_utc_bootstrap":
    "0eab6473a862508b470fa0179b3d05cb634673bd07fedabecdc7c259602dc60b",
  "20260902110000_agent_commission_operating_cost":
    "8d10e9055d113a27666adfeaa68e5e1099907308dc0e27d2d502c737563514c8",
  "20260902143000_official_notice_delivery":
    "b1f55ced34b46028cd49d121be0967fb24f4ba5670e85f4a5a6f1f56189688da"
} as const;

describe("applied migration history reconciliation", () => {
  it.each(Object.entries(migrationChecksums))(
    "keeps %s byte-identical to the successfully applied database migration",
    (migrationName, expectedChecksum) => {
      const migration = readFileSync(
        resolve("prisma", "migrations", migrationName, "migration.sql")
      );

      expect(createHash("sha256").update(migration).digest("hex")).toBe(expectedChecksum);
    }
  );
});
