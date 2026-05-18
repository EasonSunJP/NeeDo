import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AppIcon,
  FeatureSegmentedTabs,
  FloatingBackButton,
  FloatingTopRightControl,
  IconButton,
  MetaPill,
  PrimaryButton,
  SecondaryButton,
  SurfacePanel,
  floatingHeaderControlButtonClassName,
  type IconName
} from "../../../components/client-ui/AppScaffold";
import { FeatureCarousel, type FeatureCarouselSlide } from "../../../components/client-ui/FeatureCarousel";
import { FloatingActionButton } from "../../../components/mobile/FloatingActionButton";
import { merchantNavItems, technicianNavItems, userNavItems } from "../../../components/mobile/navItems";
import { InteractiveAvatar } from "../../../components/ui/InteractiveAvatar";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { Button } from "../../../components/ui/Button";
import { KycVerifiedBadge } from "../../../components/ui/KycVerifiedBadge";
import { NotificationBadge } from "../../../components/ui/NotificationBadge";
import { PinBadgeIcon } from "../../../components/ui/PinBadgeIcon";
import { TranslationIcon } from "../../../components/ui/LanguageSwitcher";
import { ShareNetworkIcon } from "../../../components/ui/ShareNetworkIcon";
import { TitleWithInfo } from "../../../components/ui/TitleWithInfo";
import { getGeneratedImageThumbnailUrl } from "../../../lib/imageThumbnails";
import { readImageFileAsDataUrl } from "../../../lib/imageUpload";
import { shareContent } from "../../../lib/share";
import { cn } from "../../../lib/utils";
import { CustomerMembershipBadge } from "../../../shared/profile-card";
import { resolveCustomerMembership } from "../../../shared/profile-card/customerMembership";
import { getImRoleConfig } from "../../im/role-config";
import { useImStore } from "../../im/store";
import type { ImUser } from "../../im/model";
import { useSocial } from "../context";
import { socialPaths } from "../paths";
import type { SocialMediaItem, SocialPortalScope, SocialPost, SocialProfile, SocialProfileTab, SocialTimelineFilterTab } from "../types";
import {
  buildAbsoluteUrl,
  buildProfileMentionMatcher,
  formatCount,
  formatHashtagLabel,
  formatJoinedDate,
  formatRelativeTime,
  profileMentionLabel,
  profileKey,
  socialHashtagChipClassName
} from "../utils";

type ProfileFieldTone = "neutral" | "primary" | "accent";

type ProfileFieldItem = {
  key: string;
  label: string;
  value: string;
  tone?: ProfileFieldTone;
};

type ProfileFieldSection = {
  title: string;
  description?: string;
  items: ProfileFieldItem[];
};

const profileFieldLabelMap: Record<string, string> = {
  memberLevel: "会员种类",
  languages: "服务语言",
  points: "积分",
  nextBookingAt: "下次预约",
  openStatus: "营业状态",
  address: "地址摘要",
  bookAction: "预约入口",
  businessHours: "营业时间",
  priceLabel: "价格区间",
  announcement: "当前公告",
  mediaFocus: "内容焦点",
  serviceTags: "服务标签",
  bookingAction: "预约入口",
  nextAvailability: "最近可约",
  recentAvailability: "最近可约"
};
const hiddenProfileFieldKeys = new Set(["memberLevel", "memberLevelLabel", "points", "nextBookingAt"]);

export function navItemsForSocialScope(scope: SocialPortalScope) {
  if (scope === "merchant") {
    return merchantNavItems;
  }

  if (scope === "technician") {
    return technicianNavItems;
  }

  return userNavItems;
}

export function SocialFloatingTopAction({
  icon,
  label,
  to,
  onClick,
  className
}: {
  icon: IconName;
  label: string;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      <AppIcon className="h-5 w-5" name={icon} />
      <span className="sr-only">{label}</span>
    </>
  );
  const actionClassName = cn(floatingHeaderControlButtonClassName, className);

  return (
    <FloatingTopRightControl>
      {to ? (
        <Link aria-label={label} className={actionClassName} to={to}>
          {content}
        </Link>
      ) : (
        <button aria-label={label} className={actionClassName} onClick={onClick} type="button">
          {content}
        </button>
      )}
    </FloatingTopRightControl>
  );
}

export function IdentityBadge({ entityType }: { entityType: SocialProfile["entityType"] }) {
  if (entityType === "user") {
    return null;
  }

  const label = entityType === "shop" ? "店铺" : "技师";
  const toneClass =
    entityType === "shop"
      ? "bg-[color:color-mix(in_srgb,var(--client-warm)_18%,transparent)] text-[color:color-mix(in_srgb,var(--client-warm)_80%,var(--client-text))]"
      : "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]";

  return (
    <span className={cn("inline-flex h-[21px] shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-black leading-none", toneClass)}>
      {label}
    </span>
  );
}

export function VerificationBadge({ status }: { status: SocialProfile["verifiedStatus"] }) {
  if (status === "none") {
    return null;
  }

  return <KycVerifiedBadge size="label" />;
}

function getEntityLabel(entityType: SocialProfile["entityType"]) {
  return entityType === "shop" ? "店铺" : entityType === "technician" ? "技师" : "用户";
}

