import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { Language } from "../../i18n/translations";
import type {
  Customer,
  ServiceItem,
  Store,
  Technician,
} from "../../types/domain";
import type { InfoCardData } from "../info-card";
import { getScopedProfileDetailPath } from "../profile-detail/paths";
import {
  mapServiceItemToUnifiedData,
  UnifiedServiceInfoCard,
  type UnifiedServiceInfoCardData,
} from "../service-card";
import { getScopedTechnicianDynamicPath } from "./TechnicianShowcaseCard";
import {
  resolveCustomerMembership,
  type SocialProfileMiniMembershipKind,
} from "./customerMembership";
import {
  UnifiedEntityInfoCard,
  type UnifiedEntityInfoCardData,
} from "./UnifiedEntityInfoCard";
import type { SpecialReviewTag } from "./SpecialReviewIconRow";
import {
  mapCustomerToUnifiedEntityData,
  mapStoreToUnifiedEntityData,
  mapTechnicianToUnifiedEntityData,
} from "./unifiedEntityMappers";

export type SocialProfileMiniActionLabel = "关注" | "关注中" | "好友";
type SocialProfileMiniTagTone = "neutral" | "green" | "yellow" | "purple";
type SocialProfileMiniTopTag =
  | string
  | { label: string; tone?: SocialProfileMiniTagTone };

export type SocialProfileMiniData = {
  id: string;
  entityType: "user" | "technician" | "shop" | "service";
  displayName: string;
  avatar: string;
  coverImage: string;
  headline?: string;
  genderLabel?: string;
  regionLabel: string;
  addressLabel?: string;
  addressValue?: string;
  addressTags?: string[];
  primaryLabel: string;
  membershipKind?: SocialProfileMiniMembershipKind;
  kycVerified?: boolean;
  serviceTags?: string[];
  levelLabel: string;
  scoreLabel: string;
  scoreValue: string;
  followerCount?: number;
  followingCount?: number;
  isFavorited?: boolean;
  shareCount?: number;
  usageCount?: number;
  completedOrderCount?: number;
  distanceKm?: number;
  favoriteCount?: number;
  languages?: string[];
  specialReviewTags?: SpecialReviewTag[];
  serviceInfo?: UnifiedServiceInfoCardData;
  actionLabel?: SocialProfileMiniActionLabel;
  detailPath?: string;
};

type CommonSocialProfileMiniCardProps = {
  className?: string;
  dark?: boolean;
  detailTo?: string;
  onOpenDetails?: () => void;
  onAction?: () => void;
  onShare?: () => void;
  actionSlot?: ReactNode;
  footerSlot?: ReactNode;
  language?: Language;
  showRating?: boolean;
  showAction?: boolean;
  showLevel?: boolean;
  showSocialStats?: boolean;
  showShareAction?: boolean;
  shareCount?: number;
  topTags?: SocialProfileMiniTopTag[];
};

type SocialProfileMiniCardProps =
  | ({ data: SocialProfileMiniData } & CommonSocialProfileMiniCardProps)
  | ({
      data: InfoCardData;
      actionLabel?: SocialProfileMiniActionLabel;
      followerCount?: number;
      followingCount?: number;
    } & CommonSocialProfileMiniCardProps)
  | ({
      customer: Customer;
      actionLabel?: SocialProfileMiniActionLabel;
      followerCount?: number;
      followingCount?: number;
    } & CommonSocialProfileMiniCardProps)
  | ({
      technician: Technician;
      actionLabel?: SocialProfileMiniActionLabel;
      followerCount?: number;
      followingCount?: number;
    } & CommonSocialProfileMiniCardProps)
  | ({
      store: Store;
      actionLabel?: SocialProfileMiniActionLabel;
      followerCount?: number;
      followingCount?: number;
    } & CommonSocialProfileMiniCardProps);

