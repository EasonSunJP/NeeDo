import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { demoTechnicianAvatar, imageBank } from "../../data/mock";
import { useEntityStore } from "../../state/entityStore";
import { getCustomerLevelLabel } from "../../shared/profile-card/customerMembership";
import type { Customer, Store, Technician } from "../../types/domain";
import type {
  PostInteractionState,
  SocialComposerDraft,
  SocialCreatePostInput,
  SocialNotification,
  SocialPortalScope,
  SocialPost,
  SocialProfile,
  SocialProfileOverrides,
  SocialSearchResult,
  SocialState,
  SocialTimelineFilterTab,
  SocialUpdatePostInput
} from "./types";
import {
  canActorViewPost,
  filterTimelinePosts,
  isVisiblePost,
  postAuthorKey,
  resolveProfileAreaHints,
  type SocialTimelineLocationContext
} from "./timeline";
import {
  extractHashtags,
  extractMentions,
  isTransientMediaUrl,
  nextId,
  normalizeSocialPostMedia,
  parseProfileKey,
  profileMentionLabel,
  profileKey,
  sortPostsByNewest,
  sortPostsByOldest,
  unique
} from "./utils";

type SocialContextValue = {
  state: SocialState;
  profiles: Record<string, SocialProfile>;
  profileList: SocialProfile[];
  composerProfileKeys: string[];
  actorByScope: Record<SocialPortalScope, string>;
  getActorForScope: (scope: SocialPortalScope) => string;
  getPostById: (postId: string, actorKey?: string) => SocialPost | undefined;
  getTimeline: (tab: "for-you" | "following", actorKey: string) => SocialPost[];
  getTimelineFeed: (filter: SocialTimelineFilterTab, actorKey: string, locationContext?: SocialTimelineLocationContext) => SocialPost[];
  getReplies: (postId: string) => SocialPost[];
  getAncestors: (postId: string) => SocialPost[];
  getRelatedPosts: (postId: string) => SocialPost[];
  getProfilePosts: (profileKeyValue: string, tab: "posts" | "replies" | "media" | "likes", actorKey: string) => SocialPost[];
  getInteractionState: (postId: string, actorKey: string) => PostInteractionState;
  getFollowers: (profileKeyValue: string) => SocialProfile[];
  getFollowing: (profileKeyValue: string) => SocialProfile[];
  getNotifications: (recipientKey: string) => SocialNotification[];
  getUnreadNotificationCount: (recipientKey: string) => number;
  search: (query: string) => SocialSearchResult;
  getTagFeed: (tag: string) => SocialPost[];
  getTrendingTags: () => Array<{ tag: string; count: number }>;
  saveDraft: (draftKey: string, draft: SocialComposerDraft) => void;
  clearDraft: (draftKey: string) => void;
  createPost: (input: SocialCreatePostInput) => SocialPost;
  updatePost: (input: SocialUpdatePostInput) => SocialPost | undefined;
  deletePost: (postId: string, actorKey: string) => void;
  toggleLike: (postId: string, actorKey: string) => void;
  toggleBookmark: (postId: string, actorKey: string) => void;
  toggleRepost: (postId: string, actorKey: string) => SocialPost | undefined;
  markShared: (postId: string, actorKey: string) => void;
  toggleFollow: (actorKey: string, targetKey: string) => void;
  ensureMutualFollow: (leftKey: string, rightKey: string) => void;
  togglePinPost: (postId: string, actorKey: string) => void;
  updateProfileOverride: (profileKeyValue: string, overrides: SocialProfileOverrides) => void;
  incrementView: (postId: string) => void;
  markNotificationsRead: (recipientKey: string) => void;
  refreshFeeds: () => void;
};

const SocialContext = createContext<SocialContextValue | null>(null);
const storageKey = "needo.social.module.v2";

function clampCount(value: number) {
  return Math.max(0, value);
}

function addMinutes(base: number, minutes: number) {
  return new Date(base - minutes * 60000).toISOString();
}

const customerAreas = ["银座", "涩谷", "新宿", "惠比寿", "品川", "池袋"];
const legacyGeneratedImageMarkers = [
  "images.unsplash.com",
  "pngtree-relaxing-back-massage",
  "/images/original.webp",
  "/images/ac-cleaning.svg",
  "/images/家政",
  "/images/上门维修"
];
const persistedSocialImagePool = [
  imageBank.massage,
  imageBank.massageAlt,
  imageBank.cleaning,
  imageBank.cleaningAlt,
  imageBank.nail,
  imageBank.restaurant,
  imageBank.cafe,
  imageBank.home,
  imageBank.appliance,
  imageBank.repair,
  imageBank.moving,
  imageBank.pet,
  imageBank.care,
  imageBank.salon
];

function isLegacyGeneratedImage(value?: string) {
  return Boolean(value && legacyGeneratedImageMarkers.some((marker) => value.includes(marker)));
}

function migratePersistedSocialImage(value: string | undefined, index: number) {
  if (!value || !isLegacyGeneratedImage(value)) {
    return value;
  }

  return persistedSocialImagePool[index % persistedSocialImagePool.length] ?? value;
}

function migratePersistedSocialMedia(media: SocialPost["media"], seed = 0) {
  return media.map((item, index) => ({
    ...item,
    url: migratePersistedSocialImage(item.url, seed + index) ?? item.url,
    thumbnailUrl: migratePersistedSocialImage(item.thumbnailUrl, seed + index + 1)
  }));
}

function migratePersistedProfileOverrides(overrides: Record<string, SocialProfileOverrides>) {
  return Object.fromEntries(
    Object.entries(overrides).map(([key, override], index) => [
      key,
      {
        ...override,
        coverImage: migratePersistedSocialImage(override.coverImage, index)
      }
    ])
  );
}

function baseProfileFromCustomer(customer: Customer, index: number): SocialProfile {
  const displayName = customer.nickname?.trim() || customer.name;

  return {
    id: customer.id,
    entityType: "user",
    displayName,
    handle: displayName,
    avatar: customer.avatar,
    coverImage: index % 2 === 0 ? imageBank.home : imageBank.cafe,
    bio:
      customer.bio ||
      "公开记录真实体验、预约心得和现场反馈，让服务前的信息判断更透明。",
    location: `${customerAreas[index % customerAreas.length]} · 东京`,
    birthday: undefined,
    joinedAt: new Date(2022, index % 12, 5 + index).toISOString(),
    verifiedStatus: index === 0 ? "rising" : "none",
    followerCount: 0,
    followingCount: 0,
    extraProfileFields: {
      memberLevel: customer.memberLevel,
      memberLevelLabel: getCustomerLevelLabel(customer.activeScore),
      languages: customer.languages ?? ["日本語"],
      points: `${customer.points ?? 0}`,
      nextBookingAt: customer.nextBookingAt ?? "暂无安排",
      visibilityTags: customer.tags
    }
  };
}

function baseProfileFromStore(store: Store, index: number): SocialProfile {
  const coverImages = [store.cover, ...store.gallery].filter(Boolean);

  return {
    id: store.id,
    entityType: "shop",
    displayName: store.name,
    handle: store.name,
    avatar: store.cover,
    coverImage: coverImages[0] || imageBank.salon,
    coverImages,
    bio: store.description,
    location: `${store.area} · 东京`,
    joinedAt: new Date(2020, index % 12, 8 + index).toISOString(),
    verifiedStatus: "business",
    followerCount: 0,
    followingCount: 0,
    extraProfileFields: {
      openStatus: store.openStatus === "open" ? "营业中" : store.openStatus === "resting" ? "休息中" : "已打烊",
      address: store.address,
      bookAction: "立即预约",
      businessHours: store.businessHours,
      priceLabel: store.priceLabel,
      visibilityTags: [store.area, ...store.tags]
    },
    headline: `${store.area} · ${store.mode === "home" ? "到店 + 上门" : "门店预约"}`
  };
}

