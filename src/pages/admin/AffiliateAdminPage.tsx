import { useEffect, useMemo, useRef, useState } from "react";
import {
  backofficeRealDataApi,
  type AffiliatePublisherType,
  type AffiliateTaskStatus,
  type BackofficeAffiliateTaskPayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { useI18n } from "../../i18n/I18nProvider";
import {
  affiliateTaskStatusLabel,
  getAffiliateAdminCopy,
  type AffiliateAdminCopy
} from "./affiliateAdminCopy";

const pageSize = 20;
const taskStatuses: AffiliateTaskStatus[] = [
  "draft", "pending_review", "scheduled", "active", "paused",
  "budget_exhausted", "ended", "cancelled", "rejected"
];

function statusTone(status: AffiliateTaskStatus): BadgeTone {
  if (status === "active") return "green";
  if (status === "pending_review" || status === "scheduled") return "yellow";
  if (status === "rejected" || status === "cancelled") return "red";
  if (status === "paused" || status === "budget_exhausted") return "blue";
  return "neutral";
}

function describeError(error: unknown, copy: AffiliateAdminCopy, fallback: string) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return copy.sessionExpired;
    if (error.status === 403) return copy.permissionDenied;
    if (error.status === 409) return copy.conflict;
  }
  return fallback;
}

