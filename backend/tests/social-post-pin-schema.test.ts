import { readFileSync } from "node:fs";

describe("formal Social post pin persistence", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync(
    "prisma/migrations/20260908010000_social_post_pin/migration.sql",
    "utf8"
  );

  it("stores at most one pinned post on each active identity", () => {
    expect(schema).toContain("pinnedSocialPostId Int?");
    expect(schema).toContain('@unique(map: "user_identities_pinned_social_post_id_key")');
    expect(schema).toContain('@relation("UserIdentityPinnedSocialPost"');
    expect(migration).toContain("ADD COLUMN `pinned_social_post_id` INTEGER NULL");
    expect(migration).toContain("UNIQUE INDEX `user_identities_pinned_social_post_id_key`");
    expect(migration).toContain("ON DELETE SET NULL ON UPDATE CASCADE");
  });
});