function baseProfileFromTechnician(technician: Technician, index: number): SocialProfile {
  const coverImages = [...(technician.gallery ?? []), technician.avatar].filter(Boolean);
  const displayName = technician.nickname?.trim() || technician.name;

  return {
    id: technician.id,
    entityType: "technician",
    displayName,
    handle: displayName,
    avatar: technician.avatar,
    coverImage: coverImages[0] || imageBank.massage,
    coverImages,
    bio:
      technician.bio ||
      "公开同步服务记录、空档更新和专业建议，让预约前的判断更轻松。",
    location: technician.serviceAreas[0] ? `${technician.serviceAreas[0]} · 东京` : "东京",
    birthday: technician.age ? `${Math.max(1, 2026 - Number.parseInt(technician.age, 10) || 28)}-05-01` : undefined,
    joinedAt: new Date(2021, index % 12, 11 + index).toISOString(),
    verifiedStatus: "verified",
    followerCount: 0,
    followingCount: 0,
    extraProfileFields: {
      serviceTags: technician.profileTags ?? technician.skills,
      bookingAction: "预约档期",
      nextAvailability: technician.status === "available" ? "今天可约" : technician.status === "busy" ? "稍后可约" : "离线中",
      languages: technician.languages,
      visibilityTags: [...(technician.profileTags ?? technician.skills), ...technician.skills, ...technician.serviceAreas]
    },
    headline: technician.identityLabel ?? "认证技师"
  };
}

type SocialProfileNameEntry = {
  profile: SocialProfile;
  fallbackNames: string[];
};

function normalizeAccountName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function accountNameKey(value: string) {
  return normalizeAccountName(value).toLowerCase();
}

function socialEntityName(entityType: SocialProfile["entityType"]) {
  return entityType === "shop" ? "店铺" : entityType === "technician" ? "技师" : "用户";
}

