import { TEST_USER_ACCOUNTS } from "../constants/test-login.constants";
import {
  LIFEDANCE_ADMIN_EMAIL,
  SIMULATION_NAMESPACE,
  buildThreeMonthSimulationPlan
} from "./three-month-simulation-plan";

export type SocialSimulationType = "shop" | "technician" | "user";
export type SocialSimulationPostKind = "text" | "single_image" | "multi_image" | "video" | "quote";

export interface SocialSimulationAccount {
  key: string;
  accountType: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  socialType: SocialSimulationType;
}

export interface SocialSimulationMediaItem {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  alt: string;
  durationLabel?: string;
}

export interface SocialSimulationMediaEnvelope {
  namespace: typeof SIMULATION_NAMESPACE;
  dataset: "social";
  postKey: string;
  items: SocialSimulationMediaItem[];
  quotePostId?: number;
  quotePostKey?: string;
  postType: "post" | "quote" | "announcement" | "technician-daily";
  locationLabel: string;
  counters: {
    likes: number;
    replies: number;
    reposts: number;
    views: number;
    bookmarks: number;
  };
}

export interface SocialSimulationPost {
  key: string;
  authorKey: string;
  kind: SocialSimulationPostKind;
  content: string;
  media: SocialSimulationMediaEnvelope;
  quotePostKey?: string;
  visibility: "public" | "followers";
  createdAt: string;
}

export interface SocialSimulationFriendship {
  leftKey: string;
  rightKey: string;
}

export interface SocialSimulationPlan {
  accounts: SocialSimulationAccount[];
  posts: SocialSimulationPost[];
  friendships: SocialSimulationFriendship[];
}

const IMAGE_POOL = [
  "/images/generated/stores/store-calm-body-room.jpg",
  "/images/generated/stores/store-beauty-reception.jpg",
  "/images/generated/stores/store-nail-atelier.jpg",
  "/images/generated/stores/store-clean-base.jpg",
  "/images/generated/stores/store-cafe-consult.jpg",
  "/images/generated/services/service-wellness-care.jpg",
  "/images/generated/services/service-massage-setup.jpg",
  "/images/generated/services/service-home-cleaning.jpg",
  "/images/generated/services/service-ac-cleaning.jpg",
  "/images/generated/services/service-pet-care.jpg",
  "/images/generated/services/service-beauty-workstation.jpg",
  "/images/generated/services/service-home-organization.jpg"
] as const;

const VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const POST_KINDS: SocialSimulationPostKind[] = [
  "text",
  "single_image",
  "multi_image",
  "video",
  "quote"
];

const locationFor = (index: number): string =>
  ["东京 银座", "东京 涩谷", "东京 新宿", "东京 惠比寿", "横滨", "大阪 梅田"][index % 6]!;

