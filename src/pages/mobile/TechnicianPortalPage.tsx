import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth, type AuthSession } from "../../auth/AuthProvider";
import { AppIcon, FeatureSegmentedTabs, IconButton, type IconName } from "../../components/client-ui/AppScaffold";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { roleBasedTabConfig, technicianNavItems } from "../../components/mobile/navItems";
import { FormalTechnicianOrdersPanel } from "../../components/technician/FormalTechnicianOrdersPanel";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { PrivacyModeConfirmDialog } from "../../components/ui/PrivacyModeConfirmDialog";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { coreReadApi, type CoreTechnicianDetail } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import {
  technicianProfileApi,
  type TechnicianProfilePaymentMethod,
  type TechnicianProfileVisibility,
  type TechnicianSelfProfile
} from "../../features/core-read/technicianProfileApi";
import {
  pricingModeApi,
  type ShopPricingMode,
  type TechnicianServicePayload
} from "../../features/pricing-mode/api";
import { cn, yen } from "../../lib/utils";

type TechnicianPortalView = "tasks" | "me";
type TechnicianMeTab = "info" | "services" | "data";

const languageOptions = ["日本語", "中文", "English", "한국어", "ไทย", "Tiếng Việt", "Español"];
const paymentOptions: Array<{ value: TechnicianProfilePaymentMethod; label: string }> = [
  { value: "platform", label: "平台支付" },
  { value: "offline", label: "线下支付" },
  { value: "cash", label: "现金" },
  { value: "prepay", label: "需要预付" },
  { value: "paypay", label: "PayPay" },
  { value: "paypal", label: "PayPal" },
  { value: "wechatpay", label: "WeChat Pay" },
  { value: "alipay", label: "Alipay" }
];
const visibilityOptions: Array<{
  value: Exclude<TechnicianProfileVisibility, "public">;
  label: string;
  description: string;
}> = [
  { value: "privateAll", label: "对所有人不可见", description: "仅本人可见" },
  { value: "limited", label: "对好友可见", description: "仅好友可以看到该账号信息" },
  { value: "network", label: "对好友以及关联人可见", description: "仅好友以及关联店铺和介绍关系中的关联人可见" }
];

const surface = {
  shell: "border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_22%,transparent),transparent_34%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)),color-mix(in_srgb,var(--client-bg)_94%,black))] text-[color:var(--client-text)]",
  panel: "border-[color:color-mix(in_srgb,var(--client-line)_72%,var(--client-primary)_14%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_58%,var(--client-bg)_42%)]",
  metric: "border-[color:color-mix(in_srgb,var(--client-line)_70%,var(--client-primary)_16%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_50%,transparent)]",
  chip: "border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]",
  muted: "text-[color:var(--client-muted)]"
};

function getFormalTechnicianProfileId(session: AuthSession | null) {
  if (
    session?.portal !== "technician" ||
    session.currentIdentity.type !== "technician" ||
    session.currentIdentity.scopeType !== "technician_profile" ||
    !session.currentIdentity.scopeId
  ) return null;
  return session.currentIdentity.scopeId;
}

function getPortalView(view: string | undefined): TechnicianPortalView {
  return view === "me" || view === "workDetail" ? "me" : "tasks";
}

function getMeTab(value: string | null): TechnicianMeTab {
  return value === "services" || value === "data" ? value : "info";
}

function parseNullableNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitList(value: string) {
  return Array.from(new Set(value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean)));
}

