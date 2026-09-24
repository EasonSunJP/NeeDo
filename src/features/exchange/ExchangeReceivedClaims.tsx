import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { ApiClientError } from "../../api/httpClient";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { getScheduleOrderDetailRoute } from "../../lib/scheduleDetailTarget";
import { getScopedProfileDetailPath, getScopedTechnicianServiceListPath } from "../../shared/profile-detail/paths";
import {
  confirmQuickExchangeBudget,
  createExchangeMatchingBookings,
  getExchangeMatching,
  listReceivedExchangeClaims,
  selectExchangeMatching
} from "./api";
import { exchangeText, type ExchangeTextKey } from "./i18n";
import { ExchangeOrderCancellationPanel } from "./ExchangeOrderCancellationPanel";
import type {
  ExchangeClaim,
  ExchangeMatchMode,
  ExchangeMatchAdjustmentPreview,
  ExchangeMatching,
  SelectExchangeMatchingInput
} from "./types";

const panelClassName =
  "rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel";

function localeForLanguage(language: Language) {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  if (language === "ja") return "ja-JP";
  if (language === "ko") return "ko-KR";
  return "en-US";
}

function formatWindow(startsAt: string, endsAt: string, language: Language) {
  const locale = localeForLanguage(language);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(start);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time.format(start)}–${time.format(end)}`;
}

function statusTextKey(status: ExchangeClaim["status"]): ExchangeTextKey {
  if (status === "withdrawn") return "claimStatusWithdrawn";
  if (status === "request_withdrawn") return "claimStatusRequestWithdrawn";
  if (status === "request_expired") return "claimStatusRequestExpired";
  if (status === "matched") return "claimStatusMatched";
  if (status === "not_selected") return "claimStatusNotSelected";
  if (status === "matching_closed") return "claimStatusMatchingClosed";
  return "claimStatusActive";
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function readAdjustmentPreview(
  error: unknown,
  matching: ExchangeMatching,
  selectedCount: number,
  selectedQuoteTotalJpy: number
): ExchangeMatchAdjustmentPreview | null {
  if (!(error instanceof ApiClientError) || error.status !== 409) return null;
  if (!error.data || typeof error.data !== "object" || Array.isArray(error.data)) return null;
  const value = error.data as Record<string, unknown>;
  if (
    !isIntegerInRange(value.currentVersion, 1, Number.MAX_SAFE_INTEGER) ||
    !isIntegerInRange(value.selectedCount, 1, 20) ||
    !isIntegerInRange(value.selectedQuoteTotalJpy, 1, 1_000_000_000) ||
    !isIntegerInRange(value.effectiveTargetProviderCount, 1, 20) ||
    !isIntegerInRange(value.effectiveBudgetMaxJpy, 1, 1_000_000_000) ||
    !isIntegerInRange(value.requiredBudgetIncreaseJpy, 0, 1_000_000_000) ||
    typeof value.requiresTargetConfirmation !== "boolean" ||
    typeof value.requiresBudgetConfirmation !== "boolean"
  ) {
    return null;
  }
  const requiredTargetProviderCount = value.requiredTargetProviderCount;
  const requiredBudgetMaxJpy = value.requiredBudgetMaxJpy;
  if (
    (requiredTargetProviderCount !== null &&
      !isIntegerInRange(requiredTargetProviderCount, 1, 20)) ||
    (requiredBudgetMaxJpy !== null &&
      !isIntegerInRange(requiredBudgetMaxJpy, 1, 1_000_000_000))
  ) {
    return null;
  }
  if (
    value.currentVersion !== matching.version ||
    value.selectedCount !== selectedCount ||
    value.selectedQuoteTotalJpy !== selectedQuoteTotalJpy ||
    value.effectiveTargetProviderCount !== matching.effectiveTargetProviderCount ||
    value.effectiveBudgetMaxJpy !== matching.effectiveBudgetMaxJpy ||
    (!value.requiresTargetConfirmation && !value.requiresBudgetConfirmation) ||
    (value.requiresTargetConfirmation
      ? requiredTargetProviderCount !== selectedCount ||
        selectedCount >= matching.effectiveTargetProviderCount
      : requiredTargetProviderCount !== null) ||
    (value.requiresBudgetConfirmation
      ? requiredBudgetMaxJpy !== selectedQuoteTotalJpy ||
        selectedQuoteTotalJpy <= matching.effectiveBudgetMaxJpy ||
        value.requiredBudgetIncreaseJpy !==
          selectedQuoteTotalJpy - matching.effectiveBudgetMaxJpy
      : requiredBudgetMaxJpy !== null || value.requiredBudgetIncreaseJpy !== 0)
  ) {
    return null;
  }
  return value as unknown as ExchangeMatchAdjustmentPreview;
}

function ClaimCard({
  claim,
  context,
  language,
  onToggle,
  selectable,
  selected
}: {
  claim: ExchangeClaim;
  context: MessageCenterContext;
  language: Language;
  onToggle: () => void;
  selectable: boolean;
  selected: boolean;
}) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  const [expanded, setExpanded] = useState(false);
  const shopPath = claim.shop.publicId ? getScopedProfileDetailPath(context, "shop", claim.shop.publicId) : null;
  const providerPath = claim.provider.publicId === claim.technician.publicId
    ? getScopedProfileDetailPath(context, "technician", claim.provider.publicId)
    : shopPath;
  const servicePath = claim.service.ref.startsWith("shop:")
    ? `/services/${encodeURIComponent(claim.service.publicId)}`
    : claim.shop.publicId
      ? getScopedTechnicianServiceListPath(context, claim.shop.publicId, claim.technician.publicId)
      : null;
  const sourceKey: ExchangeTextKey = claim.source === "automatic"
    ? "claimSourceAutomatic"
    : claim.source === "shop_dispatch"
      ? "claimSourceShopDispatch"
      : "claimSourceManual";
  return (
    <article
      className={`overflow-hidden rounded-[24px] border bg-[color:var(--client-bg-soft)] transition-colors ${selected ? "border-[color:var(--client-primary)] ring-2 ring-[color:var(--client-primary-soft)]" : "border-[color:var(--client-line)]"}`}
      data-claim-id={claim.id}
      data-no-i18n="true"
    >
      <div className="flex items-center gap-3 border-b border-[color:var(--client-line)] p-4">
        {selectable ? (
          <input
            aria-label={`${t("matchingSelectedCount")} ${claim.provider.displayName}`}
            checked={selected}
            className="focus-ring h-5 w-5 shrink-0 accent-[color:var(--client-primary)]"
            data-match-claim-id={claim.id}
            onChange={onToggle}
            type="checkbox"
          />
        ) : null}
        <AvatarImage
          alt={claim.provider.displayName}
          className="h-12 w-12 shrink-0 rounded-2xl border border-[color:var(--client-line)] object-cover"
          src={claim.provider.avatarUrl ?? undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-[color:var(--client-text)]">{claim.provider.displayName}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] font-black text-[color:var(--client-primary)]">{claim.provider.publicId}</p>
        </div>
        <span className="max-w-[42%] rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1.5 text-center text-[10px] font-black leading-4 text-[color:var(--client-primary)]">
          {t(statusTextKey(claim.status))}
        </span>
      </div>

      <div className="px-4 pb-2 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-[color:var(--client-muted)]">{t("claimService")}</p>
            <h3 className="mt-1 truncate text-base font-black text-[color:var(--client-text)]">{claim.service.name}</h3>
          </div>
          <strong className="shrink-0 text-xl font-black text-[color:var(--client-primary)]">¥{claim.quoteAmountJpy.toLocaleString("ja-JP")}</strong>
        </div>

        {expanded ? (
          <div className="mt-4 grid gap-3" id={`claim-details-${claim.id}`}>
            <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3 text-xs">
              <p className="font-black text-[color:var(--client-muted)]">{t("claimService")}</p>
              <p className="mt-1 font-black text-[color:var(--client-text)]">{claim.service.name} · {claim.service.durationMinutes} min</p>
              {servicePath ? <a className="focus-ring mt-2 inline-block font-black text-[color:var(--client-primary)]" href={`#${servicePath}`}>{t("claimShowDetails")}</a> : null}
            </div>
            <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3 text-xs">
              <p className="font-black text-[color:var(--client-muted)]">{t("claimProvider")}</p>
              <div className="mt-2 flex items-center gap-3">
                <AvatarImage alt={claim.provider.displayName} className="h-10 w-10 rounded-xl object-cover" src={claim.provider.avatarUrl ?? undefined} />
                <div><p className="font-black text-[color:var(--client-text)]">{claim.provider.displayName}</p><p className="font-mono text-[color:var(--client-muted)]">{claim.provider.publicId}</p></div>
              </div>
              {claim.provider.publicId !== claim.technician.publicId ? <p className="mt-2 font-bold text-[color:var(--client-text)]">{t("claimTechnician")} · {claim.technician.displayName}</p> : null}
              {providerPath ? <a className="focus-ring mt-2 inline-block font-black text-[color:var(--client-primary)]" href={`#${providerPath}`}>{t("claimShowDetails")}</a> : null}
            </div>
            <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3 text-xs">
              <p className="font-black text-[color:var(--client-muted)]">{t("claimShop")}</p>
              <p className="mt-1 font-black text-[color:var(--client-text)]">{claim.shop.name}</p>
              {claim.shop.publicId ? <p className="mt-1 font-mono text-[color:var(--client-muted)]">{claim.shop.publicId}</p> : null}
              {shopPath ? <a className="focus-ring mt-2 inline-block font-black text-[color:var(--client-primary)]" href={`#${shopPath}`}>{t("claimShowDetails")}</a> : null}
            </div>
            <dl className="grid gap-3 text-xs">
              <div className="rounded-2xl bg-[color:var(--client-bg)] p-3"><dt className="font-black text-[color:var(--client-muted)]">{t("claimEstimatedTime")}</dt><dd className="mt-1 font-bold text-[color:var(--client-text)]">{formatWindow(claim.estimatedStartsAt, claim.estimatedEndsAt, language)}</dd></div>
              <div className="rounded-2xl bg-[color:var(--client-bg)] p-3"><dt className="font-black text-[color:var(--client-muted)]">{t("claimSource")}</dt><dd className="mt-1 font-bold text-[color:var(--client-text)]">{t(sourceKey)}</dd></div>
              {claim.message ? <div className="rounded-2xl bg-[color:var(--client-bg)] p-3"><dt className="font-black text-[color:var(--client-muted)]">{t("claimMessageOptional")}</dt><dd className="mt-1 whitespace-pre-wrap font-semibold leading-5 text-[color:var(--client-text)]">{claim.message}</dd></div> : null}
            </dl>
          </div>
        ) : null}
        <button
          aria-controls={`claim-details-${claim.id}`}
          aria-expanded={expanded}
          className="focus-ring mx-auto mt-1 block min-h-10 w-fit px-3 text-center text-xs font-black text-[color:var(--client-primary)]"
          data-action={expanded ? "hide-claim-details" : "show-claim-details"}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >{t(expanded ? "claimHideDetails" : "claimShowDetails")}</button>
      </div>
    </article>
  );
}

