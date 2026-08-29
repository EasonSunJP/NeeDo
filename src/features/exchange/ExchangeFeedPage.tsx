import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { ExchangeComposer } from "./ExchangeComposer";
import { exchangeText } from "./i18n";
import type { ExchangePost, ExchangePostType } from "./types";
import { useExchangeFeed, type ExchangeFeedError } from "./useExchangeFeed";

export function getDefaultExchangePostType(context: MessageCenterContext): ExchangePostType {
  return context === "user" ? "demand" : "intelligence";
}

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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatJpy(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function identityLabel(type: string, language: Language) {
  const labels: Record<string, Record<Language, string>> = {
    customer: { zh: "客户", "zh-Hant": "客戶", ja: "顧客", en: "Customer", ko: "고객" },
    technician: { zh: "技师", "zh-Hant": "技師", ja: "技術者", en: "Technician", ko: "기술자" },
    merchant: { zh: "商户", "zh-Hant": "商戶", ja: "店舗", en: "Merchant", ko: "판매자" },
    merchant_owner: { zh: "商户", "zh-Hant": "商戶", ja: "店舗", en: "Merchant", ko: "판매자" },
    merchant_staff: { zh: "商户员工", "zh-Hant": "商戶員工", ja: "店舗スタッフ", en: "Merchant staff", ko: "매장 직원" }
  };
  return labels[type]?.[language] ?? type;
}

function PostCard({ post, context, language }: { post: ExchangePost; context: MessageCenterContext; language: Language }) {
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const price = post.type === "demand" && post.demand
    ? `${formatJpy(post.demand.budgetMinJpy)}–${formatJpy(post.demand.budgetMaxJpy)}`
    : post.intelligence
      ? formatJpy(post.intelligence.campaignPriceJpy)
      : "—";

  return (
    <Link
      className="group relative block overflow-hidden rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-panel transition hover:-translate-y-0.5 hover:border-[color:var(--client-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
      to={`${exchangeBasePath(context)}/posts/${post.id}`}
    >
      <span aria-hidden="true" className="absolute inset-y-5 left-0 w-1 rounded-r-full bg-[color:var(--client-primary)] opacity-80" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3" data-no-i18n="true">
          {post.publisher.avatarUrl ? (
            <img alt="" className="h-11 w-11 rounded-2xl object-cover" src={post.publisher.avatarUrl} />
          ) : (
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:var(--client-primary-soft)] text-sm font-black text-[color:var(--client-primary)]">
              {post.publisher.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[color:var(--client-text)]">{post.publisher.displayName}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] font-bold tracking-wide text-[color:var(--client-muted)]">{post.publisher.publicId}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[color:var(--client-line)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-muted)]">
          {identityLabel(post.publisher.identityType, language)}
        </span>
      </div>

      <div className="mt-5" data-no-i18n="true">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--client-primary)]">
            {t("originalLanguage")} · {post.contentLocale}
          </span>
        </div>
        <h2 className="mt-3 text-lg font-black leading-snug text-[color:var(--client-text)]">{post.title}</h2>
        <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{post.detail}</p>
        <p className="mt-3 text-xs font-bold text-[color:var(--client-text)]">{post.areaLabel}</p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-[color:var(--client-line)] py-4 text-xs">
        <div>
          <dt className="font-bold text-[color:var(--client-muted)]">{t(post.type === "demand" ? "budget" : "campaignPrice")}</dt>
          <dd className="mt-1 text-base font-black text-[color:var(--client-text)]">{price}</dd>
        </div>
        <div>
          <dt className="font-bold text-[color:var(--client-muted)]">{t("serviceWindow")}</dt>
          <dd className="mt-1 font-black text-[color:var(--client-text)]">{formatDateTime(post.serviceStartAt, language)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-[color:var(--client-muted)]">{t("expires")} {formatDateTime(post.expiresAt, language)}</p>
        <div className="flex items-center gap-3 text-[11px] font-black text-[color:var(--client-muted)]">
          <span aria-label={`${t("comments")} ${post.counts.comments}`}>◌ {post.counts.comments}</span>
          <span aria-label={`${t("likes")} ${post.counts.likes}`}>♡ {post.counts.likes}</span>
          <span aria-label={`${t("shares")} ${post.counts.shares}`}>↗ {post.counts.shares}</span>
        </div>
      </div>
    </Link>
  );
}

function errorKey(error: ExchangeFeedError) {
  if (error.kind === "unauthorized") return "unauthorized" as const;
  if (error.kind === "forbidden") return "forbidden" as const;
  if (error.kind === "unavailable") return "unavailable" as const;
  return "readFailed" as const;
}

export function ExchangeFeedPage({ context }: { context: MessageCenterContext }) {
  const { language } = useI18n();
  const feed = useExchangeFeed(getDefaultExchangePostType(context), 10);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const isDemand = feed.activeType === "demand";

  return (
    <main className="mx-auto min-h-[calc(100dvh-96px)] w-full max-w-3xl px-4 pb-32 pt-7 sm:px-6 sm:pt-10">
      <header className="flex items-end justify-between gap-4 px-1">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--client-primary)]">NeeDo Exchange</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[color:var(--client-text)] sm:text-3xl">{t("exchangeTitle")}</h1>
          <p className="mt-2 text-xs font-bold text-[color:var(--client-muted)]">{t("exchangeCaption")}</p>
        </div>
        <ExchangeComposer context={context} onPublished={(post) => { feed.setActiveType(post.type); feed.upsertPost(post); }} />
      </header>

      <div className="sticky top-2 z-20 mt-6 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] p-1.5 shadow-panel backdrop-blur-xl" role="tablist">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          {(["demand", "intelligence"] as const).map((type) => (
            <button
              aria-selected={feed.activeType === type}
              className="min-h-11 rounded-[16px] px-3 text-sm font-black text-[color:var(--client-muted)] transition aria-selected:bg-[color:var(--client-primary)] aria-selected:text-[color:var(--client-primary-contrast)]"
              key={type}
              onClick={() => feed.setActiveType(type)}
              role="tab"
              type="button"
            >
              {t(type)}
            </button>
          ))}
          <button aria-label={t("refresh")} className="min-h-11 min-w-11 rounded-[16px] border border-[color:var(--client-line)] text-lg font-black text-[color:var(--client-text)]" onClick={feed.refresh} type="button">↻</button>
        </div>
      </div>

      <section aria-busy={feed.loading} aria-live="polite" className="mt-5 space-y-4">
        {feed.loading ? (
          <div className="space-y-3" data-testid="exchange-loading">
            <p className="px-1 text-sm font-black text-[color:var(--client-muted)]">{t(isDemand ? "loadingDemand" : "loadingIntelligence")}</p>
            {[0, 1, 2].map((value) => <div className="h-48 animate-pulse rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)]" key={value} />)}
          </div>
        ) : feed.error ? (
          <div className="rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-7 text-center">
            <p className="text-base font-black text-[color:var(--client-text)]">{t(errorKey(feed.error))}</p>
            <button className="mt-5 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={feed.refresh} type="button">{t("retry")}</button>
          </div>
        ) : feed.posts.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-8 text-center">
            <p className="text-base font-black text-[color:var(--client-text)]">{t(isDemand ? "emptyDemand" : "emptyIntelligence")}</p>
            <p className="mt-2 text-xs font-semibold leading-6 text-[color:var(--client-muted)]">{t("emptyHint")}</p>
          </div>
        ) : (
          feed.posts.map((post) => <PostCard context={context} key={post.id} language={language} post={post} />)
        )}
      </section>

      {feed.hasMore && !feed.loading ? (
        <button className="mt-5 min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-50" disabled={feed.loadingMore} onClick={feed.loadMore} type="button">
          {t(feed.loadingMore ? "loadingMore" : "loadMore")}
        </button>
      ) : null}
    </main>
  );
}
