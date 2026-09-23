import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { ServiceFlowSection } from "../../components/mobile/ServiceFlowSection";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { TranslationIcon } from "../../components/ui/LanguageSwitcher";
import { ShareNetworkIconPath } from "../../components/ui/ShareNetworkIcon";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { shareContent } from "../../lib/share";
import { mapExchangeIntelligencePublisherToProfileData, UnifiedProfileCard } from "../../shared/profile-card";
import { mapExchangeIntelligenceServiceToUnifiedData, UnifiedServiceInfoCard } from "../../shared/service-card";
import {
  getExchangePost,
  likeExchangePost,
  recordExchangeShare,
  unlikeExchangePost,
  withdrawExchangePost
} from "./api";
import { ExchangeClaimPanel } from "./ExchangeClaimPanel";
import { ExchangeIntelligenceShopCard } from "./ExchangeIntelligenceShopCard";
import { ExchangeInteractions } from "./ExchangeInteractions";
import { ExchangeReceivedClaims } from "./ExchangeReceivedClaims";
import { ExchangeMatchedBookingCard } from "./ExchangeMatchedBookingCard";
import { exchangeText } from "./i18n";
import type { ExchangeInteractionCounts, ExchangePost } from "./types";

const fallbackPublisherImage = "/icons/needo-nav-button-dark.png";
const detailCardClassName =
  "rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel";
const detailInnerCardClassName =
  "rounded-[18px] bg-[color:var(--client-bg-soft)] p-3";
const tokyoCheckoutDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const tokyoCheckoutTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit"
});

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
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTime(value: string, language: Language) {
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function checkoutStartParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const dateParts = new Map(
    tokyoCheckoutDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const timeParts = new Map(
    tokyoCheckoutTimeFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    date: `${dateParts.get("year")}-${dateParts.get("month")}-${dateParts.get("day")}`,
    time: `${timeParts.get("hour")}:${timeParts.get("minute")}`
  };
}

function formatJpy(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatCountdown(expiresAt: string, nowMs: number, language: Language) {
  const totalSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - nowMs) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  const prefix = exchangeText("remaining", language);
  return days > 0 ? `${prefix} ${days}d ${clock}` : `${prefix} ${clock}`;
}

function priceLabel(post: ExchangePost, effectiveBudgetMaxJpy: number | null = null) {
  if (post.type === "demand" && post.demand) {
    const budgetMaxJpy = effectiveBudgetMaxJpy ?? post.demand.budgetMaxJpy;
    return post.demand.budgetMinJpy === null
      ? formatJpy(budgetMaxJpy)
      : `${formatJpy(post.demand.budgetMinJpy)}–${formatJpy(budgetMaxJpy)}`;
  }
  return post.intelligence ? formatJpy(post.intelligence.campaignPriceJpy) : "—";
}

function terminalStateTextKey(status: ExchangePost["status"]) {
  if (status === "withdrawn") return "withdrawnState" as const;
  if (status === "expired") return "expiredState" as const;
  if (status === "matched") return "matchedState" as const;
  return "closedState" as const;
}

function intelligenceUnavailableTextKey(reason: NonNullable<ExchangePost["intelligence"]>["booking"]["unavailableReason"]) {
  if (reason === "legacy_unbound") return "intelligenceLegacyUnbound" as const;
  if (reason === "post_unavailable") return "intelligencePostUnavailable" as const;
  if (reason === "publisher_unavailable") return "intelligencePublisherUnavailable" as const;
  return "intelligenceServiceUnavailable" as const;
}

type HeaderActionName = "translate" | "favorite" | "share";

function HeaderActionButton({
  active = false,
  disabled = false,
  label,
  name,
  onClick
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  name: HeaderActionName;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={name === "favorite" ? active : undefined}
      className={`${floatingHeaderControlButtonClassName} ${active ? "border-[color:var(--client-primary)] text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]"} disabled:opacity-50`}
      data-action={`detail-${name === "favorite" ? "like" : name}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {name === "translate" ? (
        <TranslationIcon className="h-6 w-6" />
      ) : name === "favorite" ? (
        <svg aria-hidden="true" className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24">
          <path d="M12 19.2s-6.8-4.3-8.6-8.3C2 7.8 4 5.2 7 5.2c1.8 0 3.2.8 5 2.9 1.8-2.1 3.2-2.9 5-2.9 3 0 5 2.6 3.6 5.7-1.8 4-8.6 8.3-8.6 8.3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
          <ShareNetworkIconPath />
        </svg>
      )}
    </button>
  );
}

function DetailHero({ label, post, publisherAlt }: { label: string; post: ExchangePost; publisherAlt: string }) {
  const shop = post.intelligence?.publisherCard?.type === "shop" ? post.intelligence.publisherCard : null;
  const image = post.type === "demand"
    ? post.demand!.cover.url
    : shop
      ? shop.coverUrl ?? shop.imageUrls[0] ?? shop.avatarUrl ?? fallbackPublisherImage
      : post.publisher?.identityType !== "technician"
        ? fallbackPublisherImage
        : post.publisher.avatarUrl ?? fallbackPublisherImage;
  const imageAlt = post.type === "demand" ? post.title : shop?.name ?? publisherAlt;
  return (
    <section
      className={`relative overflow-hidden rounded-[28px] bg-[color:var(--client-surface)] text-white shadow-soft ${post.type === "demand" ? "aspect-video" : "h-[238px]"}`}
      data-no-i18n="true"
      data-testid="exchange-detail-hero"
    >
      <img alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" src={image} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/32 to-black/90" />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div>
          <Badge tone={post.type === "demand" ? "yellow" : "green"}>{label}</Badge>
        </div>
        <h1 className="overflow-hidden text-[27px] font-black leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
          {post.title}
        </h1>
      </div>
    </section>
  );
}

function publisherIdentityLabel(identityType: string, language: Language) {
  if (["merchant", "merchant_owner", "merchant_staff"].includes(identityType)) {
    return exchangeText("merchantIdentity", language);
  }
  if (identityType === "technician") return exchangeText("technicianIdentity", language);
  if (["customer", "user", "u"].includes(identityType)) {
    return exchangeText("customerIdentity", language);
  }
  return identityType;
}

function PublisherCard({ post, language }: { post: ExchangePost; language: Language }) {
  const areas = post.intelligence?.serviceAreas ?? [];
  const intelligenceAddress = post.intelligence?.addressLabel || post.areaLabel;
  const requestAddress = post.demand?.address;
  const requestAddressLines = requestAddress &&
    (requestAddress.disclosure === "owner" || requestAddress.disclosure === "matched_participant")
    ? [requestAddress.line1, requestAddress.line2, requestAddress.line3].filter(
        (line): line is string => line !== null
      )
    : [];
  const publisherName = post.publisher?.displayName ?? exchangeText("publisherHidden", language);
  return (
    <section className={`${detailCardClassName} overflow-hidden p-0`} data-no-i18n="true">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--client-primary)_14%,transparent),transparent_72%)] px-4 pb-4 pt-5">
        <div className="flex items-center gap-4">
          <AvatarImage
            alt={publisherName}
            className="h-24 w-24 shrink-0 rounded-[24px] border border-[color:var(--client-line)] object-cover shadow-soft"
            src={post.publisher?.avatarUrl || fallbackPublisherImage}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black text-[color:var(--client-text)]">{publisherName}</p>
            {post.publisher ? (
              <p className="mt-1 truncate font-mono text-xs font-bold text-[color:var(--client-primary)]">{post.publisher.publicId}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.publisher ? (
                <span className="rounded-full bg-[color:var(--client-bg-soft)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-muted)]">{publisherIdentityLabel(post.publisher.identityType, language)}</span>
              ) : null}
              {post.intelligence ? (
                <span className="rounded-full bg-[color:var(--client-bg-soft)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-muted)]">
                  {exchangeText(post.intelligence.serviceMode, language)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {post.demand ? (
          <div className="mt-4 grid gap-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]" data-testid="exchange-request-address">
            {requestAddressLines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">{intelligenceAddress}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {areas.map((area) => (
                <span className="rounded-full bg-[color:var(--client-bg-soft)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--client-muted)]" key={area}>{area}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function ExchangePostDetailPage({ context }: { context: MessageCenterContext }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { postId } = useParams();
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const validPostId = Boolean(postId && /^[1-9]\d*$/u.test(postId));
  const [post, setPost] = useState<ExchangePost | null>(null);
  const [effectiveBudgetMaxJpy, setEffectiveBudgetMaxJpy] = useState<number | null>(null);
  const [loading, setLoading] = useState(validPostId);
  const [error, setError] = useState(!validPostId);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawError, setWithdrawError] = useState(false);
  const [actionPending, setActionPending] = useState<"like" | "share" | null>(null);
  const [actionError, setActionError] = useState(false);
  const [originalNotice, setOriginalNotice] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const withdrawKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!postId || !validPostId) return;
    const controller = new AbortController();
    setPost(null);
    setEffectiveBudgetMaxJpy(null);
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

  const updateEffectiveBudget = useCallback((budgetMaxJpy: number) => {
    setEffectiveBudgetMaxJpy(budgetMaxJpy);
  }, []);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(exchangeBasePath(context), { replace: true });
  }

  function closeDetail() {
    navigate(exchangeBasePath(context), { replace: true });
  }

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

  async function toggleLike() {
    if (!post || actionPending || post.status !== "published") return;
    setActionPending("like");
    setActionError(false);
    try {
      const counts = post.viewer.liked
        ? await unlikeExchangePost(String(post.id), globalThis.crypto.randomUUID())
        : await likeExchangePost(String(post.id), globalThis.crypto.randomUUID());
      updateCounts(counts, { liked: !post.viewer.liked });
    } catch {
      setActionError(true);
    } finally {
      setActionPending(null);
    }
  }

  async function share() {
    if (!post || actionPending || post.status !== "published") return;
    setActionPending("share");
    setActionError(false);
    try {
      const result = await shareContent({
        title: post.title,
        text: post.detail,
        url: typeof window === "undefined" ? "" : window.location.href
      });
      if (result.status !== "shared" && result.status !== "copied") return;
      const counts = await recordExchangeShare(String(post.id), globalThis.crypto.randomUUID());
      updateCounts(counts, { liked: post.viewer.liked });
    } catch {
      setActionError(true);
    } finally {
      setActionPending(null);
    }
  }

  const stateShell = (content: ReactNode) => (
    <MobileFullscreenPage innerClassName="client-glass-page-surface">
      <MobileFullscreenHeader onBack={goBack} onClose={closeDetail} showSpacer={false} title={t(validPostId ? "intelligenceDetail" : "requestDetail")} />
      <main className="flex min-h-0 flex-1 items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+86px)] text-center">
        {content}
      </main>
    </MobileFullscreenPage>
  );

  if (!validPostId) {
    return stateShell(<div className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-8 text-xl font-black">{t("invalidLink")}</div>);
  }

  if (loading) {
    return stateShell(<p className="text-sm font-black text-[color:var(--client-muted)]">{t("loadingDetail")}</p>);
  }

  if (error || !post) {
    return stateShell(
      <div className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-8">
        <h1 className="text-xl font-black">{t("missingPost")}</h1>
        <button className="mt-5 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={() => setReloadVersion((version) => version + 1)} type="button">{t("retryDetail")}</button>
      </div>
    );
  }

  const price = priceLabel(post, effectiveBudgetMaxJpy);
  const active = post.status === "published";
  const serviceFlow = post.type === "intelligence"
    ? [t("flowSelectTechnician"), t("flowConfirmTime"), t("flowPrepare"), t("flowInService"), t("flowReview")]
    : [t("flowReviewDemand"), t("flowContact"), t("flowConfirmScope"), t("flowAwaitMatching"), t("flowReview")];
  const requirementTags = post.intelligence
    ? [t(post.intelligence.serviceMode), ...post.intelligence.serviceAreas, post.areaLabel, post.contentLocale]
    : [t(post.demand?.serviceMode === "home" ? "home" : "store"), post.areaLabel, post.contentLocale];
  const demandActionTarget = post.viewer.canViewClaims
    ? '[data-testid="exchange-received-claims"]'
    : post.viewer.canViewMatching
      ? '[data-testid="exchange-matched-booking-card"]'
    : post.viewer.canClaim
      ? '[data-testid="exchange-claim-panel"]'
       : null;
  const intelligenceBooking = post.intelligence?.booking ?? null;
  const intelligencePostId = post.id;
  const intelligenceServiceStartAt = post.serviceStartAt;
  const intelligenceBookable = Boolean(
    active &&
    intelligenceBooking?.available &&
    intelligenceBooking.target &&
    intelligenceBooking.serviceMode === "store"
  );

  function openIntelligenceCheckout() {
    if (!intelligenceBookable || !intelligenceBooking?.target) return;
    const checkoutStart = checkoutStartParts(intelligenceServiceStartAt);
    if (!checkoutStart) return;
    const target = intelligenceBooking.target;
    const path = target.type === "shop_service"
      ? `/checkout/${target.id}`
      : `/checkout/technician-service/${target.id}`;
    const query = new URLSearchParams({
      date: checkoutStart.date,
      time: checkoutStart.time,
      exchangePost: String(intelligencePostId)
    });
    navigate(`${path}?${query.toString()}`);
  }

  function revealDemandAction() {
    if (!active || !demandActionTarget) return;
    document.querySelector(demandActionTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <MobileFullscreenPage innerClassName="client-glass-page-surface">
      <MobileFullscreenHeader
        action={(
          <div className="flex items-center gap-1.5">
            <HeaderActionButton label={t("showOriginal")} name="translate" onClick={() => setOriginalNotice((current) => !current)} />
            <HeaderActionButton
              active={post.viewer.liked}
              disabled={!active || actionPending !== null}
              label={t(post.viewer.liked ? "unlike" : "like")}
              name="favorite"
              onClick={() => void toggleLike()}
            />
            <HeaderActionButton
              disabled={!active || actionPending !== null}
              label={t("share")}
              name="share"
              onClick={() => void share()}
            />
          </div>
        )}
        info={`${formatTime(post.serviceStartAt, language)}–${formatTime(post.serviceEndAt, language)} · ${post.areaLabel}`}
        onBack={goBack}
        onClose={closeDetail}
        showSpacer={false}
        title={t(post.type === "demand" ? "requestDetail" : "intelligenceDetail")}
      />

      <main
        className="client-app-gutter scrollbar-none relative z-0 min-h-0 flex-1 space-y-4 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+9.5rem)] pt-[calc(env(safe-area-inset-top)+86px)]"
        data-testid="exchange-detail-page"
      >
        {originalNotice ? (
          <p className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 py-3 text-xs font-bold text-[color:var(--client-muted)]">{t("originalContentNotice")}</p>
        ) : null}
        {actionError ? <p className="text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("interactionFailed")}</p> : null}

        <DetailHero label={t(post.type)} post={post} publisherAlt={t("publisherHidden")} />

        <section className={detailCardClassName} data-no-i18n="true">
          <p className="text-[11px] font-black text-[color:var(--client-muted)]">{t("introduction")}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-[color:var(--client-text)]">{post.detail}</p>
          <div className="mt-4 rounded-[18px] bg-[color:var(--client-bg-soft)] px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black text-[color:var(--client-muted)]">{t("deadline")}</p>
              <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-primary)]">
                {formatCountdown(post.expiresAt, nowMs, language)}
              </span>
            </div>
            <p className="mt-2 text-[13px] font-black text-[color:var(--client-muted)]">{t(post.type === "demand" ? "demandValidUntil" : "intelligenceValidUntil")} {formatDateTime(post.expiresAt, language)}</p>
          </div>
          {post.viewer.canWithdraw && active ? (
            <button className="mt-4 min-h-11 w-full rounded-2xl border border-[color:var(--client-accent)] text-sm font-black text-[color:var(--client-accent)] disabled:opacity-50" data-action="withdraw" disabled={withdrawPending} onClick={() => void withdraw()} type="button">{t(withdrawPending ? "withdrawing" : "withdraw")}</button>
          ) : null}
          {withdrawError ? <p className="mt-3 text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("withdrawFailed")}</p> : null}
        </section>

        {!active ? (
          <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-black text-[color:var(--client-text)]">
            {t(terminalStateTextKey(post.status))}
          </div>
        ) : null}

        {post.viewer.canClaim ? <ExchangeClaimPanel language={language} post={post} /> : null}
        {post.viewer.canViewClaims ? (
          <ExchangeReceivedClaims
            context={context}
            language={language}
            matchMode={post.demand?.matchMode}
            onEffectiveBudgetChange={updateEffectiveBudget}
            onMatched={() =>
              setPost((current) =>
                current
                  ? {
                      ...current,
                      status: "matched",
                      viewer: {
                        ...current.viewer,
                        canClaim: false,
                        canWithdraw: false
                      }
                    }
                  : current
              )
            }
            postId={String(post.id)}
          />
        ) : post.viewer.canViewMatching ? (
          <ExchangeMatchedBookingCard context={context} language={language} postId={String(post.id)} />
        ) : null}

        <section className={detailCardClassName} data-no-i18n="true">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("paymentInformation")}</h2>
              <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">
                {post.type === "intelligence" && intelligenceBookable
                  ? t("intelligenceBookingAvailable")
                  : t(post.status === "matched" ? "matchedBookingAvailablePaymentDeferred" : "bookingPaymentDeferred")}
              </p>
            </div>
            <Badge tone="green">{post.type === "intelligence" && intelligenceBookable ? t("intelligenceBookNow") : t("notEnabled")}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: post.type === "demand" ? t("budget") : t("price"), value: price, highlight: true },
              { label: t("prepayment"), value: "—", highlight: false },
              { label: t("arrivalPayment"), value: "—", highlight: false }
            ].map((row) => (
              <div className={detailInnerCardClassName} key={row.label}>
                <p className="text-[11px] font-bold text-[color:var(--client-muted)]">{row.label}</p>
                <strong className={row.highlight ? "mt-1 block text-[18px] font-black leading-tight text-[color:var(--client-primary)]" : "mt-1 block text-sm text-[color:var(--client-text)]"}>{row.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <ServiceFlowSection
          className="border-[color:var(--client-line)] bg-[color:var(--client-surface)]"
          dataNoI18n
          flow={serviceFlow}
          title={t("serviceFlow")}
        />

        {post.type === "demand" ? <PublisherCard language={language} post={post} /> : null}

        {post.intelligence?.publisherCard?.type === "shop" ? (
          <div data-no-i18n="true" data-testid="exchange-intelligence-publisher-card">
            <ExchangeIntelligenceShopCard context={context} language={language} post={post} />
          </div>
        ) : post.intelligence?.publisherCard ? (
          <div data-no-i18n="true" data-testid="exchange-intelligence-publisher-card">
            <UnifiedProfileCard
              data={mapExchangeIntelligencePublisherToProfileData(
                post.intelligence.publisherCard,
                t(post.intelligence.serviceMode),
                {
                  entity: t("technicianIdentity"),
                  bookable: t("bookable"),
                  unavailable: t("currentUnavailable"),
                  rating: t("rating"),
                  reviews: t("reviews"),
                  serviceMode: t("serviceModeLabel"),
                  completedOrders: t("completedOrders"),
                  acceptanceRate: t("acceptanceRate"),
                  experience: `${post.intelligence.publisherCard.yearsExperience}${t("yearsSuffix")}`
                }
              )}
              detailTo={post.intelligence.publisherCard.detailPath}
              language={language}
              variant="detailHeader"
            />
          </div>
        ) : null}

        {post.intelligence?.serviceCard ? (
          <UnifiedServiceInfoCard
            data={mapExchangeIntelligenceServiceToUnifiedData(
              post.intelligence.serviceCard,
              t(post.intelligence.serviceMode)
            )}
            detailTo={post.intelligence.serviceCard.detailPath}
            language={language}
          />
        ) : null}

        {post.type === "intelligence" && post.intelligence?.booking.unavailableReason ? (
          <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-black text-[color:var(--client-text)]" role="status">
            {t(intelligenceUnavailableTextKey(post.intelligence.booking.unavailableReason))}
          </div>
        ) : null}

        <section className={detailCardClassName} data-no-i18n="true">
          <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("serviceRequirements")}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from(new Set(requirementTags)).map((tag) => (
              <span className="rounded-[18px] bg-[color:var(--client-bg-soft)] px-3 py-2 text-xs font-bold text-[color:var(--client-muted)]" key={tag}>{tag}</span>
            ))}
          </div>
          <div className="mt-4 rounded-[18px] bg-[color:var(--client-bg-soft)] p-3 text-xs leading-6 text-[color:var(--client-muted)]">
            <strong className="text-[color:var(--client-text)]">{t("safetyNotice")}</strong> {t("safetyNoticeDetail")}
          </div>
        </section>

        <ExchangeInteractions context={context} onCountsChange={updateCounts} post={post} showActionBar={false} variant="detail" />
      </main>

      <ClientEdgeMask className="z-10" edge="bottom" mode="absolute" />
      <footer className="client-app-gutter absolute inset-x-0 bottom-0 z-20 grid grid-cols-[1fr,auto] items-center gap-3 border-t border-transparent bg-[color:color-mix(in_srgb,var(--client-bg)_84%,transparent)] pb-[max(env(safe-area-inset-bottom),12px)] pt-4 backdrop-blur-xl">
        <div data-no-i18n="true">
          <p className="text-xs font-bold text-[color:var(--client-muted)]">{t(post.type === "demand" ? "budget" : "price")}</p>
          <strong className="text-xl font-black text-[color:var(--client-primary)]">{price}</strong>
        </div>
        {post.type === "demand" ? (
          <button
            aria-controls={post.viewer.canClaim ? "exchange-claim-panel" : undefined}
            className="min-h-12 min-w-[170px] rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-70"
            data-action={post.viewer.canClaim ? "claim-panel-locator" : "matching-inbox"}
            disabled={!active || !demandActionTarget}
            onClick={revealDemandAction}
            type="button"
          >
            {active && post.viewer.canViewClaims
              ? t(post.demand?.matchMode === "quick" ? "quickMatchingStatus" : "matchingSelectProviders")
              : active && post.viewer.canClaim
                ? t("claimViewOptions")
                : active && post.viewer.claimUnavailableReason === "self_published"
                  ? t("claimSelfPublished")
                : t(post.status === "matched" ? "matchingCompleted" : "claimStatusMatchingClosed")}
          </button>
        ) : (
          <button
            className="min-h-12 min-w-[170px] rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-70"
            data-action="book-intelligence"
            disabled={!intelligenceBookable}
            onClick={openIntelligenceCheckout}
            type="button"
          >
            {intelligenceBookable
              ? t("intelligenceBookNow")
              : post.intelligence?.booking.unavailableReason
                ? t(intelligenceUnavailableTextKey(post.intelligence.booking.unavailableReason))
                : t("bookingDeferred")}
          </button>
        )}
      </footer>
    </MobileFullscreenPage>
  );
}
