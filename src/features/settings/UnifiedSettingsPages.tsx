import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { PortalScope } from "../../auth/AuthProvider";
import { useAuth } from "../../auth/AuthProvider";
import { PrimaryButton, SecondaryButton, SectionBlock, SegmentedTabs, StickyBottomBar, SurfacePanel } from "../../components/client-ui/AppScaffold";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { FloatingHeaderSearchBar } from "../../components/mobile/FloatingHeaderSearchBar";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { ImageGalleryManager } from "../../components/ui/ImageGalleryManager";
import { InfoTooltipTrigger, TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { businessCpsPromoters } from "../business-cps/model";
import {
  SettingsDetailPage,
  SettingsArrow,
  SettingsHomePage,
  SettingsListItem,
  SettingsRadioListPage,
  SettingsSection
} from "../../components/client-ui/SettingsDirectory";
import { useI18n } from "../../i18n/I18nProvider";
import { languages, translateText, type Language } from "../../i18n/translations";
import {
  fetchGoogleAccountApi,
  getGoogleAccountActorId,
  googleAccountIconSrc,
  type GoogleAccountAuthUrlResponse,
  type GoogleAccountConnectionStatus,
  type GoogleAccountScope
} from "../../lib/googleAccountApi";
import { readImageFileAsDataUrl } from "../../lib/imageUpload";
import {
  detectPwaInstallPlatform,
  normalizePwaInstallPromptOutcome,
  shouldShowPwaInstallSetting,
  type BeforeInstallPromptEvent,
  type PwaInstallPlatform,
  type PwaInstallPromptOutcome
} from "../../lib/pwaInstall";
import {
  detectStorePresentationIndustry,
  getStorePresentationConfig,
  normalizeStorePresentationConfig
} from "../../lib/storePresentation";
import { cn } from "../../lib/utils";
import { CustomerMembershipBadge } from "../../shared/profile-card";
import { formatCustomerCreditScore } from "../../shared/profile-card/customerProfileLabels";
import { updateCustomerEntity, updateStoreEntity, updateTechnicianEntity, useEntityStore } from "../../state/entityStore";
import { selectHomeLocationManually } from "../../state/homeLocationStore";
import { updateHomeLayoutConfig, useHomeLayoutStore, type HomeLocationOption } from "../../state/homeLayoutStore";
import { getNeedoPetAssetProgress, preloadNeedoPetAssets, useNeedoPetAssetReadiness, type NeedoPetAssetReadiness } from "../../state/needoPetAssets";
import { setNeedoPetEnabled, useNeedoPetSettings } from "../../state/needoPetSettings";
import { useProfileCardBackgroundSettings } from "../../state/profileCardBackgroundStore";
import type { Customer, InfoCardVisibilityMode, InfoCardVisibilitySettings, Store, StorePresentationConfig, Technician } from "../../types/domain";
import { clientThemes, useClientTheme, type ClientThemeDefinition } from "../../theme/ClientThemeProvider";
import {
  summarizePortalSettingsState,
  usePortalSettingsState,
  type BusinessPortalSettingsState,
  type MerchantPortalSettingsState,
  type TechnicianPortalSettingsState,
  type UnifiedSettingsPortal
} from "./portalSettingsState";
import { getLegalPrivacyDocument, getLegalPrivacyUiCopy, type LegalPrivacyBlock } from "./legalPrivacyContent";
import { getLegalTermsDocument, getLegalTermsUiCopy } from "./legalTermsContent";

const serviceAreaPool = ["银座", "新宿", "涩谷", "惠比寿", "目黑", "六本木", "品川", "东京站", "池袋", "横滨"];
const settingsListDividerClassName = "divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]";
const appVersion = "0.001";
const merchantTagPool = ["深夜营业", "女性友好", "到店主力", "上门服务", "可预约", "多语言", "企业合作", "高复购"];

function normalizeAreaToken(value: string) {
  return value.toLocaleLowerCase().replace(/[\s/／・,，、区市町丁目.-]/g, "");
}

function buildServiceAreaOptions(...sources: Array<string | string[] | undefined>) {
  const values = sources.flatMap((source) => (Array.isArray(source) ? source : source ? [source] : []));

  return Array.from(new Set([...serviceAreaPool, ...values.map((value) => value.trim()).filter(Boolean)]));
}

function getManualHomeLocationId(area: string) {
  const encoded = Array.from(area.trim())
    .map((char) => char.charCodeAt(0).toString(36))
    .join("-");

  return `manual-location-${encoded || "area"}`;
}

function getHomeLocationAreaLabel(location: HomeLocationOption) {
  const tokens = [location.district, location.area, location.city, location.label].filter(Boolean).map((value) => normalizeAreaToken(value ?? ""));
  const matchedArea = serviceAreaPool.find((area) => {
    const areaToken = normalizeAreaToken(area);

    return tokens.some((token) => token.includes(areaToken) || areaToken.includes(token));
  });

  return matchedArea ?? location.district ?? location.area ?? location.label;
}

function findHomeLocationForArea(locations: HomeLocationOption[], area: string) {
  const areaToken = normalizeAreaToken(area);

  return locations.find((location) => {
    const tokens = [location.label, location.city, location.area, location.district ?? ""].map(normalizeAreaToken).filter(Boolean);

    return tokens.some((token) => token === areaToken || token.includes(areaToken) || areaToken.includes(token));
  });
}

function createManualHomeLocation(area: string): HomeLocationOption {
  return {
    id: getManualHomeLocationId(area),
    label: area,
    city: area === "横滨" ? "横滨" : "东京",
    area
  };
}

function settingsListToText(items: string[]) {
  return items.join("\n");
}

function settingsTextToList(value: string) {
  return value
    .split(/\n|,|，|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const compactPortalLabels: Record<PortalScope, { label: string; caption: string }> = {
  user: { label: "用户", caption: "预约、动态、聊天" },
  technician: { label: "技师", caption: "任务、日程、收入" },
  merchant: { label: "店铺", caption: "门店、日程、经营" },
  business: { label: "联盟营销", caption: "推广、素材、收益" },
  admin: { label: "后台", caption: "管理与运营" }
};

type SwitchableSettingsPortal = Extract<UnifiedSettingsPortal, "user" | "technician" | "merchant" | "business">;

const settingsPortalOptions: SwitchableSettingsPortal[] = ["user", "technician", "merchant", "business"];

const backendSettingsPortalEntries = [
  {
    id: "merchant-admin",
    title: "商户后台",
    subtitle: "店铺订单、排班、员工、财务与门店设置",
    href: "/store-admin.html#/login/merchant-admin"
  },
  {
    id: "operations-admin",
    title: "运营后台",
    subtitle: "平台运营、店铺、技师、订单、财务与全局规则",
    href: "/pf-admin.html#/login/admin"
  },
  {
    id: "afirieito-admin",
    title: "NDA管理后台",
    subtitle: "推广计划、归因、分佣、风险与增长数据管理",
    href: "/afirieito-admin.html#/NDA-admin"
  }
] as const;

function getPortalEntry(portal: PortalScope | UnifiedSettingsPortal) {
  if (portal === "business") {
    return "/afirieito";
  }

  if (portal === "merchant") {
    return "/merchant";
  }

  if (portal === "technician") {
    return "/technician";
  }

  if (portal === "admin") {
    return "/admin";
  }

  return "/";
}

function SettingsPortalSelectionIndicator({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "relative z-10 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
        active
          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-transparent text-transparent"
      )}
    >
      <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 12 12">
        <path d="m2.5 6 2.2 2.2L9.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    </span>
  );
}

function SettingsPortalInfoTrigger({ content, label }: { content: ReactNode; label: string }) {
  return (
    <InfoTooltipTrigger
      className="h-4 w-4 text-[10px]"
      content={content}
      label={label}
      panelMode="tooltip"
      panelClassName="font-medium"
    />
  );
}

function SettingsPortalActionRow({
  active = false,
  actionLabel,
  info,
  infoLabel,
  onClick,
  title,
  trailing
}: {
  active?: boolean;
  actionLabel: string;
  info: ReactNode;
  infoLabel: string;
  onClick: () => void;
  title: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <div
      aria-label={actionLabel}
      className={cn(
        "group relative flex min-h-[60px] w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-1.5 before:rounded-[18px] before:transition focus:outline-none focus-visible:before:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)] focus-within:before:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]",
        active
          ? "before:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]"
          : "hover:before:bg-[color:color-mix(in_srgb,var(--client-primary)_6%,transparent)]"
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-black text-[color:var(--client-text)]">{title}</span>
          <SettingsPortalInfoTrigger content={info} label={infoLabel} />
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-2">{trailing}</div>
    </div>
  );
}

function getSettingsBasePath(portal: UnifiedSettingsPortal) {
  if (portal === "business") {
    return "/afirieito/settings";
  }

  if (portal === "merchant") {
    return "/merchant/settings";
  }

  if (portal === "technician") {
    return "/technician/settings";
  }

  return "/me/settings";
}

function getSettingsPath(portal: UnifiedSettingsPortal, segment?: string) {
  const basePath = getSettingsBasePath(portal);
  return segment ? `${basePath}/${segment}` : basePath;
}

function getGoogleAccountScopeForPortal(portal: UnifiedSettingsPortal): GoogleAccountScope {
  return portal;
}

const googleAccountBindingCopy: Record<
  Language,
  {
    accountTitle: string;
    checking: string;
    connect: string;
    connected: string;
    connectedFallback: string;
    connecting: string;
    disconnected: string;
    disconnectedSubtitle: string;
    reconnect: string;
    sectionInfo: string;
    sectionTitle: string;
  }
> = {
  zh: {
    accountTitle: "Google 账号",
    checking: "检查中",
    connect: "绑定 Google 账号",
    connected: "已绑定",
    connectedFallback: "当前账号已授权 Google 身份",
    connecting: "正在打开 Google 账号授权",
    disconnected: "未绑定",
    disconnectedSubtitle: "用于账号绑定、登录和后续 Google 服务连接",
    reconnect: "重新授权 Google 账号",
    sectionInfo: "绑定后可以用于 Google 登录，并作为日历等 Google 服务授权的账号基础。",
    sectionTitle: "Google 账号绑定"
  },
  "zh-Hant": {
    accountTitle: "Google 帳號",
    checking: "檢查中",
    connect: "綁定 Google 帳號",
    connected: "已綁定",
    connectedFallback: "目前帳號已授權 Google 身分",
    connecting: "正在開啟 Google 帳號授權",
    disconnected: "未綁定",
    disconnectedSubtitle: "用於帳號綁定、登入與後續 Google 服務連接",
    reconnect: "重新授權 Google 帳號",
    sectionInfo: "綁定後可用於 Google 登入，並作為日曆等 Google 服務授權的帳號基礎。",
    sectionTitle: "Google 帳號綁定"
  },
  ja: {
    accountTitle: "Googleアカウント",
    checking: "確認中",
    connect: "Googleアカウントの連携",
    connected: "連携済み",
    connectedFallback: "Googleアカウントを連携済み",
    connecting: "Googleアカウント連携を開いています",
    disconnected: "連携されてない",
    disconnectedSubtitle: "Googleログインとサービス連携に使用",
    reconnect: "Googleアカウントを再連携",
    sectionInfo: "連携後は Google ログインと Google サービス連携に使用できます。",
    sectionTitle: "Googleアカウントの連携"
  },
  en: {
    accountTitle: "Google Account",
    checking: "Checking",
    connect: "Link Google Account",
    connected: "Linked",
    connectedFallback: "Google identity authorized",
    connecting: "Opening Google authorization",
    disconnected: "Not linked",
    disconnectedSubtitle: "Used for Google login and service connections",
    reconnect: "Reauthorize Google Account",
    sectionInfo: "After linking, this account can be used for Google login and Google service authorization.",
    sectionTitle: "Google Account Linking"
  },
  ko: {
    accountTitle: "Google 계정",
    checking: "확인 중",
    connect: "Google 계정 연결",
    connected: "연결됨",
    connectedFallback: "Google 계정 인증 완료",
    connecting: "Google 계정 인증을 여는 중",
    disconnected: "연결되지 않음",
    disconnectedSubtitle: "Google 로그인 및 서비스 연결에 사용",
    reconnect: "Google 계정 다시 인증",
    sectionInfo: "연결 후 Google 로그인과 Google 서비스 인증에 사용할 수 있습니다.",
    sectionTitle: "Google 계정 연결"
  }
};

function getSettingsNavItems(portal: UnifiedSettingsPortal) {
  return portal === "business" ? businessNavItems : undefined;
}

function getSupportPath(portal: UnifiedSettingsPortal) {
  if (portal === "business") {
    return "/afirieito/me";
  }

  if (portal === "merchant") {
    return "/merchant/messages";
  }

  if (portal === "technician") {
    return "/technician/messages";
  }

  return "/support";
}

function getPortalMePath(portal: UnifiedSettingsPortal) {
  if (portal === "business") {
    return "/afirieito/me";
  }

  if (portal === "merchant") {
    return "/merchant/me";
  }

  if (portal === "technician") {
    return "/technician/me";
  }

  return "/me";
}

function isUnifiedSettingsPortal(portal: PortalScope | UnifiedSettingsPortal | undefined | null): portal is UnifiedSettingsPortal {
  return portal === "user" || portal === "technician" || portal === "merchant" || portal === "business";
}

export function resolveSettingsSelectedPortal(routePortal: UnifiedSettingsPortal, sessionPortal?: PortalScope | null): UnifiedSettingsPortal {
  if (settingsPortalOptions.includes(routePortal as SwitchableSettingsPortal)) {
    return routePortal;
  }

  if (settingsPortalOptions.includes(sessionPortal as SwitchableSettingsPortal)) {
    return sessionPortal as UnifiedSettingsPortal;
  }

  return "user";
}

export function shouldKeepSettingsRoutePortal({
  activePortal,
  canEnterRoutePortal,
  pendingTargetPortal,
  routePortal
}: {
  activePortal?: PortalScope | null;
  canEnterRoutePortal: boolean;
  pendingTargetPortal?: UnifiedSettingsPortal;
  routePortal: UnifiedSettingsPortal;
}) {
  if (pendingTargetPortal === routePortal) {
    return true;
  }

  if (!isUnifiedSettingsPortal(activePortal) || activePortal === routePortal) {
    return true;
  }

  return canEnterRoutePortal;
}

const supportedSettingsSuffixes: Record<UnifiedSettingsPortal, Set<string>> = {
  user: new Set([
    "",
    "/theme",
    "/language",
    "/portal",
    "/profile",
    "/verification",
    "/service-range",
    "/account",
    "/notifications",
    "/help",
    "/about",
    "/terms",
    "/privacy",
    "/delete-account"
  ]),
  technician: new Set([
    "",
    "/theme",
    "/language",
    "/portal",
    "/profile",
    "/verification",
    "/service-range",
    "/account",
    "/notifications",
    "/help",
    "/about",
    "/terms",
    "/privacy",
    "/delete-account"
  ]),
  merchant: new Set([
    "",
    "/theme",
    "/language",
    "/portal",
    "/profile",
    "/verification",
    "/service-range",
    "/account",
    "/notifications",
    "/help",
    "/about",
    "/terms",
    "/privacy",
    "/delete-account"
  ]),
  business: new Set([
    "",
    "/theme",
    "/language",
    "/portal",
    "/account",
    "/notifications",
    "/help",
    "/about",
    "/terms",
    "/privacy",
    "/delete-account"
  ])
};

type SettingsNavigationState = {
  settingsSwitchedFromPortal?: boolean;
  settingsPortalTarget?: UnifiedSettingsPortal;
};

function useSettingsPortalRedirect(portal: UnifiedSettingsPortal) {
  return useSettingsPortalRedirectWithOptions(portal);
}

function useSettingsPortalRedirectWithOptions(
  portal: UnifiedSettingsPortal,
  {
    preserveSuffix = true,
    redirectToEntryOnPortalChange = false
  }: {
    preserveSuffix?: boolean;
    redirectToEntryOnPortalChange?: boolean;
  } = {}
) {
  const location = useLocation();
  const { canEnterPortal, session } = useAuth();
  const activePortal = session?.portal;
  const pendingTargetPortal = (location.state as SettingsNavigationState | null)?.settingsPortalTarget;

  if (
    shouldKeepSettingsRoutePortal({
      activePortal,
      canEnterRoutePortal: canEnterPortal(portal),
      pendingTargetPortal,
      routePortal: portal
    })
  ) {
    return null;
  }

  if (!isUnifiedSettingsPortal(activePortal)) {
    return null;
  }

  const currentBasePath = getSettingsBasePath(portal);
  const nextBasePath = redirectToEntryOnPortalChange ? getPortalEntry(activePortal) : getSettingsBasePath(activePortal);
  const rawSuffix = preserveSuffix && location.pathname.startsWith(currentBasePath) ? location.pathname.slice(currentBasePath.length) : "";
  const suffix = supportedSettingsSuffixes[activePortal].has(rawSuffix) ? rawSuffix : "";

  return `${nextBasePath}${suffix}${location.search}${location.hash}`;
}

function PortalScopedSettingsPage({
  portal,
  preserveSuffix = true,
  redirectToEntryOnPortalChange = false,
  children
}: {
  portal: UnifiedSettingsPortal;
  preserveSuffix?: boolean;
  redirectToEntryOnPortalChange?: boolean;
  children: ReactNode;
}) {
  const redirectTarget = useSettingsPortalRedirectWithOptions(portal, { preserveSuffix, redirectToEntryOnPortalChange });

  if (redirectTarget) {
    return <Navigate replace state={{ settingsSwitchedFromPortal: true }} to={redirectTarget} />;
  }

  return <>{children}</>;
}

function getProfileEntryTitle(portal: UnifiedSettingsPortal) {
  if (portal === "business") {
    return "Afirieito 资料维护";
  }

  return portal === "merchant" ? "店铺信息维护" : "资料编辑";
}

function getVerificationTitle(portal: UnifiedSettingsPortal) {
  if (portal === "business") {
    return "Afirieito 认证";
  }

  return portal === "merchant" ? "店铺资质" : "本人验证";
}

function getVerificationStatusLabel(portal: UnifiedSettingsPortal) {
  if (portal === "business") {
    return "已认证";
  }

  return portal === "merchant" ? "已认证" : "已完成";
}

function getThemeCaption(themeId: ClientThemeDefinition["id"]) {
  switch (themeId) {
    case "black-gold":
      return "夜间 / 黑金";
    case "cool-black-gray":
      return "夜间 / 冷酷黑灰";
    case "vital-mono":
      return "白天 / 活力黑白";
    case "dark-green":
      return "夜间 / 黑绿";
    case "neon-pink":
      return "夜间 / 粉紫";
    case "light-green":
      return "白天 / 白绿";
  }
}

function getThemePreviewClasses(themeId: ClientThemeDefinition["id"]) {
  switch (themeId) {
    case "black-gold":
      return [
        "bg-[linear-gradient(135deg,#050505_0%,#161616_54%,#34312f_100%)]",
        "bg-[#fedfa0]",
        "bg-[#34312f]"
      ];
    case "cool-black-gray":
      return [
        "bg-[linear-gradient(135deg,#0a0d10_0%,#1d2329_54%,#404951_100%)]",
        "bg-[#18d2f0]",
        "bg-[#313841]"
      ];
    case "vital-mono":
      return [
        "bg-[linear-gradient(135deg,#ffffff_0%,#f0f1f2_52%,#2f2f30_100%)]",
        "bg-[#2f2f30]",
        "bg-[#14b8ff]"
      ];
    case "dark-green":
      return [
        "bg-[linear-gradient(135deg,#02070c_0%,#071827_48%,#243747_100%)]",
        "bg-[#baff43]",
        "bg-[#72ff8b]"
      ];
    case "neon-pink":
      return [
        "bg-[linear-gradient(135deg,#080a1a_0%,#1b2050_54%,#120b25_100%)]",
        "bg-[#ff6fae]",
        "bg-[#8a75ff]"
      ];
    case "light-green":
      return [
        "bg-[linear-gradient(135deg,#f7fbff_0%,#eef8f4_58%,#d7ece6_100%)]",
        "bg-[#2e7e67]",
        "bg-[#dbefea]"
      ];
  }
}

function summarizeUserProfileStatus(customer: Customer, technician?: Technician) {
  let completedCount = 0;

  if ((customer.nickname?.trim() || customer.name.trim()).length > 0) {
    completedCount += 1;
  }

  if (customer.avatar.trim()) {
    completedCount += 1;
  }

  if ((customer.bio ?? technician?.bio)?.trim()) {
    completedCount += 1;
  }

  if ((customer.languages?.length ?? technician?.languages?.length ?? 0) > 0) {
    completedCount += 1;
  }

  if ((customer.age ?? technician?.age)?.trim()) {
    completedCount += 1;
  }

  if (completedCount >= 4) {
    return "已完善";
  }

  if (completedCount >= 2) {
    return "待完善";
  }

  return "未完善";
}

function summarizeTechnicianProfileStatus(technician: Technician) {
  let completedCount = 0;

  if ((technician.nickname?.trim() || technician.name.trim()).length > 0) {
    completedCount += 1;
  }

  if (technician.avatar.trim()) {
    completedCount += 1;
  }

  if (technician.bio?.trim()) {
    completedCount += 1;
  }

  if (technician.languages.length > 0) {
    completedCount += 1;
  }

  if ((technician.age ?? "").trim()) {
    completedCount += 1;
  }

  if (technician.serviceAreas.length > 0) {
    completedCount += 1;
  }

  if (completedCount >= 5) {
    return "已完善";
  }

  if (completedCount >= 3) {
    return "待完善";
  }

  return "未完善";
}

function summarizeStoreProfileStatus(store: Store) {
  let completedCount = 0;

  if (store.name.trim()) {
    completedCount += 1;
  }

  if (store.cover.trim()) {
    completedCount += 1;
  }

  if (store.description.trim()) {
    completedCount += 1;
  }

  if (store.address.trim()) {
    completedCount += 1;
  }

  if (store.businessHours.trim()) {
    completedCount += 1;
  }

  if (store.tags.length > 0) {
    completedCount += 1;
  }

  if (completedCount >= 5) {
    return "已完善";
  }

  if (completedCount >= 3) {
    return "待完善";
  }

  return "未完善";
}

function summarizeProfileStatus(
  portal: UnifiedSettingsPortal,
  {
    customer,
    technician,
    store
  }: {
    customer: Customer;
    technician: Technician;
    store: Store;
  }
) {
  if (portal === "business") {
    return "已完善";
  }

  if (portal === "merchant") {
    return summarizeStoreProfileStatus(store);
  }

  if (portal === "technician") {
    return summarizeTechnicianProfileStatus(technician);
  }

  return summarizeUserProfileStatus(customer, technician);
}

function summarizeServiceRange(areas: string[]) {
  if (areas.length === 0) {
    return "未设置";
  }

  if (areas.length <= 2) {
    return areas.join(" / ");
  }

  return `${areas.slice(0, 2).join(" / ")} +${areas.length - 2}`;
}

function summarizeAccountStatus(portal: UnifiedSettingsPortal, customer: Customer, store: Store) {
  if (portal === "business") {
    return "Afirieito 账号";
  }

  if (portal === "merchant") {
    return store.accountUsername ? "主体已绑定" : "待完善";
  }

  return customer.phone ? "已绑定手机" : "需要完善";
}

function getAccountUsername({
  portal,
  customer,
  technician,
  store,
  fallback
}: {
  portal: UnifiedSettingsPortal;
  customer: Customer;
  technician: Technician;
  store: Store;
  fallback?: string;
}) {
  if (portal === "business") {
    return fallback ?? "aya-tokyo-fit";
  }

  if (portal === "merchant") {
    return store.accountUsername ?? fallback ?? "demo";
  }

  if (portal === "technician") {
    return technician.accountUsername ?? fallback ?? "demo";
  }

  return customer.accountUsername ?? fallback ?? "demo";
}

function GoogleCalendarAccountBinding({
  autoFocus,
  customer,
  portal,
  store,
  technician
}: {
  autoFocus: boolean;
  customer?: Customer;
  portal: UnifiedSettingsPortal;
  store?: Store;
  technician?: Technician;
}) {
  const { language } = useI18n();
  const copy = googleAccountBindingCopy[language] ?? googleAccountBindingCopy.zh;
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const googleScope = getGoogleAccountScopeForPortal(portal);
  const googleActorId = getGoogleAccountActorId(googleScope, customer, technician, store);
  const [googleStatus, setGoogleStatus] = useState<GoogleAccountConnectionStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState<"status" | "connect" | null>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
  }, [autoFocus]);

  useEffect(() => {
    let cancelled = false;
    setGoogleBusy("status");
    fetchGoogleAccountApi<GoogleAccountConnectionStatus>(`/api/google-account/status?actorId=${encodeURIComponent(googleActorId)}`)
      .then((status) => {
        if (cancelled) {
          return;
        }

        setGoogleStatus(status);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) {
          setGoogleBusy(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [googleActorId, googleScope]);

  const handleGoogleConnect = async () => {
    if (googleBusy) {
      return;
    }

    setGoogleBusy("connect");
    try {
      const response = await fetchGoogleAccountApi<GoogleAccountAuthUrlResponse>(
        `/api/google-account/auth-url?mode=bind&actorId=${encodeURIComponent(googleActorId)}&returnTo=${encodeURIComponent(
          typeof window === "undefined" ? "" : window.location.href
        )}`
      );
      setGoogleStatus(response);
      if (response.authUrl && typeof window !== "undefined") {
        window.location.assign(response.authUrl);
      }
    } catch {
      setGoogleStatus(null);
    } finally {
      setGoogleBusy(null);
    }
  };
  const statusLabel = googleBusy === "status" ? copy.checking : googleStatus?.connected ? copy.connected : copy.disconnected;

  return (
    <div ref={sectionRef}>
      <SettingsSection
        description={copy.sectionInfo}
        panelClassName="space-y-3 p-4"
        title={copy.sectionTitle}
      >
        <div className="flex items-center gap-3 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] p-3">
          <img alt="" className="h-10 w-10 shrink-0 object-contain" src={googleAccountIconSrc} />
          <div className="min-w-0 flex-1">
            <strong className="block text-[15px] font-black text-[color:var(--client-text)]">{copy.accountTitle}</strong>
            <span className="mt-0.5 block text-[12px] font-bold leading-5 text-[color:var(--client-muted)]">
              {googleStatus?.connected ? googleStatus.profile?.email ?? copy.connectedFallback : copy.disconnectedSubtitle}
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]">
            {statusLabel}
          </span>
        </div>
        <button
          className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_18px_40px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] disabled:opacity-55"
          disabled={Boolean(googleBusy)}
          onClick={handleGoogleConnect}
          type="button"
        >
          <img alt="" className="h-6 w-6 object-contain" src={googleAccountIconSrc} />
          {googleBusy === "connect" ? copy.connecting : googleStatus?.connected ? copy.reconnect : copy.connect}
        </button>
      </SettingsSection>
    </div>
  );
}

function SelectionIndicator({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "relative z-10 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
        active
          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-transparent text-transparent"
      )}
    >
      <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 12 12">
        <path d="m2.5 6 2.2 2.2L9.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    </span>
  );
}

function SettingsToggleRow({
  title,
  badge,
  description,
  checked,
  onChange,
  trailing
}: {
  title: string;
  badge?: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3.5">
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2 text-[15px] font-black text-[color:var(--client-text)]">
          <span className="truncate">{title}</span>
          {badge ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-[8px] border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2 text-[10px] font-black leading-none text-[color:var(--client-primary)]">
              {badge}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-muted)]">{description}</p>
      </div>
      {trailing ?? <ToggleSwitch ariaLabel={title} checked={checked} onChange={onChange} />}
    </div>
  );
}

