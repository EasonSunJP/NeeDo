import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DEFAULT_LOGIN_LOGO_URL, DEFAULT_REQUEST_BUTTON_URL } from "../platform-settings/defaultBrandMedia";
import { useI18n } from "../../i18n/I18nProvider";
import { adminSystemSettingsApi } from "./api";
import { adminSystemSettingsText } from "./i18n";
import type { BasicSettingsInput, LoginVerificationRule, OperationsPlatformSettings, UploadedBrandMedia } from "./types";

type Props = {
  settings: OperationsPlatformSettings;
  canWrite: boolean;
  canUpload: boolean;
  canActivateMedia: boolean;
  labels: { conflict: string; dirty: string; projectOnly: string; save: string; saved: string; saving: string; unavailable: string };
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
};

type Draft = Omit<BasicSettingsInput, "expectedVersion">;

const verificationRules: Array<{ value: LoginVerificationRule; label: string }> = [
  { value: "first_login", label: "仅初次登录" },
  { value: "monthly_first", label: "每月初次登录" },
  { value: "every_login", label: "每次登录" }
];

function draftFrom(settings: OperationsPlatformSettings): Draft {
  return {
    siteEnabled: settings.siteEnabled,
    selfRegistrationEnabled: settings.selfRegistrationEnabled,
    googleLoginEnabled: settings.googleLoginEnabled,
    passwordLoginOtpEnabled: settings.passwordLoginOtpEnabled,
    passwordLoginOtpRule: settings.passwordLoginOtpRule,
    passwordLoginOtpOnNewIp: settings.passwordLoginOtpOnNewIp,
    anytimeServiceTestEnabled: settings.anytimeServiceTestEnabled,
    overdueAppointmentGateEnabled: settings.overdueAppointmentGateEnabled,
    loginLogoMediaPublicId: settings.loginLogo?.publicId ?? null,
    requestButtonMediaPublicId: settings.requestButton?.publicId ?? null
  };
}

