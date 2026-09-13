import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  exchangeOperationsApi,
  type ExchangeOperationsDetail,
  type ExchangeOperationsListInput,
  type ExchangeOperationsPage,
  type ExchangeOperationsPost
} from "../../api/exchangeOperations";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { exchangeOperationsText } from "./exchangeOperationsCopy";

type NeedoExchangeAdminMode = "demand" | "info";
type Filters = Pick<
  ExchangeOperationsListInput,
  "status" | "matchMode" | "publisherIdentityType" | "keyword"
>;
const pageSize = 20;
const inputClass =
  "focus-ring h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none";
const statusTone: Record<ExchangeOperationsPost["status"], BadgeTone> = {
  published: "green",
  matched: "blue",
  expired: "neutral",
  withdrawn: "yellow",
  closed: "dark"
};

function NeedoExchangeAdminPage({ mode }: { mode: NeedoExchangeAdminMode }) {
  const { language } = useOptionalI18n();
  const t = (source: string, values?: Record<string, string | number>) =>
    exchangeOperationsText(source, language, values);
  const type = mode === "demand" ? "demand" : "intelligence";
  const [draft, setDraft] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ExchangeOperationsPage | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [detail, setDetail] = useState<ExchangeOperationsDetail | null>(null);
  const [detailState, setDetailState] =
    useState<"idle" | "loading" | "success" | "error">("idle");
  const detailAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    void exchangeOperationsApi
      .list({ type, ...filters, page, pageSize }, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setLoadState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [filters, page, revision, type]);

  useEffect(() => () => detailAbort.current?.abort(), []);

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(language === "zh-Hant" ? "zh-TW" : language, {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  const formatMoney = (value: number | null, currency = "JPY") =>
    value === null
      ? t("未设置")
      : new Intl.NumberFormat(language, {
          style: "currency",
          currency,
          maximumFractionDigits: 0
        }).format(value);
  const statusLabel = (status: ExchangeOperationsPost["status"]) =>
    t(
      {
        published: "发布中",
        matched: "已匹配",
        expired: "已过期",
        withdrawn: "已撤回",
        closed: "已关闭"
      }[status]
    );
  const financialLabel = (financial: ExchangeOperationsPost["financial"]) =>
    financial
      ? `${t({ held: "冻结", captured: "已扣取", released: "已释放" }[financial.state])} ${financial.amountNdp.toLocaleString()} ${financial.currency}`
      : t("无请求费记录");

  const openDetail = (row: ExchangeOperationsPost) => {
    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;
    setDetail(null);
    setDetailState("loading");
    void exchangeOperationsApi
      .detail(row.id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setDetail(value);
          setDetailState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetailState("error");
      });
  };

  const columns = useMemo<Array<Column<ExchangeOperationsPost>>>(
    () => [
      {
        key: "title",
        title: t("标题"),
        width: "240px",
        render: (row) => (
          <div>
            <p className="font-bold text-ink">{row.title}</p>
            <p className="mt-1 text-xs text-ink/50">
              #{row.id} · {row.publisher.displayNameMasked} · {row.publisher.publicIdMasked}
            </p>
          </div>
        )
      },
      {
        key: "status",
        title: t("状态"),
        render: (row) => <Badge tone={statusTone[row.status]}>{statusLabel(row.status)}</Badge>
      },
      {
        key: "scope",
        title: t("服务范围"),
        width: "190px",
        render: (row) => <span>{row.areaLabel} · {row.serviceMode}</span>
      },
      { key: "budget", title: t("预算"), render: (row) => formatMoney(row.budgetMaxJpy) },
      { key: "expires", title: t("到期"), render: (row) => formatDate(row.expiresAt) },
      { key: "claims", title: t("响应"), render: (row) => `${row.activeClaimCount} / ${row.claimCount}` },
      { key: "matching", title: t("匹配"), render: (row) => String(row.matchedCount) },
      {
        key: "financial",
        title: t("请求费"),
        width: "180px",
        render: (row) => financialLabel(row.financial)
      }
    ],
    [language]
  );
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? pageSize)));

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters({
      status: draft.status || undefined,
      matchMode: type === "demand" ? draft.matchMode || undefined : undefined,
      publisherIdentityType: draft.publisherIdentityType?.trim() || undefined,
      keyword: draft.keyword?.trim() || undefined
    });
  };

  return (
    <AdminLayout>
      <ModuleShell
        title={t(mode === "demand" ? "需求中心" : "情报中心")}
        description={t("查看正式发布、响应、匹配、请求费与审计记录。")}
        actions={<Badge tone="blue">{t("只读")}</Badge>}
      >
        <form
          className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4 shadow-panel"
          onSubmit={submitFilters}
        >
          <label className="grid min-w-56 flex-1 gap-1 text-xs font-bold text-ink/60">
            <span>{t("关键词")}</span>
            <input
              className={inputClass}
              value={draft.keyword ?? ""}
              placeholder={t("搜索标题、内容、地区或发布者")}
              onChange={(event) =>
                setDraft((current) => ({ ...current, keyword: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-ink/60">
            <span>{t("状态")}</span>
            <select
              className={inputClass}
              value={draft.status ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  status: (event.target.value as Filters["status"]) || undefined
                }))
              }
            >
              <option value="">{t("全部状态")}</option>
              {(["published", "matched", "expired", "withdrawn", "closed"] as const).map(
                (status) => <option key={status} value={status}>{statusLabel(status)}</option>
              )}
            </select>
          </label>
          {type === "demand" ? (
            <label className="grid gap-1 text-xs font-bold text-ink/60">
              <span>{t("匹配方式")}</span>
              <select
                className={inputClass}
                value={draft.matchMode ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    matchMode: (event.target.value as Filters["matchMode"]) || undefined
                  }))
                }
              >
                <option value="">{t("全部方式")}</option>
                <option value="quick">{t("快速匹配")}</option>
                <option value="selective">{t("选择匹配")}</option>
              </select>
            </label>
          ) : null}
          <label className="grid gap-1 text-xs font-bold text-ink/60">
            <span>{t("发布者身份")}</span>
            <input
              className={inputClass}
              value={draft.publisherIdentityType ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  publisherIdentityType: event.target.value
                }))
              }
            />
          </label>
          <Button type="submit">{t("搜索")}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft({});
              setFilters({});
              setPage(1);
            }}
          >
            {t("重置")}
          </Button>
        </form>

        {loadState === "loading" ? (
          <div className="rounded-lg border border-line bg-white p-10 text-center text-sm font-bold text-ink/55">
            {t("加载中…")}
          </div>
        ) : null}
        {loadState === "error" ? (
          <div className="rounded-lg border border-coral/30 bg-white p-10 text-center">
            <p className="font-bold text-coral">{t("正式数据加载失败")}</p>
            <Button className="mt-4" variant="secondary" onClick={() => setRevision((value) => value + 1)}>
              {t("重试")}
            </Button>
          </div>
        ) : null}
        {loadState === "success" && data?.list.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-10 text-center text-sm font-bold text-ink/55">
            {t("暂无符合条件的正式记录")}
          </div>
        ) : null}
        {loadState === "success" && data && data.list.length > 0 ? (
          <DataTable
            rows={data.list}
            columns={columns}
            pageSize={Math.max(data.list.length, 1)}
            showFooter={false}
            frozenDetailLabel={t("查看详情")}
            onView={openDetail}
          />
        ) : null}
        {loadState === "success" && data ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3">
            <span className="text-sm font-bold text-ink/60">
              {t("服务器共 {total} 条，第 {page} / {pages} 页", {
                total: data.total,
                page: data.page,
                pages: totalPages
              })}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("上一页")}</Button>
              <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>{t("下一页")}</Button>
            </div>
          </div>
        ) : null}
      </ModuleShell>

      <Drawer
        open={detailState !== "idle"}
        title={detail ? `${t("详情")} #${detail.id}` : t("详情")}
        onClose={() => {
          detailAbort.current?.abort();
          setDetail(null);
          setDetailState("idle");
        }}
      >
        {detailState === "loading" ? <p className="text-sm font-bold text-ink/55">{t("加载中…")}</p> : null}
        {detailState === "error" ? <p className="font-bold text-coral">{t("详情加载失败")}</p> : null}
        {detail ? <ExchangeDetail detail={detail} formatDate={formatDate} formatMoney={formatMoney} statusLabel={statusLabel} financialLabel={financialLabel} t={t} /> : null}
      </Drawer>
    </AdminLayout>
  );
}