function SettingsPetAssetProgress({
  readiness,
  label
}: {
  readiness: NeedoPetAssetReadiness;
  label: string;
}) {
  const progress = getNeedoPetAssetProgress(readiness);

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={progress}
      className="w-20 shrink-0"
      role="progressbar"
    >
      <div className="h-2 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]">
        <span
          className="block h-full rounded-full bg-[color:var(--client-primary)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-right text-[10px] font-black leading-none text-[color:var(--client-muted)]">
        {progress}%
      </div>
    </div>
  );
}

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

type PwaInstallDialogStatus = "guide" | "prompting" | PwaInstallPromptOutcome;

const pwaDisplayModeQueries = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)"
];

function usePwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<PwaInstallPlatform>(() => detectPwaInstallPlatform());
  const [showInstallEntry, setShowInstallEntry] = useState(() => shouldShowPwaInstallSetting());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncInstallEntry = () => {
      setPlatform(detectPwaInstallPlatform(window.navigator));
      setShowInstallEntry(shouldShowPwaInstallSetting(window));
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      syncInstallEntry();
    };
    const handleAppInstalled = () => {
      setPromptEvent(null);
      syncInstallEntry();
    };
    const mediaQueries = pwaDisplayModeQueries
      .map((query) => {
        try {
          return window.matchMedia(query) as LegacyMediaQueryList;
        } catch {
          return null;
        }
      })
      .filter((item): item is LegacyMediaQueryList => Boolean(item));

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("pageshow", syncInstallEntry);
    window.addEventListener("visibilitychange", syncInstallEntry);
    mediaQueries.forEach((query) => {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", syncInstallEntry);
      } else {
        query.addListener?.(syncInstallEntry);
      }
    });
    syncInstallEntry();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("pageshow", syncInstallEntry);
      window.removeEventListener("visibilitychange", syncInstallEntry);
      mediaQueries.forEach((query) => {
        if (typeof query.removeEventListener === "function") {
          query.removeEventListener("change", syncInstallEntry);
        } else {
          query.removeListener?.(syncInstallEntry);
        }
      });
    };
  }, []);

  const promptInstall = async (): Promise<PwaInstallPromptOutcome> => {
    if (!promptEvent) {
      return "unavailable";
    }

    try {
      const promptChoice = await promptEvent.prompt();
      const userChoice = promptChoice ?? (await promptEvent.userChoice.catch(() => undefined));

      setPromptEvent(null);

      return normalizePwaInstallPromptOutcome(userChoice);
    } catch {
      setPromptEvent(null);

      return "unavailable";
    }
  };

  return {
    hasNativePrompt: Boolean(promptEvent),
    platform,
    promptInstall,
    showInstallEntry
  };
}

