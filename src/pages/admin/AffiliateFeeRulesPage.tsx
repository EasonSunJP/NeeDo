import { useEffect, useMemo, useRef, useState } from "react";
import {
  affiliatePlatformFeeApi,
  type AffiliatePlatformFeeRule,
  type AffiliatePlatformFeeRuleSummary,
  type AffiliatePlatformFeeScope,
  type AffiliatePlatformFeeShopOption
} from "../../api/affiliatePlatformFee";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales } from "../../i18n/translations";
import { getAffiliateFeeRuleCopy, type AffiliateFeeRuleCopy } from "./affiliateFeeRuleCopy";
import {
  buildAffiliateFeeCreateInput,
  classifyAffiliateFeeRule,
  validateAffiliateFeeDraft,
  type AffiliateFeeDraft,
  type AffiliateFeeDraftErrors,
  type AffiliateFeeRuleStatus
} from "./affiliateFeeRuleModel";

const pageSize = 20;
const shopSearchPageSize = 10;
const affiliateFeeVersionConflictCode = 40945;
const affiliateFeePolicyConflictCode = 40946;

type LoadStatus = "loading" | "success" | "error";
type MutationStatus = "idle" | "preparing" | "saving";
type ScopeFilter = "all" | AffiliatePlatformFeeScope;

interface FeeRuleConfirmation {
  expectedVersion: number;
  previousFeeBps: number | null;
  preparedAt: Date;
}

function createEmptyDraft(): AffiliateFeeDraft {
  return {
    scopeType: "global",
    shop: null,
    percent: "10",
    effectiveMode: "now",
    scheduledAt: "",
    reason: ""
  };
}

function describeReadError(error: unknown, copy: AffiliateFeeRuleCopy) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return copy.sessionExpired;
    if (error.status === 403) return copy.permissionDenied;
  }
  return copy.loadFailed;
}

function statusTone(status: AffiliateFeeRuleStatus): BadgeTone {
  if (status === "current") return "green";
  if (status === "scheduled") return "yellow";
  return "neutral";
}

