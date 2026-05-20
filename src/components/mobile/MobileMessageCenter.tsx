import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { customers, imageBank, orders, stores, technicians } from "../../data/mock";
import { useI18n } from "../../i18n/I18nProvider";
import { getTranslationLookupCandidates, translateText } from "../../i18n/translations";
import {
  getForwardStorageKey,
  getMerchantCustomerConversationId,
  getMerchantTechnicianConversationId,
  getTechnicianCustomerConversationId,
  getTechnicianStaffConversationId,
  getTechnicianSupportConversationId,
  getTechnicianStoreConversationId,
  getUserConversationId,
  type MessageCenterContext
} from "../../lib/messageCenter";
import { chatBgUrl } from "../../assets/runtime/images";
import { buildDetailProfileFromEntity } from "../../lib/detailProfiles";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { clampMessageText } from "../../lib/messageTextLimits";
import { useDocumentScrollLock, useIosScrollContainer } from "../../lib/useIosScrollContainer";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { cn, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { FloatingTopRightControl } from "../client-ui/AppScaffold";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ConversationListItem } from "../ui/ConversationListItem";
import { NotificationBadge } from "../ui/NotificationBadge";
import { AvatarImage } from "../ui/AvatarImage";
import { PinBadgeIcon } from "../ui/PinBadgeIcon";
import { ShareNetworkIcon } from "../ui/ShareNetworkIcon";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { MobileFullscreenCloseButton, MobileFullscreenHeader } from "./MobileFullscreenHeader";
import { MobileChatComposer, type MobileChatComposerAction } from "./MobileChatComposer";
import { ImMessageActionSheet, hasActiveImMessageTextSelection, type ImMessageActionSheetItem, type ImMessageReactionSummary } from "../../features/im/components";
import { ChatConversationInfoCard } from "./ChatConversationInfoCard";
import { ContactGroupIcon } from "./ContactGroupIcon";
import { EntityDetailPage } from "./EntityDetailPage";
import { MomentActionBar } from "./MomentActionBar";
import { SectionTitle } from "./SectionTitle";
import type { Order } from "../../types/domain";
import { useClientTheme } from "../../theme/ClientThemeProvider";

type ChatMessage = {
  createdAt?: number;
  id: string;
  from: "me" | "them" | "system";
  type: "text" | "image" | "call" | "card" | "location" | "recalled";
  content: string;
  at: string;
  replyTo?: {
    author: string;
    avatar?: string;
    content: string;
  };
};

type MobileReactionPerson = ImMessageReactionSummary["people"][number];
type MobileMessageReactionState = Record<string, Record<string, MobileReactionPerson[]>>;

const messageRecallTraceThresholdMs = 180_000;

type ForwardedMessage = {
  id: string;
  conversationId: string;
  content: string;
  at: string;
};

type Conversation = {
  id: string;
  name: string;
  role: string;
  kind: "customer" | "technician" | "store" | "staff" | "support";
  phone: string;
  avatar: string;
  order: typeof orders[number];
  unread: number;
  customerId?: string;
  systemId?: string;
  isGroupChat?: boolean;
  memberNames?: string[];
};

type ConversationGroup = {
  id: string;
  name: string;
  conversationIds: string[];
  locked?: boolean;
};

type ConversationProfileTag = {
  id: string;
  icon: string;
  label: string;
};

type ConversationProfileMeta = {
  note: string;
  tags: ConversationProfileTag[];
};

const followedGroupId = "followed";
const unfollowedGroupId = "unfollowed";
const legacySystemGroupIds = new Set(["customers", "staff", "platform", "stores", "coworkers", "blacklist"]);
const legacySystemGroupNames = new Set(["店铺组", "客人组", "同事组", "平台组", "黑名单", "朋友", "店铺", "个人技师", "新朋友", "群聊", "标签", "公众号", "服务号"]);

type MomentPost = {
  id: string;
  badge: string;
  title: string;
  content: string;
  at: string;
  images: string[];
  stats: Array<[string, string]>;
};

type DeletePrompt = {
  id: string;
  name: string;
};

function HeaderActionIcon({ name }: { name: "groupChat" | "contact" | "scan" }) {
  if (name === "groupChat") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="10" r="2.6" stroke="currentColor" strokeWidth="2" />
        <path d="M4 18a4.5 4.5 0 0 1 8.4-2.2M18.5 15.5v4M16.5 17.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "scan") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M7 5H5v4M17 5h2v4M7 19H5v-4M19 15v4h-2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M8 12h8M9.5 9.5h5M9.5 14.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M12 13.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 19.5a7 7 0 0 1 14 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M18.5 5.5v4M16.5 7.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ChatWindowActionIcon({ name }: { name: "phone" | "more" | "share" | "task" | "pin" | "calendar" | "message" | "docs" | "file" | "media" | "link" | "plus" }) {
  if (name === "phone") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <path d="M7.2 4.8 9.3 4c.7-.3 1.5 0 1.8.7l1 2.4c.2.6.1 1.2-.4 1.6l-1.1 1c.8 1.7 2 3 3.7 3.8l1.1-1c.5-.4 1.1-.5 1.7-.2l2.3 1.1c.7.3 1 1.1.7 1.8l-.9 2.1c-.3.7-1 1.1-1.7 1-7-.9-12.4-6.3-13.3-13.2-.1-.8.3-1.5 1-1.8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "more") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="6.5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="17.5" cy="12" r="1.8" />
      </svg>
    );
  }

  if (name === "share") {
    return <ShareNetworkIcon className="h-4.5 w-4.5" />;
  }

  if (name === "task") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <path d="M8 6h10M8 12h10M8 18h7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="m4.5 6.5 1.5 1.5L8.5 5.5M4.5 12.5 6 14l2.5-2.5M4.5 18.5 6 20l2.5-2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "pin") {
    return <PinBadgeIcon className="h-4.5 w-4.5" />;
  }

  if (name === "calendar") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <rect height="15" rx="2.5" stroke="currentColor" strokeWidth="2" width="16" x="4" y="6" />
        <path d="M8 3.5v5M16 3.5v5M4 10.5h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "message") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <path d="M5 6.5h14v9.5H9l-4 3V6.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M8.5 10h7M8.5 13h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "docs") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <path d="M8 4h6l4 4v12H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M14 4v4h4M9 12h6M9 16h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "file") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "media") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <rect height="14" rx="3" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
        <circle cx="9" cy="10" fill="currentColor" r="1.6" />
        <path d="m7 17 4-4 2.5 2.5 2.5-3 2 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "link") {
    return (
      <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
        <path d="M10 14 8 16a3 3 0 1 1-4.2-4.2L6.7 9M14 10l2-2a3 3 0 1 1 4.2 4.2L17.3 15M9 15l6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function ChatSettingsToggle({
  checked,
  dark,
  onClick
}: {
  checked: boolean;
  dark: boolean;
  onClick: () => void;
}) {
  void dark;

  return <ToggleSwitch ariaLabel={checked ? "开" : "关"} checked={checked} onChange={onClick} />;
}

function ChatSettingsRow({
  label,
  detail,
  trailing,
  dark,
  onClick
}: {
  label: string;
  detail?: string;
  trailing?: ReactNode;
  dark: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <strong className="block text-[15px] font-black">{label}</strong>
        {detail ? (
          <p className={cn("mt-1 text-xs leading-5", dark ? "text-[#f7ead0]/46" : "text-ink/45")}>{detail}</p>
        ) : null}
      </div>
      {trailing ?? <span className={cn("text-base font-black", dark ? "text-[#f7ead0]/42" : "text-ink/32")}>›</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        className={cn(
          "flex w-full items-center gap-3 border-b px-4 py-4 text-left transition last:border-b-0",
          dark ? "border-[#3d3018]/45 hover:bg-[#110f0c]" : "border-line hover:bg-paper/70"
        )}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 border-b px-4 py-4 text-left last:border-b-0",
        dark ? "border-[#3d3018]/45" : "border-line"
      )}
    >
      {content}
    </div>
  );
}

const store = stores[0];
const allGroupId = "all";

const avatars = {
  customer: "/images/generated/profiles/profile-04.jpg",
  customerAlt: "/images/generated/profiles/profile-05.jpg",
  colleague: "/images/generated/profiles/profile-06.jpg",
  support: "/images/generated/profiles/profile-07.jpg",
  store: "/images/generated/stores/store-calm-body-room.jpg"
};

function getConversationSystemId(conversation: Conversation) {
  if (conversation.systemId) {
    return conversation.systemId;
  }

  if (conversation.customerId) {
    return customers.find((customer) => customer.id === conversation.customerId)?.systemId ?? "";
  }

  if (conversation.kind === "store") {
    return stores.find((storeItem) => storeItem.name === conversation.name || storeItem.name === conversation.order.storeName)?.systemId ?? "";
  }

  if (conversation.kind === "technician") {
    return technicians.find((technician) => technician.name === conversation.name || technician.name === conversation.order.technicianName)?.systemId ?? "";
  }

  return "";
}

function sortOrdersByBookedAt(items: Order[], direction: "asc" | "desc" = "desc") {
  return [...items].sort((left, right) => {
    const result = left.bookedAt.localeCompare(right.bookedAt);

    return direction === "asc" ? result : -result;
  });
}

function getNearestOrder(items: Order[]) {
  const baseTime = new Date("2026-04-13T00:00:00").getTime();

  return [...items].sort((left, right) => {
    const leftDistance = Math.abs(new Date(left.bookedAt.replace(" ", "T")).getTime() - baseTime);
    const rightDistance = Math.abs(new Date(right.bookedAt.replace(" ", "T")).getTime() - baseTime);

    return leftDistance - rightDistance;
  })[0];
}

function getConversations(context: MessageCenterContext): Conversation[] {
  const shared: Conversation[] = [
    {
      id: `${context}-support`,
      name: "NeeDo 客服",
      role: "平台客服",
      kind: "support",
      phone: "+81 03-0000-NEED",
      avatar: avatars.support,
      order: orders[2],
      unread: 0
    }
  ];

  if (context === "merchant") {
    const customerConversations = Array.from(
      orders.reduce((map, order) => {
        const current = map.get(order.customerId) ?? [];
        map.set(order.customerId, [...current, order]);

        return map;
      }, new Map<string, Order[]>())
    ).slice(0, 18).map<Conversation>(([customerId, customerOrders], index) => {
      const recentOrder = getNearestOrder(customerOrders) ?? customerOrders[0];

      return {
        id: getMerchantCustomerConversationId(customerId),
        name: recentOrder.customerName,
        role: recentOrder.mode === "store" ? "到店预约客户" : "预约客户",
        kind: "customer",
        phone: index % 2 === 0 ? "+81 80-4412-8821" : "+81 80-1122-7712",
        avatar: customers.find((customer) => customer.id === customerId)?.avatar ?? (index % 2 === 0 ? avatars.customer : avatars.customerAlt),
        order: recentOrder,
        unread: index % 3,
        customerId
      };
    });

    const technicianConversations = technicians.map<Conversation>((technician, index) => ({
      id: getMerchantTechnicianConversationId(technician.id),
      name: technician.name,
      role: "门店技师",
      kind: "technician",
      phone: index % 2 === 0 ? "+81 80-3344-1200" : "+81 80-5521-8830",
      avatar: technician.avatar,
      order: orders[index % orders.length],
      unread: index === 0 ? 2 : 0
    }));

    return [
      ...customerConversations,
      ...technicianConversations,
      {
        id: "merchant-colleague",
        name: "门店排班员",
        role: "同事",
        kind: "staff",
        phone: "+81 80-2211-7700",
        avatar: avatars.colleague,
        order: orders[3],
        unread: 0
      },
      ...shared
    ];
  }

  if (context === "technician") {
    const customerConversations = Array.from(
      orders.reduce((map, order) => {
        const current = map.get(order.customerId) ?? [];
        map.set(order.customerId, [...current, order]);

        return map;
      }, new Map<string, Order[]>())
    ).slice(0, 4).map<Conversation>(([customerId, customerOrders], index) => {
      const recentOrder = getNearestOrder(customerOrders) ?? customerOrders[0];

      return {
        id: getTechnicianCustomerConversationId(customerId),
        name: recentOrder.customerName,
        role: index === 0 ? "当前服务用户" : "个人工作客户",
        kind: "customer",
        phone: index % 2 === 0 ? "+81 80-4412-8821" : "+81 80-7722-1930",
        avatar: customers.find((customer) => customer.id === customerId)?.avatar ?? (index % 2 === 0 ? avatars.customer : avatars.customerAlt),
        order: recentOrder,
        unread: index === 0 ? 2 : index === 1 ? 1 : 0
      };
    });

    const teammateConversations = technicians
      .filter((technician) => technician.id !== technicians[0].id)
      .slice(0, 4)
      .map<Conversation>((technician, index) => ({
        id: getTechnicianStaffConversationId(technician.id),
        name: technician.name,
        role: index === 0 ? "店长 / 排班员" : "同事",
        kind: "staff",
        phone: "+81 80-2211-7700",
        avatar: technician.avatar,
        order: orders[(index + 1) % orders.length],
        unread: index === 0 ? 1 : 0
      }));

    return [
      {
        id: getTechnicianStoreConversationId(),
        name: store.name,
        role: "在职门店",
        kind: "store",
        phone: "+81 03-7788-9910",
        avatar: store.cover,
        order: orders[0],
        unread: 1
      },
      ...customerConversations,
      ...teammateConversations,
      ...shared
    ];
  }

  return [
    {
      id: getUserConversationId("customer"),
      name: orders[0].customerName,
      role: "本人订单",
      kind: "customer",
      phone: "+81 80-4412-8821",
      avatar: customers.find((customer) => customer.id === orders[0].customerId)?.avatar ?? avatars.customer,
      order: orders[0],
      unread: 1
    },
    {
      id: getUserConversationId("technician"),
      name: technicians[0].name,
      role: "担当技师",
      kind: "technician",
      phone: "+81 80-3344-1200",
      avatar: technicians[0].avatar,
      order: orders[0],
      unread: 2
    },
    {
      id: getUserConversationId("store"),
      name: "GINZA Calm Body Lab",
      role: "预约门店",
      kind: "store",
      phone: "+81 03-7788-9910",
      avatar: avatars.store,
      order: orders[1],
      unread: 0
    },
    {
      id: getUserConversationId("staff"),
      name: "门店排班员",
      role: "同事",
      kind: "staff",
      phone: "+81 80-2211-7700",
      avatar: avatars.colleague,
      order: orders[3],
      unread: 0
    },
    ...shared
  ];
}

