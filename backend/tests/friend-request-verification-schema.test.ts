import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("friend request verification schema", () => {
  it("persists expiry and conversation authorization without soft-delete aliases", () => {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      resolve(
        __dirname,
        "../prisma/migrations/20260830200000_friend_request_verification/migration.sql"
      ),
      "utf8"
    );
    const preflight = readFileSync(
      resolve(__dirname, "../scripts/check-friendship-conversation-pairs.ts"),
      "utf8"
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8")
    ) as { scripts: Record<string, string> };

    expect(schema).toContain('EXPIRED  @map("expired")');
    expect(schema).toContain("expiresAt");
    expect(schema).toContain("expiredAt");
    expect(schema).toContain("enum ConversationAccessPolicy");
    expect(schema).toContain("friendshipPairKey");
    expect(migration).toContain("INTERVAL 72 HOUR");
    expect(migration).toContain("friendship_pair_key");
    expect(migration).toContain("friend_request_target_pending_expiry_idx");
    expect(preflight).toContain("malformedConversationIds");
    expect(preflight).toContain("duplicatePairs");
    expect(preflight).toContain("select: { identityId: true }");
    expect(preflight).toContain("item.identityId");
    expect(preflight).toContain("friendshipPairKey: true");
    expect(preflight).toContain("accessPolicy: true");
    expect(preflight).toContain("missingCanonicalPairs");
    expect(preflight).not.toContain("select: { userId: true }");
    expect(packageJson.scripts["check:friendship-conversation-pairs"]).toBe(
      "tsx scripts/check-friendship-conversation-pairs.ts"
    );
  });
});
