import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { IconMetricAction } from "../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { shareContent } from "../../lib/share";
import { cn } from "../../lib/utils";
import { findStoreById } from "../../state/entityStore";
import { useClientTheme } from "../../theme/ClientThemeProvider";
import type { Customer, ServiceItem, Store, Technician } from "../../types/domain";
import type { InfoCardData } from "../info-card";
import { getScopedProfileDetailPath } from "../profile-detail/paths";
import { CustomerMembershipIcon } from "./CustomerMembershipIcon";
import { SimpleRatingBadge } from "./SimpleRatingBadge";
import { TechnicianPublicInfoCardModal } from "./TechnicianPublicInfoCard";
import { getCustomerLevelLabel, resolveCustomerMembership, type SocialProfileMiniMembershipKind } from "./customerMembership";

export type SocialProfileMiniActionLabel = "关注" | "关注中" | "好友";
type SocialProfileMiniTagTone = "neutral" | "green" | "yellow" | "purple";
type SocialProfileMiniTopTag = string | { label: string; tone?: SocialProfileMiniTagTone };

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
  followerCount: number;
  followingCount: number;
  shareCount?: number;
  usageCount?: number;
  actionLabel?: SocialProfileMiniActionLabel;
  detailPath?: string;
};

type SocialProfileMiniCardProps =
  | ({
      data: SocialProfileMiniData;
    } & CommonSocialProfileMiniCardProps)
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

type CommonSocialProfileMiniCardProps = {
  className?: string;
  dark?: boolean;
  detailTo?: string;
  onOpenDetails?: () => void;
  onAction?: () => void;
  onShare?: () => void;
  actionSlot?: ReactNode;
  showAction?: boolean;
  showShareAction?: boolean;
  shareCount?: number;
  topTags?: SocialProfileMiniTopTag[];
};

function hashSeed(value: string) {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatCompactCount(value: number) {
  const absValue = Math.abs(value);
  const units = [
    { threshold: 1_000_000_000, suffix: "b" },
    { threshold: 1_000_000, suffix: "m" },
    { threshold: 1_000, suffix: "k" }
  ];
  const unit = units.find((item) => absValue >= item.threshold);

  if (!unit) {
    return `${value}`;
  }

  const compactValue = value / unit.threshold;
  const fractionDigits = Math.abs(compactValue) >= 10 || Number.isInteger(compactValue) ? 0 : 1;

  return `${Number(compactValue.toFixed(fractionDigits))}${unit.suffix}`;
}

function splitScoreValue(value: string) {
  const [score, maxScore] = value.split("/");

  return {
    score: score || value,
    maxScore: maxScore ? `/${maxScore}` : ""
  };
}

function scoreOutOfFive(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.0/5";
  }

  const normalized = value > 5 ? value / 2 : value;

  return `${clamp(normalized, 0, 5).toFixed(1)}/5`;
}

function socialCounts(id: string, followerCount?: number, followingCount?: number) {
  const seed = hashSeed(id);

  return {
    followerCount: followerCount ?? 120 + (seed * 17) % 3200,
    followingCount: followingCount ?? 36 + (seed * 11) % 520
  };
}

function genderLabelFromTechnician(gender?: Technician["gender"]) {
  if (gender === "female") {
    return "女性";
  }

  if (gender === "male") {
    return "男性";
  }

  return "性别未公开";
}

function levelFromCount(value: number) {
  return `Lv.${clamp(Math.round(value), 1, 100)}`;
}

function resolveTechnicianAddress(technician: Technician) {
  const affiliatedStore = technician.identityLabel === "店铺所属技师" ? findStoreById(technician.storeId) : undefined;

  if (affiliatedStore) {
    return {
      regionLabel: affiliatedStore.area,
      addressLabel: affiliatedStore.area,
      addressValue: affiliatedStore.address
    };
  }

  const serviceAreas = Array.from(new Set(technician.serviceAreas.filter(Boolean))).slice(0, 4);

  return {
    regionLabel: serviceAreas[0] || "东京",
    addressTags: serviceAreas.length ? serviceAreas : ["东京"]
  };
}

function isStoreProvider(provider?: Store | Technician): provider is Store {
  return Boolean(provider && "address" in provider && "cover" in provider);
}

