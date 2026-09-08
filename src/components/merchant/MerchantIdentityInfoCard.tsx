import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ApiClientError } from "../../api/httpClient";
import {
  merchantProfileApi,
  type MerchantIdentityProfile,
  type MerchantIdentityProfileUpdate,
  type MerchantProfileGender,
  type MerchantProfileVisibility
} from "../../features/core-read/merchantProfileApi";
import { copyTextToClipboard } from "../../lib/share";
import { cn } from "../../lib/utils";
import { walletApi, type WalletSummary } from "../../features/wallet/api";
import { formatWalletAmount, hasTestNdpWallet } from "../../features/wallet/presentation";
import { IconButton, StickyBottomBar } from "../client-ui/AppScaffold";
import { AvatarImage } from "../ui/AvatarImage";
import { KycVerifiedBadge } from "../ui/KycVerifiedBadge";
import { PrivacyModeConfirmDialog } from "../ui/PrivacyModeConfirmDialog";
import { ToggleSwitch } from "../ui/ToggleSwitch";

const languages = ["日本語", "中文", "English", "한국어", "ไทย", "Tiếng Việt", "Español"];
const genders: Array<{ value: MerchantProfileGender; label: string }> = [
  { value: "female", label: "女性" },
  { value: "male", label: "男性" },
  { value: "private", label: "不公开" }
];
const privacyOptions: Array<{ value: Exclude<MerchantProfileVisibility, "public">; label: string; description: string }> = [
  { value: "privateAll", label: "对所有人不可见", description: "仅本人可见" },
  { value: "limited", label: "对好友可见", description: "仅好友可以看到该账号信息" },
  { value: "network", label: "对好友以及关联人可见", description: "仅好友以及关联店铺和介绍关系中的关联人可见" }
];

const surface = {
  shell: "border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_20%,transparent),transparent_36%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_92%,var(--client-bg)),color-mix(in_srgb,var(--client-bg)_96%,black))] text-[color:var(--client-text)]",
  panel: "border-[color:color-mix(in_srgb,var(--client-line)_74%,var(--client-primary)_12%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_58%,var(--client-bg)_42%)]",
  metric: "border-[color:color-mix(in_srgb,var(--client-line)_72%,var(--client-primary)_14%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_50%,transparent)]",
  chip: "border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]",
  muted: "text-[color:var(--client-muted)]"
};

type Draft = {
  displayName: string;
  gender: MerchantProfileGender;
  age: string;
  heightCm: string;
  languages: string[];
  bio: string;
  visibility: MerchantProfileVisibility;
  avatarDataUrl?: string;
};

function toDraft(profile: MerchantIdentityProfile): Draft {
  return {
    displayName: profile.displayName,
    gender: profile.gender,
    age: profile.age === null ? "" : String(profile.age),
    heightCm: profile.heightCm === null ? "" : String(profile.heightCm),
    languages: [...profile.languages],
    bio: profile.bio ?? "",
    visibility: profile.visibility
  };
}

function nullableNumber(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized) : null;
}

function genderLabel(value: MerchantProfileGender) {
  return genders.find((option) => option.value === value)?.label ?? "不公开";
}

function profileError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前商户身份没有修改信息卡的权限";
    if (error.status === 422) return "请检查信息卡内容后重试";
  }
  return "商户信息卡保存失败，请稍后重试";
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid file"));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function privacySummary(visibility: MerchantProfileVisibility) {
  if (visibility === "public") return "公开可见";
  return privacyOptions.find((option) => option.value === visibility)?.label ?? "隐私模式";
}