function InteractionIcon({
  name,
  active = false
}: {
  name: "reply" | "repost" | "like" | "bookmark" | "share" | "view";
  active?: boolean;
}) {
  const activeClass = active
    ? name === "like"
      ? "text-[color:var(--client-warm)]"
      : name === "share"
        ? "text-[color:var(--client-accent)]"
        : "text-[color:var(--client-primary)]"
    : "text-[color:var(--client-muted)]";

  if (name === "reply") {
    return (
      <svg aria-hidden="true" className={cn("h-4 w-4", activeClass)} fill="none" viewBox="0 0 24 24">
        <path d="M5 6.5h14v9.5H9l-4 3V6.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "repost") {
    return (
      <svg aria-hidden="true" className={cn("h-4 w-4", activeClass)} fill="none" viewBox="0 0 24 24">
        <path d="M7 8h9l-2-2M17 16H8l2 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M16 6v4M8 14v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "like") {
    return (
      <svg aria-hidden="true" className={cn("h-4 w-4", activeClass)} fill="none" viewBox="0 0 24 24">
        <path d="M12 19.2s-6.8-4.3-8.6-8.3C2 7.8 4 5.2 7 5.2c1.8 0 3.2.8 5 2.9 1.8-2.1 3.2-2.9 5-2.9 3 0 5 2.6 3.6 5.7-1.8 4-8.6 8.3-8.6 8.3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (name === "bookmark") {
    return (
      <svg aria-hidden="true" className={cn("h-4 w-4", activeClass)} fill="none" viewBox="0 0 24 24">
        <path d="M7 5.5h10v13l-5-3.5-5 3.5v-13Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (name === "view") {
    return (
      <svg aria-hidden="true" className={cn("h-4 w-4", activeClass)} fill="none" viewBox="0 0 24 24">
        <path d="M2.5 12s3.6-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.6 5.5-9.5 5.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <ShareNetworkIcon className={cn("h-4 w-4", activeClass)} />
  );
}

type SocialPostMenuActionIconName = "translate" | "report" | "block";

export function SocialPostMenuActionIcon({ name, className }: { name: SocialPostMenuActionIconName; className?: string }) {
  if (name === "translate") {
    return <TranslationIcon className={cn("h-5 w-5", className)} />;
  }

  if (name === "report") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5 text-[#ff3b35]", className)} fill="none" viewBox="0 0 24 24">
        <path
          d="M12 3.6c5.1 0 8.9 3.2 8.9 7.6 0 4.3-3.8 7.5-8.9 7.5-1 0-2-.1-2.9-.4l-4.6 2.1 1.2-4.1a7 7 0 0 1-2.6-5.1c0-4.4 3.8-7.6 8.9-7.6Z"
          fill="currentColor"
        />
        <path d="M12 7.3v5.5M12 15.8h.01" stroke="white" strokeLinecap="round" strokeWidth="2.4" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      <path
        d="M3.1 12s3.4-5.6 8.9-5.6c2 0 3.7.7 5.1 1.6M20.9 12s-3.4 5.6-8.9 5.6c-2 0-3.7-.7-5.1-1.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.9"
      />
      <path d="M9.8 14.2a3 3 0 0 1 4.4-4.4M3.8 4.8l16.4 14.4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.1" />
    </svg>
  );
}

export function MediaPlayGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 6.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}

export function socialMediaGridClassName(total: number) {
  if (total === 1) {
    return "grid-cols-1";
  }

  if (total === 2) {
    return "aspect-[2/1] grid-cols-2 grid-rows-1";
  }

  if (total === 3 || total === 4) {
    return "aspect-square grid-cols-2 grid-rows-2";
  }

  return "grid-cols-3";
}

export function socialMediaTileClassName(total: number, index: number) {
  if (total === 1) {
    return "aspect-[4/5] max-h-[520px]";
  }

  if (total === 3 && index === 0) {
    return "row-span-2 h-full min-h-0";
  }

  if (total <= 4) {
    return "h-full min-h-0";
  }

  return "aspect-square";
}

export function getSocialMediaPreviewUrl(media: Pick<SocialMediaItem, "thumbnailUrl" | "url">) {
  return getGeneratedImageThumbnailUrl(media.thumbnailUrl ?? media.url);
}

export function MediaLightbox({
  media,
  activeIndex,
  onClose,
  onChange
}: {
  media: SocialMediaItem[];
  activeIndex: number;
  onClose: () => void;
  onChange: (index: number) => void;
}) {
  const activeMedia = media[activeIndex];
  const canBrowse = media.length > 1;
  const goToIndex = (index: number) => {
    onChange((index + media.length) % media.length);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft" && canBrowse) {
        goToIndex(activeIndex - 1);
      }

      if (event.key === "ArrowRight" && canBrowse) {
        goToIndex(activeIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, canBrowse, onClose]);

  if (!activeMedia) {
    return null;
  }

  return (
    <div aria-modal="true" className="fixed inset-0 z-[90] bg-black/72 text-white backdrop-blur-xl" role="dialog">
      <button aria-label="关闭媒体预览" className="absolute inset-0 cursor-zoom-out" onClick={onClose} type="button" />
      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <div className="safe-header-top flex items-center justify-between px-4 py-3">
          <button
            className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-white/12 px-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/18"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
          <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-black text-white/82 backdrop-blur">
            {activeIndex + 1} / {media.length}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-0 pb-[calc(env(safe-area-inset-bottom)+18px)]">
          {activeMedia.type === "video" ? (
            <video className="pointer-events-auto max-h-full w-full object-contain" controls playsInline poster={activeMedia.thumbnailUrl} src={activeMedia.url} />
          ) : (
            <img alt={activeMedia.alt ?? ""} className="pointer-events-auto max-h-full w-full object-contain" src={activeMedia.url} />
          )}
        </div>

        {canBrowse ? (
          <>
            <button
              aria-label="上一张媒体"
              className="pointer-events-auto absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-2xl font-black text-white backdrop-blur transition hover:bg-white/18"
              onClick={() => goToIndex(activeIndex - 1)}
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="下一张媒体"
              className="pointer-events-auto absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-2xl font-black text-white backdrop-blur transition hover:bg-white/18"
              onClick={() => goToIndex(activeIndex + 1)}
              type="button"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function normalizeFieldLabel(key: string) {
  if (profileFieldLabelMap[key]) {
    return profileFieldLabelMap[key];
  }

  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringifyFieldValue(value: string | string[] | boolean | undefined) {
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map((item) => `${item}`)
      .join(" / ");
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  return value ? `${value}` : "";
}

function getProfileTextField(profile: SocialProfile, key: string) {
  return stringifyFieldValue(profile.extraProfileFields[key]).trim();
}

function SocialMembershipStatusBadge({ profile, compact = false }: { profile: SocialProfile; compact?: boolean }) {
  if (profile.entityType !== "user") {
    return null;
  }

  const memberLevel = getProfileTextField(profile, "memberLevel");
  const levelLabel = getProfileTextField(profile, "memberLevelLabel");
  const membership = resolveCustomerMembership(memberLevel);
  const memberTypeLabel = memberLevel ? membership.label : "";
  const statusLabel = [memberTypeLabel, levelLabel].filter(Boolean).join(" ");

  if (!memberLevel && !levelLabel) {
    return null;
  }

  return (
    <span
      aria-label={statusLabel}
      className={cn(
        "inline-flex shrink-0 items-center font-black leading-none text-[color:var(--client-text)]",
        compact ? "gap-0.5 text-[10px]" : "gap-1 text-[13px]"
      )}
      title={statusLabel}
    >
      {membership.kind ? (
        <CustomerMembershipBadge
          className={compact ? "h-4 w-4" : "h-5 w-5"}
          imageClassName={compact ? "h-4 w-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.32)]" : "h-5 w-5 drop-shadow-[0_2px_5px_rgba(0,0,0,0.34)]"}
          level={memberLevel}
          showFallback={false}
        />
      ) : memberTypeLabel ? (
        <span className={cn("whitespace-nowrap leading-none", compact ? "text-[10px]" : "text-[12px]")}>{memberTypeLabel}</span>
      ) : null}
      {levelLabel ? <span className="whitespace-nowrap leading-none">{levelLabel}</span> : null}
    </span>
  );
}

function buildFieldItem(
  profile: SocialProfile,
  key: string,
  label?: string,
  tone: ProfileFieldTone = "neutral"
): ProfileFieldItem | null {
  const raw = profile.extraProfileFields[key];
  const value = stringifyFieldValue(raw);

  if (!value) {
    return null;
  }

  return {
    key,
    label: label ?? normalizeFieldLabel(key),
    value,
    tone
  };
}

function compactFieldItems(items: Array<ProfileFieldItem | null>) {
  return items.filter((item): item is ProfileFieldItem => Boolean(item));
}

function buildProfileHighlights(profile: SocialProfile) {
  if (profile.entityType === "shop") {
    return compactFieldItems([
      buildFieldItem(profile, "openStatus", "营业状态", "accent"),
      buildFieldItem(profile, "businessHours", "营业时间"),
      buildFieldItem(profile, "priceLabel", "价格区间"),
      buildFieldItem(profile, "announcement", "当前公告", "primary")
    ]);
  }

  if (profile.entityType === "technician") {
    return compactFieldItems([
      buildFieldItem(profile, "serviceTags", "服务标签", "primary"),
      buildFieldItem(profile, "nextAvailability", "最近可约", "accent"),
      buildFieldItem(profile, "recentAvailability", "档期更新", "accent"),
      buildFieldItem(profile, "languages", "服务语言")
    ]);
  }

  return compactFieldItems([
    buildFieldItem(profile, "languages", "语言")
  ]);
}

function buildProfileSections(profile: SocialProfile): ProfileFieldSection[] {
  const usedKeys = new Set<string>();

  const pick = (key: string, label?: string, tone?: ProfileFieldTone) => {
    const item = buildFieldItem(profile, key, label, tone);

    if (item) {
      usedKeys.add(key);
    }

    return item;
  };

  const sections: ProfileFieldSection[] = [];

  if (profile.entityType === "shop") {
    sections.push({
      title: "门店信息",
      description: "统一 profile 骨架下的店铺差异字段，通过 section 扩展而不是单独页面实现。",
      items: compactFieldItems([
        pick("openStatus", "营业状态", "accent"),
        pick("address", "地址摘要"),
        pick("businessHours", "营业时间"),
        pick("priceLabel", "价格区间")
      ])
    });
    sections.push({
      title: "预约与内容",
      items: compactFieldItems([
        pick("bookAction", "预约入口", "primary"),
        pick("announcement", "当前公告", "accent"),
        pick("mediaFocus", "内容焦点")
      ])
    });
  } else if (profile.entityType === "technician") {
    sections.push({
      title: "服务摘要",
      description: "技师端仍然共用同一套 profile 结构，只通过字段与 section 做扩展。",
      items: compactFieldItems([
        pick("serviceTags", "服务标签", "primary"),
        pick("languages", "服务语言"),
        pick("bookingAction", "预约入口", "primary")
      ])
    });
    sections.push({
      title: "预约状态",
      items: compactFieldItems([
        pick("nextAvailability", "最近可约", "accent"),
        pick("recentAvailability", "档期更新", "accent")
      ])
    });
  } else {
    sections.push({
      title: "个人资料",
      description: "用户、技师、店铺都使用统一 profile 模块，用户端在这里展示更偏个人资料的扩展字段。",
      items: compactFieldItems([
        pick("languages", "语言")
      ])
    });
  }

  const remainingItems = Object.entries(profile.extraProfileFields)
    .filter(([key]) => !usedKeys.has(key) && !hiddenProfileFieldKeys.has(key))
    .map(([key, value]) => ({
      key,
      label: normalizeFieldLabel(key),
      value: stringifyFieldValue(value)
    }))
    .filter((item) => item.value);

  if (remainingItems.length > 0) {
    sections.push({
      title: "更多资料",
      items: remainingItems
    });
  }

  return sections.filter((section) => section.items.length > 0);
}

function fieldToneToMetaTone(tone: ProfileFieldTone = "neutral") {
  if (tone === "accent") {
    return "accent" as const;
  }

  if (tone === "primary") {
    return "primary" as const;
  }

  return "neutral" as const;
}

function buildProfileHeaderNotes(profile: SocialProfile) {
  if (profile.entityType === "shop") {
    return compactFieldItems([
      buildFieldItem(profile, "openStatus", "营业状态", "accent"),
      buildFieldItem(profile, "address", "地址摘要"),
      buildFieldItem(profile, "businessHours", "营业时间"),
      buildFieldItem(profile, "bookAction", "预约入口", "primary")
    ]);
  }

  if (profile.entityType === "technician") {
    return compactFieldItems([
      buildFieldItem(profile, "serviceTags", "服务标签", "primary"),
      buildFieldItem(profile, "nextAvailability", "最近可约", "accent"),
      buildFieldItem(profile, "languages", "服务语言")
    ]);
  }

  return compactFieldItems([
    buildFieldItem(profile, "languages", "语言")
  ]);
}

type SecondaryProfileAction = { kind: "link"; label: string; to: string } | { kind: "message"; label: string };
type ProfileLinkAction = Extract<SecondaryProfileAction, { kind: "link" }>;
type ProfileMessageAction = Extract<SecondaryProfileAction, { kind: "message" }>;

function buildSecondaryProfileActions(scope: SocialPortalScope, profile: SocialProfile, isSelf: boolean): SecondaryProfileAction[] {
  if (isSelf) {
    return [
      {
        kind: "link",
        label: "发布动态",
        to: socialPaths.compose(scope, { author: profileKey(profile) })
      }
    ];
  }

  if (profile.entityType === "shop" && scope === "user") {
    return [
      {
        kind: "link",
        label: "预约",
        to: `/stores/${profile.id}`
      },
      {
        kind: "message",
        label: "发私信"
      }
    ];
  }

  return [
    {
      kind: "message",
      label: "发私信"
    }
  ];
}

function buildSelfProfileEditPath(scope: SocialPortalScope) {
  if (scope === "merchant") {
    return "/merchant/me";
  }

  if (scope === "technician") {
    return "/technician/me";
  }

  return "/me/settings/profile";
}

function ProfileMetaRow({
  icon,
  children
}: {
  icon: "map" | "calendar" | "clock";
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <AppIcon className="h-4 w-4 text-[color:var(--client-muted)]" name={icon} />
      <span>{children}</span>
    </span>
  );
}

export function SocialEmptyState({
  title,
  description,
  action
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <SurfacePanel className="py-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
        <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path d="m12 4 1.1 3.4L16.5 8l-3.4 1.1L12 12.5l-1.1-3.4L7.5 8l3.4-1.1L12 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </div>
      <h3 className="mt-4 text-xl font-black text-[color:var(--client-text)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-[color:var(--client-muted)]">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </SurfacePanel>
  );
}

export function SocialPostTextRenderer({
  text,
  scope,
  profiles,
  className
}: {
  text: string;
  scope: SocialPortalScope;
  profiles: Record<string, SocialProfile>;
  className?: string;
}) {
  const profileList = useMemo(() => Object.values(profiles), [profiles]);
  const profilesByMentionLabel = useMemo(
    () => Object.fromEntries(profileList.map((profile) => [profileMentionLabel(profile).toLowerCase(), profile])),
    [profileList]
  );
  const mentionMatcher = useMemo(() => buildProfileMentionMatcher(profileList), [profileList]);
  const segments: Array<{ type: "text" | "mention" | "tag" | "url"; value: string }> = [];
  const regex = mentionMatcher
    ? new RegExp(`(https?:\\/\\/[^\\s]+|[＃#][\\p{L}\\p{N}_-]+|${mentionMatcher.source})`, "gu")
    : /(https?:\/\/[^\s]+|[＃#][\p{L}\p{N}_-]+)/gu;
  let lastIndex = 0;

  text.replace(regex, (match, _capture, offset) => {
    if (offset > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, offset) });
    }

    if (match.startsWith("@")) {
      segments.push({ type: "mention", value: match });
    } else if (match.startsWith("#") || match.startsWith("＃")) {
      segments.push({ type: "tag", value: match });
    } else {
      segments.push({ type: "url", value: match });
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", value: text });
  }

  return (
    <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-7 text-[color:var(--client-text)]", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "mention") {
          const profile = profilesByMentionLabel[segment.value.toLowerCase()];

          if (profile) {
            return (
              <Link className="font-semibold text-[color:var(--client-primary)]" key={`${segment.value}-${index}`} to={socialPaths.profile(scope, profile)}>
                {segment.value}
              </Link>
            );
          }
        }

        if (segment.type === "tag") {
          const label = formatHashtagLabel(segment.value);

          return (
            <Link
              className={cn(socialHashtagChipClassName, "mx-0.5 inline-flex translate-y-[2px] items-center leading-none no-underline")}
              key={`${segment.value}-${index}`}
              to={socialPaths.hashtag(scope, label)}
            >
              {label}
            </Link>
          );
        }

        if (segment.type === "url") {
          return (
            <a
              className="font-semibold text-[color:var(--client-primary)] underline decoration-[color:var(--client-line)] underline-offset-4"
              href={segment.value}
              key={`${segment.value}-${index}`}
              rel="noreferrer"
              target="_blank"
            >
              {segment.value}
            </a>
          );
        }

        return <span key={`${segment.value}-${index}`}>{segment.value}</span>;
      })}
    </p>
  );
}

function truncatePostText(text: string, limit = 240) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit).trimEnd()}...`;
}

function shouldIgnorePostNavigation(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a,button,summary,details,input,textarea,video"));
}

const socialProfileHeaderActionButtonClassName =
  "focus-ring inline-flex h-10 min-w-[76px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] px-3 text-sm font-black text-[color:var(--client-text)] backdrop-blur transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-55 sm:min-w-[88px] sm:px-4";

const socialProfileHeaderMessageButtonClassName =
  "focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--client-primary)] text-[#090806] shadow-[0_14px_32px_color-mix(in_srgb,var(--client-primary)_28%,transparent)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-55";

export function UnifiedPostText({
  text,
  scope,
  profiles,
  expanded = false,
  allowExpand = true,
  className
}: {
  text: string;
  scope: SocialPortalScope;
  profiles: Record<string, SocialProfile>;
  expanded?: boolean;
  allowExpand?: boolean;
  className?: string;
}) {
  const shouldCollapse = allowExpand && (text.length > 240 || text.split("\n").length > 6);
  const [isExpanded, setIsExpanded] = useState(expanded);

  useEffect(() => {
    setIsExpanded(expanded);
  }, [expanded, text]);

  const displayText = shouldCollapse && !isExpanded ? truncatePostText(text) : text;

  return (
    <div>
      <SocialPostTextRenderer className={className} profiles={profiles} scope={scope} text={displayText} />
      {shouldCollapse ? (
        <button
          className="mt-2 text-sm font-semibold text-[color:var(--client-primary)] transition hover:opacity-80"
          onClick={() => setIsExpanded((current) => !current)}
          type="button"
        >
          {isExpanded ? "收起" : "展开全文"}
        </button>
      ) : null}
    </div>
  );
}

export function SocialFollowButton({
  scope,
  actorKey,
  targetKey,
  compact = false
}: {
  scope: SocialPortalScope;
  actorKey: string;
  targetKey: string;
  compact?: boolean;
}) {
  const { profiles, getFollowing, toggleFollow } = useSocial();
  const imStore = useImStore(scope);
  const [confirmingFriendUnfollow, setConfirmingFriendUnfollow] = useState(false);
  const [pendingAction, setPendingAction] = useState<"add" | "delete" | null>(null);
  const autoFriendTargetRef = useRef<string | null>(null);
  const actor = profiles[actorKey];
  const target = profiles[targetKey];
  const following = getFollowing(actorKey).some((profile) => profileKey(profile) === targetKey);
  const targetFollowsActor = getFollowing(targetKey).some((profile) => profileKey(profile) === actorKey);
  const targetImUser = target ? findImUserForSocialProfile(imStore.users, target) : undefined;
  const activeContact = targetImUser
    ? imStore.contacts.find((contact) => contact.targetUserId === targetImUser.id && contact.relationStatus === "active" && !contact.isBlocked)
    : undefined;
  const isSocialFriend = following && targetFollowsActor;
  const isFriend = Boolean(activeContact) || isSocialFriend;
  const canUseFriendAction = Boolean(targetImUser && targetImUser.id !== imStore.currentUserId && !targetImUser.serviceAccount);

  useEffect(() => {
    if (!target || !targetImUser || !canUseFriendAction || !following || !targetFollowsActor || activeContact) {
      return;
    }

    if (autoFriendTargetRef.current === targetImUser.id) {
      return;
    }

    autoFriendTargetRef.current = targetImUser.id;
    setPendingAction("add");
    void imStore.addContact(targetImUser.id, "互相关注", `与 ${target.displayName} 互相关注后自动成为好友`).finally(() => {
      autoFriendTargetRef.current = null;
      setPendingAction(null);
    });
  }, [activeContact, canUseFriendAction, following, imStore, target, targetFollowsActor, targetImUser]);

  if (!actor || !target || actorKey === targetKey) {
    return null;
  }

  const mode = isFriend ? "friend" : following ? "following" : "follow";
  const label =
    pendingAction === "add"
      ? "同步中"
      : pendingAction === "delete"
        ? isFriend
          ? "解除中"
          : "取消中"
        : isFriend
          ? "好友"
          : following
          ? "已关注"
          : "关注";

  const handleConfirmFriendUnfollow = async () => {
    if (!activeContact && !following) {
      return;
    }

    setPendingAction("delete");
    try {
      if (activeContact) {
        await imStore.deleteContact(activeContact.id);
      }
      if (following) {
        toggleFollow(actorKey, targetKey);
      }
      setConfirmingFriendUnfollow(false);
    } finally {
      setPendingAction(null);
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (isFriend) {
      setConfirmingFriendUnfollow(true);
      return;
    }

    toggleFollow(actorKey, targetKey);
  };

  const buttonClassName = cn(
    "focus-ring inline-flex items-center justify-center gap-1.5 rounded-full font-black transition disabled:pointer-events-none disabled:opacity-60",
    compact
      ? cn(
          "px-3 py-1.5 text-xs",
          mode !== "follow"
            ? "border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] text-[color:var(--client-text)] backdrop-blur"
            : "bg-[color:var(--client-primary)] text-[#090806]"
        )
      : socialProfileHeaderActionButtonClassName
  );

  const friendUnfollowDialog = confirmingFriendUnfollow ? (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/52 px-4 backdrop-blur-lg backdrop-saturate-75"
      onClick={() => (pendingAction === "delete" ? undefined : setConfirmingFriendUnfollow(false))}
      role="dialog"
    >
      <div
        className="w-full max-w-[380px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_86%,var(--client-bg)_14%)] bg-[color:var(--client-bg)] p-5 text-[color:var(--client-text)] shadow-[0_24px_72px_rgba(0,0,0,0.42)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-lg font-black">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#ef4f3f] text-sm font-black text-white shadow-[0_10px_24px_rgba(239,79,63,0.26)]">
            !
          </span>
          <span>{following ? "取消关注" : "解除好友"}</span>
        </h3>
        <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
          {following
            ? "目前为好友状态，取消关注后，好友状态和关注也会一起取消，将在互相的通讯录消失（并不会通知对方，但曾经的对话将会保留，对方对您账号的关注状态并不会取消，直到手动操作），确定要执行此操作吗"
            : "目前为好友状态，解除后会从通讯录消失；曾经的对话会保留，但不会再作为好友显示。确定要执行此操作吗"}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            className="focus-ring inline-flex h-11 items-center justify-center rounded-full bg-[#ef4f3f] px-4 text-sm font-black text-white shadow-[0_14px_32px_rgba(239,79,63,0.24)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
            disabled={pendingAction === "delete"}
            onClick={() => void handleConfirmFriendUnfollow()}
            type="button"
          >
            {pendingAction === "delete" ? "处理中" : following ? "确认取消" : "确认解除"}
          </button>
          <button
            className="focus-ring inline-flex h-11 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[#090806] shadow-[0_14px_32px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
            disabled={pendingAction === "delete"}
            onClick={() => setConfirmingFriendUnfollow(false)}
            type="button"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <>
        <button className={buttonClassName} disabled={Boolean(pendingAction)} onClick={handleClick} onPointerDown={(event) => event.stopPropagation()} type="button">
          <span>{label}</span>
          {mode === "following" ? <AppIcon className="h-3.5 w-3.5" name="check" /> : null}
        </button>
        {friendUnfollowDialog}
      </>
    );
  }

  return (
    <>
      <button className={buttonClassName} disabled={Boolean(pendingAction)} onClick={handleClick} onPointerDown={(event) => event.stopPropagation()} type="button">
        <span>{label}</span>
        {mode === "following" ? <AppIcon className="h-3.5 w-3.5" name="check" /> : null}
      </button>
      {friendUnfollowDialog}
    </>
  );
}

function findImUserForSocialProfile(users: ImUser[], profile: SocialProfile) {
  return users.find((user) => user.entityType === profile.entityType && user.entityId === profile.id);
}

function SocialPostContextRow({
  post,
  activityAuthor,
  contentPost,
  profiles
}: {
  post: SocialPost;
  activityAuthor: SocialProfile;
  contentPost: SocialPost;
  profiles: Record<string, SocialProfile>;
}) {
  const { getPostById } = useSocial();
  const badges: Array<{ label: string; tone: "neutral" | "primary" | "accent" }> = [];
  let activityText: string | null = null;

  if (post.postType === "repost" && contentPost.id !== post.id) {
    activityText = `${activityAuthor.displayName} 转发了`;
  } else if (post.replyToPostId) {
    const replyPost = getPostById(post.replyToPostId);
    const replyTarget = replyPost ? profiles[profileKey({ entityType: replyPost.authorType, id: replyPost.authorId })] : undefined;
    activityText = `回复给 ${replyTarget ? profileMentionLabel(replyTarget) : "主帖"}`;
  }

  if (post.isPinned) {
    badges.push({ label: "置顶动态", tone: "accent" });
  }

  if (post.postType === "announcement") {
    badges.push({ label: "店铺公告", tone: "accent" });
  }

  if (post.postType === "technician-daily") {
    badges.push({ label: "技师日常", tone: "primary" });
  }

  if (post.postType === "quote") {
    badges.push({ label: "引用动态", tone: "neutral" });
  }

  if (!activityText && badges.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[color:var(--client-muted)]">
      {activityText ? <p>{activityText}</p> : null}
      {badges.map((badge) => (
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            badge.tone === "accent"
              ? "text-[color:var(--client-warm)]"
              : badge.tone === "primary"
                ? "text-[color:var(--client-primary)]"
                : "text-[color:var(--client-muted)]"
          )}
          key={badge.label}
        >
          <span className="inline-flex h-4 w-4 items-center justify-center">
            {badge.label === "置顶动态" ? (
              <PinBadgeIcon className="h-3.5 w-3.5" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
          </span>
          <span>{badge.label === "置顶动态" ? "已置顶" : badge.label}</span>
        </span>
      ))}
    </div>
  );
}

function EmbeddedPostCard({
  post,
  scope,
  profiles
}: {
  post?: SocialPost;
  scope: SocialPortalScope;
  profiles: Record<string, SocialProfile>;
}) {
  const navigate = useNavigate();

  if (!post || post.status !== "published") {
    return (
      <div className="mt-3 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] px-4 py-3 text-sm text-[color:var(--client-muted)]">
        原动态已不可用
      </div>
    );
  }

  const author = profiles[profileKey({ entityType: post.authorType, id: post.authorId })];
  const postPath = socialPaths.post(scope, post.id);

  return (
    <div
      className="mt-3 block cursor-pointer overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] text-left transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_66%,transparent)]"
      onClick={(event) => {
        if (!shouldIgnorePostNavigation(event.target)) {
          navigate(postPath);
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !shouldIgnorePostNavigation(event.target)) {
          event.preventDefault();
          navigate(postPath);
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate font-black text-[color:var(--client-text)]">{author?.displayName ?? "动态作者"}</span>
          <span className="text-[color:var(--client-muted)]">{formatRelativeTime(post.createdAt)}</span>
        </div>
        {post.text ? (
          <UnifiedPostText
            allowExpand={false}
            className="mt-2 text-sm leading-6"
            expanded
            profiles={profiles}
            scope={scope}
            text={truncatePostText(post.text, 140)}
          />
        ) : null}
      </div>
      {post.media[0] ? (
        <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]">
          {post.media[0].type === "video" ? (
            <div className="relative h-[180px] bg-black">
              <video className="absolute inset-0 h-full w-full scale-[1.035] object-cover" muted poster={post.media[0].thumbnailUrl ? getGeneratedImageThumbnailUrl(post.media[0].thumbnailUrl) : undefined} src={post.media[0].url} />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-black/58 text-white">
                  <svg aria-hidden="true" className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 6.5v11l9-5.5-9-5.5Z" />
                  </svg>
                </span>
              </div>
            </div>
          ) : (
            <div className="relative h-[180px] bg-black">
              <img alt={post.media[0].alt ?? ""} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getSocialMediaPreviewUrl(post.media[0])} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function UnifiedMediaBlock({
  post,
  scope
}: {
  post: SocialPost;
  scope: SocialPortalScope;
}) {
  const [activeMediaIndex, setActiveMediaIndex] = useState<number | null>(null);

  if (post.media.length === 0) {
    return null;
  }

  const visibleMedia = post.media.slice(0, 9);
  const hiddenCount = Math.max(0, post.media.length - visibleMedia.length);
  const total = visibleMedia.length;

  return (
    <>
      <div
        className={cn(
          "mt-3 grid gap-[2px] overflow-hidden border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)]",
          socialMediaGridClassName(total)
        )}
      >
        {visibleMedia.map((media, index) => (
          <button
            aria-label={media.type === "video" ? "放大视频" : "放大图片"}
            className={cn("group relative block w-full overflow-hidden border-0 bg-black p-0 text-left", socialMediaTileClassName(total, index))}
            key={media.id}
            onClick={() => setActiveMediaIndex(index)}
            type="button"
          >
            {media.type === "video" ? (
              <>
                <video
                  className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]"
                  muted
                  playsInline
                  poster={media.thumbnailUrl ? getGeneratedImageThumbnailUrl(media.thumbnailUrl) : undefined}
                  src={media.url}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/58 text-white shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
                    <MediaPlayGlyph className="ml-0.5 h-4 w-4" />
                  </span>
                </div>
                <span className="absolute left-3 bottom-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-black text-white">
                  {media.durationLabel ?? "视频"}
                </span>
              </>
            ) : (
              <img alt={media.alt ?? ""} className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]" src={getSocialMediaPreviewUrl(media)} />
            )}

            {index === visibleMedia.length - 1 && hiddenCount > 0 ? (
              <div className="absolute inset-0 grid place-items-center bg-black/48 text-xl font-black text-white">+{hiddenCount}</div>
            ) : null}
          </button>
        ))}
      </div>

      {activeMediaIndex !== null ? (
        <MediaLightbox
          activeIndex={activeMediaIndex}
          media={post.media}
          onChange={setActiveMediaIndex}
          onClose={() => setActiveMediaIndex(null)}
        />
      ) : null}
    </>
  );
}

function PostMenu({
  post,
  scope,
  actorKey
}: {
  post: SocialPost;
  scope: SocialPortalScope;
  actorKey: string;
}) {
  const { profiles, deletePost, togglePinPost } = useSocial();
  const isMine = profileKey({ entityType: post.authorType, id: post.authorId }) === actorKey;
  const isPinned = profiles[actorKey]?.pinnedPostId === post.id;
  const isRepost = post.postType === "repost" && Boolean(post.repostPostId);
  const menuItemClassName =
    "flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left text-sm font-semibold transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]";

  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary
        aria-label="更多操作"
        className="cursor-pointer list-none rounded-full p-2 text-[color:var(--client-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
      >
        <span className="sr-only">更多操作</span>
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M12 6.5a1.5 1.5 0 1 0 0 .01M12 12a1.5 1.5 0 1 0 0 .01M12 17.5a1.5 1.5 0 1 0 0 .01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[184px] rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] p-2 shadow-[0_18px_42px_rgba(0,0,0,0.12)] backdrop-blur-xl">
        {isMine && !isRepost ? (
          <Link className={menuItemClassName} to={socialPaths.compose(scope, { editPostId: post.id })}>
            编辑动态
          </Link>
        ) : null}
        {isMine && !post.replyToPostId ? (
          <button
            className={menuItemClassName}
            onClick={() => togglePinPost(post.id, actorKey)}
            type="button"
          >
            {isPinned ? "取消置顶" : "置顶"}
          </button>
        ) : null}
        {isMine ? (
          <button
            className={cn(menuItemClassName, "text-[#df5b52]")}
            onClick={() => deletePost(post.id, actorKey)}
            type="button"
          >
            {isRepost ? "取消转发" : "删除动态"}
          </button>
        ) : null}
        <button className={menuItemClassName} type="button">
          <SocialPostMenuActionIcon name="translate" />
          <span>翻译</span>
        </button>
        <button className={menuItemClassName} type="button">
          <SocialPostMenuActionIcon name="report" />
          <span>举报</span>
        </button>
        <button className={menuItemClassName} type="button">
          <SocialPostMenuActionIcon className="text-[color:var(--client-text)]" name="block" />
          <span>屏蔽</span>
        </button>
      </div>
    </details>
  );
}

export function SocialInteractionBar({
  post,
  actorKey,
  scope,
  compact = false
}: {
  post: SocialPost;
  actorKey: string;
  scope: SocialPortalScope;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { getInteractionState, toggleLike, toggleBookmark, markShared } = useSocial();
  const interaction = getInteractionState(post.id, actorKey);
  const detailHref = socialPaths.post(scope, post.id);
  const countedActionClassName =
    "flex min-h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-1 py-2 text-[12px] font-semibold transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]";
  const trailingActionClassName =
    "inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]";

  return (
    <div
      className={cn(
        "flex items-center gap-1 pt-2 text-[color:var(--client-muted)]",
        compact ? "mt-2" : "mt-3"
      )}
    >
      <div className="grid min-w-0 flex-1 grid-cols-4 items-center gap-1">
        <button
          className={countedActionClassName}
          onClick={() => navigate(socialPaths.compose(scope, { replyToPostId: post.id }))}
          type="button"
        >
          <InteractionIcon name="reply" />
          <span>{formatCount(post.replyCount)}</span>
        </button>
        <button
          className={cn(countedActionClassName, interaction.reposted ? "text-[color:var(--client-primary)]" : undefined)}
          onClick={() => navigate(socialPaths.repost(scope, post.id))}
          type="button"
        >
          <InteractionIcon active={interaction.reposted} name="repost" />
          <span>{formatCount(post.repostCount)}</span>
        </button>
        <button
          className={cn(countedActionClassName, interaction.liked ? "text-[color:var(--client-warm)]" : undefined)}
          onClick={() => toggleLike(post.id, actorKey)}
          type="button"
        >
          <InteractionIcon active={interaction.liked} name="like" />
          <span>{formatCount(post.likeCount)}</span>
        </button>
        <div className="flex min-h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-1 py-2 text-[12px] font-semibold">
          <InteractionIcon name="view" />
          <span>{formatCount(post.viewCount)}</span>
        </div>
      </div>

      <div className="ml-auto inline-flex flex-none items-center gap-1">
        <button
          aria-label={interaction.bookmarked ? "取消收藏" : "收藏"}
          className={cn(trailingActionClassName, interaction.bookmarked ? "text-[color:var(--client-primary)]" : undefined)}
          onClick={() => toggleBookmark(post.id, actorKey)}
          type="button"
        >
          <InteractionIcon active={interaction.bookmarked} name="bookmark" />
        </button>
        <button
          aria-label="分享"
          className={cn(trailingActionClassName, interaction.shared ? "text-[color:var(--client-accent)]" : undefined)}
          onClick={async () => {
            const result = await shareContent({
              title: post.text ? `${post.text.slice(0, 32)}${post.text.length > 32 ? "..." : ""} | NeeDo` : "NeeDo",
              text: "在 NeeDo 打开这条动态",
              url: buildAbsoluteUrl(detailHref)
            });

            if (result.status !== "cancelled" && result.status !== "unsupported") {
              markShared(post.id, actorKey);
            }
          }}
          type="button"
        >
          <InteractionIcon active={interaction.shared} name="share" />
        </button>
      </div>
    </div>
  );
}

export function SocialPostItem({
  post,
  scope,
  actorKey,
  compact = false,
  highlight = false,
  hideActions = false
}: {
  post: SocialPost;
  scope: SocialPortalScope;
  actorKey: string;
  compact?: boolean;
  highlight?: boolean;
  hideActions?: boolean;
}) {
  const navigate = useNavigate();
  const { profiles, getPostById } = useSocial();
  const activityAuthor = profiles[profileKey({ entityType: post.authorType, id: post.authorId })];
  const repostedPost = post.repostPostId ? getPostById(post.repostPostId) : undefined;
  const contentPost = repostedPost ?? post;
  const contentAuthor = profiles[profileKey({ entityType: contentPost.authorType, id: contentPost.authorId })] ?? activityAuthor;
  const quotedPost = contentPost.quotePostId ? getPostById(contentPost.quotePostId) : undefined;
  const detailHref = socialPaths.post(scope, contentPost.id);

  if (!activityAuthor || !contentAuthor) {
    return null;
  }

  return (
    <article
      className={cn(
        "border-b border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] px-4 py-3.5 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_42%,transparent)] sm:px-5",
        compact ? "px-0 py-0" : "",
        highlight ? "bg-[color:color-mix(in_srgb,var(--client-surface)_44%,transparent)]" : ""
      )}
    >
      <div className="flex items-start gap-3">
        <Link className="shrink-0" to={socialPaths.profile(scope, contentAuthor)}>
          <AvatarImage alt={contentAuthor.displayName} className={cn(highlight ? "h-12 w-12" : "h-10 w-10")} src={contentAuthor.avatar} />
        </Link>
        <div className="min-w-0 flex-1">
          {!compact ? <SocialPostContextRow activityAuthor={activityAuthor} contentPost={contentPost} post={post} profiles={profiles} /> : null}

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Link className="truncate text-[15px] font-black text-[color:var(--client-text)]" to={socialPaths.profile(scope, contentAuthor)}>
                  {contentAuthor.displayName}
                </Link>
                <VerificationBadge status={contentAuthor.verifiedStatus} />
                <SocialMembershipStatusBadge compact profile={contentAuthor} />
                <span className="text-sm text-[color:var(--client-muted)]">·</span>
                <Link className="text-sm text-[color:var(--client-muted)] hover:text-[color:var(--client-text)]" to={detailHref}>
                  {formatRelativeTime(contentPost.createdAt)}
                </Link>
              </div>
              {contentAuthor.headline && !compact ? <p className="mt-1 text-[12px] font-semibold text-[color:var(--client-muted)]">{contentAuthor.headline}</p> : null}
            </div>

            {!compact ? <PostMenu actorKey={actorKey} post={post} scope={scope} /> : null}
          </div>

          {contentPost.text ? (
            <div
              className="mt-2.5 cursor-pointer"
              onClick={(event) => {
                if (shouldIgnorePostNavigation(event.target)) {
                  return;
                }

                navigate(detailHref);
              }}
            >
              <UnifiedPostText
                allowExpand={!compact && !highlight}
                className={highlight ? "text-[18px] leading-8 sm:text-[21px]" : undefined}
                expanded={highlight}
                profiles={profiles}
                scope={scope}
                text={contentPost.text}
              />
            </div>
          ) : null}

          {quotedPost ? <EmbeddedPostCard post={quotedPost} profiles={profiles} scope={scope} /> : null}
          <UnifiedMediaBlock post={contentPost} scope={scope} />

          {!hideActions ? <SocialInteractionBar actorKey={actorKey} compact={compact} post={contentPost} scope={scope} /> : null}
        </div>
      </div>
    </article>
  );
}

export function UnifiedReplyList({
  posts,
  actorKey,
  scope,
  emptyState,
  compact = false
}: {
  posts: SocialPost[];
  actorKey: string;
  scope: SocialPortalScope;
  emptyState?: ReactNode;
  compact?: boolean;
}) {
  if (posts.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)]">
      {posts.map((post) => (
        <SocialPostItem actorKey={actorKey} compact={compact} key={post.id} post={post} scope={scope} />
      ))}
    </div>
  );
}

export function SocialProfileSummaryCard({
  profile,
  scope,
  caption,
  actorKey
}: {
  profile: SocialProfile;
  scope: SocialPortalScope;
  caption?: ReactNode;
  actorKey: string;
}) {
  const highlights = buildProfileHighlights(profile).slice(0, 2);

  return (
    <SurfacePanel className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to={socialPaths.profile(scope, profile)}>
          <AvatarImage alt={profile.displayName} className="h-14 w-14" src={profile.avatar} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TitleWithInfo
              as="div"
              className="max-w-full"
              info={caption}
              label={`${profile.displayName} 说明`}
              title={
                <Link className="block truncate text-[17px] font-black text-[color:var(--client-text)]" to={socialPaths.profile(scope, profile)}>
                  {profile.displayName}
                </Link>
              }
              titleClassName="max-w-full"
            />
            <VerificationBadge status={profile.verifiedStatus} />
            <SocialMembershipStatusBadge compact profile={profile} />
          </div>
        </div>
      </div>

      {!caption ? <p className="text-sm leading-6 text-[color:var(--client-muted)]">{profile.bio}</p> : null}

      {highlights.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {highlights.map((item) => (
            <MetaPill key={item.key} label={`${item.label} · ${item.value}`} tone={fieldToneToMetaTone(item.tone)} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <MetaPill label={`${formatCount(profile.followingCount)} 关注`} />
        <MetaPill label={`${formatCount(profile.followerCount)} 粉丝`} tone="primary" />
      </div>

      <div className="flex items-center gap-2">
        <SecondaryButton className="flex-1" to={socialPaths.profile(scope, profile)}>
          打开主页
        </SecondaryButton>
        <SocialFollowButton actorKey={actorKey} scope={scope} targetKey={profileKey(profile)} />
      </div>
    </SurfacePanel>
  );
}

export function SocialProfileRow({
  profile,
  scope,
  actorKey,
  caption
}: {
  profile: SocialProfile;
  scope: SocialPortalScope;
  actorKey: string;
  caption?: ReactNode;
}) {
  const tags = buildProfileHighlights(profile)
    .slice(0, 3)
    .map((item) => `${item.label} · ${item.value}`);

  return (
    <div className="grid gap-4 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.05)] lg:grid-cols-[auto,1fr,auto]">
      <Link className="shrink-0" to={socialPaths.profile(scope, profile)}>
        <AvatarImage alt={profile.displayName} className="h-16 w-16" src={profile.avatar} />
      </Link>
      <Link className="min-w-0" to={socialPaths.profile(scope, profile)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[18px] font-black leading-6 tracking-[-0.02em] text-[color:var(--client-text)]">{profile.displayName}</span>
          <VerificationBadge status={profile.verifiedStatus} />
          <SocialMembershipStatusBadge compact profile={profile} />
          <IdentityBadge entityType={profile.entityType} />
        </div>
        <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{caption ?? profile.bio}</p>
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_68%,transparent)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--client-muted)]" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
      <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end lg:justify-center">
        <div className="text-right text-xs font-semibold text-[color:var(--client-muted)]">
          <p>{formatCount(profile.followerCount)} 粉丝</p>
          <p>{formatCount(profile.followingCount)} 关注</p>
        </div>
        <SocialFollowButton actorKey={actorKey} compact scope={scope} targetKey={profileKey(profile)} />
      </div>
    </div>
  );
}

export function SocialProfileTopBar({
  profile,
  scope,
  postCount,
  onClose
}: {
  profile: SocialProfile;
  scope: SocialPortalScope;
  postCount: number;
  onClose: () => void;
}) {
  return (
    <div className="contents">
      <header className="safe-header-top fixed inset-x-0 top-0 z-40 border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] backdrop-blur-xl">
        <SocialFloatingTopAction icon="close" label="关闭资料页" onClick={onClose} />
        <div className="mx-auto flex h-[60px] w-full max-w-[1480px] items-center px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 pr-[56px] sm:pr-[60px]">
            <AvatarImage
              alt={profile.displayName}
              className="h-11 w-11 shrink-0 border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)]"
              src={profile.avatar}
            />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="min-w-0 truncate text-[19px] font-black text-[color:var(--client-text)]">{profile.displayName}</p>
                <VerificationBadge status={profile.verifiedStatus} />
                <SocialMembershipStatusBadge compact profile={profile} />
              </div>
              <p className="truncate text-xs font-semibold text-[color:var(--client-muted)]">
                {formatCount(postCount)} 条动态
              </p>
            </div>
          </div>
        </div>
      </header>
      <div aria-hidden="true" className="h-[calc(env(safe-area-inset-top)+5.75rem)]" />
    </div>
  );
}

export function SocialProfileSearchFab({
  scope,
  raised = false
}: {
  scope: SocialPortalScope;
  raised?: boolean;
}) {
  return (
    <FloatingActionButton
      ariaLabel="搜索动态"
      position={raised ? "raised" : "standard"}
      storageKey={`needo.fab.social-search.${scope}`}
      to={socialPaths.search(scope)}
    >
      <AppIcon name="search" />
    </FloatingActionButton>
  );
}

export function SocialProfileHeader({
  profile,
  scope,
  actorKey,
  variant = "default"
}: {
  profile: SocialProfile;
  scope: SocialPortalScope;
  actorKey: string;
  variant?: "default" | "timelineCompact";
}) {
  const { updateProfileOverride } = useSocial();
  const imStore = useImStore(scope);
  const navigate = useNavigate();
  const isSelf = profileKey(profile) === actorKey;
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [isCoverEditorOpen, setIsCoverEditorOpen] = useState(false);
  const [coverDraft, setCoverDraft] = useState(profile.coverImage);
  const [activeCoverIndex, setActiveCoverIndex] = useState(0);
  const [privateMessagePending, setPrivateMessagePending] = useState(false);
  const coverImages = useMemo(() => {
    const next = [...(profile.coverImages ?? []), profile.coverImage].filter(Boolean);
    return Array.from(new Set(next));
  }, [profile.coverImage, profile.coverImages]);
  const coverSlides = useMemo<FeatureCarouselSlide[]>(
    () =>
      coverImages.map((image, index) => ({
        id: `${profile.id}-cover-${index + 1}`,
        image,
        title: profile.displayName
      })),
    [coverImages, profile.displayName, profile.id]
  );
  const activeCoverImage = coverImages[activeCoverIndex] ?? coverImages[0] ?? profile.coverImage;
  const targetImUser = isSelf ? undefined : findImUserForSocialProfile(imStore.users, profile);
  const canOpenPrivateMessage = Boolean(targetImUser && targetImUser.id !== imStore.currentUserId && !targetImUser.serviceAccount);

  useEffect(() => {
    setCoverDraft(profile.coverImage);
  }, [profile.coverImage]);

  useEffect(() => {
    setActiveCoverIndex(0);
  }, [profile.id, profile.coverImage, profile.coverImages]);

  const saveCoverImage = () => {
    const nextCoverImage = coverDraft.trim();

    if (!nextCoverImage) {
      return;
    }

    updateProfileOverride(profileKey(profile), { coverImage: nextCoverImage });
    setIsCoverEditorOpen(false);
  };

  const handleCoverUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setCoverDraft(await readImageFileAsDataUrl(file));
    event.target.value = "";
  };

  const openPrivateMessage = async () => {
    if (!targetImUser || !canOpenPrivateMessage) {
      return;
    }

    setPrivateMessagePending(true);
    try {
      const conversation = await imStore.ensureDirectConversation(targetImUser.id);
      navigate(getImRoleConfig(scope).routes.conversation(conversation.id));
    } finally {
      setPrivateMessagePending(false);
    }
  };

  if (variant === "timelineCompact") {
    const entityLabel = getEntityLabel(profile.entityType);

    return (
    <section className="-mx-4 border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_12%,transparent)] sm:-mx-6 lg:-mx-8">
        <div className="relative h-[224px] sm:h-[248px] lg:h-[296px]">
          {coverSlides.length > 1 ? (
            <FeatureCarousel
              activeIndex={activeCoverIndex}
              cardHeightClassName="h-full"
              className="h-full max-w-none"
              onActiveIndexChange={setActiveCoverIndex}
              renderSlide={({ slide }) => (
                <>
                  <img alt={profile.displayName} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(slide.image)} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.18)_44%,rgba(0,0,0,0.68)_100%)]" />
                </>
              )}
              showIndicators={false}
              slideClassName="rounded-none border-0"
              slides={coverSlides}
              viewportClassName="h-full"
            />
          ) : (
            <a className="block h-full overflow-hidden" href={activeCoverImage} rel="noreferrer" target="_blank">
              <img alt={profile.displayName} className="h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(activeCoverImage)} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.18)_44%,rgba(0,0,0,0.68)_100%)]" />
            </a>
          )}

          {isSelf ? (
            <button
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/24 bg-black/36 text-white backdrop-blur-md transition hover:bg-black/48"
              onClick={() => setIsCoverEditorOpen(true)}
              type="button"
            >
              <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24">
                <path d="M4 20h4.2l9.6-9.6a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
                <path d="m12.8 7.2 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
              </svg>
              <span className="sr-only">编辑头图</span>
            </button>
          ) : (
            <a
              className="absolute right-4 top-4 z-10 inline-flex h-9 items-center rounded-full bg-black/28 px-3 text-[11px] font-black text-white backdrop-blur-sm"
              href={activeCoverImage}
              rel="noreferrer"
              target="_blank"
            >
              查看头图
            </a>
          )}

          {coverSlides.length > 1 ? (
            <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-full bg-black/22 px-3 py-2 backdrop-blur-sm">
                {coverSlides.map((slide, index) => (
                  <button
                    aria-label={`查看第 ${index + 1} 张头图`}
                    className={cn(activeCoverIndex === index ? "h-2 w-6 rounded-full bg-[color:var(--client-primary)]" : "h-2 w-2 rounded-full bg-white/32")}
                    key={slide.id}
                    onClick={() => setActiveCoverIndex(index)}
                    type="button"
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="absolute inset-x-4 bottom-4 z-10 flex items-end gap-3 sm:inset-x-5 lg:inset-x-6">
            <AvatarImage
              alt={profile.displayName}
              className="h-[84px] w-[84px] shrink-0 border-[4px] border-white/92 bg-[color:var(--client-surface)] shadow-[0_18px_40px_rgba(0,0,0,0.28)] sm:h-[96px] sm:w-[96px]"
              src={profile.avatar}
            />
          </div>
        </div>

        {isSelf && isCoverEditorOpen ? (
          <div className="px-4 py-4 sm:px-5 lg:px-6">
            <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-black text-[color:var(--client-text)]">更换头图</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">上传新的头图，保存后会立即更新当前资料页头图。</p>
                </div>
                <button
                  className="rounded-full px-2 py-1 text-xs font-black text-[color:var(--client-muted)] transition hover:text-[color:var(--client-text)]"
                  onClick={() => {
                    setCoverDraft(profile.coverImage);
                    setIsCoverEditorOpen(false);
                  }}
                  type="button"
                >
                  关闭
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[128px,1fr] sm:items-center">
                <div className="h-24 overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,transparent)]">
                  <img alt={`${profile.displayName} 头图预览`} className="h-full w-full object-cover" src={coverDraft || profile.coverImage} />
                </div>
                <div className="min-w-0">
                  <input accept="image/*" className="hidden" onChange={handleCoverUpload} ref={coverInputRef} type="file" />
                  <SecondaryButton className="h-10 px-4 text-sm" onClick={() => coverInputRef.current?.click()}>
                    上传头图
                  </SecondaryButton>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">选择本地图片后会先更新预览。</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <SecondaryButton
                  className="h-10 px-4 text-sm"
                  onClick={() => {
                    setCoverDraft(profile.coverImage);
                    setIsCoverEditorOpen(false);
                  }}
                >
                  取消
                </SecondaryButton>
                <PrimaryButton className="h-10 px-4 text-sm" onClick={saveCoverImage}>
                  保存头图
                </PrimaryButton>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  const headerNotes = buildProfileHeaderNotes(profile).slice(0, 3);
  const secondaryActions = buildSecondaryProfileActions(scope, profile, isSelf);
  const profileLinkActions = secondaryActions.filter((action): action is ProfileLinkAction => action.kind === "link");
  const profileMessageActions = secondaryActions.filter((action): action is ProfileMessageAction => action.kind === "message");
  const editPath = buildSelfProfileEditPath(scope);

  return (
    <section>
      <div className="relative h-[208px] sm:h-[248px] lg:h-[304px]">
        {coverSlides.length > 1 ? (
          <FeatureCarousel
            activeIndex={activeCoverIndex}
            cardHeightClassName="h-full"
            className="h-full max-w-none"
            onActiveIndexChange={setActiveCoverIndex}
            renderSlide={({ slide }) => (
              <>
                <img alt={profile.displayName} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(slide.image)} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.2)_42%,rgba(0,0,0,0.48)_100%)]" />
              </>
            )}
            showIndicators={false}
            slideClassName="rounded-none border-0"
            slides={coverSlides}
            viewportClassName="h-full"
          />
        ) : (
          <a className="block h-full overflow-hidden" href={activeCoverImage} rel="noreferrer" target="_blank">
            <img alt={profile.displayName} className="h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(activeCoverImage)} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.2)_42%,rgba(0,0,0,0.48)_100%)]" />
          </a>
        )}
        {isSelf ? (
          <button
            className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/24 bg-black/36 text-white backdrop-blur-md transition hover:bg-black/48"
            onClick={() => setIsCoverEditorOpen(true)}
            type="button"
          >
            <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24">
              <path d="M4 20h4.2l9.6-9.6a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
              <path d="m12.8 7.2 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
            </svg>
            <span className="sr-only">编辑头图</span>
          </button>
        ) : (
          <a
            className="absolute right-4 top-4 z-10 inline-flex h-9 items-center rounded-full bg-black/28 px-3 text-[11px] font-black text-white backdrop-blur-sm"
            href={activeCoverImage}
            rel="noreferrer"
            target="_blank"
          >
            查看头图
          </a>
        )}

        {coverSlides.length > 1 ? (
          <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-black/22 px-3 py-2 backdrop-blur-sm">
              {coverSlides.map((slide, index) => (
                <button
                  aria-label={`查看第 ${index + 1} 张头图`}
                  className={cn(activeCoverIndex === index ? "h-2 w-6 rounded-full bg-[color:var(--client-primary)]" : "h-2 w-2 rounded-full bg-white/32")}
                  key={slide.id}
                  onClick={() => setActiveCoverIndex(index)}
                  type="button"
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-4 sm:px-5 lg:px-6">
        <div className="-mt-[62px] sm:-mt-[76px]">
          <div className="flex items-end justify-between gap-4">
            <AvatarImage
              alt={profile.displayName}
              className="h-[118px] w-[118px] border-[5px] border-[color:var(--client-bg)] bg-[color:var(--client-surface)] shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:h-[144px] sm:w-[144px]"
              src={profile.avatar}
            />
            <div className="flex shrink-0 flex-nowrap items-end justify-end gap-1.5 pb-1 sm:gap-2">
              {isSelf ? (
                <>
                  <SecondaryButton className="h-10 px-4 text-sm" onClick={() => setIsCoverEditorOpen(true)}>
                    更换头图
                  </SecondaryButton>
                  <SecondaryButton className="h-10 px-4 text-sm" to={editPath}>
                    编辑资料
                  </SecondaryButton>
                </>
              ) : (
                <>
                  {profileLinkActions.map((action) => (
                    <Link className={socialProfileHeaderActionButtonClassName} key={action.to} to={action.to}>
                      {action.label}
                    </Link>
                  ))}
                  <SocialFollowButton
                    actorKey={actorKey}
                    scope={scope}
                    targetKey={profileKey(profile)}
                  />
                  {profileMessageActions.map((action) => (
                    <button
                      aria-label={privateMessagePending ? "正在打开私信" : action.label}
                      className={socialProfileHeaderMessageButtonClassName}
                      disabled={!canOpenPrivateMessage || privateMessagePending}
                      key="message"
                      onClick={() => void openPrivateMessage()}
                      type="button"
                    >
                      <AppIcon className="h-5 w-5" name="chat" />
                      <span className="sr-only">{privateMessagePending ? "打开中" : action.label}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {isSelf && isCoverEditorOpen ? (
            <div className="mt-4 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-black text-[color:var(--client-text)]">更换头图</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">上传新的头图，保存后会立即更新当前资料页头图。</p>
                </div>
                <button
                  className="rounded-full px-2 py-1 text-xs font-black text-[color:var(--client-muted)] transition hover:text-[color:var(--client-text)]"
                  onClick={() => {
                    setCoverDraft(profile.coverImage);
                    setIsCoverEditorOpen(false);
                  }}
                  type="button"
                >
                  关闭
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[128px,1fr] sm:items-center">
                <div className="h-24 overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,transparent)]">
                  <img alt={`${profile.displayName} 头图预览`} className="h-full w-full object-cover" src={coverDraft || profile.coverImage} />
                </div>
                <div className="min-w-0">
                  <input accept="image/*" className="hidden" onChange={handleCoverUpload} ref={coverInputRef} type="file" />
                  <SecondaryButton className="h-10 px-4 text-sm" onClick={() => coverInputRef.current?.click()}>
                    上传头图
                  </SecondaryButton>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">选择本地图片后会先更新预览。</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <SecondaryButton
                  className="h-10 px-4 text-sm"
                  onClick={() => {
                    setCoverDraft(profile.coverImage);
                    setIsCoverEditorOpen(false);
                  }}
                >
                  取消
                </SecondaryButton>
                <PrimaryButton className="h-10 px-4 text-sm" onClick={saveCoverImage}>
                  保存头图
                </PrimaryButton>
              </div>
            </div>
          ) : null}

          <div className="mt-5 min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="truncate text-[29px] font-black tracking-[-0.03em] text-[color:var(--client-text)] sm:text-[34px]">{profile.displayName}</h1>
                  <VerificationBadge status={profile.verifiedStatus} />
                  <SocialMembershipStatusBadge profile={profile} />
                  <IdentityBadge entityType={profile.entityType} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 pt-1 text-right sm:gap-4">
                <Link className="grid justify-items-end gap-0.5 font-semibold text-[color:var(--client-text)]" to={socialPaths.following(scope, profile)}>
                  <span className="text-[17px] font-black leading-none sm:text-[18px]">{formatCount(profile.followingCount)}</span>
                  <span className="whitespace-nowrap text-[11px] leading-none text-[color:var(--client-muted)] sm:text-xs">关注中</span>
                </Link>
                <Link className="grid justify-items-end gap-0.5 font-semibold text-[color:var(--client-text)]" to={socialPaths.followers(scope, profile)}>
                  <span className="text-[17px] font-black leading-none sm:text-[18px]">{formatCount(profile.followerCount)}</span>
                  <span className="whitespace-nowrap text-[11px] leading-none text-[color:var(--client-muted)] sm:text-xs">粉丝</span>
                </Link>
              </div>
            </div>
            {profile.headline ? <p className="mt-3 text-sm font-semibold text-[color:var(--client-primary)]">{profile.headline}</p> : null}
            {profile.bio ? <p className="mt-3 text-[15px] leading-7 text-[color:var(--client-text)]">{profile.bio}</p> : null}

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[color:var(--client-muted)]">
              {profile.location ? <ProfileMetaRow icon="map">{profile.location}</ProfileMetaRow> : null}
              {profile.birthday ? (
                <ProfileMetaRow icon="calendar">{profile.entityType === "shop" ? `成立于 ${profile.birthday}` : `生日 ${profile.birthday}`}</ProfileMetaRow>
              ) : null}
              <ProfileMetaRow icon="clock">加入于 {formatJoinedDate(profile.joinedAt)}</ProfileMetaRow>
            </div>

            {headerNotes.length > 0 ? (
              <div className="mt-3 space-y-1.5 text-[13px] leading-6 text-[color:var(--client-muted)]">
                {headerNotes.map((item) => (
                  <p key={item.key}>
                    <span
                      className={cn(
                        "font-semibold",
                        item.tone === "accent"
                          ? "text-[color:var(--client-warm)]"
                          : item.tone === "primary"
                            ? "text-[color:var(--client-primary)]"
                            : "text-[color:var(--client-muted)]"
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="mx-1.5 text-[color:color-mix(in_srgb,var(--client-muted)_72%,transparent)]">·</span>
                    <span>{item.value}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function LineTabs<T extends string>({
  items,
  value,
  onChange
}: {
  items: Array<{ label: ReactNode; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = item.value === value;

        return (
          <button
            className={cn(
              "relative flex min-w-[88px] flex-1 items-center justify-center px-4 py-3 text-sm font-black transition",
              active ? "text-[color:var(--client-text)]" : "text-[color:var(--client-muted)] hover:text-[color:var(--client-text)]"
            )}
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            <span>{item.label}</span>
            {active ? <span className="absolute inset-x-4 bottom-0 h-[3px] rounded-full bg-[color:var(--client-primary)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SocialFeedTabs({
  value,
  onChange
}: {
  value: "for-you" | "following";
  onChange: (value: "for-you" | "following") => void;
}) {
  return (
    <LineTabs
      items={[
        { label: "推荐", value: "for-you" },
        { label: "关注", value: "following" }
      ]}
      onChange={onChange}
      value={value}
    />
  );
}

export function SocialTimelineFilterTabs({
  value,
  onChange
}: {
  value: SocialTimelineFilterTab;
  onChange: (value: SocialTimelineFilterTab) => void;
}) {
  const items: Array<{ label: string; value: SocialTimelineFilterTab }> = [
    { label: "附近", value: "nearby" },
    { label: "好友", value: "friends" },
    { label: "我的动态", value: "mine" }
  ];

  return (
    <div className="px-3 py-3 sm:px-4">
      <FeatureSegmentedTabs items={items} onChange={onChange} value={value} />
    </div>
  );
}

export function SocialProfileTabs({
  value,
  onChange
}: {
  value: SocialProfileTab;
  onChange: (value: SocialProfileTab) => void;
}) {
  const items: Array<{ label: string; value: SocialProfileTab }> = [
    { label: "动态", value: "posts" },
    { label: "回复", value: "replies" },
    { label: "媒体", value: "media" },
    { label: "喜欢", value: "likes" }
  ];

  return <FeatureSegmentedTabs items={items} onChange={onChange} value={value} />;
}

export function SocialProfileExtensionSections({ profile }: { profile: SocialProfile }) {
  const sections = buildProfileSections(profile);

  return (
    <div className="grid gap-4">
      {sections.map((section) => (
        <SurfacePanel className="space-y-4" key={section.title}>
          <TitleWithInfo
            as="h3"
            info={section.description}
            label={`${section.title} 说明`}
            title={section.title}
            titleClassName="text-lg font-black text-[color:var(--client-text)]"
          />
          <div className="grid gap-3">
            {section.items.map((item) => (
              <div
                className={cn(
                  "rounded-[20px] border px-4 py-3",
                  item.tone === "accent"
                    ? "border-[color:color-mix(in_srgb,var(--client-warm)_26%,transparent)] bg-[color:color-mix(in_srgb,var(--client-warm)_10%,transparent)]"
                    : item.tone === "primary"
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_26%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_66%,transparent)]"
                )}
                key={`${section.title}-${item.key}`}
              >
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-muted)]">{item.label}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-text)]">{item.value}</p>
              </div>
            ))}
          </div>
        </SurfacePanel>
      ))}
    </div>
  );
}

export function SocialSidebarSection({
  title,
  action,
  children
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SurfacePanel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[18px] font-black text-[color:var(--client-text)]">{title}</h3>
        {action}
      </div>
      {children}
    </SurfacePanel>
  );
}

export function SocialTopActions({
  scope,
  unreadCount
}: {
  scope: SocialPortalScope;
  unreadCount?: number;
}) {
  return (
    <>
      <IconButton icon="search" label="搜索动态" to={socialPaths.search(scope)} />
      <div className="relative">
        <IconButton icon="bell" label="通知" to={socialPaths.notifications(scope)} />
        {unreadCount && unreadCount > 0 ? (
          <NotificationBadge className="absolute -right-1 -top-1" count={unreadCount} size="sm" />
        ) : null}
      </div>
    </>
  );
}

export function SocialComposeFab({ scope }: { scope: SocialPortalScope }) {
  return (
    <FloatingActionButton
      ariaLabel="发动态"
      storageKey={`needo.fab.social-compose.${scope}`}
      to={socialPaths.compose(scope)}
    >
      <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    </FloatingActionButton>
  );
}

export function RelationshipTabs({
  value,
  onChange
}: {
  value: "followers" | "following";
  onChange: (value: "followers" | "following") => void;
}) {
  return (
    <LineTabs
      items={[
        { label: "粉丝", value: "followers" },
        { label: "关注", value: "following" }
      ]}
      onChange={onChange}
      value={value}
    />
  );
}

export function SearchTabs({
  value,
  onChange
}: {
  value: "all" | "profiles" | "posts" | "media" | "tags";
  onChange: (value: "all" | "profiles" | "posts" | "media" | "tags") => void;
}) {
  return (
    <LineTabs
      items={[
        { label: "综合", value: "all" },
        { label: "用户", value: "profiles" },
        { label: "动态", value: "posts" },
        { label: "媒体", value: "media" },
        { label: "标签", value: "tags" }
      ]}
      onChange={onChange}
      value={value}
    />
  );
}

export function NotificationRow({
  actor,
  content,
  at,
  to,
  unread,
  avatarTo
}: {
  actor?: SocialProfile;
  content: string;
  at: string;
  to?: string;
  unread?: boolean;
  avatarTo?: string;
}) {
  const contentBody = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-black text-[color:var(--client-text)]">{actor?.displayName ?? "系统通知"}</span>
      </div>
      <p className="mt-1 text-sm leading-6 text-[color:var(--client-text)]">{content}</p>
      <p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">{formatRelativeTime(at)}</p>
    </div>
  );

  const contentLink = to ? (
    <Link className="min-w-0 flex-1" to={to}>
      {contentBody}
    </Link>
  ) : (
    contentBody
  );

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[24px] border px-4 py-4 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]",
        unread
          ? "border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:var(--client-primary-soft)]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)]"
      )}
    >
      <InteractiveAvatar alt={actor?.displayName ?? "通知"} className="h-11 w-11" src={actor?.avatar ?? ""} to={avatarTo} />
      {contentLink}
    </div>
  );
}

export function MediaViewerControls({
  onPrevious,
  onNext,
  onShare
}: {
  onPrevious: () => void;
  onNext: () => void;
  onShare: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <Button className="px-5" onClick={onPrevious} variant="secondary">
        上一项
      </Button>
      <Button className="px-5" onClick={onShare} variant="secondary">
        分享
      </Button>
      <Button className="px-5" onClick={onNext} variant="secondary">
        下一项
      </Button>
    </div>
  );
}

export const UnifiedPostItem = SocialPostItem;
export const UnifiedTimelineTabs = SocialFeedTabs;
export const UnifiedInteractionBar = SocialInteractionBar;
export const UnifiedProfileHeader = SocialProfileHeader;
export const UnifiedProfileTopBar = SocialProfileTopBar;
export const UnifiedProfileTabs = SocialProfileTabs;
export const UnifiedReplyFeed = UnifiedReplyList;
export const UnifiedFollowButton = SocialFollowButton;
export const UnifiedMediaViewerControls = MediaViewerControls;
export const UnifiedPostTextRenderer = SocialPostTextRenderer;