export function buildServiceMiniCardData(service: ServiceItem, provider?: Store | Technician): SocialProfileMiniData {
  const providerAddress = provider
    ? isStoreProvider(provider)
      ? {
          regionLabel: provider.area,
          addressLabel: provider.area,
          addressValue: provider.address
        }
      : resolveTechnicianAddress(provider)
    : {
        regionLabel: service.serviceAreas[0] ?? "东京",
        addressTags: service.serviceAreas.slice(0, 4)
      };

  return {
    id: service.id,
    entityType: "service",
    displayName: service.name,
    avatar: service.cover,
    coverImage: service.cover,
    headline: service.summary,
    genderLabel: "服务",
    ...providerAddress,
    primaryLabel: "服务",
    kycVerified: false,
    serviceTags: service.tags.slice(0, 10),
    levelLabel: "",
    scoreLabel: "",
    scoreValue: "",
    followerCount: 0,
    followingCount: 0,
    usageCount: service.sales,
    detailPath: `/services/${service.id}`
  };
}

function buildFromCustomer(customer: Customer, options: { actionLabel?: SocialProfileMiniActionLabel; followerCount?: number; followingCount?: number }): SocialProfileMiniData {
  const counts = socialCounts(customer.id, options.followerCount, options.followingCount);
  const creditScore = customer.activeScore / 20;
  const membership = resolveCustomerMembership(customer.memberLevel);

  return {
    id: customer.id,
    entityType: "user",
    displayName: customer.nickname?.trim() || customer.name,
    avatar: customer.avatar,
    coverImage: customer.avatar,
    headline: customer.bio || customer.tags.slice(0, 2).join(" / "),
    genderLabel: "性别未公开",
    regionLabel: customer.tags.find((tag) => /东京|銀座|银座|新宿|涩谷|六本木|品川|池袋|全国/.test(tag)) ?? "东京",
    addressValue: customer.tags.find((tag) => /东京|銀座|银座|新宿|涩谷|六本木|品川|池袋|全国/.test(tag)) ?? "东京",
    primaryLabel: membership.label,
    membershipKind: membership.kind,
    kycVerified: true,
    levelLabel: getCustomerLevelLabel(customer.activeScore),
    scoreLabel: "信用度",
    scoreValue: scoreOutOfFive(creditScore),
    actionLabel: options.actionLabel ?? "关注",
    ...counts
  };
}

function buildFromTechnician(technician: Technician, options: { actionLabel?: SocialProfileMiniActionLabel; followerCount?: number; followingCount?: number }): SocialProfileMiniData {
  const counts = socialCounts(technician.id, options.followerCount, options.followingCount);
  const address = resolveTechnicianAddress(technician);

  return {
    id: technician.id,
    entityType: "technician",
    displayName: technician.nickname?.trim() || technician.name,
    avatar: technician.avatar,
    coverImage: technician.gallery?.[0] || technician.avatar,
    headline: technician.bio || technician.profileTags?.slice(0, 2).join(" / ") || technician.skills.slice(0, 2).join(" / "),
    genderLabel: genderLabelFromTechnician(technician.gender),
    ...address,
    primaryLabel: "技师",
    kycVerified: true,
    levelLabel: levelFromCount(technician.orderCount / 15),
    scoreLabel: "服务评价",
    scoreValue: scoreOutOfFive(technician.rating),
    actionLabel: options.actionLabel ?? "关注",
    ...counts
  };
}

function buildFromStore(store: Store, options: { actionLabel?: SocialProfileMiniActionLabel; followerCount?: number; followingCount?: number }): SocialProfileMiniData {
  const counts = socialCounts(store.id, options.followerCount, options.followingCount);

  return {
    id: store.id,
    entityType: "shop",
    displayName: store.name,
    avatar: store.cover,
    coverImage: store.gallery[0] || store.cover,
    headline: store.rankLabel || store.description,
    genderLabel: "店铺",
    regionLabel: store.area,
    addressLabel: store.area,
    addressValue: store.address,
    primaryLabel: "店铺",
    kycVerified: true,
    serviceTags: store.tags.slice(0, 10),
    levelLabel: levelFromCount(store.reviewCount / 24),
    scoreLabel: "服务评价",
    scoreValue: scoreOutOfFive(store.rating),
    actionLabel: options.actionLabel ?? "关注",
    ...counts
  };
}