function getPwaInstallSettingValue(platform: PwaInstallPlatform, hasNativePrompt: boolean) {
  if (hasNativePrompt) {
    return "可安装";
  }

  if (platform === "ios") {
    return "添加到主屏幕";
  }

  if (platform === "android") {
    return "浏览器安装";
  }

  return "查看指引";
}

function getPwaInstallSettingSubtitle(platform: PwaInstallPlatform, hasNativePrompt: boolean) {
  if (hasNativePrompt) {
    return "打开手机系统安装提示";
  }

  if (platform === "ios") {
    return "iPhone 通过 Safari 分享菜单添加";
  }

  if (platform === "android") {
    return "Android 会优先调用浏览器安装入口";
  }

  return "从浏览器菜单安装 NeeDo";
}

function getPwaInstallDialogMessage(status: PwaInstallDialogStatus, platform: PwaInstallPlatform) {
  if (status === "accepted") {
    return "安装已完成，之后可以从主屏幕打开。";
  }

  if (status === "dismissed") {
    return "你取消了安装，可以稍后再试。";
  }

  if (status === "unavailable") {
    return "系统安装提示暂时不可用，请使用浏览器菜单添加到主屏幕。";
  }

  if (status === "prompting") {
    return "正在打开系统安装提示。";
  }

  if (platform === "ios") {
    return "iPhone 不开放网页自动弹出安装确认，请按下面步骤添加。";
  }

  return "如果系统没有弹出安装确认，请从浏览器菜单选择安装或添加到主屏幕。";
}

function getPwaInstallSteps(platform: PwaInstallPlatform) {
  if (platform === "ios") {
    return ["确认正在 Safari 中打开", "点击底部分享按钮", "选择添加到主屏幕", "点击添加后从主屏幕打开"];
  }

  if (platform === "android") {
    return ["保持当前页面在浏览器中打开", "点击安装提示或浏览器菜单", "选择安装应用", "安装后从主屏幕打开"];
  }

  return ["保持当前页面在支持 PWA 的浏览器中打开", "点击地址栏或浏览器菜单中的安装", "确认安装", "安装后从系统应用列表打开"];
}

