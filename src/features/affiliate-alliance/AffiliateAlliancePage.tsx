import { useCallback, useEffect, useMemo, useState } from "react";
import {
  affiliateAllianceApi,
  type AffiliateAlliance,
  type AffiliateAlliancePermissions,
  type AffiliateAllianceStatus
} from "../../api/affiliateAlliance";
import { ApiClientError } from "../../api/httpClient";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { useClientTheme } from "../../theme/ClientThemeProvider";

const controlClassName =
  "min-h-12 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 text-[14px] font-bold text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary-soft)]";

const statusLabels: Record<AffiliateAllianceStatus, string> = {
  active: "有效",
  suspended: "暂停",
  closed: "已关闭"
};

const permissionLabels: Array<[keyof AffiliateAlliancePermissions, string]> = [
  ["canClaimTasks", "领取任务"],
  ["canViewAllianceOverview", "查看联盟概览"],
  ["canViewMemberDetails", "查看成员详情"],
  ["canManageOwnSubordinates", "管理自己的下级"],
  ["canViewAllianceWallet", "查看联盟钱包"]
];

const parsePromoterShareBps = (value: string): number | null => {
  if (value.trim() === "") return null;
  const percent = Number(value);
  const bps = Math.round(percent * 100);
  if (
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100 ||
    Math.abs(percent * 100 - bps) > 0.000001
  ) {
    return null;
  }
  return bps;
};

export function AffiliateAlliancePage() {
  const { language } = useI18n();
  const { isNight } = useClientTheme();
  const t = (source: string) => translateText(source, language);
  const [alliance, setAlliance] = useState<AffiliateAlliance | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promoterSharePercent, setPromoterSharePercent] = useState("80");
  const promoterShareBps = useMemo(
    () => parsePromoterShareBps(promoterSharePercent),
    [promoterSharePercent]
  );

  const loadAlliance = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await affiliateAllianceApi.getMine();
      setAlliance(response.alliance);
    } catch (caught) {
      setAlliance(null);
      setError(
        caught instanceof ApiClientError && caught.status === 403
          ? "没有权限查看联盟"
          : "联盟读取失败"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlliance();
  }, [loadAlliance]);

  const createAlliance = async () => {
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || promoterShareBps === null) return;

    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const response = await affiliateAllianceApi.create({
        name: normalizedName,
        description: description.trim() || null,
        defaultPromoterShareBps: promoterShareBps
      });
      setAlliance(response.alliance);
      setSuccess("联盟已创建");
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 409) {
        await loadAlliance();
        setSuccess("联盟状态已刷新");
      } else if (caught instanceof ApiClientError && caught.status === 403) {
        setError("没有权限创建联盟");
      } else {
        setError("联盟创建失败，请稍后重试");
      }
    } finally {
      setCreating(false);
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
          info={t("管理当前联盟、成员权限与独立联盟钱包。")}
          infoLabel={t("查看联盟说明")}
          title={t("联盟")}
        />
      </div>

      <main className="space-y-4 px-4 pb-32 pt-4" data-no-i18n="true">
        {loading ? (
          <StatusPanel>{t("正在读取联盟")}</StatusPanel>
        ) : error && !alliance ? (
          <StatusPanel tone="error">
            <p>{t(error)}</p>
            <ActionButton className="mt-3" onClick={() => void loadAlliance()} tone="secondary">
              {t("重新加载")}
            </ActionButton>
          </StatusPanel>
        ) : alliance ? (
          <AllianceCharter
            alliance={alliance}
            language={language}
            success={success}
            t={t}
          />
        ) : (
          <AllianceCreateForm
            creating={creating}
            description={description}
            error={error}
            name={name}
            onCreate={() => void createAlliance()}
            onDescriptionChange={setDescription}
            onNameChange={setName}
            onPromoterShareChange={setPromoterSharePercent}
            promoterShareBps={promoterShareBps}
            promoterSharePercent={promoterSharePercent}
            t={t}
          />
        )}
      </main>
    </MobileShell>
  );
}

