import { customers, imageBank, stores, technicians } from "../../data/mock";
import {
  getMerchantCustomerConversationId,
  getMerchantTechnicianConversationId,
  getTechnicianCustomerConversationId,
  getTechnicianStaffConversationId,
  getTechnicianStoreConversationId,
  getTechnicianSupportConversationId
} from "../../lib/messageCenter";
import { formatCustomerMembershipLevel, getCustomerLevelLabel, resolveCustomerMembership } from "../../shared/profile-card/customerMembership";
import {
  getMessagesForConversation,
  makeSeedImDatabase,
  recomputeConversationSummary,
  type ContactRelation,
  type Conversation,
  type ConversationMember,
  type ConversationMessage,
  type FriendRequest,
  type ImDatabase,
  type ImMessageStatus,
  type ImMessageType,
  type ImRoleType,
  type ImUser,
  type MessageAttachment,
  type ReadCursor
} from "./model";

type SeedInput = {
  currentUserId: string;
  users: ImUser[];
  contacts: ContactRelation[];
  friendRequests: FriendRequest[];
  conversations: Conversation[];
  members: ConversationMember[];
  messages: ConversationMessage[];
  summaryOverrides?: Record<string, Partial<Conversation>>;
};

const seedNow = new Date("2026-04-17T19:30:00+09:00");
let seedId = 10_000;

function nextId(prefix: string) {
  seedId += 1;
  return `${prefix}-${seedId}`;
}

function atMinutesAgo(minutes: number) {
  return new Date(seedNow.getTime() - minutes * 60_000).toISOString();
}

function atHoursAgo(hours: number) {
  return new Date(seedNow.getTime() - hours * 3_600_000).toISOString();
}

function atDaysAgo(days: number) {
  return new Date(seedNow.getTime() - days * 86_400_000).toISOString();
}

function createUser(
  input: Omit<ImUser, "searchableFields" | "status" | "canCall" | "canVideoCall"> & { searchableFields?: string[] }
): ImUser {
  return {
    status: "active",
    canCall: true,
    canVideoCall: true,
    searchableFields: input.searchableFields ?? [input.nickname, input.accountId, input.userIdLabel, input.sortKey],
    ...input
  };
}

function createContact(input: Omit<ContactRelation, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }): ContactRelation {
  return {
    createdAt: input.createdAt ?? atDaysAgo(10),
    updatedAt: input.updatedAt ?? atHoursAgo(6),
    ...input
  };
}

function createFriendRequest(input: Omit<FriendRequest, "createdAt"> & { createdAt?: string }): FriendRequest {
  return {
    createdAt: input.createdAt ?? atHoursAgo(8),
    ...input
  };
}

function createConversation(
  input: Omit<Conversation, "avatar" | "lastMessagePreview" | "lastMessageTime" | "updatedAt" | "unreadCount" | "isPinned" | "isMuted"> & {
    avatar?: string;
    lastMessagePreview?: string;
    lastMessageTime?: string;
    updatedAt?: string;
    unreadCount?: number;
    isPinned?: boolean;
    isMuted?: boolean;
  }
): Conversation {
  return {
    avatar: input.avatar ?? imageBank.home,
    lastMessagePreview: input.lastMessagePreview ?? "",
    lastMessageTime: input.lastMessageTime ?? atDaysAgo(3),
    unreadCount: input.unreadCount ?? 0,
    isPinned: input.isPinned ?? false,
    isMuted: input.isMuted ?? false,
    updatedAt: input.updatedAt ?? input.lastMessageTime ?? atDaysAgo(3),
    ...input
  };
}

function createMember(input: Omit<ConversationMember, "id" | "joinedAt"> & { id?: string; joinedAt?: string }): ConversationMember {
  return {
    id: input.id ?? nextId("member"),
    joinedAt: input.joinedAt ?? atDaysAgo(30),
    ...input
  };
}

function createMessage(
  input: Omit<ConversationMessage, "id" | "localId" | "clientSeq" | "status"> & {
    id?: string;
    localId?: string;
    clientSeq?: number;
    status?: ImMessageStatus;
  }
): ConversationMessage {
  const id = input.id ?? nextId("msg");

  return {
    id,
    localId: input.localId ?? `${id}-local`,
    clientSeq: input.clientSeq ?? seedId,
    status: input.status ?? "sent",
    ...input
  };
}

