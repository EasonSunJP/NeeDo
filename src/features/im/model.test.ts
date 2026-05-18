import { describe, expect, it } from "vitest";
import {
  acceptFriendRequestMutation,
  buildContactSections,
  buildMessagePreview,
  buildConversationRowPreview,
  buildSearchResults,
  cloneImDatabase,
  createConversationMutation,
  expireDisappearingMessagesMutation,
  getContactIndexLetter,
  getImContactSignatureCaption,
  getVisibleIndexLetters,
  groupContactsByIndex,
  makeSeedImDatabase,
  recallMessageMutation,
  resolveIndexLetterFromTouchY,
  sendTagMessageCampaignMutation,
  sendMessageMutation,
  sortConversations,
  updateConversationGroupInfoMutation,
  updateConversationPrivacyMutation,
  updateConversationTagsMutation,
  updateContactTagsMutation
} from "./model";

describe("im model", () => {
  it("sorts conversations with pinned items first and then by last message time desc", () => {
    const database = makeSeedImDatabase();
    const ordered = sortConversations(database.conversations);

    expect(ordered[0]?.isPinned).toBe(true);
    expect(ordered[1]?.isPinned).toBe(true);

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];

      if (current.isPinned === next.isPinned) {
        expect(new Date(current.lastMessageTime).getTime()).toBeGreaterThanOrEqual(new Date(next.lastMessageTime).getTime());
      }
    }
  });

  it("builds A-Z contact sections and keeps blocked contacts out of the main list", () => {
    const database = makeSeedImDatabase();
    const sections = buildContactSections(database);
    const letters = sections.map((section) => section.letter);
    const contactIds = sections.flatMap((section) => section.items.map((item) => item.id));

    expect(letters).toContain("A");
    expect(letters).toContain("B");
    expect(contactIds).not.toContain("contact-blocked-1");
  });

  it("uses only real signatures for contact row captions", () => {
    expect(getImContactSignatureCaption({ signature: "今天也把事情说清楚" })).toBe("今天也把事情说清楚");
    expect(getImContactSignatureCaption({ signature: "Black Diamond · Lv.100 · 38 单" })).toBe("");
    expect(getImContactSignatureCaption({ signature: "98% 接单 · 银座 / 新宿" })).toBe("");
    expect(getImContactSignatureCaption({ signature: "营业中 · 今日 19:30" })).toBe("");
    expect(getImContactSignatureCaption({})).toBe("");
  });

  it("resolves contact index letters for latin, chinese, kana, and symbols", () => {
    expect(getContactIndexLetter({ displayName: "jerry" })).toBe("J");
    expect(getContactIndexLetter({ displayName: "Jerry" })).toBe("J");
    expect(getContactIndexLetter({ displayName: "孙瑞" })).toBe("S");
    expect(getContactIndexLetter({ displayName: "刘" })).toBe("L");
    expect(getContactIndexLetter({ displayName: "Émile" })).toBe("E");
    expect(
      getContactIndexLetter({
        displayName: "安藤輝",
        kanaName: "あんどうてる"
      })
    ).toBe("A");
    expect(
      getContactIndexLetter({
        displayName: "伊藤",
        kanaName: "いとう"
      })
    ).toBe("I");
    expect(getContactIndexLetter({ displayName: "“#”%“¥&" })).toBe("#");
    expect(getContactIndexLetter({ displayName: "12345" })).toBe("#");
    expect(getContactIndexLetter({ displayName: "😊test" })).toBe("#");
    expect(getContactIndexLetter({ displayName: "" })).toBe("#");
  });

  it("groups contacts into only the visible index sections", () => {
    const contacts = [
      { id: "1", displayName: "安藤輝", kanaName: "あんどうてる" },
      { id: "2", displayName: "孙瑞" },
      { id: "3", displayName: "jerry" },
      { id: "4", displayName: "“#”%“¥&" }
    ];
    const sections = groupContactsByIndex(contacts);

    expect(sections.map((section) => section.letter)).toEqual(["A", "J", "S", "#"]);
    expect(getVisibleIndexLetters(sections)).toEqual(["A", "J", "S", "#"]);
  });

  it("filters empty and duplicate letters when building the visible index bar", () => {
    expect(
      getVisibleIndexLetters([
        { letter: "A", items: [{ id: "1" }] },
        { letter: "A", items: [{ id: "2" }] },
        { letter: "B", items: [] },
        { letter: "#", items: [{ id: "3" }] }
      ])
    ).toEqual(["A", "#"]);
  });

  it("can keep the symbol shortcut at the end of the visible index bar", () => {
    expect(
      getVisibleIndexLetters(
        [
          { letter: "A", items: [{ id: "1" }] },
          { letter: "Z", items: [{ id: "2" }] }
        ],
        { includeSymbolFallback: true }
      )
    ).toEqual(["A", "Z", "#"]);
  });

  it("clamps touch positions when resolving a dragged index letter", () => {
    const letters = ["A", "J", "S", "#"] as const;

    expect(resolveIndexLetterFromTouchY(80, 100, 12, [...letters])).toBe("A");
    expect(resolveIndexLetterFromTouchY(112, 100, 12, [...letters])).toBe("J");
    expect(resolveIndexLetterFromTouchY(136, 100, 12, [...letters])).toBe("#");
    expect(resolveIndexLetterFromTouchY(999, 100, 12, [...letters])).toBe("#");
  });

  it("shows drafts without affecting sorting fields in the conversation row preview", () => {
    const database = makeSeedImDatabase();
    const conversation = database.conversations.find((item) => item.id === "conversation-store-1");

    expect(conversation).toBeTruthy();
    const preview = buildConversationRowPreview(conversation!);

    expect(preview.isDraft).toBe(true);
    expect(preview.text).toContain("改到 18:30");
  });

  it("creates a sent message and updates the conversation preview", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const result = sendMessageMutation(database, {
      conversationId: "conversation-amy",
      senderId: database.currentUserId,
      type: "text",
      content: "周末一起去那家店吧"
    });

    expect(result.message.status).toBe("sent");
    expect(result.conversation.lastMessagePreview).toContain("周末一起去那家店吧");
  });

  it("forces the group flow to create a privacy group when one contact is selected", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const memberId = database.contacts[0]!.targetUserId;
    const conversation = createConversationMutation(database, [memberId], "一对一隐私群", {
      forceGroup: true,
      privacyModeEnabled: true,
      disappearingCountdown: { minutes: 3 },
      disappearingStartMode: "sent"
    });
    const result = sendMessageMutation(database, {
      conversationId: conversation.id,
      senderId: database.currentUserId,
      type: "text",
      content: "这个群里也要读秒"
    });

    expect(conversation.type).toBe("group");
    expect(conversation.contactUserId).toBeUndefined();
    expect(conversation.privacyModeEnabled).toBe(true);
    expect(result.message.ext?.disappearing?.expiresAt).toBeTruthy();
  });

  it("hides privacy-group message content in conversation list previews", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const memberIds = database.contacts.slice(0, 2).map((contact) => contact.targetUserId);
    const conversation = createConversationMutation(database, memberIds, "隐私测试群", {
      privacyModeEnabled: true,
      disappearingCountdown: { minutes: 3 },
      disappearingStartMode: "sent"
    });
    sendMessageMutation(database, {
      conversationId: conversation.id,
      senderId: database.currentUserId,
      type: "text",
      content: "不能在列表里露出这句话"
    });
    conversation.draftText = "草稿也不要露出";

    const preview = buildConversationRowPreview(conversation);

    expect(preview).toEqual({
      text: "私密群消息已隐藏",
      isDraft: false
    });
  });

  it("updates existing group privacy and only applies countdown to privacy-mode messages", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const conversation = database.conversations.find((item) => item.id === "conversation-group-life");

    expect(conversation?.type).toBe("group");

    const normalBefore = sendMessageMutation(database, {
      conversationId: conversation!.id,
      senderId: database.currentUserId,
      type: "text",
      content: "这是开启隐私模式前的普通消息"
    });

    const enabled = updateConversationPrivacyMutation(database, conversation!.id, {
      privacyModeEnabled: true,
      disappearingCountdown: { minutes: 3 },
      disappearingStartMode: "sent"
    });
    expect(enabled?.privacyModeEnabled).toBe(true);

    const privacyMessage = sendMessageMutation(database, {
      conversationId: conversation!.id,
      senderId: database.currentUserId,
      type: "text",
      content: "这条消息需要按隐私倒计时消失"
    });

    updateConversationPrivacyMutation(database, conversation!.id, { privacyModeEnabled: false });
    const normalAfter = sendMessageMutation(database, {
      conversationId: conversation!.id,
      senderId: database.currentUserId,
      type: "text",
      content: "这是关闭隐私模式后的普通消息"
    });

    expect(normalBefore.message.ext?.disappearing).toBeUndefined();
    expect(privacyMessage.message.ext?.disappearing?.expiresAt).toBeTruthy();
    expect(normalAfter.message.ext?.disappearing).toBeUndefined();

    const expiresAt = new Date(privacyMessage.message.ext!.disappearing!.expiresAt!).getTime();
    const expiration = expireDisappearingMessagesMutation(database, conversation!.id, expiresAt + 1);

    expect(expiration.removedMessageIds).toContain(privacyMessage.message.id);
    expect(expiration.removedMessageIds).not.toContain(normalBefore.message.id);
    expect(expiration.removedMessageIds).not.toContain(normalAfter.message.id);
  });

  it("blocks non-owner members from changing group privacy settings", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const conversation = database.conversations.find((item) => item.id === "conversation-non-owner-test");
    const currentMember = database.members.find((member) => member.conversationId === conversation?.id && member.userId === database.currentUserId);
    const ownerMember = database.members.find((member) => member.conversationId === conversation?.id && member.role === "owner");

    expect(conversation?.type).toBe("group");
    expect(currentMember?.role).toBe("member");

    const blocked = updateConversationPrivacyMutation(database, conversation!.id, {
      privacyModeEnabled: true,
      disappearingCountdown: { minutes: 3 },
      disappearingStartMode: "sent"
    });

    expect(blocked).toBeUndefined();
    expect(conversation?.privacyModeEnabled).not.toBe(true);
    expect(conversation?.disappearingCountdown).toBeUndefined();

    database.currentUserId = ownerMember!.userId;
    const enabled = updateConversationPrivacyMutation(database, conversation!.id, {
      privacyModeEnabled: true,
      disappearingCountdown: { minutes: 3 },
      disappearingStartMode: "sent"
    });

    expect(enabled?.privacyModeEnabled).toBe(true);
    expect(enabled?.disappearingCountdown?.minutes).toBe(3);
  });

  it("lets group owners control group info edit permissions while members edit only their own nickname by default", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const conversation = database.conversations.find((item) => item.id === "conversation-group-life");
    const nonOwnerId = conversation?.memberIds.find((memberId) => memberId !== database.currentUserId);

    expect(conversation?.type).toBe("group");
    expect(nonOwnerId).toBeTruthy();

    database.currentUserId = nonOwnerId!;
    const blocked = updateConversationGroupInfoMutation(database, conversation!.id, {
      title: "成员直接改群名",
      announcement: "成员直接改公告"
    });
    const nicknameOnly = updateConversationGroupInfoMutation(database, conversation!.id, {
      nicknameInGroup: "我的新昵称"
    });
    const nicknameMember = database.members.find((member) => member.conversationId === conversation!.id && member.userId === nonOwnerId);

    expect(blocked).toBeUndefined();
    expect(conversation?.title).toBe("东京生活服务沟通群");
    expect(conversation?.announcement).toContain("门店");
    expect(nicknameOnly).toBeTruthy();
    expect(nicknameMember?.nicknameInGroup).toBe("我的新昵称");
  });

  it("includes a seeded group where the current user is not the owner", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const conversation = database.conversations.find((item) => item.id === "conversation-non-owner-test");
    const ownerMember = database.members.find((member) => member.conversationId === conversation?.id && member.role === "owner");
    const currentMember = database.members.find((member) => member.conversationId === conversation?.id && member.userId === database.currentUserId);

    expect(conversation?.type).toBe("group");
    expect(ownerMember?.userId).toBe("im-friend-amy");
    expect(ownerMember?.userId).not.toBe(database.currentUserId);
    expect(currentMember?.role).toBe("member");
    expect(conversation?.titleEditPolicy).toBe("owner");
    expect(conversation?.announcementEditPolicy).toBe("owner");
  });

  it("allows members to edit group title and announcement after the owner opens permissions", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const conversation = database.conversations.find((item) => item.id === "conversation-group-life");
    const ownerId = database.currentUserId;
    const nonOwnerId = conversation?.memberIds.find((memberId) => memberId !== ownerId);

    expect(conversation?.type).toBe("group");
    expect(nonOwnerId).toBeTruthy();

    const opened = updateConversationGroupInfoMutation(database, conversation!.id, {
      titleEditPolicy: "members",
      announcementEditPolicy: "members"
    });

    database.currentUserId = nonOwnerId!;
    const memberUpdated = updateConversationGroupInfoMutation(database, conversation!.id, {
      title: "大家一起维护的群",
      announcement: "今天先同步排班和优惠。"
    });

    expect(opened?.titleEditPolicy).toBe("members");
    expect(opened?.announcementEditPolicy).toBe("members");
    expect(memberUpdated?.title).toBe("大家一起维护的群");
    expect(memberUpdated?.announcement).toBe("今天先同步排班和优惠。");
  });

  it("expires privacy-group messages from their sent time", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const memberIds = database.contacts.slice(0, 2).map((contact) => contact.targetUserId);
    const conversation = createConversationMutation(database, memberIds, "隐私测试群", {
      privacyModeEnabled: true,
      disappearingCountdown: { minutes: 3 },
      disappearingStartMode: "sent"
    });
    const result = sendMessageMutation(database, {
      conversationId: conversation.id,
      senderId: database.currentUserId,
      type: "text",
      content: "三分钟后自动删除"
    });

    expect(result.message.ext?.disappearing?.mode).toBe("sent");
    expect(result.message.ext?.disappearing?.expiresAt).toBeTruthy();

    const expiresAt = new Date(result.message.ext!.disappearing!.expiresAt!).getTime();
    const expiration = expireDisappearingMessagesMutation(database, conversation.id, expiresAt + 1);

    expect(expiration.removedMessageIds).toContain(result.message.id);
    expect(database.messages.some((message) => message.id === result.message.id)).toBe(false);
  });

  it("starts privacy-group countdown after all members have read when configured", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const memberIds = database.contacts.slice(0, 2).map((contact) => contact.targetUserId);
    const conversation = createConversationMutation(database, memberIds, "已读后删除群", {
      privacyModeEnabled: true,
      disappearingCountdown: { minutes: 3 },
      disappearingStartMode: "read_by_all"
    });
    const result = sendMessageMutation(database, {
      conversationId: conversation.id,
      senderId: database.currentUserId,
      type: "text",
      content: "大家都看过后再开始倒计时"
    });
    const readAt = new Date(new Date(result.message.sentAt).getTime() + 30_000).toISOString();

    expect(result.message.ext?.disappearing?.expiresAt).toBeUndefined();

    memberIds.forEach((memberId) => {
      database.readCursors.push({
        id: `cursor-${memberId}`,
        conversationId: conversation.id,
        userId: memberId,
        lastReadMessageId: result.message.id,
        lastReadAt: readAt
      });
    });

    const started = expireDisappearingMessagesMutation(database, conversation.id, new Date(readAt).getTime() + 1);
    const startedMessage = database.messages.find((message) => message.id === result.message.id);

    expect(started.changed).toBe(true);
    expect(startedMessage?.ext?.disappearing?.mode).toBe("read_by_all");
    expect(startedMessage?.ext?.disappearing?.readByAllAt).toBe(readAt);

    const expiresAt = new Date(startedMessage!.ext!.disappearing!.expiresAt!).getTime();
    const expiration = expireDisappearingMessagesMutation(database, conversation.id, expiresAt + 1);

    expect(expiration.removedMessageIds).toContain(result.message.id);
  });

  it("keeps the shared card target name in contact-card previews", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const cardUser = database.users.find((user) => user.profileKind === "technician" && user.id !== database.currentUserId);

    expect(cardUser).toBeTruthy();

    const result = sendMessageMutation(database, {
      conversationId: "conversation-amy",
      senderId: database.currentUserId,
      type: "contact-card",
      content: cardUser!.nickname,
      ext: {
        contactCard: {
          userId: cardUser!.id,
          displayName: cardUser!.nickname,
          avatar: cardUser!.avatar,
          profileKind: cardUser!.profileKind,
          entityType: cardUser!.entityType,
          entityId: cardUser!.entityId,
          userIdLabel: cardUser!.userIdLabel
        }
      }
    });

    expect(buildMessagePreview(result.message, database.currentUserId, Object.fromEntries(database.users.map((user) => [user.id, user])))).toContain(cardUser!.nickname);
    expect(result.conversation.lastMessagePreview).toContain(cardUser!.nickname);
  });

  it("recalls a message and converts the last preview into a recall summary", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const sent = sendMessageMutation(database, {
      conversationId: "conversation-support",
      senderId: database.currentUserId,
      type: "text",
      content: "我再确认一下最新档期"
    });
    const result = recallMessageMutation(database, sent.message.id);

    expect(result?.message.type).toBe("recalled");
    expect(result?.conversation.lastMessagePreview).toContain("你撤回了一条消息");
  });

  it("accepts a friend request and adds the user into contacts", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const result = acceptFriendRequestMutation(database, "request-riko");

    expect(result.request?.status).toBe("accepted");
    expect(result.contact?.targetUserId).toBe("im-request-riko");
    expect(database.contacts.some((contact) => contact.targetUserId === "im-request-riko" && contact.relationStatus === "active")).toBe(true);
  });

  it("returns searchable messages with conversation ids for jump navigation", () => {
    const database = makeSeedImDatabase();
    const result = buildSearchResults(database, "档期");

    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages.some((message) => message.conversationId === "conversation-group-life" || message.conversationId === "conversation-tech-1")).toBe(true);
  });

  it("matches conversations through participant tags and shared groups", () => {
    const database = makeSeedImDatabase();
    const result = buildSearchResults(database, "英语");
    const conversationIds = result.conversations.map((conversation) => conversation.id);

    expect(result.contacts.some((contact) => contact.targetUserId === "im-friend-amy")).toBe(true);
    expect(conversationIds).toContain("conversation-amy");
    expect(conversationIds).toContain("conversation-group-life");
    expect(conversationIds).toContain("conversation-non-owner-test");
  });

  it("keeps updated contact and conversation tags searchable", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const contact = database.contacts.find((item) => item.targetUserId === "im-friend-amy");

    expect(contact).toBeTruthy();
    expect(updateContactTagsMutation(database, contact!.id, [" 护理复购 ", "护理复购"])?.tags).toEqual(["护理复购"]);
    expect(updateConversationTagsMutation(database, "conversation-group-life", ["夜间群"])?.tags).toEqual(["夜间群"]);

    const contactResult = buildSearchResults(database, "护理复购");
    const taggedConversationResult = buildSearchResults(database, "夜间群");

    expect(contactResult.contacts.some((item) => item.targetUserId === "im-friend-amy")).toBe(true);
    expect(contactResult.conversations.some((item) => item.id === "conversation-amy")).toBe(true);
    expect(taggedConversationResult.conversations.some((item) => item.id === "conversation-group-life")).toBe(true);
  });

  it("sends tag campaigns as independent private conversations and skips opt-out contacts", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const amyContact = database.contacts.find((contact) => contact.targetUserId === "im-friend-amy");
    const brianContact = database.contacts.find((contact) => contact.targetUserId === "im-friend-brian");

    expect(amyContact).toBeTruthy();
    expect(brianContact).toBeTruthy();
    updateContactTagsMutation(database, amyContact!.id, ["复购提醒"]);
    updateContactTagsMutation(database, brianContact!.id, ["复购提醒", "退订"]);

    const result = sendTagMessageCampaignMutation(database, {
      tagIds: ["复购提醒"],
      content: "今晚有空档可以预约。",
      messageType: "crm"
    });

    expect(result.campaign.sentCount).toBe(1);
    expect(result.campaign.skippedCount).toBe(1);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0].conversation.type).toBe("single");
    expect(result.deliveries[0].conversation.contactUserId).toBe("im-friend-amy");
    expect(result.recipients.some((recipient) => recipient.targetUserId === "im-friend-brian" && recipient.status === "skipped")).toBe(true);
  });

  it("sends direct friend campaigns with images without requiring tags", () => {
    const database = cloneImDatabase(makeSeedImDatabase());
    const result = sendTagMessageCampaignMutation(database, {
      tagIds: [],
      targetUserIds: ["im-friend-amy"],
      content: "今晚限定菜单更新了。",
      image: {
        url: "data:image/jpeg;base64,campaign",
        thumbnailUrl: "data:image/jpeg;base64,campaign",
        fileName: "campaign.jpg",
        fileSize: 128_000,
        mimeType: "image/jpeg",
        width: 960,
        height: 720
      }
    });

    expect(result.campaign.targetTags).toEqual([]);
    expect(result.campaign.targetUserIds).toEqual(["im-friend-amy"]);
    expect(result.campaign.sentCount).toBe(1);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0].conversation.type).toBe("single");
    expect(result.deliveries[0].message.type).toBe("image");
    expect(result.deliveries[0].message.ext?.caption).toBe("今晚限定菜单更新了。");
    expect(result.deliveries[0].message.ext?.fileName).toBe("campaign.jpg");
  });
});
