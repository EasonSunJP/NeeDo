import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { getExchangePost, withdrawExchangePost } from "./api";
import { ExchangeInteractions } from "./ExchangeInteractions";
import { exchangeText } from "./i18n";
import type { ExchangeInteractionCounts, ExchangePost } from "./types";

function exchangeBasePath(context: MessageCenterContext) {
  return context === "user" ? "/needo" : `/${context}/needo`;
}

function localeForLanguage(language: Language) {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  if (language === "ja") return "ja-JP";
  if (language === "ko") return "ko-KR";
  return "en-US";
}

function formatDateTime(value: string, language: Language) {
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatJpy(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

export function ExchangePostDetailPage({ context }: { context: MessageCenterContext }) {
  const { language } = useI18n();
  const { postId } = useParams();
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const validPostId = Boolean(postId && /^[1-9]\d*$/u.test(postId));
  const [post, setPost] = useState<ExchangePost | null>(null);
  const [loading, setLoading] = useState(validPostId);
  const [error, setError] = useState(!validPostId);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawError, setWithdrawError] = useState(false);
  const withdrawKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!postId || !validPostId) return;
    const controller = new AbortController();
    setPost(null);
    setLoading(true);
    setError(false);
    void getExchangePost(postId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPost(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId, reloadVersion, validPostId]);

  async function withdraw() {
    if (!post || withdrawPending || !globalThis.confirm(t("confirmWithdraw"))) return;
    const key = withdrawKeyRef.current ?? globalThis.crypto.randomUUID();
    withdrawKeyRef.current = key;
    setWithdrawPending(true);
    setWithdrawError(false);
    try {
      const updated = await withdrawExchangePost(String(post.id), key);
      setPost(updated);
      withdrawKeyRef.current = null;
    } catch {
      setWithdrawError(true);
    } finally {
      setWithdrawPending(false);
    }
  }

  function updateCounts(counts: ExchangeInteractionCounts, viewer: { liked: boolean }) {
    setPost((current) => current ? { ...current, counts, viewer: { ...current.viewer, liked: viewer.liked } } : current);
  }

  const backLink = <Link className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-sm font-black text-[color:var(--client-text)]" to={exchangeBasePath(context)}>← {t("backToExchange")}</Link>;

  if (!validPostId) {
    return <main className="mx-auto min-h-[calc(100dvh-96px)] w-full max-w-3xl px-5 py-10">{backLink}<div className="mt-6 rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-8 text-center text-xl font-black text-[color:var(--client-text)]">{t("invalidLink")}</div></main>;
  }

  if (loading) {
    return <main className="mx-auto min-h-[calc(100dvh-96px)] w-full max-w-3xl px-5 py-10">{backLink}<p className="mt-8 text-center text-sm font-black text-[color:var(--client-muted)]">{t("loadingDetail")}</p></main>;
  }

  if (error || !post) {
    return (
      <main className="mx-auto min-h-[calc(100dvh-96px)] w-full max-w-3xl px-5 py-10">
        {backLink}
        <div className="mt-6 rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-8 text-center">
          <h1 className="text-xl font-black text-[color:var(--client-text)]">{t("missingPost")}</h1>
          <button className="mt-5 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={() => setReloadVersion((version) => version + 1)} type="button">{t("retryDetail")}</button>
        </div>
      </main>
    );
  }

  const price = post.type === "demand" && post.demand
    ? `${formatJpy(post.demand.budgetMinJpy)}–${formatJpy(post.demand.budgetMaxJpy)}`
    : post.intelligence
      ? formatJpy(post.intelligence.campaignPriceJpy)
      : "—";

  return (
    <main className="mx-auto min-h-[calc(100dvh-96px)] w-full max-w-3xl px-4 pb-24 pt-7 sm:px-6 sm:pt-10">
      <header className="flex items-center justify-between gap-3">
        {backLink}
        {post.viewer.canWithdraw && post.status === "published" ? (
          <button className="min-h-11 rounded-full border border-[color:var(--client-accent)] px-4 text-sm font-black text-[color:var(--client-accent)] disabled:opacity-50" data-action="withdraw" disabled={withdrawPending} onClick={() => void withdraw()} type="button">{t(withdrawPending ? "withdrawing" : "withdraw")}</button>
        ) : null}
      </header>
      {withdrawError ? <p className="mt-3 text-right text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("withdrawFailed")}</p> : null}

      {post.status !== "published" ? (
        <div className="mt-5 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-black text-[color:var(--client-text)]">
          {t(post.status === "withdrawn" ? "withdrawnState" : "expiredState")}
        </div>
      ) : null}

      <article className="mt-5 overflow-hidden rounded-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] shadow-panel">
        <div className="border-b border-[color:var(--client-line)] p-5 sm:p-7">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--client-primary)]">NeeDo Exchange · {t(post.type === "demand" ? "requestDetail" : "intelligenceDetail")}</p>
          <div className="mt-5 flex items-center gap-3" data-no-i18n="true">
            <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--client-primary-soft)] text-base font-black text-[color:var(--client-primary)]">{post.publisher.displayName.slice(0, 1)}</span>
            <div>
              <p className="text-sm font-black text-[color:var(--client-text)]">{post.publisher.displayName}</p>
              <p className="mt-0.5 font-mono text-[10px] font-bold text-[color:var(--client-muted)]">{post.publisher.publicId} · {post.publisher.identityType}</p>
            </div>
          </div>
          <div className="mt-6" data-no-i18n="true">
            <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 font-mono text-[10px] font-black uppercase text-[color:var(--client-primary)]">{post.contentLocale}</span>
            <h1 className="mt-4 text-2xl font-black leading-tight text-[color:var(--client-text)] sm:text-3xl">{post.title}</h1>
            <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-[color:var(--client-muted)]">{post.detail}</p>
          </div>
        </div>

        <dl className="grid gap-px bg-[color:var(--client-line)] sm:grid-cols-2">
          {[
            [t(post.type === "demand" ? "budget" : "campaignPrice"), price],
            [t("area"), post.areaLabel],
            [t("serviceStart"), formatDateTime(post.serviceStartAt, language)],
            [t("serviceEnd"), formatDateTime(post.serviceEndAt, language)],
            [t("expires"), formatDateTime(post.expiresAt, language)],
            [t("publishedAt"), formatDateTime(post.publishedAt, language)]
          ].map(([label, value]) => (
            <div className="bg-[color:var(--client-surface)] p-4" key={label}>
              <dt className="text-[10px] font-black text-[color:var(--client-muted)]">{label}</dt>
              <dd className="mt-1 text-sm font-black text-[color:var(--client-text)]" data-no-i18n="true">{value}</dd>
            </div>
          ))}
        </dl>

        {post.intelligence ? (
          <div className="border-t border-[color:var(--client-line)] p-5">
            <p className="text-xs font-black text-[color:var(--client-muted)]">{t("areasServed")}</p>
            <div className="mt-3 flex flex-wrap gap-2" data-no-i18n="true">{post.intelligence.serviceAreas.map((area) => <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-xs font-bold text-[color:var(--client-text)]" key={area}>{area}</span>)}</div>
          </div>
        ) : null}
      </article>

      <div className="mt-5">
        <ExchangeInteractions onCountsChange={updateCounts} post={post} />
      </div>
    </main>
  );
}