function getCustomerImMembershipTags(customer: (typeof customers)[number]) {
  const levelLabel = getCustomerLevelLabel(customer.activeScore);
  const membership = resolveCustomerMembership(customer.memberLevel);
  return membership.kind ? [membership.label, levelLabel] : [levelLabel];
}

function createCustomerUser(userId: string, customer: (typeof customers)[number], overrides?: Partial<ImUser>) {
  const displayName = customer.nickname ?? customer.name;
  const levelLabel = getCustomerLevelLabel(customer.activeScore);
  const membershipLevelLabel = formatCustomerMembershipLevel(customer.memberLevel, levelLabel);

  return createUser({
    id: userId,
    accountId: customer.accountUsername ?? `acc-${customer.id}`,
    nickname: displayName,
    avatar: customer.avatar,
    region: `东京 · ${membershipLevelLabel}`,
    bio: customer.bio,
    sortKey: `${displayName} ${customer.id}`.toLowerCase(),
    profileKind: "person",
    entityType: "user",
    entityId: customer.id,
    source: "平台用户",
    tags: [...getCustomerImMembershipTags(customer), ...customer.tags.slice(0, 2)],
    userIdLabel: customer.systemId,
    ...overrides
  });
}

function createTechnicianUser(userId: string, technician: (typeof technicians)[number], overrides?: Partial<ImUser>) {
  const displayName = technician.nickname ?? technician.name;

  return createUser({
    id: userId,
    accountId: technician.accountUsername ?? `acc-${technician.id}`,
    nickname: displayName,
    avatar: technician.avatar,
    region: technician.serviceAreas.join(" / ") || "东京",
    bio: technician.bio ?? `擅长 ${technician.skills.slice(0, 2).join(" / ")}。`,
    sortKey: `${displayName} ${technician.id}`.toLowerCase(),
    profileKind: "technician",
    entityType: "technician",
    entityId: technician.id,
    source: "平台技师",
    tags: [...(technician.profileTags ?? technician.skills).slice(0, 3)],
    userIdLabel: technician.systemId,
    ...overrides
  });
}

function createStoreUser(userId: string, store: (typeof stores)[number], overrides?: Partial<ImUser>) {
  return createUser({
    id: userId,
    accountId: store.accountUsername ?? `acc-${store.id}`,
    nickname: store.name,
    avatar: store.cover,
    region: store.area,
    bio: store.description,
    sortKey: `${store.name} ${store.id}`.toLowerCase(),
    profileKind: "store",
    entityType: "shop",
    entityId: store.id,
    source: "门店账号",
    tags: ["店铺", ...store.tags.slice(0, 2)],
    userIdLabel: store.systemId,
    ...overrides
  });
}

function createServiceUser(userId: string, title: string, overrides?: Partial<ImUser>) {
  return createUser({
    id: userId,
    accountId: `acc-${userId}`,
    nickname: title,
    avatar: imageBank.home,
    region: "平台服务中心",
    bio: `${title} 负责处理系统通知、预约同步与售后协作。`,
    signature: "工作时间内会尽快处理",
    sortKey: title.toLowerCase(),
    profileKind: "service",
    source: "平台服务号",
    tags: ["服务号"],
    userIdLabel: `SV-${userId.slice(-4).toUpperCase()}`,
    serviceAccount: true,
    ...overrides
  });
}

function buildMembers(conversations: Conversation[], users: ImUser[]) {
  const userNames = Object.fromEntries(users.map((user) => [user.id, user.nickname])) as Record<string, string>;

  return conversations.flatMap((conversation) =>
    conversation.memberIds.map((userId, index) =>
      createMember({
        conversationId: conversation.id,
        userId,
        role: conversation.type === "group" && index === 0 ? "owner" : "member",
        nicknameInGroup: conversation.type === "group" ? userNames[userId] : undefined
      })
    )
  );
}

function buildAttachments(messages: ConversationMessage[]): MessageAttachment[] {
  return messages
    .filter((message) => message.type === "image" || message.type === "video" || message.type === "file" || message.type === "voice")
    .map((message) => ({
      id: nextId("attachment"),
      messageId: message.id,
      fileName: message.ext?.fileName ?? `${message.type}-${message.id}`,
      mimeType: message.ext?.mimeType ?? "application/octet-stream",
      fileSize: message.ext?.fileSize ?? 0,
      url: message.ext?.url ?? message.content,
      thumbnailUrl: message.ext?.thumbnailUrl,
      duration: message.ext?.duration,
      width: message.ext?.width,
      height: message.ext?.height
    }));
}

