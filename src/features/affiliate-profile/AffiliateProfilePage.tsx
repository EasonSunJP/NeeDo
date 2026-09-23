import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import {
  affiliateProfileApi,
  type AffiliateChannelPlatform,
  type AffiliateCooperationStatus,
  type AffiliateProfile,
  type AffiliateProfileChannel
} from "../../api/affiliateProfile";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { useClientTheme } from "../../theme/ClientThemeProvider";

const controlClassName =
  "min-h-12 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 text-[14px] font-bold text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]";

const platformLabels: Record<AffiliateChannelPlatform, string> = {
  x: "X",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  custom: "自定义平台"
};

const cooperationLabels: Record<AffiliateCooperationStatus, string> = {
  available: "可接受合作",
  selective: "选择性接受",
  unavailable: "暂不接受"
};

type ProfileDraft = {
  bio: string;
  strengths: string[];
  serviceAreas: string[];
  cooperationStatus: AffiliateCooperationStatus;
};

type ChannelDraft = {
  platform: AffiliateChannelPlatform;
  customLabel: string;
  homepageUrl: string;
  sortOrder: string;
};

const emptyChannelDraft = (): ChannelDraft => ({
  platform: "instagram",
  customLabel: "",
  homepageUrl: "",
  sortOrder: "0"
});

const profileDraft = (profile: AffiliateProfile): ProfileDraft => ({
  bio: profile.bio ?? "",
  strengths: profile.strengths,
  serviceAreas: profile.serviceAreas,
  cooperationStatus: profile.cooperationStatus
});

const channelDomain = (homepageUrl: string) => {
  try {
    return new URL(homepageUrl).hostname;
  } catch {
    return homepageUrl;
  }
};