const scoreOutOfFive = (value?: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.min(5, Math.max(0, value > 5 ? value / 2 : value)).toFixed(1)}/5`
    : "";

export function buildServiceMiniCardData(
  service: ServiceItem,
  provider?: Store | Technician,
): SocialProfileMiniData {
  const serviceInfo = mapServiceItemToUnifiedData(service, provider);
  return {
    id: service.id,
    entityType: "service",
    displayName: service.name,
    avatar: service.cover,
    coverImage: service.cover,
    headline: service.summary,
    regionLabel: service.serviceAreas[0] ?? "",
    primaryLabel: "服务",
    levelLabel: "",
    scoreLabel: "",
    scoreValue: "",
    followerCount: 0,
    followingCount: 0,
    usageCount: serviceInfo.usageCount ?? undefined,
    serviceTags: service.tags,
    serviceInfo,
    detailPath: `/services/${service.id}`,
  };
}

function fromCustomer(customer: Customer): SocialProfileMiniData {
  const membership = resolveCustomerMembership(customer.memberLevel);
  return {
    id: customer.systemId || customer.id,
    entityType: "user",
    displayName: customer.nickname?.trim() || customer.name,
    avatar: customer.avatar,
    coverImage: customer.avatar,
    headline: customer.bio,
    regionLabel: "",
    primaryLabel: membership.label,
    membershipKind: membership.kind,
    levelLabel: customer.experienceLevel
      ? `Lv.${customer.experienceLevel}`
      : "",
    scoreLabel: "信用度",
    scoreValue: scoreOutOfFive(customer.activeScore / 20),
    followerCount: 0,
    followingCount: 0,
    languages: customer.languages ?? [],
    detailPath: `/users/${customer.systemId || customer.id}`,
  };
}

function fromTechnician(technician: Technician): SocialProfileMiniData {
  return {
    id: technician.systemId || technician.id,
    entityType: "technician",
    displayName: technician.nickname?.trim() || technician.name,
    avatar: technician.avatar,
    coverImage: technician.gallery?.[0] || technician.avatar,
    headline: technician.bio,
    regionLabel: technician.serviceAreas[0] ?? "",
    addressTags: technician.serviceAreas,
    primaryLabel: "技师",
    levelLabel: "",
    scoreLabel: "服务评价",
    scoreValue: scoreOutOfFive(technician.rating),
    followerCount: technician.favoriteCount ?? 0,
    followingCount: technician.reviewCount,
    shareCount: technician.shareCount,
    favoriteCount: technician.favoriteCount,
    completedOrderCount: technician.orderCount,
    distanceKm: technician.distanceKm,
    languages: technician.languages,
    specialReviewTags: technician.specialReviewTags ?? [],
  };
}

function fromStore(store: Store): SocialProfileMiniData {
  return {
    id: store.systemId || store.id,
    entityType: "shop",
    displayName: store.name,
    avatar: store.cover,
    coverImage: store.gallery[0] || store.cover,
    headline: store.description,
    regionLabel: store.area,
    addressLabel: store.area,
    addressValue: store.address,
    primaryLabel: "店铺",
    levelLabel: "",
    scoreLabel: "服务评价",
    scoreValue: scoreOutOfFive(store.rating),
    followerCount: store.favoriteCount ?? 0,
    followingCount: store.reviewCount,
    shareCount: store.shareCount,
    favoriteCount: store.favoriteCount,
    distanceKm: store.distanceKm,
    serviceTags: store.tags,
    detailPath: `/stores/${store.systemId || store.id}`,
  };
}

function fromInfoCard(source: InfoCardData): SocialProfileMiniData {
  return {
    id: source.id,
    entityType: source.entityType,
    displayName: source.displayName,
    avatar: source.avatar || source.coverImage || "",
    coverImage: source.coverImage || source.avatar || "",
    headline: source.description || source.subtitle,
    regionLabel: source.region || source.serviceArea || "",
    addressValue:
      source.entityType === "shop"
        ? source.serviceArea || source.region
        : undefined,
    primaryLabel:
      source.entityType === "shop"
        ? "店铺"
        : source.entityType === "technician"
          ? "技师"
          : "用户",
    levelLabel: "",
    scoreLabel: source.ratingType ?? "评分",
    scoreValue: scoreOutOfFive(source.rating),
    followerCount: 0,
    followingCount: source.reviewCount ?? 0,
    completedOrderCount:
      source.entityType === "technician"
        ? source.completedOrderCount
        : undefined,
    serviceTags: source.tags,
    languages: "languages" in source ? source.languages : [],
    detailPath: source.detailPath,
  };
}

export function buildSocialProfileMiniCardData(
  source: Customer | Store | Technician | InfoCardData | SocialProfileMiniData,
  options: {
    actionLabel?: SocialProfileMiniActionLabel;
    followerCount?: number;
    followingCount?: number;
  } = {},
): SocialProfileMiniData {
  const data =
    "entityType" in source && "scoreLabel" in source
      ? source
      : "entityType" in source
        ? fromInfoCard(source)
        : "memberLevel" in source
          ? fromCustomer(source)
          : "cover" in source
            ? fromStore(source)
            : fromTechnician(source);
  return {
    ...data,
    actionLabel: options.actionLabel ?? data.actionLabel,
    followerCount: options.followerCount ?? data.followerCount,
    followingCount: options.followingCount ?? data.followingCount,
  };
}

function normalizeData(
  data: SocialProfileMiniData,
  shareCount?: number,
): UnifiedEntityInfoCardData {
  const kind =
    data.entityType === "shop"
      ? "shop"
      : data.entityType === "technician"
        ? "technician"
        : "user";
  const parsedRating = Number.parseFloat(data.scoreValue);
  const engagementTarget =
    kind === "shop" && /^shop\d{10}$/u.test(data.id)
      ? { targetType: "shop" as const, publicId: data.id }
      : kind === "technician" && /^s\d{10}$/u.test(data.id)
        ? { targetType: "technician" as const, publicId: data.id }
        : null;
  return {
    kind,
    id: data.id,
    name: data.displayName,
    imageUrl: data.coverImage || data.avatar || null,
    description: data.headline ?? null,
    address: data.addressValue ?? null,
    languages: data.languages ?? [],
    tags: data.serviceTags ?? data.addressTags ?? [],
    rating: Number.isFinite(parsedRating) ? parsedRating : null,
    reviewCount: data.followingCount,
    completedOrderCount: data.completedOrderCount,
    distanceKm: data.distanceKm,
    favoriteCount: data.favoriteCount ?? data.followerCount,
    shareCount: shareCount ?? data.shareCount,
    engagementTarget,
    isFavorited: data.isFavorited,
    specialReviewTags: data.specialReviewTags ?? [],
  };
}

export function SocialProfileMiniCard(props: SocialProfileMiniCardProps) {
  const location = useLocation();
  const source =
    "data" in props
      ? props.data
      : "customer" in props
        ? props.customer
        : "technician" in props
          ? props.technician
          : props.store;
  const data = buildSocialProfileMiniCardData(source, {
    actionLabel: "actionLabel" in props ? props.actionLabel : undefined,
    followerCount: "followerCount" in props ? props.followerCount : undefined,
    followingCount:
      "followingCount" in props ? props.followingCount : undefined,
  });
  const scope = location.pathname.startsWith("/merchant/")
    ? "merchant"
    : location.pathname.startsWith("/technician/")
      ? "technician"
      : "user";
  const resolvedDetailTo =
    props.detailTo ??
    ("technician" in props
      ? getScopedTechnicianDynamicPath(scope, props.technician)
      : data.entityType === "technician"
        ? getScopedProfileDetailPath(scope, "technician", data.id)
        : data.detailPath);
  if (data.entityType === "service" && data.serviceInfo) {
    return (
      <UnifiedServiceInfoCard
        actionSlot={props.showAction === false ? undefined : props.actionSlot}
        className={props.className}
        data={data.serviceInfo}
        detailTo={resolvedDetailTo}
        language={props.language}
        onOpenDetails={props.onOpenDetails}
      />
    );
  }
  const normalized =
    "customer" in props
      ? mapCustomerToUnifiedEntityData(props.customer)
      : "technician" in props
        ? mapTechnicianToUnifiedEntityData(props.technician)
        : "store" in props
          ? mapStoreToUnifiedEntityData(props.store)
          : normalizeData(data, props.shareCount);
  return (
    <UnifiedEntityInfoCard
      actionSlot={props.showAction === false ? undefined : props.actionSlot}
      className={props.className}
      data={normalized}
      detailTo={resolvedDetailTo}
      language={props.language}
      onOpenDetails={props.onOpenDetails}
    />
  );
}
