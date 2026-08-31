import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FeatureSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { FloatingHeaderSearchBar } from "../../components/mobile/FloatingHeaderSearchBar";
import { FloatingHomeHeader } from "../../components/mobile/FloatingHomeHeader";
import { MomentActionBar } from "../../components/mobile/MomentActionBar";
import { OfferInfoCard } from "../../components/mobile/OfferInfoCard";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { shareContent } from "../../lib/share";
import { likeExchangePost, recordExchangeShare, unlikeExchangePost } from "./api";
import { ExchangeComposer } from "./ExchangeComposer";
import { exchangeText } from "./i18n";
import type { ExchangeInteractionCounts, ExchangePost, ExchangePostType } from "./types";
import { useExchangeFeed, type ExchangeFeedError } from "./useExchangeFeed";

const fallbackPublisherImage = "/icons/needo-nav-button-dark.png";

export function getDefaultExchangePostType(_context: MessageCenterContext): ExchangePostType {
  return "intelligence";
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

function formatTime(value: string, language: Language) {
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTimeRange(post: ExchangePost, language: Language) {
  return `${formatTime(post.serviceStartAt, language)} - ${formatTime(post.serviceEndAt, language)}`;
}

function formatExpiryDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatCountdown(expiresAt: string, nowMs: number, language: Language) {
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  const prefix = exchangeText("remaining", language);
  return days > 0 ? `${prefix} ${days}d ${clock}` : `${prefix} ${clock}`;
}

function formatJpy(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function priceLabel(post: ExchangePost) {
  if (post.type === "demand" && post.demand) {
    return `${formatJpy(post.demand.budgetMinJpy)}–${formatJpy(post.demand.budgetMaxJpy)}`;
  }
  return post.intelligence ? formatJpy(post.intelligence.campaignPriceJpy) : "—";
}

function postTags(post: ExchangePost, language: Language) {
  const identity = post.publisher
    ? `${post.publisher.displayName} · ${post.publisher.publicId}`
    : exchangeText("publisherHidden", language);
  if (!post.intelligence) return [identity, post.areaLabel];
  const tags = [
    identity,
    exchangeText(post.intelligence.serviceMode, language),
    ...post.intelligence.serviceAreas
  ];
  if (
    post.intelligence.originalPriceJpy &&
    post.intelligence.originalPriceJpy > post.intelligence.campaignPriceJpy
  ) {
    const discount = Math.round(
      (1 - post.intelligence.campaignPriceJpy / post.intelligence.originalPriceJpy) * 100
    );
    tags.push(`${discount}% OFF`);
  }
  return tags;
}

function matchesSearch(post: ExchangePost, query: string) {
  if (!query) return true;
  return [
    post.title,
    post.detail,
    post.areaLabel,
    post.publisher?.displayName ?? "",
    post.publisher?.publicId ?? "",
    ...(post.intelligence?.serviceAreas ?? [])
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function PostCard({
  post,
  context,
  language,
  nowMs,
  onCountsChange
}: {
  post: ExchangePost;
  context: MessageCenterContext;
  language: Language;
  nowMs: number;
  onCountsChange: (postId: number, counts: ExchangeInteractionCounts, liked?: boolean) => void;
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<"like" | "share" | null>(null);
  const [actionError, setActionError] = useState(false);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const publisherName = post.publisher?.displayName ?? t("publisherHidden");
  const detailPath = `${exchangeBasePath(context)}/posts/${post.id}`;
  const openDetail = () => navigate(detailPath);

  async function toggleLike() {
    if (pending) return;
    setPending("like");
    setActionError(false);
    try {
      const counts = post.viewer.liked
        ? await unlikeExchangePost(String(post.id), globalThis.crypto.randomUUID())
        : await likeExchangePost(String(post.id), globalThis.crypto.randomUUID());
      onCountsChange(post.id, counts, !post.viewer.liked);
    } catch {
      setActionError(true);
    } finally {
      setPending(null);
    }
  }

  async function share() {
    if (pending) return;
    setPending("share");
    setActionError(false);
    try {
      const url = typeof window === "undefined"
        ? detailPath
        : `${window.location.origin}${window.location.pathname}#${detailPath}`;
      const result = await shareContent({ title: post.title, text: post.detail, url });
      if (result.status !== "shared" && result.status !== "copied") return;
      const counts = await recordExchangeShare(String(post.id), globalThis.crypto.randomUUID());
      onCountsChange(post.id, counts, post.viewer.liked);
    } catch {
      setActionError(true);
    } finally {
      setPending(null);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  }

  return (
    <article
      className="focus-ring min-w-0 cursor-pointer text-left"
      data-post-id={post.id}
      onClick={openDetail}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      <OfferInfoCard
        className={pending ? "opacity-90" : undefined}
        expiryCountdown={formatCountdown(post.expiresAt, nowMs, language)}
        expiryLabel={t("validity")}
        expiryValue={formatExpiryDate(post.expiresAt, language)}
        fields={[
          {
            label: t("usageConditions"),
            value: <span data-no-i18n="true">{formatTimeRange(post, language)}</span>
          },
          {
            label: t("applicableArea"),
            value: <span data-no-i18n="true">{post.intelligence?.serviceAreas.join(" · ") || post.areaLabel}</span>
          }
        ]}
        footer={
          <div onClick={(event) => event.stopPropagation()}>
            <MomentActionBar
              bordered={false}
              forwardLabel={t("shares")}
              likeCount={post.counts.likes}
              liked={post.viewer.liked}
              onForward={() => void share()}
              onLike={() => void toggleLike()}
              onReply={openDetail}
              replyCount={post.counts.comments}
              tone="client"
            />
            {actionError ? (
              <p className="mt-2 text-[11px] font-bold text-[color:var(--client-accent)]" role="alert">{t("interactionFailed")}</p>
            ) : null}
          </div>
        }
        image={post.publisher?.avatarUrl || fallbackPublisherImage}
        imageAlt={publisherName}
        imageLabel={t(post.type)}
        noteLabel={t("note")}
        noteValue={<span data-no-i18n="true">{post.detail}</span>}
        tags={postTags(post, language)}
        title={<span data-no-i18n="true">{post.title}</span>}
        titleBadge={nowMs - new Date(post.publishedAt).getTime() <= 86_400_000 ? "NEW" : undefined}
        tone={post.type === "demand" ? "demand" : "default"}
        topRightAction={
          <button
            aria-label={t("viewDetails")}
            className="focus-ring grid h-7 w-7 place-items-center rounded-full text-lg font-black text-[color:var(--client-muted)]"
            onClick={(event) => {
              event.stopPropagation();
              openDetail();
            }}
            type="button"
          >
            ⋮
          </button>
        }
        eyebrow={<span className="text-[24px] font-black tracking-[-0.04em]">{priceLabel(post)}</span>}
      />
    </article>
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
  const feed = useExchangeFeed(getDefaultExchangePostType(context), 20);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const isDemand = feed.activeType === "demand";
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visiblePosts = useMemo(
    () => feed.posts.filter((post) => matchesSearch(post, normalizedQuery)),
    [feed.posts, normalizedQuery]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-[calc(100dvh-96px)] w-full pb-32">
      <FloatingHomeHeader
        className="relative z-10"
        frameClassName="z-40"
        maxWidth="680px"
        panelClassName="relative overflow-hidden"
      >
        <FloatingHeaderSearchBar
          actionAriaLabel={t("searchPlaceholder")}
          actionLabel={t("search")}
          fieldAriaLabel={t("searchPlaceholder")}
          onChange={setSearchDraft}
          onSubmit={() => setSearchQuery(searchDraft)}
          placeholder={t("searchPlaceholder")}
          value={searchDraft}
        />
        <FeatureSegmentedTabs
          items={[
            { label: context === "user" ? t("myDemand") : t("demand"), value: "demand" as const },
            { label: t("intelligence"), value: "intelligence" as const }
          ]}
          onChange={feed.setActiveType}
          value={feed.activeType}
          variant="header"
        />
      </FloatingHomeHeader>

      <section aria-busy={feed.loading} aria-live="polite" className="mx-auto w-full max-w-[680px] space-y-4 px-4 pb-4">
        {feed.loading ? (
          <div className="space-y-3" data-testid="exchange-loading">
            <p className="px-1 text-sm font-black text-[color:var(--client-muted)]">{t(isDemand ? "loadingDemand" : "loadingIntelligence")}</p>
            {[0, 1, 2].map((value) => (
              <div className="h-80 animate-pulse rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)]" key={value} />
            ))}
          </div>
        ) : feed.error ? (
          <div className="rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-7 text-center">
            <p className="text-base font-black text-[color:var(--client-text)]">{t(errorKey(feed.error))}</p>
            <button className="mt-5 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={feed.refresh} type="button">{t("retry")}</button>
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-8 text-center">
            <p className="text-base font-black text-[color:var(--client-text)]">{t(normalizedQuery ? "searchEmpty" : isDemand ? "emptyDemand" : "emptyIntelligence")}</p>
            {normalizedQuery ? (
              <button className="mt-4 min-h-11 rounded-full border border-[color:var(--client-line)] px-5 text-sm font-black text-[color:var(--client-text)]" onClick={() => { setSearchDraft(""); setSearchQuery(""); }} type="button">{t("clearSearch")}</button>
            ) : (
              <p className="mt-2 text-xs font-semibold leading-6 text-[color:var(--client-muted)]">{t("emptyHint")}</p>
            )}
          </div>
        ) : (
          visiblePosts.map((post) => (
            <PostCard
              context={context}
              key={post.id}
              language={language}
              nowMs={nowMs}
              onCountsChange={(postId, counts, liked) => feed.replaceCounts(
                postId,
                counts,
                liked === undefined ? undefined : { liked }
              )}
              post={post}
            />
          ))
        )}
      </section>

      {feed.hasMore && !feed.loading ? (
        <div className="mx-auto w-full max-w-[680px] px-4">
          <button className="mt-1 min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-50" disabled={feed.loadingMore} onClick={feed.loadMore} type="button">
            {t(feed.loadingMore ? "loadingMore" : "loadMore")}
          </button>
        </div>
      ) : null}

      <ExchangeComposer
        context={context}
        onPublished={(post) => {
          feed.upsertPost(post);
          feed.setActiveType(post.type);
        }}
        triggerVariant="floating"
      />
    </main>
  );
}
