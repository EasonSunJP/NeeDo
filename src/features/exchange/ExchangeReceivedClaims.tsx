import { useEffect, useRef, useState } from "react";
import { AvatarImage } from "../../components/ui/AvatarImage";
import type { Language } from "../../i18n/translations";
import {
  getExchangeMatching,
  listReceivedExchangeClaims,
  selectExchangeMatching
} from "./api";
import { exchangeText, type ExchangeTextKey } from "./i18n";
import type { ExchangeClaim, ExchangeMatching } from "./types";

const fallbackProviderImage = "/icons/needo-nav-button-dark.png";
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

function ClaimCard({
  claim,
  language,
  onToggle,
  selectable,
  selected
}: {
  claim: ExchangeClaim;
  language: Language;
  onToggle: () => void;
  selectable: boolean;
  selected: boolean;
}) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
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
          src={claim.provider.avatarUrl || fallbackProviderImage}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-[color:var(--client-text)]">{claim.provider.displayName}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] font-black text-[color:var(--client-primary)]">{claim.provider.publicId}</p>
        </div>
        <span className="max-w-[42%] rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1.5 text-center text-[10px] font-black leading-4 text-[color:var(--client-primary)]">
          {t(statusTextKey(claim.status))}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-[color:var(--client-muted)]">{t("claimService")}</p>
            <h3 className="mt-1 truncate text-base font-black text-[color:var(--client-text)]">{claim.service.name}</h3>
          </div>
          <strong className="shrink-0 text-xl font-black text-[color:var(--client-primary)]">¥{claim.quoteAmountJpy.toLocaleString("ja-JP")}</strong>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="min-w-0 rounded-2xl bg-[color:var(--client-bg)] p-3">
            <dt className="font-black text-[color:var(--client-muted)]">{t("claimShop")}</dt>
            <dd className="mt-1 truncate font-bold text-[color:var(--client-text)]">{claim.shop.name}</dd>
          </div>
          <div className="min-w-0 rounded-2xl bg-[color:var(--client-bg)] p-3">
            <dt className="font-black text-[color:var(--client-muted)]">{t("claimTechnician")}</dt>
            <dd className="mt-1 truncate font-bold text-[color:var(--client-text)]">{claim.technician.displayName}</dd>
          </div>
        </dl>

        <div className="mt-3 flex items-center gap-3 rounded-2xl border-l-2 border-[color:var(--client-primary)] bg-[color:var(--client-bg)] px-3 py-3">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--client-primary)] shadow-[0_0_14px_color-mix(in_srgb,var(--client-primary)_70%,transparent)]" />
          <div>
            <p className="text-[10px] font-black text-[color:var(--client-muted)]">{t("claimEstimatedTime")}</p>
            <p className="mt-0.5 text-xs font-black text-[color:var(--client-text)]">{formatWindow(claim.estimatedStartsAt, claim.estimatedEndsAt, language)}</p>
          </div>
        </div>

        {claim.message ? (
          <div className="mt-3 rounded-2xl bg-[color:var(--client-bg)] px-3 py-3">
            <p className="text-[10px] font-black text-[color:var(--client-muted)]">{t("claimMessageOptional")}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-[color:var(--client-text)]">{claim.message}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ExchangeReceivedClaims({
  language,
  onMatched,
  postId
}: {
  language: Language;
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
  const selectionAttemptRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setMatchingError(false);
    setSelectedClaimIds([]);
    selectionAttemptRef.current = null;
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
        setMatching(currentMatching);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId]);

  async function refreshPersistedState() {
    const [claimPage, currentMatching] = await Promise.all([
      listReceivedExchangeClaims(postId, { page: 1, pageSize: 10 }),
      getExchangeMatching(postId)
    ]);
    setClaims(claimPage.list);
    setPage(claimPage.page);
    setTotal(claimPage.total);
    setMatching(currentMatching);
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

  function toggleClaim(claimId: number) {
    if (!matching || matching.status !== "open" || !matching.viewer.canSelect) return;
    setMatchingError(false);
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
  const canComplete = Boolean(
    matching?.status === "open" &&
      matching.viewer.canSelect &&
      exactCount &&
      withinBudget &&
      !matchingPending
  );

  async function completeMatching() {
    if (!matching || !canComplete) return;
    const selectedClaimIdsSorted = [...selectedClaimIds].sort((left, right) => left - right);
    const input = {
      selectedClaimIds: selectedClaimIdsSorted,
      expectedVersion: matching.version
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
      setMatching(completed);
      setSelectedClaimIds([]);
      selectionAttemptRef.current = null;
      onMatched?.();
      void listReceivedExchangeClaims(postId, { page: 1, pageSize: 10 }).then((claimPage) => {
        setClaims(claimPage.list);
        setPage(claimPage.page);
        setTotal(claimPage.total);
      });
    } catch {
      setMatchingError(true);
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
      <p className="mt-3 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">{t("receivedClaimsIntro")}</p>

      {loading ? <p className="mt-5 text-sm font-bold text-[color:var(--client-muted)]">{t("matchingLoading")}</p> : null}
      {error ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("receivedClaimsFailed")}</p> : null}
      {matchingError ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("matchingFailed")}</p> : null}
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
          {matching.status === "open" ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black">
                <span className="text-[color:var(--client-muted)]">{t("matchingSelectedCount")} {selectedClaimIds.length}/{matching.effectiveTargetProviderCount}</span>
                <span className={withinBudget ? "text-[color:var(--client-text)]" : "text-[color:var(--client-accent)]"}>{t("matchingSelectedQuote")} ¥{selectedQuoteTotalJpy.toLocaleString("ja-JP")}</span>
              </div>
              <p className={`mt-2 text-[11px] font-bold ${exactCount && withinBudget ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-muted)]"}`}>
                {!exactCount
                  ? t("matchingCountRequired")
                  : withinBudget
                    ? t("matchingComplete")
                    : t("matchingBudgetExceeded")}
              </p>
            </>
          ) : (
            <div className="mt-3 rounded-2xl bg-[color:var(--client-primary-soft)] px-3 py-3">
              <p className="text-sm font-black text-[color:var(--client-primary)]">{t("matchingCompleted")}</p>
              <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{t("matchingNoBooking")}</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {claims.map((claim) => (
          <ClaimCard
            claim={claim}
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

      {matching?.status === "open" && matching.viewer.canSelect ? (
        <button
          className="focus-ring mt-4 min-h-12 w-full rounded-2xl bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-40"
          data-action="complete-exchange-match"
          disabled={!canComplete}
          onClick={() => void completeMatching()}
          type="button"
        >
          {t(matchingPending ? "matchingCompleting" : "matchingComplete")}
        </button>
      ) : null}

      {matching?.status === "matched" && matching.participants.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-black text-[color:var(--client-text)]">{t("matchingParticipants")}</h3>
          <div className="mt-2 grid gap-2">
            {matching.participants.map((participant) => (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--client-bg-soft)] px-3 py-3" key={participant.exchangeClaimId}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[color:var(--client-text)]">{participant.provider.displayName}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] font-black text-[color:var(--client-primary)]">{participant.provider.publicId}</p>
                </div>
                <strong className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">¥{participant.quoteAmountJpy.toLocaleString("ja-JP")}</strong>
              </div>
            ))}
          </div>
        </div>
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
