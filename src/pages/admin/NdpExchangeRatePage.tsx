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
import { languageLocales } from "../../i18n/translations";

const pageSize = 20;
const maxInteger = 2_147_483_647;
const versionConflictCode = 40963;
const idempotencyConflictCode = 40961;

type LoadStatus = "loading" | "ready" | "error";
type MutationStatus = "idle" | "saving" | "ambiguous";
type TemporalState = "current" | "scheduled" | "historical";

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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-500">{label}</h2>
        {rate ? <Badge tone="blue">v{rate.version}</Badge> : null}
      </div>
      {rate ? (
        <>
          <p className="font-mono text-2xl font-bold tracking-tight text-slate-950">{equation(rate)}</p>
          <p className="mt-3 text-sm text-slate-500">生效：{formatDate(rate.effectiveFrom, locale)}</p>
          <p className="mt-1 text-sm text-slate-500">结束：{formatDate(rate.effectiveTo, locale)}</p>
          <p className="mt-3 text-sm text-slate-700">{rate.reason}</p>
        </>
      ) : <p className="py-6 text-sm text-slate-500">{empty}</p>}
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
  const [projectionOutOfDate, setProjectionOutOfDate] = useState(false);
  const [projectionError, setProjectionError] = useState("");
  const retainedCommand = useRef<{ fingerprint: string; key: string } | null>(null);
  const requestId = useRef(0);
  const evaluatedAtAnchor = useRef<string | null>(null);

  const loadOverview = useCallback(async (
    nextPage: number,
    fresh: boolean,
    projectionOnly = false
  ) => {
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
      setProjectionOutOfDate(false);
      setProjectionError("");
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      if (projectionOnly) {
        setLoadStatus("ready");
        setProjectionError(errorMessage(error));
      } else {
        setLoadStatus("error");
        setLoadError(errorMessage(error));
      }
    }
  }, [overview]);

  useEffect(() => {
    void loadOverview(1, true);
  // The initial request must be a fresh server-time evaluation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil((overview?.history.total ?? 0) / pageSize));
  const history = overview?.history.list ?? [];
  const canPrepareCommand = Boolean(overview && !projectionOutOfDate && mutationStatus !== "saving");

  const openForm = () => {
    setFormOpen(true);
    setDraftError("");
    setMutationError("");
    setConfirmation(null);
    setMutationStatus("idle");
  };

  const prepareConfirmation = () => {
    if (!overview) return;
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
    if (!confirmation || !overview || mutationStatus === "saving" || projectionOutOfDate) return;
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
      setProjectionOutOfDate(true);
      evaluatedAtAnchor.current = null;
      await loadOverview(1, true, true);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === versionConflictCode) {
        retainedCommand.current = null;
        setConfirmation(null);
        setMutationStatus("idle");
        setMutationError("版本或生效时间链已变化，草稿已保留，请重新确认");
        evaluatedAtAnchor.current = null;
        await loadOverview(1, true);
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
          <section aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">正在加载汇率数据…</section>
        ) : null}

        {loadStatus === "error" && !overview ? (
          <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-900">汇率数据加载失败</h2>
            <p className="mt-2 text-sm text-red-700">{loadError}</p>
            <Button className="mt-4" onClick={() => void loadOverview(1, true)} variant="secondary">重试</Button>
          </section>
        ) : null}

        {overview ? (
          <div className="space-y-5">
            {projectionError ? (
              <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <span>发布已受理，但最新只读数据刷新失败：{projectionError}</span>
                <Button onClick={() => void loadOverview(1, true, true)} variant="secondary">重试只读数据</Button>
              </section>
            ) : null}
            {mutationError && !confirmation ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{mutationError}</p> : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <RateSummaryCard label="当前生效" rate={overview.current} empty="当前没有生效汇率" locale={locale} />
              <RateSummaryCard label="下一计划" rate={overview.nextScheduled} empty="当前没有计划中的汇率" locale={locale} />
            </div>

            {formOpen ? (
              <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">发布新汇率</h2>
                    <p className="mt-1 text-sm text-slate-500">基于最新版本 v{overview.latestVersion} 创建不可变后继版本。</p>
                  </div>
                  <Button onClick={() => { setFormOpen(false); setConfirmation(null); }} variant="ghost">关闭</Button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">NDP 数量
                    <input className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3" inputMode="numeric" min="1" max={maxInteger} value={draft.ndpUnits} onChange={(event) => setDraft((current) => ({ ...current, ndpUnits: event.target.value }))} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">JPY 数量
                    <input className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3" inputMode="numeric" min="1" max={maxInteger} value={draft.jpyUnits} onChange={(event) => setDraft((current) => ({ ...current, jpyUnits: event.target.value }))} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">生效时间
                    <input className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3" type="datetime-local" value={draft.effectiveFrom} onChange={(event) => setDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} />
                  </label>
                  <label className="text-sm font-medium text-slate-700 md:col-span-2">设置理由
                    <textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 p-3" value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} />
                  </label>
                </div>
                {draftError ? <p role="alert" className="mt-3 text-sm text-red-700">{draftError}</p> : null}
                {!confirmation ? <Button className="mt-5" onClick={prepareConfirmation}>确认发布内容</Button> : null}

                {confirmation ? (
                  <div className="mt-5 rounded-2xl border border-slate-300 bg-slate-50 p-5">
                    <h3 className="font-bold text-slate-950">发布确认</h3>
                    <p className="mt-3 font-mono text-xl font-bold">{confirmation.input.ndpUnits} NDP = {confirmation.input.jpyUnits} JPY</p>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div><dt className="inline text-slate-500">生效时间：</dt><dd className="inline text-slate-900">{formatDate(confirmation.input.effectiveFrom, locale)}</dd></div>
                      <div><dt className="inline text-slate-500">设置理由：</dt><dd className="inline text-slate-900">{confirmation.input.reason}</dd></div>
                    </dl>
                    {mutationError ? <p role="alert" className="mt-3 text-sm text-amber-800">{mutationError}</p> : null}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button disabled={mutationStatus === "saving"} onClick={() => void publish()}>{mutationStatus === "saving" ? "正在发布…" : "确认并发布"}</Button>
                      <Button disabled={mutationStatus === "saving"} onClick={() => { setConfirmation(null); setMutationError(""); setMutationStatus("idle"); }} variant="secondary">返回修改</Button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">不可变版本历史</h2>
                  <p className="mt-1 text-sm text-slate-500">时间状态以数据评估时间 {formatDate(overview.evaluatedAt, locale)} 为准。</p>
                </div>
                <Badge tone="blue">共 {overview.history.total} 个版本</Badge>
              </div>
              {history.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-3">版本</th><th className="px-5 py-3">时间状态</th><th className="px-5 py-3">汇率</th><th className="px-5 py-3">生效区间</th><th className="px-5 py-3">设置理由</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((item) => {
                        const temporalState = classifyNdpExchangeRate(item, overview.evaluatedAt);
                        const temporalLabel = temporalState === "current" ? "当前" : temporalState === "scheduled" ? "计划中" : "历史";
                        return <tr key={item.publicId} data-temporal-state={temporalState}><td className="px-5 py-4 font-semibold">v{item.version}</td><td className="px-5 py-4">{temporalLabel}</td><td className="px-5 py-4 font-mono font-semibold">{equation(item)}</td><td className="px-5 py-4 text-slate-600">{formatDate(item.effectiveFrom, locale)} — {formatDate(item.effectiveTo, locale)}</td><td className="px-5 py-4 text-slate-600">{item.reason}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="p-8 text-center text-sm text-slate-500">暂无汇率版本记录</p>}
              <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm text-slate-600">
                <span>第 {page} / {totalPages} 页</span>
                <div className="flex gap-2"><Button disabled={page <= 1} onClick={() => void loadOverview(page - 1, false)} variant="secondary">上一页</Button><Button disabled={page >= totalPages} onClick={() => void loadOverview(page + 1, false)} variant="secondary">下一页</Button></div>
              </div>
            </section>
          </div>
        ) : null}
      </ModuleShell>
    </AdminLayout>
  );
}
