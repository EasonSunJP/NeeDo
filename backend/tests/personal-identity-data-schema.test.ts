import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260830110000_personal_identity_scope/migration.sql"
  ),
  "utf8"
);

const modelSource = (name: string): string => {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, "m"));
  return match?.[0] ?? "";
};

describe("personal identity data schema", () => {
  it("owns conversations, contacts, friend requests, reactions, and local deletions by identity", () => {
    expect(modelSource("ConversationParticipant")).toContain(
      "@@unique([conversationId, identityId])"
    );
    expect(modelSource("Contact")).toContain(
      "@@unique([ownerIdentityId, contactIdentityId])"
    );
    expect(modelSource("FriendRequest")).toContain("requesterIdentityId");
    expect(modelSource("FriendRequest")).toContain("targetIdentityId");
    expect(modelSource("MessageReaction")).toContain(
      "@@unique([messageId, identityId, emoji])"
    );
    expect(modelSource("MessageUserDeletion")).toContain(
      "@@unique([identityId, messageId])"
    );
  });

  it("backfills existing records to customer identity first and fails closed before required columns", () => {
    expect(migration).toContain("IN ('customer', 'user', 'u')");
    expect(migration).toContain("UPDATE `conversation_participants`");
    expect(migration).toContain("UPDATE `contacts`");
    expect(migration).toContain("MODIFY `identity_id` INTEGER NOT NULL");
    expect(migration).toContain("MODIFY `owner_identity_id` INTEGER NOT NULL");
    expect(migration).not.toMatch(/(?:^|\n)\s*(?:DELETE|TRUNCATE)\b/i);
  });
});
