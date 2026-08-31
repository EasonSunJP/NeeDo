import { useEffect, useRef, useState } from "react";
import { useOptionalAuth } from "../../auth/AuthProvider";
import { FloatingActionButton } from "../../components/mobile/FloatingActionButton";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { getRequestPublicationContext, publishExchangePost } from "./api";
import { ExchangeComposerShell, type ExchangeComposerStep } from "./ExchangeComposerShell";
import { ExchangePublicationReview } from "./ExchangePublicationReview";
import { IntelligenceComposerFields } from "./IntelligenceComposerFields";
import { RequestComposerFields } from "./RequestComposerFields";
import {
  normalizeIntelligenceDraft,
  normalizeRequestDraft,
  type ExchangeComposerErrorKey,
  type IntelligenceComposerDraft,
  type RequestComposerDraft
} from "./exchange-composer-model";
import { exchangeText } from "./i18n";
import type {
  ExchangeContentLocale,
  ExchangePost,
  ExchangePostType,
  ExchangeRequestPublicationContext,
  PublishExchangePostInput
} from "./types";

const CREATE_DEMAND_PERMISSION = "exchange:posts:create-demand";
const CREATE_INTELLIGENCE_PERMISSION = "exchange:posts:create-intelligence";

export function getExchangeComposerMode(context: MessageCenterContext): ExchangePostType {
  return context === "user" ? "demand" : "intelligence";
}

function contentLocaleForLanguage(language: Language): ExchangeContentLocale {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  return language;
}

function contentLocaleLabel(locale: ExchangeContentLocale) {
  return {
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文",
    ja: "日本語",
    en: "English",
    ko: "한국어"
  }[locale];
}

function createEmptyRequestDraft(contentLocale: ExchangeContentLocale): RequestComposerDraft {
  return {
    contentLocale,
    title: "",
    detail: "",
    serviceStartDate: "",
    serviceStartTime: "",
    serviceEndDate: "",
    serviceEndTime: "",
    expiresDate: "",
    expiresTime: "",
    targetProviderCount: "1",
    matchMode: "quick",
    budgetMode: "total",
    budgetMinJpy: "",
    budgetMaxJpy: "",
    addressLine1: "",
    addressLine2: "",
    addressLine3: "",
    addressLine2Public: false,
    addressLine3Public: false,
    publisherIdentityPublic: false
  };
}

function createEmptyIntelligenceDraft(contentLocale: ExchangeContentLocale): IntelligenceComposerDraft {
  return {
    contentLocale,
    title: "",
    detail: "",
    areaLabel: "",
    serviceStartDate: "",
    serviceStartTime: "",
    serviceEndDate: "",
    serviceEndTime: "",
    expiresDate: "",
    expiresTime: "",
    serviceMode: "store",
    addressLabel: "",
    serviceAreas: "",
    originalPriceJpy: "",
    campaignPriceJpy: ""
  };
}

function formatComposerMoney(value: number | null) {
  return value === null ? "—" : `¥${value.toLocaleString("ja-JP")}`;
}

function formatComposerDateTime(value: string, language: Language) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const locale = language === "zh"
    ? "zh-CN"
    : language === "zh-Hant"
      ? "zh-TW"
      : language === "ja"
        ? "ja-JP"
        : language === "ko"
          ? "ko-KR"
          : "en-US";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isRequestDraftDirty(draft: RequestComposerDraft) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyRequestDraft(draft.contentLocale));
}

function isIntelligenceDraftDirty(draft: IntelligenceComposerDraft) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyIntelligenceDraft(draft.contentLocale));
}

function errorKeyFromPublicationFailure(error: unknown): ExchangeComposerErrorKey {
  const message = error instanceof Error ? error.message : "";
  if (message === "error.exchange.request_target_limit") return "targetProviderLimit";
  if (message === "error.exchange.request_fee_unavailable") return "requestFeeUnavailable";
  if (message === "error.wallet.insufficient_available") return "insufficientFunds";
  return "publishFailed";
}

function requestContextIsStale(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "error.exchange.request_target_limit"
    || message === "error.exchange.request_fee_unavailable";
}

