import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("friendship identity pair rank repair", () => {
  it("ranks only friendship-required direct conversations", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../prisma/migrations/20260830220000_friendship_identity_pair_rank_fix/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("ROW_NUMBER() OVER");
    expect(migration).toContain("`conversation`.`type` = 'direct'");
    expect(migration).toContain("`conversation`.`access_policy` = 'friendship_required'");
    expect(migration).toContain("`pair_rank` = 1");
    expect(migration).toContain("`conversation`.`friendship_pair_key` IS NULL");
    expect(migration).not.toMatch(/SET\s+`conversation`\.`friendship_pair_key`\s*=\s*NULL/);
  });
});