export function buildSocialProfileMiniCardData(
  source: Customer | Store | Technician | InfoCardData | SocialProfileMiniData,
  options: { actionLabel?: SocialProfileMiniActionLabel; followerCount?: number; followingCount?: number } = {}
): SocialProfileMiniData {
  if ("entityType" in source && "scoreLabel" in source) {
    return {
      ...source,
      actionLabel: options.actionLabel ?? source.actionLabel,
      followerCount: options.followerCount ?? source.followerCount,
      followingCount: options.followingCount ?? source.followingCount
    };
  }

  if ("entityType" in source) {
    const counts = socialCounts(source.id, options.followerCount, options.followingCount);
    const isUser = source.entityType === "user";
    const isTechnician = source.entityType === "technician";
    const genderLabel = source.entityType === "shop" ? "店铺" : source.gender || "性别未公开";
    const membership = isUser ? resolveCustomerMembership(source.subtitle || "") : null;

    return {
      id: source.id,
      entityType: source.entityType,
      displayName: source.displayName,
      avatar: source.avatar || source.coverImage || "",
      coverImage: source.coverImage || source.avatar || "",
      headline: source.description || source.subtitle,
      genderLabel,
      regionLabel: source.region || source.serviceArea || "东京",
      addressLabel: source.entityType === "shop" ? source.region || source.serviceArea : undefined,
      addressValue: source.region || source.serviceArea || "东京",
      primaryLabel: membership?.label ?? (isTechnician ? "技师" : "店铺"),
      membershipKind: membership?.kind,
      kycVerified: true,
      serviceTags: source.entityType === "shop" && "tags" in source ? source.tags.slice(0, 10) : undefined,
      levelLabel: isUser ? `Lv.${clamp(Math.round((source.rating ?? 4) * 20), 1, 100)}` : levelFromCount((source.reviewCount ?? 100) / 24),
      scoreLabel: isUser ? "信用度" : "服务评价",
      scoreValue: scoreOutOfFive(source.rating),
      actionLabel: options.actionLabel ?? "关注",
      detailPath: source.detailPath,
      ...counts
    };
  }

  if ("memberLevel" in source) {
    return buildFromCustomer(source, options);
  }

  if ("cover" in source) {
    return buildFromStore(source, options);
  }

  return buildFromTechnician(source, options);
}

function InteractiveArea({
  children,
  className,
  detailTo,
  onOpenDetails
}: {
  children: ReactNode;
  className?: string;
  detailTo?: string;
  onOpenDetails?: () => void;
}) {
  if (detailTo) {
    return (
      <Link className={className} to={detailTo}>
        {children}
      </Link>
    );
  }

  if (onOpenDetails) {
    return (
      <button className={className} onClick={onOpenDetails} type="button">
        {children}
      </button>
    );
  }

  return <div className={className}>{children}</div>;
}

