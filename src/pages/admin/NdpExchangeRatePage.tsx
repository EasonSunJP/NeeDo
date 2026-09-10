import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionGate } from "../../auth/PermissionGate";
import { ApiClientError } from "../../api/httpClient";
import {
  ndpExchangeRateApi,
  type NdpExchangeRateOverview,
  type NdpExchangeRatePublishInput,
  type NdpExchangeRateRecord
} from "../../api/ndpExchangeRate";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateTextForContext } from "../../i18n/translations";

const pageSize = 20;
const maxInteger = 2_147_483_647;
const versionConflictCode = 40963;
const idempotencyConflictCode = 40961;

type LoadStatus = "loading" | "ready" | "error";
type MutationStatus = "idle" | "saving" | "ambiguous";
type TemporalState = "current" | "scheduled" | "historical";
type ProjectionLock = "applied" | "conflict" | null;

type Draft = {
  ndpUnits: string;
  jpyUnits: string;
  effectiveFrom: string;
  reason: string;
};

type ConfirmedCommand = {
  input: Omit<NdpExchangeRatePublishInput, "idempotencyKey">;
  fingerprint: string;
};

const emptyDraft: Draft = { ndpUnits: "", jpyUnits: "", effectiveFrom: "", reason: "" };

function createIdempotencyKey() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeReason(value: string) {
  return value.normalize("NFKC").trim();
}

export function classifyNdpExchangeRate(
  rate: NdpExchangeRateRecord,
  evaluatedAt: string
): TemporalState {
  const evaluatedTime = Date.parse(evaluatedAt);
  const startsAt = Date.parse(rate.effectiveFrom);
  const endsAt = rate.effectiveTo ? Date.parse(rate.effectiveTo) : Number.POSITIVE_INFINITY;
  if (startsAt > evaluatedTime) return "scheduled";
  if (startsAt <= evaluatedTime && evaluatedTime < endsAt) return "current";
  return "historical";
}

function toPublishCommand(draft: Draft, latestVersion: number): ConfirmedCommand | string {
  const ndpUnits = Number(draft.ndpUnits);
  const jpyUnits = Number(draft.jpyUnits);
  if (!/^[1-9]\d*$/.test(draft.ndpUnits) || !Number.isInteger(ndpUnits) || ndpUnits > maxInteger) {
    return "NDP 数量必须是范围内的正整数";
  }
  if (!/^[1-9]\d*$/.test(draft.jpyUnits) || !Number.isInteger(jpyUnits) || jpyUnits > maxInteger) {
    return "JPY 数量必须是范围内的正整数";
  }
  const localTime = new Date(draft.effectiveFrom);
  if (!draft.effectiveFrom || !Number.isFinite(localTime.getTime())) {
    return "请输入有效的生效时间";
  }
  const reason = normalizeReason(draft.reason);
  const reasonLength = Array.from(reason).length;
  if (reasonLength < 1 || reasonLength > 500 || !/[\p{L}\p{N}\p{P}\p{S}]/u.test(reason)) {
    return "设置理由必须包含可见文字，且不超过 500 个字符";
  }
  const input = {
    ndpUnits,
    jpyUnits,
    expectedVersion: latestVersion,
    effectiveFrom: localTime.toISOString(),
    reason
  };
  return { input, fingerprint: JSON.stringify(input) };
}

function equation(rate: Pick<NdpExchangeRateRecord, "ndpUnits" | "jpyUnits">) {
  return `${rate.ndpUnits} NDP = ${rate.jpyUnits} JPY`;
}

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(locale) : value;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message.startsWith("error.") ? "请求失败，请稍后重试" : error.message;
  }
  return error instanceof Error && error.message ? error.message : "请求失败，请稍后重试";
}