function PwaInstallGuideDialog({
  open,
  platform,
  status,
  hasNativePrompt,
  onClose,
  onInstall,
  t
}: {
  open: boolean;
  platform: PwaInstallPlatform;
  status: PwaInstallDialogStatus;
  hasNativePrompt: boolean;
  onClose: () => void;
  onInstall: () => void;
  t: (source: string) => string;
}) {
  if (!open) {
    return null;
  }

  const canOpenNativePrompt = hasNativePrompt && status !== "accepted" && status !== "prompting";
  const steps = getPwaInstallSteps(platform);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/58 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur-md sm:items-center sm:pb-6"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-modal="true"
        className="w-full max-w-[440px] rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,black)] p-4 text-[color:var(--client-text)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[18px] font-black tracking-[-0.02em]">{t("安装APP")}</p>
            <p className="mt-1 text-[13px] leading-6 text-[color:var(--client-muted)]">{t(getPwaInstallDialogMessage(status, platform))}</p>
          </div>
          <button
            aria-label={t("关闭窗口")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-[color:var(--client-muted)]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {steps.map((step, index) => (
            <div
              className="flex gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-3.5 py-3"
              key={step}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--client-primary)] text-xs font-black text-[#090806]">
                {index + 1}
              </span>
              <p className="min-w-0 pt-1 text-[13px] font-black leading-5">{t(step)}</p>
            </div>
          ))}
        </div>

        {platform === "ios" ? (
          <p className="mt-3 rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] px-3.5 py-3 text-[12px] font-semibold leading-5 text-[color:var(--client-muted)]">
            {t("请在 Safari 打开后添加；微信、LINE 等内置浏览器可能没有这个菜单。")}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <SecondaryButton className="h-11 justify-center" onClick={onClose}>
            {t("关闭窗口")}
          </SecondaryButton>
          <PrimaryButton className="h-11 justify-center" onClick={canOpenNativePrompt ? onInstall : onClose}>
            {t(canOpenNativePrompt ? "打开安装提示" : "我知道了")}
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}

const defaultInfoCardVisibility: InfoCardVisibilitySettings = {
  mode: "public",
  tagIds: [],
  profileKeys: [],
  includeRelatedPeople: true
};

const infoCardVisibilityModes: Array<{ value: InfoCardVisibilityMode; title: string; description: string }> = [
  { value: "public", title: "公开", description: "所有可进入资料页的人都能看到这张信息卡。" },
  { value: "private", title: "隐私", description: "仅本人、平台审核和必要安全场景可见。" },
  { value: "tag_only", title: "仅对某标签人群可见", description: "只有命中所选标签的人群可以看到。" },
  { value: "person_only", title: "仅对某人可见", description: "只允许指定用户、技师或店铺账号查看。" }
];

function normalizeInfoCardVisibilityDraft(value?: InfoCardVisibilitySettings): InfoCardVisibilitySettings {
  return {
    mode: value?.mode ?? defaultInfoCardVisibility.mode,
    tagIds: Array.from(new Set(value?.tagIds ?? [])),
    profileKeys: Array.from(new Set(value?.profileKeys ?? [])),
    includeRelatedPeople: value?.includeRelatedPeople ?? defaultInfoCardVisibility.includeRelatedPeople
  };
}

function getInfoCardVisibilityLabel(value: InfoCardVisibilitySettings) {
  const modeLabel = infoCardVisibilityModes.find((item) => item.value === value.mode)?.title ?? "公开";
  const details =
    value.mode === "tag_only"
      ? value.tagIds.length > 0
        ? `${value.tagIds.length} 个标签`
        : "未选标签"
      : value.mode === "person_only"
        ? value.profileKeys.length > 0
          ? `${value.profileKeys.length} 人`
          : "未指定对象"
        : "";
  const relatedLabel = value.includeRelatedPeople ? "关联人可见" : "关联人不可见";

  return [modeLabel, details, relatedLabel].filter(Boolean).join(" · ");
}

function toggleDraftValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function buildInfoCardProfileKey(kind: "user" | "technician" | "shop", id: string) {
  return `${kind}:${id}`;
}

function InfoCardVisibilityEditor({
  availableTags,
  value,
  onChange
}: {
  availableTags: string[];
  value: InfoCardVisibilitySettings;
  onChange: (value: InfoCardVisibilitySettings) => void;
}) {
  const { customers, technicians, stores } = useEntityStore();
  const tagOptions = Array.from(new Set(availableTags.filter(Boolean))).slice(0, 20);
  const profileOptions = [
    ...customers.map((customer) => ({
      key: buildInfoCardProfileKey("user", customer.id),
      label: customer.nickname?.trim() || customer.name,
      caption: "用户"
    })),
    ...technicians.map((technician) => ({
      key: buildInfoCardProfileKey("technician", technician.id),
      label: technician.nickname?.trim() || technician.name,
      caption: "技师"
    })),
    ...stores.map((store) => ({
      key: buildInfoCardProfileKey("shop", store.id),
      label: store.name,
      caption: "店铺"
    }))
  ].slice(0, 24);
  const update = (patch: Partial<InfoCardVisibilitySettings>) => onChange({ ...value, ...patch });
  const optionClassName = (active: boolean) =>
    cn(
      "rounded-[22px] border px-4 py-3 text-left transition",
      active
        ? "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
        : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
    );
  const chipClassName = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-2 text-xs font-black transition",
      active
        ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
        : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-text)]"
    );

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_62%,transparent)] px-4 py-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">当前可见范围</p>
        <p className="mt-1 text-sm font-black text-[color:var(--client-text)]">{getInfoCardVisibilityLabel(value)}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {infoCardVisibilityModes.map((item) => {
          const active = value.mode === item.value;

          return (
            <button className={optionClassName(active)} key={item.value} onClick={() => update({ mode: item.value })} type="button">
              <div className="flex gap-3">
                <SelectionIndicator active={active} />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-[color:var(--client-text)]">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-[color:var(--client-muted)]">{item.description}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {value.mode === "tag_only" ? (
        <div>
          <p className="mb-2 text-xs font-black text-[color:var(--client-muted)]">可见标签</p>
          <div className="flex flex-wrap gap-2">
            {tagOptions.length > 0 ? (
              tagOptions.map((tag) => (
                <button
                  className={chipClassName(value.tagIds.includes(tag))}
                  key={tag}
                  onClick={() => update({ tagIds: toggleDraftValue(value.tagIds, tag) })}
                  type="button"
                >
                  {tag}
                </button>
              ))
            ) : (
              <p className="text-sm text-[color:var(--client-muted)]">当前信息卡还没有可用标签。</p>
            )}
          </div>
        </div>
      ) : null}

      {value.mode === "person_only" ? (
        <div>
          <p className="mb-2 text-xs font-black text-[color:var(--client-muted)]">指定可见对象</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {profileOptions.map((profile) => {
              const active = value.profileKeys.includes(profile.key);

              return (
                <button className={optionClassName(active)} key={profile.key} onClick={() => update({ profileKeys: toggleDraftValue(value.profileKeys, profile.key) })} type="button">
                  <div className="flex items-center gap-3">
                    <SelectionIndicator active={active} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[color:var(--client-text)]">{profile.label}</span>
                      <span className="mt-0.5 block text-xs text-[color:var(--client-muted)]">{profile.caption}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <SettingsToggleRow
        checked={value.includeRelatedPeople}
        description="开启后，订单关联、关注关系、所属店铺/员工等业务关联人也可以按当前范围查看。"
        onChange={(checked) => update({ includeRelatedPeople: checked })}
        title="关联人可见"
      />
    </div>
  );
}

function ThemeOptionRow({
  item,
  active,
  onClick
}: {
  item: ClientThemeDefinition;
  active: boolean;
  onClick: () => void;
}) {
  const previewClasses = getThemePreviewClasses(item.id);

  return (
    <button
      className={cn(
        "relative flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left transition before:absolute before:inset-x-1 before:inset-y-1.5 before:rounded-[18px] before:transition focus:outline-none",
        active
          ? "before:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]"
          : "hover:before:bg-[color:color-mix(in_srgb,var(--client-primary)_6%,transparent)]"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="relative z-10 min-w-0 flex-1">
        <p className="truncate text-[15px] font-black text-[color:var(--client-text)]">{item.label}</p>
        <p className="mt-0.5 truncate text-[12px] text-[color:var(--client-muted)]">{getThemeCaption(item.id)}</p>
      </div>
      <div className="relative z-10 grid w-[72px] shrink-0 grid-cols-3 gap-1.5">
        {previewClasses.map((className, index) => (
          <span className={cn("block h-4 rounded-full", className)} key={`${item.id}-${index}`} />
        ))}
      </div>
      <SelectionIndicator active={active} />
    </button>
  );
}

export function UnifiedSettingsPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { language } = useI18n();
  const { theme } = useClientTheme();
  const petSettings = useNeedoPetSettings();
  const petAssetReadiness = useNeedoPetAssetReadiness();
  const [portalSettings] = usePortalSettingsState(portal);
  const profileCardBackgroundSettings = useProfileCardBackgroundSettings();
  const { customers, technicians, stores } = useEntityStore();
  const { config: homeLocationConfig } = useHomeLayoutStore();
  const { session } = useAuth();
  const customer = customers.find((item) => item.id === session?.linkedCustomerId) ?? customers[0];
  const technician = technicians.find((item) => item.id === session?.linkedTechnicianId) ?? technicians[0];
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const selectedHomeLocation = homeLocationConfig.locations.find((item) => item.id === homeLocationConfig.selectedLocationId) ?? homeLocationConfig.locations[0];
  const t = (source: string) => translateText(source, language);
  const currentThemeLabel = t(clientThemes.find((item) => item.id === theme)?.label ?? "活力黑白版");
  const currentLanguageLabel = languages.find((item) => item.code === language)?.label ?? "简中";
  const switchedFromPortal = Boolean((location.state as SettingsNavigationState | null)?.settingsSwitchedFromPortal);
  const isBusinessPortal = portal === "business";
  const pwaInstall = usePwaInstallPrompt();
  const [pwaInstallDialogOpen, setPwaInstallDialogOpen] = useState(false);
  const [pwaInstallDialogStatus, setPwaInstallDialogStatus] = useState<PwaInstallDialogStatus>("guide");
  useEffect(() => {
    if (petAssetReadiness.ready || petAssetReadiness.status === "loading") {
      return;
    }

    const timer = window.setTimeout(() => {
      void preloadNeedoPetAssets({ force: petAssetReadiness.status === "error" });
    }, petAssetReadiness.status === "error" ? 8_000 : 0);

    return () => window.clearTimeout(timer);
  }, [petAssetReadiness.ready, petAssetReadiness.status]);
  const handlePwaInstallRequest = async () => {
    if (pwaInstall.hasNativePrompt) {
      setPwaInstallDialogStatus("prompting");

      const outcome = await pwaInstall.promptInstall();

      setPwaInstallDialogStatus(outcome);
      setPwaInstallDialogOpen(true);

      return;
    }

    setPwaInstallDialogStatus("guide");
    setPwaInstallDialogOpen(true);
  };

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsHomePage
        info={t(isBusinessPortal ? "NeeDoAfirieito 使用独立 Afirieito App 设置中心，基础设置与用户端保持同一套交互。" : "统一设置模块现在使用同一套首页、列表项和子页承载三端配置，仅通过身份决定显示哪些内容。")}
        navItems={getSettingsNavItems(portal)}
        onBack={
          switchedFromPortal
            ? () => {
                navigate(getPortalMePath(portal), { replace: true });
              }
            : undefined
        }
        subtitle={t(compactPortalLabels[portal].label)}
        title={t("设置")}
      >
        <SettingsSection
          description={t(isBusinessPortal ? "主题、语言和账号切换复用用户端设置模块，Afirieito 前端保存自己的显示偏好。" : "主题、语言和身份切换统一复用用户端设置模块，三端不再各自维护一套入口。")}
          panelClassName={settingsListDividerClassName}
          title={t("外观与系统")}
        >
          <SettingsListItem title={t("UI 切换")} to={getSettingsPath(portal, "theme")} value={currentThemeLabel} />
          <SettingsListItem dataNoI18n title={t("语言")} to={getSettingsPath(portal, "language")} value={currentLanguageLabel} />
          <SettingsListItem title={t("身份切换")} to={getSettingsPath(portal, "portal")} value={t(compactPortalLabels[portal].label)} />
          {pwaInstall.showInstallEntry ? (
            <SettingsListItem
              onClick={() => {
                void handlePwaInstallRequest();
              }}
              subtitle={t(getPwaInstallSettingSubtitle(pwaInstall.platform, pwaInstall.hasNativePrompt))}
              title={t("安装APP")}
              value={t(getPwaInstallSettingValue(pwaInstall.platform, pwaInstall.hasNativePrompt))}
            />
          ) : null}
        </SettingsSection>

        {isBusinessPortal ? null : (
          <SettingsSection
            description={t("统一复用同一组目录骨架，技师和店铺独有项也沿用用户端页面结构。")}
            panelClassName={settingsListDividerClassName}
            title={t("个人资料与认证")}
          >
            <SettingsListItem
              title={t(getProfileEntryTitle(portal))}
              to={getSettingsPath(portal, "profile")}
              value={t(summarizeProfileStatus(portal, { customer, technician, store }))}
            />
            {portal !== "merchant" && profileCardBackgroundSettings.editEntryEnabled ? (
              <SettingsListItem
                subtitle={t("入口由运营后台开关控制，简易信息卡本体不显示编辑按钮")}
                title={t("简易信息卡背景")}
                to={getSettingsPath(portal, "profile-card-background")}
                value={t("系统分配")}
              />
            ) : null}
            <SettingsListItem title={t(getVerificationTitle(portal))} to={getSettingsPath(portal, "verification")} value={t(getVerificationStatusLabel(portal))} />
            <SettingsListItem
              title={t("服务范围")}
              to={getSettingsPath(portal, "service-range")}
              value={t(portal === "technician" ? summarizeServiceRange(technician.serviceAreas) : portal === "merchant" ? store.area : getHomeLocationAreaLabel(selectedHomeLocation))}
            />
          </SettingsSection>
        )}

        <SettingsSection
          description={t(isBusinessPortal ? "Afirieito 登录账号、推广码、收款身份和数据权限集中到这里。" : "账户、安全、绑定关系和权限入口统一收口到同一详细页。")}
          panelClassName={settingsListDividerClassName}
          title={t("账户与安全")}
        >
          <SettingsListItem title={t("账户与安全")} to={getSettingsPath(portal, "account")} value={t(summarizeAccountStatus(portal, customer, store))} />
        </SettingsSection>

        <SettingsSection
          description={t(isBusinessPortal ? "活动、素材、结算、风控通知按 Afirieito 使用场景追加。" : "通知与隐私同样复用统一页骨架，技师和商户的独有开关通过配置追加。")}
          panelClassName={settingsListDividerClassName}
          title={t("通知与隐私")}
        >
          <SettingsListItem title={t("通知设置")} to={getSettingsPath(portal, "notifications")} value={t(summarizePortalSettingsState(portalSettings))} />
          <SettingsToggleRow
            badge="TEST"
            checked={petSettings.enabled}
            description={t(petAssetReadiness.ready ? "开启后由屏幕宠物承接提醒气泡，首页右下角预约悬浮按钮会自动隐藏。" : "正在下载小白资源，完成后才能开启。")}
            onChange={setNeedoPetEnabled}
            title={t("电子宠物")}
            trailing={
              petAssetReadiness.ready ? (
                undefined
              ) : (
                <SettingsPetAssetProgress label={t("小白资源下载进度")} readiness={petAssetReadiness} />
              )
            }
          />
        </SettingsSection>

        <SettingsSection
          description={t(isBusinessPortal ? "利用规约、个人信息保护方针、退会和退出账号作为 NeeDoAfirieito App 的固定基础入口。" : "帮助、关于和演示登录态重置保持统一入口，不再散落在各端我的页。")}
          panelClassName={settingsListDividerClassName}
          title={t("其他")}
        >
          <SettingsListItem title={t("利用规约")} to={getSettingsPath(portal, "terms")} value={t("查看")} />
          <SettingsListItem title={t("个人信息保护方针")} to={getSettingsPath(portal, "privacy")} value={t("查看")} />
          <SettingsListItem title={t("帮助与反馈")} to={getSettingsPath(portal, "help")} value={t(portal === "user" ? "在线支持" : "平台支持")} />
          <SettingsListItem dataNoI18n title={t(isBusinessPortal ? "关于 NeeDoAfirieito" : "关于 NeeDo")} to={getSettingsPath(portal, "about")} value={appVersion} />
          <SettingsListItem title={t("注销账号")} to={getSettingsPath(portal, "delete-account")} />
          <SettingsListItem
            subtitle={t("演示环境会重置到默认测试账号并保留当前身份")}
            title={t(isBusinessPortal ? "退出账号" : "退出登录")}
            onClick={() => {
              logout();
              navigate(getPortalEntry(portal), { replace: true });
            }}
            value={t("重置")}
          />
        </SettingsSection>
        <PwaInstallGuideDialog
          hasNativePrompt={pwaInstall.hasNativePrompt}
          onClose={() => setPwaInstallDialogOpen(false)}
          onInstall={() => {
            void handlePwaInstallRequest();
          }}
          open={pwaInstallDialogOpen}
          platform={pwaInstall.platform}
          status={pwaInstallDialogStatus}
          t={t}
        />
      </SettingsHomePage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsProfileCardBackgroundPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { language } = useI18n();
  const profileCardBackgroundSettings = useProfileCardBackgroundSettings();
  const t = (source: string) => translateText(source, language);

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        info={t("入口只放在自己的设定或店铺后台中，运营后台负责开启或关闭；简易信息卡上不显示编辑按钮。")}
        navItems={getSettingsNavItems(portal)}
        title={t("简易信息卡背景")}
      >
        <SettingsSection
          description={t("背景图暂时由系统分配，后续背景选择和上传流程会收口到这里。")}
          panelClassName={settingsListDividerClassName}
          title={t("背景设置")}
        >
          <SettingsListItem subtitle={t("根据当前 UI 主题自动匹配黑、白、紫等系统背景")} title={t("当前背景")} value={t("系统分配")} />
          <SettingsListItem
            subtitle={t("这个状态由运营后台统一控制")}
            title={t("编辑入口")}
            value={t(profileCardBackgroundSettings.editEntryEnabled ? "已开放" : "运营未开放")}
          />
        </SettingsSection>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsThemePage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { language } = useI18n();
  const { theme, setTheme } = useClientTheme();
  const t = (source: string) => translateText(source, language);

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage backTo={getSettingsBasePath(portal)} info={t("主题选择移到独立页面，三端共用同一套主题设置页。")} navItems={getSettingsNavItems(portal)} title={t("UI 切换")}>
        <SettingsSection
          description={t("三端统一切换活力黑白 / 冷酷黑灰 / 白绿 / 黑绿 / 霓虹粉紫 / 黑金主题，由同一套 token 与组件承载。")}
          panelClassName={settingsListDividerClassName}
          title={t("主题选择")}
        >
          {clientThemes.map((item) => (
            <ThemeOptionRow active={item.id === theme} item={item} key={item.id} onClick={() => setTheme(item.id)} />
          ))}
        </SettingsSection>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsLanguagePage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { language, setLanguage } = useI18n();
  const t = (source: string) => translateText(source, language);

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsRadioListPage<Language>
        backTo={getSettingsBasePath(portal)}
        info={t("语言切换改为三端共用的紧凑单选列表。")}
        navItems={getSettingsNavItems(portal)}
        options={languages.map((item) => ({
          value: item.code as Language,
          title: item.label,
          subtitle: item.code === "zh" ? "简体中文" : item.code === "zh-Hant" ? "繁體中文" : item.code === "ja" ? "Japanese" : item.code === "ko" ? "Korean" : "English",
          dataNoI18n: true
        }))}
        sectionDescription={t("语言偏好继续保存在本地，但入口和交互已经统一。")}
        title={t("语言")}
        value={language}
        onChange={(next) => setLanguage(next)}
      />
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsPortalPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { session, switchPortal } = useAuth();
  const selectedPortal = resolveSettingsSelectedPortal(portal, session?.portal) as SwitchableSettingsPortal;
  const t = (source: string) => translateText(source, language);
  const selectPortal = (nextPortal: SwitchableSettingsPortal) => {
    if (nextPortal === selectedPortal) {
      return;
    }

    switchPortal(nextPortal);
    navigate(getPortalEntry(nextPortal), {
      replace: true,
      state: {
        settingsSwitchedFromPortal: true,
        settingsPortalTarget: nextPortal
      } satisfies SettingsNavigationState
    });
  };
  const openBackendPortal = (href: string) => {
    window.location.assign(href);
  };

  return (
    <PortalScopedSettingsPage portal={portal} preserveSuffix={false} redirectToEntryOnPortalChange>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        info={t("身份切换直接复用同一套设置子页，切换后直接进入对应身份首页。")}
        navItems={getSettingsNavItems(portal)}
        title={t("身份切换")}
      >
        <SettingsSection
          description={t("用户、技师、店铺和联盟营销属于前台身份，切换后会直接进入对应首页。")}
          panelClassName="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]"
          title={t("前台身份")}
        >
          {settingsPortalOptions.map((item) => {
            const active = item === selectedPortal;

            return (
              <SettingsPortalActionRow
                active={active}
                actionLabel={`${t("切换身份")}：${t(compactPortalLabels[item].label)}`}
                info={t(compactPortalLabels[item].caption)}
                infoLabel={t("查看身份说明")}
                key={item}
                onClick={() => selectPortal(item)}
                title={t(compactPortalLabels[item].label)}
                trailing={<SettingsPortalSelectionIndicator active={active} />}
              />
            );
          })}
        </SettingsSection>

        <SettingsSection
          description={t("后台入口独立进入，不会改变当前前台身份。")}
          panelClassName="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]"
          title={t("后台入口")}
        >
          {backendSettingsPortalEntries.map((entry) => (
            <SettingsPortalActionRow
              actionLabel={`${t("进入后台")}：${t(entry.title)}`}
              info={t(entry.subtitle)}
              infoLabel={t("查看后台入口说明")}
              key={entry.id}
              onClick={() => openBackendPortal(entry.href)}
              title={t(entry.title)}
              trailing={<SettingsArrow />}
            />
          ))}
        </SettingsSection>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

function UserProfileSettingsPage({
  portal,
  customer,
  technician
}: {
  portal: UnifiedSettingsPortal;
  customer: Customer;
  technician?: Technician;
}) {
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const initialDraft = useMemo(
    () => ({
      avatar: customer.avatar,
      nickname: customer.nickname?.trim() || customer.name,
      age: customer.age ?? technician?.age ?? "",
      height: customer.height ?? technician?.height ?? "",
      languages: customer.languages?.length ? [...customer.languages] : technician?.languages?.length ? [...technician.languages] : ["日本語"],
      bio:
        customer.bio ??
        technician?.bio ??
        "可在这里补充你的语言偏好、常用预约习惯和其他说明。"
    }),
    [customer, technician]
  );
  const [draft, setDraft] = useState(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const toggleLanguage = (language: string) => {
    setDraft((current) => {
      if (current.languages.includes(language)) {
        return current.languages.length === 1 ? current : { ...current, languages: current.languages.filter((item) => item !== language) };
      }

      return { ...current, languages: [...current.languages, language] };
    });
  };

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }

      setDraft((current) => ({ ...current, avatar: reader.result as string }));
    };

    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const nextProfile = {
      avatar: draft.avatar.trim() || customer.avatar,
      nickname: draft.nickname.trim() || customer.name,
      age: draft.age.trim(),
      height: draft.height.trim(),
      languages: draft.languages.length ? [...draft.languages] : [...initialDraft.languages],
      bio: draft.bio.trim()
    };

    updateCustomerEntity(customer.id, {
      avatar: nextProfile.avatar,
      nickname: nextProfile.nickname,
      age: nextProfile.age,
      height: nextProfile.height,
      languages: [...nextProfile.languages],
      bio: nextProfile.bio
    });

    if (technician) {
      updateTechnicianEntity(technician.id, {
        avatar: nextProfile.avatar,
        nickname: nextProfile.nickname,
        age: nextProfile.age,
        height: nextProfile.height,
        languages: [...nextProfile.languages],
        bio: nextProfile.bio
      });
    }

    navigate(getPortalMePath(portal), { replace: true });
  };

  return (
    <MobileShell navItems={[]}>
      <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(60,136,126,0.14),transparent_32%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg)_94%,transparent),var(--client-bg))] text-[color:var(--client-text)]">
        <MobileFullscreenHeader
          className="fixed inset-x-0 top-0 z-50"
          onBack={() => navigate(getPortalMePath(portal), { replace: true })}
          subtitle="头像、昵称、语言与简介会同步更新到账户资料"
          title="编辑用户资料"
        />

        <main className="mx-auto w-full max-w-[520px] space-y-4 px-4 pb-36 pt-[calc(env(safe-area-inset-top)+6.75rem)]">
          <SurfacePanel className="overflow-hidden p-0">
            <div className="relative h-32 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--client-primary)_90%,white),color-mix(in_srgb,var(--client-primary)_72%,black))]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.34),transparent_32%)]" />
              <CustomerMembershipBadge
                className="absolute right-4 top-4 h-11 w-11"
                fallbackClassName="absolute right-4 top-4 rounded-full bg-white/18 px-3 py-1 text-[11px] font-black text-white backdrop-blur"
                imageClassName="h-11 w-11"
                level={customer.memberLevel}
              />
            </div>

            <div className="px-4 pb-5">
              <div className="-mt-12 flex items-end justify-between gap-3">
                <AvatarImage
                  alt={draft.nickname || customer.name}
                  className="h-24 w-24 border-[4px] border-[color:var(--client-bg)] bg-[color:var(--client-surface)] shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
                  src={draft.avatar || customer.avatar}
                />
                <div className="flex items-center gap-2 pb-1">
                  <input accept="image/*" className="hidden" onChange={handleAvatarUpload} ref={avatarInputRef} type="file" />
                  <SecondaryButton className="h-10 px-4 text-sm" onClick={() => avatarInputRef.current?.click()}>
                    更换头像
                  </SecondaryButton>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">账户预览</p>
                <h1 className="mt-2 text-[28px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">{draft.nickname || customer.name}</h1>
                <p className="mt-1 text-sm text-[color:var(--client-muted)]">ID {customer.systemId}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]">
                    语言 {draft.languages.length} 项
                  </span>
                  <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-muted)]">
                    信用度 {formatCustomerCreditScore(customer, { withMax: true })}
                  </span>
                </div>
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel className="space-y-4">
            <div>
              <p className="text-[18px] font-black text-[color:var(--client-text)]">基础资料</p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--client-muted)]">这页只保留一套用户资料编辑逻辑，昵称、头像和简介都会从这里统一维护。</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">昵称</span>
                <input
                  className="h-12 w-full rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] px-4 outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))}
                  value={draft.nickname}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">年龄</span>
                <input
                  className="h-12 w-full rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] px-4 outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))}
                  value={draft.age}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">身高</span>
                <input
                  className="h-12 w-full rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] px-4 outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, height: event.target.value }))}
                  value={draft.height}
                />
              </label>
            </div>
          </SurfacePanel>

          <SurfacePanel className="space-y-4">
            <div>
              <p className="text-[18px] font-black text-[color:var(--client-text)]">语言能力</p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--client-muted)]">保持你常用的沟通语言，预约前展示也会引用这里的资料。</p>
            </div>
            <div className="flex flex-wrap gap-2" data-no-i18n>
              {languages.map((item) => {
                const label = item.label;
                const active = draft.languages.includes(label);

                return (
                  <button
                    className={cn(
                      "rounded-full px-3.5 py-2 text-sm font-black transition",
                      active
                        ? "bg-[color:var(--client-primary)] text-[#090806] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                        : "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-text)]"
                    )}
                    key={item.code}
                    onClick={() => toggleLanguage(label)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </SurfacePanel>

          <SurfacePanel className="space-y-4">
            <div>
              <p className="text-[18px] font-black text-[color:var(--client-text)]">自我介绍</p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--client-muted)]">写清楚你的预约偏好、语言习惯和常用说明，门店与技师会更容易理解你的需求。</p>
            </div>
            <textarea
              className="min-h-[180px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] px-4 py-4 text-sm leading-7 outline-none"
              onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              value={draft.bio}
            />
            <div className="rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-xs font-semibold leading-6 text-[color:var(--client-muted)]">
              信用度、积分和利用次数仍由系统自动计算，这一页只编辑用户公开资料本身。
            </div>
          </SurfacePanel>

        </main>

        <StickyBottomBar>
          <div className="flex justify-center">
            <PrimaryButton className="h-12 w-full max-w-[360px]" onClick={handleSave}>
              保存并退出
            </PrimaryButton>
          </div>
        </StickyBottomBar>
      </div>
    </MobileShell>
  );
}

