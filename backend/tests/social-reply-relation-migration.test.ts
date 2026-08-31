import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { assertSafeSocialReplyRelationRuntime } from "../scripts/check-social-reply-relations";

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
    expect(schema).toMatch(/replyToPostId\s+Int\?/);
    expect(schema).toContain('@relation("SocialPostReplies"');
  });

  it("ships a local-only preflight and postflight checker", () => {
    expect(packageJson.scripts["check:social-reply-relations"]).toContain("check-social-reply-relations.ts");
    expect(checker).toContain('phase === "preflight"');
    expect(checker).toContain('phase === "postflight"');
    expect(checker).toContain("social-reply-relation-preflight.json");
  });
});

describe("Social reply relation checker safety", () => {
  const localRuntime = {
    NODE_ENV: "development",
    DEPLOY_ENV: "local",
    DATABASE_URL: "mysql://needo:needo@127.0.0.1:3307/needo_dev"
  };

  it.each([
    ["an encoded production-like database name", { ...localRuntime, DATABASE_URL: "mysql://needo:needo@127.0.0.1:3307/needo%5Fprod" }, "rejects production-like database names"],
    ["malformed database-name encoding", { ...localRuntime, DATABASE_URL: "mysql://needo:needo@127.0.0.1:3307/needo%ZZ" }, "DATABASE_URL database name must use valid URL encoding"],
    ["a production NODE_ENV", { ...localRuntime, NODE_ENV: "production" }, "rejects staging and production environments"],
    ["a staging DEPLOY_ENV", { ...localRuntime, DEPLOY_ENV: "staging" }, "rejects staging and production environments"],
    ["a non-loopback database host", { ...localRuntime, DATABASE_URL: "mysql://needo:needo@db.example.com/needo_dev" }, "only accepts a loopback MySQL host"]
  ])("rejects %s before Prisma, database access, or snapshot writes", (_case, environment, message) => {
    expect(() => assertSafeSocialReplyRelationRuntime(environment)).toThrow(message);
  });

  it("accepts and returns the decoded local database name", () => {
    expect(assertSafeSocialReplyRelationRuntime(localRuntime)).toBe("needo_dev");
  });
});