function makeUniqueSocialProfiles(entries: SocialProfileNameEntry[]) {
  const originalNameCounts = entries.reduce((counts, entry) => {
    const key = accountNameKey(entry.profile.displayName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const usedNames = new Set<string>();

  return entries.map(({ profile, fallbackNames }) => {
    const originalName = normalizeAccountName(profile.displayName);
    const hasDuplicateOriginal = (originalNameCounts.get(accountNameKey(originalName)) ?? 0) > 1;
    const candidates = [
      originalName,
      ...(hasDuplicateOriginal ? fallbackNames.map(normalizeAccountName) : []),
      `${originalName} ${socialEntityName(profile.entityType)}`,
      `${originalName} ${profile.id}`
    ].filter(Boolean);
    const displayName = candidates.find((candidate) => !usedNames.has(accountNameKey(candidate))) ?? `${originalName} ${profile.id}`;

    usedNames.add(accountNameKey(displayName));

    return {
      ...profile,
      displayName,
      handle: displayName
    };
  });
}

function buildBaseProfiles(customers: Customer[], stores: Store[], technicians: Technician[]) {
  const entries = [
    ...customers.map((customer, index) => ({
      profile: baseProfileFromCustomer(customer, index),
      fallbackNames: [customer.name]
    })),
    ...stores.map((store, index) => ({
      profile: baseProfileFromStore(store, index),
      fallbackNames: [store.name]
    })),
    ...technicians.map((technician, index) => ({
      profile: baseProfileFromTechnician(technician, index),
      fallbackNames: [technician.name]
    }))
  ];
  const profiles = makeUniqueSocialProfiles(entries);

  return Object.fromEntries(profiles.map((profile) => [profileKey(profile), profile]));
}

function mergeProfiles(
  baseProfiles: Record<string, SocialProfile>,
  profileOverrides: Record<string, SocialProfileOverrides>,
  follows: Record<string, string[]>
) {
  return Object.fromEntries(
    Object.entries(baseProfiles).map(([key, profile]) => {
      const override = profileOverrides[key];
      const followingCount = follows[key]?.length ?? 0;
      const followerCount = Object.values(follows).reduce((sum, next) => sum + Number(next.includes(key)), 0);

      return [
        key,
        {
          ...profile,
          ...override,
          coverImage: override?.coverImage ?? profile.coverImage,
          bio: override?.bio ?? profile.bio,
          location: override?.location ?? profile.location,
          birthday: override?.birthday ?? profile.birthday,
          joinedAt: override?.joinedAt ?? profile.joinedAt,
          verifiedStatus: override?.verifiedStatus ?? profile.verifiedStatus,
          extraProfileFields: {
            ...profile.extraProfileFields,
            ...(override?.extraProfileFields ?? {})
          },
          headline: override?.headline ?? profile.headline,
          pinnedPostId: override?.pinnedPostId ?? profile.pinnedPostId,
          followerCount,
          followingCount
        } satisfies SocialProfile
      ];
    })
  );
}

function buildSeedState(baseProfiles: Record<string, SocialProfile>, actorByScope: Record<SocialPortalScope, string>): SocialState {
  const profileList = Object.values(baseProfiles);
  const users = profileList.filter((profile) => profile.entityType === "user");
  const shops = profileList.filter((profile) => profile.entityType === "shop");
  const technicians = profileList.filter((profile) => profile.entityType === "technician");

  const userPrimary = users[0];
  const userSecondary = users[1] ?? users[0];
  const shopPrimary = shops[0];
  const shopSecondary = shops[1] ?? shops[0];
  const technicianPrimary = technicians[0];
  const technicianSecondary = technicians[1] ?? technicians[0];
  const userPrimaryArea = resolveProfileAreaHints(userPrimary)[0] ?? resolveProfileAreaHints(shopPrimary)[0] ?? "银座";
  const userSecondaryArea = resolveProfileAreaHints(userSecondary)[0] ?? resolveProfileAreaHints(shopPrimary)[0] ?? userPrimaryArea;
  const shopPrimaryArea = resolveProfileAreaHints(shopPrimary)[0] ?? "银座";
  const shopSecondaryArea = resolveProfileAreaHints(shopSecondary)[0] ?? shopPrimaryArea;
  const technicianPrimaryArea = resolveProfileAreaHints(technicianPrimary)[0] ?? "新宿";
  const technicianSecondaryArea = resolveProfileAreaHints(technicianSecondary)[0] ?? technicianPrimaryArea;

  const now = Date.now();
  const posts: SocialPost[] = [];

  const pushPost = (input: Omit<SocialPost, "id"> & { id?: string }) => {
    const post: SocialPost = {
      id: input.id ?? nextId("post"),
      ...input
    };

    posts.push(post);
    return post;
  };

  const post1 = pushPost({
    authorId: shopPrimary.id,
    authorType: "shop",
    text: "今晚 22:00 前的夜间预约窗口重新开放，先看现场环境和技师排班再下单会更稳。#夜间可约 #银座",
    media: [
      {
        id: nextId("media"),
        type: "image",
        url: shopPrimary.coverImage,
        alt: `${shopPrimary.displayName} 现场封面`
      }
    ],
    hashtags: ["夜间可约", "银座"],
    mentions: [],
    createdAt: addMinutes(now, 18),
    likeCount: 128,
    replyCount: 12,
    repostCount: 21,
    viewCount: 4812,
    bookmarkCount: 88,
    isPinned: true,
    visibility: "public",
    locationLabel: shopPrimaryArea,
    status: "published",
    postType: "announcement"
  });

  const post2 = pushPost({
    authorId: technicianPrimary.id,
    authorType: "technician",
    text: "今天重新拍了一版肩颈调理前的确认流程：先看压力点、再确认力度和需要避开的部位，第一次预约也不用紧张。#肩颈调理 #服务日常",
    media: [
      {
        id: nextId("media"),
        type: "video",
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        thumbnailUrl: imageBank.massageAlt,
        alt: "肩颈调理预约前确认流程短视频",
        durationLabel: "0:32"
      }
    ],
    hashtags: ["肩颈调理", "服务日常"],
    mentions: [],
    createdAt: addMinutes(now, 46),
    likeCount: 241,
    replyCount: 18,
    repostCount: 34,
    viewCount: 9302,
    bookmarkCount: 143,
    isPinned: false,
    visibility: "public",
    locationLabel: technicianPrimaryArea,
    status: "published",
    postType: "technician-daily"
  });

  const post3 = pushPost({
    authorId: userPrimary.id,
    authorType: "user",
    text: `这次下单前先看了 ${profileMentionLabel(shopPrimary)} 的现场图和 ${profileMentionLabel(technicianPrimary)} 的服务记录，判断速度快很多。引用给还在犹豫的人。`,
    media: [],
    hashtags: [],
    mentions: [shopPrimary.handle, technicianPrimary.handle],
    quotePostId: post2.id,
    createdAt: addMinutes(now, 93),
    likeCount: 76,
    replyCount: 6,
    repostCount: 8,
    viewCount: 2104,
    bookmarkCount: 23,
    isPinned: false,
    visibility: "public",
    locationLabel: userPrimaryArea,
    status: "published",
    postType: "quote"
  });

  const post4 = pushPost({
    authorId: technicianSecondary.id,
    authorType: "technician",
    text: `回复 ${profileMentionLabel(userPrimary)}：如果是第一次预约，备注语言、门禁和想要避开的力度点，沟通会快很多。`,
    media: [],
    hashtags: [],
    mentions: [userPrimary.handle],
    replyToPostId: post3.id,
    createdAt: addMinutes(now, 74),
    likeCount: 36,
    replyCount: 2,
    repostCount: 1,
    viewCount: 984,
    bookmarkCount: 10,
    isPinned: false,
    visibility: "public",
    locationLabel: technicianSecondaryArea,
    status: "published",
    postType: "reply"
  });

  const post5 = pushPost({
    authorId: shopSecondary.id,
    authorType: "shop",
    text: "本周末门店把休息区和换鞋区重新整理了一次，顺手放几张现场图。#店铺更新 #现场环境",
    media: [
      {
        id: nextId("media"),
        type: "image",
        url: shopSecondary.coverImage,
        alt: "店铺现场图 1"
      },
      {
        id: nextId("media"),
        type: "image",
        url: imageBank.cafe,
        alt: "店铺现场图 2"
      },
      {
        id: nextId("media"),
        type: "image",
        url: imageBank.salon,
        alt: "店铺现场图 3"
      }
    ],
    hashtags: ["店铺更新", "现场环境"],
    mentions: [],
    createdAt: addMinutes(now, 128),
    likeCount: 188,
    replyCount: 9,
    repostCount: 12,
    viewCount: 3380,
    bookmarkCount: 58,
    isPinned: false,
    visibility: "public",
    locationLabel: shopSecondaryArea,
    status: "published",
    postType: "post"
  });

  const post6 = pushPost({
    authorId: userSecondary.id,
    authorType: "user",
    text: `我把 ${profileMentionLabel(shopPrimary)} 这条公告转给朋友了，今晚真的还有位。`,
    media: [],
    hashtags: [],
    mentions: [shopPrimary.handle],
    repostPostId: post1.id,
    createdAt: addMinutes(now, 140),
    likeCount: 14,
    replyCount: 1,
    repostCount: 0,
    viewCount: 612,
    bookmarkCount: 2,
    isPinned: false,
    visibility: "public",
    locationLabel: userSecondaryArea,
    status: "published",
    postType: "repost"
  });

  const post7 = pushPost({
    authorId: technicianPrimary.id,
    authorType: "technician",
    text: "把今天的服务准备位和放松区整理成三张图：头像用于识别本人，现场图用于确认环境，护理图用于判断风格。#服务日常 #肩颈调理",
    media: [
      {
        id: nextId("media"),
        type: "image",
        url: demoTechnicianAvatar,
        alt: "Misaki 本人头像"
      },
      {
        id: nextId("media"),
        type: "image",
        url: imageBank.massageAlt,
        alt: "护理房间准备图"
      },
      {
        id: nextId("media"),
        type: "image",
        url: imageBank.care,
        alt: "放松护理流程图"
      }
    ],
    hashtags: ["服务日常", "肩颈调理"],
    mentions: [],
    createdAt: addMinutes(now, 190),
    likeCount: 152,
    replyCount: 11,
    repostCount: 17,
    viewCount: 2840,
    bookmarkCount: 79,
    isPinned: false,
    visibility: "public",
    locationLabel: technicianPrimaryArea,
    status: "published",
    postType: "technician-daily"
  });

  const post8 = pushPost({
    authorId: shopPrimary.id,
    authorType: "shop",
    text: `欢迎直接在动态里 ${profileMentionLabel(technicianPrimary)} 或 ${profileMentionLabel(technicianSecondary)} 询问空档，我们会在详情串里统一答复。#预约提醒`,
    media: [],
    hashtags: ["预约提醒"],
    mentions: [technicianPrimary.handle, technicianSecondary.handle],
    createdAt: addMinutes(now, 240),
    likeCount: 66,
    replyCount: 4,
    repostCount: 5,
    viewCount: 1390,
    bookmarkCount: 31,
    isPinned: false,
    visibility: "public",
    locationLabel: shopPrimaryArea,
    status: "published",
    postType: "post"
  });

  const post9 = pushPost({
    authorId: userPrimary.id,
    authorType: "user",
    text: "第一次使用时我最看重的是公开讨论区能不能直接看到真实回复，这版串联体验终于像一个真正的信息流产品了。#NeeDo体验",
    media: [],
    hashtags: ["NeeDo体验"],
    mentions: [],
    createdAt: addMinutes(now, 320),
    likeCount: 58,
    replyCount: 7,
    repostCount: 4,
    viewCount: 1188,
    bookmarkCount: 17,
    isPinned: false,
    visibility: "public",
    locationLabel: userPrimaryArea,
    status: "published",
    postType: "post"
  });

  const post10 = pushPost({
    authorId: technicianSecondary.id,
    authorType: "technician",
    text: `引用一下 ${profileMentionLabel(shopPrimary)} 的夜间预约公告，今晚我会补一个 21:30 的临时档。`,
    media: [],
    hashtags: [],
    mentions: [shopPrimary.handle],
    quotePostId: post1.id,
    createdAt: addMinutes(now, 12),
    likeCount: 44,
    replyCount: 3,
    repostCount: 6,
    viewCount: 722,
    bookmarkCount: 12,
    isPinned: false,
    visibility: "public",
    locationLabel: technicianSecondaryArea,
    status: "published",
    postType: "quote"
  });

  const follows: Record<string, string[]> = {
    [actorByScope.user]: unique([profileKey(shopPrimary), profileKey(technicianPrimary), profileKey(userSecondary)]),
    [actorByScope.merchant]: unique([profileKey(technicianPrimary), profileKey(userPrimary), profileKey(technicianSecondary)]),
    [actorByScope.technician]: unique([profileKey(shopPrimary), profileKey(userPrimary), profileKey(userSecondary)]),
    [profileKey(userSecondary)]: unique([profileKey(shopPrimary), profileKey(technicianPrimary)]),
    [profileKey(shopSecondary)]: unique([profileKey(technicianSecondary), profileKey(userPrimary)]),
    [profileKey(technicianSecondary)]: unique([profileKey(shopPrimary), profileKey(userPrimary)])
  };

  const profileOverrides: Record<string, SocialProfileOverrides> = {
    [profileKey(shopPrimary)]: {
      pinnedPostId: post1.id,
      extraProfileFields: {
        announcement: "夜间档期补开中",
        mediaFocus: "现场环境 / 门店公告 / 预约提醒"
      }
    },
    [profileKey(technicianPrimary)]: {
      pinnedPostId: post2.id,
      extraProfileFields: {
        serviceTags: technicians[0]?.extraProfileFields.serviceTags ?? [],
        recentAvailability: "今天 21:30 后可约"
      }
    }
  };

  const interactions: SocialState["interactions"] = {
    [actorByScope.user]: {
      [post1.id]: { postId: post1.id, liked: true, reposted: false, bookmarked: true, shared: false },
      [post2.id]: { postId: post2.id, liked: true, reposted: false, bookmarked: true, shared: false }
    },
    [actorByScope.merchant]: {
      [post2.id]: { postId: post2.id, liked: true, reposted: false, bookmarked: false, shared: false },
      [post3.id]: { postId: post3.id, liked: false, reposted: false, bookmarked: true, shared: false }
    },
    [actorByScope.technician]: {
      [post1.id]: { postId: post1.id, liked: true, reposted: true, bookmarked: false, shared: false },
      [post5.id]: { postId: post5.id, liked: true, reposted: false, bookmarked: true, shared: false }
    }
  };

  const notifications: SocialNotification[] = [
    {
      id: nextId("notice"),
      type: "follow",
      actorKey: profileKey(userSecondary),
      recipientKey: actorByScope.user,
      createdAt: addMinutes(now, 34),
      read: false,
      content: "开始关注你"
    },
    {
      id: nextId("notice"),
      type: "reply",
      actorKey: profileKey(technicianSecondary),
      recipientKey: actorByScope.user,
      postId: post3.id,
      createdAt: addMinutes(now, 30),
      read: false,
      content: "回复了你的动态"
    },
    {
      id: nextId("notice"),
      type: "quote",
      actorKey: profileKey(technicianSecondary),
      recipientKey: profileKey(shopPrimary),
      postId: post1.id,
      createdAt: addMinutes(now, 10),
      read: false,
      content: "引用了你的动态"
    },
    {
      id: nextId("notice"),
      type: "like",
      actorKey: profileKey(shopPrimary),
      recipientKey: actorByScope.technician,
      postId: post2.id,
      createdAt: addMinutes(now, 16),
      read: false,
      content: "点赞了你的动态"
    }
  ];

  return {
    posts: sortPostsByNewest(posts),
    follows,
    interactions,
    drafts: {},
    notifications: [...notifications].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    profileOverrides,
    refreshedAt: new Date().toISOString()
  };
}

function loadState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return null;
    }

    return sanitizeSocialStateForPersistence(JSON.parse(raw) as SocialState);
  } catch {
    return null;
  }
}

