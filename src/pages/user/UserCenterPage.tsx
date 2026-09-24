import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import {
  IconButton,
  PrimaryButton,
} from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { AvatarCropEditor, createCroppedAvatarDataUrl, type AvatarCropState } from "../../components/ui/AvatarCropEditor";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { PrivacyModeConfirmDialog } from "../../components/ui/PrivacyModeConfirmDialog";
import { InfoTooltipTrigger } from "../../components/ui/TitleWithInfo";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { platformMembershipTierText } from "../../shared/profile-card/platformMembershipTierText";
import { LocalizedTextEditor } from "../../shared/localized-content/LocalizedTextEditor";
import { localizedText } from "../../shared/localized-content/localizedText";
import { registerTranslationEntries, type Language } from "../../i18n/translations";
import {
  bookingApi,
  type BookingOrderStatus,
} from "../../features/booking/api";
import { mapCoreCustomerToCustomer } from "../../features/core-read/api";
import {
  customerProfileApi,
  type CustomerSelfProfile,
} from "../../features/core-read/customerProfileApi";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { walletApi, type WalletSummary } from "../../features/wallet/api";
import {
  formatWalletAmount,
  hasTestNdpWallet,
} from "../../features/wallet/presentation";
import {
  platformMembershipSelfApi,
  type MyExperienceSummary,
  type MyPlatformMembership,
} from "../../features/platform-membership/api";
import { CurrentMembershipBenefits } from "../../features/platform-membership/CurrentMembershipBenefits";
import { readImageFileAsDataUrl } from "../../lib/imageUpload";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { cn } from "../../lib/utils";
import { PlatformMembershipDetailCard } from "../../shared/profile-card/PlatformMembershipDetailCard";
import { resolveMembershipDetailGradient, resolveMembershipTheme } from "../../shared/profile-card/platformMembershipTheme";
import { usePlatformSettings } from "../../features/platform-settings/PlatformSettingsProvider";
import {
  formatCustomerCreditReviewCount,
  formatCustomerCreditScore,
  formatCustomerGenderLabel,
} from "../../shared/profile-card/customerProfileLabels";
import {
  PROFILE_LANGUAGE_OPTIONS,
  normalizeProfileLanguageLabels,
} from "../../shared/profile-card/profileLanguages";
import type { Customer } from "../../types/domain";

registerTranslationEntries({
  "现金、PayPay、PayPal、在线支付": { "zh-Hant": "現金、PayPay、PayPal、線上支付", ja: "現金・PayPay・PayPal・オンライン決済", en: "Cash, PayPay, PayPal, online payment", ko: "현금, PayPay, PayPal, 온라인 결제" }
});

const formalOrderStatuses = [
  "pending",
  "confirmed",
  "inService",
  "completed",
  "cancelled",
] as const satisfies readonly BookingOrderStatus[];
type FormalOrderCounts = Record<(typeof formalOrderStatuses)[number], number>;
type FormalUserCenterData = {
  experience: MyExperienceSummary;
  membership: MyPlatformMembership;
  orderCounts: FormalOrderCounts;
  profile: CustomerSelfProfile;
  wallet: WalletSummary;
};

const emptyFormalOrderCounts: FormalOrderCounts = {
  pending: 0,
  confirmed: 0,
  inService: 0,
  completed: 0,
  cancelled: 0,
};

const userCenterCollectionInfo: Record<Language, string> = {
  zh: "已收藏的服务、店铺、技师、动态与聊天记录",
  "zh-Hant": "已收藏的服務、店鋪、技師、動態與聊天記錄",
  ja: "お気に入りのサービス・店舗・スタッフ・投稿・チャット履歴",
  en: "Favorite services, shops, technicians, posts and chat records",
  ko: "즐겨찾기 서비스, 매장, 기술자, 게시물 및 채팅 기록",
};
const accountSettings: Array<{
  info: string;
  label: string;
  test?: boolean;
  to?: string;
}> = [
  {
    label: "账号设置",
    info: "手机号、邮箱、登录密码",
    to: "/me/settings/account",
  },
  {
    label: "支付方式",
    info: "现金、PayPay、PayPal、在线支付",
    to: "/me/settings/payment-methods",
  },
  {
    label: "发票记录",
    info: "企业抬头与历史发票",
    test: true,
  },
  {
    label: "通知设置",
    info: "订单、营销、客服提醒",
    to: "/me/settings/notifications",
  },
  {
    label: "隐私与安全",
    info: "登录设备、数据授权",
    to: "/me/settings/account",
  },
  { label: "联系客服", info: "退款、改期、投诉风控", to: "/support", test: true },
];

const pagePanelClassName =
  "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.05)]";
const pageInnerCardClassName =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)]";
const profileToastClassName =
  "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-bg))] px-4 py-3 text-center text-xs font-black text-[color:var(--client-primary-strong)] shadow-[0_18px_42px_rgba(0,0,0,0.26)] backdrop-blur-xl";
const userProfileGenderOptions: Array<{
  label: string;
  value: NonNullable<Customer["gender"]>;
}> = [
  { label: "女", value: "female" },
  { label: "男", value: "male" },
  { label: "不公开", value: "private" },
];
type UserProfileVisibility = "privateAll" | "limited" | "network";
type UserProfilePrivacyState = {
  enabled: boolean;
  visibility: UserProfileVisibility;
};
type UserProfileDraft = {
  avatar: string;
  nickname: string;
  gender: NonNullable<Customer["gender"]>;
  age: string;
  height: string;
  languages: string[];
};
const userProfilePrivacyOptions = [
  {
    value: "privateAll",
    label: "对所有人不可见",
    description: "仅本人可见",
  },
  {
    value: "limited",
    label: "对好友可见",
    description: "仅好友可以看到该账号信息",
  },
  {
    value: "network",
    label: "对好友以及关联人可见",
    description: "仅好友以及关联店铺和介绍关系中的关联人可见",
  },
] as const satisfies ReadonlyArray<{
  value: UserProfileVisibility;
  label: string;
  description: string;
}>;
const userProfileNameMaxCharacters = 13;
const userProfileNameMaxBytes = 26;