export function AffiliateProfilePage() {
  const { language } = useI18n();
  const { isNight } = useClientTheme();
  const t = (source: string) => translateText(source, language);
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [versionConflict, setVersionConflict] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [strengthInput, setStrengthInput] = useState("");
  const [serviceAreaInput, setServiceAreaInput] = useState("");
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<number | null>(null);
  const [channelDraft, setChannelDraft] = useState<ChannelDraft>(emptyChannelDraft);

  const applyServerProfile = useCallback((nextProfile: AffiliateProfile) => {
    setProfile(nextProfile);
    setDraft(profileDraft(nextProfile));
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setVersionConflict(false);
    try {
      applyServerProfile(await affiliateProfileApi.getMine());
    } catch (caught) {
      setProfile(null);
      setDraft(null);
      setError(
        caught instanceof ApiClientError && caught.status === 403
          ? "没有权限查看联盟营销资料"
          : "联盟营销资料读取失败"
      );
    } finally {
      setLoading(false);
    }
  }, [applyServerProfile]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleMutationError = (caught: unknown, fallback: string) => {
    setSuccess("");
    if (caught instanceof ApiClientError && caught.status === 409) {
      setVersionConflict(true);
      setError("");
      return;
    }
    if (caught instanceof ApiClientError && caught.status === 403) {
      setError("没有权限编辑联盟营销资料");
      return;
    }
    setError(fallback);
  };

  const saveProfile = async () => {
    if (!profile || !draft) return;
    setBusyAction("profile");
    setError("");
    setSuccess("");
    setVersionConflict(false);
    try {
      applyServerProfile(
        await affiliateProfileApi.updateMine({
          expectedVersion: profile.version,
          bio: draft.bio.trim() || null,
          strengths: draft.strengths,
          serviceAreas: draft.serviceAreas,
          cooperationStatus: draft.cooperationStatus
        })
      );
      setSuccess("资料已保存");
    } catch (caught) {
      handleMutationError(caught, "资料保存失败，请稍后重试");
    } finally {
      setBusyAction("");
    }
  };

  const appendChip = (
    value: string,
    values: string[],
    update: (nextValues: string[]) => void,
    clear: () => void
  ) => {
    const normalized = value.trim();
    if (!normalized || values.includes(normalized) || values.length >= 10) return;
    update([...values, normalized]);
    clear();
  };

  const openNewChannel = () => {
    setEditingChannelId(null);
    setChannelDraft(emptyChannelDraft());
    setChannelFormOpen(true);
    setError("");
    setSuccess("");
  };

  const openChannelEdit = (channel: AffiliateProfileChannel) => {
    setEditingChannelId(channel.channelId);
    setChannelDraft({
      platform: channel.platform,
      customLabel: channel.customLabel ?? "",
      homepageUrl: channel.homepageUrl,
      sortOrder: String(channel.sortOrder)
    });
    setChannelFormOpen(true);
    setError("");
    setSuccess("");
  };

  const closeChannelForm = () => {
    setChannelFormOpen(false);
    setEditingChannelId(null);
    setChannelDraft(emptyChannelDraft());
  };

  const saveChannel = async () => {
    if (!profile || !channelDraft.homepageUrl.trim()) return;
    setBusyAction("channel");
    setError("");
    setSuccess("");
    setVersionConflict(false);
    const input = {
      expectedProfileVersion: profile.version,
      platform: channelDraft.platform,
      customLabel:
        channelDraft.platform === "custom" ? channelDraft.customLabel.trim() || null : null,
      homepageUrl: channelDraft.homepageUrl.trim(),
      sortOrder: Number.parseInt(channelDraft.sortOrder || "0", 10) || 0
    };
    try {
      const nextProfile = editingChannelId
        ? await affiliateProfileApi.updateChannel(editingChannelId, input)
        : await affiliateProfileApi.createChannel(input);
      applyServerProfile(nextProfile);
      closeChannelForm();
      setSuccess(editingChannelId ? "主页已更新" : "主页已添加");
    } catch (caught) {
      handleMutationError(caught, "外部主页保存失败，请检查链接后重试");
    } finally {
      setBusyAction("");
    }
  };

  const deleteChannel = async (channelId: number) => {
    if (!profile) return;
    setBusyAction(`delete:${channelId}`);
    setError("");
    setSuccess("");
    setVersionConflict(false);
    try {
      applyServerProfile(await affiliateProfileApi.deleteChannel(channelId, profile.version));
      setSuccess("主页已删除");
    } catch (caught) {
      handleMutationError(caught, "外部主页删除失败，请稍后重试");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <MobileShell
      className="business-cps-shell"
      navItems={businessNavItems}
      showTopEdgeMask={false}
    >
      <div data-no-i18n="true">
        <MobileFullscreenHeader
          dark={isNight}
          info={t("管理联盟营销公开资料和用户填写的外部社交平台主页。")}
          infoLabel={t("查看联盟营销资料说明")}
          title={t("联盟营销个人资料")}
        />
      </div>
      <main className="client-app-gutter space-y-4 pb-32 pt-4" data-no-i18n="true">
        {loading ? (
          <StatusPanel>{t("正在读取联盟营销资料")}</StatusPanel>
        ) : error && !profile ? (
          <StatusPanel tone="error">
            <p>{t(error)}</p>
            <ActionButton className="mt-3" onClick={() => void loadProfile()} tone="secondary">
              {t("重新加载")}
            </ActionButton>
          </StatusPanel>
        ) : profile && draft ? (
          <>
            <IdentityCard profile={profile} t={t} />

            {versionConflict ? (
              <StatusPanel tone="warning">
                <p>{t("资料已在其他页面更新，请重新加载后继续。")}</p>
                <ActionButton
                  className="mt-3"
                  onClick={() => void loadProfile()}
                  tone="secondary"
                >
                  {t("重新加载")}
                </ActionButton>
              </StatusPanel>
            ) : null}
            {error ? <StatusPanel tone="error">{t(error)}</StatusPanel> : null}
            {success ? <StatusPanel tone="success">{t(success)}</StatusPanel> : null}

            <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.10)]">
              <SectionHeading
                caption={t("商户和联盟组织会在合作前查看这些信息。")}
                title={t("合作资料")}
              />
              <div className="mt-5 space-y-5">
                <Field label={t("联盟营销简介")}>
                  <textarea
                    className={cn(controlClassName, "min-h-28 resize-y py-3 leading-6")}
                    maxLength={1000}
                    name="bio"
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, bio: event.target.value } : current
                      )
                    }
                    placeholder={t("介绍擅长的内容、服务类型和合作方式")}
                    value={draft.bio}
                  />
                  <span className="mt-1 block text-right text-[10px] font-bold text-[color:var(--client-muted)]">
                    {draft.bio.length}/1000
                  </span>
                </Field>

                <ChipEditor
                  addLabel={t("添加优势")}
                  inputName="strengthInput"
                  label={t("优势领域")}
                  onAdd={() =>
                    appendChip(
                      strengthInput,
                      draft.strengths,
                      (strengths) =>
                        setDraft((current) => (current ? { ...current, strengths } : current)),
                      () => setStrengthInput("")
                    )
                  }
                  onChange={setStrengthInput}
                  onRemove={(value) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            strengths: current.strengths.filter((item) => item !== value)
                          }
                        : current
                    )
                  }
                  placeholder={t("例如：美容、短视频")}
                  t={t}
                  value={strengthInput}
                  values={draft.strengths}
                />

                <ChipEditor
                  addLabel={t("添加地区")}
                  inputName="serviceAreaInput"
                  label={t("服务区域")}
                  onAdd={() =>
                    appendChip(
                      serviceAreaInput,
                      draft.serviceAreas,
                      (serviceAreas) =>
                        setDraft((current) => (current ? { ...current, serviceAreas } : current)),
                      () => setServiceAreaInput("")
                    )
                  }
                  onChange={setServiceAreaInput}
                  onRemove={(value) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            serviceAreas: current.serviceAreas.filter((item) => item !== value)
                          }
                        : current
                    )
                  }
                  placeholder={t("例如：東京都、神奈川県")}
                  t={t}
                  value={serviceAreaInput}
                  values={draft.serviceAreas}
                />

                <Field label={t("合作状态")}>
                  <select
                    className={controlClassName}
                    name="cooperationStatus"
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              cooperationStatus: event.target.value as AffiliateCooperationStatus
                            }
                          : current
                      )
                    }
                    value={draft.cooperationStatus}
                  >
                    {Object.entries(cooperationLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </Field>

                <ActionButton
                  className="w-full"
                  disabled={Boolean(busyAction) || versionConflict}
                  onClick={() => void saveProfile()}
                >
                  {busyAction === "profile" ? t("保存中") : t("保存资料")}
                </ActionButton>
              </div>
            </section>

            <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.10)]">
              <div className="flex items-start justify-between gap-3">
                <SectionHeading
                  caption={t("只展示用户填写的链接，不代表 NeeDo 已验证外部数据。")}
                  title={t("外部社交平台主页")}
                />
                {!channelFormOpen ? (
                  <ActionButton onClick={openNewChannel} tone="secondary">
                    {t("添加外部主页")}
                  </ActionButton>
                ) : null}
              </div>

              {channelFormOpen ? (
                <ChannelForm
                  busy={busyAction === "channel"}
                  draft={channelDraft}
                  editing={editingChannelId !== null}
                  onCancel={closeChannelForm}
                  onChange={setChannelDraft}
                  onSave={() => void saveChannel()}
                  t={t}
                />
              ) : null}

              <div className="mt-4 space-y-3">
                {profile.channels.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-[color:var(--client-line)] px-4 py-8 text-center">
                    <p className="text-sm font-black text-[color:var(--client-text)]">
                      {t("还没有添加外部主页")}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">
                      {t("可添加 X、Instagram、YouTube、TikTok 或自定义 HTTPS 主页。")}
                    </p>
                  </div>
                ) : (
                  profile.channels.map((channel) => (
                    <ChannelCard
                      busy={busyAction === `delete:${channel.channelId}`}
                      channel={channel}
                      key={channel.channelId}
                      language={language}
                      onDelete={() => void deleteChannel(channel.channelId)}
                      onEdit={() => openChannelEdit(channel)}
                      t={t}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </MobileShell>
  );
}

function IdentityCard({
  profile,
  t
}: {
  profile: AffiliateProfile;
  t: (source: string) => string;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] shadow-[0_22px_60px_rgba(0,0,0,0.12)]">
      <div className="flex items-center gap-4 p-5">
        <AvatarImage alt={profile.displayName} className="h-16 w-16 rounded-[22px] object-cover" src={profile.avatarUrl ?? undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-black text-[color:var(--client-text)]">
            {profile.displayName}
          </p>
          <span className="mt-2 inline-flex rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]">
            {t("联盟营销身份已开启")}
          </span>
        </div>
      </div>
      <div className="border-t border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--client-muted)]">
              {t("NeeDo用户ID")}
            </span>
            <p className="mt-1 truncate font-mono text-[15px] font-black tracking-[0.08em] text-[color:var(--client-text)]">
              {profile.needoId}
            </p>
            <input
              aria-label={t("NeeDo用户ID")}
              className="sr-only"
              name="needoId"
              readOnly
              value={profile.needoId}
            />
          </div>
          <span className="shrink-0 rounded-full border border-[color:var(--client-line)] px-3 py-1 text-[10px] font-black text-[color:var(--client-muted)]">
            {t("公开账号标识")}
          </span>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-black text-[color:var(--client-text)]">{title}</h2>
      <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]">
        {caption}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-black text-[color:var(--client-text)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ChipEditor({
  addLabel,
  inputName,
  label,
  onAdd,
  onChange,
  onRemove,
  placeholder,
  t,
  value,
  values
}: {
  addLabel: string;
  inputName: string;
  label: string;
  onAdd: () => void;
  onChange: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
  t: (source: string) => string;
  value: string;
  values: string[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[12px] font-black text-[color:var(--client-text)]">{label}</span>
        <span className="text-[10px] font-bold text-[color:var(--client-muted)]">
          {values.length}/10
        </span>
      </div>
      {values.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {values.map((item) => (
            <span
              className="inline-flex items-center gap-2 rounded-full bg-[color:var(--client-primary-soft)] py-1.5 pl-3 pr-1.5 text-xs font-black text-[color:var(--client-text)]"
              key={item}
            >
              {item}
              <button
                aria-label={`${t("删除")} ${item}`}
                className="grid h-6 w-6 place-items-center rounded-full text-[color:var(--client-muted)] hover:bg-[color:var(--client-surface)]"
                onClick={() => onRemove(item)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          className={controlClassName}
          disabled={values.length >= 10}
          maxLength={80}
          name={inputName}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          value={value}
        />
        <ActionButton disabled={values.length >= 10 || !value.trim()} onClick={onAdd} tone="secondary">
          {addLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function ChannelForm({
  busy,
  draft,
  editing,
  onCancel,
  onChange,
  onSave,
  t
}: {
  busy: boolean;
  draft: ChannelDraft;
  editing: boolean;
  onCancel: () => void;
  onChange: (draft: ChannelDraft) => void;
  onSave: () => void;
  t: (source: string) => string;
}) {
  return (
    <div className="mt-4 space-y-4 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-4">
      <Field label={t("平台")}>
        <select
          className={controlClassName}
          name="channelPlatform"
          onChange={(event) =>
            onChange({
              ...draft,
              platform: event.target.value as AffiliateChannelPlatform,
              customLabel: event.target.value === "custom" ? draft.customLabel : ""
            })
          }
          value={draft.platform}
        >
          {Object.entries(platformLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </Field>
      {draft.platform === "custom" ? (
        <Field label={t("自定义平台名称")}>
          <input
            className={controlClassName}
            maxLength={60}
            name="channelCustomLabel"
            onChange={(event) => onChange({ ...draft, customLabel: event.target.value })}
            placeholder={t("例如：个人博客")}
            value={draft.customLabel}
          />
        </Field>
      ) : null}
      <Field label={t("HTTPS主页链接")}>
        <input
          className={controlClassName}
          maxLength={500}
          name="channelHomepageUrl"
          onChange={(event) => onChange({ ...draft, homepageUrl: event.target.value })}
          placeholder="https://"
          type="url"
          value={draft.homepageUrl}
        />
      </Field>
      <Field label={t("显示顺序")}>
        <input
          className={controlClassName}
          max={1000}
          min={0}
          name="channelSortOrder"
          onChange={(event) => onChange({ ...draft, sortOrder: event.target.value })}
          type="number"
          value={draft.sortOrder}
        />
      </Field>
      <div className="flex gap-2">
        <ActionButton className="flex-1" onClick={onCancel} tone="secondary">
          {t("取消")}
        </ActionButton>
        <ActionButton
          className="flex-1"
          disabled={
            busy ||
            !draft.homepageUrl.trim() ||
            (draft.platform === "custom" && !draft.customLabel.trim())
          }
          onClick={onSave}
        >
          {busy ? t("保存中") : editing ? t("更新主页") : t("保存主页")}
        </ActionButton>
      </div>
    </div>
  );
}

function ChannelCard({
  busy,
  channel,
  language,
  onDelete,
  onEdit,
  t
}: {
  busy: boolean;
  channel: AffiliateProfileChannel;
  language: keyof typeof languageLocales;
  onDelete: () => void;
  onEdit: () => void;
  t: (source: string) => string;
}) {
  const platform = channel.customLabel ?? t(platformLabels[channel.platform]);
  return (
    <article className="rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-[color:var(--client-text)]">{platform}</span>
            <span className="rounded-full border border-[color:var(--client-line)] px-2 py-0.5 text-[9px] font-black text-[color:var(--client-muted)]">
              {t("用户填写的外部主页")}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">
            {channelDomain(channel.homepageUrl)}
          </p>
        </div>
        <span className="shrink-0 text-[9px] font-semibold text-[color:var(--client-muted)]">
          {new Intl.DateTimeFormat(languageLocales[language], {
            dateStyle: "medium"
          }).format(new Date(channel.updatedAt))}
        </span>
      </div>
      <a
        className="mt-3 block break-all rounded-[14px] bg-[color:var(--client-surface)] px-3 py-2 text-[11px] font-bold leading-5 text-[color:var(--client-primary)] underline decoration-transparent underline-offset-2 hover:decoration-current"
        href={channel.homepageUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {channel.homepageUrl}
      </a>
      <div className="mt-3 flex justify-end gap-2">
        <ActionButton onClick={onEdit} tone="secondary">
          {t("编辑")}
        </ActionButton>
        <ActionButton disabled={busy} onClick={onDelete} tone="danger">
          {busy ? t("删除中") : t("删除")}
        </ActionButton>
      </div>
    </article>
  );
}

function StatusPanel({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error" | "success" | "warning";
}) {
  return (
    <section
      className={cn(
        "rounded-[22px] border px-4 py-4 text-sm font-bold leading-6",
        tone === "error"
          ? "border-[color:color-mix(in_srgb,var(--client-danger)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--client-danger)_9%,var(--client-surface))] text-[color:var(--client-danger)]"
          : tone === "success"
            ? "border-[color:color-mix(in_srgb,var(--client-primary)_38%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-text)]"
            : tone === "warning"
              ? "border-amber-400/45 bg-amber-400/10 text-[color:var(--client-text)]"
              : "border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-[color:var(--client-muted)]"
      )}
    >
      {children}
    </section>
  );
}

function ActionButton({
  children,
  className,
  disabled = false,
  onClick,
  tone = "primary"
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-4 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--client-primary)]",
        tone === "primary"
          ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
          : tone === "danger"
            ? "border border-[color:color-mix(in_srgb,var(--client-danger)_42%,transparent)] text-[color:var(--client-danger)]"
            : "border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-[color:var(--client-text)]",
        disabled ? "cursor-not-allowed opacity-45" : "hover:-translate-y-0.5",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
