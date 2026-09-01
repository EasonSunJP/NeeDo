import { useEffect, useState } from "react";
import { AvatarImage } from "../../components/ui/AvatarImage";
import type { Language } from "../../i18n/translations";
import { listReceivedExchangeClaims } from "./api";
import { exchangeText, type ExchangeTextKey } from "./i18n";
import type { ExchangeClaim } from "./types";

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
  return "claimStatusActive";
}

function ClaimCard({ claim, language }: { claim: ExchangeClaim; language: Language }) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  return (
    <article
      className="overflow-hidden rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)]"
      data-claim-id={claim.id}
      data-no-i18n="true"
    >
      <div className="flex items-center gap-3 border-b border-[color:var(--client-line)] p-4">
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

export function ExchangeReceivedClaims({ language, postId }: { language: Language; postId: string }) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  const [claims, setClaims] = useState<ExchangeClaim[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void listReceivedExchangeClaims(postId, { page: 1, pageSize: 10, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setClaims(result.list);
        setPage(result.page);
        setTotal(result.total);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId]);

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

      {loading ? <p className="mt-5 text-sm font-bold text-[color:var(--client-muted)]">{t("claimOptionsLoading")}</p> : null}
      {error ? <p className="mt-5 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("receivedClaimsFailed")}</p> : null}
      {!loading && !error && claims.length === 0 ? <p className="mt-5 rounded-[20px] bg-[color:var(--client-bg-soft)] px-4 py-6 text-center text-xs font-bold text-[color:var(--client-muted)]">{t("receivedClaimsEmpty")}</p> : null}

      <div className="mt-5 grid gap-3">
        {claims.map((claim) => <ClaimCard claim={claim} key={claim.id} language={language} />)}
      </div>

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
