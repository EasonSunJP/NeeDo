import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("friendship identity-scope reconciliation", () => {
  it("rekeys direct friendships and pending-request indexes by identity", () => {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      resolve(
        __dirname,
        "../prisma/migrations/20260830210000_friendship_identity_scope/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("MIN(`participant`.`identity_id`)");
    expect(migration).toContain("MAX(`participant`.`identity_id`)");
    expect(migration).toContain("ROW_NUMBER() OVER");
    expect(migration).toMatch(
      /PARTITION BY\s+`low_identity_id`,\s+`high_identity_id`/
    );
    expect(migration).toContain("`pair_rank` = 1");
    expect(migration).toContain("friendship_pair_key");
    expect(migration).toContain("requester_identity_id");
    expect(migration).toContain("target_identity_id");
    expect(migration).not.toMatch(
      /CONCAT\(`pair`\.`low_user_id`,\s*':',\s*`pair`\.`high_user_id`\)/
    );
    expect(schema).toContain(
      "@@index([requesterIdentityId, targetIdentityId, status, expiresAt, deletedAt]"
    );
    expect(schema).toContain(
      "@@index([targetIdentityId, status, expiresAt, deletedAt]"
    );
  });
});