function profileAvatarSrc(profile: TechnicianSelfProfile) {
  if (profile.avatarUrl) return profile.avatarUrl;
  const label = (profile.displayName.trim().slice(0, 1) || "技").replace(/[<>&'\"]/g, "") || "技";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#dff5e8"/><text x="60" y="76" text-anchor="middle" font-size="52" font-family="sans-serif" font-weight="700" fill="#176b45">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function profileDraft(profile: TechnicianSelfProfile) {
  return {
    displayName: profile.displayName,
    avatar: profile.avatarUrl ?? "",
    age: profile.age === null ? "" : String(profile.age),
    heightCm: profile.heightCm === null ? "" : String(profile.heightCm),
    languages: [...profile.languages],
    bio: profile.bio ?? "",
    serviceAreasText: profile.serviceAreas.join("、"),
    profileTagsText: profile.profileTags.join("、"),
    canServeForeigners: profile.canServeForeigners,
    bidBudgetMinJpy: profile.bidBudgetMinJpy === null ? "" : String(profile.bidBudgetMinJpy),
    bidBudgetMaxJpy: profile.bidBudgetMaxJpy === null ? "" : String(profile.bidBudgetMaxJpy),
    paymentMethods: [...profile.paymentMethods]
  };
}

function ProfileAvatar({ profile, editing, onSelect }: {
  profile: TechnicianSelfProfile;
  editing?: boolean;
  onSelect?: () => void;
}) {
  const content = profile.avatarUrl ? (
    <AvatarImage alt={profile.displayName} className="h-full w-full rounded-[28px]" src={profile.avatarUrl} />
  ) : (
    <span className="grid h-full w-full place-items-center rounded-[28px] bg-[color:var(--client-primary-soft)] text-4xl font-black text-[color:var(--client-primary-strong)]">
      {profile.displayName.trim().slice(0, 1) || "技"}
    </span>
  );
  return (
    <div className="relative h-36 w-36 overflow-hidden rounded-[28px] border-[3px] border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
      {content}
      {editing ? (
        <button aria-label="更换头像" className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/55 text-white" onClick={onSelect} type="button">
          <AppIcon className="h-4 w-4" name="edit" />
        </button>
      ) : null}
    </div>
  );
}

function ResourceState({ error, retry }: { error?: string | null; retry?: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[color:var(--client-bg)] px-6 text-center text-[color:var(--client-text)]">
      <div>
        <h1 className="text-xl font-black">{error ? "技师资料加载失败" : "正在加载技师资料"}</h1>
        <p className="mt-2 text-sm font-semibold text-[color:var(--client-muted)]">
          {error ? error : "正在同步当前技师与所属店铺，请稍候。"}
        </p>
        {error && retry ? <button className="mt-4 rounded-full bg-[color:var(--client-primary)] px-5 py-2 text-sm font-black text-[color:var(--client-needo-text)]" onClick={retry} type="button">重新加载</button> : null}
      </div>
    </main>
  );
}

export function TechnicianPortalPage() {
  return <TechnicianPortalDataGate />;
}

function TechnicianPortalDataGate() {
  const { session } = useAuth();
  const [revision, setRevision] = useState(0);
  const formalTechnicianProfileId = getFormalTechnicianProfileId(session);
  const formalTechnicianProfileQuery = useCoreReadQuery(
    () => formalTechnicianProfileId ? coreReadApi.getTechnicianDetail(formalTechnicianProfileId) : null,
    [formalTechnicianProfileId, revision]
  );
  const formalTechnicianSelfProfileQuery = useCoreReadQuery(
    () => formalTechnicianProfileId ? technicianProfileApi.getMine() : null,
    [formalTechnicianProfileId, revision]
  );
  const technician = formalTechnicianProfileQuery.data;
  const selfProfile = formalTechnicianSelfProfileQuery.data;
  const error = formalTechnicianProfileQuery.error ?? formalTechnicianSelfProfileQuery.error;

  if (!formalTechnicianProfileId || !technician?.shop || !selfProfile) {
    return <ResourceState error={error} retry={() => setRevision((current) => current + 1)} />;
  }

  return <TechnicianPortalContent initialSelfProfile={selfProfile} technician={technician} />;
}

function TasksView({ profile, technician }: { profile: TechnicianSelfProfile; technician: CoreTechnicianDetail }) {
  const rating = Number(technician.reviewSummary.ratingAverage || 0);
  const shopName = technician.shop?.name ?? "";
  const quickActions: Array<{ label: string; icon: IconName; to: string }> = [
    { label: "排班", icon: "calendar", to: "/technician/schedule" },
    { label: "通讯录", icon: "manager", to: "/technician/contacts" },
    { label: "需求", icon: "sparkles", to: "/technician/needo" },
    { label: "工资单", icon: "info", to: "/technician/payroll" }
  ];
  return (
    <>
      <FloatingHomeHeader panelClassName={floatingHeaderGlassPanelClassName}>
        <div className={floatingHeaderInnerClassName}>
          <SharedHomeHeader
            avatarAlt={profile.displayName}
            avatarLabel="打开我的页面"
            avatarSrc={profileAvatarSrc(profile)}
            avatarTo="/technician/me"
            locationCaption="当前服务区域"
            locationLabel={profile.serviceAreas[0] ?? profile.city ?? "服务区域未设置"}
            locationTo="/technician/settings/service-range"
            settingsLabel="打开技师设置"
            settingsTo="/technician/settings"
          />
        </div>
      </FloatingHomeHeader>
      <div className="space-y-4 px-4 pb-28 pt-2">
        <section className="client-feature-panel overflow-hidden rounded-[28px] border text-white shadow-[var(--client-shadow)]">
          <div className="relative p-5">
            <div className="client-feature-aura absolute inset-0" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white/55">{shopName}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <h1 className="truncate text-[24px] font-black tracking-[-0.04em]">{profile.displayName}</h1>
                    <KycVerifiedBadge size="label" />
                  </div>
                  <p className="mt-2 text-xs font-bold text-white/55">ID：{profile.publicId}</p>
                </div>
                <Badge tone="green">{profile.employmentType === "independent" ? "个人技师" : "店铺所属"}</Badge>
              </div>
              <div className="mt-5 grid grid-cols-3 rounded-[20px] border border-white/10 bg-white/[0.08] py-3 backdrop-blur">
                {[
                  ["服务评分", rating > 0 ? rating.toFixed(1) : "—"],
                  ["评价数量", String(technician.reviewSummary.reviewCount)],
                  ["从业年限", `${profile.yearsExperience} 年`]
                ].map(([label, value], index) => (
                  <div className={cn("min-w-0 px-2 text-center", index > 0 && "border-l border-white/10")} key={label}>
                    <p className="truncate text-[10px] font-bold text-white/50">{label}</p>
                    <strong className="mt-1.5 block truncate text-base font-black">{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={cn(surface.shell, "rounded-[28px] border p-4 shadow-[var(--client-shadow)]")}>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((item) => (
              <Link className={cn(surface.metric, "grid min-h-[84px] place-items-center rounded-[20px] border px-2 py-3 text-center")} key={item.label} to={item.to}>
                <AppIcon className="h-5 w-5" name={item.icon} />
                <span className="mt-2 text-xs font-black">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="client-feature-panel rounded-[28px] border p-4 text-white shadow-[var(--client-shadow)]">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div><p className="text-[11px] font-black text-white/45">正式服务器数据</p><h2 className="mt-1 text-xl font-black">今日安排与预约</h2></div>
            <Link className="rounded-full border border-white/15 px-3 py-2 text-xs font-black" to="/technician/schedule">查看排班</Link>
          </div>
          <FormalTechnicianOrdersPanel />
        </section>
      </div>
    </>
  );
}

type TechnicianProfileDraft = ReturnType<typeof profileDraft>;

function TechnicianInfoCard({ profile, onSaved }: {
  profile: TechnicianSelfProfile;
  onSaved: (profile: TechnicianSelfProfile) => void;
}) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TechnicianProfileDraft>(() => profileDraft(profile));
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const [privacyConfirmOpen, setPrivacyConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(profileDraft(profile)), [profile]);
  const mutate = async (input: Parameters<typeof technicianProfileApi.updateMine>[0]) => {
    if (saving) return null;
    setSaving(true);
    setError("");
    try {
      const saved = await technicianProfileApi.updateMine(input);
      onSaved(saved);
      setDraft(profileDraft(saved));
      return saved;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "error.technician_profile.update_failed");
      return null;
    } finally {
      setSaving(false);
    }
  };
  const saveProfile = async () => {
    const saved = await mutate({
      displayName: draft.displayName.trim() || profile.displayName,
      ...(draft.avatar.startsWith("data:image/") ? { avatarDataUrl: draft.avatar } : {}),
      age: parseNullableNumber(draft.age),
      heightCm: parseNullableNumber(draft.heightCm),
      languages: draft.languages,
      bio: draft.bio.trim() || null,
      serviceAreas: splitList(draft.serviceAreasText),
      profileTags: splitList(draft.profileTagsText),
      canServeForeigners: draft.canServeForeigners,
      bidBudgetMinJpy: parseNullableNumber(draft.bidBudgetMinJpy),
      bidBudgetMaxJpy: parseNullableNumber(draft.bidBudgetMaxJpy),
      paymentMethods: draft.paymentMethods
    });
    if (saved) setEditing(false);
  };
  const persistVisibility = async (visibility: TechnicianProfileVisibility, openMenu = false) => {
    const saved = await mutate({ visibility });
    if (saved) setPrivacyMenuOpen(openMenu && saved.visibility !== "public");
  };
  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraft((current) => ({ ...current, avatar: reader.result as string }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };
  const toggleLanguage = (language: string) => setDraft((current) => ({
    ...current,
    languages: current.languages.includes(language) ? current.languages.filter((item) => item !== language) : [...current.languages, language]
  }));
  const togglePaymentMethod = (method: TechnicianProfilePaymentMethod) => setDraft((current) => ({
    ...current,
    paymentMethods: current.paymentMethods.includes(method) ? current.paymentMethods.filter((item) => item !== method) : [...current.paymentMethods, method]
  }));
  const privacyEnabled = profile.visibility !== "public";
  const visibilityLabel = profile.visibility === "public" ? "公开可见" : visibilityOptions.find((item) => item.value === profile.visibility)?.label ?? "隐私模式";
  const displayedProfile = { ...profile, avatarUrl: editing && draft.avatar ? draft.avatar : profile.avatarUrl };

  return (
    <section className={cn(surface.shell, "relative z-30 overflow-visible rounded-[28px] border p-4 shadow-[var(--client-shadow)]")} data-testid="technician-info-card">
      <input accept="image/*" className="hidden" onChange={handleAvatarUpload} ref={avatarInputRef} type="file" />
      <IconButton className={cn(surface.metric, "absolute right-4 top-4 z-10")} icon={editing ? "close" : "edit"} label={editing ? "取消编辑" : "编辑信息卡"} onClick={() => { setEditing((current) => !current); setDraft(profileDraft(profile)); setError(""); }} />
      <div className="flex min-w-0 items-start gap-3 pr-12">
        <ProfileAvatar editing={editing} onSelect={() => avatarInputRef.current?.click()} profile={displayedProfile} />
        <div className="flex min-h-36 min-w-0 flex-1 flex-col">
          {editing ? (
            <input className="w-full bg-transparent text-[21px] font-black outline-none" onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} value={draft.displayName} />
          ) : (
            <h2 className="truncate text-[21px] font-black">{profile.displayName} <KycVerifiedBadge className="inline-flex align-middle" size="label" /></h2>
          )}
          <Badge className="mt-2 w-fit" tone="green">{profile.employmentType === "independent" ? "个人技师" : "店铺所属"}</Badge>
          <p className={cn(surface.muted, "mt-1 truncate text-xs font-bold")}>ID：{profile.publicId}</p>
          <div className={cn(surface.panel, "relative mt-auto rounded-[18px] border p-3")} data-testid="technician-profile-privacy-control">
            <div className="flex items-center justify-between gap-3">
              <button aria-expanded={privacyMenuOpen} className="min-w-0 flex-1 text-left" disabled={!privacyEnabled || saving} onClick={() => setPrivacyMenuOpen((current) => !current)} type="button"><p className={cn(surface.muted, "text-[11px] font-bold")}>隐私模式</p><strong className="mt-1 block truncate text-sm">{visibilityLabel}</strong></button>
              <ToggleSwitch ariaLabel="开启隐私模式" checked={privacyEnabled} disabled={saving} onChange={(enabled) => enabled ? setPrivacyConfirmOpen(true) : void persistVisibility("public")} size="md" />
            </div>
            <PrivacyModeConfirmDialog onCancel={() => setPrivacyConfirmOpen(false)} onConfirm={() => { setPrivacyConfirmOpen(false); void persistVisibility("privateAll", true); }} open={privacyConfirmOpen} />
            {privacyEnabled && privacyMenuOpen ? (
              <div className={cn(surface.shell, "absolute right-0 top-[calc(100%+8px)] z-[90] grid w-[min(320px,calc(100vw-48px))] gap-2 rounded-[20px] border p-2 shadow-[0_22px_48px_rgba(0,0,0,0.34)]")} data-testid="technician-privacy-options">
                {visibilityOptions.map((option) => <button className={cn(profile.visibility === option.value ? surface.chip : surface.panel, "rounded-[16px] border px-3 py-3 text-left")} disabled={saving} key={option.value} onClick={() => void persistVisibility(option.value)} type="button"><strong className="block text-sm">{option.label}</strong><span className={cn(surface.muted, "mt-1 block text-[11px]")}>{option.description}</span></button>)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={cn(surface.metric, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>从业年限</p><strong className="mt-1 block text-xl">{profile.yearsExperience} 年</strong></div>
        <div className={cn(surface.metric, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>服务城市</p><strong className="mt-1 block truncate text-xl">{profile.city}</strong></div>
      </div>

      <div className="my-4 h-px bg-[color:var(--client-line)]" />
      <h2 className="text-lg font-black">基础信息</h2>
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>年龄</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))} value={draft.age} /></label>
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>身高（cm）</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="decimal" onChange={(event) => setDraft((current) => ({ ...current, heightCm: event.target.value }))} value={draft.heightCm} /></label>
          </div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>语言能力</p><div className="mt-2 flex flex-wrap gap-1.5">{languageOptions.map((language) => <button className={cn(draft.languages.includes(language) ? surface.chip : surface.metric, "rounded-full border px-2.5 py-1 text-xs font-black")} key={language} onClick={() => toggleLanguage(language)} type="button">{language}</button>)}</div></div>
          <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>服务范围</span><textarea className="mt-2 min-h-16 w-full bg-transparent text-sm font-bold outline-none" onChange={(event) => setDraft((current) => ({ ...current, serviceAreasText: event.target.value }))} value={draft.serviceAreasText} /></label>
          <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>标签</span><textarea className="mt-2 min-h-16 w-full bg-transparent text-sm font-bold outline-none" onChange={(event) => setDraft((current) => ({ ...current, profileTagsText: event.target.value }))} value={draft.profileTagsText} /></label>
          <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>自我介绍</span><textarea className="mt-2 min-h-28 w-full bg-transparent text-sm font-bold leading-6 outline-none" onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} value={draft.bio} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>接单预算下限</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, bidBudgetMinJpy: event.target.value }))} value={draft.bidBudgetMinJpy} /></label>
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>接单预算上限</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, bidBudgetMaxJpy: event.target.value }))} value={draft.bidBudgetMaxJpy} /></label>
          </div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>支持支付方式</p><div className="mt-2 flex flex-wrap gap-1.5">{paymentOptions.map((method) => <button className={cn(draft.paymentMethods.includes(method.value) ? surface.chip : surface.metric, "rounded-full border px-2.5 py-1 text-xs font-black")} key={method.value} onClick={() => togglePaymentMethod(method.value)} type="button">{method.label}</button>)}</div></div>
          <label className={cn(surface.panel, "flex items-center justify-between rounded-[18px] border p-3 text-sm font-black")}><span>服务外国人</span><ToggleSwitch ariaLabel="服务外国人" checked={draft.canServeForeigners} onChange={(checked) => setDraft((current) => ({ ...current, canServeForeigners: checked }))} /></label>
          {error ? <p className="text-xs font-bold text-red-500" role="alert">技师资料保存失败：{error}</p> : null}
          <button className={cn(surface.chip, "w-full rounded-[18px] border px-4 py-3 text-sm font-black")} disabled={saving} onClick={() => void saveProfile()} type="button">{saving ? "保存中…" : "保存"}</button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>年龄 / 身高</p><strong className="mt-1 block text-sm">{profile.age ?? "未设置"} / {profile.heightCm ? `${profile.heightCm}cm` : "未设置"}</strong></div>
            <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>接待范围</p><strong className="mt-1 block text-sm">{profile.canServeForeigners ? "服务外国人" : "不服务外国人"}</strong></div>
          </div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>语言能力</p><div className="mt-2 flex flex-wrap gap-1.5">{profile.languages.map((language) => <span className={cn(surface.chip, "rounded-full border px-2.5 py-1 text-xs font-black")} key={language}>{language}</span>)}</div></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>服务范围</p><p className="mt-2 text-sm font-bold leading-6">{profile.serviceAreas.join("、") || "未设置"}</p></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>接单预算</p><strong className="mt-1 block text-sm">{profile.bidBudgetMinJpy === null && profile.bidBudgetMaxJpy === null ? "未设置" : `${profile.bidBudgetMinJpy?.toLocaleString("ja-JP") ?? "—"}–${profile.bidBudgetMaxJpy?.toLocaleString("ja-JP") ?? "—"} 円`}</strong></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>支持支付方式</p><p className="mt-2 text-sm font-bold leading-6">{profile.paymentMethods.map((value) => paymentOptions.find((item) => item.value === value)?.label ?? value).join("、") || "未设置"}</p></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>自我介绍</p><p className="mt-2 text-sm font-bold leading-6">{profile.bio || "未设置"}</p></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")} data-testid="technician-info-tags"><p className={cn(surface.muted, "text-xs font-bold")}>标签</p><div className="mt-2 flex flex-wrap gap-1.5">{profile.profileTags.map((tag) => <span className={cn(surface.chip, "rounded-full border px-2.5 py-1 text-xs font-black")} key={tag}>{tag}</span>)}</div></div>
          {error ? <p className="text-xs font-bold text-red-500" role="alert">技师资料保存失败：{error}</p> : null}
        </div>
      )}
    </section>
  );
}