export function AffiliateFeeRulesPage() {
  const { language } = useI18n();
  const copy = useMemo(() => getAffiliateFeeRuleCopy(language), [language]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(languageLocales[language], { dateStyle: "medium", timeStyle: "short" }),
    [language]
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(languageLocales[language]), [language]);
  const formatDate = (value: string | null) => value ? dateFormatter.format(new Date(value)) : "—";
  const formatRate = (feeBps: number | null | undefined) =>
    feeBps === null || feeBps === undefined ? copy.none : `${(feeBps / 100).toFixed(2)}%`;

  const [summary, setSummary] = useState<AffiliatePlatformFeeRuleSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<LoadStatus>("loading");
  const [summaryError, setSummaryError] = useState("");
  const [rows, setRows] = useState<AffiliatePlatformFeeRule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [historyStatus, setHistoryStatus] = useState<LoadStatus>("loading");
  const [historyError, setHistoryError] = useState("");
  const [revision, setRevision] = useState(0);
  const summaryRequestId = useRef(0);
  const historyRequestId = useRef(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<AffiliateFeeDraft>(() => createEmptyDraft());
  const [draftErrors, setDraftErrors] = useState<AffiliateFeeDraftErrors>({});
  const [confirmation, setConfirmation] = useState<FeeRuleConfirmation | null>(null);
  const [mutationStatus, setMutationStatus] = useState<MutationStatus>("idle");
  const [mutationError, setMutationError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [shopQuery, setShopQuery] = useState("");
  const [shopOptions, setShopOptions] = useState<AffiliatePlatformFeeShopOption[]>([]);
  const [shopSearchStatus, setShopSearchStatus] = useState<"idle" | LoadStatus>("idle");
  const [shopSearchError, setShopSearchError] = useState("");
  const shopSearchRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++summaryRequestId.current;
    setSummaryStatus("loading");
    setSummaryError("");
    affiliatePlatformFeeApi.getGlobalSummary().then((response) => {
      if (requestId !== summaryRequestId.current) return;
      setSummary(response);
      setSummaryStatus("success");
    }).catch((error: unknown) => {
      if (requestId !== summaryRequestId.current) return;
      setSummary(null);
      setSummaryError(describeReadError(error, copy));
      setSummaryStatus("error");
    });
  }, [copy, revision]);

  useEffect(() => {
    const requestId = ++historyRequestId.current;
    setHistoryStatus("loading");
    setHistoryError("");
    affiliatePlatformFeeApi.listRules({
      page,
      pageSize,
      scopeType: scopeFilter === "all" ? undefined : scopeFilter
    }).then((response) => {
      if (requestId !== historyRequestId.current) return;
      setRows(response.list);
      setTotal(response.total);
      setHistoryStatus("success");
    }).catch((error: unknown) => {
      if (requestId !== historyRequestId.current) return;
      setRows([]);
      setTotal(0);
      setHistoryError(describeReadError(error, copy));
      setHistoryStatus("error");
    });
  }, [copy, page, revision, scopeFilter]);

  useEffect(() => {
    if (!drawerOpen || draft.scopeType !== "shop") {
      shopSearchRequestId.current += 1;
      setShopOptions([]);
      setShopSearchStatus("idle");
      setShopSearchError("");
      return;
    }

    const timeout = window.setTimeout(() => {
      const requestId = ++shopSearchRequestId.current;
      setShopSearchStatus("loading");
      setShopSearchError("");
      affiliatePlatformFeeApi.searchShops({
        keyword: shopQuery.trim() || undefined,
        page: 1,
        pageSize: shopSearchPageSize
      }).then((response) => {
        if (requestId !== shopSearchRequestId.current) return;
        setShopOptions(response.list);
        setShopSearchStatus("success");
      }).catch(() => {
        if (requestId !== shopSearchRequestId.current) return;
        setShopOptions([]);
        setShopSearchError(copy.shopSearchFailed);
        setShopSearchStatus("error");
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [copy.shopSearchFailed, draft.scopeType, drawerOpen, shopQuery]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const evaluatedAt = summary?.evaluatedAt ?? new Date().toISOString();

  const resetConfirmation = () => {
    setConfirmation(null);
    setMutationError("");
    setSuccessMessage("");
  };

  const patchDraft = (patch: Partial<AffiliateFeeDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDraftErrors({});
    resetConfirmation();
  };

  const setSelectedShop = (shop: AffiliatePlatformFeeShopOption | null) => {
    patchDraft({ shop });
    if (shop) setShopQuery(`${shop.name} · #${shop.id}`);
  };

  const openDrawer = () => {
    setDraft(createEmptyDraft());
    setDraftErrors({});
    setConfirmation(null);
    setMutationError("");
    setSuccessMessage("");
    setShopQuery("");
    setShopOptions([]);
    setShopSearchStatus("idle");
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (mutationStatus === "saving") return;
    shopSearchRequestId.current += 1;
    setDrawerOpen(false);
    setConfirmation(null);
  };

  const loadLatestTargetVersion = async (targetDraft: AffiliateFeeDraft) => {
    const response = await affiliatePlatformFeeApi.listRules({
      page: 1,
      pageSize: 1,
      scopeType: targetDraft.scopeType,
      shopId: targetDraft.scopeType === "shop" ? targetDraft.shop?.id : undefined
    });
    const latest = response.list[0] ?? null;
    return {
      expectedVersion: latest?.version ?? 0,
      previousFeeBps: latest?.feeBps ?? null
    };
  };

  const prepareConfirmation = async () => {
    if (mutationStatus !== "idle") return;
    const preparedAt = new Date();
    const errors = validateAffiliateFeeDraft(draft, preparedAt);
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setMutationStatus("preparing");
    setMutationError("");
    try {
      const latest = await loadLatestTargetVersion(draft);
      setConfirmation({ ...latest, preparedAt });
    } catch (error: unknown) {
      setMutationError(describeReadError(error, copy));
    } finally {
      setMutationStatus("idle");
    }
  };

  const createRule = async () => {
    if (!confirmation || mutationStatus !== "idle") return;
    setMutationStatus("saving");
    setMutationError("");
    try {
      await affiliatePlatformFeeApi.createRule(
        buildAffiliateFeeCreateInput(draft, confirmation.expectedVersion, confirmation.preparedAt)
      );
      setSuccessMessage(copy.success);
      setConfirmation(null);
      setRevision((value) => value + 1);
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 404 && draft.scopeType === "shop") {
        setSelectedShop(null);
        setMutationError(copy.shopUnavailable);
      } else if (error instanceof ApiClientError && error.status === 409 && error.code === affiliateFeeVersionConflictCode) {
        try {
          await loadLatestTargetVersion(draft);
        } catch {
          // The conflict remains actionable even if the refresh itself is unavailable.
        }
        setConfirmation(null);
        setMutationError(copy.conflict);
      } else if (error instanceof ApiClientError && error.status === 409 && error.code === affiliateFeePolicyConflictCode) {
        setConfirmation(null);
        setMutationError(copy.policyConflict);
      } else if (error instanceof ApiClientError && error.status === 401) {
        setMutationError(copy.sessionExpired);
      } else if (error instanceof ApiClientError && error.status === 403) {
        setMutationError(copy.permissionDenied);
      } else {
        setMutationError(copy.saveFailed);
      }
    } finally {
      setMutationStatus("idle");
    }
  };

  const statusLabel = (status: AffiliateFeeRuleStatus) => copy[status];
  const shopLabel = (rule: AffiliatePlatformFeeRule) => rule.scopeType === "global"
    ? copy.global
    : `${rule.shopName ?? copy.shop} · #${rule.shopId ?? "—"}${rule.shopCity ? ` · ${rule.shopCity}` : ""}`;

  return (
    <AdminLayout>
      <div data-no-i18n>
        <ModuleShell
          title={copy.title}
          description={copy.description}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">{copy.formalData}</Badge>
              <Badge tone="blue">{copy.audit}</Badge>
              <Badge tone="neutral">{copy.snapshot}</Badge>
              <PermissionGate permission="button:backoffice-affiliate-fee-rule-create">
                <Button onClick={openDrawer}>{copy.create}</Button>
              </PermissionGate>
            </div>
          )}
        >
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
            {copy.lifecycleWarning}
          </section>

          {summaryStatus === "loading" ? (
            <section aria-live="polite" className="rounded-xl border border-line bg-white p-6 text-sm font-bold text-ink/55 shadow-panel">{copy.loading}</section>
          ) : null}
          {summaryStatus === "error" ? (
            <section className="rounded-xl border border-coral/30 bg-coral/5 p-5" role="alert">
              <p className="font-black text-ink">{summaryError}</p>
              <Button className="mt-3" onClick={() => setRevision((value) => value + 1)} size="sm">{copy.retry}</Button>
            </section>
          ) : null}
          {summaryStatus === "success" && summary ? (
            <section className="grid gap-3 md:grid-cols-3">
              {[
                [copy.currentRate, formatRate(summary.current?.feeBps), summary.current ? `v${summary.current.version}` : copy.none],
                [copy.nextRate, formatRate(summary.nextScheduled?.feeBps), summary.nextScheduled ? formatDate(summary.nextScheduled.effectiveFrom) : copy.none],
                [copy.latestVersion, `v${numberFormatter.format(summary.latestVersion)}`, formatDate(summary.evaluatedAt)]
              ].map(([label, value, detail]) => (
                <article className="rounded-xl border border-line bg-white p-5 shadow-panel" key={label}>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">{label}</p>
                  <strong className="mt-2 block text-3xl font-black text-ink">{value}</strong>
                  <span className="mt-2 block text-xs font-bold text-ink/45">{detail}</span>
                </article>
              ))}
            </section>
          ) : null}

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-ink">{copy.history}</h2>
                <p className="mt-1 text-sm font-bold text-ink/45">{copy.pageSummary(total, page, totalPages)}</p>
              </div>
              <label className="grid gap-1 text-xs font-black text-ink/55">
                {copy.scope}
                <select
                  className="h-10 min-w-44 rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink"
                  onChange={(event) => { setPage(1); setScopeFilter(event.target.value as ScopeFilter); }}
                  value={scopeFilter}
                >
                  <option value="all">{copy.allScopes}</option>
                  <option value="global">{copy.global}</option>
                  <option value="shop">{copy.shop}</option>
                </select>
              </label>
            </div>

            {historyStatus === "loading" ? (
              <section aria-live="polite" className="rounded-xl border border-line bg-white px-5 py-12 text-center shadow-panel"><p className="text-sm font-black text-ink/55">{copy.loading}</p></section>
            ) : null}
            {historyStatus === "error" ? (
              <section className="rounded-xl border border-coral/30 bg-coral/5 px-5 py-10 text-center shadow-panel" role="alert">
                <h3 className="font-black text-ink">{historyError}</h3>
                <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>{copy.retry}</Button>
              </section>
            ) : null}
            {historyStatus === "success" && rows.length === 0 ? (
              <section className="rounded-xl border border-dashed border-line bg-white px-5 py-12 text-center shadow-panel"><p className="text-sm font-black text-ink/55">{copy.empty}</p></section>
            ) : null}
            {historyStatus === "success" && rows.length > 0 ? (
              <>
                <DataTable<AffiliatePlatformFeeRule>
                  columns={[
                    { key: "scope", title: copy.scope, width: "230px", render: shopLabel },
                    { key: "rate", title: copy.rate, render: (row) => <strong>{formatRate(row.feeBps)}</strong>, sortValue: (row) => row.feeBps },
                    { key: "version", title: copy.version, render: (row) => `v${row.version}`, sortValue: (row) => row.version },
                    { key: "effective", title: copy.effectiveRange, width: "320px", render: (row) => `${formatDate(row.effectiveFrom)} — ${formatDate(row.effectiveTo)}` },
                    { key: "status", title: copy.status, render: (row) => { const status = classifyAffiliateFeeRule(row, evaluatedAt); return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>; } },
                    { key: "reason", title: copy.reason, width: "260px", render: (row) => row.reason },
                    { key: "operator", title: copy.operator, render: (row) => row.createdByNeedoId ?? "—" },
                    { key: "createdAt", title: copy.createdAt, width: "190px", render: (row) => formatDate(row.createdAt) }
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
          </section>
        </ModuleShell>

        <Drawer onClose={closeDrawer} open={drawerOpen} title={confirmation ? copy.confirmTitle : copy.drawerTitle}>
          <div className="space-y-5">
            {mutationError ? <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm font-black text-coral" role="alert">{mutationError}</p> : null}
            {successMessage ? <p className="rounded-lg border border-moss/30 bg-moss/10 p-3 text-sm font-black text-ink" role="status">{successMessage}</p> : null}

            {confirmation ? (
              <section className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [copy.scope, draft.scopeType === "global" ? copy.global : `${draft.shop?.name ?? copy.shop} · #${draft.shop?.id ?? "—"}`],
                    [copy.oldRate, formatRate(confirmation.previousFeeBps)],
                    [copy.newRate, `${draft.percent}%`],
                    [copy.version, `v${confirmation.expectedVersion} → v${confirmation.expectedVersion + 1}`],
                    [copy.effectiveRange, draft.effectiveMode === "now" ? copy.immediately : formatDate(new Date(draft.scheduledAt).toISOString())],
                    [copy.reason, draft.reason.trim()]
                  ].map(([label, value]) => (
                    <div className="rounded-xl border border-line bg-paper p-4" key={label}>
                      <p className="text-xs font-black text-ink/45">{label}</p>
                      <p className="mt-2 break-words text-sm font-black text-ink">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={mutationStatus === "saving"} onClick={() => void createRule()}>{mutationStatus === "saving" ? copy.saving : copy.confirmCreate}</Button>
                  <Button disabled={mutationStatus === "saving"} onClick={() => setConfirmation(null)} variant="secondary">{copy.cancel}</Button>
                </div>
              </section>
            ) : (
              <section className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-sm font-black text-ink">{copy.scope}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(["global", "shop"] as const).map((scopeType) => (
                      <button
                        className={`rounded-xl border p-3 text-sm font-black transition ${draft.scopeType === scopeType ? "border-moss bg-moss/10 text-ink" : "border-line bg-white text-ink/55"}`}
                        key={scopeType}
                        onClick={() => patchDraft({ scopeType, shop: scopeType === "global" ? null : draft.shop })}
                        type="button"
                      >
                        {scopeType === "global" ? copy.global : copy.shop}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {draft.scopeType === "shop" ? (
                  <section className="rounded-xl border border-line bg-paper p-4">
                    <label className="block text-sm font-black text-ink" htmlFor="affiliate-fee-shop-search">{copy.searchShops}</label>
                    <input
                      autoComplete="off"
                      className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                      id="affiliate-fee-shop-search"
                      onChange={(event) => { setShopQuery(event.target.value); if (draft.shop) setSelectedShop(null); }}
                      placeholder={copy.searchPlaceholder}
                      value={shopQuery}
                    />
                    {draft.shop ? <Badge className="mt-3" tone="green">{copy.selectedShop}: {draft.shop.name} · #{draft.shop.id}</Badge> : null}
                    {shopSearchStatus === "loading" ? <p className="mt-3 text-xs font-bold text-ink/45">{copy.shopSearchLoading}</p> : null}
                    {shopSearchStatus === "error" ? <p className="mt-3 text-xs font-black text-coral">{shopSearchError}</p> : null}
                    {shopSearchStatus === "success" && shopOptions.length === 0 ? <p className="mt-3 text-xs font-bold text-ink/45">{copy.noShopResults}</p> : null}
                    {shopOptions.length > 0 ? (
                      <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                        {shopOptions.map((shop) => (
                          <button
                            className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-3 text-left transition hover:border-moss"
                            key={shop.id}
                            onClick={() => setSelectedShop(shop)}
                            type="button"
                          >
                            <span className="font-black text-ink">{shop.name}</span>
                            <span className="text-xs font-bold text-ink/45">#{shop.id} · {shop.city}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {draftErrors.shop ? <p className="mt-2 text-xs font-black text-coral">{copy.shopRequired}</p> : null}
                  </section>
                ) : null}

                <label className="block text-sm font-black text-ink">
                  {copy.percent}
                  <input
                    className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                    inputMode="decimal"
                    max="100"
                    min="0"
                    onChange={(event) => patchDraft({ percent: event.target.value })}
                    step="0.01"
                    type="number"
                    value={draft.percent}
                  />
                  {draftErrors.percent ? <span className="mt-2 block text-xs font-black text-coral">{copy.percentInvalid}</span> : null}
                </label>

                <fieldset>
                  <legend className="mb-2 text-sm font-black text-ink">{copy.effectiveMode}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(["now", "scheduled"] as const).map((mode) => (
                      <button
                        className={`rounded-xl border p-3 text-sm font-black transition ${draft.effectiveMode === mode ? "border-moss bg-moss/10 text-ink" : "border-line bg-white text-ink/55"}`}
                        key={mode}
                        onClick={() => patchDraft({ effectiveMode: mode })}
                        type="button"
                      >
                        {mode === "now" ? copy.immediately : copy.scheduled}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {draft.effectiveMode === "scheduled" ? (
                  <label className="block text-sm font-black text-ink">
                    {copy.scheduledAt}
                    <input
                      className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss"
                      onChange={(event) => patchDraft({ scheduledAt: event.target.value })}
                      type="datetime-local"
                      value={draft.scheduledAt}
                    />
                    {draftErrors.scheduledAt ? <span className="mt-2 block text-xs font-black text-coral">{copy.futureRequired}</span> : null}
                  </label>
                ) : null}

                <label className="block text-sm font-black text-ink">
                  {copy.reason}
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-lg border border-line bg-white p-3 text-sm font-bold outline-none focus:border-moss"
                    maxLength={500}
                    onChange={(event) => patchDraft({ reason: event.target.value })}
                    placeholder={copy.reasonPlaceholder}
                    value={draft.reason}
                  />
                  {draftErrors.reason ? <span className="mt-2 block text-xs font-black text-coral">{copy.reasonInvalid}</span> : null}
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button disabled={mutationStatus !== "idle"} onClick={() => void prepareConfirmation()}>{mutationStatus === "preparing" ? copy.loading : copy.continueAction}</Button>
                  <Button disabled={mutationStatus === "saving"} onClick={closeDrawer} variant="secondary">{copy.cancel}</Button>
                </div>
              </section>
            )}
          </div>
        </Drawer>
      </div>
    </AdminLayout>
  );
}