function TechnicianProfileSettingsPage({ portal, technician }: { portal: UnifiedSettingsPortal; technician: Technician }) {
  const navigate = useNavigate();
  type TechnicianPaymentOption = NonNullable<Technician["paymentMethods"]>[number];
  type TechnicianProfileDraft = {
    avatar: string;
    nickname: string;
    identityLabel: NonNullable<Technician["identityLabel"]>;
    gender: NonNullable<Technician["gender"]>;
    age: string;
    height: string;
    languages: string[];
    bio: string;
    serviceAreas: string[];
    profileTags: string[];
    canServeForeigners: boolean;
    bidBudgetMin: string;
    bidBudgetMax: string;
    paymentMethods: TechnicianPaymentOption[];
  };

  const languageOptions = ["日本語", "中文", "English", "한국어", "ไทย", "Tiếng Việt", "Español"];
  const paymentOptionLabels: Record<TechnicianPaymentOption, string> = {
    platform: "平台支付",
    offline: "线下支付",
    cash: "现金",
    prepay: "需要预付",
    paypay: "PayPay",
    paypal: "PayPal",
    wechatpay: "WeChat Pay",
    alipay: "Alipay"
  };
  const paymentOptions: TechnicianPaymentOption[] = ["platform", "offline", "cash", "prepay", "paypay", "paypal", "wechatpay", "alipay"];
  const serviceAreaCatalog = {
    日本: {
      東京都: ["銀座", "新宿", "渋谷", "池袋", "六本木"],
      大阪府: ["梅田", "難波", "心斎橋"],
      神奈川県: ["横浜", "川崎", "みなとみらい"]
    }
  } as const;
  const railLineCatalog = {
    山手線: ["新宿駅", "渋谷駅", "池袋駅", "上野駅", "東京駅", "品川駅"],
    中央線快速: ["東京駅", "御茶ノ水駅", "四ツ谷駅", "新宿駅", "中野駅", "吉祥寺駅"],
    日比谷線: ["上野駅", "秋葉原駅", "銀座駅", "六本木駅", "恵比寿駅"],
    東横線: ["渋谷駅", "中目黒駅", "自由が丘駅", "武蔵小杉駅", "横浜駅"],
    御堂筋線: ["梅田駅", "本町駅", "心斎橋駅", "なんば駅", "天王寺駅"]
  } as const;
  const tagGroups = [
    { title: "身材", tags: ["👠 高挑", "🧘 匀称", "💃 曲线感", "🏃 运动系", "🌿 纤细"] },
    { title: "相貌", tags: ["✨ 清秀", "🌸 甜美", "🖤 冷艳", "😊 治愈系", "🎀 上镜感"] },
    { title: "性格", tags: ["🤝 亲和", "🫧 安静", "🎯 专业", "🌞 开朗", "🧠 细心"] },
    { title: "技术", tags: ["💆 肩颈调理", "🛌 睡眠放松", "🔥 热石", "🪷 深层舒缓", "🫶 沟通细致"] },
    { title: "语言", tags: ["🗾 日本語", "🀄 中文", "🌍 English", "🇰🇷 한국어", "🧳 外国人対応"] }
  ] as const;
  const allowedServiceAreas = new Set<string>([
    ...Object.values(serviceAreaCatalog.日本).flatMap((areas) => [...areas]),
    ...Object.values(railLineCatalog).flatMap((stations) => [...stations])
  ]);

  const toggleValue = (values: string[], value: string) => (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  const togglePaymentMethod = (values: TechnicianPaymentOption[], value: TechnicianPaymentOption) =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const buildDraft = (current: Technician): TechnicianProfileDraft => ({
    avatar: current.avatar,
    nickname: current.nickname?.trim() || current.name,
    identityLabel: current.identityLabel ?? "店铺所属技师",
    gender: current.gender ?? "private",
    age: current.age ?? "",
    height: (current.height ?? "").replace(/[^\d]/g, ""),
    languages: current.languages.length ? [...current.languages] : ["日本語"],
    bio: current.bio ?? "可在这里补充服务偏好、擅长项目和接单说明。",
    serviceAreas: current.serviceAreas.filter((item) => allowedServiceAreas.has(item)).length
      ? current.serviceAreas.filter((item) => allowedServiceAreas.has(item))
      : ["銀座", "新宿", "渋谷"],
    profileTags: current.profileTags?.length ? [...current.profileTags] : [...(current.skills.length ? current.skills : ["💆 肩颈调理", "🤝 亲和"])],
    canServeForeigners: current.canServeForeigners ?? true,
    bidBudgetMin: current.bidBudgetMin ?? "12000",
    bidBudgetMax: current.bidBudgetMax ?? "28000",
    paymentMethods: current.paymentMethods?.length ? [...current.paymentMethods] : ["platform", "offline", "cash"]
  });
  const [draft, setDraft] = useState<TechnicianProfileDraft>(() => buildDraft(technician));
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const adminAreaGroups = useMemo(
    () =>
      Object.entries(serviceAreaCatalog.日本).map(([prefecture, areas]) => ({
        title: `日本 · ${prefecture}`,
        items: [...areas]
      })),
    []
  );
  const railAreaGroups = useMemo(
    () =>
      Object.entries(railLineCatalog).map(([line, stations]) => ({
        title: line,
        items: [...stations]
      })),
    []
  );
  useEffect(() => {
    setDraft(buildDraft(technician));
  }, [technician]);

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";

      if (result) {
        setDraft((current) => ({ ...current, avatar: result }));
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleSave = () => {
    updateTechnicianEntity(technician.id, {
      avatar: draft.avatar,
      nickname: draft.nickname.trim() || technician.nickname?.trim() || technician.name,
      identityLabel: draft.identityLabel,
      gender: draft.gender,
      age: draft.age.trim() || undefined,
      height: draft.height.trim() ? `${draft.height.trim()}cm` : undefined,
      languages: Array.from(new Set(draft.languages)),
      bio: draft.bio.trim(),
      serviceAreas: Array.from(new Set(draft.serviceAreas)),
      profileTags: Array.from(new Set(draft.profileTags)),
      canServeForeigners: draft.canServeForeigners,
      bidBudgetMin: draft.bidBudgetMin.trim() || undefined,
      bidBudgetMax: draft.bidBudgetMax.trim() || undefined,
      paymentMethods: Array.from(new Set(draft.paymentMethods))
    });
    navigate(getSettingsBasePath(portal));
  };

  const chipClassName = (active: boolean, _tone: "primary" | "accent" | "warm" = "primary") =>
    cn(
      "rounded-full border px-3 py-2 text-xs font-black transition",
      active
        ? "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] text-[color:var(--client-primary)]"
        : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-text)]"
    );
  return (
    <SettingsDetailPage
      backTo={getSettingsBasePath(portal)}
      contentClassName="space-y-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)]"
      info="技师资料已经恢复成独立页面维护，保留技师专属字段，不再使用我的页上层浮窗。"
      navItems={[]}
      title="资料编辑"
    >
      <SettingsSection
        description="头像、昵称和基础身份信息会同步到技师主页与分享资料。"
        headerMode="info"
        panelClassName="p-4"
        title="基础资料"
      >
        <div className="space-y-4">
          <input accept="image/*" className="hidden" onChange={handleAvatarUpload} ref={avatarInputRef} type="file" />
          <div className="flex flex-col gap-4 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4 md:flex-row md:items-center">
            <AvatarImage alt={draft.nickname} className="h-20 w-20 shrink-0" src={draft.avatar} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black text-[color:var(--client-text)]">头像与昵称</p>
              <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-muted)]">从本地上传头像。姓名与实名认证信息继续在验证资料页维护。</p>
            </div>
            <SecondaryButton className="shrink-0" onClick={() => avatarInputRef.current?.click()}>
              上传头像
            </SecondaryButton>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block md:col-span-2">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">昵称</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))}
                value={draft.nickname}
              />
              <span className="mb-2 mt-3 block text-xs font-black text-[color:var(--client-muted)]">性别</span>
              <select
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value as TechnicianProfileDraft["gender"] }))}
                value={draft.gender}
              >
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="private">保密</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">年龄</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))}
                value={draft.age}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">身高（cm）</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                inputMode="numeric"
                onChange={(event) => setDraft((current) => ({ ...current, height: event.target.value.replace(/[^\d]/g, "") }))}
                placeholder="164"
                value={draft.height}
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-black text-[color:var(--client-muted)]">身份显示</span>
            <div className="grid gap-3 md:grid-cols-2">
              {(["店铺所属技师", "个人技师"] as const).map((value) => {
                const active = draft.identityLabel === value;

                return (
                  <button
                    className={cn(
                      "rounded-[24px] border px-4 py-4 text-left transition",
                      active
                        ? "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                    )}
                    key={value}
                    onClick={() => setDraft((current) => ({ ...current, identityLabel: value }))}
                    type="button"
                  >
                    <div className="flex items-start gap-3">
                      <SelectionIndicator active={active} />
                      <div className="min-w-0">
                        <p className="text-[15px] font-black text-[color:var(--client-text)]">{value}</p>
                        <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-muted)]">
                          {value === "店铺所属技师" ? "适合仍以店铺排班和自动派单为主的资料展示。" : "适合更强调个人接单与自由档期的资料展示。"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        action={<span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]">{draft.paymentMethods.length} 种支付</span>}
        description="这里控制接单方式、沟通语言与预算区间。"
        headerMode="info"
        panelClassName="p-4"
        title="接单偏好"
      >
        <div className="space-y-4">
          <SettingsToggleRow
            checked={draft.canServeForeigners}
            description="开启后，主页资料会明确标注可接待外国人，方便平台推荐跨语种订单。"
            onChange={(checked) => setDraft((current) => ({ ...current, canServeForeigners: checked }))}
            title="服务外国人"
          />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">抢单预算下限</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, bidBudgetMin: event.target.value }))}
                value={draft.bidBudgetMin}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">抢单预算上限</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, bidBudgetMax: event.target.value }))}
                value={draft.bidBudgetMax}
              />
            </label>
          </div>

          <div>
            <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">支付方式</span>
            <div className="flex flex-wrap gap-2">
              {paymentOptions.map((option) => (
                <button
                  className={chipClassName(draft.paymentMethods.includes(option), "primary")}
                  key={option}
                  onClick={() => setDraft((current) => ({ ...current, paymentMethods: togglePaymentMethod(current.paymentMethods, option) }))}
                  type="button"
                >
                  {paymentOptionLabels[option]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">语言能力</span>
            <div className="flex flex-wrap gap-2" data-no-i18n>
              {Array.from(new Set([...languageOptions, ...languages.map((item) => item.label)])).map((language) => (
                <button
                  className={chipClassName(draft.languages.includes(language))}
                  key={language}
                  onClick={() => setDraft((current) => ({ ...current, languages: toggleValue(current.languages, language) }))}
                  type="button"
                >
                  {language}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        action={<span className="rounded-full bg-[color:rgba(62,140,108,0.14)] px-3 py-1 text-[11px] font-black text-[color:#1c6b4f]">{draft.serviceAreas.length} 个区域</span>}
        description="服务区域和个性标签会直接影响主页资料卡、筛选结果和分享展示。"
        headerMode="info"
        panelClassName="p-4"
        title="服务范围与标签"
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-[13px] font-black text-[color:var(--client-text)]">行政区域</p>
            {adminAreaGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[color:var(--client-muted)]">{group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((area) => (
                    <button
                      className={chipClassName(draft.serviceAreas.includes(area), "primary")}
                      key={`${group.title}-${area}`}
                      onClick={() => setDraft((current) => ({ ...current, serviceAreas: toggleValue(current.serviceAreas, area) }))}
                      type="button"
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-[13px] font-black text-[color:var(--client-text)]">沿线 / 车站服务</p>
            {railAreaGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[color:var(--client-muted)]">{group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((area) => (
                    <button
                      className={chipClassName(draft.serviceAreas.includes(area), "primary")}
                      key={`${group.title}-${area}`}
                      onClick={() => setDraft((current) => ({ ...current, serviceAreas: toggleValue(current.serviceAreas, area) }))}
                      type="button"
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-[13px] font-black text-[color:var(--client-text)]">技师标签</p>
            {tagGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[color:var(--client-muted)]">{group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {group.tags.map((tag) => (
                    <button
                      className={chipClassName(draft.profileTags.includes(tag), "primary")}
                      key={tag}
                      onClick={() => setDraft((current) => ({ ...current, profileTags: toggleValue(current.profileTags, tag) }))}
                      type="button"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-4">
            <p className="text-[12px] font-black text-[color:var(--client-text)]">当前资料摘要</p>
            <p className="mt-2 text-[12px] leading-6 text-[color:var(--client-muted)]">
              服务区域：{summarizeServiceRange(draft.serviceAreas)}
            </p>
            <p className="mt-1 text-[12px] leading-6 text-[color:var(--client-muted)]">
              支付方式：{draft.paymentMethods.length > 0 ? draft.paymentMethods.map((item) => paymentOptionLabels[item]).join(" / ") : "未设置"}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection description="这里建议写清楚服务风格、擅长项目和沟通说明。" headerMode="info" panelClassName="p-4" title="自我介绍">
        <div className="space-y-4">
          <label className="block">
            <textarea
              className="min-h-[180px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-4 outline-none"
              onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              value={draft.bio}
            />
          </label>
          <div className="rounded-[24px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-xs leading-6 text-[color:var(--client-muted)]">
            资料保存后会立即同步到技师主页信息卡；详细数据页面保持独立路由展示，不会再以透明浮层覆盖在我的页上方。
          </div>
        </div>
      </SettingsSection>

      <StickySaveBar onCancel={() => navigate(-1)} onSave={handleSave} />
    </SettingsDetailPage>
  );
}

function MerchantProfileSettingsPage({ portal, store }: { portal: UnifiedSettingsPortal; store: Store }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const availableTags = Array.from(new Set([...merchantTagPool, ...store.tags]));
  const focus = searchParams.get("focus");
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const buildDraft = (source: Store) => ({
    cover: source.cover,
    gallery: [...source.gallery].slice(0, 5),
    name: source.name,
    area: source.area,
    address: source.address,
    businessHours: source.businessHours,
    nextSlot: source.nextSlot,
    priceLabel: source.priceLabel,
    rankLabel: source.rankLabel,
    description: source.description,
    tags: [...source.tags],
    mode: source.mode,
    presentation: getStorePresentationConfig(source, detectStorePresentationIndustry(source)),
    infoCardVisibility: normalizeInfoCardVisibilityDraft(source.infoCardVisibility)
  });
  const [draft, setDraft] = useState(() => buildDraft(store));
  const updatePresentationDraft = <Key extends keyof StorePresentationConfig>(key: Key, value: StorePresentationConfig[Key]) => {
    setDraft((current) => ({ ...current, presentation: { ...current.presentation, [key]: value } }));
  };

  useEffect(() => {
    setDraft(buildDraft(store));
  }, [
    store.id,
    store.cover,
    store.gallery,
    store.name,
    store.area,
    store.address,
    store.businessHours,
    store.nextSlot,
    store.priceLabel,
    store.rankLabel,
    store.description,
    store.tags,
    store.mode,
    store.presentation
  ]);
  const handleCoverUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const nextCover = await readImageFileAsDataUrl(file);
    setDraft((current) => ({ ...current, cover: nextCover }));
    event.target.value = "";
  };

  return (
    <SettingsDetailPage
      backTo={getSettingsBasePath(portal)}
      contentClassName="space-y-8 pb-32"
      info="店铺独有资料继续保留，但已经完全迁入统一设置页骨架，不再停留在商户我的页里分散维护。"
      title="店铺信息维护"
    >
      <SectionBlock description="门店资料、展示信息和经营方式统一在这里维护，样式和交互与用户端设置页保持一致。" title="店铺资料">
        <SurfacePanel className="space-y-4">
          <div className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)]">
            <img alt={draft.name} className="h-44 w-full object-cover" src={draft.cover} />
            <div className="space-y-2 px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">预览</p>
              <p className="text-[24px] font-black text-[color:var(--client-text)]">{draft.name}</p>
              <p className="text-sm font-semibold text-[color:var(--client-primary)]">{draft.rankLabel}</p>
              <p className="text-sm leading-6 text-[color:var(--client-muted)]">{draft.presentation.subtitle}</p>
              <p className="text-sm text-[color:var(--client-muted)]">{draft.area} · {draft.address}</p>
              <p className="text-sm text-[color:var(--client-muted)]">
                {draft.presentation.station} · {draft.businessHours} · 最近可约 {draft.nextSlot}
              </p>
              <p className="text-sm text-[color:var(--client-muted)]">可见范围 · {getInfoCardVisibilityLabel(draft.infoCardVisibility)}</p>
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className={cn("space-y-4", focus === "gallery" && "ring-2 ring-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)]")}>
          <div>
            <p className="text-sm font-black text-[color:var(--client-text)]">图片内容</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">服务展示里的轮播图、缩略图和环境图都从这里统一维护。</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4">
            <input accept="image/*" className="hidden" onChange={handleCoverUpload} ref={coverInputRef} type="file" />
            <div className="min-w-0">
              <p className="text-sm font-black text-[color:var(--client-text)]">封面图片</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">从本地上传新封面，不需要填写图片链接。</p>
            </div>
            <SecondaryButton className="shrink-0" onClick={() => coverInputRef.current?.click()}>
              上传封面
            </SecondaryButton>
          </div>

          <ImageGalleryManager
            coverHint="最多 5 张，店铺详情页会按这里的顺序轮播；为空时自动回退到封面图。"
            description="商户端可直接增减和替换店铺轮播图，保存后店铺详情页立即更新。"
            images={draft.gallery}
            label="店铺轮播图"
            maxImages={5}
            onChange={(gallery) => setDraft((current) => ({ ...current, gallery: gallery.slice(0, 5) }))}
          />
        </SurfacePanel>

        <SurfacePanel className={cn("space-y-4", focus === "basic" && "ring-2 ring-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)]")}>
          <div>
            <p className="text-sm font-black text-[color:var(--client-text)]">基础资料</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">店铺名称、地址、营业时间和经营方式会同步到服务展示信息卡。</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">店铺名称</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                value={draft.name}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">服务区域</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
                value={draft.area}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">店铺地址</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
                value={draft.address}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">营业时间</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, businessHours: event.target.value }))}
                value={draft.businessHours}
              />
            </label>
          </div>

          <div>
            <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">经营方式</span>
            <SegmentedTabs
              items={[
                { label: "上门服务", value: "home" },
                { label: "到店服务", value: "store" }
              ]}
              onChange={(value) => setDraft((current) => ({ ...current, mode: value as Store["mode"] }))}
              value={draft.mode}
            />
          </div>
        </SurfacePanel>

        <SurfacePanel className={cn("space-y-4", focus === "presentation" && "ring-2 ring-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)]")}>
          <div>
            <p className="text-sm font-black text-[color:var(--client-text)]">展示信息</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">价格、角标、最近可约和介绍文案会同步到服务展示的图片与信息卡。</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">价格说明</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, priceLabel: event.target.value }))}
                value={draft.priceLabel}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">首页角标</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, rankLabel: event.target.value }))}
                value={draft.rankLabel}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">最近可约</span>
              <input
                className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, nextSlot: event.target.value }))}
                value={draft.nextSlot}
              />
            </label>
          </div>

          <div className="grid gap-4">
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">前台首屏说明</span>
              <textarea
                className="min-h-[104px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3 outline-none"
                onChange={(event) => updatePresentationDraft("subtitle", event.target.value)}
                value={draft.presentation.subtitle}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">最近车站</span>
                <input
                  className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                  onChange={(event) => updatePresentationDraft("station", event.target.value)}
                  value={draft.presentation.station}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">距离说明</span>
                <input
                  className="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 outline-none"
                  onChange={(event) => updatePresentationDraft("distance", event.target.value)}
                  value={draft.presentation.distance}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">交通说明</span>
              <textarea
                className="min-h-[96px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3 outline-none"
                onChange={(event) => updatePresentationDraft("access", event.target.value)}
                value={draft.presentation.access}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">到店提示</span>
              <textarea
                className="min-h-[96px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3 outline-none"
                onChange={(event) => updatePresentationDraft("routeGuide", event.target.value)}
                value={draft.presentation.routeGuide}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">支付方式</span>
                <textarea
                  className="min-h-[104px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3 outline-none"
                  onChange={(event) => updatePresentationDraft("paymentMethods", settingsTextToList(event.target.value))}
                  value={settingsListToText(draft.presentation.paymentMethods)}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">设备 / 服务标记</span>
                <textarea
                  className="min-h-[104px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3 outline-none"
                  onChange={(event) => updatePresentationDraft("equipment", settingsTextToList(event.target.value))}
                  value={settingsListToText(draft.presentation.equipment)}
                />
              </label>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">店铺标签</span>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const active = draft.tags.includes(tag);

                return (
                  <button
                    className={`rounded-full px-3 py-2 text-xs font-black ${
                      active
                        ? "bg-[color:var(--client-primary)] text-[#090806]"
                        : "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-text)]"
                    }`}
                    key={tag}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag]
                      }))
                    }
                    type="button"
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">店铺介绍</span>
            <textarea
              className="min-h-[160px] w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3 outline-none"
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              value={draft.description}
            />
          </label>
        </SurfacePanel>

        <SurfacePanel className="space-y-4">
          <div>
            <p className="text-sm font-black text-[color:var(--client-text)]">信息卡可见范围</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">控制店铺信息卡在搜索、动态、聊天和订单联系卡中的展示对象。</p>
          </div>
          <InfoCardVisibilityEditor
            availableTags={[...draft.tags, draft.area, draft.mode === "store" ? "到店服务" : "上门服务", draft.presentation.station]}
            onChange={(infoCardVisibility) => setDraft((current) => ({ ...current, infoCardVisibility }))}
            value={draft.infoCardVisibility}
          />
        </SurfacePanel>
      </SectionBlock>

      <StickySaveBar
        onCancel={() => navigate(-1)}
        onSave={() => {
          updateStoreEntity(store.id, {
            cover: draft.cover,
            gallery: draft.gallery.slice(0, 5),
            name: draft.name,
            area: draft.area,
            address: draft.address,
            businessHours: draft.businessHours,
            nextSlot: draft.nextSlot,
            priceLabel: draft.priceLabel,
            rankLabel: draft.rankLabel,
            description: draft.description,
            tags: draft.tags,
            mode: draft.mode,
            presentation: normalizeStorePresentationConfig(draft.presentation, detectStorePresentationIndustry({ tags: draft.tags })),
            infoCardVisibility: normalizeInfoCardVisibilityDraft(draft.infoCardVisibility)
          });
          navigate(getSettingsBasePath(portal));
        }}
      />
    </SettingsDetailPage>
  );
}

