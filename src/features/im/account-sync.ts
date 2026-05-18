import { demoAuthAccount } from "../../auth/demoAccount";
import { getEntityStoreSnapshot } from "../../state/entityStore";
import { formatCustomerMembershipLevel, getCustomerLevelLabel, resolveCustomerMembership } from "../../shared/profile-card/customerMembership";
import type { Customer, Store, Technician } from "../../types/domain";
import { cloneImDatabase, getConversationById, recomputeConversationSummary, sortConversations, type ImDatabase, type ImRoleType, type ImUser } from "./model";

type ImEntityRef = {
  entityType: NonNullable<ImUser["entityType"]>;
  entityId: string;
};

type ImAccountUserPatch = Partial<
  Pick<ImUser, "accountId" | "avatar" | "bio" | "entityId" | "entityType" | "nickname" | "profileKind" | "region" | "searchableFields" | "signature" | "sortKey" | "source" | "tags" | "userIdLabel">
>;

const legacyCurrentUserNames = new Set(["林 夏子", "夏子", "NeeDo 用户", "我"]);

function compactStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function customerDisplayName(customer: Customer) {
  return customer.nickname?.trim() || customer.name;
}

function technicianDisplayName(technician: Technician) {
  return technician.nickname?.trim() || technician.name;
}

function customerTags(customer: Customer) {
  const levelLabel = getCustomerLevelLabel(customer.activeScore);
  const membership = resolveCustomerMembership(customer.memberLevel);
  return compactStrings([membership.label, levelLabel, ...customer.tags.slice(0, 2)]);
}

function customerPatch(customer: Customer, source: string): ImAccountUserPatch {
  const displayName = customerDisplayName(customer);
  const levelLabel = getCustomerLevelLabel(customer.activeScore);
  const membershipLabel = formatCustomerMembershipLevel(customer.memberLevel, levelLabel);

  return {
    accountId: customer.accountUsername ?? `acc-${customer.id}`,
    nickname: displayName,
    avatar: customer.avatar,
    region: `东京 · ${membershipLabel}`,
    bio: customer.bio,
    signature: customer.bio,
    sortKey: `${displayName} ${customer.id}`.toLowerCase(),
    profileKind: "person",
    entityType: "user",
    entityId: customer.id,
    source,
    tags: customerTags(customer),
    userIdLabel: customer.systemId,
    searchableFields: compactStrings([displayName, customer.name, customer.accountUsername, customer.systemId, customer.id])
  };
}

function technicianPatch(technician: Technician, source: string): ImAccountUserPatch {
  const displayName = technicianDisplayName(technician);

  return {
    accountId: technician.accountUsername ?? `acc-${technician.id}`,
    nickname: displayName,
    avatar: technician.avatar,
    region: technician.serviceAreas.join(" / ") || "东京",
    bio: technician.bio ?? `擅长 ${technician.skills.slice(0, 2).join(" / ")}。`,
    signature: technician.bio,
    sortKey: `${displayName} ${technician.id}`.toLowerCase(),
    profileKind: "technician",
    entityType: "technician",
    entityId: technician.id,
    source,
    tags: compactStrings([...(technician.profileTags ?? technician.skills).slice(0, 3)]),
    userIdLabel: technician.systemId,
    searchableFields: compactStrings([displayName, technician.name, technician.accountUsername, technician.systemId, technician.id])
  };
}

function storePatch(store: Store, source: string): ImAccountUserPatch {
  return {
    accountId: store.accountUsername ?? `acc-${store.id}`,
    nickname: store.name,
    avatar: store.cover,
    region: store.area,
    bio: store.description,
    signature: store.description,
    sortKey: `${store.name} ${store.id}`.toLowerCase(),
    profileKind: "store",
    entityType: "shop",
    entityId: store.id,
    source,
    tags: compactStrings(["店铺", ...store.tags.slice(0, 2)]),
    userIdLabel: store.systemId,
    searchableFields: compactStrings([store.name, store.accountUsername, store.systemId, store.id, store.area])
  };
}

function sameStringList(left?: string[], right?: string[]) {
  return (left ?? []).join("|") === (right ?? []).join("|");
}

function applyUserPatch(user: ImUser, patch: ImAccountUserPatch) {
  let changed = false;

  (Object.keys(patch) as Array<keyof ImAccountUserPatch>).forEach((key) => {
    const nextValue = patch[key];
    const currentValue = user[key as keyof ImUser];
    const equal = Array.isArray(nextValue) && Array.isArray(currentValue)
      ? sameStringList(currentValue, nextValue)
      : currentValue === nextValue;

    if (!equal && nextValue !== undefined) {
      Object.assign(user, { [key]: nextValue });
      changed = true;
    }
  });

  return changed;
}

function getLinkedCurrentRefs(): Record<ImRoleType, ImEntityRef | undefined> {
  const { customers, stores, technicians } = getEntityStoreSnapshot();
  const customer = customers.find((item) => item.accountUsername === demoAuthAccount.username) ?? customers[0];
  const store = stores.find((item) => item.accountUsername === demoAuthAccount.username) ?? stores[0];
  const technician = technicians.find((item) => item.accountUsername === demoAuthAccount.username) ?? technicians[0];

  return {
    user: customer ? { entityType: "user", entityId: customer.id } : undefined,
    merchant: store ? { entityType: "shop", entityId: store.id } : undefined,
    technician: technician ? { entityType: "technician", entityId: technician.id } : undefined
  };
}

function resolveUserEntityRef(scope: ImRoleType, database: ImDatabase, user: ImUser): ImEntityRef | undefined {
  const currentRefs = getLinkedCurrentRefs();

  if (user.id === database.currentUserId || (scope === "user" && user.id === "im-user-self")) {
    return currentRefs[scope];
  }

  if (scope === "user") {
    return undefined;
  }

  if (user.entityType && user.entityId) {
    return {
      entityType: user.entityType,
      entityId: user.entityId
    };
  }

  return undefined;
}

