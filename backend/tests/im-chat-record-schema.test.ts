import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const modelBody = (model: string) =>
  schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";

describe("IM chat-record persistence", () => {
  it.each([
    "ImChatRecordBundle",
    "ImChatRecordItem",
    "ImChatRecordDelivery",
    "ImChatRecordFavorite",
    "ImMessageTranslation",
    "ImMessageBatchDeleteCommand"
  ])("defines %s with soft-delete timestamps", (model) => {
    const body = modelBody(model);
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

  it("preserves immutable record snapshots and active-row lookup indexes", () => {
    const bundle = modelBody("ImChatRecordBundle");
    const item = modelBody("ImChatRecordItem");
    const delivery = modelBody("ImChatRecordDelivery");
    const favorite = modelBody("ImChatRecordFavorite");
    const translation = modelBody("ImMessageTranslation");
    const batchDelete = modelBody("ImMessageBatchDeleteCommand");

    [
      "publicId",
      "requestFingerprint",
      "senderCount",
      "itemCount",
      "senderNamesSnapshot",
      "titleSnapshot",
      "previewSnapshot",
      "contentVersion",
      "@@index([sourceConversationId, deletedAt])",
      "@@index([createdByUserId, deletedAt])",
      "@@index([createdByIdentityId, deletedAt])"
    ].forEach((field) => expect(bundle).toContain(field));
    [
      "position",
      "sourceMessageId",
      "senderDisplayNameSnapshot",
      "senderAvatarSnapshot",
      "contentSnapshot",
      "metadataSnapshot",
      "sentAtSnapshot",
      "@@index([sourceMessageId])",
      "@@index([senderUserId])",
      "@@index([senderIdentityId])",
      "@@index([bundleId, deletedAt])"
    ].forEach((field) => expect(item).toContain(field));
    ["@@index([bundleId, deletedAt])", "@@index([conversationId, deletedAt])"].forEach(
      (index) => expect(delivery).toContain(index)
    );
    [
      "@@index([ownerUserId, deletedAt])",
      "@@index([ownerIdentityId, createdAt, deletedAt])",
      "@@index([bundleId, deletedAt])"
    ].forEach((index) => expect(favorite).toContain(index));
    ["@@index([messageId, targetLanguage, deletedAt])", "@@index([translatedAt, deletedAt])"].forEach(
      (index) => expect(translation).toContain(index)
    );
    ["@@index([conversationId, ownerIdentityId, deletedAt])", "@@index([ownerUserId, deletedAt])"].forEach(
      (index) => expect(batchDelete).toContain(index)
    );
  });

  it("uses explicit identity-scoped relation names and planned deletion policies", () => {
    const expectedBackRelations: ReadonlyArray<readonly [string, string, string, string?]> = [
      ["User", "createdImChatRecordBundles", "ImChatRecordBundle[]", "ImChatRecordBundleCreator"],
      ["User", "sentImChatRecordItems", "ImChatRecordItem[]", "ImChatRecordItemSender"],
      ["User", "imChatRecordFavorites", "ImChatRecordFavorite[]", "ImChatRecordFavoriteOwner"],
      ["User", "imBatchDeleteCommands", "ImMessageBatchDeleteCommand[]", "ImMessageBatchDeleteOwner"],
      ["UserIdentity", "createdImChatRecordBundles", "ImChatRecordBundle[]", "ImChatRecordBundleIdentity"],
      ["UserIdentity", "sentImChatRecordItems", "ImChatRecordItem[]", "ImChatRecordItemSenderIdentity"],
      ["UserIdentity", "imChatRecordFavorites", "ImChatRecordFavorite[]", "ImChatRecordFavoriteIdentity"],
      ["UserIdentity", "imBatchDeleteCommands", "ImMessageBatchDeleteCommand[]", "ImMessageBatchDeleteIdentity"],
      ["Conversation", "sourceImChatRecordBundles", "ImChatRecordBundle[]", "ImChatRecordSourceConversation"],
      ["Conversation", "imChatRecordDeliveries", "ImChatRecordDelivery[]", undefined],
      ["Conversation", "imBatchDeleteCommands", "ImMessageBatchDeleteCommand[]", "ImMessageBatchDeleteConversation"],
      ["Message", "sourceImChatRecordItems", "ImChatRecordItem[]", "ImChatRecordSourceMessage"],
      ["Message", "imChatRecordDelivery", "ImChatRecordDelivery?", undefined],
      ["Message", "translations", "ImMessageTranslation[]", undefined]
    ];

    expectedBackRelations.forEach(([model, field, type, relation]) => {
      const relationPattern = relation ? `\\s+@relation\\("${relation}"\\)` : "";
      expect(modelBody(model)).toMatch(new RegExp(`${field}\\s+${type.replace(/[?[\]]/g, "\\$&")}${relationPattern}`));
    });
    [
      'sourceMessage  Message?           @relation("ImChatRecordSourceMessage", fields: [sourceMessageId], references: [id], onDelete: SetNull)',
      'message      Message            @relation(fields: [messageId], references: [id], onDelete: Restrict)',
      'createdByUser      User         @relation("ImChatRecordBundleCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)',
      'ownerIdentity UserIdentity       @relation("ImChatRecordFavoriteIdentity", fields: [ownerIdentityId], references: [id], onDelete: Restrict)',
      'conversation  Conversation @relation("ImMessageBatchDeleteConversation", fields: [conversationId], references: [id], onDelete: Restrict)'
    ].forEach((relation) =>
      expect(schema.replace(/\s+/g, " ")).toContain(relation.replace(/\s+/g, " "))
    );
  });
});