function describeUserCenterError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有读取个人数据的权限";
    if (error.status === 404) return "用户资料不存在或已不可见";
    if (error.status >= 500) return "个人数据服务暂时不可用，请稍后重试";
  }

  return "个人数据加载失败，请检查网络后重试";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getThemeProfileSurfaceClassNames() {
  return {
    shell:
      "border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_22%,transparent),transparent_34%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)),color-mix(in_srgb,var(--client-bg)_94%,black))] text-[color:var(--client-text)]",
    panel:
      "border-[color:color-mix(in_srgb,var(--client-line)_72%,var(--client-primary)_14%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_58%,var(--client-bg)_42%)]",
    metric:
      "border-[color:color-mix(in_srgb,var(--client-line)_70%,var(--client-primary)_16%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_50%,transparent)]",
    chip: "border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]",
    avatar:
      "border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] ring-1 ring-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)]",
    muted: "text-[color:var(--client-muted)]",
    label: "text-[color:var(--client-soft-muted)]",
    accent: "text-[color:var(--client-primary-strong)]",
    divider:
      "bg-[color:color-mix(in_srgb,var(--client-line)_70%,var(--client-primary)_18%)]",
  };
}

function buildUserProfile(customer: Customer) {
  return {
    avatar: customer.avatar || "",
    nickname: customer.nickname?.trim() || customer.name,
    age: customer.age?.trim() || "",
    height: customer.height?.trim() || "",
    gender: formatCustomerGenderLabel(customer.gender),
    languages: normalizeProfileLanguageLabels(customer.languages ?? []),
    bio: customer.bio?.trim() || "",
  };
}

function getUserProfileNameByteLength(value: string) {
  return Array.from(value).reduce(
    (sum, character) => sum + (/^[\x00-\x7F]$/.test(character) ? 1 : 2),
    0,
  );
}

function getUserProfileNameEditorWidth(value: string) {
  const visualUnits = Array.from(value.trim() || "用户").reduce(
    (sum, character) => sum + (/^[\x00-\x7F]$/.test(character) ? 0.62 : 1),
    0,
  );

  return `${clampNumber(visualUnits + 0.85, 3.2, 14)}em`;
}

function limitUserProfileName(value: string) {
  let nextValue = "";
  let nextBytes = 0;

  for (const character of Array.from(value.replace(/[\r\n]+/g, " "))) {
    const characterBytes = getUserProfileNameByteLength(character);

    if (
      Array.from(nextValue).length >= userProfileNameMaxCharacters ||
      nextBytes + characterBytes > userProfileNameMaxBytes
    ) {
      break;
    }

    nextValue += character;
    nextBytes += characterBytes;
  }

  return nextValue;
}

function getUserProfileDisplayName(
  customer: Customer,
  draft?: UserProfileDraft | null,
) {
  return draft?.nickname.trim() || customer.nickname?.trim() || customer.name;
}

function formatUserHeightInput(value?: string) {
  return (value ?? "")
    .trim()
    .replace(/\s*(cm|厘米|センチ|㎝)$/i, "")
    .trim();
}

function normalizeUserHeightForStorage(value: string) {
  const height = formatUserHeightInput(value);

  if (!height) {
    return "";
  }

  return /^\d+(?:\.\d+)?$/.test(height) ? `${height}cm` : height;
}

function parseOptionalProfileNumber(
  value: string,
  options: { field: string; integer?: boolean; max: number; min: number },
): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  const valid =
    Number.isFinite(parsed) &&
    parsed >= options.min &&
    parsed <= options.max &&
    (!options.integer || Number.isInteger(parsed));

  if (!valid) {
    throw new Error(options.field);
  }

  return parsed;
}

function getUserProfilePrivacyLabel(visibility: UserProfileVisibility) {
  switch (visibility) {
    case "limited":
      return "对好友可见";
    case "network":
      return "对好友以及关联人可见";
    case "privateAll":
    default:
      return "对所有人不可见";
  }
}

function getUserProfilePrivacySummary(
  enabled: boolean,
  visibility: UserProfileVisibility,
) {
  return enabled ? getUserProfilePrivacyLabel(visibility) : "公开可见";
}

function getPersistedUserProfilePrivacy(
  visibility?: CustomerSelfProfile["visibility"],
): UserProfilePrivacyState {
  return visibility && visibility !== "public"
    ? { enabled: true, visibility }
    : { enabled: false, visibility: "privateAll" };
}

function UserProfilePrivacyInfoButton({ content }: { content: string }) {
  return (
    <InfoTooltipTrigger
      className="h-4 w-4 text-[10px]"
      content={content}
      label="查看隐私范围说明"
      panelMode="tooltip"
    />
  );
}

function buildUserProfileDraft(customer: Customer): UserProfileDraft {
  const profile = buildUserProfile(customer);

  return {
    avatar: profile.avatar,
    nickname: profile.nickname,
    gender: customer.gender ?? "private",
    age: profile.age,
    height: formatUserHeightInput(profile.height),
    languages: profile.languages,
  };
}

function readProfileFieldValue<
  T extends HTMLInputElement | HTMLTextAreaElement,
>(field: string, fallback: string) {
  if (typeof document === "undefined") {
    return fallback;
  }

  return (
    document.querySelector<T>(`[data-profile-field="${field}"]`)?.value ??
    fallback
  );
}

function UserCenterDataStatus({
  error,
  loading,
  onRetry,
}: {
  error?: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <MobileShell
      showBottomNav={false}
      navPanelStyle="plain"
      showTopEdgeMask={false}
    >
      <div className="relative flex min-h-[100dvh] flex-col bg-[radial-gradient(circle_at_top,rgba(60,136,126,0.14),transparent_34%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg)_94%,transparent),var(--client-bg))]">
        <MobileFullscreenHeader
          info="账号资料、订单入口与服务权益都统一收在这里。"
          onBack={() => navigate("/", { replace: true })}
          onClose={() => navigate("/", { replace: true })}
          showSpacer={false}
          title="个人中心"
        />
        <main className="client-app-gutter pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+86px)]">
          <section
            className={cn(pagePanelClassName, "py-8 text-center")}
            aria-live="polite"
            role={error ? "alert" : undefined}
          >
            <h1 className="text-lg font-black text-[color:var(--client-text)]">
              {loading ? "正在加载我的正式数据" : "我的数据加载失败"}
            </h1>
            {error ? (
              <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]">
                {error}
              </p>
            ) : null}
            {error && onRetry ? (
              <PrimaryButton className="mt-4 w-full" onClick={onRetry}>
                重新加载我的数据
              </PrimaryButton>
            ) : null}
          </section>
        </main>
      </div>
    </MobileShell>
  );
}

