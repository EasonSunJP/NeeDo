import { useEffect, useRef, useState } from "react";
import type { Language } from "../../i18n/translations";
import {
  createExchangeClaim,
  getMyExchangeClaim,
  listExchangeClaimOptions,
  withdrawExchangeClaim
} from "./api";
import { exchangeText, type ExchangeTextKey } from "./i18n";
import type { ExchangeClaim, ExchangeClaimOption, ExchangePost } from "./types";

const panelClassName =
  "rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel";
const fieldClassName =
  "focus-ring min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-semibold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:var(--client-primary-soft)]";

const errorTextKeys: Record<string, ExchangeTextKey> = {
  "error.exchange.claim_option_not_found": "claimOptionUnavailable",
  "error.exchange.claim_quote_below_budget": "claimQuoteBelowBudget",
  "error.exchange.claim_quote_above_budget": "claimQuoteAboveBudget",
  "error.exchange.claim_schedule_unavailable": "claimTimeConflict",
  "error.exchange.claim_time_conflict": "claimTimeConflict",
  "error.exchange.claim_duplicate": "claimDuplicate",
  "error.exchange.claim_invalid_state": "claimOptionUnavailable"
};

function localeForLanguage(language: Language) {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  if (language === "ja") return "ja-JP";
  if (language === "ko") return "ko-KR";
  return "en-US";
}