function buildReadCursors(conversations: Conversation[], messages: ConversationMessage[], currentUserId: string): ReadCursor[] {
  return conversations.map((conversation) => ({
    id: nextId("cursor"),
    conversationId: conversation.id,
    userId: currentUserId,
    lastReadMessageId: getMessagesForConversation({ messages }, conversation.id).at(-1)?.id,
    lastReadAt: atHoursAgo(1)
  }));
}

function buildDatabase(seed: SeedInput): ImDatabase {
  const database: ImDatabase = {
    currentUserId: seed.currentUserId,
    config: {
      allowStrangerMessaging: true,
      preserveConversationAfterDelete: true,
      syncDraftAcrossDevices: false,
      recallWindowMs: 2 * 60_000,
      separatorThresholdMs: 5 * 60_000
    },
    users: seed.users,
    contacts: seed.contacts,
    friendRequests: seed.friendRequests,
    conversations: seed.conversations,
    members: seed.members,
    messages: seed.messages,
    attachments: buildAttachments(seed.messages),
    readCursors: buildReadCursors(seed.conversations, seed.messages, seed.currentUserId),
    messageCampaigns: [],
    messageCampaignRecipients: []
  };

  database.conversations.forEach((conversation) => {
    recomputeConversationSummary(database, conversation.id);
  });

  if (seed.summaryOverrides) {
    database.conversations = database.conversations.map((conversation) => ({
      ...conversation,
      ...seed.summaryOverrides?.[conversation.id]
    }));
  }

  return database;
}

function attachUserScopeMetadata(database: ImDatabase): ImDatabase {
  const metadata = new Map<
    string,
    {
      entityType?: ImUser["entityType"];
      entityId?: string;
    }
  >([
    ["im-user-self", { entityType: "user", entityId: customers[0]?.id ?? "cus-1" }],
    ["im-tech-1", { entityType: "technician", entityId: technicians[0]?.id ?? "tech-1" }],
    ["im-store-1", { entityType: "shop", entityId: stores[0]?.id ?? "store-1" }],
    ["im-friend-amy", { entityType: "user", entityId: customers[1]?.id ?? "cus-2" }],
    ["im-friend-brian", { entityType: "user", entityId: customers[2]?.id ?? "cus-3" }],
    ["im-friend-coco", { entityType: "user", entityId: customers[3]?.id ?? "cus-4" }],
    ["im-friend-daisuke", { entityType: "user", entityId: customers[4]?.id ?? "cus-5" }],
    ["im-friend-emi", { entityType: "user", entityId: customers[5]?.id ?? "cus-6" }],
    ["im-friend-fiona", { entityType: "user", entityId: customers[6]?.id ?? "cus-7" }],
    ["im-tech-2", { entityType: "technician", entityId: technicians[1]?.id ?? "tech-2" }],
    ["im-store-2", { entityType: "shop", entityId: stores[1]?.id ?? "store-2" }],
    ["im-request-riko", { entityType: "technician", entityId: technicians[3]?.id ?? technicians[0]?.id ?? "tech-1" }],
    ["im-request-luna", { entityType: "user", entityId: customers[7]?.id ?? customers[0]?.id ?? "cus-1" }],
    ["im-request-mercury", { entityType: "shop", entityId: stores[2]?.id ?? stores[0]?.id ?? "store-1" }]
  ]);

  return {
    ...database,
    users: database.users.map((user) => ({
      ...user,
      ...metadata.get(user.id)
    }))
  };
}