function FormalUserCenterDataGate({
  customerProfileId,
}: {
  customerProfileId: number;
}) {
  const [revision, setRevision] = useState(0);
  const cacheScope = getAuthenticatedPersistentCacheScope();
  const cacheKey = `user-center:self:${customerProfileId}`;
  const formalDataQuery = useCoreReadQuery(
    async () => {
      const [
        profile,
        wallet,
        counts,
        experience,
        membership,
      ] = await Promise.all([
        customerProfileApi.getMine(),
        walletApi.getMyWalletSummary(),
        Promise.all(
          formalOrderStatuses.map(async (status) => {
            const page = await bookingApi.listOrders({
              page: 1,
              pageSize: 1,
              status,
            });
            return [status, page.total] as const;
          }),
        ),
        platformMembershipSelfApi.getMyExperience(),
        platformMembershipSelfApi.getMine(),
      ]);

      if (profile.id !== customerProfileId) {
        throw new ApiClientError("error.forbidden", 403, 403);
      }

      return {
        experience,
        membership,
        profile,
        wallet,
        orderCounts: {
          ...emptyFormalOrderCounts,
          ...Object.fromEntries(counts),
        },
      } satisfies FormalUserCenterData;
    },
    [customerProfileId, revision],
    {
      force: revision > 0,
      key: cacheKey,
      scope: cacheScope,
    },
  );

  if (formalDataQuery.loading) {
    return <UserCenterDataStatus loading />;
  }

  if (formalDataQuery.error || !formalDataQuery.data) {
    return (
      <UserCenterDataStatus
        error={describeUserCenterError(formalDataQuery.error)}
        onRetry={() => setRevision((current) => current + 1)}
      />
    );
  }

  const formalData = formalDataQuery.data;
  return (
    <CompleteUserCenterPage
      formalData={formalData}
      key={formalData.profile.id}
      onFormalProfileUpdated={(profile) => {
        if (!cacheScope) return;
        void persistentResourceCache.write(cacheScope, cacheKey, {
          ...formalData,
          profile,
        }).catch(() => undefined);
      }}
    />
  );
}