function stripTransientMedia(media: SocialPost["media"]) {
  return media.filter((item) => !isTransientMediaUrl(item.url) && !isTransientMediaUrl(item.thumbnailUrl));
}

function sanitizeSocialStateForPersistence(state: SocialState): SocialState {
  return {
    ...state,
    posts: state.posts.map((post) => ({
      ...post,
      media: normalizeSocialPostMedia(migratePersistedSocialMedia(stripTransientMedia(post.media)))
    })),
    drafts: Object.fromEntries(
      Object.entries(state.drafts).map(([draftKey, draft], index) => [
        draftKey,
        {
          ...draft,
          media: normalizeSocialPostMedia(migratePersistedSocialMedia(stripTransientMedia(draft.media), index))
        }
      ])
    ),
    profileOverrides: migratePersistedProfileOverrides(state.profileOverrides)
  };
}

function persistSocialState(state: SocialState) {
  if (typeof window === "undefined") {
    return;
  }

  const sanitizedState = sanitizeSocialStateForPersistence(state);
  const persistenceCandidates: SocialState[] = [
    sanitizedState,
    {
      ...sanitizedState,
      drafts: {}
    },
    {
      ...sanitizedState,
      drafts: {},
      notifications: sanitizedState.notifications.slice(0, 120),
      posts: sanitizedState.posts.slice(0, 160)
    }
  ];

  let lastError: unknown = null;

  for (const candidate of persistenceCandidates) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(candidate));
      return;
    } catch (error) {
      lastError = error;
    }
  }

  console.warn("Failed to persist social state.", lastError);
}