export function AffiliateAdminPage() {
  const { language } = useI18n();
  const copy = useMemo(() => getAffiliateAdminCopy(language), [language]);
  const [rows, setRows] = useState<BackofficeAffiliateTaskPayload[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AffiliateTaskStatus | "all">("all");
  const [publisherType, setPublisherType] = useState<AffiliatePublisherType | "all">("all");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedTask, setSelectedTask] = useState<BackofficeAffiliateTaskPayload | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [detailError, setDetailError] = useState("");
  const [mutationStatus, setMutationStatus] = useState<"idle" | "saving">("idle");
  const [mutationError, setMutationError] = useState("");
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const detailRequestId = useRef(0);

  useEffect(() => {
    let current = true;
    setLoadStatus("loading");
    setLoadError("");
    backofficeRealDataApi.affiliateTasks({
      keyword: keyword || undefined,
      page,
      pageSize,
      publisherType: publisherType === "all" ? undefined : publisherType,
      status: status === "all" ? undefined : status
    }).then((response) => {
      if (!current) return;
      setRows(response.list);
      setTotal(response.total);
      setLoadStatus("success");
    }).catch((error: unknown) => {
      if (!current) return;
      setRows([]);
      setTotal(0);
      setLoadError(describeError(error, copy, copy.loadFailed));
      setLoadStatus("error");
    });
    return () => {
      current = false;
    };
  }, [copy, keyword, page, publisherType, revision, status]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pendingOnPage = rows.filter((row) => row.status === "pending_review").length;
  const frozenOnPage = rows.reduce(
    (sum, row) => sum + (row.budgetReservation?.totalFrozenNdp ?? row.reservedBudgetNdp),
    0
  );
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === "en" ? "en-US" : "ja-JP"),
    [language]
  );
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(language === "en" ? "en-US" : "ja-JP", {
      currency: "JPY", style: "currency", maximumFractionDigits: 0
    }),
    [language]
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(
      language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN",
      { dateStyle: "medium", timeStyle: "short" }
    ),
    [language]
  );
  const formatDate = (value: string | null) => (value ? dateFormatter.format(new Date(value)) : "—");
  const publisherLabel = (task: BackofficeAffiliateTaskPayload) =>
    task.publisherType === "shop"
      ? `${copy.shop} #${task.publisherShopId ?? "—"}`
      : `${copy.merchant} #${task.publisherMerchantAccountId ?? "—"}`;
  const discountLabel = (task: BackofficeAffiliateTaskPayload) => {
    if (task.customerDiscountType === "fixed_jpy") return currencyFormatter.format(task.fixedDiscountJpy);
    if (task.customerDiscountType === "percent") {
      const cap = task.discountCapJpy > 0 ? ` / ${currencyFormatter.format(task.discountCapJpy)}` : "";
      return `${(task.discountRateBps / 100).toFixed(2)}%${cap}`;
    }
    return "—";
  };

  const applySearch = () => {
    setPage(1);
    setKeyword(keywordDraft.trim());
  };

  const openTask = async (task: BackofficeAffiliateTaskPayload) => {
    const requestId = ++detailRequestId.current;
    setSelectedTask(task);
    setDetailStatus("loading");
    setDetailError("");
    setMutationError("");
    setConfirmAction(null);
    setRejectionReason(task.rejectionReason ?? "");
    try {
      const detail = await backofficeRealDataApi.affiliateTask(task.id);
      if (requestId !== detailRequestId.current) return;
      setSelectedTask(detail);
      setRejectionReason(detail.rejectionReason ?? "");
      setDetailStatus("success");
    } catch (error: unknown) {
      if (requestId !== detailRequestId.current) return;
      setDetailError(describeError(error, copy, copy.detailFailed));
      setDetailStatus("error");
    }
  };

  const closeTask = () => {
    if (mutationStatus === "saving") return;
    detailRequestId.current += 1;
    setSelectedTask(null);
    setDetailStatus("idle");
    setMutationError("");
    setConfirmAction(null);
  };

  const reviewTask = async (action: "approve" | "reject") => {
    if (!selectedTask || mutationStatus === "saving" || selectedTask.status !== "pending_review") return;
    if (action === "reject" && !rejectionReason.trim()) {
      setMutationError(copy.rejectPlaceholder);
      return;
    }
    if (confirmAction !== action) {
      setConfirmAction(action);
      setMutationError("");
      return;
    }
    setMutationStatus("saving");
    setMutationError("");
    try {
      const updated = action === "approve"
        ? await backofficeRealDataApi.approveAffiliateTask(selectedTask.id)
        : await backofficeRealDataApi.rejectAffiliateTask(selectedTask.id, rejectionReason.trim());
      setSelectedTask(updated);
      setConfirmAction(null);
      setRevision((value) => value + 1);
    } catch (error: unknown) {
      setMutationError(describeError(error, copy, copy.saveFailed));
      setConfirmAction(null);
    } finally {
      setMutationStatus("idle");
    }
  };

  return (
    <AdminLayout>
      <div data-no-i18n>
        <ModuleShell
          title={copy.title}
          description={copy.description}
          actions={(
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">{copy.formalData}</Badge>
              <Badge tone="blue">{copy.rbac}</Badge>
              <Badge tone="neutral">{copy.audit}</Badge>
            </div>
          )}
        >
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              [copy.total, total],
              [copy.pending, pendingOnPage],
              [copy.frozen, `${numberFormatter.format(frozenOnPage)} NDP`]
            ].map(([label, value]) => (
              <article className="rounded-xl border border-line bg-white p-4 shadow-panel" key={label}>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">{label}</p>
                <strong className="mt-2 block text-2xl font-black text-ink">{value}</strong>
              </article>
            ))}
          </section>

          <form
            className="grid gap-3 rounded-xl border border-line bg-paper p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]"
            onSubmit={(event) => { event.preventDefault(); applySearch(); }}
          >
            <input
              className="h-11 rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
              onChange={(event) => setKeywordDraft(event.target.value)}
              placeholder={copy.keyword}
              value={keywordDraft}
            />
            <select
              className="h-11 rounded-lg border border-line bg-white px-3 text-sm font-bold"
              onChange={(event) => { setPage(1); setStatus(event.target.value as AffiliateTaskStatus | "all"); }}
              value={status}
            >
              <option value="all">{copy.allStatuses}</option>
              {taskStatuses.map((value) => (
                <option key={value} value={value}>{affiliateTaskStatusLabel(value, language)}</option>
              ))}
            </select>
            <select
              className="h-11 rounded-lg border border-line bg-white px-3 text-sm font-bold"
              onChange={(event) => { setPage(1); setPublisherType(event.target.value as AffiliatePublisherType | "all"); }}
              value={publisherType}
            >
              <option value="all">{copy.allPublishers}</option>
              <option value="merchant_account">{copy.merchant}</option>
              <option value="shop">{copy.shop}</option>
            </select>
            <Button type="submit">{copy.search}</Button>
          </form>

          {loadStatus === "loading" ? (
            <section aria-live="polite" className="rounded-xl border border-line bg-white px-5 py-12 text-center shadow-panel">
              <p className="text-sm font-black text-ink/55">{copy.loading}</p>
            </section>
          ) : null}
          {loadStatus === "error" ? (
            <section className="rounded-xl border border-coral/30 bg-coral/5 px-5 py-10 text-center shadow-panel" role="alert">
              <h2 className="font-black text-ink">{copy.loadFailed}</h2>
              <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
              <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>{copy.reload}</Button>
            </section>
          ) : null}
          {loadStatus === "success" && rows.length === 0 ? (
            <section className="rounded-xl border border-dashed border-line bg-white px-5 py-12 text-center shadow-panel">
              <p className="text-sm font-black text-ink/55">{copy.empty}</p>
            </section>
          ) : null}
          {loadStatus === "success" && rows.length > 0 ? (
            <>
              <DataTable<BackofficeAffiliateTaskPayload>
                columns={[
                  { key: "task", title: copy.task, width: "260px", render: (row) => <div><strong className="block text-ink">{row.name}</strong><span className="text-xs text-ink/45">{row.taskCode}</span></div> },
                  { key: "publisher", title: copy.publisher, render: publisherLabel },
                  { key: "reward", title: copy.reward, render: (row) => `${numberFormatter.format(row.rewardNdpPerCompletedOrder)} NDP` },
                  { key: "budget", title: copy.budget, render: (row) => `${numberFormatter.format(row.totalBudgetNdp)} NDP` },
                  { key: "window", title: copy.window, width: "230px", render: (row) => `${formatDate(row.taskStartsAt)} — ${formatDate(row.taskEndsAt)}` },
                  { key: "status", title: copy.status, render: (row) => <Badge tone={statusTone(row.status)}>{affiliateTaskStatusLabel(row.status, language)}</Badge> },
                  { key: "detail", title: copy.detail, render: (row) => <Button onClick={() => void openTask(row)} size="sm" variant="secondary">{copy.detail}</Button> }
                ]}
                footerPlacement="inline"
                pageSize={pageSize}
                rows={rows}
                showFooterActions={false}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3">
                <span className="text-sm font-bold text-ink/55">{copy.pageSummary(total, page, totalPages)}</span>
                <div className="flex gap-2">
                  <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="sm" variant="secondary">{copy.previous}</Button>
                  <Button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} size="sm" variant="secondary">{copy.next}</Button>
                </div>
              </div>
            </>
          ) : null}
        </ModuleShell>

        <Drawer onClose={closeTask} open={Boolean(selectedTask)} title={copy.drawerTitle}>
          {detailStatus === "loading" ? (
            <p className="rounded-lg border border-line bg-white p-5 text-sm font-bold text-ink/55">{copy.detailLoading}</p>
          ) : null}
          {detailStatus === "error" ? (
            <section className="rounded-lg border border-coral/30 bg-coral/5 p-5" role="alert">
              <h3 className="font-black text-ink">{copy.detailFailed}</h3>
              <p className="mt-2 text-sm font-bold text-ink/55">{detailError}</p>
              {selectedTask ? <Button className="mt-4" onClick={() => void openTask(selectedTask)}>{copy.reload}</Button> : null}
            </section>
          ) : null}
          {selectedTask && detailStatus === "success" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-ink">{selectedTask.name}</h3>
                  <p className="mt-1 text-sm font-bold text-ink/45">{selectedTask.description ?? "—"}</p>
                </div>
                <Badge tone={statusTone(selectedTask.status)}>{affiliateTaskStatusLabel(selectedTask.status, language)}</Badge>
              </div>
              <DetailGrid items={[
                { label: copy.taskCode, value: selectedTask.taskCode },
                { label: copy.publisher, value: publisherLabel(selectedTask) },
                { label: copy.taskWindow, value: `${formatDate(selectedTask.taskStartsAt)} — ${formatDate(selectedTask.taskEndsAt)}` },
                { label: copy.claimWindow, value: `${formatDate(selectedTask.claimStartsAt)} — ${formatDate(selectedTask.claimEndsAt)}` },
                { label: copy.reward, value: `${numberFormatter.format(selectedTask.rewardNdpPerCompletedOrder)} NDP` },
                { label: copy.discount, value: discountLabel(selectedTask) },
                { label: copy.minimumOrder, value: currencyFormatter.format(selectedTask.minimumOrderAmountJpy) },
                { label: copy.attribution, value: `${selectedTask.attributionWindowDays} days` },
                { label: copy.limits, value: `${selectedTask.maxCompletedOrdersPerClaim ?? "—"} / ${selectedTask.maxCompletedOrdersPerCustomer ?? "—"}` }
              ]} />

              <section className="rounded-xl border border-line bg-white p-4">
                <h3 className="font-black text-ink">{copy.budgetLifecycle}</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    [copy.reserved, selectedTask.reservedBudgetNdp],
                    [copy.allocated, selectedTask.allocatedBudgetNdp],
                    [copy.settled, selectedTask.settledBudgetNdp],
                    [copy.released, selectedTask.releasedBudgetNdp]
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-paper p-3" key={label}>
                      <p className="text-xs font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-sm text-ink">{numberFormatter.format(Number(value))} NDP</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-line bg-white p-4">
                <h3 className="font-black text-ink">{copy.shops}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedTask.shops.length > 0
                    ? selectedTask.shops.map((shop) => <Badge key={shop.id} tone="neutral">{shop.shopNameSnapshot} · #{shop.shopId}</Badge>)
                    : <span className="text-sm font-bold text-ink/45">{copy.noShops}</span>}
                </div>
              </section>

              <section className="rounded-xl border border-line bg-white p-4">
                <h3 className="font-black text-ink">{copy.services}</h3>
                <div className="mt-3 space-y-2">
                  {selectedTask.services.length > 0
                    ? selectedTask.services.map((service) => (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-paper p-3 text-sm font-bold" key={service.id}>
                        <span>{service.serviceNameSnapshot}</span>
                        <span>{currencyFormatter.format(service.servicePriceJpySnapshot)}</span>
                      </div>
                    ))
                    : <span className="text-sm font-bold text-ink/45">{copy.noServices}</span>}
                </div>
              </section>

              <section className="rounded-xl border border-line bg-white p-4">
                <h3 className="mb-3 font-black text-ink">{copy.review}</h3>
                <DetailGrid items={[
                  { label: copy.reviewedBy, value: selectedTask.reviewedById ? `#${selectedTask.reviewedById} · ${formatDate(selectedTask.reviewedAt)}` : copy.notReviewed },
                  { label: copy.rejectionReason, value: selectedTask.rejectionReason ?? "—" }
                ]} />
              </section>

              {mutationError ? (
                <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm font-black text-coral" role="alert">{mutationError}</p>
              ) : null}
              {selectedTask.status === "pending_review" ? (
                <PermissionGate
                  permission="button:backoffice-affiliate-review"
                  fallback={<p className="rounded-lg border border-line bg-paper p-3 text-sm font-bold text-ink/55">{copy.permissionDenied}</p>}
                >
                  <section className="rounded-xl border border-line bg-paper p-4">
                    <label className="text-sm font-black text-ink" htmlFor="affiliate-rejection-reason">{copy.rejectReason}</label>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-lg border border-line bg-white p-3 text-sm font-bold outline-none focus:border-moss"
                      id="affiliate-rejection-reason"
                      maxLength={500}
                      onChange={(event) => { setRejectionReason(event.target.value); setConfirmAction(null); }}
                      placeholder={copy.rejectPlaceholder}
                      value={rejectionReason}
                    />
                    {confirmAction ? (
                      <p className="mt-3 text-sm font-black text-coral">{confirmAction === "approve" ? copy.approveConfirm : copy.rejectConfirm}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button disabled={mutationStatus === "saving"} onClick={() => void reviewTask("approve")}>{copy.approve}</Button>
                      <Button disabled={mutationStatus === "saving"} onClick={() => void reviewTask("reject")} variant="danger">{copy.reject}</Button>
                      {confirmAction ? <Button disabled={mutationStatus === "saving"} onClick={() => setConfirmAction(null)} variant="secondary">{copy.cancel}</Button> : null}
                    </div>
                  </section>
                </PermissionGate>
              ) : null}
            </div>
          ) : null}
        </Drawer>
      </div>
    </AdminLayout>
  );
}