const buildContent = (
  account: SocialSimulationAccount,
  kind: SocialSimulationPostKind,
  cycle: number
): string => {
  const sequence = cycle + 1;
  if (account.socialType === "shop") {
    const content = {
      text: `本日の予約枠を更新しました。初めての方は希望時間と施術の強さをメッセージでお知らせください。#予約案内 #${account.displayName}`,
      single_image: `受付と施術スペースを整えて営業を始めました。写真は本日の店内です。#店内案内 #営業中`,
      multi_image: `来店前に確認しやすいよう、入口・受付・施術スペースの写真をまとめました。#店舗情報 #安心予約`,
      video: `店先の季節の様子を短い動画でお届けします。ご来店時の目印としてご覧ください。#今日の店先`,
      quote: `担当スタッフの説明が分かりやすかったので、店舗からも共有します。予約前の確認にご利用ください。#スタッフ紹介`
    } as const;
    return `${content[kind]} ${sequence}`;
  }

  if (account.socialType === "technician") {
    const content = {
      text: `施術前は体調、触れてほしくない箇所、好みの強さを必ず確認しています。気になる点は予約時にご相談ください。#サービス日常 #事前確認`,
      single_image: `本日の施術準備が整いました。タオルと備品は予約ごとに交換しています。#衛生管理 #施術準備`,
      multi_image: `肩・首まわりのケアで使う備品と施術スペースです。初回の方にも流れが伝わるよう写真でまとめました。#肩颈调理 #技师日常`,
      video: `移動中に見つけた季節の花を短い動画にしました。次の予約まで少し休憩してから伺います。#出張服务 #今日の記録`,
      quote: `この案内は初回予約の方に特に役立つので引用します。場所と希望の強さを事前に共有いただけるとスムーズです。#预约提示`
    } as const;
    return `${content[kind]} ${sequence}`;
  }

  const content = {
    text: `预约前先确认了服务内容、到达时间和取消规则，整个过程比想象中顺利。分享给第一次使用 NeeDo 的朋友。#NeeDo体验 #预约记录`,
    single_image: `今天预约的环境很整洁，入口也很好找。现场与动态里的照片一致。#真实体验 #到店记录`,
    multi_image: `把入口、等候区和服务结束后的注意事项拍下来，给正在比较服务的朋友做参考。#用户分享 #服务体验`,
    video: `服务结束后散步时拍到店门口的花，顺便记录今天轻松的一刻。#生活记录 #预约之后`,
    quote: `这条专业说明对第一次预约很有帮助，我按这里的步骤填写备注后，现场沟通快了很多。#引用分享 #预约建议`
  } as const;
  return `${content[kind]} ${sequence}`;
};

const buildAccounts = (): SocialSimulationAccount[] => {
  const plan = buildThreeMonthSimulationPlan();
  const simulated: SocialSimulationAccount[] = [
    ...plan.shops.map((shop) => ({
      key: shop.key,
      accountType: shop.ownerEmail === LIFEDANCE_ADMIN_EMAIL ? "admin" : "merchant_owner",
      email: shop.ownerEmail,
      displayName: `${shop.name} 公式受付`,
      avatarUrl: shop.avatarUrl,
      socialType: "shop" as const
    })),
    ...plan.technicians.map((technician) => ({
      key: technician.key,
      accountType: "technician",
      email: technician.email,
      displayName: technician.displayName,
      avatarUrl: technician.avatarUrl,
      socialType: "technician" as const
    })),
    ...plan.customers.map((customer) => ({
      key: customer.key,
      accountType: "customer",
      email: customer.email,
      displayName: customer.displayName,
      avatarUrl: customer.avatarUrl,
      socialType: "user" as const
    }))
  ];
  const simulatedEmails = new Set(simulated.map((account) => account.email));
  const fixed = TEST_USER_ACCOUNTS.filter((account) => !simulatedEmails.has(account.email)).map(
    (account): SocialSimulationAccount => ({
      key:
        account.email === "customer@example.com"
          ? "formal-preview-customer"
          : `fixed-${account.email.split("@")[0]}`,
      accountType: account.roleCode,
      email: account.email,
      displayName: account.username,
      avatarUrl: account.avatarUrl,
      socialType:
        account.identityType === "merchant"
          ? "shop"
          : account.identityType === "technician"
            ? "technician"
            : "user"
    })
  );

  return [...simulated, ...fixed];
};

const orderAccountsForFriendGraph = (accounts: SocialSimulationAccount[]) => {
  const shops = accounts.filter((account) => account.socialType === "shop");
  const technicians = accounts.filter((account) => account.socialType === "technician");
  const users = accounts.filter((account) => account.socialType === "user");
  const slots: Array<SocialSimulationAccount | undefined> = Array(accounts.length).fill(undefined);
  shops.forEach((shop, index) => {
    slots[Math.floor((index * accounts.length) / shops.length)] = shop;
  });
  let technicianIndex = 0;
  let userIndex = 0;
  let takeTechnician = false;
  for (let index = 0; index < slots.length; index += 1) {
    if (slots[index]) continue;
    const next = takeTechnician
      ? (technicians[technicianIndex++] ?? users[userIndex++])
      : (users[userIndex++] ?? technicians[technicianIndex++]);
    slots[index] = next;
    takeTechnician = !takeTechnician;
  }
  return slots.filter((account): account is SocialSimulationAccount => Boolean(account));
};