function AllianceCreateForm({
  creating,
  description,
  error,
  name,
  onCreate,
  onDescriptionChange,
  onNameChange,
  onPromoterShareChange,
  promoterShareBps,
  promoterSharePercent,
  t
}: {
  creating: boolean;
  description: string;
  error: string;
  name: string;
  onCreate: () => void;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPromoterShareChange: (value: string) => void;
  promoterShareBps: number | null;
  promoterSharePercent: string;
  t: (source: string) => string;
}) {
  const ratioBps = promoterShareBps ?? 0;
  const valid = name.trim().length >= 2 && promoterShareBps !== null;

  return (
    <>
      {error ? <StatusPanel tone="error">{t(error)}</StatusPanel> : null}
      <section className="overflow-hidden rounded-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] shadow-[0_22px_64px_rgba(0,0,0,0.10)]">
        <div className="border-b border-[color:var(--client-line)] px-5 pb-5 pt-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--client-primary)]">
            {t("联盟章程")}
          </p>
          <h2 className="mt-2 text-[24px] font-black leading-tight tracking-[-0.03em] text-[color:var(--client-text)]">
            {t("建立你的第一个联盟")}
          </h2>
          <p className="mt-3 text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]">
            {t("创建后，你将成为所有者，并获得独立的联盟 NDP 钱包。")}
          </p>
        </div>

        <div className="space-y-5 p-5">
          <Field label={t("联盟名称")}>
            <input
              className={controlClassName}
              maxLength={120}
              name="allianceName"
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={t("例如东京美容创作者联盟")}
              value={name}
            />
          </Field>
          <Field label={t("联盟介绍")}>
            <textarea
              className={cn(controlClassName, "min-h-24 resize-y py-3 leading-6")}
              maxLength={500}
              name="allianceDescription"
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={t("说明合作方向和联盟定位")}
              value={description}
            />
          </Field>
          <Field label={t("实际推广者比例")}>
            <div className="relative">
              <input
                className={cn(controlClassName, "pr-12 font-mono tabular-nums")}
                max={100}
                min={0}
                name="promoterSharePercent"
                onChange={(event) => onPromoterShareChange(event.target.value)}
                step="0.01"
                type="number"
                value={promoterSharePercent}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-sm font-black text-[color:var(--client-muted)]">
                %
              </span>
            </div>
          </Field>

          <RatioBand promoterShareBps={ratioBps} t={t} />

          <div className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 py-3 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]">
            {t("联盟创建无需 eKYC；联盟钱包提现时才需要完成 eKYC 并绑定同名银行账户。")}
          </div>

          <ActionButton className="w-full" disabled={!valid || creating} onClick={onCreate}>
            {creating ? t("创建中") : t("创建联盟")}
          </ActionButton>
        </div>
      </section>
    </>
  );
}

