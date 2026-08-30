import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("IM chat-record persistence", () => {
  it.each([
    "ImChatRecordBundle",
    "ImChatRecordItem",
    "ImChatRecordDelivery",
    "ImChatRecordFavorite",
    "ImMessageTranslation",
    "ImMessageBatchDeleteCommand"
  ])("defines %s with soft-delete timestamps", (model) => {
    const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    expect(body).toContain("createdAt");
    expect(body).toContain("updatedAt");
    expect(body).toContain("deletedAt");
  });

  it("indexes identity ownership, source conversation, bundle position, and translation cache keys", () => {
    expect(schema).toContain("@@unique([createdByIdentityId, commandType, idempotencyKey]");
    expect(schema).toContain("@@unique([bundleId, position]");
    expect(schema).toContain("@@unique([messageId, sourceContentHash, targetLanguage, providerKey]");
    expect(schema).toContain("@@unique([ownerIdentityId, idempotencyKey]");
  });
});
