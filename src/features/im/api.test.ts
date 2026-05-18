import { describe, expect, it } from "vitest";
import { buildAutoReplyPlan, upgradeLoadedImDatabase } from "./api";
import {
  cloneImDatabase,
  getConversationById,
  getMessagesForConversation,
  getUserById,
  IM_ASSISTANT_CONVERSATION_ID,
  IM_ASSISTANT_GUIDE_MESSAGE_ID,
  IM_ASSISTANT_USER_ID,
  makeSeedImDatabase,
  sendMessageMutation
} from "./model";

describe("im api auto reply", () => {
  it("upgrades older user databases with the smarter assistant seed", () => {
    const legacyDatabase = cloneImDatabase(makeSeedImDatabase());
    const assistantUser = getUserById(legacyDatabase, IM_ASSISTANT_USER_ID);
    const assistantConversation = getConversationById(legacyDatabase, IM_ASSISTANT_CONVERSATION_ID);

    expect(assistantUser).toBeTruthy();
    expect(assistantConversation).toBeTruthy();

    assistantUser!.nickname = "预约助理";
    assistantUser!.bio = "协助确认预约、改期与订单提醒。";
    assistantConversation!.title = "预约助理";
    assistantConversation!.isPinned = false;
    legacyDatabase.messages = legacyDatabase.messages.filter((message) => message.id !== IM_ASSISTANT_GUIDE_MESSAGE_ID);

    const { database: upgradedDatabase, changed } = upgradeLoadedImDatabase("user", legacyDatabase);
    const upgradedAssistant = getUserById(upgradedDatabase, IM_ASSISTANT_USER_ID);
    const upgradedConversation = getConversationById(upgradedDatabase, IM_ASSISTANT_CONVERSATION_ID);
    const assistantMessages = getMessagesForConversation(upgradedDatabase, IM_ASSISTANT_CONVERSATION_ID);

    expect(changed).toBe(true);
    expect(upgradedAssistant?.nickname).toBe("小咚 AI 助理");
    expect(upgradedAssistant?.bio).toContain("聊天联调");
    expect(upgradedConversation?.title).toBe("小咚 AI 助理");
    expect(upgradedConversation?.isPinned).toBe(true);
    expect(assistantMessages.some((message) => message.id === IM_ASSISTANT_GUIDE_MESSAGE_ID)).toBe(true);
  });

  it("backfills missing seeded friend conversations so visible test contacts can chat immediately", () => {
    const legacyDatabase = cloneImDatabase(makeSeedImDatabase());
    legacyDatabase.conversations = legacyDatabase.conversations.filter((conversation) => conversation.id !== "conversation-brian");
    legacyDatabase.members = legacyDatabase.members.filter((member) => member.conversationId !== "conversation-brian");
    legacyDatabase.messages = legacyDatabase.messages.filter((message) => message.conversationId !== "conversation-brian");

    const { database: upgradedDatabase, changed } = upgradeLoadedImDatabase("user", legacyDatabase);
    const brianConversation = getConversationById(upgradedDatabase, "conversation-brian");
    const brianMessages = getMessagesForConversation(upgradedDatabase, "conversation-brian");

    expect(changed).toBe(true);
    expect(brianConversation?.contactUserId).toBe("im-friend-brian");
    expect(brianMessages.length).toBeGreaterThan(0);
    expect(brianMessages[0]?.content).toContain("双人档");
  });

  it("builds a context-aware assistant reply for schedule questions", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    sendMessageMutation(database, {
      conversationId: IM_ASSISTANT_CONVERSATION_ID,
      senderId: database.currentUserId,
      type: "text",
      content: "那改到周三晚上可以吗？"
    });

    const conversation = getConversationById(database, IM_ASSISTANT_CONVERSATION_ID);
    const plan = buildAutoReplyPlan("user", database, conversation!);

    expect(plan?.senderId).toBe(IM_ASSISTANT_USER_ID);
    expect(plan?.messages[0]).toContain("周三");
    expect(plan?.messages[0]).toMatch(/定下来|备选|确认/);
  });

  it("acknowledges image messages instead of using a fixed canned reply", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    sendMessageMutation(database, {
      conversationId: IM_ASSISTANT_CONVERSATION_ID,
      senderId: database.currentUserId,
      type: "image",
      content: "https://example.com/mock.jpg"
    });

    const conversation = getConversationById(database, IM_ASSISTANT_CONVERSATION_ID);
    const plan = buildAutoReplyPlan("user", database, conversation!);

    expect(plan?.senderId).toBe(IM_ASSISTANT_USER_ID);
    expect(plan?.messages[0]).toContain("图");
    expect(plan?.messages[0]).toMatch(/顺着|继续|接/);
  });

  it("lets seeded friend conversations answer back, not only the assistant account", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    sendMessageMutation(database, {
      conversationId: "conversation-brian",
      senderId: database.currentUserId,
      type: "text",
      content: "周六晚上一起去怎么样？"
    });

    const conversation = getConversationById(database, "conversation-brian");
    const plan = buildAutoReplyPlan("user", database, conversation!);

    expect(plan?.senderId).toBe("im-friend-brian");
    expect(plan?.messages[0]).toContain("周六");
    expect(plan?.messages[0]).toMatch(/定|备选|方案/);
  });
});