export function UnifiedSettingsProfilePage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { session } = useAuth();
  const { customers, technicians, stores } = useEntityStore();
  const customer = customers.find((item) => item.id === session?.linkedCustomerId) ?? customers[0];
  const technician = technicians.find((item) => item.id === session?.linkedTechnicianId) ?? technicians[0];
  const linkedTechnician = technicians.find((item) => item.id === session?.linkedTechnicianId);
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];

  if (portal === "merchant") {
    return (
      <PortalScopedSettingsPage portal={portal}>
        <MerchantProfileSettingsPage portal={portal} store={store} />
      </PortalScopedSettingsPage>
    );
  }

  if (portal === "technician") {
    return (
      <PortalScopedSettingsPage portal={portal}>
        <TechnicianProfileSettingsPage portal={portal} technician={technician} />
      </PortalScopedSettingsPage>
    );
  }

  return (
    <PortalScopedSettingsPage portal={portal}>
      <UserProfileSettingsPage customer={customer} portal={portal} technician={linkedTechnician} />
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsVerificationPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const verificationCards =
    portal === "merchant"
      ? [
          { title: "营业资质", description: "已提交营业执照、经营许可与主体证明。", status: "已认证" },
          { title: "店铺主体", description: "结算账户、门店信息与店铺主体已完成关联。", status: "已核验" },
          { title: "经营规则", description: "改期、退款与预约规则已确认，状态正常。", status: "正常" }
        ]
      : portal === "technician"
        ? [
            { title: "实名认证", description: "姓名、头像与接单主体一致，基础实名已通过。", status: "已完成" },
            { title: "从业资料", description: "技师资料、服务信息与展示页已完成同步。", status: "已同步" },
            { title: "服务信用", description: "接单、履约和取消记录稳定，可继续接单。", status: "良好" }
          ]
        : [
            { title: "实名认证", description: "已通过基础实名校验。", status: "已完成" },
            { title: "本人一致性", description: "头像、昵称与预约资料一致性正常。", status: "已核验" },
            { title: "信用记录", description: "取消、支付与履约记录稳定。", status: "良好" }
          ];

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage backTo={getSettingsBasePath(portal)} info="验证与资质统一从设置首页进入独立页面。" title={getVerificationTitle(portal)}>
        <SectionBlock description="同一入口根据身份展示不同内容，但页面骨架和视觉规范已经统一。" title="验证状态">
          <div className="grid gap-4 lg:grid-cols-3">
            {verificationCards.map((item) => (
              <SurfacePanel key={item.title}>
                <p className="text-lg font-black text-[color:var(--client-text)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{item.description}</p>
                <p className="mt-4 text-sm font-black text-[color:var(--client-primary)]">{item.status}</p>
              </SurfacePanel>
            ))}
          </div>
        </SectionBlock>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsServiceRangePage({ portal }: { portal: UnifiedSettingsPortal }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { session } = useAuth();
  const { stores, technicians } = useEntityStore();
  const { config: homeLocationConfig } = useHomeLayoutStore();
  const technician = technicians.find((item) => item.id === session?.linkedTechnicianId) ?? technicians[0];
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const fallbackHomeLocation = homeLocationConfig.locations[0] ?? createManualHomeLocation("新宿");
  const selectedHomeLocation = homeLocationConfig.locations.find((item) => item.id === homeLocationConfig.selectedLocationId) ?? fallbackHomeLocation;
  const selectedHomeArea = getHomeLocationAreaLabel(selectedHomeLocation);
  const technicianAreaKey = technician.serviceAreas.join("|");
  const initialAreas = useMemo(() => {
    if (portal === "user") {
      return [selectedHomeArea];
    }

    if (portal === "merchant") {
      return [store.area];
    }

    return technician.serviceAreas;
  }, [portal, selectedHomeArea, store.area, technicianAreaKey]);
  const [areas, setAreas] = useState<string[]>(initialAreas);
  const [serviceRangeSearchQuery, setServiceRangeSearchQuery] = useState("");
  const t = (source: string) => translateText(source, language);
  const serviceRangeAreaOptions = useMemo(
    () => buildServiceAreaOptions(initialAreas, portal === "merchant" ? store.area : undefined, portal === "technician" ? technician.serviceAreas : undefined),
    [initialAreas, portal, store.area, technicianAreaKey]
  );
  const filteredServiceAreas = useMemo(() => {
    const query = serviceRangeSearchQuery.trim().toLocaleLowerCase();

    if (!query) {
      return serviceRangeAreaOptions;
    }

    return serviceRangeAreaOptions.filter((area) => {
      const translatedArea = t(area);

      return area.toLocaleLowerCase().includes(query) || translatedArea.toLocaleLowerCase().includes(query);
    });
  }, [language, serviceRangeAreaOptions, serviceRangeSearchQuery]);
  useEffect(() => {
    setAreas(initialAreas);
  }, [initialAreas]);
  const closeServiceRangePage = () => {
    if (typeof window !== "undefined" && typeof window.history.state?.idx === "number" && window.history.state.idx > 0) {
      navigate(-1);
      return;
    }

    navigate(getSettingsBasePath(portal), { replace: true });
  };
  const handleSaveServiceRange = () => {
    if (portal === "user") {
      const selectedArea = areas[0] ?? selectedHomeArea;
      const existingLocation = findHomeLocationForArea(homeLocationConfig.locations, selectedArea);
      const nextLocation = existingLocation ?? createManualHomeLocation(selectedArea);

      if (!existingLocation) {
        updateHomeLayoutConfig({
          locations: [...homeLocationConfig.locations.filter((item) => item.id !== nextLocation.id), nextLocation],
          selectedLocationId: nextLocation.id
        });
      }

      selectHomeLocationManually(nextLocation.id);
      closeServiceRangePage();
      return;
    }

    if (portal === "merchant") {
      const selectedArea = areas[0] ?? store.area;

      updateStoreEntity(store.id, { area: selectedArea });
      closeServiceRangePage();
      return;
    }

    updateTechnicianEntity(technician.id, { serviceAreas: areas });
    closeServiceRangePage();
  };

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        contentClassName="space-y-6 pb-32 !pt-[calc(env(safe-area-inset-top)+9.5rem)]"
        footer={
          <FloatingHeaderSearchBar
            actionAriaLabel={t("搜索按钮")}
            actionLabel={t("搜索")}
            fieldAriaLabel={t("搜索地点")}
            inputId="service-range-search"
            onChange={setServiceRangeSearchQuery}
            placeholder={t("搜索地点")}
            value={serviceRangeSearchQuery}
          />
        }
        info={t("服务范围不再散落在其他入口，统一从设置中心进入。")}
        navItems={[]}
        onClose={closeServiceRangePage}
        title={t("服务范围")}
      >
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-3">
            {filteredServiceAreas.map((area) => {
              const active = areas.includes(area);

              return (
                <button
                  className={cn(
                    "inline-flex min-h-11 min-w-[86px] items-center justify-center rounded-full px-4 text-[14px] font-black leading-none transition active:scale-[0.98]",
                    active
                      ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                      : "bg-[color:color-mix(in_srgb,var(--client-surface)_58%,transparent)] text-[color:var(--client-text)]"
                  )}
                  key={area}
                  onClick={() =>
                    portal === "technician"
                      ? setAreas((current) => (current.includes(area) ? current.filter((item) => item !== area) : [...current, area]))
                      : setAreas([area])
                  }
                  type="button"
                >
                  {t(area)}
                </button>
              );
            })}
          </div>
          {filteredServiceAreas.length === 0 ? (
            <p className="px-1 text-sm font-bold text-[color:var(--client-muted)]">{t("没有匹配结果")}</p>
          ) : null}
        </div>

        <StickySaveBar
          cancelLabel={t("取消")}
          onCancel={closeServiceRangePage}
          onSave={handleSaveServiceRange}
          saveLabel={t("保存并关闭")}
          simple
        />
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsAccountPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const { customers, technicians, stores } = useEntityStore();
  const customer = customers.find((item) => item.id === session?.linkedCustomerId) ?? customers[0];
  const technician = technicians.find((item) => item.id === session?.linkedTechnicianId) ?? technicians[0];
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const businessPromoter = businessCpsPromoters[0];
  const accountUsername = getAccountUsername({
    portal,
    customer,
    technician,
    store,
    fallback: session?.username
  });

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        info={portal === "business" ? "Afirieito 账号、安全、推广码和收款身份统一收口到同一页。" : "账户、安全、绑定信息统一收口到同一页。"}
        navItems={getSettingsNavItems(portal)}
        title="账户与安全"
      >
        <SettingsSection
          description={portal === "business" ? "这里展示 NeeDoAfirieito 推广账号的基础绑定信息，不展示普通用户会员等级。" : "首页只显示摘要，这里承接三端账户、安全与主体绑定相关内容。"}
          panelClassName={settingsListDividerClassName}
          title="账户信息"
        >
          {portal === "business" ? (
            <>
              <SettingsListItem subtitle={`账号 ${accountUsername}`} title="Afirieito 登录账号" value="已启用" />
              <SettingsListItem subtitle={businessPromoter?.inviteCode ?? "未分配推广码"} title="专属推广码" value="已绑定" />
              <SettingsListItem subtitle={businessPromoter?.primaryChannel ?? "待设置"} title="默认推广渠道" value="可使用" />
              <SettingsListItem subtitle="提现、税务与银行资料后续接入正式接口" title="收款身份" value="待复核" />
              <SettingsListItem subtitle="只读取本人推广活动、素材、收益和结算数据" title="数据权限" value="Afirieito 专用" />
            </>
          ) : (
            <>
              <SettingsListItem subtitle={customer.phone || "未设置手机号"} title={portal === "merchant" ? "管理员手机" : "手机绑定"} value={customer.phone ? "已绑定" : "未设置"} />
          <SettingsListItem subtitle={`用户名 ${accountUsername}`} title="登录方式" value="账号密码" />
          <SettingsListItem subtitle="当前前端保留结构，未接入真实改密接口" title="登录密码" value="已设置" />
          {portal === "merchant" ? (
            <>
              <SettingsListItem subtitle="店铺主体、资质与结算信息已绑定到当前门店账号" title="绑定信息" value="主体已绑定" />
              <SettingsListItem subtitle="分账、提现与票据配置入口保留在统一账户页中" title="结算账户" value="待接入" />
            </>
          ) : portal === "technician" ? (
            <>
              <SettingsListItem subtitle="技师资料、接单身份与展示信息已关联" title="绑定信息" value="基础完成" />
              <SettingsListItem subtitle="提现、结算与税务资料后续统一收口到这里" title="收款账户" value="待接入" />
              <SettingsListItem subtitle="紧急联系人与位置共享会复用统一设置体系" title="紧急联系人" value="已配置" />
            </>
          ) : (
            <>
              <SettingsListItem subtitle="账号与资料主体已关联" title="绑定信息" value="基础完成" />
              <SettingsListItem subtitle="演示环境未接入多设备记录" title="设备管理" value="当前设备" />
            </>
          )}
            </>
          )}
        </SettingsSection>
        <GoogleCalendarAccountBinding
          autoFocus={searchParams.get("section") === "google-account" || searchParams.get("section") === "google-calendar"}
          customer={customer}
          portal={portal}
          store={store}
          technician={technician}
        />
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsNotificationsPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const [portalSettings, setPortalSettings] = usePortalSettingsState(portal);

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage backTo={getSettingsBasePath(portal)} info="通知首页只显示摘要状态，详细开关放到独立页面。" navItems={getSettingsNavItems(portal)} title="通知设置">
        <SettingsSection
          description="消息、系统、预约与营销提醒统一集中在这里逐项控制。"
          panelClassName="space-y-3 p-4"
          title="消息与提醒"
        >
          <SettingsToggleRow
            checked={portalSettings.message}
            description="聊天与通讯录相关消息提醒"
            onChange={(checked) => setPortalSettings((current) => ({ ...current, message: checked }))}
            title="消息通知"
          />
          <SettingsToggleRow
            checked={portalSettings.system}
            description="系统公告、风控与平台通知"
            onChange={(checked) => setPortalSettings((current) => ({ ...current, system: checked }))}
            title="系统通知"
          />
          <SettingsToggleRow
            checked={portalSettings.booking}
            description="预约确认、改期、到时与服务提醒"
            onChange={(checked) => setPortalSettings((current) => ({ ...current, booking: checked }))}
            title="预约通知"
          />
          <SettingsToggleRow
            checked={portalSettings.marketing}
            description="优惠券、活动与回流营销提醒"
            onChange={(checked) => setPortalSettings((current) => ({ ...current, marketing: checked }))}
            title="营销通知"
          />
          <SettingsToggleRow
            checked={portalSettings.sound}
            description="声音、震动与横幅提醒方式"
            onChange={(checked) => setPortalSettings((current) => ({ ...current, sound: checked }))}
            title="声音与提醒方式"
          />
        </SettingsSection>

        {portal === "technician" ? (
          <SettingsSection
            description="技师端原本散落在我的页里的接单与位置开关，已经迁入统一设置体系。"
            panelClassName="space-y-3 p-4"
            title="工作与位置"
          >
            {(() => {
              const technicianSettings = portalSettings as TechnicianPortalSettingsState;

              return (
                <>
                  <SettingsToggleRow
                    checked={technicianSettings.autoAccept}
                    description="自动接受符合风险规则的预约订单"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as TechnicianPortalSettingsState), autoAccept: checked }))
                    }
                    title="自动接单"
                  />
                  <SettingsToggleRow
                    checked={technicianSettings.shareLocation}
                    description="给紧急联系人同步位置与到达状态"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as TechnicianPortalSettingsState), shareLocation: checked }))
                    }
                    title="共享位置"
                  />
                  <SettingsToggleRow
                    checked={technicianSettings.breakReminder}
                    description="重要行程开始前提醒查看日程"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as TechnicianPortalSettingsState), breakReminder: checked }))
                    }
                    title="日程提醒"
                  />
                </>
              );
            })()}
          </SettingsSection>
        ) : null}

        {portal === "merchant" ? (
          <SettingsSection
            description="商户端原有的经营开关保留，但页面结构、样式和交互统一复用了设置子页模块。"
            panelClassName="space-y-3 p-4"
            title="经营开关"
          >
            {(() => {
              const merchantSettings = portalSettings as MerchantPortalSettingsState;

              return (
                <>
                  <SettingsToggleRow
                    checked={merchantSettings.storeOnline}
                    description="控制门店是否继续接受新预约"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as MerchantPortalSettingsState), storeOnline: checked }))
                    }
                    title="店铺上线"
                  />
                  <SettingsToggleRow
                    checked={merchantSettings.autoConfirm}
                    description="自动确认符合规则的预约订单"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as MerchantPortalSettingsState), autoConfirm: checked }))
                    }
                    title="自动确认订单"
                  />
                  <SettingsToggleRow
                    checked={merchantSettings.instantBooking}
                    description="允许前台即时预约直接进入排班处理"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as MerchantPortalSettingsState), instantBooking: checked }))
                    }
                    title="即时预约"
                  />
                  <SettingsToggleRow
                    checked={merchantSettings.reviewReminder}
                    description="完成订单后提醒顾客进行评价"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as MerchantPortalSettingsState), reviewReminder: checked }))
                    }
                    title="评价提醒"
                  />
                </>
              );
            })()}
          </SettingsSection>
        ) : null}

        {portal === "business" ? (
          <SettingsSection
            description="NeeDoAfirieito 独有通知集中到这里，不和用户端会员、预约等级混在一起。"
            panelClassName="space-y-3 p-4"
            title="Afirieito 通知"
          >
            {(() => {
              const businessSettings = portalSettings as BusinessPortalSettingsState;

              return (
                <>
                  <SettingsToggleRow
                    checked={businessSettings.campaign}
                    description="活动上架、预算变化、规则调整提醒"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as BusinessPortalSettingsState), campaign: checked }))
                    }
                    title="活动通知"
                  />
                  <SettingsToggleRow
                    checked={businessSettings.material}
                    description="素材审核、二维码更新、文案可用状态"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as BusinessPortalSettingsState), material: checked }))
                    }
                    title="素材通知"
                  />
                  <SettingsToggleRow
                    checked={businessSettings.settlement}
                    description="预估佣金、可提现、提现进度与账本变动"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as BusinessPortalSettingsState), settlement: checked }))
                    }
                    title="结算通知"
                  />
                  <SettingsToggleRow
                    checked={businessSettings.risk}
                    description="归因异常、素材违规、佣金冻结与复核结果"
                    onChange={(checked) =>
                      setPortalSettings((current) => ({ ...(current as BusinessPortalSettingsState), risk: checked }))
                    }
                    title="风控通知"
                  />
                </>
              );
            })()}
          </SettingsSection>
        ) : null}
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsHelpPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const supportPath = getSupportPath(portal);
  const supportPrimaryLabel = portal === "user" ? "前往帮助中心" : portal === "business" ? "返回 Afirieito" : "前往消息中心";

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage backTo={getSettingsBasePath(portal)} info="帮助入口保持独立，避免设置首页被说明文案占满。" navItems={getSettingsNavItems(portal)} title="帮助与反馈">
        <SettingsSection
          description="帮助、反馈和平台支持统一承接在同一套详情页中。"
          panelClassName={settingsListDividerClassName}
          title="支持入口"
        >
          <SettingsListItem
            subtitle={portal === "user" ? "前往帮助页查看客服入口与常见问题" : portal === "business" ? "NeeDoAfirieito 的活动、素材、归因和结算问题统一由平台支持承接" : "通过消息中心联系平台支持与问题反馈"}
            title={portal === "user" ? "帮助中心" : "联系平台支持"}
            to={supportPath}
            value="进入"
          />
          <SettingsListItem subtitle="当前演示环境统一通过平台支持入口承接问题反馈" title="问题反馈" value="支持中" />
        </SettingsSection>
        <div className="flex justify-end">
          <PrimaryButton to={supportPath}>{supportPrimaryLabel}</PrimaryButton>
        </div>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

export function UnifiedSettingsAboutPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { language } = useI18n();
  const { theme } = useClientTheme();
  const t = (source: string) => translateText(source, language);
  const currentThemeLabel = t(clientThemes.find((item) => item.id === theme)?.label ?? "活力黑白版");
  const currentLanguageLabel = languages.find((item) => item.code === language)?.label ?? "简中";

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        info={t(portal === "business" ? "版本、主题、语言和当前 Afirieito 平台身份摘要独立收口到关于页。" : "版本、主题、语言和当前身份摘要独立收口到关于页。")}
        navItems={getSettingsNavItems(portal)}
        title={t(portal === "business" ? "关于 NeeDoAfirieito" : "关于 NeeDo")}
      >
        <SettingsSection panelClassName={settingsListDividerClassName} title={t("应用信息")}>
          <SettingsListItem dataNoI18n title={t("当前版本")} value={appVersion} />
          <SettingsListItem title={t("当前主题")} value={currentThemeLabel} />
          <SettingsListItem dataNoI18n title={t("当前语言")} value={currentLanguageLabel} />
          <SettingsListItem title={t("当前身份")} value={t(compactPortalLabels[portal].label)} />
        </SettingsSection>
        <SettingsSection panelClassName="p-4" title={t("说明")}>
          <p className="text-sm leading-7 text-[color:var(--client-muted)]">
            {t(portal === "business" ? "NeeDoAfirieito 是独立 Afirieito 前端，面向推广者处理活动、素材、归因、收益和提现；产运后台只读取和管理它产生的数据。" : "NeeDo 设置中心现在已经统一成一套三端共用模块。用户端作为基准实现，技师端与店铺端通过身份配置复用同一套首页、列表项、子页骨架与状态展示方式。")}
          </p>
        </SettingsSection>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