function buildDemoAccountTimelinePosts(baseProfiles: Record<string, SocialProfile>, actorByScope: Record<SocialPortalScope, string>) {
  const profileList = Object.values(baseProfiles);
  const actor = baseProfiles[actorByScope.user] ?? profileList.find((profile) => profile.entityType === "user");
  const actorKey = actor ? profileKey(actor) : "";
  const friendUser = profileList.find((profile) => profile.entityType === "user" && profileKey(profile) !== actorKey);
  const nearbyShop = profileList.find((profile) => profile.entityType === "shop" && resolveProfileAreaHints(profile).includes("银座"));
  const nearbyTechnician =
    profileList.find((profile) => profile.entityType === "technician" && resolveProfileAreaHints(profile).includes("银座")) ??
    profileList.find((profile) => profile.entityType === "technician");
  const nearbyTechnicianKey = nearbyTechnician ? profileKey(nearbyTechnician) : "";
  const friendTechnician =
    profileList.find((profile) => profile.entityType === "technician" && profileKey(profile) !== nearbyTechnicianKey) ?? nearbyTechnician;
  const actorArea = resolveProfileAreaHints(actor)[0] ?? "银座";
  const now = Date.now();

  if (!actor || !nearbyShop || !nearbyTechnician || !friendUser || !friendTechnician) {
    return [];
  }

  const makePost = ({
    minutesAgo,
    bookmarkCount,
    ...input
  }: Omit<SocialPost, "createdAt" | "likeCount" | "replyCount" | "repostCount" | "viewCount" | "bookmarkCount" | "isPinned" | "status"> & {
    minutesAgo: number;
    likeCount: number;
    replyCount: number;
    repostCount: number;
    viewCount: number;
    bookmarkCount?: number;
  }): SocialPost => ({
    ...input,
    createdAt: addMinutes(now, minutesAgo),
    bookmarkCount: bookmarkCount ?? 0,
    isPinned: false,
    status: "published"
  });

  const layoutImagePool = unique(
    [
      actor.coverImage,
      nearbyShop.coverImage,
      nearbyTechnician.coverImage,
      friendUser.coverImage,
      friendTechnician.coverImage,
      imageBank.massage,
      imageBank.salon,
      imageBank.home,
      imageBank.cafe,
      imageBank.nail,
      imageBank.restaurant,
      imageBank.cleaning,
      imageBank.moving,
      imageBank.pet,
      imageBank.care
    ].filter(Boolean)
  );
  const buildImageSet = (count: number, idPrefix: string) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${idPrefix}-${index + 1}`,
      type: "image" as const,
      url: layoutImagePool[index % layoutImagePool.length] ?? imageBank.home,
      alt: `${count} 张图排版测试 ${index + 1}`
    }));
  const layoutPosts = [
    makePost({
      id: "demo-user-layout-text-only",
      authorId: actor.id,
      authorType: actor.entityType,
      text: "纯文本动态排版测试：这一条没有图片也没有视频，用来确认动态列表、好友动态、我的动态在纯文字内容下的间距和点击行为。",
      media: [],
      hashtags: ["动态排版测试"],
      mentions: [],
      minutesAgo: 4,
      likeCount: 18,
      replyCount: 2,
      repostCount: 1,
      viewCount: 308,
      bookmarkCount: 3,
      visibility: "public",
      locationLabel: actorArea,
      postType: "post"
    }),
    ...Array.from({ length: 9 }, (_, index) => {
      const imageCount = index + 1;

      return makePost({
        id: `demo-user-layout-image-${imageCount}`,
        authorId: actor.id,
        authorType: actor.entityType,
        text: `${imageCount} 张图动态排版测试：用于检查 ${imageCount} 张图片时，动态页缩略图网格、无圆角媒体边缘和点击原地放大效果。#动态排版测试`,
        media: buildImageSet(imageCount, `demo-media-layout-image-${imageCount}`),
        hashtags: ["动态排版测试"],
        mentions: [],
        minutesAgo: 8 + imageCount * 8,
        likeCount: 20 + imageCount * 3,
        replyCount: imageCount % 4,
        repostCount: imageCount % 3,
        viewCount: 360 + imageCount * 128,
        bookmarkCount: imageCount,
        visibility: "public",
        locationLabel: actorArea,
        postType: "post"
      });
    })
  ];

  return [
    ...layoutPosts,
    makePost({
      id: "demo-user-nearby-ginza-night",
      authorId: nearbyShop.id,
      authorType: nearbyShop.entityType,
      text: "刚把今晚临时空出的两个夜间预约位补到动态里，附近用户可以先看现场照片再决定。#附近可约 #银座",
      media: [
        {
          id: "demo-media-nearby-ginza-night-1",
          type: "image",
          url: nearbyShop.coverImage,
          alt: "银座店铺夜间现场"
        },
        {
          id: "demo-media-nearby-ginza-night-2",
          type: "image",
          url: imageBank.salon,
          alt: "银座店铺接待区"
        }
      ],
      hashtags: ["附近可约", "银座"],
      mentions: [],
      minutesAgo: 22,
      likeCount: 92,
      replyCount: 8,
      repostCount: 11,
      viewCount: 2180,
      bookmarkCount: 35,
      visibility: "public",
      locationLabel: "银座",
      postType: "announcement"
    }),
    makePost({
      id: "demo-user-nearby-technician-note",
      authorId: nearbyTechnician.id,
      authorType: nearbyTechnician.entityType,
      text: `今天在银座附近移动，肩颈护理会预留 10 分钟现场确认。需要中文沟通可以直接 ${profileMentionLabel(nearbyTechnician)}。#肩颈调理 #附近动态`,
      media: [
        {
          id: "demo-media-nearby-technician-note-1",
          type: "image",
          url: nearbyTechnician.coverImage,
          alt: "附近技师服务准备"
        }
      ],
      hashtags: ["肩颈调理", "附近动态"],
      mentions: [nearbyTechnician.handle],
      minutesAgo: 54,
      likeCount: 134,
      replyCount: 14,
      repostCount: 18,
      viewCount: 3608,
      bookmarkCount: 61,
      visibility: "public",
      locationLabel: "银座",
      postType: "technician-daily"
    }),
    makePost({
      id: "demo-user-friend-weekend-plan",
      authorId: friendUser.id,
      authorType: friendUser.entityType,
      text: `周末预约前先翻了 ${profileMentionLabel(nearbyShop)} 的动态，现场图比详情页更快判断氛围。分享给互关好友参考。#好友推荐`,
      media: [],
      hashtags: ["好友推荐"],
      mentions: [nearbyShop.handle],
      minutesAgo: 84,
      likeCount: 41,
      replyCount: 5,
      repostCount: 3,
      viewCount: 912,
      bookmarkCount: 12,
      visibility: "friends",
      locationLabel: actorArea,
      postType: "post"
    }),
    makePost({
      id: "demo-user-friend-tech-reply",
      authorId: friendTechnician.id,
      authorType: friendTechnician.entityType,
      text: `给互关用户补充一下：如果是第一次预约，提前写清楚酒店名、门禁和力度偏好，现场沟通会顺很多。${profileMentionLabel(actor)}`,
      media: [
        {
          id: "demo-media-friend-tech-reply-1",
          type: "video",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          thumbnailUrl: friendTechnician.coverImage,
          alt: "好友技师预约说明短视频",
          durationLabel: "0:36"
        }
      ],
      hashtags: [],
      mentions: [actor.handle],
      minutesAgo: 116,
      likeCount: 67,
      replyCount: 4,
      repostCount: 7,
      viewCount: 1640,
      bookmarkCount: 29,
      visibility: "friends",
      locationLabel: actorArea,
      postType: "technician-daily"
    }),
    makePost({
      id: "demo-user-mine-booking-note",
      authorId: actor.id,
      authorType: actor.entityType,
      text: "我的测试账号记录：预约前先看动态里的现场图和回复，比只看评分更容易判断今晚适不适合下单。#我的预约记录",
      media: [
        {
          id: "demo-media-mine-booking-note-1",
          type: "image",
          url: actor.coverImage,
          alt: "我的预约记录"
        }
      ],
      hashtags: ["我的预约记录"],
      mentions: [],
      minutesAgo: 156,
      likeCount: 26,
      replyCount: 2,
      repostCount: 1,
      viewCount: 508,
      bookmarkCount: 9,
      visibility: "public",
      locationLabel: actorArea,
      postType: "post"
    }),
    makePost({
      id: "demo-user-mine-private-checklist",
      authorId: actor.id,
      authorType: actor.entityType,
      text: "私密测试：下次预约前要确认付款方式、担当语言、到达时间和取消规则。这个只在我的动态里可见。",
      media: [],
      hashtags: [],
      mentions: [],
      minutesAgo: 260,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      viewCount: 1,
      bookmarkCount: 0,
      visibility: "private",
      locationLabel: actorArea,
      postType: "post"
    })
  ];
}

export function resolveSocialActorKey({
  entityType,
  fallbackId,
  legacyIdPrefix,
  linkedId,
  profiles
}: {
  entityType: SocialProfile["entityType"];
  fallbackId?: string;
  legacyIdPrefix: string;
  linkedId?: string;
  profiles: Record<string, SocialProfile>;
}) {
  const firstProfileId = Object.values(profiles).find((profile) => profile.entityType === entityType)?.id;
  const candidateIds = unique([
    linkedId,
    linkedId ? `${legacyIdPrefix}-${linkedId}` : undefined,
    fallbackId,
    firstProfileId
  ].filter((value): value is string => Boolean(value?.trim())));
  const matchedKey = candidateIds
    .map((id) => profileKey({ entityType, id }))
    .find((key) => Boolean(profiles[key]));

  if (matchedKey) {
    return matchedKey;
  }

  return profileKey({ entityType, id: fallbackId ?? firstProfileId ?? `${legacyIdPrefix}-demo` });
}

function ensureDemoAccountTimelineContent(
  state: SocialState,
  baseProfiles: Record<string, SocialProfile>,
  actorByScope: Record<SocialPortalScope, string>
) {
  const demoPosts = buildDemoAccountTimelinePosts(baseProfiles, actorByScope);
  const existingPostIds = new Set(state.posts.map((post) => post.id));
  const missingPosts = demoPosts.filter((post) => !existingPostIds.has(post.id));
  const nextFollows: Record<string, string[]> = { ...state.follows };
  let followsChanged = false;

  const addFollow = (from: string, to: string) => {
    if (!from || !to || from === to) {
      return;
    }

    const current = nextFollows[from] ?? [];

    if (current.includes(to)) {
      return;
    }

    nextFollows[from] = [...current, to];
    followsChanged = true;
  };

  missingPosts.forEach((post) => {
    const authorKey = postAuthorKey(post);

    if (post.visibility === "friends") {
      addFollow(actorByScope.user, authorKey);
      addFollow(authorKey, actorByScope.user);
    }

    if (post.visibility === "public" && authorKey !== actorByScope.user) {
      addFollow(actorByScope.user, authorKey);
    }
  });

  if (missingPosts.length === 0 && !followsChanged) {
    return state;
  }

  return {
    ...state,
    posts: sortPostsByNewest([...state.posts, ...missingPosts]),
    follows: nextFollows,
    interactions: {
      ...state.interactions,
      [actorByScope.user]: {
        ...(state.interactions[actorByScope.user] ?? {}),
        ...(missingPosts.find((post) => post.id === "demo-user-nearby-technician-note")
          ? {
              "demo-user-nearby-technician-note": {
                postId: "demo-user-nearby-technician-note",
                liked: true,
                reposted: false,
                bookmarked: true,
                shared: false
              }
            }
          : {})
      }
    },
    refreshedAt: new Date().toISOString()
  };
}