export function MerchantIdentityInfoCard({ onEditingChange }: { onEditingChange?: (editing: boolean) => void }) {
  const [profile, setProfile] = useState<MerchantIdentityProfile | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const [privacyConfirmOpen, setPrivacyConfirmOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([merchantProfileApi.getMine(), walletApi.getMyWalletSummary()])
      .then(([next, wallet]) => { if (active) { setProfile(next); setDraft(toDraft(next)); setWalletSummary(wallet); } })
      .catch((loadError) => { if (active) setError(profileError(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);

  const startEditing = () => {
    if (!profile) return;
    setDraft(toDraft(profile));
    setError("");
    setEditing(true);
  };
  const copyNeedoId = async () => {
    if (!profile) return;
    setCopyStatus(await copyTextToClipboard(profile.publicId) ? "copied" : "failed");
  };
  const cancelEditing = () => {
    if (profile) setDraft(toDraft(profile));
    setEditing(false);
    setPrivacyMenuOpen(false);
    setPrivacyConfirmOpen(false);
    setError("");
  };
  const update = (patch: Partial<Draft>) => setDraft((current) => current ? { ...current, ...patch } : current);
  const toggleLanguage = (language: string) => update({
    languages: draft?.languages.includes(language)
      ? draft.languages.filter((item) => item !== language)
      : [...(draft?.languages ?? []), language]
  });
  const handleAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { update({ avatarDataUrl: await fileDataUrl(file) }); } catch { setError("头像读取失败，请重新选择"); }
  };
  const updatePrivacyEnabled = (enabled: boolean) => {
    if (enabled) { setPrivacyConfirmOpen(true); return; }
    update({ visibility: "public" });
    setPrivacyMenuOpen(false);
  };
  const confirmPrivacy = () => {
    update({ visibility: "privateAll" });
    setPrivacyConfirmOpen(false);
    setPrivacyMenuOpen(true);
  };
  const save = async () => {
    if (!draft || saving) return;
    const age = nullableNumber(draft.age);
    const heightCm = nullableNumber(draft.heightCm);
    if (!draft.displayName.trim() || (age !== null && (!Number.isInteger(age) || age < 18 || age > 150)) || (heightCm !== null && (heightCm < 30 || heightCm > 250))) {
      setError("请填写有效的姓名、年龄和身高");
      return;
    }
    const input: MerchantIdentityProfileUpdate = {
      displayName: draft.displayName.trim(),
      gender: draft.gender,
      age,
      heightCm,
      languages: draft.languages,
      bio: draft.bio.trim() || null,
      visibility: draft.visibility,
      ...(draft.avatarDataUrl ? { avatarDataUrl: draft.avatarDataUrl } : {})
    };
    setSaving(true);
    setError("");
    try {
      const saved = await merchantProfileApi.updateMine(input);
      setProfile(saved);
      setDraft(toDraft(saved));
      setEditing(false);
      setPrivacyMenuOpen(false);
    } catch (saveError) {
      setError(profileError(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section aria-live="polite" className={cn(surface.shell, "rounded-[28px] border p-8 text-center text-sm font-black")}>正在加载商户信息卡</section>;
  if (!profile || !draft || !walletSummary) return <section className={cn(surface.shell, "rounded-[28px] border p-8 text-center")} role="alert"><p className="text-sm font-black">{error || "商户信息卡不可用"}</p><button className="mt-4 rounded-full bg-[color:var(--client-primary)] px-5 py-2 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={() => setRevision((value) => value + 1)} type="button">重新加载</button></section>;

  const avatar = draft.avatarDataUrl ?? profile.avatarUrl;
  const visible = editing ? draft : toDraft(profile);
  const testNdp = hasTestNdpWallet(walletSummary)
    ? formatWalletAmount(walletSummary.testNdp.available)
    : null;
  const privacyControl = (
    <div className={cn(surface.panel, "relative z-30 rounded-[18px] border p-3")} data-testid="merchant-profile-privacy-control">
      <div className="flex items-center justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" disabled={!editing || visible.visibility === "public"} onClick={() => setPrivacyMenuOpen((open) => !open)} type="button"><p className={cn(surface.muted, "text-xs font-bold")}>隐私模式</p><strong className="mt-1 block truncate text-sm">{privacySummary(visible.visibility)}</strong></button>
        <ToggleSwitch ariaLabel="开启隐私模式" checked={visible.visibility !== "public"} disabled={!editing || saving} onChange={updatePrivacyEnabled} />
      </div>
      <PrivacyModeConfirmDialog onCancel={() => setPrivacyConfirmOpen(false)} onConfirm={confirmPrivacy} open={privacyConfirmOpen} />
      {editing && visible.visibility !== "public" && privacyMenuOpen ? <div className={cn(surface.shell, "absolute right-0 top-[calc(100%+8px)] z-[90] grid w-[min(320px,calc(100vw-48px))] gap-2 rounded-[20px] border p-2 shadow-[0_22px_48px_rgba(0,0,0,0.34)]")} data-testid="merchant-profile-privacy-options">{privacyOptions.map((option) => <button className={cn("rounded-[18px] border px-3 py-3 text-left", visible.visibility === option.value ? surface.chip : surface.panel)} key={option.value} onClick={() => { update({ visibility: option.value }); setPrivacyMenuOpen(false); }} type="button"><strong className="block text-sm">{option.label}</strong><span className="mt-1 block text-xs font-bold opacity-70">{option.description}</span></button>)}</div> : null}
    </div>
  );
  return (
    <>
      <section className={cn(surface.shell, "relative z-30 overflow-visible rounded-[28px] border p-4 shadow-[var(--client-shadow)]")} data-testid="merchant-identity-info-card">
        <IconButton
          className={cn("absolute right-4 top-4 z-10 shadow-[0_14px_30px_rgba(0,0,0,0.22)]", editing ? "border-red-400 bg-red-500 text-white" : surface.metric)}
          icon={editing ? "x" : "edit"}
          label={editing ? "取消编辑" : "编辑资料"}
          onClick={saving ? undefined : editing ? cancelEditing : startEditing}
        />
        <div className="flex min-w-0 items-start gap-3 pr-11">
          <div className="relative h-36 w-36 shrink-0">
            {avatar ? <AvatarImage alt={profile.displayName} className="h-36 w-36 rounded-[28px] border-[3px] border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] object-cover" src={avatar} /> : <span className="grid h-36 w-36 place-items-center rounded-[28px] border-[3px] border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] text-4xl font-black text-[color:var(--client-primary-strong)]">{profile.displayName.slice(0, 1)}</span>}
            {editing ? <><input accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatar} ref={avatarInputRef} type="file" /><IconButton className={cn(surface.metric, "absolute bottom-2 right-2 h-10 w-10 text-white")} icon="edit" label="更换头像" onClick={() => avatarInputRef.current?.click()} /></> : null}
          </div>
          <div className="flex min-h-36 min-w-0 flex-1 flex-col">
            {editing ? <input aria-label="商户姓名" className="min-w-0 border-0 bg-transparent text-lg font-black outline-none" onChange={(event) => update({ displayName: event.target.value })} value={draft.displayName} /> : <h1 className="break-words text-lg font-black leading-tight">{profile.displayName}<KycVerifiedBadge className="ml-1 inline-flex align-middle" size="label" /></h1>}
            <button aria-label="复制 NeeDo ID" className={cn(surface.muted, "mt-2 truncate text-left text-xs font-bold")} onClick={() => void copyNeedoId()} type="button">ID {profile.publicId}</button>
            {copyStatus ? <p aria-live="polite" className={cn(surface.muted, "mt-1 text-xs font-bold")} role="status">{copyStatus === "copied" ? "已复制" : "复制失败，请手动复制"}</p> : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2" data-testid="merchant-profile-metrics">
          <div className={cn(surface.metric, "min-w-0 rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-[11px] font-bold")}>NDP</p><strong className="mt-1 block truncate text-lg">{formatWalletAmount(walletSummary.ndp.available)}</strong>{testNdp !== null ? <span className={cn(surface.muted, "mt-1 block truncate text-[10px] font-bold")}>Test NDP {testNdp}</span> : null}</div>
          <div className={cn(surface.metric, "min-w-0 rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-[11px] font-bold")}>利用回数</p><strong className="mt-1 block text-lg">-</strong></div>
          <div className={cn(surface.metric, "min-w-0 rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-[11px] font-bold")}>评价</p><strong className="mt-1 block text-lg">-</strong></div>
        </div>

        <div className="my-4 h-px bg-[color:var(--client-line)]" />
        <h2 className="text-lg font-black">基础信息</h2>
        {editing ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>性别</p><div className="mt-2 flex flex-wrap gap-1">{genders.map((option) => <button className={cn("rounded-full border px-2 py-1 text-[11px] font-black", draft.gender === option.value ? surface.chip : surface.metric)} key={option.value} onClick={() => update({ gender: option.value })} type="button">{option.label}</button>)}</div></div>
              <label className={cn(surface.panel, "rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>年龄</span><input className="mt-1 h-9 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => update({ age: event.target.value })} value={draft.age} /></label>
              <label className={cn(surface.panel, "rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>身高（cm）</span><input className="mt-1 h-9 w-full bg-transparent text-sm font-black outline-none" inputMode="decimal" onChange={(event) => update({ heightCm: event.target.value })} value={draft.heightCm} /></label>
            </div>
            <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>语言能力</p><div className="mt-2 flex flex-wrap gap-1.5">{languages.map((language) => <button className={cn("rounded-full border px-2.5 py-1 text-xs font-black", draft.languages.includes(language) ? surface.chip : surface.metric)} key={language} onClick={() => toggleLanguage(language)} type="button">{language}</button>)}</div></div>
            <label className={cn(surface.panel, "block overflow-hidden rounded-[24px] border px-5 py-4")}><span className={cn(surface.muted, "text-xs font-bold")}>自我介绍</span><textarea className="mt-2 min-h-[132px] w-full resize-none bg-transparent text-sm font-bold leading-6 outline-none" onChange={(event) => update({ bio: event.target.value })} value={draft.bio} /></label>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">{[["性别", genderLabel(profile.gender)], ["年龄", profile.age ?? "未设置"], ["身高（cm）", profile.heightCm ?? "未设置"]].map(([label, value]) => <div className={cn(surface.panel, "rounded-[18px] border p-3")} key={label}><p className={cn(surface.muted, "text-xs font-bold")}>{label}</p><strong className="mt-1 block truncate text-sm">{value}</strong></div>)}</div>
            <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>语言能力</p><div className="mt-2 flex flex-wrap gap-1.5">{profile.languages.length ? profile.languages.map((language) => <span className={cn(surface.chip, "rounded-full border px-2.5 py-1 text-xs font-black")} key={language}>{language}</span>) : <span className={cn(surface.muted, "text-sm font-bold")}>未设置</span>}</div></div>
            <div className={cn(surface.panel, "overflow-hidden rounded-[24px] border px-5 py-4")}><p className={cn(surface.muted, "text-xs font-bold")}>自我介绍</p><p className={cn(surface.muted, "mt-2 text-sm leading-6")}>{profile.bio || "未设置"}</p></div>
          </div>
        )}
        <div className="mt-3">{privacyControl}</div>
        {error ? <p className="mt-3 text-sm font-black text-red-500" role="alert">{error}</p> : null}
      </section>
      {editing ? <StickyBottomBar><button className="w-full rounded-[22px] bg-[color:var(--client-primary)] px-5 py-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-60" disabled={saving} onClick={() => void save()} type="button">{saving ? "正在保存资料" : "保存并退出编辑模式"}</button></StickyBottomBar> : null}
    </>
  );
}