function AllianceCharter({
  alliance,
  language,
  success,
  t
}: {
  alliance: AffiliateAlliance;
  language: keyof typeof languageLocales;
  success: string;
  t: (source: string) => string;
}) {
  const locale = languageLocales[language];
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(alliance.updatedAt));

  return (
    <>
      {success ? <StatusPanel tone="success">{t(success)}</StatusPanel> : null}
      <section className="overflow-hidden rounded-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] shadow-[0_22px_64px_rgba(0,0,0,0.10)]">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--client-primary)]">
                {t("联盟章程")}
              </p>
              <h2 className="mt-2 break-words text-[26px] font-black leading-tight tracking-[-0.035em] text-[color:var(--client-text)]">
                {alliance.name}
              </h2>
            </div>
            <span className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-[10px] font-black text-[color:var(--client-text)]">
              {t(statusLabels[alliance.status])}
            </span>
          </div>
          {alliance.description ? (
            <p className="mt-3 text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]">
              {alliance.description}
            </p>
          ) : null}
          <div className="mt-5">
            <RatioBand promoterShareBps={alliance.defaultPromoterShareBps} t={t} />
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5">
        <SectionHeading title={t("联盟所有者")} />
        <div className="mt-4 flex items-center gap-3 rounded-[20px] bg-[color:var(--client-elevated)] p-4">
          {alliance.owner.avatarUrl ? (
            <img
              alt=""
              className="h-12 w-12 rounded-[16px] object-cover"
              src={alliance.owner.avatarUrl}
            />
          ) : (
            <div className="grid h-12 w-12 rounded-[16px] bg-[color:var(--client-primary)] text-lg font-black text-[color:var(--client-primary-contrast)]">
              <span className="m-auto">{alliance.owner.displayName.slice(0, 1)}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-[color:var(--client-text)]">
              {alliance.owner.displayName}
            </p>
            <p className="mt-1 text-[10px] font-bold text-[color:var(--client-muted)]">
              {t("NeeDo用户ID")} · <span className="font-mono tracking-[0.04em] text-[color:var(--client-primary)]">{alliance.owner.needoId}</span>
            </p>
          </div>
          <span className="rounded-full border border-[color:var(--client-line)] px-3 py-1 text-[10px] font-black text-[color:var(--client-muted)]">
            {t("所有者")}
          </span>
        </div>
      </section>

      <section className="rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5">
        <SectionHeading title={t("所有者权限")} />
        <div className="mt-4 grid gap-2">
          {permissionLabels.map(([key, label]) => {
            const allowed = alliance.membership.permissions[key];
            return (
              <div
                className="flex min-h-12 items-center justify-between gap-3 rounded-[17px] bg-[color:var(--client-elevated)] px-4"
                key={key}
              >
                <span className="text-[12px] font-bold text-[color:var(--client-text)]">
                  {t(label)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[9px] font-black",
                    allowed
                      ? "bg-[color:var(--client-primary-soft)] text-[color:var(--client-text)]"
                      : "bg-[color:var(--client-bg)] text-[color:var(--client-muted)]"
                  )}
                >
                  {t(allowed ? "已授权" : "未授权")}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5">
        <SectionHeading
          caption={t("与个人钱包分开记账，余额只来自正式联盟结算。")}
          title={t("联盟钱包")}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <WalletBalance
            label={t("可用余额")}
            value={`${new Intl.NumberFormat(locale).format(alliance.wallet.availableBalance)} NDP`}
          />
          <WalletBalance
            label={t("冻结余额")}
            value={`${new Intl.NumberFormat(locale).format(alliance.wallet.frozenBalance)} NDP`}
          />
        </div>
      </section>

      <p className="px-1 text-center text-[10px] font-semibold text-[color:var(--client-muted)]">
        {t("最后更新")} · {date}
      </p>
    </>
  );
}

function RatioBand({
  promoterShareBps,
  t
}: {
  promoterShareBps: number;
  t: (source: string) => string;
}) {
  const boundedPromoterBps = Math.min(10_000, Math.max(0, promoterShareBps));
  const allianceShareBps = 10_000 - boundedPromoterBps;
  const percentLabel = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

  return (
    <div aria-label={`${t("推广者")} ${percentLabel(boundedPromoterBps)}, ${t("联盟")} ${percentLabel(allianceShareBps)}`}>
      <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[11px] font-black tabular-nums text-[color:var(--client-text)]">
        <span>{t("推广者")} {percentLabel(boundedPromoterBps)}</span>
        <span>{t("联盟")} {percentLabel(allianceShareBps)}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[color:var(--client-bg)] ring-1 ring-[color:var(--client-line)]">
        <div
          className="h-full bg-[color:var(--client-primary)] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${boundedPromoterBps / 100}%` }}
        />
        <div
          className="h-full bg-[color:var(--client-accent)] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${allianceShareBps / 100}%` }}
        />
      </div>
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

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div>
      <h3 className="text-[16px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">
        {title}
      </h3>
      {caption ? (
        <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

function WalletBalance({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-[color:var(--client-elevated)] p-4">
      <p className="text-[10px] font-black text-[color:var(--client-muted)]">{label}</p>
      <p className="mt-2 break-all font-mono text-[16px] font-black tabular-nums text-[color:var(--client-text)]">
        {value}
      </p>
    </div>
  );
}

function StatusPanel({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  return (
    <section
      className={cn(
        "rounded-[22px] border px-4 py-4 text-sm font-bold leading-6",
        tone === "error"
          ? "border-[color:color-mix(in_srgb,var(--client-danger)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--client-danger)_9%,var(--client-surface))] text-[color:var(--client-danger)]"
          : tone === "success"
            ? "border-[color:color-mix(in_srgb,var(--client-primary)_38%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-text)]"
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
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--client-primary)]",
        tone === "primary"
          ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
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