function updatePostCounter(posts: SocialPost[], postId: string, field: "likeCount" | "replyCount" | "repostCount" | "bookmarkCount" | "viewCount", delta: number) {
  return posts.map((post) =>
    post.id === postId
      ? {
          ...post,
          [field]: clampCount(post[field] + delta)
        }
      : post
  );
}

function injectNotification(
  notifications: SocialNotification[],
  type: SocialNotification["type"],
  actorKey: string,
  recipientKey: string,
  content: string,
  postId?: string
) {
  if (actorKey === recipientKey) {
    return notifications;
  }

  return [
    {
      id: nextId("notice"),
      type,
      actorKey,
      recipientKey,
      postId,
      createdAt: new Date().toISOString(),
      read: false,
      content
    },
    ...notifications
  ];
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { customers, stores, technicians, revision: entityRevision } = useEntityStore();

  const baseProfiles = useMemo(() => buildBaseProfiles(customers, stores, technicians), [customers, entityRevision, stores, technicians]);

  const actorByScope = useMemo<Record<SocialPortalScope, string>>(
    () => ({
      user: resolveSocialActorKey({
        entityType: "user",
        fallbackId: customers[0]?.id,
        legacyIdPrefix: "cus",
        linkedId: session?.linkedCustomerId,
        profiles: baseProfiles
      }),
      merchant: resolveSocialActorKey({
        entityType: "shop",
        fallbackId: stores[0]?.id,
        legacyIdPrefix: "store",
        linkedId: session?.linkedStoreId,
        profiles: baseProfiles
      }),
      technician: resolveSocialActorKey({
        entityType: "technician",
        fallbackId: technicians[0]?.id,
        legacyIdPrefix: "tech",
        linkedId: session?.linkedTechnicianId,
        profiles: baseProfiles
      })
    }),
    [baseProfiles, customers, entityRevision, session?.linkedCustomerId, session?.linkedStoreId, session?.linkedTechnicianId, stores, technicians]
  );

  const [state, setState] = useState<SocialState>(() =>
    ensureDemoAccountTimelineContent(loadState() ?? buildSeedState(baseProfiles, actorByScope), baseProfiles, actorByScope)
  );

  useEffect(() => {
    persistSocialState(state);
  }, [state]);

  useEffect(() => {
    setState((current) => {
      const nextState = current.posts.length > 0 ? current : buildSeedState(baseProfiles, actorByScope);

      return ensureDemoAccountTimelineContent(nextState, baseProfiles, actorByScope);
    });
  }, [actorByScope, baseProfiles]);

  const profiles = useMemo(() => mergeProfiles(baseProfiles, state.profileOverrides, state.follows), [baseProfiles, state.follows, state.profileOverrides]);
  const profileList = useMemo(() => Object.values(profiles), [profiles]);
  const composerProfileKeys = useMemo(
    () => unique([actorByScope.user, actorByScope.merchant, actorByScope.technician]).filter((key) => Boolean(profiles[key])),
    [actorByScope.merchant, actorByScope.technician, actorByScope.user, profiles]
  );

  const value = useMemo<SocialContextValue>(() => {
    const getActorForScope = (scope: SocialPortalScope) => actorByScope[scope];

    const getPostById = (postId: string, actorKey = actorByScope.user) =>
      state.posts.find((post) => isVisiblePost(post) && post.id === postId && canActorViewPost(post, actorKey, state.follows, profiles));

    const getFollowingSet = (actorKey: string) => new Set(state.follows[actorKey] ?? []);

    const getTimeline = (tab: "for-you" | "following", actorKey: string) => {
      const following = getFollowingSet(actorKey);

      return sortPostsByNewest(
        state.posts.filter((post) => {
          if (!isVisiblePost(post)) {
            return false;
          }

          const authorKey = postAuthorKey(post);
          const canSee = canActorViewPost(post, actorKey, state.follows, profiles);

          if (!canSee) {
            return false;
          }

          if (tab === "following") {
            return following.has(authorKey) || authorKey === actorKey;
          }

          return true;
        })
      );
    };

    const getTimelineFeed = (filter: SocialTimelineFilterTab, actorKey: string, locationContext?: SocialTimelineLocationContext) =>
      filterTimelinePosts({
        posts: state.posts,
        profiles,
        follows: state.follows,
        actorKey,
        filter,
        locationContext
      });

    const getReplies = (postId: string) => sortPostsByOldest(state.posts.filter((post) => isVisiblePost(post) && post.replyToPostId === postId));

    const getAncestors = (postId: string) => {
      const chain: SocialPost[] = [];
      let current = getPostById(postId);

      while (current?.replyToPostId) {
        const parent = getPostById(current.replyToPostId);

        if (!parent) {
          break;
        }

        chain.unshift(parent);
        current = parent;
      }

      return chain;
    };

    const getRelatedPosts = (postId: string) =>
      sortPostsByNewest(
        state.posts.filter(
          (post) => isVisiblePost(post) && post.id !== postId && (post.quotePostId === postId || post.repostPostId === postId)
        )
      );

    const getInteractionState = (postId: string, actorKey: string): PostInteractionState => {
      const post = getPostById(postId);
      const authorKey = post ? postAuthorKey(post) : "";
      const raw = state.interactions[actorKey]?.[postId];

      return {
        postId,
        liked: raw?.liked ?? false,
        reposted: raw?.reposted ?? false,
        bookmarked: raw?.bookmarked ?? false,
        shared: raw?.shared ?? false,
        followingAuthor: authorKey ? getFollowingSet(actorKey).has(authorKey) : false
      };
    };

    const getProfilePosts = (profileKeyValue: string, tab: "posts" | "replies" | "media" | "likes", actorKey: string) => {
      const likedIds = new Set(
        Object.values(state.interactions[profileKeyValue] ?? {})
          .filter((item) => item.liked)
          .map((item) => item.postId)
      );

      return sortPostsByNewest(
        state.posts.filter((post) => {
          if (!isVisiblePost(post)) {
            return false;
          }

          if (!canActorViewPost(post, actorKey, state.follows, profiles)) {
            return false;
          }

          const sameAuthor = postAuthorKey(post) === profileKeyValue;

          if (tab === "posts") {
            return sameAuthor && !post.replyToPostId;
          }

          if (tab === "replies") {
            return sameAuthor && Boolean(post.replyToPostId);
          }

          if (tab === "media") {
            return sameAuthor && post.media.length > 0;
          }

          return likedIds.has(post.id);
        })
      );
    };

    const getFollowers = (profileKeyValue: string) =>
      profileList.filter((profile) => (state.follows[profileKey(profile)] ?? []).includes(profileKeyValue));

    const getFollowing = (profileKeyValue: string) =>
      (state.follows[profileKeyValue] ?? []).map((key) => profiles[key]).filter(Boolean);

    const getNotifications = (recipientKey: string) =>
      [...state.notifications]
        .filter((item) => item.recipientKey === recipientKey)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    const getUnreadNotificationCount = (recipientKey: string) => getNotifications(recipientKey).filter((item) => !item.read).length;

    const search = (query: string): SocialSearchResult => {
      const normalized = query.trim().toLowerCase();

      if (!normalized) {
        return {
          profiles: profileList.slice(0, 6),
          posts: getTimeline("for-you", actorByScope.user).slice(0, 8),
          tags: getTrendingTags().slice(0, 6)
        };
      }

      const profilesResult = profileList.filter((profile) => {
        return (
          profile.displayName.toLowerCase().includes(normalized) ||
          profile.bio.toLowerCase().includes(normalized)
        );
      });

      const postsResult = state.posts.filter((post) => {
        return (
          isVisiblePost(post) &&
          canActorViewPost(post, actorByScope.user, state.follows, profiles) &&
          (post.text.toLowerCase().includes(normalized) ||
            post.hashtags.some((tag) => tag.toLowerCase().includes(normalized)) ||
            post.mentions.some((mention) => mention.toLowerCase().includes(normalized)))
        );
      });

      const tagsResult = getTrendingTags().filter((tag) => tag.tag.toLowerCase().includes(normalized));

      return {
        profiles: profilesResult,
        posts: sortPostsByNewest(postsResult),
        tags: tagsResult
      };
    };

    const getTagFeed = (tag: string) =>
      sortPostsByNewest(
        state.posts.filter(
          (post) =>
            isVisiblePost(post) &&
            canActorViewPost(post, actorByScope.user, state.follows, profiles) &&
            post.hashtags.some((item) => item.toLowerCase() === tag.toLowerCase())
        )
      );

    const getTrendingTags = () => {
      const counts = new Map<string, number>();

      state.posts.forEach((post) => {
        if (!isVisiblePost(post)) {
          return;
        }

        post.hashtags.forEach((tag) => {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        });
      });

      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((left, right) => right.count - left.count);
    };

    const saveDraft = (draftKey: string, draft: SocialComposerDraft) => {
      setState((current) => {
        const currentDraft = current.drafts[draftKey];

        if (currentDraft) {
          const { updatedAt: _currentUpdatedAt, ...currentComparable } = currentDraft;
          const { updatedAt: _nextUpdatedAt, ...nextComparable } = draft;

          if (JSON.stringify(currentComparable) === JSON.stringify(nextComparable)) {
            return current;
          }
        }

        return {
          ...current,
          drafts: {
            ...current.drafts,
            [draftKey]: draft
          }
        };
      });
    };

    const clearDraft = (draftKey: string) => {
      setState((current) => {
        if (!current.drafts[draftKey]) {
          return current;
        }

        const nextDrafts = { ...current.drafts };
        delete nextDrafts[draftKey];

        return {
          ...current,
          drafts: nextDrafts
        };
      });
    };

    const createPost = (input: SocialCreatePostInput) => {
      const author = profiles[input.authorKey];
      const postType =
        input.postType ?? (input.replyToPostId ? "reply" : input.quotePostId ? "quote" : "post");
      const post: SocialPost = {
        id: nextId("post"),
        authorId: author?.id ?? parseProfileKey(input.authorKey).id,
        authorType: author?.entityType ?? parseProfileKey(input.authorKey).entityType,
        text: input.text.trim(),
        media: normalizeSocialPostMedia(input.media ?? []),
        hashtags: extractHashtags(input.text),
        mentions: extractMentions(input.text, profileList),
        quotePostId: input.quotePostId,
        repostPostId: postType === "repost" ? input.quotePostId : undefined,
        replyToPostId: input.replyToPostId,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        replyCount: 0,
        repostCount: 0,
        viewCount: 1,
        bookmarkCount: 0,
        isPinned: false,
        visibility: input.visibility ?? "public",
        visibilityTagIds: input.visibilityTagIds ?? [],
        visibilityProfileKeys: input.visibilityProfileKeys ?? input.audienceProfileKeys ?? [],
        includeRelatedPeople: input.includeRelatedPeople ?? false,
        commentPermission: input.commentPermission ?? "everyone",
        locationLabel: input.locationLabel,
        audienceProfileKeys: input.audienceProfileKeys ?? [],
        status: "published",
        postType
      };

      setState((current) => {
        let nextPosts = [post, ...current.posts];
        let nextNotifications = current.notifications;

        if (post.replyToPostId) {
          nextPosts = updatePostCounter(nextPosts, post.replyToPostId, "replyCount", 1);
          const parent = current.posts.find((item) => item.id === post.replyToPostId);
          if (parent) {
            nextNotifications = injectNotification(nextNotifications, "reply", input.authorKey, postAuthorKey(parent), "回复了你的动态", parent.id);
          }
        }

        if (post.quotePostId) {
          nextPosts = updatePostCounter(nextPosts, post.quotePostId, "repostCount", 1);
          const quoted = current.posts.find((item) => item.id === post.quotePostId);
          if (quoted) {
            nextNotifications = injectNotification(nextNotifications, "quote", input.authorKey, postAuthorKey(quoted), "引用了你的动态", quoted.id);
          }
        }

        post.mentions.forEach((mention) => {
          const target = profileList.find((profile) => profile.displayName.toLowerCase() === mention.toLowerCase());

          if (target) {
            nextNotifications = injectNotification(nextNotifications, "mention", input.authorKey, profileKey(target), "在动态中提到了你", post.id);
          }
        });

        return {
          ...current,
          posts: sortPostsByNewest(nextPosts),
          notifications: nextNotifications
        };
      });

      return post;
    };

    const updatePost = (input: SocialUpdatePostInput) => {
      const target = getPostById(input.postId);

      if (!target || postAuthorKey(target) !== input.actorKey) {
        return undefined;
      }

      const nextPost: SocialPost = {
        ...target,
        text: input.text.trim(),
        media: normalizeSocialPostMedia(input.media),
        visibility: input.visibility,
        visibilityTagIds: input.visibilityTagIds ?? [],
        visibilityProfileKeys: input.visibilityProfileKeys ?? input.audienceProfileKeys ?? [],
        includeRelatedPeople: input.includeRelatedPeople ?? false,
        commentPermission: input.commentPermission,
        locationLabel: input.locationLabel,
        audienceProfileKeys: input.audienceProfileKeys ?? [],
        postType: input.postType,
        hashtags: extractHashtags(input.text),
        mentions: extractMentions(input.text, profileList),
        updatedAt: new Date().toISOString()
      };

      setState((current) => ({
        ...current,
        posts: sortPostsByNewest(current.posts.map((post) => (post.id === nextPost.id ? nextPost : post)))
      }));

      return nextPost;
    };

    const deletePost = (postId: string, actorKey: string) => {
      setState((current) => {
        const target = current.posts.find((post) => post.id === postId);

        if (!target || postAuthorKey(target) !== actorKey) {
          return current;
        }

        let nextPosts = current.posts.map((post) => (post.id === postId ? { ...post, status: "deleted" as const } : post));

        if (target.replyToPostId) {
          nextPosts = updatePostCounter(nextPosts, target.replyToPostId, "replyCount", -1);
        }

        if (target.quotePostId || target.repostPostId) {
          nextPosts = updatePostCounter(nextPosts, target.quotePostId ?? target.repostPostId ?? "", "repostCount", -1);
        }

        return {
          ...current,
          posts: nextPosts,
          interactions: Object.fromEntries(
            Object.entries(current.interactions).map(([key, interactionMap]) => {
              if (!interactionMap[postId]) {
                return [key, interactionMap];
              }

              const nextInteractionMap = { ...interactionMap };
              delete nextInteractionMap[postId];
              return [key, nextInteractionMap];
            })
          )
        };
      });
    };

    const toggleLike = (postId: string, actorKey: string) => {
      setState((current) => {
        const post = current.posts.find((item) => item.id === postId);

        if (!post) {
          return current;
        }

        const currentInteraction = current.interactions[actorKey]?.[postId];
        const liked = !(currentInteraction?.liked ?? false);
        const interactionMap = current.interactions[actorKey] ?? {};
        let nextNotifications = current.notifications;

        if (liked) {
          nextNotifications = injectNotification(nextNotifications, "like", actorKey, postAuthorKey(post), "点赞了你的动态", post.id);
        }

        return {
          ...current,
          posts: updatePostCounter(current.posts, postId, "likeCount", liked ? 1 : -1),
          interactions: {
            ...current.interactions,
            [actorKey]: {
              ...interactionMap,
              [postId]: {
                postId,
                liked,
                reposted: currentInteraction?.reposted ?? false,
                bookmarked: currentInteraction?.bookmarked ?? false,
                shared: currentInteraction?.shared ?? false
              }
            }
          },
          notifications: nextNotifications
        };
      });
    };

    const toggleBookmark = (postId: string, actorKey: string) => {
      setState((current) => {
        const currentInteraction = current.interactions[actorKey]?.[postId];
        const bookmarked = !(currentInteraction?.bookmarked ?? false);

        return {
          ...current,
          posts: updatePostCounter(current.posts, postId, "bookmarkCount", bookmarked ? 1 : -1),
          interactions: {
            ...current.interactions,
            [actorKey]: {
              ...(current.interactions[actorKey] ?? {}),
              [postId]: {
                postId,
                liked: currentInteraction?.liked ?? false,
                reposted: currentInteraction?.reposted ?? false,
                bookmarked,
                shared: currentInteraction?.shared ?? false
              }
            }
          }
        };
      });
    };

    const toggleRepost = (postId: string, actorKey: string) => {
      const existingRepost = state.posts.find(
        (post) => post.status === "published" && postAuthorKey(post) === actorKey && post.repostPostId === postId
      );

      if (existingRepost) {
        setState((current) => ({
          ...current,
          posts: updatePostCounter(
            current.posts.map((post) => (post.id === existingRepost.id ? { ...post, status: "deleted" as const } : post)),
            postId,
            "repostCount",
            -1
          ),
          interactions: {
            ...current.interactions,
            [actorKey]: {
              ...(current.interactions[actorKey] ?? {}),
              [postId]: {
                postId,
                liked: current.interactions[actorKey]?.[postId]?.liked ?? false,
                reposted: false,
                bookmarked: current.interactions[actorKey]?.[postId]?.bookmarked ?? false,
                shared: current.interactions[actorKey]?.[postId]?.shared ?? false
              }
            }
          }
        }));

        return undefined;
      }

      const source = getPostById(postId);

      if (!source) {
        return undefined;
      }

      const author = profiles[actorKey];
      const repost: SocialPost = {
        id: nextId("post"),
        authorId: author.id,
        authorType: author.entityType,
        text: "",
        media: [],
        hashtags: [],
        mentions: [],
        repostPostId: postId,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        replyCount: 0,
        repostCount: 0,
        viewCount: 1,
        bookmarkCount: 0,
        isPinned: false,
        visibility: "public",
        status: "published",
        postType: "repost"
      };

      setState((current) => ({
        ...current,
        posts: sortPostsByNewest(updatePostCounter([repost, ...current.posts], postId, "repostCount", 1)),
        interactions: {
          ...current.interactions,
          [actorKey]: {
            ...(current.interactions[actorKey] ?? {}),
            [postId]: {
              postId,
              liked: current.interactions[actorKey]?.[postId]?.liked ?? false,
              reposted: true,
              bookmarked: current.interactions[actorKey]?.[postId]?.bookmarked ?? false,
              shared: current.interactions[actorKey]?.[postId]?.shared ?? false
            }
          }
        },
        notifications: injectNotification(current.notifications, "repost", actorKey, postAuthorKey(source), "转发了你的动态", source.id)
      }));

      return repost;
    };

    const markShared = (postId: string, actorKey: string) => {
      setState((current) => ({
        ...current,
        interactions: {
          ...current.interactions,
          [actorKey]: {
            ...(current.interactions[actorKey] ?? {}),
            [postId]: {
              postId,
              liked: current.interactions[actorKey]?.[postId]?.liked ?? false,
              reposted: current.interactions[actorKey]?.[postId]?.reposted ?? false,
              bookmarked: current.interactions[actorKey]?.[postId]?.bookmarked ?? false,
              shared: true
            }
          }
        }
      }));
    };

    const toggleFollow = (actorKey: string, targetKey: string) => {
      setState((current) => {
        const following = new Set(current.follows[actorKey] ?? []);
        const isFollowing = following.has(targetKey);

        if (isFollowing) {
          following.delete(targetKey);
        } else {
          following.add(targetKey);
        }

        return {
          ...current,
          follows: {
            ...current.follows,
            [actorKey]: [...following]
          },
          notifications: !isFollowing
            ? injectNotification(current.notifications, "follow", actorKey, targetKey, "开始关注你")
            : current.notifications
        };
      });
    };

    const ensureMutualFollow = (leftKey: string, rightKey: string) => {
      if (leftKey === rightKey) {
        return;
      }

      setState((current) => {
        const leftFollowing = new Set(current.follows[leftKey] ?? []);
        const rightFollowing = new Set(current.follows[rightKey] ?? []);
        const leftChanged = !leftFollowing.has(rightKey);
        const rightChanged = !rightFollowing.has(leftKey);

        if (!leftChanged && !rightChanged) {
          return current;
        }

        leftFollowing.add(rightKey);
        rightFollowing.add(leftKey);

        return {
          ...current,
          follows: {
            ...current.follows,
            [leftKey]: [...leftFollowing],
            [rightKey]: [...rightFollowing]
          }
        };
      });
    };

    const togglePinPost = (postId: string, actorKey: string) => {
      setState((current) => {
        const target = current.posts.find((post) => post.id === postId);

        if (!target || postAuthorKey(target) !== actorKey || target.status !== "published") {
          return current;
        }

        const override = current.profileOverrides[actorKey];
        const currentPinnedPostId =
          override && Object.prototype.hasOwnProperty.call(override, "pinnedPostId")
            ? override.pinnedPostId
            : baseProfiles[actorKey]?.pinnedPostId;
        const nextPinnedPostId = currentPinnedPostId === postId ? "" : postId;

        return {
          ...current,
          posts: current.posts.map((post) => {
            if (postAuthorKey(post) !== actorKey) {
              return post;
            }

            return {
              ...post,
              isPinned: post.id === nextPinnedPostId
            };
          }),
          profileOverrides: {
            ...current.profileOverrides,
            [actorKey]: {
              ...(current.profileOverrides[actorKey] ?? {}),
              pinnedPostId: nextPinnedPostId
            }
          }
        };
      });
    };

    const updateProfileOverride = (profileKeyValue: string, overrides: SocialProfileOverrides) => {
      setState((current) => ({
        ...current,
        profileOverrides: {
          ...current.profileOverrides,
          [profileKeyValue]: {
            ...(current.profileOverrides[profileKeyValue] ?? {}),
            ...overrides
          }
        }
      }));
    };

    const incrementView = (postId: string) => {
      setState((current) => ({
        ...current,
        posts: updatePostCounter(current.posts, postId, "viewCount", 1)
      }));
    };

    const markNotificationsRead = (recipientKey: string) => {
      setState((current) => ({
        ...current,
        notifications: current.notifications.map((item) => (item.recipientKey === recipientKey ? { ...item, read: true } : item))
      }));
    };

    const refreshFeeds = () => {
      setState((current) => ({
        ...current,
        refreshedAt: new Date().toISOString()
      }));
    };

    return {
      state,
      profiles,
      profileList,
      composerProfileKeys,
      actorByScope,
      getActorForScope,
      getPostById,
      getTimeline,
      getTimelineFeed,
      getReplies,
      getAncestors,
      getRelatedPosts,
      getProfilePosts,
      getInteractionState,
      getFollowers,
      getFollowing,
      getNotifications,
      getUnreadNotificationCount,
      search,
      getTagFeed,
      getTrendingTags,
      saveDraft,
      clearDraft,
      createPost,
      updatePost,
      deletePost,
      toggleLike,
      toggleBookmark,
      toggleRepost,
      markShared,
      toggleFollow,
      ensureMutualFollow,
      togglePinPost,
      updateProfileOverride,
      incrementView,
      markNotificationsRead,
      refreshFeeds
    };
  }, [actorByScope, composerProfileKeys, profileList, profiles, state]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);

  if (!context) {
    throw new Error("useSocial must be used within SocialProvider");
  }

  return context;
}