function buildMerchantDatabase(): ImDatabase {
  const primaryStore = stores[0] ?? stores[1];
  const scopedTechnicians = technicians.filter((technician) => technician.storeId === primaryStore.id);
  const visibleTechnicians = scopedTechnicians.length > 0 ? scopedTechnicians : technicians.slice(0, 3);
  const merchantSelfId = "im-merchant-self";
  const supportUserId = "im-merchant-support";
  const opsUserId = "im-merchant-ops";
  const requestCustomer = customers[7] ?? customers[0];
  const requestTechnician = technicians[3] ?? visibleTechnicians[0] ?? technicians[0];

  const customerUsers = customers.map((customer) => ({
    entity: customer,
    user: createCustomerUser(`im-merchant-customer-${customer.id}`, customer, {
      source: "门店顾客",
      tags: ["顾客", ...getCustomerImMembershipTags(customer), ...customer.tags.slice(0, 1)]
    })
  }));
  const technicianUsers = visibleTechnicians.map((technician) => ({
    entity: technician,
    user: createTechnicianUser(`im-merchant-tech-${technician.id}`, technician, {
      source: "门店员工",
      tags: ["员工", ...(technician.profileTags ?? technician.skills).slice(0, 2)]
    })
  }));

  const users: ImUser[] = [
    createStoreUser(merchantSelfId, primaryStore, {
      source: "当前登录门店",
      tags: ["门店", "本人"],
      signature: "统一处理顾客、员工和平台协作消息"
    }),
    ...customerUsers.map((item) => item.user),
    ...technicianUsers.map((item) => item.user),
    createServiceUser(supportUserId, "门店客服", {
      signature: "退款、改期和异常单会在这里协作",
      tags: ["服务号", "售后"]
    }),
    createServiceUser(opsUserId, "排班协作台", {
      signature: "当天排班、加钟与缺口提醒会优先同步这里",
      tags: ["服务号", "排班"]
    }),
    createCustomerUser("im-merchant-request-customer", requestCustomer, {
      source: "顾客申请",
      tags: ["新朋友", ...getCustomerImMembershipTags(requestCustomer)]
    }),
    createTechnicianUser("im-merchant-request-tech", requestTechnician, {
      source: "员工申请",
      tags: ["新朋友", ...(requestTechnician.profileTags ?? requestTechnician.skills).slice(0, 1)]
    })
  ];

  const contacts: ContactRelation[] = [
    ...customerUsers.map(({ entity, user }, index) =>
      createContact({
        id: `merchant-contact-customer-${entity.id}`,
        ownerUserId: merchantSelfId,
        targetUserId: user.id,
        relationStatus: "active",
        source: index < 2 ? "近 30 天高频顾客" : "订单履约后建立联系",
        remarkName: index === 0 ? "高频回访客" : undefined,
        tags: ["顾客", ...getCustomerImMembershipTags(entity), ...entity.tags.slice(0, 1)],
        isStarred: index === 0,
        isBlocked: index === customerUsers.length - 1
      })
    ),
    ...technicianUsers.map(({ entity, user }, index) =>
      createContact({
        id: `merchant-contact-tech-${entity.id}`,
        ownerUserId: merchantSelfId,
        targetUserId: user.id,
        relationStatus: "active",
        source: index === 0 ? "门店主力员工" : "排班协作",
        remarkName: index === 0 ? "主排班技师" : undefined,
        tags: ["员工", ...(entity.profileTags ?? entity.skills).slice(0, 2)],
        isStarred: index === 0,
        isBlocked: false
      })
    ),
    createContact({
      id: "merchant-contact-support",
      ownerUserId: merchantSelfId,
      targetUserId: supportUserId,
      relationStatus: "active",
      source: "平台服务号",
      tags: ["服务号", "售后"],
      isStarred: true,
      isBlocked: false,
      description: "退款、纠纷和异常订单支持"
    }),
    createContact({
      id: "merchant-contact-ops",
      ownerUserId: merchantSelfId,
      targetUserId: opsUserId,
      relationStatus: "active",
      source: "平台服务号",
      tags: ["服务号", "排班"],
      isStarred: false,
      isBlocked: false,
      description: "排班通知、临时缺口与协作提醒"
    })
  ];

  const customerConversations = customerUsers.map(({ entity, user }, index) =>
    createConversation({
      id: getMerchantCustomerConversationId(entity.id),
      type: "single",
      title: user.nickname,
      avatar: user.avatar,
      memberIds: [merchantSelfId, user.id],
      contactUserId: user.id,
      unreadCount: index === 0 ? 3 : 0,
      isPinned: index === 0
    })
  );
  const technicianConversations = technicianUsers.map(({ entity, user }, index) =>
    createConversation({
      id: getMerchantTechnicianConversationId(entity.id),
      type: "single",
      title: user.nickname,
      avatar: user.avatar,
      memberIds: [merchantSelfId, user.id],
      contactUserId: user.id,
      unreadCount: index === 0 ? 1 : 0,
      draftText: index === 0 ? "明天高峰段再帮我补一个 18:00 后可上钟的人。" : undefined,
      draftUpdatedAt: index === 0 ? atMinutesAgo(24) : undefined
    })
  );
  const supportConversation = createConversation({
    id: "merchant-support",
    type: "system",
    title: "门店客服",
    avatar: imageBank.home,
    memberIds: [merchantSelfId, supportUserId],
    contactUserId: supportUserId,
    unreadCount: 2,
    isPinned: true
  });
  const opsGroupConversation = createConversation({
    id: "merchant-group-ops",
    type: "group",
    title: "今晚排班协作群",
    avatar: imageBank.salon,
    memberIds: [merchantSelfId, opsUserId, ...technicianUsers.slice(0, 2).map((item) => item.user.id)],
    unreadCount: 4,
    mentionAll: true,
    announcement: "群内只同步当日排班、加钟和缺口响应。"
  });

  const conversations = [...customerConversations, ...technicianConversations, supportConversation, opsGroupConversation];
  const messages: ConversationMessage[] = [
    ...customerUsers.flatMap(({ entity, user }, index) => {
      const conversationId = getMerchantCustomerConversationId(entity.id);

      return [
        createMessage({
          conversationId,
          senderId: user.id,
          type: "text",
          content: index === 0 ? "今晚 19:30 到店前我会再确认一次停车位。" : `订单 ${entity.systemId} 的到店时间我已经确认好了。`,
          sentAt: atHoursAgo(22 - index)
        }),
        createMessage({
          conversationId,
          senderId: merchantSelfId,
          type: index === 0 ? "location" : "text",
          content: index === 0 ? "门店位置" : "收到，我们会在到店前 15 分钟再次提醒你。",
          sentAt: atHoursAgo(21.5 - index),
          ext:
            index === 0
              ? {
                  location: {
                    title: primaryStore.name,
                    address: primaryStore.address,
                    latitude: 35.6721,
                    longitude: 139.7649
                  }
                }
              : undefined
        })
      ];
    }),
    ...technicianUsers.flatMap(({ entity, user }, index) => {
      const conversationId = getMerchantTechnicianConversationId(entity.id);

      return [
        createMessage({
          conversationId,
          senderId: merchantSelfId,
          type: "text",
          content: index === 0 ? "今晚高峰段你能不能再多接一单？" : "下周可排班时间我先记在这边。",
          sentAt: atHoursAgo(12 - index)
        }),
        createMessage({
          conversationId,
          senderId: user.id,
          type: index === 1 ? "contact-card" : "text",
          content: index === 1 ? "推荐同事" : "可以，我 18:00 后还能继续接。",
          sentAt: atHoursAgo(11.8 - index),
          ext:
            index === 1 && technicianUsers[0]
              ? {
                  contactCard: {
                    userId: technicianUsers[0].user.id,
                    displayName: technicianUsers[0].user.nickname,
                    avatar: technicianUsers[0].user.avatar,
                    profileKind: technicianUsers[0].user.profileKind
                  }
                }
              : undefined
        })
      ];
    }),
    createMessage({
      conversationId: "merchant-support",
      senderId: merchantSelfId,
      type: "text",
      content: "这笔订单客人申请改到明天，麻烦帮我同步平台提醒。",
      sentAt: atHoursAgo(5)
    }),
    createMessage({
      conversationId: "merchant-support",
      senderId: supportUserId,
      type: "file",
      content: "https://example.com/files/order-adjustment.pdf",
      sentAt: atHoursAgo(4.8),
      ext: {
        fileName: "改期确认单.pdf",
        fileSize: 620_000,
        mimeType: "application/pdf",
        url: "https://example.com/files/order-adjustment.pdf"
      }
    }),
    createMessage({
      conversationId: "merchant-group-ops",
      senderId: opsUserId,
      type: "text",
      content: "@所有人 21:00 后会有一波预约高峰，请保持消息在线。",
      sentAt: atHoursAgo(2),
      ext: {
        mentionAll: true,
        groupSenderName: "排班协作台"
      }
    }),
    createMessage({
      conversationId: "merchant-group-ops",
      senderId: technicianUsers[0]?.user.id ?? merchantSelfId,
      type: "image",
      content: imageBank.massage,
      sentAt: atMinutesAgo(36),
      ext: {
        width: 2520,
        height: 1500,
        fileName: "frontdesk.webp",
        fileSize: 510_000,
        mimeType: "image/webp",
        url: imageBank.massage,
        thumbnailUrl: imageBank.massageAlt,
        groupSenderName: technicianUsers[0]?.user.nickname ?? "员工"
      }
    }),
    createMessage({
      conversationId: "merchant-group-ops",
      senderId: merchantSelfId,
      type: "emoji",
      content: "收到",
      sentAt: atMinutesAgo(14),
      ext: {
        groupSenderName: primaryStore.name
      }
    })
  ];
  const friendRequests: FriendRequest[] = [
    createFriendRequest({
      id: "merchant-request-customer",
      fromUserId: "im-merchant-request-customer",
      toUserId: merchantSelfId,
      source: "顾客加店",
      requestMessage: "后续想直接联系门店确认活动和改期。",
      status: "pending",
      createdAt: atHoursAgo(3)
    }),
    createFriendRequest({
      id: "merchant-request-tech",
      fromUserId: "im-merchant-request-tech",
      toUserId: merchantSelfId,
      source: "员工入驻",
      requestMessage: "希望加入门店通讯录，后续直接同步排班。",
      status: "pending",
      createdAt: atHoursAgo(6)
    })
  ];

  return buildDatabase({
    currentUserId: merchantSelfId,
    users,
    contacts,
    friendRequests,
    conversations,
    members: buildMembers(conversations, users),
    messages,
    summaryOverrides: {
      [getMerchantCustomerConversationId(customers[0]?.id ?? "cus-1")]: { unreadCount: 3, isPinned: true },
      [getMerchantTechnicianConversationId(visibleTechnicians[0]?.id ?? technicians[0]?.id ?? "tech-1")]: {
        draftText: "明天高峰段再帮我补一个 18:00 后可上钟的人。",
        draftUpdatedAt: atMinutesAgo(24)
      },
      "merchant-support": { unreadCount: 2, isPinned: true },
      "merchant-group-ops": { unreadCount: 4, mentionAll: true }
    }
  });
}