function buildPatchFromRef(ref: ImEntityRef, currentUser: boolean): ImAccountUserPatch | undefined {
  const { customers, stores, technicians } = getEntityStoreSnapshot();

  if (ref.entityType === "user") {
    const customer = customers.find((item) => item.id === ref.entityId);
    return customer ? customerPatch(customer, currentUser ? "当前登录账号" : "平台用户") : undefined;
  }

  if (ref.entityType === "technician") {
    const technician = technicians.find((item) => item.id === ref.entityId);
    return technician ? technicianPatch(technician, currentUser ? "当前登录账号" : "平台技师") : undefined;
  }

  const store = stores.find((item) => item.id === ref.entityId);
  return store ? storePatch(store, currentUser ? "当前登录账号" : "门店账号") : undefined;
}

function shouldRefreshGroupNickname(value: string | undefined, previousName: string, nextName: string) {
  if (!value) {
    return true;
  }

  return value === previousName || value === nextName || legacyCurrentUserNames.has(value);
}

function refreshMentionedCurrentUserText(content: string, previousName: string, nextName: string) {
  return Array.from(new Set([previousName, ...legacyCurrentUserNames]))
    .filter((name) => name && name !== nextName)
    .reduce((nextContent, name) => nextContent.split(`@${name}`).join(`@${nextName}`), content);
}

export function syncImDatabaseWithAccountEntities(scope: ImRoleType, database: ImDatabase): { database: ImDatabase; changed: boolean } {
  const next = cloneImDatabase(database);
  let changed = false;
  const touchedConversationIds = new Set<string>();
  const syncedNamesByUserId = new Map<string, { previousName: string; nextName: string; avatar: string }>();
  const syncedUsersById = new Map(next.users.map((user) => [user.id, user]));

  next.users.forEach((user) => {
    const ref = resolveUserEntityRef(scope, next, user);
    const patch = ref ? buildPatchFromRef(ref, user.id === next.currentUserId) : undefined;

    if (!patch?.nickname || !patch.avatar) {
      return;
    }

    const previousName = user.nickname;
    const userChanged = applyUserPatch(user, patch);

    syncedNamesByUserId.set(user.id, {
      previousName,
      nextName: patch.nickname,
      avatar: patch.avatar
    });
    changed = userChanged || changed;
  });

  next.conversations.forEach((conversation) => {
    if (conversation.contactUserId) {
      const contactUser = syncedUsersById.get(conversation.contactUserId);

      if (contactUser && (conversation.title !== contactUser.nickname || conversation.avatar !== contactUser.avatar)) {
        conversation.title = contactUser.nickname;
        conversation.avatar = contactUser.avatar;
        touchedConversationIds.add(conversation.id);
        changed = true;
      }
    }

    if (conversation.memberIds.includes(next.currentUserId)) {
      const currentName = syncedNamesByUserId.get(next.currentUserId);

      if (
        currentName &&
        conversation.nicknameInGroup !== currentName.nextName &&
        shouldRefreshGroupNickname(conversation.nicknameInGroup, currentName.previousName, currentName.nextName)
      ) {
        conversation.nicknameInGroup = currentName.nextName;
        changed = true;
      }
    }
  });

  next.members.forEach((member) => {
    const name = syncedNamesByUserId.get(member.userId);

    if (!name) {
      return;
    }

    if (member.nicknameInGroup !== name.nextName && shouldRefreshGroupNickname(member.nicknameInGroup, name.previousName, name.nextName)) {
      member.nicknameInGroup = name.nextName;
      changed = true;
    }
  });

  next.messages.forEach((message) => {
    const senderName = syncedNamesByUserId.get(message.senderId);

    if (senderName && message.ext?.groupSenderName && message.ext.groupSenderName !== senderName.nextName) {
      message.ext = {
        ...message.ext,
        groupSenderName: senderName.nextName
      };
      touchedConversationIds.add(message.conversationId);
      changed = true;
    }

    const currentName = syncedNamesByUserId.get(next.currentUserId);

    if (currentName && message.ext?.mentions?.includes(next.currentUserId)) {
      const nextContent = refreshMentionedCurrentUserText(message.content, currentName.previousName, currentName.nextName);

      if (nextContent !== message.content) {
        message.content = nextContent;
        touchedConversationIds.add(message.conversationId);
        changed = true;
      }
    }

    const contactCardUserId = message.ext?.contactCard?.userId;
    const contactCardUser = contactCardUserId ? syncedUsersById.get(contactCardUserId) : undefined;

    if (contactCardUser && message.ext?.contactCard) {
      const nextContactCard = {
        ...message.ext.contactCard,
        displayName: contactCardUser.nickname,
        avatar: contactCardUser.avatar,
        profileKind: contactCardUser.profileKind,
        entityType: contactCardUser.entityType,
        entityId: contactCardUser.entityId,
        userIdLabel: contactCardUser.userIdLabel,
        headline: contactCardUser.signature ?? contactCardUser.bio
      };

      if (JSON.stringify(nextContactCard) !== JSON.stringify(message.ext.contactCard)) {
        message.ext = {
          ...message.ext,
          contactCard: nextContactCard
        };
        touchedConversationIds.add(message.conversationId);
        changed = true;
      }
    }
  });

  if (changed) {
    touchedConversationIds.forEach((conversationId) => {
      if (getConversationById(next, conversationId)) {
        recomputeConversationSummary(next, conversationId);
      }
    });
    next.conversations = sortConversations(next.conversations);
  }

  return {
    database: changed ? next : database,
    changed
  };
}
