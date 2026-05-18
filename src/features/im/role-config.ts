import type { MobileNavItem } from "../../components/mobile/MobileShell";
import { merchantNavItems, technicianNavItems, userNavItems } from "../../components/mobile/navItems";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import type { ContactRelation, ImMessageType, ImProfileKind, ImRoleType, ImUser } from "./model";

type ImScopeRoutes = {
  prefix: string;
  messages: string;
  newConversation: string;
  conversation: (conversationId: string) => string;
  conversationInfo: (conversationId: string) => string;
  conversationMedia: (conversationId: string) => string;
  contacts: string;
  contactDetail: (contactId: string) => string;
  friendRequests: string;
  organization: string;
  blacklist: string;
  tags: string;
  serviceAccounts: string;
  search: string;
};

type ImVisibilityConfig = {
  visibleProfileKinds: ImProfileKind[];
  searchableProfileKinds: ImProfileKind[];
};

type ImChatCapabilityConfig = {
  allowGroupConversation: boolean;
  allowVoiceCall: boolean;
  allowVideoCall: boolean;
  allowedMessageTypes: ImMessageType[];
  shareableProfileKinds: ImProfileKind[];
};

type ImMessageActionConfig = {
  allowRecall: boolean;
  allowForward: boolean;
  detailToggles: Array<"mute" | "pin" | "search" | "media" | "blacklist" | "deleteContact">;
};

type ImProfileCardConfig = {
  preferUnifiedProfileDetail: boolean;
};

export type ImRoleConfig = {
  roleType: ImRoleType;
  navItems: MobileNavItem[];
  routes: ImScopeRoutes;
  contactsVisibilityConfig: ImVisibilityConfig;
  chatCapabilityConfig: ImChatCapabilityConfig;
  profileCardConfig: ImProfileCardConfig;
  messageActionConfig: ImMessageActionConfig;
};

function buildRoutes(scope: ImRoleType): ImScopeRoutes {
  const prefix = scope === "user" ? "" : `/${scope}`;

  return {
    prefix,
    messages: `${prefix}/messages`,
    newConversation: `${prefix}/messages/new`,
    conversation: (conversationId) => `${prefix}/messages/${conversationId}`,
    conversationInfo: (conversationId) => `${prefix}/messages/${conversationId}/info`,
    conversationMedia: (conversationId) => `${prefix}/messages/${conversationId}/media`,
    contacts: `${prefix}/contacts`,
    contactDetail: (contactId) => `${prefix}/contacts/${contactId}`,
    friendRequests: `${prefix}/contacts/requests`,
    organization: `${prefix}/contacts/organization`,
    blacklist: `${prefix}/contacts/blacklist`,
    tags: `${prefix}/contacts/tags`,
    serviceAccounts: `${prefix}/contacts/service-accounts`,
    search: `${prefix}/im/search`
  };
}

const roleConfigMap: Record<ImRoleType, ImRoleConfig> = {
  user: {
    roleType: "user",
    navItems: userNavItems,
    routes: buildRoutes("user"),
    contactsVisibilityConfig: {
      visibleProfileKinds: ["person", "technician", "store", "service"],
      searchableProfileKinds: ["person", "technician", "store", "service"]
    },
    chatCapabilityConfig: {
      allowGroupConversation: true,
      allowVoiceCall: true,
      allowVideoCall: true,
      allowedMessageTypes: ["text", "emoji", "image", "voice", "video", "file", "location", "contact-card"],
      shareableProfileKinds: ["person", "technician", "store"]
    },
    profileCardConfig: {
      preferUnifiedProfileDetail: true
    },
    messageActionConfig: {
      allowRecall: true,
      allowForward: true,
      detailToggles: ["mute", "pin", "search", "media", "blacklist", "deleteContact"]
    }
  },
  merchant: {
    roleType: "merchant",
    navItems: merchantNavItems,
    routes: buildRoutes("merchant"),
    contactsVisibilityConfig: {
      visibleProfileKinds: ["person", "technician", "service"],
      searchableProfileKinds: ["person", "technician", "service"]
    },
    chatCapabilityConfig: {
      allowGroupConversation: true,
      allowVoiceCall: true,
      allowVideoCall: false,
      allowedMessageTypes: ["text", "emoji", "image", "voice", "video", "file", "location", "contact-card"],
      shareableProfileKinds: ["person", "technician", "store"]
    },
    profileCardConfig: {
      preferUnifiedProfileDetail: true
    },
    messageActionConfig: {
      allowRecall: true,
      allowForward: true,
      detailToggles: ["mute", "pin", "search", "media", "blacklist", "deleteContact"]
    }
  },
  technician: {
    roleType: "technician",
    navItems: technicianNavItems,
    routes: buildRoutes("technician"),
    contactsVisibilityConfig: {
      visibleProfileKinds: ["person", "technician", "store", "service"],
      searchableProfileKinds: ["person", "technician", "store", "service"]
    },
    chatCapabilityConfig: {
      allowGroupConversation: true,
      allowVoiceCall: true,
      allowVideoCall: false,
      allowedMessageTypes: ["text", "emoji", "image", "voice", "video", "file", "location", "contact-card"],
      shareableProfileKinds: ["person", "technician", "store"]
    },
    profileCardConfig: {
      preferUnifiedProfileDetail: true
    },
    messageActionConfig: {
      allowRecall: true,
      allowForward: true,
      detailToggles: ["mute", "pin", "search", "media", "blacklist", "deleteContact"]
    }
  }
};

export function getImUserProfileEntityType(user: ImUser) {
  if (user.entityType) {
    return user.entityType;
  }

  if (user.profileKind === "store") {
    return "shop" as const;
  }

  if (user.profileKind === "technician") {
    return "technician" as const;
  }

  if (user.profileKind === "person") {
    return "user" as const;
  }

  return undefined;
}

export function getImRoleConfig(scope: ImRoleType) {
  return roleConfigMap[scope];
}

export function isContactVisibleForRole(scope: ImRoleType, user?: ImUser, contact?: ContactRelation) {
  if (!user || !contact || contact.relationStatus !== "active") {
    return false;
  }

  return getImRoleConfig(scope).contactsVisibilityConfig.visibleProfileKinds.includes(user.profileKind);
}

export function isProfileSearchableForRole(scope: ImRoleType, user?: ImUser) {
  return Boolean(user && getImRoleConfig(scope).contactsVisibilityConfig.searchableProfileKinds.includes(user.profileKind));
}

export function canShareUserCard(scope: ImRoleType, user?: ImUser) {
  return Boolean(user && getImRoleConfig(scope).chatCapabilityConfig.shareableProfileKinds.includes(user.profileKind));
}

export function resolveImProfilePath(scope: ImRoleType, user?: ImUser) {
  if (!user) {
    return undefined;
  }

  const entityType = getImUserProfileEntityType(user);

  if (!entityType || !user.entityId || user.profileKind === "service") {
    return undefined;
  }

  return getScopedProfileDetailPath(scope, entityType, user.entityId);
}