export function ExchangeComposer({
  context,
  onPublished,
  triggerVariant = "button"
}: {
  context: MessageCenterContext;
  onPublished: (post: ExchangePost) => void;
  triggerVariant?: "button" | "floating";
}) {
  const { language } = useI18n();
  const auth = useOptionalAuth();
  const merchantCanPublishRequest = context === "merchant" && Boolean(auth?.hasPermission(CREATE_DEMAND_PERMISSION));
  const merchantCanPublishIntelligence = context === "merchant" && Boolean(auth?.hasPermission(CREATE_INTELLIGENCE_PERMISSION));
  const availableTypes: ExchangePostType[] = context === "user"
    ? ["demand"]
    : context === "technician"
      ? ["intelligence"]
      : [
          ...(merchantCanPublishRequest ? ["demand" as const] : []),
          ...(merchantCanPublishIntelligence ? ["intelligence" as const] : [])
        ];
  const defaultType = availableTypes.includes(getExchangeComposerMode(context))
    ? getExchangeComposerMode(context)
    : availableTypes[0] ?? getExchangeComposerMode(context);
  const contentLocale = contentLocaleForLanguage(language);
  const [type, setType] = useState<ExchangePostType>(defaultType);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ExchangeComposerStep>("edit");
  const [pending, setPending] = useState(false);
  const [requestDraft, setRequestDraft] = useState<RequestComposerDraft>(() => createEmptyRequestDraft(contentLocale));
  const [intelligenceDraft, setIntelligenceDraft] = useState<IntelligenceComposerDraft>(() => createEmptyIntelligenceDraft(contentLocale));
  const [requestContext, setRequestContext] = useState<ExchangeRequestPublicationContext | null>(null);
  const [requestContextStatus, setRequestContextStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [requestContextVersion, setRequestContextVersion] = useState(0);
  const [normalizedPayload, setNormalizedPayload] = useState<PublishExchangePostInput | null>(null);
  const [errorKey, setErrorKey] = useState<ExchangeComposerErrorKey | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const publicationAttempt = useRef<{ serializedPayload: string; idempotencyKey: string } | null>(null);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const availableTypeKey = availableTypes.join(":");

  useEffect(() => {
    if (availableTypes.includes(type)) return;
    const nextType = availableTypes[0];
    if (nextType) setType(nextType);
  }, [availableTypeKey, type]);

  useEffect(() => {
    if (!open || type !== "demand") return;
    let disposed = false;
    setRequestContextStatus("loading");
    setRequestContext(null);
    void getRequestPublicationContext()
      .then((result) => {
        if (disposed) return;
        setRequestContext(result);
        setRequestContextStatus("ready");
        if (!result.canPublish) setErrorKey("requestNotAllowed");
      })
      .catch(() => {
        if (disposed) return;
        setRequestContextStatus("error");
        setErrorKey("contextFailed");
      });
    return () => {
      disposed = true;
    };
  }, [open, requestContextVersion, type]);

  const openComposer = () => {
    setRequestDraft((current) => isRequestDraftDirty(current) ? current : createEmptyRequestDraft(contentLocale));
    setIntelligenceDraft((current) => isIntelligenceDraftDirty(current) ? current : createEmptyIntelligenceDraft(contentLocale));
    if (type === "demand") {
      setRequestContext(null);
      setRequestContextStatus("loading");
    }
    setErrorKey(null);
    setStep("edit");
    setOpen(true);
  };

  const focusTrigger = () => {
    queueMicrotask(() => {
      const fallback = document.querySelector<HTMLElement>(`[aria-label="${t(type === "demand" ? "publishDemand" : "publishIntelligence")}"]`);
      (triggerRef.current ?? fallback)?.focus();
    });
  };

  const resetDrafts = () => {
    setRequestDraft(createEmptyRequestDraft(contentLocale));
    setIntelligenceDraft(createEmptyIntelligenceDraft(contentLocale));
    setRequestContext(null);
    setRequestContextStatus("idle");
    setNormalizedPayload(null);
    setErrorKey(null);
    setStep("edit");
    publicationAttempt.current = null;
  };

  const closeComposer = () => {
    resetDrafts();
    setOpen(false);
    focusTrigger();
  };

  const selectType = (nextType: ExchangePostType) => {
    if (!availableTypes.includes(nextType) || nextType === type) return;
    setType(nextType);
    setNormalizedPayload(null);
    setErrorKey(null);
    setStep("edit");
    publicationAttempt.current = null;
    if (nextType === "demand") {
      setRequestContext(null);
      setRequestContextStatus("loading");
    }
  };

  const next = () => {
    let result: ReturnType<typeof normalizeRequestDraft> | ReturnType<typeof normalizeIntelligenceDraft>;
    if (type === "demand") {
      if (!requestContext || requestContextStatus !== "ready") {
        setErrorKey("contextFailed");
        return;
      }
      if (!requestContext.canPublish) {
        setErrorKey("requestNotAllowed");
        return;
      }
      result = normalizeRequestDraft(requestDraft, requestContext);
    } else {
      result = normalizeIntelligenceDraft(intelligenceDraft);
    }
    if (!result.ok) {
      setErrorKey(result.errorKey);
      return;
    }
    setErrorKey(null);
    setNormalizedPayload(result.value);
    setStep("review");
  };

  const keyFor = (payload: PublishExchangePostInput) => {
    const serializedPayload = JSON.stringify(payload);
    if (publicationAttempt.current?.serializedPayload === serializedPayload) {
      return publicationAttempt.current.idempotencyKey;
    }
    const nextAttempt = { serializedPayload, idempotencyKey: globalThis.crypto.randomUUID() };
    publicationAttempt.current = nextAttempt;
    return nextAttempt.idempotencyKey;
  };

  const publish = async () => {
    if (!normalizedPayload || pending) return;
    setErrorKey(null);
    setPending(true);
    try {
      const post = await publishExchangePost(normalizedPayload, keyFor(normalizedPayload));
      onPublished(post);
      closeComposer();
    } catch (error) {
      setErrorKey(errorKeyFromPublicationFailure(error));
      if (normalizedPayload.type === "demand" && requestContextIsStale(error)) {
        setStep("edit");
        setNormalizedPayload(null);
        setRequestContext(null);
        setRequestContextStatus("loading");
        setRequestContextVersion((version) => version + 1);
      }
    } finally {
      setPending(false);
    }
  };

  const dirty = availableTypes.length > 1
    ? isRequestDraftDirty(requestDraft) || isIntelligenceDraftDirty(intelligenceDraft)
    : type === "demand"
      ? isRequestDraftDirty(requestDraft)
      : isIntelligenceDraftDirty(intelligenceDraft);
  const title = t(type === "demand" ? "sendDemand" : "sendIntelligence");
  const introTitle = t(type === "demand" ? "tellPlatform" : "fillIntelligence");
  const introDescription = t(type === "demand" ? "demandComposerIntro" : "intelligenceComposerIntro");

  const review = normalizedPayload ? (
    <>
      <ExchangePublicationReview
        detail={normalizedPayload.detail}
        rows={[
          { label: t("title"), value: normalizedPayload.title },
          { label: t("authoredLanguage"), value: contentLocaleLabel(normalizedPayload.contentLocale) },
          ...(normalizedPayload.type === "demand"
            ? [
              { label: t("addressLine1"), value: normalizedPayload.addressLine1 },
              { label: t("serviceWindow"), value: `${formatComposerDateTime(normalizedPayload.serviceStartAt, language)} ～ ${formatComposerDateTime(normalizedPayload.serviceEndAt, language)}` },
              { label: t("expiry"), value: formatComposerDateTime(normalizedPayload.expiresAt, language) },
              { label: t("targetProviderCount"), value: String(normalizedPayload.targetProviderCount) },
              { label: t("matchMode"), value: t(normalizedPayload.matchMode === "quick" ? "quickMatch" : "selectiveMatch") },
              { label: t("budgetMode"), value: t(normalizedPayload.budgetMode === "total" ? "totalBudget" : "perProviderBudget") },
              {
                label: t("budget"),
                value: normalizedPayload.budgetMinJpy === null
                  ? formatComposerMoney(normalizedPayload.budgetMaxJpy)
                  : `${formatComposerMoney(normalizedPayload.budgetMinJpy)} ～ ${formatComposerMoney(normalizedPayload.budgetMaxJpy)}`
              },
              ...(normalizedPayload.addressLine2
                ? [{ label: t("addressLine2"), value: `${normalizedPayload.addressLine2} · ${t(normalizedPayload.addressLine2Public ? "visibleToProviders" : "hiddenUntilMatch")}` }]
                : []),
              ...(normalizedPayload.addressLine3
                ? [{ label: t("addressLine3"), value: `${normalizedPayload.addressLine3} · ${t(normalizedPayload.addressLine3Public ? "visibleToProviders" : "hiddenUntilMatch")}` }]
                : []),
              { label: t("publisherIdentityVisible"), value: t(normalizedPayload.publisherIdentityPublic ? "visibleToProviders" : "hiddenUntilMatch") }
              ]
            : [
              { label: t("area"), value: normalizedPayload.areaLabel },
              { label: t("serviceMode"), value: t(normalizedPayload.serviceMode) },
              { label: t("serviceWindow"), value: `${formatComposerDateTime(normalizedPayload.serviceStartAt, language)} ～ ${formatComposerDateTime(normalizedPayload.serviceEndAt, language)}` },
              { label: t("expiry"), value: formatComposerDateTime(normalizedPayload.expiresAt, language) },
              { label: t("publicAddress"), value: normalizedPayload.addressLabel ?? "—" },
              { label: t("serviceAreas"), value: normalizedPayload.serviceAreas.join("、") },
              { label: t("originalPrice"), value: formatComposerMoney(normalizedPayload.originalPriceJpy) },
              { label: t("campaignPrice"), value: formatComposerMoney(normalizedPayload.campaignPriceJpy) }
              ])
        ]}
        publicationFee={normalizedPayload.type === "demand" && requestContext
          ? {
              ...requestContext.publicationFee,
              label: t("requestPublicationFee"),
              notice: t("requestFeeFreezeNotice")
            }
          : undefined}
        typeLabel={t(normalizedPayload.type === "demand" ? "demand" : "intelligence")}
      />
      {errorKey ? (
        <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </>
  ) : null;

  if (availableTypes.length === 0) return null;

  return (
    <>
      {triggerVariant === "floating" ? (
        <FloatingActionButton ariaLabel={t(type === "demand" ? "publishDemand" : "publishIntelligence")} onClick={openComposer}>
          <svg aria-hidden="true" className="h-[42px] w-[42px] overflow-visible" fill="none" viewBox="0 0 32 32">
            <path d="M10 9.6h10.6a3.1 3.1 0 0 1 3.1 3.1v4.9a3.1 3.1 0 0 1-3.1 3.1h-5.7l-5.1 3.35a.7.7 0 0 1-1.09-.58v-2.9A3.1 3.1 0 0 1 6.9 17.6v-4.9A3.1 3.1 0 0 1 10 9.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.65" />
            <path d="m11.15 15.15 3.25 3.05L25.15 8.35" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.85" />
          </svg>
        </FloatingActionButton>
      ) : (
        <button
          className="focus-ring min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-lg transition active:scale-[0.98]"
          data-action="open-composer"
          onClick={openComposer}
          ref={triggerRef}
          type="button"
        >
          {t(type === "demand" ? "publishDemand" : "publishIntelligence")}
        </button>
      )}

      {open ? (
        <ExchangeComposerShell
          dirty={dirty}
          introDescription={introDescription}
          introTitle={introTitle}
          language={language}
          onBack={() => {
            setErrorKey(null);
            setStep("edit");
          }}
          onClose={closeComposer}
          onNext={next}
          onPublish={() => void publish()}
          pending={pending || (type === "demand" && (
            requestContextStatus !== "ready" || !requestContext?.canPublish
          ))}
          review={review}
          step={step}
          title={title}
        >
          {availableTypes.length === 2 ? (
            <section
              aria-label={t("choosePostType")}
              className="grid grid-cols-2 gap-1 rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-1 shadow-panel"
              data-testid="exchange-post-type-selector"
              role="radiogroup"
            >
              {availableTypes.map((availableType) => (
                <button
                  aria-checked={type === availableType}
                  className={type === availableType
                    ? "focus-ring min-h-12 rounded-[10px] bg-[color:var(--client-primary)] text-sm font-black text-[color:var(--client-primary-contrast)]"
                    : "focus-ring min-h-12 rounded-[10px] text-sm font-black text-[color:var(--client-muted)]"}
                  data-action={`select-${availableType}`}
                  key={availableType}
                  onClick={() => selectType(availableType)}
                  role="radio"
                  type="button"
                >
                  {t(availableType)}
                </button>
              ))}
            </section>
          ) : null}
          {errorKey && step === "edit" ? (
            <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">
              {t(errorKey)}
            </p>
          ) : null}
          {type === "demand" ? (
            requestContextStatus === "ready" && requestContext ? (
              <RequestComposerFields
                context={requestContext}
                draft={requestDraft}
                language={language}
                onChange={(patch) => setRequestDraft((current) => ({ ...current, ...patch }))}
              />
            ) : (
              <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-sm font-bold text-[color:var(--client-muted)] shadow-panel">
                <p role={requestContextStatus === "error" ? "alert" : undefined}>
                  {t(requestContextStatus === "error" ? "contextFailed" : "contextLoading")}
                </p>
                {requestContextStatus === "error" ? (
                  <button
                    className="focus-ring mt-4 min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 font-black text-[color:var(--client-primary-contrast)]"
                    data-action="retry-request-context"
                    onClick={() => {
                      setErrorKey(null);
                      setRequestContextVersion((version) => version + 1);
                    }}
                    type="button"
                  >
                    {t("retry")}
                  </button>
                ) : null}
              </section>
            )
          ) : (
            <IntelligenceComposerFields
              draft={intelligenceDraft}
              language={language}
              onChange={(patch) => setIntelligenceDraft((current) => ({ ...current, ...patch }))}
            />
          )}
        </ExchangeComposerShell>
      ) : null}
    </>
  );
}