function getSystemCoverPalette(theme: string, dark: boolean) {
  if (theme === "neon-pink") {
    return {
      base: "linear-gradient(135deg, #100718 0%, #1f0e2d 48%, #050307 100%)",
      tileA: "linear-gradient(135deg, rgba(63,30,82,0.76), rgba(16,8,22,0.96))",
      tileB: "linear-gradient(135deg, rgba(126,56,146,0.22), rgba(8,4,14,0.88))",
      tileC: "linear-gradient(135deg, rgba(36,16,52,0.86), rgba(5,3,8,0.92))",
      grain: "rgba(217,167,255,0.07)",
      shine: "rgba(212,132,255,0.16)",
      shade: "rgba(0,0,0,0.46)"
    };
  }

  if (!dark) {
    if (theme === "light-green") {
      return {
        base: "linear-gradient(135deg, #ffffff 0%, #eef7f1 46%, #d7e6dd 100%)",
        tileA: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(213,232,220,0.96))",
        tileB: "linear-gradient(135deg, rgba(239,249,243,0.8), rgba(168,197,178,0.68))",
        tileC: "linear-gradient(135deg, rgba(255,255,255,0.86), rgba(192,216,201,0.82))",
        grain: "rgba(27,101,70,0.055)",
        shine: "rgba(255,255,255,0.92)",
        shade: "rgba(67,112,88,0.14)"
      };
    }

    return {
      base: "linear-gradient(135deg, #ffffff 0%, #f1f1ee 46%, #d9dad5 100%)",
      tileA: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(220,221,216,0.96))",
      tileB: "linear-gradient(135deg, rgba(243,244,240,0.76), rgba(190,193,187,0.72))",
      tileC: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(202,204,198,0.84))",
      grain: "rgba(32,32,32,0.045)",
      shine: "rgba(255,255,255,0.92)",
      shade: "rgba(118,120,116,0.12)"
    };
  }

  if (theme === "dark-green") {
    return {
      base: "linear-gradient(135deg, #020704 0%, #07150e 46%, #010302 100%)",
      tileA: "linear-gradient(135deg, rgba(18,46,31,0.76), rgba(2,8,5,0.96))",
      tileB: "linear-gradient(135deg, rgba(52,122,79,0.18), rgba(1,6,4,0.88))",
      tileC: "linear-gradient(135deg, rgba(8,23,16,0.9), rgba(1,4,3,0.92))",
      grain: "rgba(166,255,200,0.07)",
      shine: "rgba(109,255,171,0.12)",
      shade: "rgba(0,0,0,0.5)"
    };
  }

  if (theme === "black-gold") {
    return {
      base: "linear-gradient(135deg, #050403 0%, #17120a 48%, #030303 100%)",
      tileA: "linear-gradient(135deg, rgba(54,43,24,0.78), rgba(7,6,4,0.96))",
      tileB: "linear-gradient(135deg, rgba(172,132,57,0.2), rgba(9,7,4,0.88))",
      tileC: "linear-gradient(135deg, rgba(29,23,13,0.92), rgba(4,3,2,0.94))",
      grain: "rgba(255,222,150,0.07)",
      shine: "rgba(255,218,133,0.14)",
      shade: "rgba(0,0,0,0.5)"
    };
  }

  return {
    base: "linear-gradient(135deg, #050505 0%, #151515 48%, #000000 100%)",
    tileA: "linear-gradient(135deg, rgba(42,42,42,0.78), rgba(7,7,7,0.98))",
    tileB: "linear-gradient(135deg, rgba(92,92,92,0.16), rgba(5,5,5,0.9))",
    tileC: "linear-gradient(135deg, rgba(24,24,24,0.9), rgba(0,0,0,0.95))",
    grain: "rgba(255,255,255,0.055)",
    shine: "rgba(255,255,255,0.11)",
    shade: "rgba(0,0,0,0.52)"
  };
}

function SystemCoverBackdrop({ dark, seed, theme }: { dark: boolean; seed: string; theme: string }) {
  const variant = hashSeed(seed) % 3;
  const palette = getSystemCoverPalette(theme, dark);
  const offsets = [
    { left: "-40px", top: "-38px", rotate: "-42deg" },
    { left: "-18px", top: "-50px", rotate: "-44deg" },
    { left: "-62px", top: "-34px", rotate: "-40deg" }
  ][variant];

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden" style={{ background: palette.base }}>
      <span
        className="absolute h-[168px] w-[96px] rounded-[2px]"
        style={{
          background: palette.tileA,
          boxShadow: `inset 0 1px 0 ${palette.shine}, inset -18px -18px 32px ${palette.shade}`,
          left: offsets.left,
          top: offsets.top,
          transform: `rotate(${offsets.rotate})`
        }}
      />
      <span
        className="absolute h-[168px] w-[96px] rounded-[2px]"
        style={{
          background: palette.tileB,
          boxShadow: `inset 0 1px 0 ${palette.shine}, inset -16px -20px 34px ${palette.shade}`,
          left: `calc(${offsets.left} + 76px)`,
          top: `calc(${offsets.top} + 16px)`,
          transform: `rotate(${offsets.rotate})`
        }}
      />
      <span
        className="absolute h-[168px] w-[96px] rounded-[2px]"
        style={{
          background: palette.tileC,
          boxShadow: `inset 0 1px 0 ${palette.shine}, inset -20px -18px 34px ${palette.shade}`,
          left: `calc(${offsets.left} + 152px)`,
          top: `calc(${offsets.top} + 2px)`,
          transform: `rotate(${offsets.rotate})`
        }}
      />
      <span
        className="absolute inset-0 opacity-65"
        style={{
          backgroundImage: `repeating-linear-gradient(72deg, transparent 0 2px, ${palette.grain} 2px 3px, transparent 3px 6px)`,
          mixBlendMode: dark ? "screen" : "multiply"
        }}
      />
      <span
        className="absolute inset-0"
        style={{
          background:
            dark
              ? `radial-gradient(circle at 16% 14%, ${palette.shine}, transparent 18%), linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.08) 36%, rgba(0,0,0,0.78) 100%)`
              : `radial-gradient(circle at 16% 14%, ${palette.shine}, transparent 20%), linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.28) 42%, rgba(130,130,130,0.18) 100%)`
        }}
      />
      <span className={cn("absolute inset-x-0 bottom-0 h-12", dark ? "bg-gradient-to-t from-black/66 to-transparent" : "bg-gradient-to-t from-black/20 to-transparent")} />
    </div>
  );
}