type LegalDocumentKind = "terms" | "privacy";

function NoI18nText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={className} data-no-i18n>
      {children}
    </span>
  );
}

function splitLegalMetaItem(item: string) {
  const separatorIndex = item.search(/[：:]/);

  if (separatorIndex === -1) {
    return {
      label: "",
      value: item
    };
  }

  return {
    label: item.slice(0, separatorIndex).trim(),
    value: item.slice(separatorIndex + 1).trim()
  };
}

function LegalDocumentMetaRows({
  rows
}: {
  rows: Array<{
    label: string;
    value: string;
  }>;
}) {
  return (
    <div className="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]" data-no-i18n>
      {rows.map((item) => (
        <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[9rem,1fr] sm:gap-4" key={`${item.label}-${item.value}`}>
          {item.label ? <p className="text-[12px] font-black text-[color:var(--client-muted)]">{item.label}</p> : null}
          <p className={cn("break-words text-[13px] font-semibold leading-6 text-[color:var(--client-text)]", item.label ? "" : "sm:col-span-2")}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function UnifiedSettingsTermsDocumentPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { language } = useI18n();
  const termsDocument = getLegalTermsDocument(language);
  const copy = getLegalTermsUiCopy(language);
  const metaRows = [
    {
      label: copy.languageLabel,
      value: termsDocument.languageName
    },
    ...termsDocument.meta.map(splitLegalMetaItem),
    {
      label: copy.sectionCountLabel,
      value: copy.sectionCountValue
    }
  ];

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        contentClassName="pb-28"
        info={<NoI18nText>{copy.pageInfo}</NoI18nText>}
        navItems={getSettingsNavItems(portal)}
        title={<NoI18nText>{termsDocument.title}</NoI18nText>}
      >
        <SettingsSection
          description={<NoI18nText>{copy.documentInfoDescription}</NoI18nText>}
          panelClassName="p-0"
          title={<NoI18nText>{copy.documentInfoTitle}</NoI18nText>}
        >
          <LegalDocumentMetaRows rows={metaRows} />
        </SettingsSection>

        <SettingsSection
          description={<NoI18nText>{copy.bodyDescription}</NoI18nText>}
          panelClassName="p-0"
          title={<NoI18nText>{copy.bodyTitle}</NoI18nText>}
        >
          <div className="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]" data-no-i18n>
            {termsDocument.sections.map((section) => (
              <article className="px-4 py-4 sm:px-5" key={section.title}>
                <h3 className="break-words text-[15px] font-black leading-6 text-[color:var(--client-text)]">{section.title}</h3>
                <div className="mt-3 space-y-2.5">
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <p className="break-words text-[13px] leading-7 text-[color:var(--client-muted)]" key={`${section.title}-${paragraphIndex}`}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SettingsSection>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

function PrivacyBlock({ block }: { block: LegalPrivacyBlock }) {
  if (block.kind === "bullet") {
    return (
      <li className="break-words text-[13px] leading-7 text-[color:var(--client-muted)]">
        {block.text}
      </li>
    );
  }

  return <p className="break-words text-[13px] leading-7 text-[color:var(--client-muted)]">{block.text}</p>;
}

function UnifiedSettingsPrivacyDocumentPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { language } = useI18n();
  const privacyDocument = getLegalPrivacyDocument(language);
  const copy = getLegalPrivacyUiCopy(language);
  const metaRows = [
    {
      label: copy.languageLabel,
      value: privacyDocument.languageName
    },
    ...privacyDocument.meta.map(splitLegalMetaItem),
    {
      label: copy.sectionCountLabel,
      value: copy.sectionCountValue
    }
  ];

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        contentClassName="pb-28"
        info={<NoI18nText>{copy.pageInfo}</NoI18nText>}
        navItems={getSettingsNavItems(portal)}
        title={<NoI18nText>{privacyDocument.title}</NoI18nText>}
      >
        <SettingsSection
          description={<NoI18nText>{copy.documentInfoDescription}</NoI18nText>}
          panelClassName="p-0"
          title={<NoI18nText>{copy.documentInfoTitle}</NoI18nText>}
        >
          <LegalDocumentMetaRows rows={metaRows} />
        </SettingsSection>

        <SettingsSection
          description={<NoI18nText>{copy.bodyDescription}</NoI18nText>}
          panelClassName="p-0"
          title={<NoI18nText>{copy.bodyTitle}</NoI18nText>}
        >
          <div className="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]" data-no-i18n>
            {privacyDocument.sections.map((section) => (
              <article className="px-4 py-4 sm:px-5" key={section.title}>
                <h3 className="break-words text-[15px] font-black leading-6 text-[color:var(--client-text)]">{section.title}</h3>
                <div className="mt-3 space-y-2.5">
                  {section.blocks.some((block) => block.kind === "bullet") ? (
                    <div className="space-y-2.5">
                      {section.blocks.map((block, blockIndex) =>
                        block.kind === "bullet" ? (
                          <ul className="list-disc space-y-2.5 pl-5" key={`${section.title}-${blockIndex}`}>
                            <PrivacyBlock block={block} />
                          </ul>
                        ) : (
                          <PrivacyBlock block={block} key={`${section.title}-${blockIndex}`} />
                        )
                      )}
                    </div>
                  ) : (
                    section.blocks.map((block, blockIndex) => <PrivacyBlock block={block} key={`${section.title}-${blockIndex}`} />)
                  )}
                </div>
              </article>
            ))}
          </div>
        </SettingsSection>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

function UnifiedSettingsLegalDocumentPage({
  portal,
  kind
}: {
  portal: UnifiedSettingsPortal;
  kind: LegalDocumentKind;
}) {
  if (kind === "terms") {
    return <UnifiedSettingsTermsDocumentPage portal={portal} />;
  }

  return <UnifiedSettingsPrivacyDocumentPage portal={portal} />;
}

export function UnifiedSettingsTermsPage({ portal }: { portal: UnifiedSettingsPortal }) {
  return <UnifiedSettingsLegalDocumentPage kind="terms" portal={portal} />;
}

export function UnifiedSettingsPrivacyPage({ portal }: { portal: UnifiedSettingsPortal }) {
  return <UnifiedSettingsLegalDocumentPage kind="privacy" portal={portal} />;
}

export function UnifiedSettingsDeleteAccountPage({ portal }: { portal: UnifiedSettingsPortal }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [submitted, setSubmitted] = useState(false);
  const checks =
    portal === "business"
      ? [
          { title: "Afirieito 账号资料", subtitle: "退会后将停止使用 NeeDoAfirieito 前端，并按法规要求保留必要记录。", value: "需确认" },
          { title: "佣金与提现", subtitle: "未结算佣金、冻结金额和提现争议处理完成前不能正式退会。", value: "需检查" },
          { title: "推广链接与素材", subtitle: "退会后专属链接、二维码和素材授权将进入停止使用流程。", value: "需确认" },
          { title: "演示账号", subtitle: "当前环境只展示退会入口，不会直接删除测试账号数据。", value: "演示中" }
        ]
      : [
          { title: "账号资料", subtitle: "注销后将停止登录当前身份，并按法规要求处理必要记录。", value: "需确认" },
          { title: "预约与结算", subtitle: "未完成预约、未结算金额和争议处理完成前不能正式退会。", value: "需检查" },
          { title: "演示账号", subtitle: "当前环境只展示退会入口，不会直接删除测试账号数据。", value: "演示中" }
        ];

  return (
    <PortalScopedSettingsPage portal={portal}>
      <SettingsDetailPage
        backTo={getSettingsBasePath(portal)}
        info={t("账号注销会进入退会申请流程，正式环境需完成身份确认和未结事项检查。")}
        navItems={getSettingsNavItems(portal)}
        title={t("注销账号")}
      >
        <SettingsSection
          description={t(portal === "business" ? "NeeDoAfirieito 使用独立退会确认，重点检查佣金、提现、推广链接和数据保留。" : "三端共用同一套退会入口，避免用户、技师和商户端规则不一致。")}
          panelClassName={settingsListDividerClassName}
          title={t("退会前确认")}
        >
          {checks.map((item) => (
            <SettingsListItem key={item.title} subtitle={t(item.subtitle)} title={t(item.title)} value={t(item.value)} />
          ))}
        </SettingsSection>

        <SettingsSection panelClassName="p-4" title={t("提交申请")}>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-[color:var(--client-muted)]">
              {t(submitted ? "退会申请已记录在演示状态中。" : "当前演示环境只展示退会入口与确认说明，不直接删除测试账号数据。")}
            </p>
            <PrimaryButton className="w-full" onClick={() => setSubmitted(true)}>
              {t(submitted ? "已提交申请" : "提交注销申请")}
            </PrimaryButton>
          </div>
        </SettingsSection>
      </SettingsDetailPage>
    </PortalScopedSettingsPage>
  );
}

function StickySaveBar({
  onCancel,
  onSave,
  cancelLabel = "取消",
  saveLabel = "保存并返回设置中心",
  simple = false
}: {
  onCancel: () => void;
  onSave: () => void;
  cancelLabel?: ReactNode;
  saveLabel?: ReactNode;
  simple?: boolean;
}) {
  const content = (
    <div className={cn(simple ? "grid grid-cols-2 gap-3" : "grid gap-3 md:grid-cols-[160px,1fr]")}>
      <SecondaryButton className="w-full" onClick={onCancel}>
        {cancelLabel}
      </SecondaryButton>
      <PrimaryButton className="w-full" onClick={onSave}>
        {saveLabel}
      </PrimaryButton>
    </div>
  );

  if (simple) {
    return (
      <>
        <ClientEdgeMask
          className="z-30"
          edge="bottom"
          style={{
            "--client-edge-mask-bottom-height": "calc(env(safe-area-inset-bottom,0px) + 11rem)",
            "--client-edge-mask-bottom-mid-opacity": "0.72",
            "--client-edge-mask-bottom-mid-stop": "42%",
            "--client-edge-mask-bottom-strong-opacity": "1",
            "--client-edge-mask-bottom-strong-stop": "78%"
          } as CSSProperties}
        />
        <div className="safe-nav-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] bg-gradient-to-t from-[color:var(--client-bg)] via-[color:color-mix(in_srgb,var(--client-bg)_88%,transparent)] to-transparent px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)] pt-16 sm:px-6 lg:px-8">
          <div className="pointer-events-auto">{content}</div>
        </div>
      </>
    );
  }

  return (
    <div className="safe-nav-bottom client-bottom-action-shell fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] px-4 pb-3 sm:px-6 lg:px-8">
      <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-3 shadow-[0_-18px_40px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        {content}
      </div>
    </div>
  );
}