function RateSummaryCard({
  label,
  rate,
  empty,
  locale
}: {
  label: string;
  rate: NdpExchangeRateRecord | null;
  empty: string;
  locale: string;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-panel" data-admin-surface="summary">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-ink/50">{label}</h2>
        {rate ? <Badge tone="blue">v{rate.version}</Badge> : null}
      </div>
      {rate ? (
        <>
          <p className="font-mono text-2xl font-black tracking-tight text-ink">{equation(rate)}</p>
          <p className="mt-3 text-sm font-semibold text-ink/50">生效：{formatDate(rate.effectiveFrom, locale)}</p>
          <p className="mt-1 text-sm font-semibold text-ink/50">结束：{formatDate(rate.effectiveTo, locale)}</p>
          <p className="mt-3 text-sm font-semibold text-ink/70">{rate.reason}</p>
        </>
      ) : <p className="py-6 text-sm font-semibold text-ink/50">{empty}</p>}
    </section>
  );
}

export function NdpExchangeRatePage() {
  const { language } = useOptionalI18n();
  const locale = languageLocales[language];
  const [overview, setOverview] = useState<NdpExchangeRateOverview | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [draftError, setDraftError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmedCommand | null>(null);
  const [mutationStatus, setMutationStatus] = useState<MutationStatus>("idle");
  const [mutationError, setMutationError] = useState("");
  const [projectionLock, setProjectionLock] = useState<ProjectionLock>(null);
  const [projectionError, setProjectionError] = useState("");
  const retainedCommand = useRef<{ fingerprint: string; key: string } | null>(null);
  const requestId = useRef(0);
  const evaluatedAtAnchor = useRef<string | null>(null);
  const translate = (source: string) =>
    translateTextForContext(source, language, { portal: "admin" });
  const translateTemplate = (source: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (text, [key, value]) => text.replace(`{${key}}`, value),
      translate(source)
    );

  const loadOverview = useCallback(async (
    nextPage: number,
    fresh: boolean,
    projectionOnly = false,
    releaseCommandLock = false
  ) => {
    if (projectionLock !== null && !releaseCommandLock) return false;
    const currentRequest = ++requestId.current;
    if (!overview || fresh) setLoadStatus("loading");
    setLoadError("");
    try {
      const result = await ndpExchangeRateApi.getOverview({
        page: nextPage,
        pageSize,
        ...(fresh || !evaluatedAtAnchor.current ? {} : { at: evaluatedAtAnchor.current })
      });
      if (currentRequest !== requestId.current) return;
      setOverview(result);
      setPage(result.history.page);
      if (fresh || !evaluatedAtAnchor.current) evaluatedAtAnchor.current = result.evaluatedAt;
      setLoadStatus("ready");
      if (releaseCommandLock) {
        setProjectionLock(null);
        setProjectionError("");
        setMutationStatus("idle");
      }
      return true;
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      if (projectionOnly) {
        setLoadStatus("ready");
        setProjectionError(errorMessage(error));
      } else {
        setLoadStatus("error");
        setLoadError(errorMessage(error));
      }
      return false;
    }
  }, [overview, projectionLock]);

  useEffect(() => {
    void loadOverview(1, true);
  // The initial request must be a fresh server-time evaluation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil((overview?.history.total ?? 0) / pageSize));
  const history = overview?.history.list ?? [];
  const canPrepareCommand = Boolean(overview && projectionLock === null && mutationStatus !== "saving");

  const openForm = () => {
    setFormOpen(true);
    setDraftError("");
    setMutationError("");
    setConfirmation(null);
    setMutationStatus("idle");
  };

  const prepareConfirmation = () => {
    if (!overview || !canPrepareCommand) return;
    const command = toPublishCommand(draft, overview.latestVersion);
    if (typeof command === "string") {
      setDraftError(command);
      return;
    }
    setDraftError("");
    setMutationError("");
    setConfirmation(command);
    setMutationStatus("idle");
  };

  const publish = async () => {
    if (!confirmation || !overview || mutationStatus === "saving" || projectionLock !== null) return;
    const key = retainedCommand.current?.fingerprint === confirmation.fingerprint
      ? retainedCommand.current.key
      : createIdempotencyKey();
    retainedCommand.current = { fingerprint: confirmation.fingerprint, key };
    setMutationStatus("saving");
    setMutationError("");
    try {
      await ndpExchangeRateApi.publish({ ...confirmation.input, idempotencyKey: key });
      retainedCommand.current = null;
      setConfirmation(null);
      setFormOpen(false);
      setProjectionLock("applied");
      evaluatedAtAnchor.current = null;
      await loadOverview(1, true, true, true);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === versionConflictCode) {
        retainedCommand.current = null;
        setConfirmation(null);
        setMutationStatus("idle");
        setMutationError("版本或生效时间链已变化，草稿已保留，请重新确认");
        setProjectionLock("conflict");
        setProjectionError("");
        evaluatedAtAnchor.current = null;
        await loadOverview(1, true, true, true);
        return;
      }
      setMutationStatus("ambiguous");
      setMutationError(
        error instanceof ApiClientError && error.code === idempotencyConflictCode
          ? "幂等键已用于其他发布内容，请修改后重试"
          : "发布结果尚未确认，请保持内容不变后重试"
      );
    }
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="NDP 汇率"
        description="按整数比例发布不可变汇率版本；订单结算会保存当时使用的正式快照。"
        actions={(
          <PermissionGate permission="backoffice:ndp-exchange-rate:write">
            {canPrepareCommand ? <Button onClick={openForm}>发布新汇率</Button> : null}
          </PermissionGate>
        )}
      >
        {loadStatus === "loading" && !overview ? (
          <section aria-live="polite" className="rounded-2xl border border-line bg-white p-8 text-sm font-bold text-ink/50">正在加载汇率数据…</section>
        ) : null}

        {loadStatus === "error" && !overview ? (
          <section role="alert" className="rounded-2xl border border-coral/30 bg-coral/10 p-6" data-admin-surface="error-banner">
            <h2 className="font-black text-coral">汇率数据加载失败</h2>
            <p className="mt-2 text-sm font-semibold text-coral">{loadError}</p>
            <Button className="mt-4" onClick={() => void loadOverview(1, true)} variant="secondary">重试</Button>
          </section>
        ) : null}

        {overview ? (
          <div className="space-y-5" data-admin-layout="responsive">
            {projectionError ? (
              <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lemon/40 bg-lemon/10 p-4 text-sm font-semibold text-ink">
                <span>{projectionLock === "conflict" ? "版本冲突后最新数据刷新失败：" : "发布已受理，但最新只读数据刷新失败："}{projectionError}</span>
                <Button onClick={() => void loadOverview(1, true, true, true)} variant="secondary">重试只读数据</Button>
              </section>
            ) : null}
            {mutationError && !confirmation ? <p role="alert" className="rounded-xl border border-lemon/40 bg-lemon/10 p-3 text-sm font-semibold text-ink">{mutationError}</p> : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <RateSummaryCard label="当前生效" rate={overview.current} empty="当前没有生效汇率" locale={locale} />
              <RateSummaryCard label="下一计划" rate={overview.nextScheduled} empty="当前没有计划中的汇率" locale={locale} />
            </div>

            {formOpen ? (
              <section className="rounded-2xl border border-line bg-white p-5 shadow-panel" data-admin-surface="editor">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-ink">发布新汇率</h2>
                    <p className="mt-1 text-sm font-semibold text-ink/50">基于最新版本 v{overview.latestVersion} 创建不可变后继版本。</p>
                  </div>
                  <Button onClick={() => { setFormOpen(false); setConfirmation(null); }} variant="ghost">关闭</Button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-bold text-ink/70">NDP 数量
                    <input className="focus-ring mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 font-semibold text-ink outline-none" inputMode="numeric" min="1" max={maxInteger} value={draft.ndpUnits} onChange={(event) => setDraft((current) => ({ ...current, ndpUnits: event.target.value }))} />
                  </label>
                  <label className="text-sm font-bold text-ink/70">JPY 数量
                    <input className="focus-ring mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 font-semibold text-ink outline-none" inputMode="numeric" min="1" max={maxInteger} value={draft.jpyUnits} onChange={(event) => setDraft((current) => ({ ...current, jpyUnits: event.target.value }))} />
                  </label>
                  <label className="text-sm font-bold text-ink/70">生效时间
                    <input className="focus-ring mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 font-semibold text-ink outline-none" type="datetime-local" value={draft.effectiveFrom} onChange={(event) => setDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} />
                  </label>
                  <label className="text-sm font-bold text-ink/70 md:col-span-2">设置理由
                    <textarea className="focus-ring mt-2 min-h-24 w-full rounded-xl border border-line bg-paper p-3 font-semibold text-ink outline-none" value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} />
                  </label>
                </div>
                {draftError ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{draftError}</p> : null}
                {!confirmation && projectionLock === null ? <Button className="mt-5" onClick={prepareConfirmation}>确认发布内容</Button> : null}

                {confirmation ? (
                  <div className="mt-5 rounded-2xl border border-line bg-paper p-5">
                    <h3 className="font-black text-ink">发布确认</h3>
                    <p className="mt-3 font-mono text-xl font-black text-ink">{confirmation.input.ndpUnits} NDP = {confirmation.input.jpyUnits} JPY</p>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div><dt className="inline font-bold text-ink/50">生效时间：</dt><dd className="inline font-semibold text-ink">{formatDate(confirmation.input.effectiveFrom, locale)}</dd></div>
                      <div><dt className="inline font-bold text-ink/50">设置理由：</dt><dd className="inline font-semibold text-ink">{confirmation.input.reason}</dd></div>
                    </dl>
                    {mutationError ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{mutationError}</p> : null}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button disabled={mutationStatus === "saving"} onClick={() => void publish()}>{mutationStatus === "saving" ? "正在发布…" : "确认并发布"}</Button>
                      <Button disabled={mutationStatus === "saving"} onClick={() => { setConfirmation(null); setMutationError(""); setMutationStatus("idle"); }} variant="secondary">返回修改</Button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel" data-admin-surface="history">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper p-5">
                <div>
                  <h2 className="text-lg font-black text-ink">不可变版本历史</h2>
                  <p className="mt-1 text-sm font-semibold text-ink/50">{translateTemplate(
                    "时间状态以数据评估时间 {time} 为准。",
                    { time: formatDate(overview.evaluatedAt, locale) }
                  )}</p>
                </div>
                <Badge tone="blue">{translateTemplate(
                  "共 {total} 个版本",
                  { total: String(overview.history.total) }
                )}</Badge>
              </div>
              {history.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-paper font-black text-ink/50"><tr><th className="px-5 py-3">版本</th><th className="px-5 py-3">时间状态</th><th className="px-5 py-3">汇率</th><th className="px-5 py-3">生效区间</th><th className="px-5 py-3">设置理由</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {history.map((item) => {
                        const temporalState = classifyNdpExchangeRate(item, overview.evaluatedAt);
                        const temporalLabel = temporalState === "current" ? "当前" : temporalState === "scheduled" ? "计划中" : "历史";
                        return <tr key={item.publicId} data-temporal-state={temporalState}><td className="px-5 py-4 font-black text-ink">v{item.version}</td><td className="px-5 py-4 font-bold text-ink/70">{temporalLabel}</td><td className="px-5 py-4 font-mono font-black text-ink">{equation(item)}</td><td className="px-5 py-4 font-semibold text-ink/60">{formatDate(item.effectiveFrom, locale)} — {formatDate(item.effectiveTo, locale)}</td><td className="px-5 py-4 font-semibold text-ink/60">{item.reason}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="p-8 text-center text-sm font-bold text-ink/50">暂无汇率版本记录</p>}
              <div className="flex items-center justify-between border-t border-line bg-paper p-4 text-sm font-bold text-ink/60">
                <span>{translateTemplate(
                  "第 {current} / {total} 页",
                  { current: String(page), total: String(totalPages) }
                )}</span>
                <div className="flex gap-2"><Button disabled={projectionLock !== null || page <= 1} onClick={() => void loadOverview(page - 1, false)} variant="secondary">上一页</Button><Button disabled={projectionLock !== null || page >= totalPages} onClick={() => void loadOverview(page + 1, false)} variant="secondary">下一页</Button></div>
              </div>
            </section>
          </div>
        ) : null}
      </ModuleShell>
    </AdminLayout>
  );
}