function ActionControl({
  count,
  dark,
  label,
  onAction
}: {
  count: number;
  dark: boolean;
  label?: SocialProfileMiniActionLabel;
  onAction?: () => void;
}) {
  if (!label) {
    return null;
  }

  if (["关注", "关注中"].includes(label)) {
    return (
      <IconMetricAction
        active={label === "关注中"}
        count={count}
        icon="heart"
        label={label}
        onClick={onAction}
        size="compactLg"
      />
    );
  }

  const className = cn(
    "shrink-0 rounded-[14px] px-3 py-2 text-xs font-black shadow-panel transition",
    dark
      ? "bg-white/10 text-white"
      : "bg-paper text-ink"
  );

  if (onAction) {
    return (
      <button className={className} onClick={onAction} type="button">
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function KycVerifiedMark({ verified }: { verified?: boolean }) {
  if (!verified) {
    return null;
  }

  return <KycVerifiedBadge />;
}

function getSocialProfileMiniTagToneClassName(tone: SocialProfileMiniTagTone = "neutral", onCover = false, coverDark = true) {
  if (onCover) {
    if (!coverDark) {
      if (tone === "green") {
        return "border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[#176344]";
      }

      if (tone === "yellow") {
        return "border border-[#d49b24]/34 bg-[#f3cf78]/22 text-[#7b560f]";
      }

      if (tone === "purple") {
        return "border border-[#9a86ff]/32 bg-[#7662e8]/16 text-[#4b3ca5]";
      }

      return "border border-black/10 bg-white/34 text-[#3d424a]";
    }

    if (tone === "green") {
      return "border border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]";
    }

    if (tone === "yellow") {
      return "border border-[#f3cf78]/34 bg-[#f3cf78]/16 text-[#ffe5a4]";
    }

    if (tone === "purple") {
      return "border border-[#9a86ff]/36 bg-[#7662e8]/20 text-[#ddd6ff]";
    }

    return "bg-white/[0.12] text-white/88";
  }

  if (tone === "green") {
    return "border border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]";
  }

  if (tone === "yellow") {
    return "border border-[#d49b24]/30 bg-[#fff4d4] text-[#7b560f]";
  }

  if (tone === "purple") {
    return "border border-[#9a86ff]/30 bg-[#f0edff] text-[#4b3ca5]";
  }

  return "bg-white/[0.08] text-[color:var(--client-muted)]";
}

function normalizeSocialProfileMiniTopTags(tags?: SocialProfileMiniTopTag[]) {
  return tags
    ?.map((tag) => (typeof tag === "string" ? { label: tag.trim(), tone: "neutral" as const } : { label: tag.label.trim(), tone: tag.tone ?? "neutral" }))
    .filter((tag) => tag.label.length > 0)
    .slice(0, 4) ?? [];
}

function SocialProfileMiniTag({
  children,
  className,
  coverDark,
  onCover,
  tone
}: {
  children: ReactNode;
  className?: string;
  coverDark?: boolean;
  onCover?: boolean;
  tone?: SocialProfileMiniTagTone;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-3",
        getSocialProfileMiniTagToneClassName(tone, onCover, coverDark),
        className
      )}
    >
      {children}
    </span>
  );
}

function EntityTypeTag({ coverDark, data, onCover }: { coverDark?: boolean; data: SocialProfileMiniData; onCover?: boolean }) {
  if (data.entityType === "user") {
    return null;
  }

  return <SocialProfileMiniTag coverDark={coverDark} onCover={onCover}>{data.primaryLabel}</SocialProfileMiniTag>;
}

function InlineLevelLabel({ children, coverDark, onCover }: { children: ReactNode; coverDark?: boolean; onCover?: boolean }) {
  return (
    <strong className={cn("shrink-0 text-[11px] font-black leading-4", onCover ? (coverDark ? "text-white/72" : "text-[#3d424a]") : "text-[color:var(--client-muted)]")}>
      {children}
    </strong>
  );
}

function InlineIdentityMeta({ coverDark, data, onCover }: { coverDark?: boolean; data: SocialProfileMiniData; onCover?: boolean }) {
  if (data.entityType === "user") {
    return (
      <>
        {data.membershipKind ? <CustomerMembershipIcon className="-my-1" imageClassName="h-7 w-7" kind={data.membershipKind} /> : null}
        <InlineLevelLabel coverDark={coverDark} onCover={onCover}>{data.levelLabel}</InlineLevelLabel>
      </>
    );
  }

  if (data.entityType === "technician") {
    return (
      <>
        <EntityTypeTag coverDark={coverDark} data={data} onCover={onCover} />
        <InlineLevelLabel coverDark={coverDark} onCover={onCover}>{data.levelLabel}</InlineLevelLabel>
      </>
    );
  }

  if (data.entityType === "service") {
    return null;
  }

  return <EntityTypeTag coverDark={coverDark} data={data} onCover={onCover} />;
}

function KindLevelValue({ data }: { data: SocialProfileMiniData }) {
  if (data.entityType === "user" || data.entityType === "technician") {
    return null;
  }

  if (data.entityType === "shop" || data.entityType === "service") {
    return (
      <div className="flex max-h-10 flex-wrap items-center gap-x-1.5 gap-y-1 overflow-hidden text-xs font-black leading-4">
        {data.serviceTags?.slice(0, 10).map((tag) => (
          <SocialProfileMiniTag key={tag}>{tag}</SocialProfileMiniTag>
        ))}
      </div>
    );
  }

  return null;
}

function SocialStatsLine({
  data,
  valueClassName
}: {
  data: SocialProfileMiniData;
  valueClassName?: string;
}) {
  if (data.entityType === "shop") {
    return null;
  }

  if (data.entityType === "service") {
    return (
      <span>
        利用回数：<strong className={valueClassName}>{formatCompactCount(data.usageCount ?? 0)}</strong>
      </span>
    );
  }

  return (
    <>
      <span>
        粉丝：<strong className={valueClassName}>{formatCompactCount(data.followerCount)}</strong>
      </span>
      <span>
        关注：<strong className={valueClassName}>{formatCompactCount(data.followingCount)}</strong>
      </span>
    </>
  );
}

function ScoreMetricBadge({
  className,
  compact = false,
  metricClassName,
  mutedClassName,
  scoreLabel,
  scoreParts
}: {
  className?: string;
  compact?: boolean;
  metricClassName: string;
  mutedClassName: string;
  scoreLabel: string;
  scoreParts: ReturnType<typeof splitScoreValue>;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col justify-center",
        compact
          ? "h-9 min-w-[54px] rounded-[10px] px-1.5 py-1 shadow-[0_8px_18px_rgba(0,0,0,0.22)] ring-1 ring-white/15 backdrop-blur-md"
          : "h-11 min-w-[66px] rounded-[13px] px-2 py-1",
        metricClassName,
        className
      )}
    >
      <p className={cn("font-black leading-none", compact ? "text-[8px]" : "text-[9px]", mutedClassName)}>{scoreLabel}</p>
      <div className={cn("flex items-end gap-0.5", compact ? "mt-px" : "mt-0.5")}>
        <strong className={cn("block font-black leading-none text-[color:var(--client-primary)]", compact ? "text-[17px]" : "text-[21px]")}>
          {scoreParts.score}
        </strong>
        {scoreParts.maxScore ? (
          <span className={cn("font-black leading-none", compact ? "pb-px text-[10px]" : "pb-0.5 text-xs", mutedClassName)}>{scoreParts.maxScore}</span>
        ) : null}
      </div>
    </div>
  );
}

