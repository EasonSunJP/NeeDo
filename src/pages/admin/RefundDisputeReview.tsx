import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import {
  orderRefundCasesApi,
  type OrderRefundCasePayload,
  type RefundDisputeListPayload
} from "../../api/orderRefundCases";
import { useAuth } from "../../auth/AuthProvider";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { useI18n } from "../../i18n/I18nProvider";
import { yen } from "../../lib/utils";
import { getRefundDisputeCopy } from "./refundDisputeCopy";

const pageSize = 20;

const emptyPage = (page = 1): RefundDisputeListPayload => ({
  list: [],
  total: 0,
  page,
  page_size: pageSize
});

type Resolution = "refund" | "reject";

export function RefundDisputeReview() {
  const { hasPermission } = useAuth();
  const { language } = useI18n();
  const copy = getRefundDisputeCopy(language);
  const canResolve = hasPermission("backoffice:order-refund-dispute:resolve");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<RefundDisputeListPayload>(() => emptyPage());
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<OrderRefundCasePayload | null>(null);
  const [publicReason, setPublicReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [confirmResolution, setConfirmResolution] = useState<Resolution | null>(null);
  const [mutationState, setMutationState] = useState<"idle" | "saving">("idle");
  const [mutationError, setMutationError] = useState("");

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    orderRefundCasesApi.listDisputes({
      page,
      pageSize,
      search: search || undefined,
      status
    }).then((response) => {
      if (!active) return;
      const totalPages = Math.max(1, Math.ceil(response.total / response.page_size));
      if (response.page > totalPages) {
        setPage(totalPages);
        return;
      }
      setResult(response);
      setLoadState("success");
    }).catch(() => {
      if (!active) return;
      setResult(emptyPage(page));
      setLoadState("error");
    });
    return () => {
      active = false;
    };
  }, [page, revision, search, status]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));

  const openReview = (refundCase: OrderRefundCasePayload) => {
    setSelected(refundCase);
    setPublicReason("");
    setInternalNote("");
    setConfirmResolution(null);
    setMutationError("");
  };

  const closeReview = () => {
    setSelected(null);
    setConfirmResolution(null);
    setMutationError("");
  };

  const submitResolution = async (resolution: Resolution) => {
    if (!selected?.dispute || selected.dispute.status !== "open" || !canResolve) return;
    if (confirmResolution !== resolution) {
      setConfirmResolution(resolution);
      return;
    }

    const normalizedPublicReason = publicReason.trim();
    const normalizedInternalNote = internalNote.trim();
    if (normalizedPublicReason.length < 2) {
      setMutationError(copy.validation);
      return;
    }

    setMutationState("saving");
    setMutationError("");
    try {
      await orderRefundCasesApi.resolveDispute(selected.dispute.publicId, {
        expectedVersion: selected.dispute.version,
        idempotencyKey: globalThis.crypto.randomUUID(),
        resolution,
        publicReason: normalizedPublicReason,
        ...(normalizedInternalNote ? { internalNote: normalizedInternalNote } : {})
      });
      closeReview();
      setRevision((value) => value + 1);
    } catch (error: unknown) {
      setConfirmResolution(null);
      setMutationError(
        error instanceof ApiClientError && error.status === 409
          ? copy.versionConflict
          : copy.resolveFailed
      );
    } finally {
      setMutationState("idle");
    }
  };

  return (
    <AdminLayout>
      <ModuleShell
        title={copy.title}
        description={copy.description}
        actions={canResolve ? <Badge tone="green">{copy.canResolve}</Badge> : <Badge tone="yellow">{copy.readOnly}</Badge>}
      >
        <section className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4 shadow-panel">
          <label className="grid gap-1 text-xs font-bold text-ink/55">
            {copy.disputeStatus}
            <select
              aria-label={copy.disputeStatus}
              className="focus-ring h-10 rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as "open" | "resolved");
              }}
            >
              <option value="open">{copy.open}</option>
              <option value="resolved">{copy.resolved}</option>
            </select>
          </label>
          <label className="grid min-w-[260px] flex-1 gap-1 text-xs font-bold text-ink/55">
            {copy.searchLabel}
            <input
              aria-label={copy.searchLabel}
              className="focus-ring h-10 rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink"
              placeholder={copy.searchPlaceholder}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setSearch(searchDraft.trim());
                }
              }}
            />
          </label>
          <Button onClick={() => {
            setPage(1);
            setSearch(searchDraft.trim());
          }}>{copy.search}</Button>
        </section>

        {loadState === "loading" ? (
          <section className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel" aria-live="polite">
            <p className="text-sm font-black text-ink">{copy.loading}</p>
          </section>
        ) : null}
        {loadState === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
            <p className="text-sm font-black text-ink">{copy.loadFailed}</p>
            <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>{copy.reload}</Button>
          </section>
        ) : null}
        {loadState === "success" && result.list.length === 0 ? (
          <section className="rounded-lg border border-dashed border-line bg-white px-5 py-10 text-center">
            <p className="text-sm font-black text-ink/55">{copy.empty}</p>
          </section>
        ) : null}
        {loadState === "success" && result.list.length > 0 ? (
          <>
            <DataTable<OrderRefundCasePayload>
              columns={[
                { key: "order", title: copy.orderNo, render: (row) => row.orderNo },
                { key: "shop", title: copy.shop, render: (row) => row.shop.name },
                { key: "customer", title: copy.customer, render: (row) => `${row.customer.displayName} / ${row.customer.needoId}` },
                { key: "amount", title: copy.refundAmount, render: (row) => yen(row.refundAmountJpy) },
                { key: "reason", title: copy.complaintReason, render: (row) => row.dispute?.reason ?? "-" },
                { key: "status", title: copy.disputeStatus, render: (row) => <Badge tone={row.dispute?.status === "resolved" ? "green" : "red"}>{row.dispute?.status === "resolved" ? copy.resolved : copy.open}</Badge> }
              ]}
              frozenDetailLabel={copy.review}
              paginationMode="server"
              rows={result.list}
              onView={openReview}
            />
            <div aria-label={copy.paginationLabel} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3">
              <span className="text-sm font-bold text-ink/55">{copy.serverTotal} {result.total} {copy.records} · {copy.page} {result.page} {copy.of} {totalPages}</span>
              <div className="flex gap-2">
                <Button disabled={result.page <= 1} size="sm" variant="secondary" onClick={() => setPage(Math.max(1, result.page - 1))}>{copy.previous}</Button>
                <Button disabled={result.page >= totalPages} size="sm" variant="secondary" onClick={() => setPage(Math.min(totalPages, result.page + 1))}>{copy.next}</Button>
              </div>
            </div>
          </>
        ) : null}
      </ModuleShell>

      <Drawer open={Boolean(selected)} title={copy.detailTitle} onClose={closeReview}>
        {selected ? (
          <div className="space-y-5">
            <DetailGrid items={[
              { label: copy.caseId, value: selected.publicId },
              { label: copy.orderNo, value: selected.orderNo },
              { label: copy.shop, value: `${selected.shop.name} / ${selected.shop.shopNo ?? "-"}` },
              { label: copy.customer, value: `${selected.customer.displayName} / ${selected.customer.needoId}` },
              { label: copy.refundAmount, value: `${yen(selected.refundAmountJpy)} ${selected.currency}` },
              { label: copy.requestReason, value: selected.requestReason },
              { label: copy.merchantNote, value: selected.merchantDecisionNote ?? "-" },
              { label: copy.complaintReason, value: selected.dispute?.reason ?? "-" },
              { label: copy.responsibility, value: selected.responsibility === "shop" ? copy.shopResponsible : selected.responsibility },
              { label: copy.affiliateReward, value: selected.affiliateReward ? `${selected.affiliateReward.rewardNdp.toLocaleString("ja-JP")} ${copy.settledRewardSuffix}` : copy.none },
              { label: copy.disputeVersion, value: selected.dispute?.version ?? "-" }
            ]} />

            {selected.dispute?.status === "open" && canResolve ? (
              <section className="rounded-lg border border-line bg-paper p-4">
                <h3 className="font-black text-ink">{copy.resolutionTitle}</h3>
                <label className="mt-3 grid gap-1 text-xs font-bold text-ink/55">
                  {copy.publicReason}
                  <textarea
                    aria-label={copy.publicReason}
                    className="focus-ring min-h-24 rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink"
                    maxLength={500}
                    value={publicReason}
                    onChange={(event) => {
                      setPublicReason(event.target.value);
                      setConfirmResolution(null);
                    }}
                  />
                </label>
                <label className="mt-3 grid gap-1 text-xs font-bold text-ink/55">
                  {copy.internalNote}
                  <textarea
                    aria-label={copy.internalNote}
                    className="focus-ring min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink"
                    maxLength={1000}
                    value={internalNote}
                    onChange={(event) => {
                      setInternalNote(event.target.value);
                      setConfirmResolution(null);
                    }}
                  />
                </label>
                {mutationError ? <p className="mt-3 text-sm font-bold text-coral" role="alert">{mutationError}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button disabled={mutationState === "saving"} onClick={() => void submitResolution("refund")}>
                    {confirmResolution === "refund" ? copy.confirmResolveRefund : copy.resolveRefund}
                  </Button>
                  <Button disabled={mutationState === "saving"} variant="danger" onClick={() => void submitResolution("reject")}>
                    {confirmResolution === "reject" ? copy.confirmRejectRefund : copy.rejectRefund}
                  </Button>
                </div>
              </section>
            ) : null}

            {selected.dispute?.status === "open" && !canResolve ? (
              <p className="rounded-lg border border-line bg-paper p-4 text-sm font-bold text-ink/55">
                {copy.readOnlyNotice}
              </p>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