function formatWindow(startsAt: string, endsAt: string, language: Language) {
  const locale = localeForLanguage(language);
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    new Date(startsAt)
  );
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time.format(new Date(startsAt))}–${time.format(new Date(endsAt))}`;
}

function formatJpy(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function optionKey(option: ExchangeClaimOption) {
  return `${option.scheduleSlotId}:${option.service.ref}`;
}

function RequiredLabel({ label }: { label: string }) {
  return (
    <span>
      {label}<span aria-hidden="true" className="text-[color:var(--client-primary)]"> *</span>
    </span>
  );
}

function claimStatusKey(status: ExchangeClaim["status"]): ExchangeTextKey {
  if (status === "withdrawn") return "claimStatusWithdrawn";
  if (status === "request_withdrawn") return "claimStatusRequestWithdrawn";
  if (status === "request_expired") return "claimStatusRequestExpired";
  if (status === "matched") return "claimStatusMatched";
  if (status === "not_selected") return "claimStatusNotSelected";
  if (status === "matching_closed") return "claimStatusMatchingClosed";
  return "claimStatusActive";
}

function OwnClaimCard({
  claim,
  language,
  matchMode
}: {
  claim: ExchangeClaim;
  language: Language;
  matchMode: "quick" | "selective";
}) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  const statusKey =
    claim.status === "active" && matchMode === "quick"
      ? "quickMatchingWaiting"
      : claimStatusKey(claim.status);
  return (
    <div className="mt-4 overflow-hidden rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)]">
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--client-line)] px-4 py-3">
        <div>
          <p className="text-xs font-black text-[color:var(--client-primary)]">{t("claimSubmitted")}</p>
          <p className="mt-1 text-lg font-black text-[color:var(--client-text)]">{formatJpy(claim.quoteAmountJpy)}</p>
        </div>
        <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]">
          {t(statusKey)}
        </span>
      </div>
      <dl className="grid gap-3 px-4 py-4 text-xs">
        <div><dt className="font-black text-[color:var(--client-muted)]">{t("claimShop")}</dt><dd className="mt-1 font-bold text-[color:var(--client-text)]">{claim.shop.name}</dd></div>
        <div><dt className="font-black text-[color:var(--client-muted)]">{t("claimTechnician")}</dt><dd className="mt-1 font-bold text-[color:var(--client-text)]">{claim.technician.displayName} · {claim.technician.publicId}</dd></div>
        <div><dt className="font-black text-[color:var(--client-muted)]">{t("claimService")}</dt><dd className="mt-1 font-bold text-[color:var(--client-text)]">{claim.service.name}</dd></div>
        <div><dt className="font-black text-[color:var(--client-muted)]">{t("claimEstimatedTime")}</dt><dd className="mt-1 font-bold text-[color:var(--client-text)]">{formatWindow(claim.estimatedStartsAt, claim.estimatedEndsAt, language)}</dd></div>
        {claim.message ? <div data-no-i18n="true"><dt className="font-black text-[color:var(--client-muted)]">{t("claimMessageOptional")}</dt><dd className="mt-1 whitespace-pre-wrap font-semibold leading-5 text-[color:var(--client-text)]">{claim.message}</dd></div> : null}
      </dl>
    </div>
  );
}

function OptionCard({
  language,
  onSelect,
  option,
  selected
}: {
  language: Language;
  onSelect: () => void;
  option: ExchangeClaimOption;
  selected: boolean;
}) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  return (
    <button
      aria-pressed={selected}
      className={`focus-ring relative w-full overflow-hidden rounded-[22px] border p-4 text-left transition ${
        selected
          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] shadow-soft"
          : "border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)]"
      }`}
      data-option-id={option.scheduleSlotId}
      onClick={onSelect}
      type="button"
    >
      <span className={`absolute bottom-4 left-0 top-4 w-1 rounded-r-full ${selected ? "bg-[color:var(--client-primary)]" : "bg-[color:var(--client-line)]"}`} />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <p className="text-base font-black text-[color:var(--client-text)]">{option.service.name}</p>
          <p className="mt-1 text-[11px] font-bold text-[color:var(--client-primary)]">{formatWindow(option.startsAt, option.endsAt, language)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[color:var(--client-bg)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-muted)]">{option.service.durationMinutes} min</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 pl-1 text-xs">
        <div className="min-w-0"><dt className="font-black text-[color:var(--client-muted)]">{t("claimShop")}</dt><dd className="mt-1 truncate font-bold text-[color:var(--client-text)]">{option.shop.name}</dd></div>
        <div className="min-w-0"><dt className="font-black text-[color:var(--client-muted)]">{t("claimTechnician")}</dt><dd className="mt-1 truncate font-bold text-[color:var(--client-text)]">{option.technician.displayName}</dd></div>
      </dl>
    </button>
  );
}

export function ExchangeClaimPanel({ language, post }: { language: Language; post: ExchangePost }) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  const [claim, setClaim] = useState<ExchangeClaim | null>(null);
  const [options, setOptions] = useState<ExchangeClaimOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [readError, setReadError] = useState(false);
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
  const [quote, setQuote] = useState("");
  const [message, setMessage] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState<ExchangeTextKey | null>(null);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawError, setWithdrawError] = useState(false);
  const activePostIdRef = useRef(post.id);
  const createAttemptRef = useRef<{ signature: string; key: string } | null>(null);
  const withdrawAttemptRef = useRef<{ claimId: number; key: string } | null>(null);

  useEffect(() => {
    activePostIdRef.current = post.id;
    const controller = new AbortController();
    setClaim(null);
    setOptions([]);
    setPage(1);
    setTotal(0);
    setLoading(true);
    setLoadingMore(false);
    setReadError(false);
    setSelectedOptionKey(null);
    setQuote("");
    setMessage("");
    setSubmitPending(false);
    setSubmitError(null);
    setWithdrawPending(false);
    setWithdrawError(false);
    createAttemptRef.current = null;
    withdrawAttemptRef.current = null;
    void getMyExchangeClaim(String(post.id), controller.signal)
      .then(async (mine) => {
        if (controller.signal.aborted) return;
        setClaim(mine);
        if (mine) {
          return;
        }
        const result = await listExchangeClaimOptions(String(post.id), {
          page: 1,
          pageSize: 20,
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        setOptions(result.list);
        setPage(result.page);
        setTotal(result.total);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [post.id]);

  async function loadMore() {
    if (loadingMore || options.length >= total) return;
    const requestedPostId = post.id;
    setLoadingMore(true);
    setReadError(false);
    try {
      const next = await listExchangeClaimOptions(String(post.id), {
        page: page + 1,
        pageSize: 20
      });
      if (activePostIdRef.current !== requestedPostId) return;
      setOptions((current) => [...current, ...next.list]);
      setPage(next.page);
      setTotal(next.total);
    } catch {
      if (activePostIdRef.current === requestedPostId) setReadError(true);
    } finally {
      if (activePostIdRef.current === requestedPostId) setLoadingMore(false);
    }
  }

  async function submit() {
    if (submitPending) return;
    const quoteAmountJpy = Number(quote);
    const selectedOption = options.find((option) => optionKey(option) === selectedOptionKey);
    if (!selectedOption || !Number.isSafeInteger(quoteAmountJpy) || quoteAmountJpy <= 0) {
      setSubmitError("claimRequired");
      return;
    }
    const payload = {
      scheduleSlotId: selectedOption.scheduleSlotId,
      ...(selectedOption.scheduleSlotId < 0 ? { serviceRef: selectedOption.service.ref } : {}),
      quoteAmountJpy,
      message: message.trim() || null
    };
    const signature = JSON.stringify(payload);
    const attempt =
      createAttemptRef.current?.signature === signature
        ? createAttemptRef.current
        : { signature, key: globalThis.crypto.randomUUID() };
    createAttemptRef.current = attempt;
    const submittedPostId = post.id;
    setSubmitPending(true);
    setSubmitError(null);
    try {
      const created = await createExchangeClaim(String(submittedPostId), payload, attempt.key);
      if (activePostIdRef.current !== submittedPostId) return;
      setClaim(created);
      createAttemptRef.current = null;
    } catch (error) {
      if (activePostIdRef.current !== submittedPostId) return;
      const keyForError = error instanceof Error ? errorTextKeys[error.message] : undefined;
      setSubmitError(keyForError ?? "claimFailed");
    } finally {
      if (activePostIdRef.current === submittedPostId) setSubmitPending(false);
    }
  }

  async function withdraw() {
    if (!claim || claim.status !== "active" || withdrawPending || !globalThis.confirm(t("claimConfirmWithdraw"))) return;
    const targetClaimId = claim.id;
    const requestedPostId = post.id;
    const attempt =
      withdrawAttemptRef.current?.claimId === targetClaimId
        ? withdrawAttemptRef.current
        : { claimId: targetClaimId, key: globalThis.crypto.randomUUID() };
    withdrawAttemptRef.current = attempt;
    setWithdrawPending(true);
    setWithdrawError(false);
    try {
      const withdrawn = await withdrawExchangeClaim(String(targetClaimId), attempt.key);
      if (activePostIdRef.current !== requestedPostId) return;
      if (withdrawn.status !== "withdrawn") throw new Error("error.exchange.claim_invalid_state");
      setClaim(null);
      setOptions([]);
      setReadError(false);
      setSelectedOptionKey(null);
      setQuote("");
      setMessage("");
      withdrawAttemptRef.current = null;
      try {
        const result = await listExchangeClaimOptions(String(requestedPostId), { page: 1, pageSize: 20 });
        if (activePostIdRef.current !== requestedPostId) return;
        setOptions(result.list);
        setPage(result.page);
        setTotal(result.total);
      } catch {
        if (activePostIdRef.current === requestedPostId) setReadError(true);
      }
    } catch {
      if (activePostIdRef.current === requestedPostId) setWithdrawError(true);
    } finally {
      if (activePostIdRef.current === requestedPostId) setWithdrawPending(false);
    }
  }

  return (
    <section className={panelClassName} data-testid="exchange-claim-panel" id="exchange-claim-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-black tracking-[0.24em] text-[color:var(--client-primary)]">NEEDO CLAIM</p>
          <h2 className="mt-1 text-xl font-black text-[color:var(--client-text)]">{t("claimTitle")}</h2>
        </div>
        <span className="rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] px-3 py-1.5 text-[10px] font-black text-[color:var(--client-muted)]">
          {t(post.demand?.matchMode === "quick" ? "quickMatch" : "selectiveMatch")}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">{t("claimIntro")}</p>

      {loading ? <p className="mt-5 text-sm font-bold text-[color:var(--client-muted)]">{t("claimOptionsLoading")}</p> : null}
      {readError ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("claimOptionsFailed")}</p> : null}

      {!loading && claim ? (
        <>
          <OwnClaimCard
            claim={claim}
            language={language}
            matchMode={post.demand?.matchMode ?? "selective"}
          />
          {claim.status === "active" ? (
            <button
              className="focus-ring mt-4 min-h-11 w-full rounded-2xl border border-[color:var(--client-accent)] text-sm font-black text-[color:var(--client-accent)] disabled:opacity-50"
              data-action="withdraw-claim"
              disabled={withdrawPending}
              onClick={() => void withdraw()}
              type="button"
            >
              {t(withdrawPending ? "claimWithdrawing" : "claimWithdraw")}
            </button>
          ) : null}
          {withdrawError ? <p className="mt-3 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("claimWithdrawFailed")}</p> : null}
        </>
      ) : null}

      {!loading && !claim && !readError ? (
        <div className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-black text-[color:var(--client-muted)]"><RequiredLabel label={t("claimService")} /></p>
            {options.map((option) => (
              <OptionCard key={optionKey(option)} language={language} onSelect={() => setSelectedOptionKey(optionKey(option))} option={option} selected={selectedOptionKey === optionKey(option)} />
            ))}
            {options.length === 0 ? <p className="rounded-[20px] bg-[color:var(--client-bg-soft)] px-4 py-5 text-center text-xs font-bold leading-5 text-[color:var(--client-muted)]">{t("claimOptionsEmpty")}</p> : null}
            {options.length < total ? (
              <button className="focus-ring min-h-11 rounded-2xl border border-[color:var(--client-line)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-50" disabled={loadingMore} onClick={() => void loadMore()} type="button">{t(loadingMore ? "loadingMore" : "loadMore")}</button>
            ) : null}
          </div>

          <label className="grid gap-2 text-xs font-black text-[color:var(--client-muted)]">
            <RequiredLabel label={t("claimQuote")} />
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-[color:var(--client-muted)]">¥</span>
              <input className={`${fieldClassName} pl-9`} inputMode="numeric" min="1" name="claimQuoteAmountJpy" onChange={(event) => setQuote(event.target.value)} step="1" type="number" value={quote} />
            </div>
          </label>

          <label className="grid gap-2 text-xs font-black text-[color:var(--client-muted)]">
            <span>{t("claimMessageOptional")}</span>
            <textarea className={`${fieldClassName} min-h-28 resize-none py-3 leading-6`} maxLength={1000} name="claimMessage" onChange={(event) => setMessage(event.target.value)} placeholder={t("claimMessagePlaceholder")} value={message} />
          </label>

          {submitError ? <p className="text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t(submitError)}</p> : null}
          <button
            className="focus-ring min-h-12 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-50"
            data-action="submit-claim"
            disabled={submitPending || options.length === 0}
            onClick={() => void submit()}
            type="button"
          >
            {t(submitPending ? "claimSubmitting" : "claimSubmit")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