export function SocialProfileMiniCard(props: SocialProfileMiniCardProps) {
  const { className, dark = false, detailTo, onOpenDetails, onAction, onShare, actionSlot, showAction = true, showShareAction = false, shareCount, topTags } = props;
  const { isNight, theme } = useClientTheme();
  const location = useLocation();
  const [technicianInfoCardOpen, setTechnicianInfoCardOpen] = useState(false);
  const sourceTechnician = "technician" in props ? props.technician : null;
  const data = buildSocialProfileMiniCardData(
    "data" in props ? props.data : "customer" in props ? props.customer : "technician" in props ? props.technician : props.store,
    {
      actionLabel: "actionLabel" in props ? props.actionLabel : undefined,
      followerCount: "followerCount" in props ? props.followerCount : undefined,
      followingCount: "followingCount" in props ? props.followingCount : undefined
    }
  );
  const resolvedDetailTo = detailTo ?? data.detailPath;
  const currentScope = location.pathname.startsWith("/merchant/") ? "merchant" : location.pathname.startsWith("/technician/") ? "technician" : "user";
  const technicianDynamicPath = sourceTechnician ? getScopedProfileDetailPath(currentScope, "technician", sourceTechnician.id) : "";
  const shouldOpenTechnicianInfoCard = Boolean(sourceTechnician && !onOpenDetails);
  const avatarOnOpenDetails = onOpenDetails ?? (shouldOpenTechnicianInfoCard ? () => setTechnicianInfoCardOpen(true) : undefined);
  const avatarDetailTo = avatarOnOpenDetails ? undefined : resolvedDetailTo;
  const scoreParts = splitScoreValue(data.scoreValue);
  const isService = data.entityType === "service";
  const usesSimpleScorePill = data.scoreLabel === "服务评价";
  const shouldOverlayScoreOnAvatar = (data.entityType === "user" || data.entityType === "shop" || data.entityType === "technician") && !usesSimpleScorePill;
  const hasPrimaryAction = Boolean(actionSlot || data.actionLabel);
  const hasShareAction = showAction && showShareAction;
  const hasAction = showAction && Boolean(hasPrimaryAction || showShareAction);
  const topTagRightClassName = hasShareAction && hasPrimaryAction ? "right-[102px]" : hasAction ? "right-14" : "right-3.5";
  const resolvedShareCount = Math.max(0, Math.floor(shareCount ?? data.shareCount ?? 0));
  const visibleTopTags = normalizeSocialProfileMiniTopTags(topTags);
  const coverDark = dark || isNight;
  const addressLabel = data.addressLabel?.trim();
  const visibleAddressLabel = addressLabel && addressLabel !== "地址" && addressLabel !== data.addressValue ? addressLabel : undefined;
  const cardClassName = dark
    ? "border-white/10 bg-[#15120f] text-white"
    : "border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-surface)] text-[color:var(--client-text)]";
  const mutedClassName = dark ? "text-white/58" : "text-[color:var(--client-muted)]";
  const metricClassName = dark ? "bg-white/[0.06]" : "bg-[color:color-mix(in_srgb,var(--client-elevated)_78%,transparent)]";
  const handleShare = () => {
    if (onShare) {
      onShare();
      return;
    }

    void shareContent({
      title: `${data.displayName} | NeeDo`,
      text: data.regionLabel ? `${data.displayName} · ${data.regionLabel}` : data.displayName,
      url: resolvedDetailTo,
      copiedMessage: "链接已复制，可以转发给联系人"
    });
  };

  return (
    <>
    <article className={cn("overflow-hidden rounded-[24px] border shadow-panel", cardClassName, className)}>
      <div className="relative h-[92px] bg-ink">
        <InteractiveArea className="focus-ring absolute inset-0 block overflow-hidden text-left" detailTo={resolvedDetailTo} onOpenDetails={onOpenDetails}>
          <SystemCoverBackdrop dark={coverDark} seed={`${data.entityType}-${data.id}`} theme={theme} />
        </InteractiveArea>
        <InteractiveArea className="focus-ring absolute top-11 left-3.5 z-10 block h-36 w-36 text-left" detailTo={avatarDetailTo} onOpenDetails={avatarOnOpenDetails}>
          <div className="relative h-full w-full">
            <AvatarImage
              alt={data.displayName}
              className="h-full w-full rounded-[28px] border-[4px] border-[color:var(--client-surface)] shadow-soft"
              src={data.avatar}
            />
            {shouldOverlayScoreOnAvatar ? (
              <ScoreMetricBadge
                className="pointer-events-none absolute bottom-0 right-0"
                compact
                metricClassName={metricClassName}
                mutedClassName={mutedClassName}
                scoreLabel={data.scoreLabel}
                scoreParts={scoreParts}
              />
            ) : null}
          </div>
        </InteractiveArea>
        {usesSimpleScorePill ? <SimpleRatingBadge className="absolute left-3.5 top-2 z-20" value={scoreParts.score} /> : null}
        {hasAction ? (
          <div className="absolute right-[1.5px] top-2 z-20 flex items-start -space-x-[5.5px]">
            {hasPrimaryAction ? actionSlot ?? <ActionControl count={data.followerCount} dark={coverDark} label={data.actionLabel} onAction={onAction} /> : null}
            {hasShareAction ? (
              <IconMetricAction
                count={resolvedShareCount}
                icon="share"
                label="转发"
                onClick={handleShare}
                size="compactLg"
              />
            ) : null}
          </div>
        ) : null}
        {visibleTopTags.length > 0 ? (
          <div className={cn("absolute top-3 z-20 flex max-h-7 flex-wrap items-center gap-1 overflow-hidden", usesSimpleScorePill ? "left-[72px]" : "left-3.5", topTagRightClassName)}>
            {visibleTopTags.map((tag) => (
              <SocialProfileMiniTag coverDark={coverDark} key={tag.label} onCover tone={tag.tone}>{tag.label}</SocialProfileMiniTag>
            ))}
          </div>
        ) : null}
        <InteractiveArea className="focus-ring absolute bottom-2.5 left-[166px] right-3.5 z-20 block min-w-0 text-left" detailTo={resolvedDetailTo} onOpenDetails={onOpenDetails}>
          <h3 className={cn("flex min-w-0 items-center gap-1.5 text-[18px] font-black leading-6", coverDark ? "text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.74)]" : "text-[#25282d] [text-shadow:0_1px_0_rgba(255,255,255,0.72)]")}>
            <span className={cn("min-w-0 truncate", data.entityType === "shop" ? "max-w-[calc(100%-48px)]" : data.entityType === "service" ? "max-w-full" : "max-w-[calc(100%-92px)]")}>{data.displayName}</span>
            {data.entityType !== "shop" && data.entityType !== "service" ? <KycVerifiedMark verified={data.kycVerified ?? true} /> : null}
            <InlineIdentityMeta coverDark={coverDark} data={data} onCover />
          </h3>
        </InteractiveArea>
      </div>

      <div className="px-3.5 pb-3 pt-2">
        <div className="ml-[156px] min-h-[90px]">
          <InteractiveArea className="block min-w-0 text-left" detailTo={resolvedDetailTo} onOpenDetails={onOpenDetails}>
            <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-black leading-4", mutedClassName)}>
              <SocialStatsLine data={data} valueClassName={cn(dark ? "text-white" : "text-[color:var(--client-text)]")} />
            </div>
            {data.addressTags?.length ? (
              <div className="mt-0.5 flex max-h-9 flex-wrap items-center gap-1 overflow-hidden text-[11px] font-black leading-4">
                {data.addressTags.slice(0, 6).map((tag) => (
                  <SocialProfileMiniTag key={tag}>{tag}</SocialProfileMiniTag>
                ))}
              </div>
            ) : data.addressValue ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-black leading-4">
                {visibleAddressLabel ? (
                  <SocialProfileMiniTag>{visibleAddressLabel}</SocialProfileMiniTag>
                ) : null}
                <span className={cn("min-w-0 truncate", mutedClassName)}>{data.addressValue}</span>
              </div>
            ) : null}
            {isService && data.headline ? <p className={cn("mt-1 line-clamp-2 text-[11px] font-bold leading-4", mutedClassName)}>{data.headline}</p> : null}
            <div className="mt-0.5 flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <div className="min-h-6">
                  <KindLevelValue data={data} />
                </div>
              </div>
              {isService || shouldOverlayScoreOnAvatar || usesSimpleScorePill ? null : (
                <ScoreMetricBadge metricClassName={metricClassName} mutedClassName={mutedClassName} scoreLabel={data.scoreLabel} scoreParts={scoreParts} />
              )}
            </div>
          </InteractiveArea>
        </div>
      </div>
    </article>
    <TechnicianPublicInfoCardModal
      dynamicTo={technicianDynamicPath}
      onClose={() => setTechnicianInfoCardOpen(false)}
      open={technicianInfoCardOpen}
      technician={sourceTechnician}
      themeScope={currentScope}
    />
    </>
  );
}
