import { describe, expect, it } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  socialPostListQuerySchema,
  socialPostShareBodySchema
} from "../src/validators/realtime.validator";

describe("formal Social interaction contract", () => {
  it("validates bookmarked pagination and unique friend-share targets", () => {
    expect(socialPostListQuerySchema.parse({ bookmarked: "true", page: "1", pageSize: "20" }))
      .toMatchObject({ bookmarked: true, page: 1, pageSize: 20 });
    expect(socialPostShareBodySchema.parse({ targetUserIds: [8, 9] })).toEqual({
      targetUserIds: [8, 9]
    });
    expect(() => socialPostShareBodySchema.parse({ targetUserIds: [8, 8] })).toThrow();
  });

  it("adds durable interaction tables and deployable role permissions", async () => {
    const schema = await readFile(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = await readFile(
      join(process.cwd(), "prisma/migrations/20260831150000_social_post_interactions/migration.sql"),
      "utf8"
    );

    expect(schema).toContain("model SocialPostLike");
    expect(schema).toContain("model SocialPostBookmark");
    expect(schema).toContain("model SocialPostView");
    expect(schema).toContain("model SocialPostShare");
    expect(migration).toContain("social_post_likes");
    expect(migration).toContain("social_post_bookmarks");
    expect(migration).toContain("social_post_views");
    expect(migration).toContain("social_post_shares");
    expect(migration).toContain("social-post:interact");
    expect(migration).toContain("'admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer'");
  });

  it("keeps every explicit interaction database identifier within MySQL's 64-character limit", async () => {
    const migration = await readFile(
      join(process.cwd(), "prisma/migrations/20260831150000_social_post_interactions/migration.sql"),
      "utf8"
    );
    const identifiers = Array.from(
      migration.matchAll(/(?:INDEX|CONSTRAINT)\s+`([^`]+)`/g),
      (match) => match[1]
    );

    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers.filter((identifier) => identifier.length > 64)).toEqual([]);
  });
});