function getDefaultGroups(context: MessageCenterContext, conversations: Conversation[]): ConversationGroup[] {
  const ids = conversations.map((conversation) => conversation.id);
  const followedIds = getDefaultFollowedConversationIds(context, conversations);

  return [
    { id: allGroupId, name: "全部", conversationIds: ids, locked: true },
    { id: followedGroupId, name: "关注", conversationIds: followedIds, locked: true },
    { id: unfollowedGroupId, name: "非关注", conversationIds: ids.filter((id) => !followedIds.includes(id)), locked: true }
  ];
}

function getDefaultFollowedConversationIds(context: MessageCenterContext, conversations: Conversation[]) {
  return conversations
    .filter((conversation) => {
      if (conversation.kind === "support") {
        return false;
      }

      if (context === "merchant") {
        return conversation.kind === "customer" || conversation.kind === "technician" || conversation.kind === "staff";
      }

      if (context === "technician") {
        return conversation.kind === "customer" || conversation.kind === "store";
      }

      return conversation.kind === "store" || conversation.kind === "technician";
    })
    .map((conversation) => conversation.id);
}

function getStorageKey(context: MessageCenterContext) {
  return `needo.message.groups.v3.${context}`;
}

function getDeletedStorageKey(context: MessageCenterContext) {
  return `needo.message.deleted.v1.${context}`;
}

function getAddedStorageKey(context: MessageCenterContext) {
  return `needo.message.added.v1.${context}`;
}

function getPinnedStorageKey(context: MessageCenterContext) {
  return `needo.message.pinned.v1.${context}`;
}

function getProfileCardStorageKey(context: MessageCenterContext) {
  return `needo.message.profile-card.v1.${context}`;
}

function getConversationProfileMetaStorageKey(context: MessageCenterContext) {
  return `needo.message.profile-meta.v1.${context}`;
}

function getStoredDeletedConversationIds(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(getDeletedStorageKey(context));
    const parsed = stored ? JSON.parse(stored) as string[] : [];

    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getStoredAddedConversations(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(getAddedStorageKey(context));
    const parsed = stored ? JSON.parse(stored) as Conversation[] : [];

    return Array.isArray(parsed) ? parsed.filter((item) => item.id && item.name && item.order) : [];
  } catch {
    return [];
  }
}

function getStoredPinnedConversationMeta(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return {} as Record<string, number>;
  }

  try {
    const stored = window.localStorage.getItem(getPinnedStorageKey(context));
    const parsed = stored ? (JSON.parse(stored) as Record<string, number>) : {};

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number" && Number.isFinite(entry[1]))
    );
  } catch {
    return {};
  }
}

function getStoredProfileCardMinimizedMeta(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return {} as Record<string, boolean>;
  }

  try {
    const stored = window.localStorage.getItem(getProfileCardStorageKey(context));
    const parsed = stored ? (JSON.parse(stored) as Record<string, boolean>) : {};

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[0] === "string" && typeof entry[1] === "boolean")
    );
  } catch {
    return {};
  }
}

function getStoredConversationProfileMeta(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return {} as Record<string, ConversationProfileMeta>;
  }

  try {
    const stored = window.localStorage.getItem(getConversationProfileMetaStorageKey(context));
    const parsed = stored ? (JSON.parse(stored) as Record<string, ConversationProfileMeta>) : {};

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        {
          note: typeof value?.note === "string" ? value.note : "",
          tags: Array.isArray(value?.tags)
            ? value.tags
                .filter(
                  (tag): tag is ConversationProfileTag =>
                    Boolean(tag) &&
                    typeof tag.id === "string" &&
                    typeof tag.icon === "string" &&
                    typeof tag.label === "string"
                )
                .map((tag) => ({ ...tag }))
            : []
        }
      ])
    );
  } catch {
    return {};
  }
}

function getStoredForwardedMessages(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(getForwardStorageKey(context));
    const parsed = stored ? JSON.parse(stored) as ForwardedMessage[] : [];

    return Array.isArray(parsed) ? parsed.filter((item) => item.id && item.conversationId && item.content) : [];
  } catch {
    return [];
  }
}

function getStoredGroups(context: MessageCenterContext, conversations: Conversation[]) {
  const defaults = getDefaultGroups(context, conversations);

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const stored = window.localStorage.getItem(getStorageKey(context));

    if (!stored) {
      return defaults;
    }

    const parsed = JSON.parse(stored) as ConversationGroup[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaults;
    }

    const validIds = new Set(conversations.map((conversation) => conversation.id));
    const cleaned = parsed
      .filter((group) => group.id && group.name)
      .map((group) => ({
        ...group,
        conversationIds: group.id === allGroupId
          ? conversations.map((conversation) => conversation.id)
          : (group.conversationIds ?? []).filter((id) => validIds.has(id)),
        locked: group.id === allGroupId || group.id === followedGroupId || group.id === unfollowedGroupId
      }));
    const customGroups = cleaned.filter(
      (group) =>
        ![allGroupId, followedGroupId, unfollowedGroupId].includes(group.id) &&
        !legacySystemGroupIds.has(group.id) &&
        !legacySystemGroupNames.has(group.name)
    );

    return [...defaults, ...customGroups];
  } catch {
    return defaults;
  }
}

function getInitialMessages(context: MessageCenterContext, conversations: Conversation[]) {
  return Object.fromEntries(
    conversations.map((conversation, index) => [
      conversation.id,
      [
        {
          id: `${conversation.id}-hello`,
          from: "them",
          type: "text",
          content: index % 2 === 0 ? "您好，这边已同步订单信息，有变化我会马上联系您。" : "刚刚看到了预约信息，我会按时处理。",
          at: index % 2 === 0 ? "09:20" : "14:05"
        },
        {
          id: `${conversation.id}-system`,
          from: "system",
          type: "card",
          content: `${conversation.order.orderNo} · ${conversation.order.itemName}`,
          at: "09:21"
        }
      ] satisfies ChatMessage[]
    ])
  );
}

function getContextCopy(context: MessageCenterContext) {
  if (context === "merchant") {
    return {
      empty: "当前分组没有会话，可以先用右上角添加联系人或发起群聊。"
    };
  }

  if (context === "technician") {
    return {
      empty: "当前分组没有会话，可以先用右上角添加联系人或发起群聊。"
    };
  }

  return {
    empty: "当前分组没有会话，可以先用右上角添加联系人或发起群聊。"
  };
}

function getCurrentTime() {
  return new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function ChatMessagePressable({
  children,
  onOpenMenu
}: {
  children: ReactNode;
  onOpenMenu: () => void;
}) {
  const timerRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearPress = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pressStartRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    clearPress();

    if (hasActiveImMessageTextSelection(event.currentTarget)) {
      return;
    }

    pressStartRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = window.setTimeout(onOpenMenu, 380);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pressStartRef.current;

    if (!start) {
      return;
    }

    if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
      clearPress();
    }
  };

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        if (hasActiveImMessageTextSelection(event.currentTarget)) {
          return;
        }
        onOpenMenu();
      }}
      onPointerCancel={clearPress}
      onPointerDown={handlePointerDown}
      onPointerLeave={clearPress}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPress}
    >
      {children}
    </div>
  );
}

