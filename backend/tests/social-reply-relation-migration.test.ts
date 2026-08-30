import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";

const backendRoot = process.cwd();
const migration = readFileSync(resolve(
  backendRoot,
  "prisma/migrations/20260831000000_social_reply_relation/migration.sql"
), "utf8");
const schema = readFileSync(resolve(backendRoot, "prisma/schema.prisma"), "utf8");
const checker = readFileSync(resolve(backendRoot, "scripts/check-social-reply-relations.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8"));

describe("Social reply relation migration", () => {
  it("adds, backfills, indexes, and constrains the reply parent", () => {
    expect(migration).toContain("ADD COLUMN `reply_to_post_id` INTEGER NULL");
    expect(migration).toContain("JSON_EXTRACT(`reply`.`media`, '$.replyToPostId')");
    expect(migration).toContain("social_posts_reply_parent_active_idx");
    expect(migration).toContain("social_posts_reply_to_post_id_fkey");
    expect(schema).toContain("replyToPostId Int?");
    expect(schema).toContain('@relation("SocialPostReplies"');
  });

  it("ships a local-only preflight and postflight checker", () => {
    expect(packageJson.scripts["check:social-reply-relations"]).toContain("check-social-reply-relations.ts");
    expect(checker).toContain('phase === "preflight"');
    expect(checker).toContain('phase === "postflight"');
    expect(checker).toContain("social-reply-relation-preflight.json");
  });
});