function SettingToggle({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-5 rounded-xl border border-line bg-white p-4">
      <div><p className="font-black">{title}</p><p className="mt-1 text-sm font-semibold text-ink/55">{description}</p></div>
      <AdminToggleSwitch ariaLabel={title} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export function BasicSettingsTab({ settings, canWrite, canUpload, canActivateMedia, labels, onDirtyChange, onSaved }: Props) {
  const { language } = useI18n();
  const t = (source: string) => adminSystemSettingsText(source, language);
  const initial = useMemo(() => draftFrom(settings), [settings]);
  const [draft, setDraft] = useState(initial);
  const [uploaded, setUploaded] = useState<Partial<Record<"loginLogo" | "requestButton", UploadedBrandMedia>>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const mediaChanged = draft.loginLogoMediaPublicId !== initial.loginLogoMediaPublicId || draft.requestButtonMediaPublicId !== initial.requestButtonMediaPublicId;

  useEffect(() => { setDraft(initial); setUploaded({}); setState("idle"); }, [initial]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const upload = async (field: "loginLogo" | "requestButton", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setState("idle");
    try {
      const media = await adminSystemSettingsApi.uploadBrandImage(file, field === "loginLogo" ? "NeeDo login logo" : "NeeDo Request button");
      setUploaded((current) => ({ ...current, [field]: media }));
      update(field === "loginLogo" ? "loginLogoMediaPublicId" : "requestButtonMediaPublicId", media.publicId);
    } catch {
      setState("error");
    }
  };

  const save = async () => {
    if (!dirty || !canWrite || (mediaChanged && !canActivateMedia)) return;
    setState("saving");
    try {
      await adminSystemSettingsApi.updateBasic({ expectedVersion: settings.version, ...draft });
      setState("saved");
      await onSaved();
    } catch (error) {
      setState(error instanceof ApiClientError && error.status === 409 ? "conflict" : "error");
    }
  };

  const mediaRows = [
    { key: "loginLogo" as const, title: t("登录页 LOGO"), description: t("当前图片显示在登录页中央标识。"), current: settings.loginLogo, defaultUrl: DEFAULT_LOGIN_LOGO_URL, publicIdKey: "loginLogoMediaPublicId" as const },
    { key: "requestButton" as const, title: t("Request 中央按钮图片"), description: t("当前图片显示在主导航中央；颜色会跟随每位用户的 UI 主题自动适配。"), current: settings.requestButton, defaultUrl: DEFAULT_REQUEST_BUTTON_URL, publicIdKey: "requestButtonMediaPublicId" as const }
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 xl:grid-cols-2">
        <SettingToggle title={t("站点开关")} description={t("关闭后客户端显示维护页，运营后台登录与设置仍可访问。")} checked={draft.siteEnabled} disabled={!canWrite} onChange={(value) => update("siteEnabled", value)} />
        <SettingToggle title={t("新用户注册入口")} description={t("只控制公开自助注册；运营后台仍可创建用户。")} checked={draft.selfRegistrationEnabled} disabled={!canWrite} onChange={(value) => update("selfRegistrationEnabled", value)} />
      </section>

      <SettingToggle
        title={t("随时服务测试")}
        description={t("开启后可忽略预约时间开始和完成服务，仅用于测试；关闭后最多提前 30 分钟开始，并须在服务结束时间后完成。")}
        checked={draft.anytimeServiceTestEnabled}
        disabled={!canWrite}
        onChange={(value) => update("anytimeServiceTestEnabled", value)}
      />
      <SettingToggle
        title={t("过期预约未处理门禁")}
        description={t("开启后，用户或技师开始较晚服务前，必须先处置本人参与的更早过期未完成预约。关闭时不阻断开始服务，也不会自动结算或评分。")}
        checked={draft.overdueAppointmentGateEnabled}
        disabled={!canWrite}
        onChange={(value) => update("overdueAppointmentGateEnabled", value)}
      />

      <section className="rounded-2xl border border-line bg-paper p-5">
        <h2 className="text-lg font-black">{t("登录方法")}</h2>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <SettingToggle title="Google" description={t("控制登录页 Google 入口。")} checked={draft.googleLoginEnabled} disabled={!canWrite} onChange={(value) => update("googleLoginEnabled", value)} />
          {settings.loginProviderProjects.map((provider) => (
            <div className="flex items-center justify-between rounded-xl border border-line bg-white p-4" key={provider.code}>
              <div><p className="font-black uppercase">{provider.code}</p><p className="mt-1 text-sm text-ink/55">{labels.projectOnly}</p></div>
              <Badge tone="neutral">{labels.unavailable}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5">
        <SettingToggle title={t("密码登录邮箱验证码")} description={t("开启后，验证码发送到登录邮箱，并在登录页输入六位验证码。")} checked={draft.passwordLoginOtpEnabled} disabled={!canWrite} onChange={(value) => update("passwordLoginOtpEnabled", value)} />
        <fieldset className="mt-4 grid gap-3 md:grid-cols-3" disabled={!canWrite || !draft.passwordLoginOtpEnabled}>
          <legend className="mb-2 text-sm font-black">{t("时间规则（单选）")}</legend>
          {verificationRules.map((rule) => (
            <label className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 text-sm font-bold" key={rule.value}>
              <input checked={draft.passwordLoginOtpRule === rule.value} name="password-login-otp-rule" onChange={() => update("passwordLoginOtpRule", rule.value)} type="radio" />
              {t(rule.label)}
            </label>
          ))}
        </fieldset>
        <label className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-white p-4 text-sm font-bold">
          <input checked={draft.passwordLoginOtpOnNewIp} disabled={!canWrite || !draft.passwordLoginOtpEnabled} onChange={(event) => update("passwordLoginOtpOnNewIp", event.target.checked)} type="checkbox" />
          {t("新 IP 地址登录时也发送验证码（可与上方时间规则组合）")}
        </label>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {mediaRows.map((row) => {
          const pendingMedia = uploaded[row.key];
          const currentUrl = row.current?.url ?? row.defaultUrl;
          const previewUrl = pendingMedia?.url ?? currentUrl;
          const status = pendingMedia ? t("待发布") : row.current ? t("当前启用") : t("系统默认 · 当前启用");
          return (
            <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm" key={row.key}>
              <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div>
                  <h2 className="font-black text-ink">{row.title}</h2>
                  <p className="mt-1 text-xs font-bold text-ink/45">{row.description}</p>
                </div>
                <Badge tone={pendingMedia ? "yellow" : "green"}>{status}</Badge>
              </div>
              <div className="bg-paper p-5">
                <div className="grid min-h-40 place-items-center overflow-hidden rounded-lg border border-line bg-white p-5 shadow-inner">
                  {row.key === "loginLogo" ? (
                    <div className="client-shell client-theme-dark-green !min-h-0 bg-transparent p-3" style={{ display: "grid", placeItems: "center", width: "100%" }}>
                      <div className="needo-login-logo h-[92px] w-[92px] overflow-hidden rounded-[26px]">
                        <img alt={row.title} className="needo-login-logo__mark h-full w-full object-cover" src={previewUrl} />
                      </div>
                    </div>
                  ) : (
                    <div className="client-shell client-theme-cool-black-gray !min-h-0 bg-transparent p-3" style={{ display: "grid", placeItems: "center", width: "100%" }}>
                      <div className="client-bottom-nav !w-[280px] max-w-full rounded-[24px] bg-[color:var(--client-surface)] py-2" style={{ display: "flex", justifyContent: "center" }}>
                        <img alt={row.title} className="client-featured-nav-image" src={previewUrl} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label aria-disabled={!canUpload} className={`focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition ${canUpload ? "cursor-pointer hover:border-moss hover:text-moss" : "cursor-not-allowed opacity-60"}`}>
                      <span aria-hidden="true">↑</span>
                      {t("选择新图片")}
                      <input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!canUpload} onChange={(event) => void upload(row.key, event)} type="file" />
                    </label>
                    <a className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:border-moss hover:text-moss" download href={currentUrl}>
                      <span aria-hidden="true">↓</span>
                      {t("下载当前图片")}
                    </a>
                  </div>
                  <p className="text-xs font-bold text-ink/45">{t("支持 PNG、JPG、WebP；发布后生效。")}</p>
                </div>
                {pendingMedia ? <p className="mt-3 rounded-lg bg-lemon/20 px-3 py-2 text-xs font-bold text-ink/65">{t("新图片已上传；当前线上图片会保持到发布完成。")}</p> : null}
                {!canUpload ? <p className="mt-2 text-xs font-bold text-coral">{t("缺少媒体上传权限")}</p> : null}
                {mediaChanged && !canActivateMedia ? <p className="mt-2 text-xs font-bold text-coral">{t("缺少品牌媒体启用权限，当前图片不能发布。")}</p> : null}
              </div>
            </div>
          );
        })}
      </section>

      {state === "conflict" ? <p className="rounded-xl bg-lemon/25 p-3 text-sm font-bold">{labels.conflict}</p> : null}
      {state === "error" ? <p className="rounded-xl bg-coral/15 p-3 text-sm font-bold text-coral">{t("保存或上传失败，请重试。")}</p> : null}
      {state === "saved" ? <p className="rounded-xl bg-mint/20 p-3 text-sm font-bold">{labels.saved}</p> : null}
      <PermissionGate permission="backoffice:system-settings:write">
        <Button disabled={!dirty || state === "saving" || (mediaChanged && !canActivateMedia)} onClick={() => void save()}>{state === "saving" ? labels.saving : labels.save}</Button>
      </PermissionGate>
    </div>
  );
}