function ExchangeDetail({ detail, formatDate, formatMoney, statusLabel, financialLabel, t }: {
  detail: ExchangeOperationsDetail;
  formatDate: (value: string) => string;
  formatMoney: (value: number | null, currency?: string) => string;
  statusLabel: (status: ExchangeOperationsPost["status"]) => string;
  financialLabel: (financial: ExchangeOperationsPost["financial"]) => string;
  t: (source: string, values?: Record<string, string | number>) => string;
}) {
  return <div className="space-y-6">
    <section>
      <h3 className="mb-3 text-sm font-black text-ink">{t("基础信息")}</h3>
      <DetailGrid items={[
        { label: t("类型"), value: t(detail.type === "demand" ? "需求" : "情报") },
        { label: t("状态"), value: <Badge tone={statusTone[detail.status]}>{statusLabel(detail.status)}</Badge> },
        { label: t("发布者"), value: `${detail.publisher.displayNameMasked} · ${detail.publisher.publicIdMasked} · ${detail.publisher.identityType}` },
        { label: t("发布时间"), value: formatDate(detail.publishedAt) },
        { label: t("服务时间"), value: `${formatDate(detail.serviceStartAt)} – ${formatDate(detail.serviceEndAt)}` },
        { label: t("地区"), value: detail.areaLabel },
        { label: t("预算"), value: formatMoney(detail.budgetMaxJpy) },
        { label: t("请求费状态"), value: financialLabel(detail.financial) }
      ]} />
    </section>
    <section><h3 className="mb-2 text-sm font-black text-ink">{t("正文")}</h3><p className="whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm leading-7 text-ink/75">{detail.detail}</p></section>
    {detail.demand ? <section><h3 className="mb-3 text-sm font-black text-ink">{t("请求参数")}</h3><DetailGrid items={[
      { label: t("目标人数"), value: detail.demand.targetProviderCount },
      { label: t("额度快照"), value: detail.demand.targetProviderLimitSnapshot },
      { label: t("匹配方式"), value: t(detail.demand.matchMode === "quick" ? "快速匹配" : "选择匹配") },
      { label: t("预算方式"), value: detail.demand.budgetMode },
      { label: t("地区"), value: detail.demand.addressLine1 }
    ]} /></section> : null}
    <section>
      <h3 className="mb-3 text-sm font-black text-ink">{t("抢单响应")} ({detail.claims.length})</h3>
      {detail.claims.length ? <div className="space-y-2">{detail.claims.map((claim) => <article className="rounded-lg border border-line p-3 text-sm" key={claim.id}><div className="flex justify-between gap-3"><strong>{claim.providerDisplayNameMasked} · {claim.providerPublicIdMasked}</strong><Badge>{claim.status}</Badge></div><p className="mt-2 text-ink/65">{claim.shopName} · {claim.serviceName} · {formatMoney(claim.quoteAmountJpy)}</p></article>)}</div> : <p className="text-sm text-ink/50">{t("暂无响应")}</p>}
    </section>
    <section>
      <h3 className="mb-3 text-sm font-black text-ink">{t("匹配结果")}</h3>
      {detail.matching ? <div className="rounded-lg border border-line p-3 text-sm"><p><strong>{detail.matching.status}</strong> · {detail.matching.participants.length} {t("匹配")}</p>{detail.matching.participants.map((participant) => <p className="mt-2 text-ink/65" key={participant.exchangeClaimId}>{participant.providerDisplayNameMasked} · {participant.serviceName} · {formatMoney(participant.quoteAmountJpy)}</p>)}</div> : <p className="text-sm text-ink/50">{t("暂无匹配记录")}</p>}
    </section>
    <section>
      <h3 className="mb-3 text-sm font-black text-ink">{t("审计时间线")}</h3>
      {detail.timeline.length ? <ol className="space-y-2">{detail.timeline.map((event) => <li className="rounded-lg border border-line p-3 text-sm" key={event.id}><div className="flex justify-between gap-3"><strong>{event.event}</strong><time className="text-xs text-ink/45">{formatDate(event.createdAt)}</time></div><p className="mt-1 text-xs text-ink/55">{event.source}{event.status ? ` · ${event.status}` : ""}{event.actorDisplayNameMasked ? ` · ${event.actorDisplayNameMasked}` : ""}</p></li>)}</ol> : <p className="text-sm text-ink/50">{t("暂无时间线事件")}</p>}
    </section>
  </div>;
}

export function NeedoDemandAdminPage() {
  return <NeedoExchangeAdminPage mode="demand" />;
}

export function NeedoInfoAdminPage() {
  return <NeedoExchangeAdminPage mode="info" />;
}