function describeServiceError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录技师账号后再操作";
    if (error.status === 403) return "当前技师身份没有服务编辑权限";
    if (error.status === 409) return "服务状态已经变化，请重新加载";
  }
  return error instanceof Error ? error.message : "error.technician_service.failed";
}

function FormalTechnicianServicesPanel({ shopId, defaultCategoryId }: { shopId: number; defaultCategoryId: number | null }) {
  const [services, setServices] = useState<TechnicianServicePayload[]>([]);
  const [pricingMode, setPricingMode] = useState<ShopPricingMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", priceAmount: "", durationMinutes: "60", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [serviceResult, modeResult] = await Promise.all([
        pricingModeApi.listTechnicianServices(shopId, { page: 1, pageSize: 100 }),
        pricingModeApi.getShopPricingMode(shopId)
      ]);
      setServices(serviceResult.list);
      setPricingMode(modeResult.pricingMode);
    } catch (loadError) {
      setServices([]);
      setPricingMode(null);
      setError(describeServiceError(loadError));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);
  const openEditor = (service?: TechnicianServicePayload) => {
    setEditingId(service?.id ?? "new");
    setDeleteArmedId(null);
    setError("");
    setDraft(service ? { name: service.name, priceAmount: String(service.priceAmount), durationMinutes: String(service.durationMinutes), description: service.description ?? "" } : { name: "", priceAmount: "", durationMinutes: "60", description: "" });
  };
  const save = async () => {
    if (saving || editingId === null) return;
    const priceAmount = Number(draft.priceAmount);
    const durationMinutes = Number(draft.durationMinutes);
    if (!draft.name.trim() || !Number.isInteger(priceAmount) || priceAmount < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setError("请填写有效的服务名称、价格和时长");
      return;
    }
    const existing = typeof editingId === "number" ? services.find((item) => item.id === editingId) : null;
    const categoryId = existing?.categoryId ?? defaultCategoryId;
    if (!categoryId) { setError("当前没有可用的正式服务分类，暂时无法新增服务"); return; }
    setSaving(true);
    setError("");
    try {
      const body = { name: draft.name.trim(), priceAmount, durationMinutes, description: draft.description.trim() || null, categoryId, currency: "JPY" };
      const saved = existing ? await pricingModeApi.updateTechnicianService(shopId, existing.id, body) : await pricingModeApi.createTechnicianService(shopId, { ...body, sortOrder: services.length });
      setServices((current) => existing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setEditingId(null);
    } catch (saveError) {
      setError(describeServiceError(saveError));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (service: TechnicianServicePayload) => {
    if (saving) return;
    if (deleteArmedId !== service.id) { setDeleteArmedId(service.id); return; }
    setSaving(true);
    setError("");
    try {
      await pricingModeApi.deleteTechnicianService(shopId, service.id);
      setServices((current) => current.filter((item) => item.id !== service.id));
      setEditingId(null);
      setDeleteArmedId(null);
    } catch (deleteError) {
      setError(describeServiceError(deleteError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className={cn(surface.shell, "rounded-[28px] border p-6 text-center text-sm font-black")}>正在加载正式服务</section>;
  return (
    <section className={cn(surface.shell, "rounded-[28px] border p-4 shadow-[var(--client-shadow)]")}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-black">服务信息</h2><p className={cn(surface.muted, "mt-1 text-xs font-bold")}>店铺当前定价模式：{pricingMode === "technician" ? "技师定价" : pricingMode === "merchant" ? "店铺定价" : "未读取"}</p></div>
        {services.length < 5 ? <button className={cn(surface.chip, "rounded-full border px-3 py-2 text-xs font-black")} disabled={saving || editingId !== null} onClick={() => openEditor()} type="button">添加服务 {services.length}/5</button> : null}
      </div>
      {error ? <p className="mt-3 text-xs font-bold text-red-500" role="alert">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {services.length === 0 && editingId !== "new" ? <div className={cn(surface.panel, "rounded-[20px] border px-4 py-7 text-center text-sm font-bold")}>当前没有已保存的正式技师服务</div> : null}
        {[...services, ...(editingId === "new" ? [null] : [])].map((service) => {
          const editing = editingId === (service?.id ?? "new");
          return (
            <article className={cn(surface.panel, "relative rounded-[22px] border p-4")} data-testid="technician-service-card" key={service?.id ?? "new"}>
              {editing ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold"><span className={surface.muted}>服务名称</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none")} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-bold"><span className={surface.muted}>价格</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none")} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, priceAmount: event.target.value }))} value={draft.priceAmount} /></label>
                    <label className="block text-xs font-bold"><span className={surface.muted}>时长（分钟）</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none")} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} value={draft.durationMinutes} /></label>
                  </div>
                  <label className="block text-xs font-bold"><span className={surface.muted}>描述</span><textarea className={cn(surface.metric, "mt-1 min-h-20 w-full rounded-[14px] border px-3 py-2 text-sm font-bold outline-none")} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} /></label>
                  <div className="grid grid-cols-2 gap-2"><button className={cn(surface.metric, "rounded-[16px] border px-3 py-2.5 text-sm font-black")} disabled={saving} onClick={() => { setEditingId(null); setDeleteArmedId(null); }} type="button">取消</button><button className={cn(surface.chip, "rounded-[16px] border px-3 py-2.5 text-sm font-black")} disabled={saving} onClick={() => void save()} type="button">{saving ? "保存中…" : "保存"}</button></div>
                  {service ? <button className="w-full rounded-[16px] border border-red-500/40 px-3 py-2.5 text-sm font-black text-red-500" disabled={saving} onClick={() => void remove(service)} type="button">{deleteArmedId === service.id ? "再次点击确认删除" : "删除该服务"}</button> : null}
                </div>
              ) : service ? (
                <>
                  <IconButton className={cn(surface.metric, "absolute right-3 top-3 h-9 w-9")} icon="edit" label="编辑服务" onClick={() => openEditor(service)} />
                  <div className="pr-12"><p className={cn(surface.muted, "text-[11px] font-bold")}>服务名称</p><h3 className="mt-1 text-[17px] font-black">{service.name}</h3></div>
                  <div className="mt-3 grid grid-cols-2 gap-2"><div className={cn(surface.metric, "rounded-[16px] border p-3")}><p className={cn(surface.muted, "text-[11px] font-bold")}>价格</p><strong className="mt-1 block">{yen(service.priceAmount)}</strong></div><div className={cn(surface.metric, "rounded-[16px] border p-3")}><p className={cn(surface.muted, "text-[11px] font-bold")}>时长</p><strong className="mt-1 block">{service.durationMinutes} 分钟</strong></div></div>
                  <p className={cn(surface.muted, "mt-3 text-sm font-bold leading-6")}>{service.description || "未填写描述"}</p>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DataCenter({ profile, technician }: { profile: TechnicianSelfProfile; technician: CoreTechnicianDetail }) {
  const rating = Number(technician.reviewSummary.ratingAverage || 0);
  return (
    <div className="space-y-4">
      <section className={cn(surface.shell, "rounded-[28px] border p-4 shadow-[var(--client-shadow)]")}>
        <p className={cn(surface.muted, "text-xs font-black")}>服务数据</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[["服务评分", rating > 0 ? rating.toFixed(1) : "—"], ["评价数量", String(technician.reviewSummary.reviewCount)], ["从业年限", `${profile.yearsExperience} 年`], ["资料更新时间", new Date(profile.updatedAt).toLocaleDateString("zh-CN")]].map(([label, value]) => <div className={cn(surface.metric, "rounded-[18px] border p-3")} key={label}><p className={cn(surface.muted, "text-xs font-bold")}>{label}</p><strong className="mt-1 block text-xl">{value}</strong></div>)}
        </div>
      </section>
      <section className={cn(surface.panel, "rounded-[24px] border p-4 text-sm font-bold leading-6 text-[color:var(--client-muted)]")}>收入、工时与履约趋势仅在正式统计接口返回真实聚合数据后展示；当前页面不会生成演示统计。</section>
    </div>
  );
}

function TechnicianPortalContent({ initialSelfProfile, technician }: {
  initialSelfProfile: TechnicianSelfProfile;
  technician: CoreTechnicianDetail;
}) {
  const { view } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selfProfile, setSelfProfile] = useState(initialSelfProfile);
  const activeView = getPortalView(view);
  const meTab = getMeTab(searchParams.get("meTab"));
  const shop = technician.shop!;
  const technicianPortalConfig = roleBasedTabConfig.technician;
  const updateMeTab = (tab: TechnicianMeTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("meTab", tab);
    setSearchParams(next, { replace: true });
  };
  const defaultCategoryId = technician.services[0]?.category.id ?? null;

  return (
    <MobileShell navItems={technicianNavItems} navPanelStyle={activeView === "me" ? "plain" : "default"}>
      {activeView === "tasks" ? <TasksView profile={selfProfile} technician={technician} /> : null}
      {activeView === "me" ? (
        <>
          <FloatingHomeHeader panelClassName="relative overflow-hidden" stacked>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {selfProfile.avatarUrl ? <AvatarImage alt={selfProfile.displayName} className="h-12 w-12" src={selfProfile.avatarUrl} /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-lg font-black">{selfProfile.displayName.slice(0, 1)}</span>}
                <div className="min-w-0"><h1 className="truncate text-[22px] font-black tracking-[-0.04em]">{selfProfile.displayName}</h1><p className={cn(surface.muted, "mt-1 text-xs font-semibold")}>信息卡与数据中心</p></div>
              </div>
              <IconButton icon="settings" label="打开技师设置" to={technicianPortalConfig.settingsPath} />
            </div>
            <FeatureSegmentedTabs items={[{ label: "信息卡", value: "info" }, { label: "服务信息", value: "services" }, { label: "数据中心", value: "data" }]} onChange={(value) => updateMeTab(value as TechnicianMeTab)} value={meTab} variant="header" />
          </FloatingHomeHeader>
          <div className="space-y-4 px-4 pb-32 pt-1">
            {meTab === "info" ? <TechnicianInfoCard onSaved={setSelfProfile} profile={selfProfile} /> : null}
            {meTab === "services" ? <FormalTechnicianServicesPanel defaultCategoryId={defaultCategoryId} shopId={shop.id} /> : null}
            {meTab === "data" ? <DataCenter profile={selfProfile} technician={technician} /> : null}
          </div>
        </>
      ) : null}
    </MobileShell>
  );
}