function buildTechnicianDatabase(): ImDatabase {
  const technicianSelf = technicians[0] ?? technicians[1];
  const technicianSelfDisplayName = technicianSelf.nickname?.trim() || technicianSelf.name;
  const technicianSelfId = "im-technician-self";
  const homeStore = stores.find((store) => store.id === technicianSelf.storeId) ?? stores[0];
  const peerTechnicians = technicians.filter((technician) => technician.id !== technicianSelf.id).slice(0, 3);
  const supportUserId = "im-technician-support";
  const storeUserId = "im-technician-store";
  const requestCustomer = customers[6] ?? customers[0];

  const customerUsers = customers.map((customer) => ({
    entity: customer,
    user: createCustomerUser(`im-technician-customer-${customer.id}`, customer, {
      source: "服务顾客",
      tags: ["顾客", ...getCustomerImMembershipTags(customer), ...customer.tags.slice(0, 1)]
    })
  }));
  const peerUsers = peerTechnicians.map((technician) => ({
    entity: technician,
    user: createTechnicianUser(`im-technician-peer-${technician.id}`, technician, {
      source: "同店同事",
      tags: ["同事", ...(technician.profileTags ?? technician.skills).slice(0, 2)]
    })
  }));

  const users: ImUser[] = [
    createTechnicianUser(technicianSelfId, technicianSelf, {
      source: "当前登录技师",
      tags: ["技师", "本人"],
      signature: "档期变动、顾客确认和门店协作都在这里处理"
    }),
    createStoreUser(storeUserId, homeStore, {
      source: "所属门店",
      tags: ["店铺", "所属门店"],
      signature: "排班、到店提醒和现场协作统一同步"
    }),
    ...customerUsers.map((item) => item.user),
    ...peerUsers.map((item) => item.user),
    createServiceUser(supportUserId, "技师客服", {
      signature: "路上异常、订单争议和售后升级都可以直接说",
      tags: ["服务号", "技师支持"]
    }),
    createCustomerUser("im-technician-request-customer", requestCustomer, {
      source: "顾客申请",
      tags: ["新朋友", ...getCustomerImMembershipTags(requestCustomer)]
    })
  ];

  const contacts: ContactRelation[] = [
    createContact({
      id: "technician-contact-store",
      ownerUserId: technicianSelfId,
      targetUserId: storeUserId,
      relationStatus: "active",
      source: "所属门店",
      remarkName: "门店前台",
      tags: ["店铺", "前台"],
      isStarred: true,
      isBlocked: false,
      description: "排班、到店和现场协作统一处理"
    }),
    ...customerUsers.map(({ entity, user }, index) =>
      createContact({
        id: `technician-contact-customer-${entity.id}`,
        ownerUserId: technicianSelfId,
        targetUserId: user.id,
        relationStatus: "active",
        source: index < 2 ? "近期服务顾客" : "历史订单联系",
        remarkName: index === 0 ? "今晚首单顾客" : undefined,
        tags: ["顾客", ...getCustomerImMembershipTags(entity), ...entity.tags.slice(0, 1)],
        isStarred: index === 0,
        isBlocked: index === customerUsers.length - 1
      })
    ),
    ...peerUsers.map(({ entity, user }, index) =>
      createContact({
        id: `technician-contact-peer-${entity.id}`,
        ownerUserId: technicianSelfId,
        targetUserId: user.id,
        relationStatus: "active",
        source: "同店同事",
        remarkName: index === 0 ? "交接搭档" : undefined,
        tags: ["同事", ...(entity.profileTags ?? entity.skills).slice(0, 2)],
        isStarred: index === 0,
        isBlocked: false
      })
    ),
    createContact({
      id: "technician-contact-support",
      ownerUserId: technicianSelfId,
      targetUserId: supportUserId,
      relationStatus: "active",
      source: "平台服务号",
      tags: ["服务号", "技师支持"],
      isStarred: false,
      isBlocked: false,
      description: "异常订单、客诉和路上问题处理"
    })
  ];

  const customerConversations = customerUsers.map(({ entity, user }, index) =>
    createConversation({
      id: getTechnicianCustomerConversationId(entity.id),
      type: "single",
      title: user.nickname,
      avatar: user.avatar,
      memberIds: [technicianSelfId, user.id],
      contactUserId: user.id,
      unreadCount: index === 0 ? 2 : 0,
      isPinned: index === 0
    })
  );
  const peerConversations = peerUsers.map(({ entity, user }, index) =>
    createConversation({
      id: getTechnicianStaffConversationId(entity.id),
      type: "single",
      title: user.nickname,
      avatar: user.avatar,
      memberIds: [technicianSelfId, user.id],
      contactUserId: user.id,
      unreadCount: index === 0 ? 1 : 0
    })
  );
  const storeConversation = createConversation({
    id: getTechnicianStoreConversationId(),
    type: "single",
    title: homeStore.name,
    avatar: homeStore.cover,
    memberIds: [technicianSelfId, storeUserId],
    contactUserId: storeUserId,
    draftText: "明天如果高峰提前，我可以把午后空档前移 30 分钟。",
    draftUpdatedAt: atMinutesAgo(18)
  });
  const supportConversation = createConversation({
    id: getTechnicianSupportConversationId(),
    type: "system",
    title: "技师客服",
    avatar: imageBank.home,
    memberIds: [technicianSelfId, supportUserId],
    contactUserId: supportUserId,
    unreadCount: 1
  });
  const teamConversation = createConversation({
    id: "technician-group-day-shift",
    type: "group",
    title: "今日到店交接群",
    avatar: imageBank.massage,
    memberIds: [technicianSelfId, storeUserId, ...peerUsers.slice(0, 2).map((item) => item.user.id)],
    unreadCount: 3,
    mentionMe: true,
    announcement: "仅同步当天到店、加钟和交接事项。"
  });

  const conversations = [...customerConversations, ...peerConversations, storeConversation, supportConversation, teamConversation];
  const messages: ConversationMessage[] = [
    ...customerUsers.flatMap(({ entity, user }, index) => {
      const conversationId = getTechnicianCustomerConversationId(entity.id);

      return [
        createMessage({
          conversationId,
          senderId: technicianSelfId,
          type: "text",
          content: index === 0 ? "我出发前会再和你确认一次，预计 18:40 到。" : "服务开始前如果要改时间，直接在这里告诉我。",
          sentAt: atHoursAgo(20 - index)
        }),
        createMessage({
          conversationId,
          senderId: user.id,
          type: index === 0 ? "location" : "text",
          content: index === 0 ? "当前定位" : "好的，收到。",
          sentAt: atHoursAgo(19.7 - index),
          ext:
            index === 0
              ? {
                  location: {
                    title: "顾客当前位置",
                    address: "东京都港区六本木 2-1-8",
                    latitude: 35.6628,
                    longitude: 139.7311
                  }
                }
              : undefined
        })
      ];
    }),
    ...peerUsers.flatMap(({ entity, user }, index) => {
      const conversationId = getTechnicianStaffConversationId(entity.id);

      return [
        createMessage({
          conversationId,
          senderId: user.id,
          type: "text",
          content: index === 0 ? "你到店后我把房间钥匙交给你。" : "晚点一起对一下今天的异常单。",
          sentAt: atHoursAgo(8 - index)
        }),
        createMessage({
          conversationId,
          senderId: technicianSelfId,
          type: index === 0 ? "contact-card" : "text",
          content: index === 0 ? "顾客名片" : "好，等你有空 ping 我。",
          sentAt: atHoursAgo(7.8 - index),
          ext:
            index === 0 && customerUsers[0]
              ? {
                  contactCard: {
                    userId: customerUsers[0].user.id,
                    displayName: customerUsers[0].user.nickname,
                    avatar: customerUsers[0].user.avatar,
                    profileKind: customerUsers[0].user.profileKind
                  }
                }
              : undefined
        })
      ];
    }),
    createMessage({
      conversationId: getTechnicianStoreConversationId(),
      senderId: storeUserId,
      type: "system",
      content: "门店已确认你明天 12:00-21:00 的在岗安排。",
      sentAt: atHoursAgo(6)
    }),
    createMessage({
      conversationId: getTechnicianStoreConversationId(),
      senderId: technicianSelfId,
      type: "file",
      content: "https://example.com/files/shift-note.pdf",
      sentAt: atHoursAgo(5.5),
      ext: {
        fileName: "排班备注.pdf",
        fileSize: 580_000,
        mimeType: "application/pdf",
        url: "https://example.com/files/shift-note.pdf"
      }
    }),
    createMessage({
      conversationId: getTechnicianSupportConversationId(),
      senderId: technicianSelfId,
      type: "text",
      content: "这单顾客刚刚临时改地址，麻烦帮我同步订单备注。",
      sentAt: atHoursAgo(4)
    }),
    createMessage({
      conversationId: getTechnicianSupportConversationId(),
      senderId: supportUserId,
      type: "text",
      content: "已记录，新的地址和补贴规则稍后会一起同步给你。",
      sentAt: atHoursAgo(3.8)
    }),
    createMessage({
      conversationId: "technician-group-day-shift",
      senderId: storeUserId,
      type: "text",
      content: `@${technicianSelfDisplayName} 今日 20:00 后会有一波加钟需求，请先保持在线。`,
      sentAt: atHoursAgo(1.5),
      ext: {
        mentions: [technicianSelfId],
        groupSenderName: homeStore.name
      }
    }),
    createMessage({
      conversationId: "technician-group-day-shift",
      senderId: technicianSelfId,
      type: "emoji",
      content: "👌",
      sentAt: atMinutesAgo(40),
      ext: {
        groupSenderName: technicianSelf.name
      }
    }),
    createMessage({
      conversationId: "technician-group-day-shift",
      senderId: peerUsers[0]?.user.id ?? storeUserId,
      type: "image",
      content: imageBank.cleaningPortrait,
      sentAt: atMinutesAgo(12),
      ext: {
        width: 500,
        height: 333,
        fileName: "room-status.jpg",
        fileSize: 540_000,
        mimeType: "image/jpeg",
        url: imageBank.cleaningPortrait,
        thumbnailUrl: imageBank.cleaningAlt,
        groupSenderName: peerUsers[0]?.user.nickname ?? "同事"
      }
    })
  ];
  const friendRequests: FriendRequest[] = [
    createFriendRequest({
      id: "technician-request-customer",
      fromUserId: "im-technician-request-customer",
      toUserId: technicianSelfId,
      source: "顾客加技师",
      requestMessage: "后续我想直接和你确认空档时间，可以先加个联系人吗？",
      status: "pending",
      createdAt: atHoursAgo(5)
    })
  ];

  return buildDatabase({
    currentUserId: technicianSelfId,
    users,
    contacts,
    friendRequests,
    conversations,
    members: buildMembers(conversations, users),
    messages,
    summaryOverrides: {
      [getTechnicianCustomerConversationId(customers[0]?.id ?? "cus-1")]: { unreadCount: 2, isPinned: true },
      [getTechnicianStoreConversationId()]: {
        draftText: "明天如果高峰提前，我可以把午后空档前移 30 分钟。",
        draftUpdatedAt: atMinutesAgo(18)
      },
      [getTechnicianSupportConversationId()]: { unreadCount: 1 },
      "technician-group-day-shift": { unreadCount: 3, mentionMe: true }
    }
  });
}

export function makeScopedImDatabase(scope: ImRoleType): ImDatabase {
  if (scope === "merchant") {
    return buildMerchantDatabase();
  }

  if (scope === "technician") {
    return buildTechnicianDatabase();
  }

  return attachUserScopeMetadata(makeSeedImDatabase());
}