const buildFriendships = (accounts: SocialSimulationAccount[]): SocialSimulationFriendship[] => {
  const ordered = orderAccountsForFriendGraph(accounts);
  const offsets = [...Array.from({ length: 16 }, (_, index) => index + 1), 19, 20];
  const pairs = new Map<string, SocialSimulationFriendship>();
  ordered.forEach((account, index) => {
    offsets.forEach((offset) => {
      const target = ordered[(index + offset) % ordered.length]!;
      const [leftKey, rightKey] = [account.key, target.key].sort();
      pairs.set(`${leftKey}:${rightKey}`, { leftKey, rightKey });
    });
  });
  return [...pairs.values()].sort((left, right) =>
    `${left.leftKey}:${left.rightKey}`.localeCompare(`${right.leftKey}:${right.rightKey}`)
  );
};

const buildPosts = (accounts: SocialSimulationAccount[]): SocialSimulationPost[] => {
  const baseTime = new Date("2026-08-25T08:00:00.000Z").getTime();
  return accounts.flatMap((account, accountIndex) =>
    Array.from({ length: 15 }, (_, postIndex): SocialSimulationPost => {
      const kind = POST_KINDS[postIndex % POST_KINDS.length]!;
      const cycle = Math.floor(postIndex / POST_KINDS.length);
      const key = `${account.key}-social-${String(postIndex + 1).padStart(2, "0")}`;
      const imageStart = (accountIndex * 3 + postIndex) % IMAGE_POOL.length;
      const imageAt = (offset: number) => IMAGE_POOL[(imageStart + offset) % IMAGE_POOL.length]!;
      const items: SocialSimulationMediaItem[] =
        kind === "single_image"
          ? [
              {
                id: `${key}-image-1`,
                type: "image",
                url: imageAt(0),
                alt: `${account.displayName} 发布的现场照片`
              }
            ]
          : kind === "multi_image"
            ? Array.from({ length: 3 }, (_, index) => ({
                id: `${key}-image-${index + 1}`,
                type: "image" as const,
                url: imageAt(index),
                alt: `${account.displayName} 发布的组图 ${index + 1}`
              }))
            : kind === "video"
              ? [
                  {
                    id: `${key}-video-1`,
                    type: "video",
                    url: VIDEO_URL,
                    thumbnailUrl: imageAt(0),
                    alt: `${account.displayName} 发布的短视频`,
                    durationLabel: "0:30"
                  }
                ]
              : [];
      const quotePostKey =
        kind === "quote"
          ? `${account.key}-social-${String(postIndex - 2).padStart(2, "0")}`
          : undefined;
      return {
        key,
        authorKey: account.key,
        kind,
        content: buildContent(account, kind, cycle),
        media: {
          namespace: SIMULATION_NAMESPACE,
          dataset: "social",
          postKey: key,
          items,
          quotePostKey,
          postType:
            kind === "quote"
              ? "quote"
              : account.socialType === "shop"
                ? "announcement"
                : account.socialType === "technician"
                  ? "technician-daily"
                  : "post",
          locationLabel: locationFor(accountIndex),
          counters: {
            likes: 8 + ((accountIndex * 7 + postIndex * 3) % 240),
            replies: (accountIndex + postIndex) % 18,
            reposts: (accountIndex * 2 + postIndex) % 24,
            views: 180 + ((accountIndex * 97 + postIndex * 113) % 9_800),
            bookmarks: (accountIndex * 5 + postIndex) % 90
          }
        },
        quotePostKey,
        visibility: postIndex % 7 === 0 ? "followers" : "public",
        createdAt: new Date(baseTime - (accountIndex * 15 + postIndex) * 60_000).toISOString()
      };
    })
  );
};

export const buildSocialSimulationPlan = (): SocialSimulationPlan => {
  const accounts = buildAccounts();
  return {
    accounts,
    posts: buildPosts(accounts),
    friendships: buildFriendships(accounts)
  };
};