export function ExchangeReceivedClaims({
  context = "user",
  language,
  matchMode = "selective",
  onEffectiveBudgetChange,
  onMatched,
  postId
}: {
  context?: MessageCenterContext;
  language: Language;
  matchMode?: ExchangeMatchMode;
  onEffectiveBudgetChange?: (budgetMaxJpy: number) => void;
  onMatched?: () => void;
  postId: string;
}) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  const [claims, setClaims] = useState<ExchangeClaim[]>([]);
  const [matching, setMatching] = useState<ExchangeMatching | null>(null);
  const [selectedClaimIds, setSelectedClaimIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [matchingError, setMatchingError] = useState(false);
  const [matchingPending, setMatchingPending] = useState(false);
  const [quickBudgetError, setQuickBudgetError] = useState(false);
  const [quickBudgetChangedRefreshed, setQuickBudgetChangedRefreshed] = useState(false);
  const [bookingPending, setBookingPending] = useState(false);
  const [bookingError, setBookingError] = useState(false);
  const [bookingStaleRefreshed, setBookingStaleRefreshed] = useState(false);
  const [adjustmentPreview, setAdjustmentPreview] =
    useState<ExchangeMatchAdjustmentPreview | null>(null);
  const [adjustmentChanged, setAdjustmentChanged] = useState(false);
  const selectionAttemptRef = useRef<{ signature: string; key: string } | null>(null);
  const quickBudgetAttemptRef = useRef<{ signature: string; key: string } | null>(null);
  const bookingAttemptRef = useRef<{ signature: string; key: string } | null>(null);
  const commitMatching = useCallback(
    (currentMatching: ExchangeMatching) => {
      setMatching(currentMatching);
      onEffectiveBudgetChange?.(currentMatching.effectiveBudgetMaxJpy);
    },
    [onEffectiveBudgetChange]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setMatchingError(false);
    setQuickBudgetError(false);
    setQuickBudgetChangedRefreshed(false);
    setBookingError(false);
    setBookingStaleRefreshed(false);
    setSelectedClaimIds([]);
    setAdjustmentPreview(null);
    setAdjustmentChanged(false);
    selectionAttemptRef.current = null;
    quickBudgetAttemptRef.current = null;
    bookingAttemptRef.current = null;
    void Promise.all([
      listReceivedExchangeClaims(postId, {
        page: 1,
        pageSize: 10,
        signal: controller.signal
      }),
      getExchangeMatching(postId, controller.signal)
    ])
      .then(([claimPage, currentMatching]) => {
        if (controller.signal.aborted) return;
        setClaims(claimPage.list);
        setPage(claimPage.page);
        setTotal(claimPage.total);
        commitMatching(currentMatching);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [commitMatching, postId]);

  async function refreshPersistedState() {
    const [claimPage, currentMatching] = await Promise.all([
      listReceivedExchangeClaims(postId, { page: 1, pageSize: 10 }),
      getExchangeMatching(postId)
    ]);
    setClaims(claimPage.list);
    setPage(claimPage.page);
    setTotal(claimPage.total);
    commitMatching(currentMatching);
    setAdjustmentPreview(null);
    setAdjustmentChanged(false);
    const activeIds = new Set(
      claimPage.list.filter((claim) => claim.status === "active").map((claim) => claim.id)
    );
    setSelectedClaimIds((current) => current.filter((claimId) => activeIds.has(claimId)));
  }

  async function loadMore() {
    if (loadingMore || claims.length >= total) return;
    setLoadingMore(true);
    setError(false);
    try {
      const next = await listReceivedExchangeClaims(postId, { page: page + 1, pageSize: 10 });
      setClaims((current) => [...current, ...next.list]);
      setPage(next.page);
      setTotal(next.total);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function createBookings() {
    if (!matching?.viewer.canCreateBookings || bookingPending) return;
    const signature = JSON.stringify({ postId, expectedVersion: matching.version });
    const attempt =
      bookingAttemptRef.current?.signature === signature
        ? bookingAttemptRef.current
        : { signature, key: globalThis.crypto.randomUUID() };
    bookingAttemptRef.current = attempt;
    setBookingPending(true);
    setBookingError(false);
    setBookingStaleRefreshed(false);
    try {
      await createExchangeMatchingBookings(postId, { expectedVersion: matching.version }, attempt.key);
      await refreshPersistedState();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 409) {
        try {
          await refreshPersistedState();
          setBookingStaleRefreshed(true);
        } catch {
          setError(true);
        }
      } else {
        setBookingError(true);
      }
    } finally {
      setBookingPending(false);
    }
  }

  async function confirmQuickBudgetDecision() {
    const decision = matching?.quickBudgetDecision;
    if (
      !matching ||
      matching.status !== "open" ||
      !matching.viewer.canConfirmQuickBudget ||
      !decision ||
      matchingPending
    ) {
      return;
    }
    const input = {
      expectedVersion: matching.version,
      budgetConfirmation: {
        action: decision.action,
        confirmedBudgetMaxJpy: decision.requiredBudgetMaxJpy
      }
    } as const;
    const signature = JSON.stringify({ postId, ...input });
    const attempt =
      quickBudgetAttemptRef.current?.signature === signature
        ? quickBudgetAttemptRef.current
        : { signature, key: globalThis.crypto.randomUUID() };
    quickBudgetAttemptRef.current = attempt;
    setMatchingPending(true);
    setQuickBudgetError(false);
    setQuickBudgetChangedRefreshed(false);
    try {
      const completed = await confirmQuickExchangeBudget(postId, input, attempt.key);
      commitMatching(completed);
      quickBudgetAttemptRef.current = null;
      try {
        await refreshPersistedState();
      } catch {
        setError(true);
      }
      onMatched?.();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 409) {
        quickBudgetAttemptRef.current = null;
        try {
          await refreshPersistedState();
          setQuickBudgetChangedRefreshed(true);
        } catch {
          setError(true);
        }
      } else {
        setQuickBudgetError(true);
      }
    } finally {
      setMatchingPending(false);
    }
  }

  function toggleClaim(claimId: number) {
    if (!matching || matching.status !== "open" || !matching.viewer.canSelect) return;
    setMatchingError(false);
    setAdjustmentPreview(null);
    setAdjustmentChanged(false);
    selectionAttemptRef.current = null;
    setSelectedClaimIds((current) => {
      if (current.includes(claimId)) return current.filter((id) => id !== claimId);
      if (matching.effectiveTargetProviderCount === 1) return [claimId];
      if (current.length >= matching.effectiveTargetProviderCount) return current;
      return [...current, claimId].sort((left, right) => left - right);
    });
  }

  const selectedQuoteTotalJpy = selectedClaimIds.reduce((sum, claimId) => {
    const selected = claims.find((claim) => claim.id === claimId);
    return sum + (selected?.quoteAmountJpy ?? 0);
  }, 0);
  const exactCount = Boolean(
    matching && selectedClaimIds.length === matching.effectiveTargetProviderCount
  );
  const withinBudget = Boolean(
    matching && selectedQuoteTotalJpy <= matching.effectiveBudgetMaxJpy
  );
  const canSubmitSelection = Boolean(
    matching?.status === "open" &&
      matching.viewer.canSelect &&
      selectedClaimIds.length > 0 &&
      selectedClaimIds.length <= matching.effectiveTargetProviderCount &&
      !matchingPending
  );
  const bookingsCreated = Boolean(
    matching?.status === "matched" &&
      matching.participants.length > 0 &&
      matching.participants.every((participant) => participant.booking !== null)
  );

  async function completeMatching(preview: ExchangeMatchAdjustmentPreview | null = null) {
    if (!matching || !canSubmitSelection) return;
    if (preview && preview !== adjustmentPreview) return;
    const selectedClaimIdsSorted = [...selectedClaimIds].sort((left, right) => left - right);
    const input: SelectExchangeMatchingInput = {
      selectedClaimIds: selectedClaimIdsSorted,
      expectedVersion: preview?.currentVersion ?? matching.version,
      budgetConfirmation:
        preview?.requiresBudgetConfirmation && preview.requiredBudgetMaxJpy !== null
          ? {
              action: "increase_to_selected_total",
              confirmedBudgetMaxJpy: preview.requiredBudgetMaxJpy
            }
          : null,
      targetConfirmation:
        preview?.requiresTargetConfirmation && preview.requiredTargetProviderCount !== null
          ? {
              action: "reduce_to_selected_count",
              confirmedTargetProviderCount: preview.requiredTargetProviderCount
            }
          : null
    };
    const signature = JSON.stringify(input);
    const attempt =
      selectionAttemptRef.current?.signature === signature
        ? selectionAttemptRef.current
        : { signature, key: globalThis.crypto.randomUUID() };
    selectionAttemptRef.current = attempt;
    setMatchingPending(true);
    setMatchingError(false);
    try {
      const completed = await selectExchangeMatching(postId, input, attempt.key);
      commitMatching(completed);
      setSelectedClaimIds([]);
      setAdjustmentPreview(null);
      setAdjustmentChanged(false);
      selectionAttemptRef.current = null;
      onMatched?.();
      void listReceivedExchangeClaims(postId, { page: 1, pageSize: 10 }).then((claimPage) => {
        setClaims(claimPage.list);
        setPage(claimPage.page);
        setTotal(claimPage.total);
      });
    } catch (caught) {
      const nextPreview = readAdjustmentPreview(
        caught,
        matching,
        selectedClaimIdsSorted.length,
        selectedQuoteTotalJpy
      );
      if (nextPreview) {
        setAdjustmentChanged(preview !== null);
        setAdjustmentPreview(nextPreview);
        selectionAttemptRef.current = null;
        return;
      }
      setMatchingError(true);
      setAdjustmentPreview(null);
      setAdjustmentChanged(false);
      try {
        await refreshPersistedState();
      } catch {
        setError(true);
      }
    } finally {
      setMatchingPending(false);
    }
  }

  return (
    <section className={panelClassName} data-testid="exchange-received-claims">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-black tracking-[0.24em] text-[color:var(--client-primary)]">CLAIM INBOX</p>
          <h2 className="mt-1 text-xl font-black text-[color:var(--client-text)]">{t("receivedClaimsTitle")}</h2>
        </div>
        <span className="rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] px-3 py-1.5 text-[10px] font-black text-[color:var(--client-muted)]">{total}</span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">
        {t(
          matchMode === "quick"
            ? "receivedQuickClaimsIntro"
            : "receivedClaimsIntro"
        )}
      </p>

      {loading ? <p className="mt-5 text-sm font-bold text-[color:var(--client-muted)]">{t("matchingLoading")}</p> : null}
      {error ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("receivedClaimsFailed")}</p> : null}
      {matchingError ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("matchingFailed")}</p> : null}
      {quickBudgetError ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("quickConfirmFailed")}</p> : null}
      {quickBudgetChangedRefreshed ? <p className="mt-5 text-sm font-bold text-[color:var(--client-primary)]" role="status">{t("quickBudgetChangedRefreshed")}</p> : null}
      {bookingError ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("bookingCreateFailed")}</p> : null}
      {bookingStaleRefreshed ? <p className="mt-5 text-sm font-bold text-[color:var(--client-primary)]" role="status">{t("bookingStaleRefreshed")}</p> : null}
      {!loading && !error && claims.length === 0 ? <p className="mt-5 rounded-[20px] bg-[color:var(--client-bg-soft)] px-4 py-6 text-center text-xs font-bold text-[color:var(--client-muted)]">{t("receivedClaimsEmpty")}</p> : null}

      {!loading && matching ? (
        <div className="mt-4 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] p-3">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl bg-[color:var(--client-bg)] p-3">
              <dt className="font-black text-[color:var(--client-muted)]">{t("matchingTarget")}</dt>
              <dd className="mt-1 text-lg font-black text-[color:var(--client-text)]">{matching.effectiveTargetProviderCount}</dd>
            </div>
            <div className="rounded-2xl bg-[color:var(--client-bg)] p-3 text-right">
              <dt className="font-black text-[color:var(--client-muted)]">{t("matchingBudget")}</dt>
              <dd className="mt-1 text-lg font-black text-[color:var(--client-primary)]">¥{matching.effectiveBudgetMaxJpy.toLocaleString("ja-JP")}</dd>
            </div>
          </dl>
          {matching.status === "open" && matching.viewer.canSelect ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black">
                <span className="text-[color:var(--client-muted)]">{t("matchingSelectedCount")} {selectedClaimIds.length}/{matching.effectiveTargetProviderCount}</span>
                <span className={withinBudget ? "text-[color:var(--client-text)]" : "text-[color:var(--client-accent)]"}>{t("matchingSelectedQuote")} ¥{selectedQuoteTotalJpy.toLocaleString("ja-JP")}</span>
              </div>
              {!exactCount ? (
                <p className="mt-2 text-[11px] font-bold text-[color:var(--client-muted)]">
                  {t("matchingCountRequired")}
                </p>
              ) : null}
              {!withinBudget ? (
                <p className="mt-2 text-[11px] font-bold text-[color:var(--client-accent)]">
                  {t("matchingBudgetExceeded")}
                </p>
              ) : null}
              {exactCount && withinBudget ? (
                <p className="mt-2 text-[11px] font-bold text-[color:var(--client-primary)]">
                  {t("matchingComplete")}
                </p>
              ) : null}
            </>
          ) : matching.status === "open" ? (
            <div className="mt-3 rounded-2xl bg-[color:var(--client-bg)] px-3 py-3">
              <p className="text-sm font-black text-[color:var(--client-primary)]">
                {t(matching.quickBudgetDecision ? "quickTargetReached" : "quickMatchingWaiting")}
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">
                {t(
                  matching.quickBudgetDecision
                    ? "quickBudgetExceeded"
                    : "quickMatchingWaitingDetail"
                )}
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl bg-[color:var(--client-primary-soft)] px-3 py-3">
              <p className="text-sm font-black text-[color:var(--client-primary)]">{t("matchingCompleted")}</p>
              <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{t("matchingNoBooking")}</p>
            </div>
          )}
        </div>
      ) : null}

      {matching?.status === "open" &&
      matching.viewer.canConfirmQuickBudget &&
      matching.quickBudgetDecision ? (
        <div
          className="mt-4 min-w-0 rounded-[22px] border border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] p-4"
          data-testid="exchange-quick-budget-decision"
        >
          <h3 className="text-sm font-black text-[color:var(--client-primary)]">
            {t("quickTargetReached")}
          </h3>
          <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-text)]">
            {t("quickBudgetExceeded")}
          </p>
          <dl className="mt-3 grid min-w-0 gap-2 text-xs sm:grid-cols-2">
            <div className="min-w-0 rounded-2xl bg-[color:var(--client-bg)] p-3">
              <dt className="font-black text-[color:var(--client-muted)]">
                {t("matchingTarget")}
              </dt>
              <dd className="mt-1 break-words text-base font-black text-[color:var(--client-text)]">
                {matching.quickBudgetDecision.activeClaimCount}/
                {matching.effectiveTargetProviderCount}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-[color:var(--client-bg)] p-3">
              <dt className="font-black text-[color:var(--client-muted)]">
                {t("matchingBudgetIncreaseProposal")}
              </dt>
              <dd className="mt-1 break-words text-base font-black text-[color:var(--client-text)]">
                ¥{matching.quickBudgetDecision.effectiveBudgetMaxJpy.toLocaleString("ja-JP")} → ¥
                {matching.quickBudgetDecision.requiredBudgetMaxJpy.toLocaleString("ja-JP")}
              </dd>
              <dd className="mt-1 font-black text-[color:var(--client-primary)]">
                {t("matchingBudgetIncreaseAmount")} ¥
                {matching.quickBudgetDecision.requiredBudgetIncreaseJpy.toLocaleString("ja-JP")}
              </dd>
            </div>
          </dl>
          <button
            className="focus-ring mt-3 min-h-12 w-full rounded-2xl bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-40"
            data-action="confirm-quick-exchange-budget"
            disabled={matchingPending}
            onClick={() => void confirmQuickBudgetDecision()}
            type="button"
          >
            {t(matchingPending ? "quickConfirming" : "quickConfirmAll")} · ¥
            {matching.quickBudgetDecision.requiredBudgetMaxJpy.toLocaleString("ja-JP")}
          </button>
        </div>
      ) : null}

      {adjustmentPreview ? (
        <div
          className="mt-4 min-w-0 rounded-[22px] border border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] p-4"
          data-testid="exchange-matching-adjustment-preview"
        >
          <h3 className="text-sm font-black text-[color:var(--client-primary)]">
            {t("matchingAdjustmentTitle")}
          </h3>
          <div className="mt-3 grid min-w-0 gap-2 text-xs sm:grid-cols-2">
            {adjustmentPreview.requiresTargetConfirmation ? (
              <div className="min-w-0 rounded-2xl bg-[color:var(--client-bg)] p-3">
                <p className="font-black text-[color:var(--client-muted)]">
                  {t("matchingTargetReductionProposal")}
                </p>
                <p className="mt-1 break-words text-base font-black text-[color:var(--client-text)]">
                  {adjustmentPreview.effectiveTargetProviderCount} → {adjustmentPreview.requiredTargetProviderCount}
                </p>
              </div>
            ) : null}
            {adjustmentPreview.requiresBudgetConfirmation ? (
              <div className="min-w-0 rounded-2xl bg-[color:var(--client-bg)] p-3">
                <p className="font-black text-[color:var(--client-muted)]">
                  {t("matchingBudgetIncreaseProposal")}
                </p>
                <p className="mt-1 break-words text-base font-black text-[color:var(--client-text)]">
                  ¥{adjustmentPreview.effectiveBudgetMaxJpy.toLocaleString("ja-JP")} → ¥
                  {adjustmentPreview.requiredBudgetMaxJpy?.toLocaleString("ja-JP")}
                </p>
                <p className="mt-1 font-black text-[color:var(--client-primary)]">
                  {t("matchingBudgetIncreaseAmount")} ¥
                  {adjustmentPreview.requiredBudgetIncreaseJpy.toLocaleString("ja-JP")}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-[color:var(--client-text)]">
            {adjustmentChanged
              ? t("matchingAdjustmentChanged")
              : t("matchingAdjustmentWarning")}
          </p>
          <button
            className="focus-ring mt-3 min-h-12 w-full rounded-2xl bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-40"
            data-action="confirm-exchange-match-adjustment"
            disabled={matchingPending}
            onClick={() => void completeMatching(adjustmentPreview)}
            type="button"
          >
            {t(matchingPending ? "matchingCompleting" : "matchingConfirmAdjustment")}
          </button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {claims.map((claim) => (
          <ClaimCard
            claim={claim}
            context={context}
            key={claim.id}
            language={language}
            onToggle={() => toggleClaim(claim.id)}
            selectable={Boolean(
              matching?.status === "open" &&
                matching.viewer.canSelect &&
                claim.status === "active"
            )}
            selected={selectedClaimIds.includes(claim.id)}
          />
        ))}
      </div>

      {matching?.status === "open" && matching.viewer.canSelect && !adjustmentPreview ? (
        <button
          className="focus-ring mt-4 min-h-12 w-full rounded-2xl bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-40"
          data-action="complete-exchange-match"
          disabled={!canSubmitSelection}
          onClick={() => void completeMatching(null)}
          type="button"
        >
          {t(matchingPending ? "matchingCompleting" : "matchingComplete")}
        </button>
      ) : null}

      {matching?.status === "matched" && matching.participants.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-black text-[color:var(--client-text)]">{t("matchingParticipants")}</h3>
          {bookingsCreated ? <p className="mt-2 text-xs font-black text-[color:var(--client-primary)]" role="status">{t("bookingCreated")}</p> : null}
          <div className="mt-2 grid gap-2">
            {matching.participants.map((participant) => (
              <div className="min-w-0" key={participant.exchangeClaimId}>
                <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-[color:var(--client-bg-soft)] px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[color:var(--client-text)]">{participant.provider.displayName}</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] font-black text-[color:var(--client-primary)]">{participant.provider.publicId}</p>
                    {participant.booking ? (
                      <p className="mt-1 truncate text-[11px] font-black text-[color:var(--client-muted)]">
                        {t("bookingOrderNumber")} · {participant.booking.orderNo}
                        {participant.booking.status === "pending" ? ` · ${t("bookingPending")}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <strong className="block text-sm font-black text-[color:var(--client-primary)]">¥{participant.quoteAmountJpy.toLocaleString("ja-JP")}</strong>
                    {participant.booking ? (
                      <a
                        aria-label={t("bookingViewOrder")}
                        className="focus-ring mt-1 inline-flex min-h-8 items-center rounded-full border border-[color:var(--client-line)] px-2.5 text-[10px] font-black text-[color:var(--client-text)]"
                        href={`#${getScheduleOrderDetailRoute(String(participant.booking.orderId), context)}`}
                      >
                        {t("bookingViewOrder")}
                      </a>
                    ) : null}
                  </div>
                </div>
                {participant.booking ? <div className="mt-2"><ExchangeOrderCancellationPanel language={language} orderId={participant.booking.orderId} /></div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {matching?.viewer.canCreateBookings ? (
        <section className="mt-4 rounded-[22px] border border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] p-4" data-testid="exchange-booking-conversion">
          <h3 className="text-base font-black text-[color:var(--client-text)]">{t("bookingTitle")}</h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-[color:var(--client-text)]">{t("bookingBatchExplanation")}</p>
          <p className="mt-2 text-xs font-black text-[color:var(--client-primary)]">{t("bookingNoCharge")}</p>
          <button
            className="focus-ring mt-4 min-h-12 w-full rounded-2xl bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-40"
            data-action="create-exchange-bookings"
            disabled={bookingPending}
            onClick={() => void createBookings()}
            type="button"
          >
            {t(bookingPending ? "bookingCreating" : bookingError ? "bookingRetry" : "bookingConfirm")}
          </button>
        </section>
      ) : null}

      {claims.length < total ? (
        <button
          className="focus-ring mt-4 min-h-11 w-full rounded-2xl border border-[color:var(--client-line)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-50"
          data-action="load-more-claims"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          type="button"
        >
          {t(loadingMore ? "loadingMore" : "loadMore")}
        </button>
      ) : null}
    </section>
  );
}
