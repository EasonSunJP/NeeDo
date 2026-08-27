import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");

describe("formal IM legacy-store gate", () => {
  it("always selects the formal adapter", () => {
    expect(source).not.toContain("isStaticDemoMode");
    expect(source).not.toContain("isFrontendBypassSession");
    expect(source).toContain("createFormalImApi");
    expect(source).toContain("getScopedStore(scope, false, currentUser)");
    expect(source).not.toContain("formalImMutationUnavailable");
  });

  it("returns a stable empty message list while a conversation is loading", () => {
    expect(source).toContain("const emptyConversationMessages: ConversationMessage[] = [];");
    expect(source).toContain("snapshotData.messagesByConversation[conversationId] ?? emptyConversationMessages");
  });
});