function CompleteUserCenterPage({
  formalData,
  onFormalProfileUpdated,
}: {
  formalData: FormalUserCenterData;
  onFormalProfileUpdated: (profile: CustomerSelfProfile) => void;
}) {
  const navigate = useNavigate();
  const { language } = useOptionalI18n();
  const { refreshSession } = useAuth();
  const { settings: platformSettings } = usePlatformSettings();
  const tierCardTheme = platformSettings.membershipCardFollowUiTheme ? null : resolveMembershipTheme(formalData.membership.theme);
  const editCardStyle = tierCardTheme ? {
    "--client-bg": tierCardTheme.detailSurfaceBottomColor,
    "--client-surface": tierCardTheme.detailSurfaceColor,
    "--client-elevated": tierCardTheme.detailItemSurfaceColor,
    "--client-line": tierCardTheme.detailItemBorderColor,
    "--client-text": tierCardTheme.detailTextColor,
    "--client-muted": tierCardTheme.detailTextColor,
    "--client-soft-muted": tierCardTheme.detailTextColor,
    "--client-primary": tierCardTheme.detailAccentColor,
    "--client-primary-strong": tierCardTheme.detailAccentColor,
    "--client-primary-soft": `color-mix(in srgb, ${tierCardTheme.detailAccentColor} 20%, transparent)`,
    "--client-primary-contrast": tierCardTheme.detailAccentTextColor,
    backgroundColor: tierCardTheme.detailSurfaceColor,
    backgroundImage: resolveMembershipDetailGradient(tierCardTheme),
    borderColor: tierCardTheme.detailOuterBorderColor,
    color: tierCardTheme.detailTextColor,
  } as CSSProperties : undefined;
  const currentCustomer = useMemo(
    () => mapCoreCustomerToCustomer(formalData.profile),
    [formalData.profile],
  );
  const userProfile = useMemo(
    () => buildUserProfile(currentCustomer),
    [currentCustomer],
  );
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft | null>(
    null,
  );
  const [profileNameOverride, setProfileNameOverride] = useState("");
  const [profilePrivacyDraft, setProfilePrivacyDraft] =
    useState<UserProfilePrivacyState | null>(null);
  const [profilePrivacyMenuOpen, setProfilePrivacyMenuOpen] = useState(false);
  const [profilePrivacyConfirmOpen, setProfilePrivacyConfirmOpen] =
    useState(false);
  const [avatarCrop, setAvatarCrop] = useState<AvatarCropState | null>(null);
  const [profileToastMessage, setProfileToastMessage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [bioLocales, setBioLocales] = useState(formalData.profile.bioLocales);
  const visibleProfile = profileDraft
    ? {
        avatar: profileDraft.avatar,
        nickname: profileDraft.nickname,
        age: profileDraft.age,
        height: profileDraft.height,
        gender: formatCustomerGenderLabel(profileDraft.gender),
        languages: profileDraft.languages,
        bio: userProfile.bio,
      }
    : userProfile;
  const displayName = limitUserProfileName(
    getUserProfileDisplayName(currentCustomer, profileDraft),
  );
  const profileNameEditorWidth = getUserProfileNameEditorWidth(
    profileNameOverride || displayName,
  );
  const points = formalData.wallet.ndp.available;
  const pointsLabel = "NDP";
  const testPoints = hasTestNdpWallet(formalData.wallet)
    ? formatWalletAmount(formalData.wallet.testNdp.available)
    : null;
  const usageCount = Object.values(formalData.orderCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const creditScore = formatCustomerCreditScore(currentCustomer);
  const creditReviewLabel = formatCustomerCreditReviewCount(currentCustomer);
  const levelLabel = `Lv.${formalData.experience.level}`;
  const membershipSurface = getThemeProfileSurfaceClassNames();
  const savedProfilePrivacy = getPersistedUserProfilePrivacy(
    formalData.profile.visibility,
  );
  const activeProfilePrivacy =
    isEditingProfile && profilePrivacyDraft
      ? profilePrivacyDraft
      : savedProfilePrivacy;
  const profilePrivacySummary = getUserProfilePrivacySummary(
    activeProfilePrivacy.enabled,
    activeProfilePrivacy.visibility,
  );
  const nicknameInputRef = useRef<HTMLTextAreaElement>(null);
  const ageInputRef = useRef<HTMLInputElement>(null);
  const heightInputRef = useRef<HTMLInputElement>(null);
  const orderShortcuts = [
    { label: "待确认", count: formalData.orderCounts.pending, to: "/orders" },
    { label: "待服务", count: formalData.orderCounts.confirmed, to: "/orders" },
    { label: "进行中", count: formalData.orderCounts.inService, to: "/orders" },
    { label: "已完成", count: formalData.orderCounts.completed, to: "/orders" },
    { label: "已取消", count: formalData.orderCounts.cancelled, to: "/orders" },
  ];
  const serviceTools: Array<{
    label: string;
    info: string;
    to: string;
    test?: boolean;
  }> = [
    {
      label: "我的收藏",
      info: userCenterCollectionInfo[language],
      to: "/me/favorites",
    },
    {
      label: "我的地址",
      info: "家庭、公司、常用地址",
      to: "/me/addresses",
    },
    { label: "我的评价", info: "已评价与待回复", to: "/me" },
    {
      label: "eKYC本人确认",
      info: "实名、证件、本人确认",
      to: "/me/settings/verification",
    },
    {
      label: "店铺会员",
      info: "查看已加入店铺与会员卡状态",
      to: "/me/memberships",
      test: true,
    },
  ];
  const startProfileEdit = () => {
    const nextDraft = buildUserProfileDraft(currentCustomer);
    const limitedDraft = {
      ...nextDraft,
      nickname: limitUserProfileName(nextDraft.nickname),
    };

    setProfileDraft(limitedDraft);
    setProfileNameOverride(limitedDraft.nickname);
    setProfilePrivacyDraft(savedProfilePrivacy);
    setProfilePrivacyMenuOpen(false);
    setProfilePrivacyConfirmOpen(false);
    setAvatarCrop(null);
    setProfileToastMessage("");
    setIsEditingProfile(true);
  };
  const cancelProfileEdit = () => {
    setIsEditingProfile(false);
    setProfileDraft(null);
    setProfileNameOverride("");
    setProfilePrivacyDraft(null);
    setAvatarCrop(null);
    setProfilePrivacyMenuOpen(false);
    setProfilePrivacyConfirmOpen(false);
    setProfileToastMessage("");
  };
  const updateProfileDraft = (patch: Partial<UserProfileDraft>) => {
    if (isSavingProfile) {
      return;
    }

    const nextPatch =
      typeof patch.nickname === "string"
        ? { ...patch, nickname: limitUserProfileName(patch.nickname) }
        : patch;

    if (typeof nextPatch.nickname === "string") {
      setProfileNameOverride(nextPatch.nickname);
    }

    setProfileDraft((current) =>
      current ? { ...current, ...nextPatch } : current,
    );
  };
  const toggleProfileLanguage = (language: string) => {
    if (isSavingProfile) {
      return;
    }

    setProfileDraft((current) => {
      if (!current) {
        return current;
      }

      const languages = current.languages.includes(language)
        ? current.languages.filter((item) => item !== language)
        : [...current.languages, language];

      return {
        ...current,
        languages: languages.length > 0 ? languages : [language],
      };
    });
  };
  const persistProfilePrivacy = async (
    visibility: CustomerSelfProfile["visibility"],
  ) => {
    if (isSavingProfile) {
      return false;
    }

    setIsSavingProfile(true);
    setProfileToastMessage("");

    try {
      const updated = await customerProfileApi.updateMine({ visibility });
      onFormalProfileUpdated(updated);

      setProfileToastMessage(
        visibility === "public" ? "隐私模式已关闭" : "隐私模式设置已保存",
      );
      return true;
    } catch {
      setProfileToastMessage("隐私模式保存失败，请重试");
      return false;
    } finally {
      setIsSavingProfile(false);
    }
  };
  const updateProfilePrivacyEnabled = (enabled: boolean) => {
    if (isSavingProfile) {
      return;
    }

    if (enabled) {
      setProfilePrivacyConfirmOpen(true);
      return;
    }

    setProfilePrivacyMenuOpen(false);
    setProfilePrivacyConfirmOpen(false);

    if (isEditingProfile) {
      setProfilePrivacyDraft((current) => ({
        ...(current ?? savedProfilePrivacy),
        enabled,
      }));
      return;
    }

    void persistProfilePrivacy("public");
  };
  const confirmProfilePrivacyEnabled = () => {
    if (isSavingProfile) {
      return;
    }

    setProfilePrivacyConfirmOpen(false);

    if (isEditingProfile) {
      setProfilePrivacyDraft((current) => ({
        ...(current ?? savedProfilePrivacy),
        enabled: true,
      }));
      setProfilePrivacyMenuOpen(true);
      return;
    }

    void persistProfilePrivacy(savedProfilePrivacy.visibility).then((saved) => {
      if (saved) {
        setProfilePrivacyMenuOpen(true);
      }
    });
  };
  const updateProfilePrivacyVisibility = (
    visibility: UserProfileVisibility,
  ) => {
    if (isSavingProfile) {
      return;
    }

    setProfilePrivacyMenuOpen(false);

    if (isEditingProfile) {
      setProfilePrivacyDraft({ enabled: true, visibility });
      return;
    }

    void persistProfilePrivacy(visibility);
  };
  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (isSavingProfile) {
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setAvatarCrop({
      source: await readImageFileAsDataUrl(file, {
        maxDimension: 1800,
        maxStoredBytes: 1_200_000,
      }),
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      naturalWidth: 0,
      naturalHeight: 0,
    });
    setProfileToastMessage("");
  };
  const applyAvatarCrop = async () => {
    if (!avatarCrop || isSavingProfile) {
      return;
    }

    updateProfileDraft({
      avatar: await createCroppedAvatarDataUrl(avatarCrop),
    });
    setAvatarCrop(null);
    setProfileToastMessage("头像裁剪已套用，点击保存后生效。");
  };
  useEffect(() => {
    if (!profileToastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setProfileToastMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [profileToastMessage]);
  const copyNeedoId = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard_unavailable");
      }
      await navigator.clipboard.writeText(currentCustomer.systemId);
      setProfileToastMessage("已复制");
    } catch {
      setProfileToastMessage("复制失败，请手动复制");
    }
  };
  const saveProfileEdit = async () => {
    if (!profileDraft || isSavingProfile) {
      return;
    }

    const nicknameValue = limitUserProfileName(
      profileNameOverride ||
        readProfileFieldValue<HTMLTextAreaElement>(
          "nickname",
          nicknameInputRef.current?.value ?? profileDraft.nickname,
        ),
    );
    const ageValue = readProfileFieldValue<HTMLInputElement>(
      "age",
      ageInputRef.current?.value ?? profileDraft.age,
    );
    const heightValue = readProfileFieldValue<HTMLInputElement>(
      "height",
      heightInputRef.current?.value ?? profileDraft.height,
    );
    let ageNumber: number | null;
    let heightNumber: number | null;

    try {
      ageNumber = parseOptionalProfileNumber(ageValue, {
        field: "年龄必须是 0 到 150 之间的整数",
        integer: true,
        min: 0,
        max: 150,
      });
      heightNumber = parseOptionalProfileNumber(
        formatUserHeightInput(heightValue),
        { field: "身高必须是 30 到 250 之间的数字", min: 30, max: 250 },
      );
    } catch (error) {
      setProfileToastMessage(
        error instanceof Error ? error.message : "资料格式不正确，请检查后重试",
      );
      return;
    }
    const nextProfile = {
      avatar: profileDraft.avatar.trim() || currentCustomer.avatar,
      nickname: nicknameValue.trim() || currentCustomer.name,
      gender: profileDraft.gender,
      age: ageValue.trim(),
      height: normalizeUserHeightForStorage(heightValue),
      languages: profileDraft.languages,
    };
    setIsSavingProfile(true);
    setProfileToastMessage("");

    try {
      const updated = await customerProfileApi.updateMine({
        displayName: nextProfile.nickname,
        avatarDataUrl: nextProfile.avatar.startsWith("data:image/")
          ? nextProfile.avatar
          : undefined,
        gender: nextProfile.gender,
        age: ageNumber,
        heightCm: heightNumber,
        languages: nextProfile.languages,
        visibility: activeProfilePrivacy.enabled
          ? activeProfilePrivacy.visibility
          : "public",
      });

      const profileChanged =
        updated.displayName !== formalData.profile.displayName ||
        updated.avatarUrl !== formalData.profile.avatarUrl;
      onFormalProfileUpdated(updated);
      if (profileChanged) {
        await refreshSession();
      }
      setProfileNameOverride("");

      setIsEditingProfile(false);
      setProfileDraft(null);
      setProfilePrivacyDraft(null);
      setAvatarCrop(null);
      setProfileToastMessage("资料已保存，已退出编辑模式");
    } catch {
      setProfileToastMessage("资料保存失败，请保留当前内容后重试");
      setIsEditingProfile(true);
    } finally {
      setIsSavingProfile(false);
    }
  };
  const profilePrivacyControl = (
    <div
      className={
        (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
          ? cn(
              "relative z-30 rounded-[18px] border p-3",
              membershipSurface.panel,
            )
          : "relative z-30 rounded-[18px] border p-3"
      }
      data-testid="user-profile-privacy-control"
      style={
        (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
          ? undefined
          : {
              borderColor: formalData.membership.theme.detailItemBorderColor,
              backgroundColor:
                formalData.membership.theme.detailItemSurfaceColor,
            }
      }
    >
      <div className="flex items-center justify-between gap-3">
        <button
          aria-expanded={
            activeProfilePrivacy.enabled ? profilePrivacyMenuOpen : undefined
          }
          className="min-w-0 flex-1 text-left disabled:cursor-default"
          disabled={!activeProfilePrivacy.enabled || isSavingProfile}
          onClick={() => setProfilePrivacyMenuOpen((current) => !current)}
          type="button"
        >
          <p
            className={
              (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
                ? cn("text-xs font-bold", membershipSurface.label)
                : "text-xs font-bold opacity-60"
            }
          >
            隐私模式
          </p>
          <strong className="mt-1 block truncate text-sm">
            {profilePrivacySummary}
          </strong>
        </button>
        <ToggleSwitch
          ariaLabel="开启隐私模式"
          checked={activeProfilePrivacy.enabled}
          disabled={isSavingProfile}
          onChange={updateProfilePrivacyEnabled}
          size="md"
        />
      </div>
      <PrivacyModeConfirmDialog
        onCancel={() => setProfilePrivacyConfirmOpen(false)}
        onConfirm={confirmProfilePrivacyEnabled}
        open={profilePrivacyConfirmOpen}
      />
      {activeProfilePrivacy.enabled && profilePrivacyMenuOpen ? (
        <div
          className={
            (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
              ? cn(
                  "absolute right-0 top-[calc(100%+8px)] z-[90] grid w-[min(320px,calc(100vw-48px))] gap-2 rounded-[20px] border p-2 shadow-[0_22px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl",
                  membershipSurface.shell,
                )
              : "absolute right-0 top-[calc(100%+8px)] z-[90] grid w-[min(320px,calc(100vw-48px))] gap-2 rounded-[20px] border p-2 shadow-[0_22px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl"
          }
          data-testid="user-profile-privacy-options"
          style={
            (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
              ? undefined
              : {
                  borderColor:
                    formalData.membership.theme.detailOuterBorderColor,
                  backgroundColor:
                    formalData.membership.theme.detailSurfaceColor,
                }
          }
        >
          {userProfilePrivacyOptions.map((option) => {
            const checked = activeProfilePrivacy.visibility === option.value;

            return (
              <div
                className={
                  (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
                    ? cn(
                        "rounded-[18px] border px-3 py-3 text-left transition",
                        checked
                          ? membershipSurface.chip
                          : membershipSurface.panel,
                      )
                    : "rounded-[18px] border px-3 py-3"
                }
                key={option.value}
                style={
                  (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
                    ? undefined
                    : {
                        borderColor:
                          formalData.membership.theme.detailItemBorderColor,
                        backgroundColor:
                          formalData.membership.theme.detailItemSurfaceColor,
                      }
                }
              >
                <div className="flex items-center gap-3">
                  <button
                    aria-label={`选择${option.label}`}
                    className={
                    (isEditingProfile || platformSettings.membershipCardFollowUiTheme)
                        ? cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-black",
                            checked
                              ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)]"
                              : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-transparent",
                          )
                        : "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-black"
                    }
                    disabled={isSavingProfile}
                    onClick={() => updateProfilePrivacyVisibility(option.value)}
                    type="button"
                  >
                    {isEditingProfile || checked ? "✓" : ""}
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <button
                      className="min-w-0 truncate text-left text-sm font-black"
                      disabled={isSavingProfile}
                      onClick={() =>
                        updateProfilePrivacyVisibility(option.value)
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                    <UserProfilePrivacyInfoButton
                      content={option.description}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  return (
    <MobileShell
      showBottomNav={false}
      navPanelStyle="plain"
      showTopEdgeMask={false}
    >
      <div className="relative flex min-h-[100dvh] flex-col bg-[radial-gradient(circle_at_top,rgba(60,136,126,0.14),transparent_34%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg)_94%,transparent),var(--client-bg))]">
        <MobileFullscreenHeader
          info="账号资料、订单入口与服务权益都统一收在这里。"
          onBack={() => navigate("/", { replace: true })}
          onClose={() => navigate("/", { replace: true })}
          showSpacer={false}
          title="个人中心"
        />

        <main
          className={cn(
            "client-app-gutter scrollbar-none min-h-0 flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+86px)]",
            isEditingProfile
              ? "scroll-pb-[calc(132px+env(safe-area-inset-bottom))] pb-[calc(132px+env(safe-area-inset-bottom))]"
              : "pb-[calc(24px+env(safe-area-inset-bottom))]",
          )}
        >
          {profileToastMessage ? (
            <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+76px)] z-[90] flex justify-center px-6">
              <div className={profileToastClassName}>{profileToastMessage}</div>
            </div>
          ) : null}
          <div className="space-y-4">
            {!isEditingProfile ? (
              <>
                <PlatformMembershipDetailCard
                  actionSlot={
                    <IconButton
                      className="text-ink shadow-[0_14px_30px_rgba(0,0,0,0.22)]"
                      icon="edit"
                      label="编辑资料"
                      onClick={startProfileEdit}
                    />
                  }
                  age={visibleProfile.age ? Number(visibleProfile.age) : null}
                  avatarUrl={visibleProfile.avatar || null}
                  bio={localizedText(visibleProfile.bio, bioLocales, language) ?? ""}
                  credit={`${creditScore} /5`}
                  displayName={displayName}
                  ekycVerified={formalData.membership.ekycVerified}
                  entityKind="customer"
                  afterDetailsSlot={profilePrivacyControl}
                  gender={visibleProfile.gender}
                  heightCm={
                    formatUserHeightInput(visibleProfile.height) || null
                  }
                  languages={visibleProfile.languages}
                  level={formalData.experience.level}
                  needoId={currentCustomer.systemId}
                  onNeedoIdClick={() => void copyNeedoId()}
                  points={points.toLocaleString("en-US")}
                  pointsLabel={pointsLabel}
                  testPoints={testPoints}
                  theme={formalData.membership.theme}
                  tierLabel={
                    platformMembershipTierText(formalData.membership.tierCode, language)
                  }
                  usageCount={usageCount}
                />
              </>
            ) : (
              <section
                className={cn(
                  "relative z-30 overflow-visible rounded-[28px] border p-5 shadow-soft",
                  membershipSurface.shell,
                )}
                style={editCardStyle}
              >
                <div className="relative">
                  <IconButton
                    className={cn(
                      "absolute right-0 top-0 z-10 shadow-[0_14px_30px_rgba(0,0,0,0.22)]",
                      isEditingProfile
                        ? "border-red-400 bg-red-500 text-white hover:bg-red-600"
                        : cn(membershipSurface.metric, "text-ink"),
                      isSavingProfile
                        ? "cursor-not-allowed opacity-60"
                        : undefined,
                    )}
                    icon={isEditingProfile ? "x" : "edit"}
                    label={isEditingProfile ? "取消编辑" : "编辑资料"}
                    onClick={
                      isSavingProfile
                        ? undefined
                        : isEditingProfile
                          ? cancelProfileEdit
                          : startProfileEdit
                    }
                  />
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0">
                      <div className="relative h-28 w-28">
                        <AvatarImage
                          alt="用户头像"
                          className={cn(
                            "h-28 w-28 rounded-[28px] border-[3px] shadow-[0_18px_36px_rgba(0,0,0,0.28)]",
                            membershipSurface.avatar,
                          )}
                          src={visibleProfile.avatar}
                        />
                        {isEditingProfile ? (
                          <>
                            <input
                              accept="image/*"
                              className="hidden"
                              disabled={isSavingProfile}
                              onChange={handleAvatarUpload}
                              ref={avatarInputRef}
                              type="file"
                            />
                            <IconButton
                              className={cn(
                                "absolute bottom-2 right-2 h-10 w-10 border-[2px] text-white shadow-[0_12px_26px_rgba(0,0,0,0.34)]",
                                membershipSurface.metric,
                              )}
                              icon="edit"
                              label="更换头像"
                              onClick={
                                isSavingProfile
                                  ? undefined
                                  : () => avatarInputRef.current?.click()
                              }
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex min-h-28 min-w-0 flex-1 flex-col">
                      <div className="min-w-0 max-w-[calc(100%-44px)]">
                        {isEditingProfile && profileDraft ? (
                          <div className="flex min-w-0 items-start gap-1.5">
                            <textarea
                              aria-label="昵称"
                              className="-ml-0.5 max-h-[79px] min-h-[26px] max-w-[calc(100%-22px)] flex-none resize-none overflow-hidden break-all rounded-none border-0 bg-transparent px-0.5 py-0 text-lg font-black leading-tight shadow-none outline-none [appearance:none] [field-sizing:content] [overflow-wrap:anywhere]"
                              data-profile-field="nickname"
                              readOnly={isSavingProfile}
                              onChange={(event) =>
                                updateProfileDraft({
                                  nickname: event.currentTarget.value,
                                })
                              }
                              onInput={(event) =>
                                updateProfileDraft({
                                  nickname: event.currentTarget.value,
                                })
                              }
                              ref={nicknameInputRef}
                              rows={1}
                              style={{ width: profileNameEditorWidth }}
                              value={profileNameOverride}
                            />
                            <KycVerifiedBadge className="mt-1.5" size="label" />
                          </div>
                        ) : (
                          <h1 className="max-w-full overflow-hidden break-all text-lg font-black leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] [overflow-wrap:anywhere]">
                            {displayName}
                            <KycVerifiedBadge
                              className="ml-1 inline-flex align-middle"
                              size="label"
                            />
                          </h1>
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-xs font-black text-[color:var(--client-primary-strong)]">{platformMembershipTierText(formalData.membership.tierCode, language)}</span>
                        <span
                          className={cn(
                            "inline-flex h-7 shrink-0 items-center text-[11px] font-black",
                            membershipSurface.muted,
                          )}
                        >
                          {levelLabel}
                        </span>
                      </div>
                      <button
                        aria-label="复制 NeeDo ID"
                        className={cn(
                          "w-full cursor-copy truncate text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]",
                          membershipSurface.muted,
                        )}
                        onClick={() => void copyNeedoId()}
                        type="button"
                      >
                        ID {currentCustomer.systemId}
                      </button>
                    </div>
                  </div>

                  {avatarCrop ? (
                    <AvatarCropEditor
                      crop={avatarCrop}
                      onApply={applyAvatarCrop}
                      onCancel={() => setAvatarCrop(null)}
                      onChange={setAvatarCrop}
                    />
                  ) : null}

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      {
                        label: pointsLabel,
                        value: points.toLocaleString("en-US"),
                        secondary:
                          testPoints === null
                            ? undefined
                            : `Test NDP ${testPoints}`,
                      },
                      { label: "利用次数", value: `${usageCount}` },
                      { label: "信用值", value: creditScore, suffix: "/5" },
                    ].map((item) => (
                      <div
                        className={cn(
                          "rounded-[18px] border p-3",
                          membershipSurface.metric,
                        )}
                        key={item.label}
                      >
                        <p
                          className={cn(
                            "text-xs font-bold",
                            membershipSurface.label,
                          )}
                        >
                          {item.label}
                        </p>
                        <div className="mt-1 flex min-w-0 items-end gap-1">
                          <strong
                            className={cn(
                              "block text-[20px] leading-none",
                              item.label === "信用值"
                                ? membershipSurface.accent
                                : "",
                            )}
                          >
                            {item.value}
                          </strong>
                          {item.suffix ? (
                            <span
                              className={cn(
                                "pb-0.5 text-xs font-black leading-none",
                                membershipSurface.muted,
                              )}
                            >
                              {item.suffix}
                            </span>
                          ) : null}
                        </div>
                        {item.secondary ? (
                          <p
                            className={cn(
                              "mt-1 text-[10px] font-bold",
                              membershipSurface.muted,
                            )}
                          >
                            {item.secondary}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p
                    className={cn(
                      "mt-1 pr-2 text-right text-[10px] font-black leading-none",
                      membershipSurface.muted,
                    )}
                  >
                    信用值 {creditReviewLabel}
                  </p>

                  <div className={cn("my-4 h-px", membershipSurface.divider)} />


                  <div>
                    <h2 className="text-lg font-black">基础信息</h2>
                    {isEditingProfile && profileDraft ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div
                            className={cn(
                              "rounded-[18px] border p-3",
                              membershipSurface.panel,
                            )}
                          >
                            <p
                              className={cn(
                                "text-xs font-bold",
                                membershipSurface.label,
                              )}
                            >
                              性别
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {userProfileGenderOptions.map((option) => (
                                <button
                                  className={cn(
                                    "rounded-full border px-2.5 py-1 text-xs font-black",
                                    profileDraft.gender === option.value
                                      ? membershipSurface.chip
                                      : membershipSurface.metric,
                                  )}
                                  key={option.value}
                                  disabled={isSavingProfile}
                                  onClick={() =>
                                    updateProfileDraft({ gender: option.value })
                                  }
                                  type="button"
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <label
                            className={cn(
                              "block rounded-[18px] border p-3",
                              membershipSurface.panel,
                            )}
                          >
                            <span
                              className={cn(
                                "block text-xs font-bold",
                                membershipSurface.label,
                              )}
                            >
                              年龄
                            </span>
                            <input
                              className="mt-1 h-9 w-full bg-transparent text-sm font-black outline-none"
                              data-profile-field="age"
                              defaultValue={profileDraft.age}
                              disabled={isSavingProfile}
                              inputMode="numeric"
                              onChange={(event) =>
                                updateProfileDraft({
                                  age: event.currentTarget.value,
                                })
                              }
                              onInput={(event) =>
                                updateProfileDraft({
                                  age: event.currentTarget.value,
                                })
                              }
                              ref={ageInputRef}
                            />
                          </label>
                          <label
                            className={cn(
                              "block rounded-[18px] border p-3",
                              membershipSurface.panel,
                            )}
                          >
                            <span
                              className={cn(
                                "block text-xs font-bold",
                                membershipSurface.label,
                              )}
                            >
                              身高（cm）
                            </span>
                            <input
                              className="mt-1 h-9 w-full bg-transparent text-sm font-black outline-none"
                              data-profile-field="height"
                              defaultValue={profileDraft.height}
                              disabled={isSavingProfile}
                              inputMode="decimal"
                              onChange={(event) =>
                                updateProfileDraft({
                                  height: formatUserHeightInput(
                                    event.currentTarget.value,
                                  ),
                                })
                              }
                              onInput={(event) =>
                                updateProfileDraft({
                                  height: formatUserHeightInput(
                                    event.currentTarget.value,
                                  ),
                                })
                              }
                              ref={heightInputRef}
                            />
                          </label>
                        </div>
                        <div
                          className={cn(
                            "rounded-[18px] border p-3",
                            membershipSurface.panel,
                          )}
                        >
                          <p
                            className={cn(
                              "text-xs font-bold",
                              membershipSurface.label,
                            )}
                          >
                            语言能力
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {PROFILE_LANGUAGE_OPTIONS.map((language) => (
                              <button
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-xs font-black",
                                  profileDraft.languages.includes(language)
                                    ? membershipSurface.chip
                                    : membershipSurface.metric,
                                )}
                                key={language}
                                disabled={isSavingProfile}
                                onClick={() => toggleProfileLanguage(language)}
                                type="button"
                              >
                                {language}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {[
                            ["性别", visibleProfile.gender],
                            ["年龄", visibleProfile.age || "未设置"],
                            [
                              "身高（cm）",
                              formatUserHeightInput(visibleProfile.height) ||
                                "未设置",
                            ],
                          ].map(([label, value]) => (
                            <div
                              className={cn(
                                "rounded-[18px] border p-3",
                                membershipSurface.panel,
                              )}
                              key={label}
                            >
                              <p
                                className={cn(
                                  "text-xs font-bold",
                                  membershipSurface.label,
                                )}
                              >
                                {label}
                              </p>
                              <strong className="mt-1 block truncate text-sm">
                                {value}
                              </strong>
                            </div>
                          ))}
                        </div>
                        <div
                          className={cn(
                            "mt-3 rounded-[18px] border p-3",
                            membershipSurface.panel,
                          )}
                        >
                          <p
                            className={cn(
                              "text-xs font-bold",
                              membershipSurface.label,
                            )}
                          >
                            语言能力
                          </p>
                          {visibleProfile.languages.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {visibleProfile.languages.map((language) => (
                                <span
                                  className={cn(
                                    "rounded-full border px-2.5 py-1 text-xs font-black",
                                    membershipSurface.chip,
                                  )}
                                  key={language}
                                >
                                  {language}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p
                              className={cn(
                                "mt-2 text-sm font-semibold",
                                membershipSurface.muted,
                              )}
                            >
                              未设置
                            </p>
                          )}
                        </div>
                        <div
                          className={cn(
                            "mt-3 overflow-hidden rounded-[24px] border px-5 py-4",
                            membershipSurface.panel,
                          )}
                        >
                          <p
                            className={cn(
                              "text-xs font-bold",
                              membershipSurface.label,
                            )}
                          >
                            自我介绍
                          </p>
                          <p
                            className={cn(
                              "mt-2 text-sm leading-6",
                              membershipSurface.muted,
                            )}
                            data-no-i18n={Boolean(localizedText(visibleProfile.bio, bioLocales, language))}
                          >
                            {localizedText(visibleProfile.bio, bioLocales, language) || "未设置"}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  {isEditingProfile && profileDraft ? <LocalizedTextEditor
                    disabled={isSavingProfile}
                    fields={[{ key: "bio", label: "自我介绍", maxLength: 2000, multiline: true }]}
                    fallback={{ bio: formalData.profile.bio ?? "" }}
                    translations={Object.fromEntries(Object.entries(bioLocales ?? {}).map(([locale, bio]) => [locale, { bio }]))}
                    onSave={async (locale, values) => {
                      const saved = await customerProfileApi.updateMine({ localizedBio: { locale, bio: values.bio } });
                      setBioLocales(saved.bioLocales);
                      onFormalProfileUpdated(saved);
                    }}
                    onSyncAll={async (locale, values) => {
                      const saved = await customerProfileApi.updateMine({ localizedBio: { locale, bio: values.bio, syncAll: true } });
                      setBioLocales(saved.bioLocales);
                      onFormalProfileUpdated(saved);
                    }}
                  /> : null}
                  <div className="mt-3">{profilePrivacyControl}</div>
                </div>
              </section>
            )}

            <section className={pagePanelClassName}>
              <div className="flex items-center justify-between">
                <h2 className="font-black">我的订单</h2>
                <Link className="text-sm font-bold text-moss" to="/orders">
                  全部订单
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {orderShortcuts.map((item) => (
                  <Link
                    className={cn(
                      pageInnerCardClassName,
                      "px-1 py-3 text-center text-xs font-bold text-ink/70",
                    )}
                    key={item.label}
                    to={item.to}
                  >
                    <strong className="block text-base text-ink">
                      {item.count}
                    </strong>
                    {item.label}
                  </Link>
                ))}
              </div>
              <div
                className={cn(
                  pageInnerCardClassName,
                  "relative mt-3 px-3 py-3",
                )}
              >
                <Link
                  aria-label="预约一览"
                  className="absolute inset-0 rounded-[24px]"
                  to="/orders"
                />
                <div className="pointer-events-none relative z-10 flex min-h-8 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <strong className="text-sm">预约一览</strong>
                    <InfoTooltipTrigger
                      className="pointer-events-auto relative h-4 w-4 shrink-0 border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] text-[10px] text-ink/45 before:absolute before:-inset-3 before:content-[''] hover:text-ink/80"
                      content="查看全部预约、订单状态和详情跳转"
                      label="查看预约一览说明"
                      panelMode="tooltip"
                    />
                  </div>
                  <span className="text-lg font-black text-ink/25">›</span>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              {serviceTools.map((entry) => (
                <div
                  className={cn(
                    pagePanelClassName,
                    "relative min-h-[74px] px-4 py-3",
                  )}
                  key={entry.label}
                >
                  {entry.test ? (
                    <TestFeatureBadge className="pointer-events-none absolute -right-1 -top-1 z-20 min-h-4 px-1.5 py-0 text-[8px]" />
                  ) : null}
                  <Link
                    aria-label={entry.label}
                    className="absolute inset-0 rounded-[28px]"
                    to={entry.to}
                  />
                  <div className="pointer-events-none relative z-10 flex min-h-[50px] items-center">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h3 className="min-w-0 text-sm font-black">{entry.label}</h3>
                      <InfoTooltipTrigger
                        className="pointer-events-auto relative h-4 w-4 shrink-0 border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] text-[10px] text-ink/45 before:absolute before:-inset-3 before:content-[''] hover:text-ink/80"
                        content={entry.info}
                        label="查看说明"
                        panelMode="tooltip"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <CurrentMembershipBenefits
                className={cn(pagePanelClassName, "min-h-[74px] px-3 py-3")}
                language={language}
              />
            </section>

            <section className={pagePanelClassName} data-testid="user-center-account-settings">
              <h2 className="font-black">账号与服务</h2>
              <div className="mt-3 grid gap-2">
                {accountSettings.map((entry) => {
                  const className = cn(
                    pageInnerCardClassName,
                    "relative min-h-[64px] w-full px-4 py-3",
                  );

                  return (
                    <div
                      className={cn(
                        className,
                        !entry.to && "opacity-65",
                      )}
                      data-disabled={entry.to ? undefined : "true"}
                      data-testid={entry.to ? undefined : "user-center-invoice-entry"}
                      key={entry.label}
                    >
                      {entry.test ? (
                        <TestFeatureBadge className="pointer-events-none absolute -right-1 -top-1 z-20 min-h-4 px-1.5 py-0 text-[8px]" />
                      ) : null}
                      {entry.to ? (
                        <Link
                          aria-label={entry.label}
                          className="absolute inset-0 rounded-[24px]"
                          to={entry.to}
                        />
                      ) : null}
                      <div className="pointer-events-none relative z-10 grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <div className="flex min-w-0 items-center gap-1.5 text-left">
                          <strong className="min-w-0 text-sm">{entry.label}</strong>
                          <InfoTooltipTrigger
                            className="pointer-events-auto relative h-4 w-4 shrink-0 border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] text-[10px] text-ink/45 before:absolute before:-inset-3 before:content-[''] hover:text-ink/80"
                            content={entry.info}
                            label={`查看${entry.label}说明`}
                            panelMode="tooltip"
                          />
                        </div>
                        <span className="justify-self-end text-sm font-black text-ink/35">
                          {entry.to ? "›" : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </main>
        {isEditingProfile ? (
          <div
            className="client-app-frame client-app-gutter pointer-events-none fixed inset-x-0 bottom-0 z-[80] pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-8"
            data-testid="user-profile-save-action"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
              <button className="pointer-events-auto rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-4 text-sm font-black text-[color:var(--client-text)] disabled:opacity-60" disabled={isSavingProfile} onClick={cancelProfileEdit} type="button">取消</button>
              <button className="pointer-events-auto rounded-[22px] bg-[color:var(--client-primary)] px-3 py-4 text-sm font-black text-[color:var(--client-needo-text)] shadow-[0_18px_46px_rgba(0,0,0,0.36)] disabled:opacity-60" disabled={isSavingProfile} onClick={() => void saveProfileEdit()} type="button">{isSavingProfile ? "正在保存资料" : "保存并退出"}</button>
            </div>
          </div>
        ) : null}
      </div>
    </MobileShell>
  );
}

export function UserCenterPage() {
  const { session } = useAuth();

  if (
    !session ||
    (session.loginMethod !== "password" && session.loginMethod !== "google")
  ) {
    return <UserCenterDataStatus error="登录状态已失效，请重新登录" />;
  }

  if (
    session.currentIdentity.type !== "customer" ||
    !session.currentIdentity.scopeId
  ) {
    return <UserCenterDataStatus error="当前身份没有读取个人数据的权限" />;
  }

  return (
    <FormalUserCenterDataGate
      customerProfileId={session.currentIdentity.scopeId}
    />
  );
}