function MobileChatReactionBar({
  dark,
  mine,
  onToggleReaction,
  reactions
}: {
  dark: boolean;
  mine: boolean;
  onToggleReaction: (emoji: string) => void;
  reactions: ImMessageReactionSummary[];
}) {
  const [expandedEmoji, setExpandedEmoji] = useState<string | null>(null);

  if (reactions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex max-w-full flex-wrap gap-1.5">
      {reactions.map((reaction) => {
        const names = reaction.people.map((person) => person.name).filter(Boolean);
        const label = names.length > 2 ? `${names[0]}等${names.length}人` : names.join("、");
        const expanded = expandedEmoji === reaction.emoji;

        return (
          <span
            className={cn(
              "relative inline-flex min-w-0 items-center overflow-visible rounded-full px-1.5 py-1",
              mine ? "bg-black/10" : dark ? "bg-white/[0.08]" : "bg-black/[0.06]"
            )}
            key={reaction.emoji}
          >
            <button
              aria-pressed={reaction.reactedByMe}
              className={cn(
                "grid h-7 min-w-7 shrink-0 place-items-center rounded-[10px] px-1 text-[18px] transition",
                reaction.reactedByMe ? (mine ? "bg-black/[0.14]" : dark ? "bg-white/[0.12]" : "bg-moss/[0.14]") : "hover:bg-black/[0.06]"
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleReaction(reaction.emoji);
              }}
              type="button"
            >
              {reaction.emoji}
            </button>
            <button
              className="min-w-0 max-w-[8rem] truncate px-2 text-left text-[12px] font-black opacity-78"
              onClick={(event) => {
                event.stopPropagation();
                setExpandedEmoji(expanded ? null : reaction.emoji);
              }}
              type="button"
            >
              {label || `${reaction.people.length}人`}
            </button>
            {expanded ? (
              <span className={cn("absolute bottom-[calc(100%+6px)] left-0 z-20 min-w-[150px] rounded-[14px] px-3 py-2 text-left text-[12px] font-black shadow-[0_10px_24px_rgba(0,0,0,0.22)]", dark ? "bg-[#17130f] text-[#f7ead0]" : "bg-white text-ink")}>
                {reaction.people.map((person) => (
                  <span className="flex min-w-0 items-center gap-2 py-1" key={person.id}>
                    {person.avatar ? (
                      <AvatarImage alt={person.name} className="h-6 w-6 shrink-0" src={person.avatar} />
                    ) : (
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] bg-black/[0.08]">
                        {person.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="truncate">{person.name}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function canDisplayPhone(conversation: Conversation) {
  return conversation.kind === "store";
}

function getMomentPosts(conversation: Conversation, appointment: Order): MomentPost[] {
  if (conversation.kind === "store") {
    return [
      {
        id: `${conversation.id}-store-1`,
        badge: "店铺动态",
        title: "本周新增夜间预约席位",
        content: `${conversation.name} 本周开放 20:30 后预约，护理、按摩和美甲项目都可以提前锁定担当者。`,
        at: "今天 10:20",
        images: [stores[0].cover, imageBank.salon],
        stats: [["可约时段", "18"], ["收藏", "426"], ["电话", conversation.phone]]
      },
      {
        id: `${conversation.id}-store-2`,
        badge: "照片",
        title: "店内环境与担当者更新",
        content: "新拍摄了接待区、护理房和消毒台照片，预约前可以先确认环境和动线。",
        at: "昨天 18:40",
        images: [imageBank.home, imageBank.cafe, imageBank.massage],
        stats: [["浏览", "3.2k"], ["评论", "48"], ["预约", "76"]]
      }
    ];
  }

  if (conversation.kind === "technician") {
    return [
      {
        id: `${conversation.id}-tech-1`,
        badge: "服务动态",
        title: "今日完成 4 单，准时率 100%",
        content: `${conversation.name} 分享了近期服务记录，重点是肩颈放松、深层清洁和宠物家庭友好流程。`,
        at: "今天 16:15",
        images: [conversation.avatar, imageBank.massage],
        stats: [["评分", "4.9"], ["复约", "68%"], ["照片", "12"]]
      },
      {
        id: `${conversation.id}-tech-2`,
        badge: "推文",
        title: "上门前的小提醒",
        content: "如果家里有宠物或需要女性技师同行，可以提前在备注里写清楚，我会按流程确认。",
        at: "4月12日 21:10",
        images: [imageBank.pet],
        stats: [["点赞", "188"], ["收藏", "54"], ["分享", "19"]]
      }
    ];
  }

  if (conversation.kind === "staff" || conversation.kind === "support") {
    return [
      {
        id: `${conversation.id}-work-1`,
        badge: conversation.kind === "support" ? "平台公告" : "工作动态",
        title: conversation.kind === "support" ? "售后处理和补偿规则更新" : "门店排班与协作记录",
        content: `${conversation.name} 更新了 ${appointment.itemName} 相关沟通记录，方便团队统一服务口径。`,
        at: "今天 11:30",
        images: [conversation.avatar, imageBank.cafe],
        stats: [["待办", "3"], ["已读", "28"], ["跟进", "6"]]
      }
    ];
  }

  return [
    {
      id: `${conversation.id}-customer-1`,
      badge: "动态",
      title: "授权可见的服务偏好",
      content: `${conversation.name} 最近常预约 ${appointment.itemName}，偏好 ${appointment.area} 区域和准时提醒。`,
      at: "今天 09:05",
      images: [conversation.avatar, imageBank.cleaning],
      stats: [["历史订单", "8"], ["最近预约", appointment.bookedAt.slice(5, 16)], ["隐私", "授权"]]
    },
    {
      id: `${conversation.id}-customer-2`,
      badge: "照片",
      title: "服务现场照片",
      content: "用户授权展示服务前后对比照片，方便商家和技师理解户型、动线和注意事项。",
      at: "4月11日 13:30",
      images: [imageBank.home, imageBank.cleaning, imageBank.pet],
      stats: [["照片", "6"], ["备注", "2"], ["回访", "已完成"]]
    }
  ];
}

function getNewContactCandidates(context: MessageCenterContext): Conversation[] {
  if (context === "merchant") {
    return [
      {
        id: "merchant-new-customer-1",
        name: customers[5]?.name ?? "新客 山本",
        role: "潜在顾客",
        kind: "customer",
        phone: "+81 80-9012-1201",
        avatar: customers[5]?.avatar ?? avatars.customerAlt,
        order: orders[6] ?? orders[0],
        unread: 0,
        customerId: customers[5]?.id,
        systemId: customers[5]?.systemId
      },
      {
        id: "merchant-new-tech-1",
        name: technicians[4]?.name ?? "协作技师",
        role: "待合作技师",
        kind: "technician",
        phone: "+81 80-2055-8801",
        avatar: technicians[4]?.avatar ?? avatars.colleague,
        order: orders[7] ?? orders[1],
        unread: 0,
        systemId: technicians[4]?.systemId
      },
      {
        id: "merchant-new-support-1",
        name: "NeeDo 渠道经理",
        role: "平台联系人",
        kind: "support",
        phone: "+81 03-7000-2288",
        avatar: avatars.support,
        order: orders[8] ?? orders[2],
        unread: 0
      }
    ];
  }

  if (context === "technician") {
    return [
      {
        id: "technician-new-customer-1",
        name: customers[6]?.name ?? "新客 Marina",
        role: "潜在顾客",
        kind: "customer",
        phone: "+81 80-8871-2201",
        avatar: customers[6]?.avatar ?? avatars.customer,
        order: orders[9] ?? orders[0],
        unread: 0,
        customerId: customers[6]?.id,
        systemId: customers[6]?.systemId
      },
      {
        id: "technician-new-store-1",
        name: stores[2]?.name ?? "新协作门店",
        role: "待合作门店",
        kind: "store",
        phone: "+81 03-6444-9001",
        avatar: stores[2]?.cover ?? avatars.store,
        order: orders[10] ?? orders[1],
        unread: 0,
        systemId: stores[2]?.systemId
      },
      {
        id: "technician-new-staff-1",
        name: technicians[7]?.name ?? "值班排班员",
        role: "同事 / 协作",
        kind: "staff",
        phone: "+81 80-5522-1818",
        avatar: technicians[7]?.avatar ?? avatars.colleague,
        order: orders[11] ?? orders[2],
        unread: 0
      }
    ];
  }

  return [
    {
      id: "user-new-tech-1",
      name: technicians[3]?.name ?? "新担当技师",
      role: "推荐技师",
      kind: "technician",
      phone: "+81 80-3344-1201",
      avatar: technicians[3]?.avatar ?? avatars.colleague,
      order: orders[12] ?? orders[0],
      unread: 0
    },
    {
      id: "user-new-store-1",
      name: stores[3]?.name ?? "推荐门店",
      role: "收藏候选门店",
      kind: "store",
        phone: "+81 03-7788-9911",
        avatar: stores[3]?.cover ?? avatars.store,
        order: orders[13] ?? orders[1],
        unread: 0,
        systemId: stores[3]?.systemId
      },
    {
      id: "user-new-support-1",
      name: "NeeDo 礼宾助手",
      role: "平台助手",
      kind: "support",
      phone: "+81 03-1000-2288",
      avatar: avatars.support,
      order: orders[14] ?? orders[2],
      unread: 0
    }
  ];
}

export function MobileMessageCenter({ context = "user" }: { context?: MessageCenterContext }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { isNight } = useClientTheme();
  const entityRevision = useEntityStore().revision;
  const [searchParams, setSearchParams] = useSearchParams();
  const { scrollRef: groupScrollRef, dragScrollProps: groupDragScrollProps } = useHorizontalDragScroll({});
  const baseConversations = useMemo(() => getConversations(context), [context, entityRevision]);
  const [addedConversations, setAddedConversations] = useState<Conversation[]>(() => getStoredAddedConversations(context));
  const [deletedConversationIds, setDeletedConversationIds] = useState<string[]>(() => getStoredDeletedConversationIds(context));
  const conversations = useMemo(
    () => [...baseConversations, ...addedConversations].filter((conversation, index, list) => (
      !deletedConversationIds.includes(conversation.id) && list.findIndex((item) => item.id === conversation.id) === index
    )),
    [addedConversations, baseConversations, deletedConversationIds]
  );
  const copy = getContextCopy(context);
  const [groups, setGroups] = useState<ConversationGroup[]>(() => getStoredGroups(context, conversations));
  const [activeGroupId, setActiveGroupId] = useState(allGroupId);
  const [activeId, setActiveId] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showMoments, setShowMoments] = useState(false);
  const [showComposerActions, setShowComposerActions] = useState(false);
  const [showContactCreator, setShowContactCreator] = useState(false);
  const [showGroupChatCreator, setShowGroupChatCreator] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showProfileDetails, setShowProfileDetails] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [scannedContactId, setScannedContactId] = useState<string | null>(null);
  const [groupChatQuery, setGroupChatQuery] = useState("");
  const [selectedGroupChatIds, setSelectedGroupChatIds] = useState<string[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [momentReplies, setMomentReplies] = useState<Record<string, string[]>>({});
  const [translatedMomentIds, setTranslatedMomentIds] = useState<string[]>([]);
  const [previewMomentImage, setPreviewMomentImage] = useState<{ src: string; alt: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [pinnedConversationMeta, setPinnedConversationMeta] = useState<Record<string, number>>(() => getStoredPinnedConversationMeta(context));
  const [profileCardMinimizedMeta, setProfileCardMinimizedMeta] = useState<Record<string, boolean>>(() => getStoredProfileCardMinimizedMeta(context));
  const [conversationProfileMeta, setConversationProfileMeta] = useState<Record<string, ConversationProfileMeta>>(() => getStoredConversationProfileMeta(context));
  const [profileNoteDraft, setProfileNoteDraft] = useState("");
  const [profileTagLabelDraft, setProfileTagLabelDraft] = useState("");
  const [profileTagIconDraft, setProfileTagIconDraft] = useState("follow");
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [followUpIds, setFollowUpIds] = useState<string[]>([]);
  const [translationAssistantIds, setTranslationAssistantIds] = useState<string[]>([]);
  const [swipedConversationId, setSwipedConversationId] = useState<string | null>(null);
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() => getInitialMessages(context, conversations));
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageActionExpanded, setMessageActionExpanded] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string; avatar?: string; content: string } | null>(null);
  const [messageReactions, setMessageReactions] = useState<MobileMessageReactionState>({});
  const [pinnedMessageIdsByConversation, setPinnedMessageIdsByConversation] = useState<Record<string, string[]>>({});
  const [conversationActivityMeta, setConversationActivityMeta] = useState<Record<string, number>>(() =>
    Object.fromEntries(getConversations(context).map((conversation, index) => [conversation.id, Date.now() - (getConversations(context).length - index) * 1000]))
  );
  const swipeSession = useRef<{ id: string; pointerId: number; startX: number; startY: number; initialOffset: number; moved: boolean } | null>(null);
  const skipNextConversationClickId = useRef<string | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatListWasNearBottomRef = useRef(true);
  const chatListStateRef = useRef({ conversationId: "", messageCount: 0 });
  const chatMessageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const activeGroupIds = activeGroup.id === allGroupId ? conversations.map((conversation) => conversation.id) : activeGroup.conversationIds;
  const visibleConversations = conversations
    .filter((conversation) => activeGroupIds.includes(conversation.id))
    .sort((left, right) => {
      const leftPinned = Boolean(pinnedConversationMeta[left.id]);
      const rightPinned = Boolean(pinnedConversationMeta[right.id]);

      if (leftPinned !== rightPinned) {
        return Number(rightPinned) - Number(leftPinned);
      }

      const leftSortValue = Math.max(pinnedConversationMeta[left.id] ?? 0, conversationActivityMeta[left.id] ?? 0);
      const rightSortValue = Math.max(pinnedConversationMeta[right.id] ?? 0, conversationActivityMeta[right.id] ?? 0);

      if (leftSortValue !== rightSortValue) {
        return rightSortValue - leftSortValue;
      }

      return conversations.findIndex((conversation) => conversation.id === left.id) - conversations.findIndex((conversation) => conversation.id === right.id);
    });
  const active = conversations.find((conversation) => conversation.id === activeId) ?? visibleConversations[0] ?? conversations[0];
  const conversationActionRevealWidth = 192;
  const activeMessages = messages[active.id] ?? [];
  const pinnedMessageIds = pinnedMessageIdsByConversation[active.id] ?? [];
  const pinnedMessages = pinnedMessageIds
    .map((messageId) => activeMessages.find((message) => message.id === messageId))
    .filter((message): message is ChatMessage => message !== undefined && message.type !== "recalled");
  const selectedMessage = selectedMessageId ? activeMessages.find((message) => message.id === selectedMessageId) ?? null : null;
  const customerAppointments = context === "merchant" && active.customerId
    ? sortOrdersByBookedAt(orders.filter((order) => order.customerId === active.customerId))
    : [active.order];
  const recentAppointment = getNearestOrder(customerAppointments) ?? active.order;
  const canShowPhone = canDisplayPhone(active);
  const activeMoments = getMomentPosts(active, recentAppointment);
  const activeStoreProfile = active.kind === "store"
    ? stores.find((item) => item.name === active.name || item.name === active.order.storeName) ?? stores[0]
    : null;
  const activeTechnicianProfile = active.kind === "technician"
    ? technicians.find((item) => item.name === active.name || item.name === active.order.technicianName) ?? technicians[0]
    : null;
  const activeCustomerProfile = active.kind === "customer"
    ? customers.find((item) => item.id === active.customerId || item.name === active.name) ?? null
    : null;
  const isProfileCardMinimized = Boolean(profileCardMinimizedMeta[active.id]);
  const activeConversationProfileMeta = conversationProfileMeta[active.id] ?? { note: "", tags: [] };
  const activeDetailProfile = buildDetailProfileFromEntity({
    customer: activeCustomerProfile,
    technician: activeTechnicianProfile,
    store: activeStoreProfile,
    technicians
  });
  const currentReactionPerson = useMemo<MobileReactionPerson>(() => {
    if (context === "merchant") {
      return {
        id: "merchant-me",
        name: stores[0]?.name ?? "店铺",
        avatar: stores[0]?.cover
      };
    }

    if (context === "technician") {
      return {
        id: "technician-me",
        name: technicians[0]?.nickname?.trim() || technicians[0]?.name || "技师",
        avatar: technicians[0]?.avatar
      };
    }

    return {
      id: "user-me",
      name: customers[0]?.nickname?.trim() || customers[0]?.name || "我",
      avatar: customers[0]?.avatar
    };
  }, [context, entityRevision]);

  useDocumentScrollLock(isChatOpen);
  useIosScrollContainer(chatListRef);

  useEffect(() => {
    if (!selectedMessageId) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      chatMessageRefs.current[selectedMessageId]?.scrollIntoView({ block: "end", behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messageActionExpanded, selectedMessageId]);

  const updateChatListNearBottom = (element: HTMLDivElement) => {
    chatListWasNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  useEffect(() => {
    const list = chatListRef.current;

    if (!list) {
      return undefined;
    }

    const previousState = chatListStateRef.current;
    const conversationChanged = previousState.conversationId !== active.id;
    const previousMessageCount = conversationChanged ? 0 : previousState.messageCount;
    const latestMessage = activeMessages.at(-1);

    chatListStateRef.current = { conversationId: active.id, messageCount: activeMessages.length };

    const shouldStickToBottom =
      conversationChanged ||
      previousMessageCount === 0 ||
      chatListWasNearBottomRef.current ||
      latestMessage?.from === "me" ||
      latestMessage?.from === "system";

    if (!shouldStickToBottom) {
      return undefined;
    }

    const scrollToBottom = () => {
      list.scrollTop = list.scrollHeight;
      updateChatListNearBottom(list);
    };

    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [active.id, activeMessages.length]);

  useEffect(() => {
    setSelectedMessageId(null);
    setMessageActionExpanded(false);
    setReplyTarget(null);
  }, [active.id]);
  const profileCardSubtitle = activeDetailProfile?.subtitle ?? active.role;
  const profileMetric = activeDetailProfile
    ? {
        label: activeDetailProfile.scoreLabel,
        value: typeof activeDetailProfile.score === "number" ? `${Math.max(0, Math.min(5, activeDetailProfile.score)).toFixed(1)}/5` : "待完善"
      }
    : { label: "ID", value: getConversationSystemId(active) || active.id.slice(-6) };
  const profileTagOptions: Array<{ id: string; label: string }> = [
    { id: "follow", label: "关注" },
    { id: "store", label: "店铺" },
    { id: "staff", label: "技师" },
    { id: "customer", label: "顾客" },
    { id: "group", label: "群组" },
    { id: "service", label: "服务" },
    { id: "blacklist", label: "提醒" },
    { id: "all", label: "综合" }
  ];
  const availableContactCandidates = getNewContactCandidates(context).filter(
    (candidate) => !conversations.some((conversation) => conversation.id === candidate.id)
  );
  const normalizedContactQuery = contactQuery.trim().toLowerCase();
  const filteredContactCandidates = availableContactCandidates.filter((candidate) => {
    if (!normalizedContactQuery) {
      return true;
    }

    const systemId = getConversationSystemId(candidate).toLowerCase();

    return candidate.name.toLowerCase().includes(normalizedContactQuery) || systemId.includes(normalizedContactQuery);
  });
  const scannedCandidate = scannedContactId
    ? availableContactCandidates.find((candidate) => candidate.id === scannedContactId) ?? null
    : null;
  const groupChatCandidates = conversations.filter((conversation) => !conversation.isGroupChat && conversation.kind !== "support");
  const normalizedGroupChatQuery = groupChatQuery.trim().toLowerCase();
  const filteredGroupChatCandidates = groupChatCandidates.filter((candidate) => {
    if (!normalizedGroupChatQuery) {
      return true;
    }

    const systemId = getConversationSystemId(candidate).toLowerCase();

    return candidate.name.toLowerCase().includes(normalizedGroupChatQuery) || systemId.includes(normalizedGroupChatQuery);
  });
  const getGroupUnreadCount = (group: ConversationGroup) => {
    const ids = group.id === allGroupId ? conversations.map((conversation) => conversation.id) : group.conversationIds;

    return conversations
      .filter((conversation) => ids.includes(conversation.id) && !readIds.includes(conversation.id))
      .reduce((sum, conversation) => sum + conversation.unread, 0);
  };

  useEffect(() => {
    setDeletedConversationIds(getStoredDeletedConversationIds(context));
  }, [context]);

  useEffect(() => {
    setAddedConversations(getStoredAddedConversations(context));
  }, [context]);

  useEffect(() => {
    window.localStorage.setItem(getStorageKey(context), JSON.stringify(groups));
  }, [context, groups]);

  useEffect(() => {
    window.localStorage.setItem(getDeletedStorageKey(context), JSON.stringify(deletedConversationIds));
  }, [context, deletedConversationIds]);

  useEffect(() => {
    window.localStorage.setItem(getAddedStorageKey(context), JSON.stringify(addedConversations));
  }, [addedConversations, context]);

  useEffect(() => {
    setPinnedConversationMeta(getStoredPinnedConversationMeta(context));
  }, [context]);

  useEffect(() => {
    setProfileCardMinimizedMeta(getStoredProfileCardMinimizedMeta(context));
  }, [context]);

  useEffect(() => {
    setConversationProfileMeta(getStoredConversationProfileMeta(context));
  }, [context]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getPinnedStorageKey(context), JSON.stringify(pinnedConversationMeta));
  }, [context, pinnedConversationMeta]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getProfileCardStorageKey(context), JSON.stringify(profileCardMinimizedMeta));
  }, [context, profileCardMinimizedMeta]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getConversationProfileMetaStorageKey(context), JSON.stringify(conversationProfileMeta));
  }, [context, conversationProfileMeta]);

  useEffect(() => {
    setProfileNoteDraft(activeConversationProfileMeta.note);
    setProfileTagLabelDraft("");
    setProfileTagIconDraft("follow");
  }, [active.id, activeConversationProfileMeta.note]);

  useEffect(() => {
    const validConversationIds = new Set(conversations.map((conversation) => conversation.id));
    const followedIds = getDefaultFollowedConversationIds(context, conversations);

    setGroups((current) =>
      [
        { id: allGroupId, name: "全部", conversationIds: conversations.map((conversation) => conversation.id), locked: true },
        { id: followedGroupId, name: "关注", conversationIds: followedIds, locked: true },
        { id: unfollowedGroupId, name: "非关注", conversationIds: conversations.map((conversation) => conversation.id).filter((id) => !followedIds.includes(id)), locked: true },
        ...current
          .filter(
            (group) =>
              ![allGroupId, followedGroupId, unfollowedGroupId].includes(group.id) &&
              !legacySystemGroupIds.has(group.id) &&
              !legacySystemGroupNames.has(group.name)
          )
          .map((group) => ({
            ...group,
            conversationIds: group.conversationIds.filter((id) => validConversationIds.has(id)),
            locked: false
          }))
      ]
    );
  }, [context, conversations]);

  useEffect(() => {
    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(allGroupId);
    }
  }, [activeGroupId, groups]);

  useEffect(() => {
    const forwardedMessages = getStoredForwardedMessages(context);

    if (forwardedMessages.length === 0) {
      return;
    }

    const validConversationIds = new Set(conversations.map((conversation) => conversation.id));
    const validMessages = forwardedMessages.filter((message) => validConversationIds.has(message.conversationId));

    if (validMessages.length === 0) {
      window.localStorage.removeItem(getForwardStorageKey(context));
      return;
    }

    setMessages((current) => {
      const next = { ...current };

      validMessages.forEach((message) => {
        const exists = next[message.conversationId]?.some((item) => item.id === message.id);

        if (exists) {
          return;
        }

        next[message.conversationId] = [
          ...(next[message.conversationId] ?? []),
          {
            id: message.id,
            from: "me",
            type: "card",
            content: message.content,
            at: message.at || getCurrentTime()
          }
        ];
      });

      return next;
    });

    const firstMessage = validMessages[0];
    setActiveId(firstMessage.conversationId);
    setActiveGroupId(allGroupId);
    setReadIds((current) => (current.includes(firstMessage.conversationId) ? current : [...current, firstMessage.conversationId]));
    setIsChatOpen(true);
    window.localStorage.removeItem(getForwardStorageKey(context));
  }, [context, conversations]);

  useEffect(() => {
    const targetId = searchParams.get("chat");

    if (!targetId || !conversations.some((conversation) => conversation.id === targetId)) {
      return;
    }

    setActiveId(targetId);
    setActiveGroupId(allGroupId);
    setReadIds((current) => (current.includes(targetId) ? current : [...current, targetId]));
    setIsChatOpen(true);
    setShowChatSettings(false);
    setShowProfileDetails(false);
    setShowMoments(false);
    setShowComposerActions(false);
  }, [conversations, searchParams]);

  const selectGroup = (group: ConversationGroup) => {
    setActiveGroupId(group.id);
    setSwipedConversationId(null);
    setDeletePrompt(null);
    setIsChatOpen(false);
    setShowProfileDetails(false);
    setShowMoments(false);
    setShowComposerActions(false);
  };

  const addGroup = () => {
    const id = `group-${Date.now()}`;
    const customGroupCount = groups.filter((group) => group.id.startsWith("group-")).length;
    setGroups((current) => [...current, { id, name: `自定义分组 ${customGroupCount + 1}`, conversationIds: [] }]);
    setActiveGroupId(id);
    setSwipedConversationId(null);
    setDeletePrompt(null);
    setIsChatOpen(false);
    setShowProfileDetails(false);
    setShowMoments(false);
    setShowComposerActions(false);
  };

  const openContactCreator = () => {
    setContactQuery("");
    setScannedContactId(null);
    setShowContactCreator(true);
  };

  const openGroupChatCreator = () => {
    setGroupChatQuery("");
    setSelectedGroupChatIds([]);
    setShowGroupChatCreator(true);
  };

  const simulateQrScan = () => {
    const candidate = availableContactCandidates.find((item) => Boolean(getConversationSystemId(item))) ?? availableContactCandidates[0] ?? null;

    if (!candidate) {
      return;
    }

    setScannedContactId(candidate.id);
    setContactQuery(getConversationSystemId(candidate) || candidate.name);
  };

  const simulateDineInScan = () => {
    navigate("/q/qr-table-a08");
  };

  const addContact = (contact: Conversation) => {
    setAddedConversations((current) => [...current, contact]);
    if (!activeGroup.locked && activeGroup.id !== allGroupId) {
      setGroups((current) => current.map((group) => (
        group.id === activeGroup.id
          ? { ...group, conversationIds: group.conversationIds.includes(contact.id) ? group.conversationIds : [...group.conversationIds, contact.id] }
          : group
      )));
    }
    setShowContactCreator(false);
    openConversation(contact.id);
  };

  const toggleGroupChatMember = (conversationId: string) => {
    setSelectedGroupChatIds((current) =>
      current.includes(conversationId) ? current.filter((id) => id !== conversationId) : [...current, conversationId]
    );
  };

  const createGroupChat = () => {
    if (selectedGroupChatIds.length === 0) {
      return;
    }

    const members = groupChatCandidates.filter((conversation) => selectedGroupChatIds.includes(conversation.id));

    if (members.length === 0) {
      return;
    }

    const groupId = `${context}-group-chat-${Date.now()}`;
    const groupName = members.length === 1 ? `${members[0].name} 群聊` : `${members[0].name}等${members.length}人`;
    const memberNames = members.map((member) => member.name);
    const newConversation: Conversation = {
      id: groupId,
      name: groupName,
      role: "群聊",
      kind: "staff",
      phone: "",
      avatar: members[0].avatar,
      order: members[0].order,
      unread: 0,
      isGroupChat: true,
      memberNames
    };

    setAddedConversations((current) => [...current, newConversation]);
    setMessages((current) => ({
      ...current,
      [groupId]: [
        {
          id: `${groupId}-hello`,
          from: "system",
          type: "text",
          content: `群聊已创建，成员：${memberNames.join("、")}`,
          at: getCurrentTime()
        }
      ]
    }));
    setShowGroupChatCreator(false);
    setSelectedGroupChatIds([]);
    openConversation(groupId);
  };

  const openConversation = (conversationId: string) => {
    setSwipedConversationId(null);
    setDragOffset(0);
    setDeletePrompt(null);
    setActiveId(conversationId);
    setReadIds((current) => (current.includes(conversationId) ? current : [...current, conversationId]));
    setIsChatOpen(true);
    setShowMoments(false);
    setShowComposerActions(false);
    setShowChatSettings(false);
    setShowProfileDetails(false);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("chat", conversationId);
    setSearchParams(nextParams, { replace: true });
  };

  const requestDeleteConversation = (conversation: Conversation) => {
    setDeletePrompt({ id: conversation.id, name: conversation.name });
    setSwipedConversationId(null);
    setDragOffset(0);
  };

  const confirmDeleteConversation = () => {
    if (!deletePrompt || conversations.length <= 1) {
      setDeletePrompt(null);
      return;
    }

    const targetId = deletePrompt.id;

    setDeletedConversationIds((current) => [...current, targetId]);
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        conversationIds: group.id === allGroupId ? group.conversationIds : group.conversationIds.filter((id) => id !== targetId)
      }))
    );
    setMessages((current) => {
      const next = { ...current };
      delete next[targetId];
      return next;
    });
    setPinnedConversationMeta((current) => {
      if (!current[targetId]) {
        return current;
      }

      const next = { ...current };
      delete next[targetId];
      return next;
    });
    setProfileCardMinimizedMeta((current) => {
      if (!current[targetId]) {
        return current;
      }

      const next = { ...current };
      delete next[targetId];
      return next;
    });
    setMutedIds((current) => current.filter((id) => id !== targetId));
    setFollowUpIds((current) => current.filter((id) => id !== targetId));
    setReadIds((current) => current.filter((id) => id !== targetId));
    if (activeId === targetId) {
      setIsChatOpen(false);
      setActiveId("");
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("chat");
      setSearchParams(nextParams, { replace: true });
    }
    setDeletePrompt(null);
  };

  const startConversationSwipe = (event: React.PointerEvent<HTMLDivElement>, conversationId: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    swipeSession.current = {
      id: conversationId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialOffset: swipedConversationId === conversationId ? -conversationActionRevealWidth : 0,
      moved: false
    };
    setDraggingConversationId(conversationId);
    setDragOffset(swipedConversationId === conversationId ? -192 : 0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveConversationSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = swipeSession.current;

    if (!swipe || swipe.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - swipe.startX;
    const dy = event.clientY - swipe.startY;

    if (!swipe.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      return;
    }

    if (!swipe.moved && Math.abs(dy) > Math.abs(dx)) {
      swipeSession.current = null;
      setDraggingConversationId(null);
      setDragOffset(0);
      return;
    }

    swipe.moved = true;
    const nextOffset = Math.max(-conversationActionRevealWidth, Math.min(0, swipe.initialOffset + dx));
    setDragOffset(nextOffset);
  };

  const endConversationSwipe = (pointerId?: number) => {
    const swipe = swipeSession.current;

    if (!swipe || (pointerId !== undefined && swipe.pointerId !== pointerId)) {
      return;
    }

    skipNextConversationClickId.current = swipe.id;

    if (!swipe.moved) {
      if (swipedConversationId === swipe.id) {
        setSwipedConversationId(null);
      } else {
        openConversation(swipe.id);
      }
      setDragOffset(0);
      setDraggingConversationId(null);
      swipeSession.current = null;
      return;
    }

    const shouldRevealActions = dragOffset <= -(conversationActionRevealWidth * 0.4);
    setSwipedConversationId(shouldRevealActions ? swipe.id : null);
    setDragOffset(0);
    setDraggingConversationId(null);
    swipeSession.current = null;
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setSwipedConversationId(null);
    setShowProfileDetails(false);
    setShowMoments(false);
    setShowComposerActions(false);
    setShowChatSettings(false);
    setSelectedMessageId(null);
    setMessageActionExpanded(false);
    setReplyTarget(null);
    const returnTo = searchParams.get("returnTo");

    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("chat");
    nextParams.delete("returnTo");
    setSearchParams(nextParams, { replace: true });
  };

  const minimizeProfileCard = () => {
    setProfileCardMinimizedMeta((current) => ({
      ...current,
      [active.id]: true
    }));
  };

  const expandProfileCard = () => {
    setProfileCardMinimizedMeta((current) => {
      if (!current[active.id]) {
        return current;
      }

      const next = { ...current };
      delete next[active.id];
      return next;
    });
  };

  const addMessage = (message: Omit<ChatMessage, "id" | "at">) => {
    const nextAt = getCurrentTime();
    const activityAt = Date.now();
    setMessages((current) => ({
      ...current,
      [active.id]: [
        ...(current[active.id] ?? []),
        {
          ...message,
          createdAt: activityAt,
          id: `${active.id}-${Date.now()}`,
          at: nextAt
        }
      ]
    }));
    setConversationActivityMeta((current) => ({
      ...current,
      [active.id]: activityAt
    }));
  };

  const sendText = () => {
    const messageText = clampMessageText(draft.trim());

    if (!messageText) {
      return;
    }

    addMessage({
      from: "me",
      type: "text",
      content: messageText,
      replyTo: replyTarget ? { author: replyTarget.author, avatar: replyTarget.avatar, content: replyTarget.content } : undefined
    });
    setDraft("");
    setReplyTarget(null);
  };

  const closeMessageActions = () => {
    setSelectedMessageId(null);
    setMessageActionExpanded(false);
    window.getSelection()?.removeAllRanges();
  };

  const closeChatFloatingUi = () => {
    if (showComposerActions) {
      setShowComposerActions(false);
    }

    if (selectedMessageId) {
      closeMessageActions();
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleChatPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest("[data-im-composer-root='true'], [data-im-message-action-sheet='true']")) {
      return;
    }

    if (selectedMessageId && hasActiveImMessageTextSelection(chatMessageRefs.current[selectedMessageId])) {
      return;
    }

    closeChatFloatingUi();
  };

  const getMessageAuthor = (message: ChatMessage) => {
    if (message.from === "me") {
      return "我";
    }

    if (message.from === "system") {
      return "系统";
    }

    return active.name;
  };

  const getMessageAvatar = (message: ChatMessage) => {
    if (message.from === "them") {
      return active.avatar;
    }

    if (message.from === "me") {
      if (context === "merchant") {
        return stores[0]?.cover;
      }

      if (context === "technician") {
        return technicians[0]?.avatar;
      }

      return customers[0]?.avatar;
    }

    return avatars.support;
  };

  const getChatMessagePreview = (message: ChatMessage) => {
    if (message.type === "recalled") {
      return message.from === "me" ? "你已经撤回" : "对方已经撤回";
    }

    if (message.type === "image") {
      return "[图片]";
    }

    if (message.type === "call") {
      return "[通话]";
    }

    if (message.type === "location") {
      return "[位置]";
    }

    if (message.type === "card") {
      return "[卡片]";
    }

    return message.content;
  };

  const openMessageActions = (message: ChatMessage) => {
    setShowComposerActions(false);
    setMessageActionExpanded(false);
    setSelectedMessageId(message.id);
    window.requestAnimationFrame(() => {
      const root = chatMessageRefs.current[message.id];
      const target = root?.querySelector<HTMLElement>("[data-im-message-selectable-text='true']");

      if (!target) {
        return;
      }

      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  const isOwnRecallableChatMessage = (message: ChatMessage) =>
    message.from === "me" && message.type !== "recalled";

  const isQuickRecallChatMessage = (message: ChatMessage) => {
    if (!message.createdAt) {
      return false;
    }

    return Date.now() - message.createdAt <= messageRecallTraceThresholdMs;
  };

  const scrollToChatMessage = (messageId: string) => {
    chatMessageRefs.current[messageId]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const removePinnedChatMessage = (messageId: string) => {
    setPinnedMessageIdsByConversation((current) => ({
      ...current,
      [active.id]: (current[active.id] ?? []).filter((item) => item !== messageId)
    }));
  };

  const togglePinnedChatMessage = (message: ChatMessage) => {
    setPinnedMessageIdsByConversation((current) => {
      const ids = current[active.id] ?? [];
      const nextIds = ids.includes(message.id)
        ? ids.filter((item) => item !== message.id)
        : [...ids.filter((messageId) => activeMessages.some((item) => item.id === messageId)), message.id].slice(-3);

      return {
        ...current,
        [active.id]: nextIds
      };
    });
    closeMessageActions();
  };

  const recallChatMessage = (message: ChatMessage) => {
    if (!isOwnRecallableChatMessage(message)) {
      return;
    }

    removePinnedChatMessage(message.id);

    setMessages((current) => {
      const currentMessages = current[active.id] ?? [];

      return {
        ...current,
        [active.id]: isQuickRecallChatMessage(message)
          ? currentMessages.filter((item) => item.id !== message.id)
          : currentMessages.map((item) => item.id === message.id ? { ...item, type: "recalled", content: "" } : item)
      };
    });
    closeMessageActions();
  };

  const toggleChatMessageReaction = (message: ChatMessage, reaction: string, closeAfter = true) => {
    setMessageReactions((current) => {
      const groups = current[message.id] ?? {};
      const people = groups[reaction] ?? [];
      const reactedByMe = people.some((person) => person.id === currentReactionPerson.id);
      const nextPeople = reactedByMe
        ? people.filter((person) => person.id !== currentReactionPerson.id)
        : [...people, currentReactionPerson];
      const nextGroups = { ...groups };
      const nextState = { ...current };

      if (nextPeople.length > 0) {
        nextGroups[reaction] = nextPeople;
      } else {
        delete nextGroups[reaction];
      }

      if (Object.keys(nextGroups).length > 0) {
        nextState[message.id] = nextGroups;
      } else {
        delete nextState[message.id];
      }

      return nextState;
    });
    if (closeAfter) {
      closeMessageActions();
    }
  };

  const getChatMessageReactionSummaries = (messageId: string): ImMessageReactionSummary[] =>
    Object.entries(messageReactions[messageId] ?? {}).map(([emoji, people]) => ({
      emoji,
      people: people.map((person) => (person.id === currentReactionPerson.id ? currentReactionPerson : person)),
      reactedByMe: people.some((person) => person.id === currentReactionPerson.id)
    }));

  const copyChatMessageContent = (message: ChatMessage) => {
    const root = chatMessageRefs.current[message.id];
    const selection = window.getSelection();
    const selectedContent = selection && !selection.isCollapsed && root && selection.anchorNode && selection.focusNode && root.contains(selection.anchorNode) && root.contains(selection.focusNode)
      ? selection.toString().trim()
      : "";
    navigator.clipboard?.writeText(selectedContent || message.content).catch(() => undefined);
    closeMessageActions();
  };

  const getChatMessageActions = (message: ChatMessage) => {
    const canRecall = isOwnRecallableChatMessage(message);
    const pinned = pinnedMessageIds.includes(message.id);
    const primaryActions: ImMessageActionSheetItem[] = [
      {
        key: "reply",
        label: "回复",
        icon: "reply",
        onClick: () => {
          setReplyTarget({ id: message.id, author: getMessageAuthor(message), avatar: getMessageAvatar(message), content: message.content });
          closeMessageActions();
        }
      },
      {
        key: "forward",
        label: "转发",
        icon: "forward",
        onClick: closeMessageActions
      },
      {
        key: "translate",
        label: "翻译",
        icon: "translate",
        onClick: closeMessageActions
      },
      {
        key: "copy",
        label: "复制",
        icon: "copy",
        onClick: () => copyChatMessageContent(message)
      },
      {
        key: "multi-select",
        label: "多选",
        icon: "select",
        onClick: closeMessageActions
      },
      {
        key: "pin-message",
        label: pinned ? "取消信息置顶" : "信息置顶",
        icon: "pin",
        onClick: () => togglePinnedChatMessage(message)
      },
      {
        key: "recall",
        label: "撤回",
        icon: "delete",
        disabled: !canRecall,
        onClick: () => recallChatMessage(message)
      },
      {
        key: "delete-local",
        label: "删除",
        icon: "delete",
        tone: "danger",
        onClick: () => {
          setMessages((current) => ({
            ...current,
            [active.id]: (current[active.id] ?? []).filter((item) => item.id !== message.id)
          }));
          removePinnedChatMessage(message.id);
          closeMessageActions();
        }
      }
    ];

    return { primaryActions, listActions: [] };
  };

  const getTranslatedMomentText = (content: string) => {
    const primary = translateText(content, language);

    if (primary !== content) {
      return primary;
    }

    for (const fallbackLanguage of getTranslationLookupCandidates(language)) {
      if (fallbackLanguage === language) {
        continue;
      }

      const fallbackText = translateText(content, fallbackLanguage);

      if (fallbackText !== content) {
        return fallbackText;
      }
    }

    return content;
  };

  const uploadImage = (fileName?: string) => {
    addMessage({ from: "me", type: "image", content: fileName ? `已上传图片：${fileName}` : "已上传现场图片" });
  };

  const callContact = () => {
    addMessage({
      from: "system",
      type: "call",
      content: canShowPhone ? `已发起门店电话联系：${active.phone}` : `已通过平台内通话联系：${active.name}`
    });
  };

  const sendOrderCard = () => {
    addMessage({
      from: "me",
      type: "card",
      content: `${active.order.orderNo} · ${active.order.itemName} · ${active.order.bookedAt} · ${yen(active.order.amount)}`
    });
  };

  const sendLocation = () => {
    addMessage({ from: "me", type: "location", content: `${active.order.city}${active.order.area} · 已发送定位` });
  };

  const sendIntro = () => {
    addMessage({ from: "me", type: "card", content: `已发送我的介绍资料给 ${active.name}。` });
    setShowComposerActions(false);
  };

  const sendPayment = () => {
    addMessage({ from: "me", type: "card", content: `已发送支付方式与结算说明给 ${active.name}。` });
    setShowComposerActions(false);
  };

  const startVoiceInput = () => {
    addMessage({ from: "system", type: "text", content: "已启动语音输入。" });
  };

  const startCameraCapture = () => {
    addMessage({ from: "system", type: "text", content: "已打开拍摄入口。" });
    setShowComposerActions(false);
  };

  const startVideoCall = () => {
    addMessage({ from: "system", type: "call", content: `已发起与 ${active.name} 的视频通话。` });
    setShowComposerActions(false);
  };

  const moveToBlacklist = () => {
    setGroups((current) =>
      current.map((group) => (
        group.locked
          ? group
          : { ...group, conversationIds: group.conversationIds.filter((id) => id !== active.id) }
      ))
    );
    addMessage({ from: "system", type: "text", content: "已从关注与自定义分组中移除，该联系人会保留在非关注列表中。" });
  };

  const toggleId = (id: string, setter: (value: (current: string[]) => string[]) => void) => {
    setter((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleMomentLike = (postId: string) => {
    setLikedPostIds((current) => (current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]));
  };

  const replyMoment = (postId: string) => {
    setMomentReplies((current) => ({
      ...current,
      [postId]: [...(current[postId] ?? []), "已收到，我会进一步确认。"]
    }));
  };

  const forwardMomentToCurrentChat = (post: MomentPost) => {
    addMessage({
      from: "me",
      type: "card",
      content: `【动态转发】${post.title} · ${post.at}\n${post.content}`
    });
    setShowMoments(false);
  };

  const toggleTranslationAssistant = () => {
    toggleId(active.id, setTranslationAssistantIds);
  };

  const togglePinnedConversation = (conversationId: string) => {
    setPinnedConversationMeta((current) => {
      if (current[conversationId]) {
        const next = { ...current };
        delete next[conversationId];
        return next;
      }

      return {
        ...current,
        [conversationId]: Date.now()
      };
    });
  };

  const saveConversationProfileNote = () => {
    setConversationProfileMeta((current) => ({
      ...current,
      [active.id]: {
        note: profileNoteDraft.trim(),
        tags: current[active.id]?.tags ?? []
      }
    }));
  };

  const addConversationProfileTag = () => {
    const nextLabel = profileTagLabelDraft.trim();

    if (!nextLabel) {
      return;
    }

    setConversationProfileMeta((current) => {
      const currentMeta = current[active.id] ?? { note: "", tags: [] };

      return {
        ...current,
        [active.id]: {
          note: currentMeta.note,
          tags: [
            ...currentMeta.tags,
            {
              id: `${active.id}-${Date.now()}`,
              icon: profileTagIconDraft,
              label: nextLabel
            }
          ]
        }
      };
    });
    setProfileTagLabelDraft("");
  };

  const removeConversationProfileTag = (tagId: string) => {
    setConversationProfileMeta((current) => {
      const currentMeta = current[active.id] ?? { note: "", tags: [] };

      return {
        ...current,
        [active.id]: {
          note: currentMeta.note,
          tags: currentMeta.tags.filter((tag) => tag.id !== tagId)
        }
      };
    });
  };

  const clearConversationHistory = () => {
    setMessages((current) => ({
      ...current,
      [active.id]: [
        {
          id: `${active.id}-history-cleared-${Date.now()}`,
          from: "system",
          type: "text",
          content: "聊天记录已清空，保留当前会话入口。",
          at: getCurrentTime()
        }
      ]
    }));
    setShowChatSettings(false);
  };

  const openChatSearchResult = (label: string) => {
    addMessage({
      from: "system",
      type: "text",
      content: `已打开${label}筛选，准备查看和 ${active.name} 的对应内容。`
    });
    setShowChatSettings(false);
  };

  const triggerWorkspaceAction = (label: string) => {
    addMessage({
      from: "system",
      type: "text",
      content: `已打开${label}面板，后续会继续与当前聊天保持联动。`
    });
    setShowChatSettings(false);
  };

  const isPinned = Boolean(pinnedConversationMeta[active.id]);
  const isMuted = mutedIds.includes(active.id);
  const isFlagged = followUpIds.includes(active.id);
  const hasTranslationAssistant = translationAssistantIds.includes(active.id);
  const isGroupConversation = Boolean(active.isGroupChat);
  const chatSurfaceClass = isNight ? "text-white" : "text-ink";
  const chatWallpaperFilter = isNight ? undefined : "invert(1) saturate(0.88) contrast(0.92) brightness(1.04)";
  const chatWallpaperOverlay = isNight
    ? "linear-gradient(180deg, rgba(4,4,4,0.04) 0%, rgba(4,4,4,0.12) 18%, rgba(4,4,4,0.24) 46%, rgba(4,4,4,0.62) 100%)"
    : "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.14) 18%, rgba(255,255,255,0.22) 46%, rgba(255,255,255,0.54) 100%)";
  const chatHeaderClass = isNight ? "border-[#3d3018]/55 bg-[#0b0907]/95 text-white backdrop-blur-xl" : "border-line bg-white/95 text-ink backdrop-blur-xl";
  const chatMutedTextClass = isNight ? "text-[#f7ead0]/55" : "text-ink/45";
  const chatActionButtonClass = isNight
    ? "border-[#4b3a1d]/55 bg-[#17130f] text-[#f7ead0]/82 hover:border-[#f3cf78]/55 hover:text-[#f3cf78]"
    : "border-line bg-white text-ink/75 hover:border-[#4ea487]/35 hover:text-moss";
  const chatMessageAreaClass = isNight ? "bg-[rgba(10,8,7,0.18)] backdrop-blur-[1.5px]" : "bg-[rgba(239,244,240,0.18)] backdrop-blur-[1.5px]";
  const orderSummaryClass = isNight ? "border border-[#6c5422]/55 bg-[#21180e] text-[#f3cf78]" : "bg-[#efe3bf] text-[#725317]";
  const themBubbleClass = isNight ? "border border-[#322716]/55 bg-[#171411] text-[#fbf4e8]" : "border border-line bg-white text-ink";
  const meBubbleClass = isNight ? "border border-[#7d6125]/65 bg-[#2a2112] text-[#fff5df]" : "bg-moss text-white";
  const systemBubbleClass = isNight ? "border border-[#2d2518]/45 bg-[#11100e] text-[#f7ead0]/68" : "bg-[#ede3c7] text-ink/68";
  const settingsPanelClass = isNight ? "border-[#45361c]/55 bg-[#15120f]" : "border-line bg-white";
  const listSectionClass = isNight ? "border-[#45361c]/55 bg-[#15120f] text-white shadow-soft" : "border-line bg-white text-ink shadow-panel";
  const listMutedTextClass = isNight ? "text-[#f7ead0]/46" : "text-ink/45";
  const quickHeaderButtonClass = isNight ? "bg-[#17130f] text-[#f3cf78] border border-[#45361c]/55 shadow-soft" : "bg-paper text-ink shadow-panel";
  const groupCardActiveClass = isNight ? "border-[#f3cf78]/35 bg-[#22190f] text-[#fff4de]" : "border-moss bg-moss text-white";
  const groupCardInactiveClass = isNight ? "border-[#45361c]/55 bg-[#12100d] text-white" : "border-line bg-paper text-ink";
  const groupIconShellClass = isNight ? "bg-[#0f0d0a] text-[#f3cf78]" : "bg-[#171717] text-lemon";
  const conversationListClass = isNight ? "divide-[#2b2318] border-[#3d3018]/45 bg-[#100e0c]" : "divide-line border-line bg-white";
  const conversationRowClass = isNight ? "bg-[#14110f] hover:bg-[#1c1712]" : "bg-white hover:bg-paper";
  const conversationMetaClass = isNight ? "text-[#f7ead0]/52" : "text-ink/50";
  const conversationPreviewClass = isNight ? "text-[#f7ead0]/36" : "text-ink/40";
  const creatorPageClass = isNight ? "bg-[#090806] text-white" : "bg-paper text-ink";
  const creatorPanelClass = isNight ? "border-[#3d3018]/55 bg-[#14110f] text-white shadow-soft" : "border-line bg-white shadow-panel";
  const creatorFieldClass = isNight ? "border-[#3d3018]/55 bg-[#0f0d0a] text-white placeholder:text-white/28" : "border-line bg-paper text-ink";
  const chatHeaderActionClass = cn("focus-ring grid h-10 w-10 place-items-center rounded-full border transition", chatActionButtonClass);
  const composerActions: MobileChatComposerAction[] = [
    { key: "image", label: "照片", accept: "image/*", onFileSelect: (fileName) => {
      uploadImage(fileName);
      setShowComposerActions(false);
    } },
    { key: "camera", label: "拍摄", onClick: startCameraCapture },
    { key: "videoCall", label: "视频通话", onClick: startVideoCall },
    { key: "call", label: "语音通话", onClick: callContact },
    { key: "location", label: "位置", onClick: sendLocation },
    { key: "order", label: "订单", onClick: sendOrderCard },
    { key: "intro", label: "介绍", onClick: sendIntro },
    { key: "payment", label: "支付", onClick: sendPayment }
  ];

  return (
    <div className="space-y-4 overflow-x-hidden">
      <section className={cn("rounded-[28px] border p-3", listSectionClass)}>
        <div className="mb-3 flex items-center justify-end gap-2">
          <div className="flex items-center gap-2">
            <button
              className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", quickHeaderButtonClass)}
              onClick={openContactCreator}
              type="button"
              aria-label="添加好友"
            >
              <HeaderActionIcon name="contact" />
            </button>
            <button
              className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", quickHeaderButtonClass)}
              onClick={openGroupChatCreator}
              type="button"
              aria-label="发起群聊"
            >
              <HeaderActionIcon name="groupChat" />
            </button>
          </div>
        </div>
        <div
          className="scrollbar-none flex gap-2 overflow-x-auto pb-1 cursor-grab active:cursor-grabbing"
          ref={groupScrollRef}
          style={{ touchAction: "pan-y" }}
          {...groupDragScrollProps}
        >
          {groups.map((group) => (
            <button
              className={cn(
                "relative flex shrink-0 items-center gap-2 rounded-[22px] border px-3 py-2 text-left shadow-panel transition",
                activeGroupId === group.id ? groupCardActiveClass : groupCardInactiveClass
              )}
              key={group.id}
              onClick={() => selectGroup(group)}
              type="button"
            >
              <span className={cn("grid h-12 w-12 place-items-center rounded-[16px]", groupIconShellClass)}>
                <ContactGroupIcon id={group.id} label={group.name} />
              </span>
              <span>
                <strong className="block text-sm">{group.name}</strong>
                <span className={cn("text-xs", activeGroupId === group.id ? (isNight ? "text-[#fff4de]/62" : "text-white/70") : listMutedTextClass)}>
                  {(group.id === allGroupId ? conversations.length : group.conversationIds.length)} 个会话
                </span>
              </span>
              {getGroupUnreadCount(group) > 0 && (
                <NotificationBadge className="absolute right-2 top-2" count={getGroupUnreadCount(group)} />
              )}
            </button>
          ))}
          <button
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-[22px] border border-dashed px-3 py-2 text-left shadow-panel transition",
              isNight ? "border-[#544221]/65 bg-[#12100d] text-white" : "border-line bg-paper text-ink"
            )}
            onClick={addGroup}
            type="button"
          >
            <span className={cn("grid h-12 w-12 place-items-center rounded-[16px]", groupIconShellClass)}>
              <span className="text-2xl font-black leading-none">+</span>
            </span>
            <span>
              <strong className="block text-sm">添加自定义分组</strong>
              <span className={cn("text-xs", listMutedTextClass)}>放在最后方便追加</span>
            </span>
          </button>
        </div>
      </section>

      {!isChatOpen && (
        <section className={cn("rounded-[28px] border p-3", listSectionClass)}>
          <SectionTitle caption={`${activeGroup.name} · 点击会话进入聊天窗口`} title="会话列表" />

          {visibleConversations.length > 0 ? (
            <div className={cn("mt-3 divide-y overflow-hidden rounded-[24px] border", conversationListClass)}>
              {visibleConversations.map((conversation) => {
                const lastMessage = messages[conversation.id]?.at(-1);
                const unread = readIds.includes(conversation.id) ? 0 : conversation.unread;
                const isDragging = draggingConversationId === conversation.id;
                const offset = isDragging ? dragOffset : swipedConversationId === conversation.id ? -conversationActionRevealWidth : 0;

                return (
                  <div
                    className={cn("relative overflow-hidden", isNight ? "bg-[#14110f]" : "bg-white")}
                    key={conversation.id}
                    onPointerCancel={(event) => endConversationSwipe(event.pointerId)}
                    onPointerDown={(event) => startConversationSwipe(event, conversation.id)}
                    onPointerMove={moveConversationSwipe}
                    onPointerUp={(event) => endConversationSwipe(event.pointerId)}
                    style={{ touchAction: "pan-y" }}
                  >
                    <div className="absolute inset-y-0 right-0 flex items-stretch justify-end bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)]" style={{ width: `${conversationActionRevealWidth}px` }}>
                      <button
                        className={cn(
                          "w-24 text-sm font-black transition",
                          pinnedConversationMeta[conversation.id]
                            ? "bg-[color:color-mix(in_srgb,var(--client-primary)_82%,black)] text-[color:var(--client-needo-text)]"
                            : "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]"
                        )}
                        onClick={() => {
                          togglePinnedConversation(conversation.id);
                          setSwipedConversationId(null);
                          setDragOffset(0);
                        }}
                        type="button"
                      >
                        {pinnedConversationMeta[conversation.id] ? "取消置顶" : "置顶"}
                      </button>
                      <button
                        className="w-24 bg-[#e25555] text-sm font-black text-white"
                        onClick={() => requestDeleteConversation(conversation)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                    <button
                      className={cn("relative z-10 w-full p-3 text-left transition", conversationRowClass)}
                      onClick={() => {
                        if (skipNextConversationClickId.current === conversation.id) {
                          skipNextConversationClickId.current = null;
                          return;
                        }

                        if (swipedConversationId === conversation.id) {
                          setSwipedConversationId(null);
                          return;
                        }

                        openConversation(conversation.id);
                      }}
                      style={{
                        transform: `translateX(${offset}px)`,
                        transition: isDragging ? "none" : "transform 180ms ease",
                        touchAction: "pan-y"
                      }}
                      type="button"
                    >
                      <ConversationListItem
                        avatar={conversation.avatar}
                        meta={`${pinnedConversationMeta[conversation.id] ? "置顶 · " : ""}${followUpIds.includes(conversation.id) ? "待跟进 · " : ""}${mutedIds.includes(conversation.id) ? "免打扰 · " : ""}${conversation.role} · ${conversation.order.itemName}`}
                        metaClassName={cn("truncate text-xs", conversationMetaClass)}
                        preview={lastMessage?.content ?? "暂无信息"}
                        previewClassName={cn("truncate text-xs", conversationPreviewClass)}
                        sideText={lastMessage?.at ?? ""}
                        sideTextClassName={cn("text-[11px]", conversationPreviewClass)}
                        title={conversation.name}
                        titleClassName="text-sm font-black"
                        unreadCount={unread}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={cn("mt-3 rounded-[22px] p-4 text-sm leading-6", isNight ? "bg-[#0f0d0a] text-[#f7ead0]/58" : "bg-paper text-ink/55")}>
              <strong className={cn("block", isNight ? "text-white" : "text-ink")}>暂无会话</strong>
              {copy.empty}
            </div>
          )}
        </section>
      )}

      {deletePrompt && (
        <div className="fixed inset-0 z-[55] bg-black/35 px-4 py-8">
          <section className={cn("mx-auto mt-28 w-full max-w-[360px] rounded-[28px] p-4 shadow-soft", creatorPanelClass)}>
            <p className="text-xs font-bold text-coral">删除会话</p>
            <h3 className="mt-2 text-lg font-black">要删除和 {deletePrompt.name} 的会话吗？</h3>
            <p className="mt-2 text-sm leading-6 text-ink/55">
              删除后，这个会话会从当前端口的会话列表里移除。{conversations.length <= 1 ? "当前至少需要保留 1 个会话。" : "聊天记录也会一并从本地演示数据中移除。"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setDeletePrompt(null)}>
                取消
              </Button>
              <Button disabled={conversations.length <= 1} variant="danger" onClick={confirmDeleteConversation}>
                确认删除
              </Button>
            </div>
          </section>
        </div>
      )}

      {showContactCreator && (
        <div className={cn("fixed inset-0 z-[55]", creatorPageClass)}>
          <section className={cn("safe-screen-shell mx-auto flex h-full w-full max-w-[480px] flex-col shadow-soft", creatorPageClass)}>
            <MobileFullscreenHeader
              info="输入对方 ID、名字，或用二维码添加好友"
              onClose={() => setShowContactCreator(false)}
              title="添加新好友"
              dark={isNight}
              className={chatHeaderClass}
            />
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <section className={cn("rounded-[28px] border p-4", creatorPanelClass)}>
                <div className="grid gap-3">
                  <label>
                    <span className={cn("mb-1 block text-xs font-black", listMutedTextClass)}>联系人 ID / 名字</span>
                    <input
                      className={cn("h-11 w-full rounded-2xl border px-3 text-sm font-bold outline-none", creatorFieldClass)}
                      onChange={(event) => setContactQuery(event.target.value)}
                      placeholder="输入 u / b / s 开头 ID，或名字搜索"
                      value={contactQuery}
                    />
                  </label>
                  <div className="grid gap-2 min-[380px]:grid-cols-2">
                    <button
                      className={cn("flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-black", chatActionButtonClass)}
                      onClick={simulateQrScan}
                      type="button"
                    >
                      <HeaderActionIcon name="scan" />
                      <span className="min-w-0">模拟添加好友二维码</span>
                    </button>
                    <button
                      className={cn("flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-black", chatActionButtonClass)}
                      onClick={simulateDineInScan}
                      type="button"
                    >
                      <HeaderActionIcon name="scan" />
                      <span className="min-w-0">模拟点餐二维码</span>
                    </button>
                  </div>
                </div>
              </section>

              {scannedCandidate && (
                <section className={cn("mt-4 rounded-[28px] border p-4", creatorPanelClass)}>
                  <p className="text-xs font-black text-moss">扫码识别结果</p>
                  <button
                    className="mt-3 flex w-full items-center gap-3 rounded-lg bg-paper p-3 text-left"
                    onClick={() => addContact(scannedCandidate)}
                    type="button"
                  >
                    <AvatarImage alt={scannedCandidate.name} className="h-12 w-12" src={scannedCandidate.avatar} />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{scannedCandidate.name}</strong>
                      <p className="mt-1 truncate text-xs text-ink/50">{getConversationSystemId(scannedCandidate) || "无系统 ID"} · {scannedCandidate.role}</p>
                    </div>
                    <span className="text-sm font-black text-moss">加好友</span>
                  </button>
                </section>
              )}

              <section className={cn("mt-4 rounded-[28px] border p-4", creatorPanelClass)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black">搜索结果</h3>
                    <p className={cn("mt-1 text-xs", listMutedTextClass)}>找到好友后，点击资料卡即可加入聊天列表。</p>
                  </div>
                  <Badge tone="yellow">{filteredContactCandidates.length} 人</Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {filteredContactCandidates.length > 0 ? filteredContactCandidates.map((contact) => (
                    <button
                      className={cn("flex w-full items-center gap-3 rounded-[22px] p-3 text-left", isNight ? "bg-[#0f0d0a]" : "bg-paper")}
                      key={contact.id}
                      onClick={() => addContact(contact)}
                      type="button"
                    >
                      <AvatarImage alt={contact.name} className="h-12 w-12" src={contact.avatar} />
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{contact.name}</strong>
                        <p className={cn("mt-1 truncate text-xs", conversationMetaClass)}>{getConversationSystemId(contact) || "无系统 ID"} · {contact.role}</p>
                        <p className={cn("mt-1 truncate text-xs", conversationPreviewClass)}>{contact.order.itemName}</p>
                      </div>
                      <span className={cn("text-lg font-black", listMutedTextClass)}>+</span>
                    </button>
                  )) : (
                    <div className={cn("rounded-[22px] p-4 text-sm leading-6", isNight ? "bg-[#0f0d0a] text-[#f7ead0]/58" : "bg-paper text-ink/55")}>
                      <strong className={cn("block", isNight ? "text-white" : "text-ink")}>没有匹配的好友</strong>
                      试试输入完整 ID、名字，或者直接扫描对方二维码。
                    </div>
                  )}
                </div>
              </section>
            </main>
          </section>
        </div>
      )}

      {showGroupChatCreator && (
        <div className={cn("fixed inset-0 z-[56]", creatorPageClass)}>
          <section className={cn("safe-screen-shell mx-auto flex h-full w-full max-w-[480px] flex-col shadow-soft", creatorPageClass)}>
            <MobileFullscreenHeader
              action={(
                <button
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-black transition",
                    selectedGroupChatIds.length > 0 ? "bg-moss text-white" : "bg-paper text-ink/35"
                  )}
                  disabled={selectedGroupChatIds.length === 0}
                  onClick={createGroupChat}
                  type="button"
                >
                  完成
                </button>
              )}
              info="从联系人列表中选择成员，至少 1 人即可创建"
              onClose={() => setShowGroupChatCreator(false)}
              title="发起群聊"
              dark={isNight}
              className={chatHeaderClass}
            />
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <section className={cn("rounded-[28px] border p-4", creatorPanelClass)}>
                <label>
                  <span className={cn("mb-1 block text-xs font-black", listMutedTextClass)}>搜索联系人</span>
                  <input
                    className={cn("h-11 w-full rounded-2xl border px-3 text-sm font-bold outline-none", creatorFieldClass)}
                    onChange={(event) => setGroupChatQuery(event.target.value)}
                    placeholder="按名字或 ID 搜索"
                    value={groupChatQuery}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="yellow">已选择 {selectedGroupChatIds.length} 人</Badge>
                  {selectedGroupChatIds.length > 0 ? (
                    <span className="text-xs text-ink/45">
                      {groupChatCandidates.filter((conversation) => selectedGroupChatIds.includes(conversation.id)).map((conversation) => conversation.name).join("、")}
                    </span>
                  ) : null}
                </div>
              </section>

              <section className={cn("mt-4 rounded-[28px] border p-4", creatorPanelClass)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black">联系人列表</h3>
                    <p className={cn("mt-1 text-xs", listMutedTextClass)}>参考微信的建群流程，勾选成员后点右上角完成。</p>
                  </div>
                  <Badge tone="green">{filteredGroupChatCandidates.length} 人</Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {filteredGroupChatCandidates.map((contact) => {
                    const checked = selectedGroupChatIds.includes(contact.id);

                    return (
                      <button
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                          checked
                            ? (isNight ? "border-[#f3cf78]/35 bg-[#22190f]" : "border-moss bg-[#edf7ef]")
                            : (isNight ? "border-[#3d3018]/55 bg-[#0f0d0a]" : "border-line bg-paper")
                        )}
                        key={contact.id}
                        onClick={() => toggleGroupChatMember(contact.id)}
                        type="button"
                      >
                        <span className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-black",
                          checked ? "border-moss bg-moss text-white" : "border-line bg-white text-transparent"
                        )}>
                          ✓
                        </span>
                        <AvatarImage alt={contact.name} className="h-12 w-12" src={contact.avatar} />
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-sm">{contact.name}</strong>
                          <p className="mt-1 truncate text-xs text-ink/50">{getConversationSystemId(contact) || "无系统 ID"} · {contact.role}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </main>
          </section>
        </div>
      )}

      {isChatOpen && (
        <div
          className={cn("im-conversation-room-shell fixed inset-0 z-50 overflow-hidden", chatSurfaceClass)}
          onPointerDownCapture={handleChatPointerDownCapture}
        >
          <div aria-hidden="true" className="im-conversation-wallpaper pointer-events-none absolute inset-0 overflow-hidden">
            <img
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              src={chatBgUrl}
              style={chatWallpaperFilter ? { filter: chatWallpaperFilter } : undefined}
            />
            <div className={cn("absolute inset-0", isNight ? "bg-black/10" : "bg-white/10")} />
            <div
              className="absolute inset-0"
              style={{
                background: chatWallpaperOverlay
              }}
            />
          </div>
          <section className="safe-screen-shell relative mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden shadow-soft">
            {showProfileDetails && activeDetailProfile ? (
              <EntityDetailPage
                dark={isNight}
                detail={activeDetailProfile}
                extraContent={(
                  <section className={cn("rounded-[22px] border p-4", isNight ? "border-[#3b2f18]/55 bg-[#100d0a]" : "border-line bg-paper")}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-black">备注与自定义标签</h3>
                      <span className={cn("text-[11px] font-bold", isNight ? "text-[#f7ead0]/46" : "text-ink/45")}>会跟随当前聊天保存</span>
                    </div>

                    <div className="mt-3 space-y-3">
                      <div className={cn("rounded-[18px] border p-3", isNight ? "border-[#302613]/55 bg-[#0c0a08]" : "border-line/80 bg-white")}>
                        <label className="block">
                          <span className={cn("mb-2 block text-xs font-bold", isNight ? "text-[#f7ead0]/46" : "text-ink/45")}>添加备注</span>
                          <textarea
                            className={cn(
                              "min-h-[96px] w-full rounded-[16px] border px-3 py-3 text-sm outline-none",
                              isNight
                                ? "border-[#3d3018]/55 bg-[#14110e] text-white placeholder:text-white/28"
                                : "border-line bg-paper text-ink placeholder:text-ink/30"
                            )}
                            onChange={(event) => setProfileNoteDraft(event.target.value)}
                            placeholder="记录这个联系人的合作习惯、备注或提醒事项"
                            value={profileNoteDraft}
                          />
                        </label>
                        <div className="mt-3 flex justify-end">
                          <Button onClick={saveConversationProfileNote} size="sm">
                            保存备注
                          </Button>
                        </div>
                      </div>

                      <div className={cn("rounded-[18px] border p-3", isNight ? "border-[#302613]/55 bg-[#0c0a08]" : "border-line/80 bg-white")}>
                        <span className={cn("mb-2 block text-xs font-bold", isNight ? "text-[#f7ead0]/46" : "text-ink/45")}>添加自定义标签</span>
                        <div className="grid grid-cols-4 gap-2">
                          {profileTagOptions.map((option) => (
                            <button
                              className={cn(
                                "rounded-[16px] border px-2 py-3 text-center transition",
                                profileTagIconDraft === option.id
                                  ? (isNight ? "border-[#f3cf78]/55 bg-[#241b10] text-[#f3cf78]" : "border-moss bg-moss/12 text-moss")
                                  : (isNight ? "border-[#3d3018]/55 bg-[#14110e] text-[#f7ead0]/68" : "border-line bg-paper text-ink/60")
                              )}
                              key={option.id}
                              onClick={() => setProfileTagIconDraft(option.id)}
                              type="button"
                            >
                              <span className="mx-auto grid h-9 w-9 place-items-center rounded-[12px] bg-black/10">
                                <ContactGroupIcon className="h-4 w-4" id={option.id} label={option.label} />
                              </span>
                              <span className="mt-2 block text-[11px] font-bold">{option.label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            className={cn(
                              "h-11 min-w-0 flex-1 rounded-[16px] border px-3 text-sm font-bold outline-none",
                              isNight
                                ? "border-[#3d3018]/55 bg-[#14110e] text-white placeholder:text-white/28"
                                : "border-line bg-paper text-ink placeholder:text-ink/30"
                            )}
                            onChange={(event) => setProfileTagLabelDraft(event.target.value)}
                            placeholder="输入标签名称"
                            value={profileTagLabelDraft}
                          />
                          <Button onClick={addConversationProfileTag} size="sm">
                            添加
                          </Button>
                        </div>

                        {activeConversationProfileMeta.tags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {activeConversationProfileMeta.tags.map((tag) => (
                              <button
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black",
                                  isNight ? "border-[#4b3a1d]/55 bg-[#14110e] text-[#f3cf78]" : "border-line bg-paper text-moss"
                                )}
                                key={tag.id}
                                onClick={() => removeConversationProfileTag(tag.id)}
                                type="button"
                              >
                                <span className="grid h-5 w-5 place-items-center rounded-[8px] bg-black/10">
                                  <ContactGroupIcon className="h-3.5 w-3.5" id={tag.icon} label={tag.label} />
                                </span>
                                <span>{tag.label}</span>
                                <span className={cn("text-[10px]", isNight ? "text-[#f7ead0]/55" : "text-ink/40")}>删除</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className={cn("mt-3 text-xs leading-5", isNight ? "text-[#f7ead0]/46" : "text-ink/45")}>还没有添加自定义标签。</p>
                        )}
                      </div>
                    </div>
                  </section>
                )}
                onClose={() => setShowProfileDetails(false)}
              />
            ) : showChatSettings ? (
              <>
                <MobileFullscreenHeader
                  action={(
                    <button
                      aria-label="分享聊天设置"
                      className={cn(
                        "focus-ring grid h-11 w-11 place-items-center rounded-full border transition",
                        chatActionButtonClass
                      )}
                      onClick={() => triggerWorkspaceAction("分享")}
                      type="button"
                    >
                      <ChatWindowActionIcon name="share" />
                    </button>
                  )}
                  className={chatHeaderClass}
                  dark={isNight}
                  onClose={() => setShowChatSettings(false)}
                  title="聊天详情"
                />
                <main className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4", chatMessageAreaClass)}>
                  <section className={cn("overflow-hidden rounded-[30px] border shadow-panel", settingsPanelClass)}>
                    <div className={cn("grid grid-cols-[minmax(0,1fr)_88px] gap-3 px-4 py-4", isNight ? "border-b border-[#3d3018]/45" : "border-b border-line")}>
                      <div className="flex min-w-0 items-center gap-3">
                        <AvatarImage alt={active.name} className="h-14 w-14" src={active.avatar} />
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-black">{active.name}</strong>
                          <p className={cn("mt-1 text-xs font-bold", chatMutedTextClass)}>{active.role}</p>
                        </div>
                      </div>
                      <button
                        aria-label="添加成员"
                        className={cn(
                          "focus-ring grid h-full min-h-[72px] w-full place-items-center rounded-[22px] border border-dashed transition",
                          isNight ? "border-[#5b4a25]/65 bg-[#14110e] text-[#f3cf78]" : "border-[#79b79b]/55 bg-[#f5faf7] text-moss"
                        )}
                        onClick={() => triggerWorkspaceAction("添加成员")}
                        type="button"
                      >
                        <ChatWindowActionIcon name="plus" />
                      </button>
                    </div>

                    {isGroupConversation && active.memberNames?.length ? (
                      <div className={cn("border-b px-4 py-3 text-xs leading-5", isNight ? "border-[#3d3018]/45 text-[#f7ead0]/46" : "border-line text-ink/45")}>
                        成员：{active.memberNames.join("、")}
                      </div>
                    ) : null}

                    <div className={cn("grid gap-0", isNight ? "bg-[#15120f]" : "bg-white")}>
                      <ChatSettingsRow
                        dark={isNight}
                        label="查找聊天内容"
                        onClick={() => openChatSearchResult("聊天内容")}
                      />
                      <ChatSettingsRow
                        dark={isNight}
                        label="消息免打扰"
                        trailing={<ChatSettingsToggle checked={isMuted} dark={isNight} onClick={() => toggleId(active.id, setMutedIds)} />}
                      />
                      <ChatSettingsRow
                        dark={isNight}
                        label="置顶聊天"
                        trailing={<ChatSettingsToggle checked={isPinned} dark={isNight} onClick={() => togglePinnedConversation(active.id)} />}
                      />
                      <ChatSettingsRow
                        dark={isNight}
                        label="提醒"
                        trailing={<ChatSettingsToggle checked={isFlagged} dark={isNight} onClick={() => toggleId(active.id, setFollowUpIds)} />}
                      />
                      <ChatSettingsRow
                        dark={isNight}
                        label="设置当前聊天背景"
                        onClick={() => triggerWorkspaceAction("设置聊天背景")}
                      />
                      <ChatSettingsRow
                        dark={isNight}
                        label="清空聊天记录"
                        onClick={clearConversationHistory}
                      />
                      <ChatSettingsRow
                        dark={isNight}
                        label="投诉"
                        onClick={() => triggerWorkspaceAction("投诉")}
                      />
                    </div>

                    <div className={cn("border-t px-4 py-3 text-[11px] font-bold", isNight ? "border-[#3d3018]/45 text-[#f7ead0]/46" : "border-line text-ink/45")}>
                      聊天 ID：{active.id}
                    </div>
                  </section>
                </main>
              </>
            ) : (
              <>
                <header className={cn("safe-header-top shrink-0 border-b px-4 pb-3", chatHeaderClass)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isProfileCardMinimized ? (
                          <button
                            aria-label="展开资料卡"
                            className={cn(
                              "avatar-frame grid h-8 w-8 shrink-0 place-items-center border transition",
                              isNight ? "border-[#4a3920]/55 bg-[#1a1a1a]" : "border-moss/18 bg-[#e9f5ef]"
                            )}
                            onClick={expandProfileCard}
                            type="button"
                          >
                            <AvatarImage alt={active.name} className="h-full w-full" src={active.avatar} />
                          </button>
                        ) : null}
                        <div className="min-w-0">
                          <div className="truncate text-base font-black">{active.name}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        aria-label="更多"
                        className={chatHeaderActionClass}
                        onClick={() => setShowChatSettings(true)}
                        type="button"
                      >
                        <ChatWindowActionIcon name="more" />
                      </button>
                      <MobileFullscreenCloseButton dark={isNight} onClose={closeChat} />
                    </div>
                  </div>
                </header>

                {!isProfileCardMinimized && (
                  <section className={cn("shrink-0 border-b px-3 py-3", chatHeaderClass)}>
                    <ChatConversationInfoCard
                      avatar={active.avatar}
                      dark={isNight}
                      kind={active.kind}
                      metricLabel={profileMetric.label}
                      metricValue={profileMetric.value}
                      name={active.name}
                      onOpenDetails={() => setShowProfileDetails(true)}
                      onMinimize={minimizeProfileCard}
                      subtitle={profileCardSubtitle}
                    />
                  </section>
                )}

                {pinnedMessages.length > 0 ? (
                  <section className={cn("shrink-0 border-b px-3 py-2", isNight ? "border-[#3d3018]/55 bg-[#0d0b09]/92" : "border-line bg-white/92")}>
                    <div className="space-y-1.5">
                      {pinnedMessages.map((message) => (
                        <div className={cn("flex min-w-0 items-center gap-2 rounded-[16px] px-2 py-2", isNight ? "bg-white/[0.06]" : "bg-black/[0.035]")} key={message.id}>
                          <button
                            className="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => scrollToChatMessage(message.id)}
                            type="button"
                          >
                            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[10px]", isNight ? "bg-white/[0.08] text-[#f3cf78]" : "bg-moss/12 text-moss")}>
                              <PinBadgeIcon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate text-[11px] font-black", chatMutedTextClass)}>信息置顶 · {getMessageAuthor(message)}</span>
                              <span className="mt-0.5 block truncate text-[13px] font-black">{getChatMessagePreview(message)}</span>
                            </span>
                          </button>
                          <button
                            aria-label="取消信息置顶"
                            className={cn("focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full transition", chatMutedTextClass, isNight ? "hover:bg-white/[0.06]" : "hover:bg-black/[0.06]")}
                            onClick={() => removePinnedChatMessage(message.id)}
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div
                  className={cn("im-conversation-scroll relative min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-scroll overscroll-y-contain px-4 py-5", chatMessageAreaClass, selectedMessage && "im-conversation-scroll--text-selecting")}
                  data-page-drag-ignore="true"
                  data-scroll-drag-ignore="true"
                  onClick={() => {
                    if (selectedMessageId && hasActiveImMessageTextSelection(chatMessageRefs.current[selectedMessageId])) {
                      return;
                    }

                    if (selectedMessage) {
                      closeMessageActions();
                    }
                  }}
                  onScroll={(event) => updateChatListNearBottom(event.currentTarget)}
                  ref={chatListRef}
                >
                  <div className={cn("relative z-10 mx-auto max-w-[88%] rounded-[18px] px-3 py-2 text-center text-[11px] font-bold leading-5", orderSummaryClass)}>
                    {active.order.orderNo} · {active.order.itemName} · {yen(active.order.amount)}
                  </div>
                  {activeMessages.map((message) => (
                    <div
                      className={cn("relative rounded-3xl transition", selectedMessage ? "z-20" : "z-10", selectedMessageId === message.id && (isNight ? "bg-white/[0.06]" : "bg-moss/10"))}
                      data-im-message-selected={selectedMessageId === message.id ? "true" : undefined}
                      key={message.id}
                      ref={(element) => {
                        chatMessageRefs.current[message.id] = element;
                      }}
                    >
                      {message.type === "recalled" ? (
                        <div className={cn("px-8 py-2 text-center text-xs font-bold", chatMutedTextClass)}>
                          {message.from === "me" ? "你已经撤回" : "对方已经撤回"}
                        </div>
                      ) : (
                      <ChatMessagePressable onOpenMenu={() => openMessageActions(message)}>
                        <div className={cn("flex", message.from === "me" ? "justify-end" : message.from === "system" ? "justify-center" : "justify-start")}>
                          <div className="min-w-0 max-w-[82%]">
                            <div
                              className={cn(
                                "min-w-0 max-w-full overflow-hidden rounded-[18px] px-3.5 py-2.5 text-sm shadow-panel",
                                message.from === "me" ? meBubbleClass : message.from === "system" ? systemBubbleClass : themBubbleClass
                              )}
                              data-im-message-bubble="true"
                            >
                              {message.replyTo ? (
                                <div className={cn("mb-2 border-b pb-2", message.from === "me" ? "border-white/[0.06] text-white/78" : isNight ? "border-white/[0.05] text-[#f7ead0]/58" : "border-black/[0.04] text-ink/52")}>
                                  <div className="flex min-w-0 items-center gap-2">
                                    {message.replyTo.avatar ? (
                                      <AvatarImage alt={message.replyTo.author} className="h-7 w-7 shrink-0" src={message.replyTo.avatar} />
                                    ) : (
                                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-[11px] font-black", message.from === "me" ? "bg-white/12" : isNight ? "bg-white/8" : "bg-black/[0.04]")}>
                                        {message.replyTo.author.slice(0, 1)}
                                      </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="line-clamp-1 text-[13px] font-black">{message.replyTo.author}</p>
                                      <p className="mt-0.5 line-clamp-1 whitespace-pre-line break-words text-[13px] leading-5 [overflow-wrap:anywhere]">{message.replyTo.content}</p>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                              <p className="min-w-0 max-w-full whitespace-pre-line break-words leading-6 [overflow-wrap:anywhere]" data-im-message-selectable-text="true">{message.content}</p>
                              <MobileChatReactionBar
                                dark={isNight}
                                mine={message.from === "me"}
                                onToggleReaction={(reaction) => toggleChatMessageReaction(message, reaction, false)}
                                reactions={getChatMessageReactionSummaries(message.id)}
                              />
                            </div>
                              <div className={cn("mt-1 flex items-center gap-1 text-[10px] font-bold", message.from === "me" ? "justify-end" : "justify-start", chatMutedTextClass)}>
                                <span>{message.at}</span>
                                {message.from === "me" ? (
                                <span className={cn("grid h-4 w-4 place-items-center rounded-full", isNight ? "bg-[#241c10] text-[#f3cf78]" : "bg-[#dcf3e8] text-moss")}>✓</span>
                                ) : null}
                              </div>
                          </div>
                        </div>
                      </ChatMessagePressable>
                      )}
                    </div>
                  ))}
                </div>

                {selectedMessage ? (
                  (() => {
                    const { primaryActions, listActions } = getChatMessageActions(selectedMessage);

                    return (
                      <ImMessageActionSheet
                        actions={primaryActions}
                        expanded={messageActionExpanded}
                        isNight={isNight}
                        listActions={listActions}
                        onClose={closeMessageActions}
                        onExpandedChange={setMessageActionExpanded}
                        onReact={(reaction) => toggleChatMessageReaction(selectedMessage, reaction)}
                      />
                    );
                  })()
                ) : (
                  <>
                    {replyTarget ? (
                      <div className={cn("shrink-0 border-t px-4 py-2 text-xs", isNight ? "border-[#3d3018]/55 bg-[#0b0907]/95 text-[#f7ead0]/58" : "border-line bg-white/95 text-ink/52")}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-black">回复 {replyTarget.author}</p>
                            <p className="mt-1 truncate">{replyTarget.content}</p>
                          </div>
                          <button className={cn("shrink-0 text-xs font-black", isNight ? "text-[#f3cf78]" : "text-moss")} onClick={() => setReplyTarget(null)} type="button">
                            取消
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <MobileChatComposer
                      actions={composerActions}
                      dark={isNight}
                      draft={draft}
                      onDraftChange={(value) => setDraft(clampMessageText(value))}
                      onEmoji={() => setDraft((current) => clampMessageText(`${current}😊`))}
                      onSend={sendText}
                      onToggleActions={() => setShowComposerActions((current) => !current)}
                      onVoice={startVoiceInput}
                      showActions={showComposerActions}
                    />
                  </>
                )}
              </>
            )}
          </section>

        {showMoments && (
          <div className="fixed inset-0 z-[60] bg-black/55">
            <FloatingTopRightControl className="z-[61]">
              <MobileFullscreenCloseButton
                dark
                onClose={() => {
                  setShowMoments(false);
                }}
              />
            </FloatingTopRightControl>
            <section className={cn("safe-screen-shell fixed inset-y-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 overflow-y-auto shadow-soft", creatorPageClass)}>
              <header className={cn("relative min-h-48 overflow-hidden text-white", isNight ? "bg-[#0f0d0a]" : "bg-ink")}>
                <img alt={active.name} className="absolute inset-0 h-full w-full object-cover opacity-45" src={active.avatar} />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-transparent" />
                <button
                  className="relative flex min-h-48 w-full items-end gap-3 p-4 text-left"
                  onClick={() => {
                    setShowMoments(false);
                    setShowProfileDetails(true);
                  }}
                  type="button"
                >
                  <AvatarImage alt={active.name} className="h-16 w-16 border-2 border-white" src={active.avatar} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-mint">动态</p>
                    <h2 className="truncate text-2xl font-black">{active.name}</h2>
                    <p className="mt-1 text-xs text-white/70">{active.role} · 推文、照片与服务记录</p>
                  </div>
                </button>
              </header>

              <div className={cn("space-y-3 p-3", isNight ? "bg-[#0d0b09]" : "bg-paper")}>
                <section className={cn("rounded-[28px] border p-3 shadow-panel", creatorPanelClass)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-ink/45">联系方式</p>
                      <strong className="mt-1 block text-sm">
                        {canShowPhone ? active.phone : "平台内通话"}
                      </strong>
                    </div>
                    <Button size="sm" onClick={callContact}>
                      通话
                    </Button>
                  </div>
                  {!canShowPhone && (
                    <p className={cn("mt-2 text-xs leading-5", listMutedTextClass)}>用户和技师号码已隐藏，只能通过 NeeDo 平台内通话联系。</p>
                  )}
                </section>

                {activeMoments.map((post) => (
                  <article className={cn("rounded-[28px] border p-3 shadow-panel", creatorPanelClass)} key={post.id}>
                    <div className="flex items-start gap-3">
                      <button className="shrink-0" onClick={() => {
                        setShowMoments(false);
                        setShowProfileDetails(true);
                      }} type="button">
                        <AvatarImage alt={active.name} className="h-10 w-10" src={active.avatar} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Badge tone={post.badge === "照片" ? "blue" : "green"}>{post.badge}</Badge>
                            <h3 className="mt-2 font-black">{post.title}</h3>
                          </div>
                          <span className="shrink-0 text-[11px] text-ink/40">{post.at}</span>
                        </div>
                        <p className={cn("mt-2 text-sm leading-6", isNight ? "text-[#f7ead0]/72" : "text-ink/65")}>
                          {post.content}
                        </p>
                        {translatedMomentIds.includes(post.id) && (
                          <div className={cn("mt-2 rounded-[18px] border px-3 py-2", isNight ? "border-[#3d3018]/45 bg-[#100e0c]" : "border-line bg-paper")}>
                            <p className="text-[11px] font-black text-moss">译文</p>
                            <p className={cn("mt-1 text-sm leading-6", isNight ? "text-[#f7ead0]/72" : "text-ink/65")}>{getTranslatedMomentText(post.content)}</p>
                          </div>
                        )}
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {post.images.map((image) => (
                            <button className="overflow-hidden rounded-lg" key={image} onClick={() => setPreviewMomentImage({ src: image, alt: post.title })} type="button">
                              <img alt={post.title} className="aspect-square w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(image)} />
                            </button>
                          ))}
                        </div>
                        <MomentActionBar
                          dark={isNight}
                          likeCount={(likedPostIds.includes(post.id) ? 1 : 0) + 6}
                          liked={likedPostIds.includes(post.id)}
                          onForward={() => forwardMomentToCurrentChat(post)}
                          onLike={() => toggleMomentLike(post.id)}
                          onReply={() => replyMoment(post.id)}
                          onTranslate={() => {
                            setTranslatedMomentIds((current) =>
                              current.includes(post.id) ? current.filter((id) => id !== post.id) : [...current, post.id]
                            );
                          }}
                          replyCount={(momentReplies[post.id]?.length ?? 0) + 1}
                          translated={translatedMomentIds.includes(post.id)}
                        />
                        {(likedPostIds.includes(post.id) || (momentReplies[post.id]?.length ?? 0) > 0) && (
                          <div className={cn("mt-3 rounded-[18px] p-2 text-xs leading-5", isNight ? "bg-[#100e0c] text-[#f7ead0]/65" : "bg-paper text-ink/60")}>
                            {likedPostIds.includes(post.id) && <p><strong className="text-moss">我</strong> 觉得很有用</p>}
                            {(momentReplies[post.id] ?? []).map((reply, index) => (
                              <p key={`${post.id}-reply-${index}`}><strong className="text-moss">我：</strong>{reply}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {previewMomentImage && (
          <div className="fixed inset-0 z-[70] bg-black/80">
            <button aria-label="关闭大图" className="absolute inset-0" onClick={() => setPreviewMomentImage(null)} type="button" />
            <FloatingTopRightControl className="z-[71]">
              <MobileFullscreenCloseButton dark onClose={() => setPreviewMomentImage(null)} />
            </FloatingTopRightControl>
            <div className="absolute left-1/2 top-1/2 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2">
              <img alt={previewMomentImage.alt} className="max-h-[82vh] w-full rounded-lg object-contain shadow-soft" src={previewMomentImage.src} />
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
