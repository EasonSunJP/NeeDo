import { useEffect, useRef, useState } from "react";
import { useOptionalAuth } from "../../auth/AuthProvider";
import { FloatingActionButton } from "../../components/mobile/FloatingActionButton";
import { DangerConfirmDialog } from "../../components/ui/DangerConfirmDialog";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { LocalizedContentLocaleRail } from "../../shared/localized-content/LocalizedContentLocaleRail";
import { contentLocales } from "../../shared/localized-content/localizedText";
import {
  getRequestPublicationContext,
  listExchangeIntelligenceServiceOptions,
  publishExchangePost
} from "./api";
import { ExchangeComposerShell, type ExchangeComposerStep } from "./ExchangeComposerShell";
import { DemandCoverField } from "./DemandCoverField";
import { ExchangePublicationReview } from "./ExchangePublicationReview";
import { IntelligenceComposerFields } from "./IntelligenceComposerFields";
import { RequestComposerFields } from "./RequestComposerFields";
import {
  applyRequestDraftPatch,
  normalizeIntelligenceDraft,
  normalizeRequestDraft,
  type ExchangeComposerErrorKey,
  type IntelligenceComposerDraft,
  type RequestComposerDraft
} from "./exchange-composer-model";
import { exchangeText } from "./i18n";
import type {
  ExchangeContentLocale,
  ExchangeIntelligenceServiceOption,
  ExchangePost,
  ExchangePostType,
  ExchangeRequestPublicationContext,
  PublishExchangePostInput
} from "./types";

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
    cover: null,
    title: "",
    detail: "",
    serviceStartDate: "",
    serviceStartTime: "",
    serviceEndDate: "",
    serviceEndTime: "",
    expiresDate: "",
    expiresTime: "",
    targetProviderCount: "1",
    serviceMode: "store",
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
    serviceRef: "",
    serviceStartDate: "",
    serviceStartTime: "",
    serviceEndDate: "",
    serviceEndTime: "",
    expiresDate: "",
    expiresTime: "",
    campaignPriceJpy: "",
    pricingMode: "price",
    discountPercent: "10"
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

function hasRequestDraftContent(draft: RequestComposerDraft) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyRequestDraft(draft.contentLocale));
}

function hasIntelligenceDraftContent(draft: IntelligenceComposerDraft) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyIntelligenceDraft(draft.contentLocale));
}

function isRequestDraftDirty(draft: RequestComposerDraft, initialLocale: ExchangeContentLocale) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyRequestDraft(initialLocale));
}

function isIntelligenceDraftDirty(draft: IntelligenceComposerDraft, initialLocale: ExchangeContentLocale) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyIntelligenceDraft(initialLocale));
}

function errorKeyFromPublicationFailure(error: unknown): ExchangeComposerErrorKey {
  const message = error instanceof Error ? error.message : "";
  if (message === "error.exchange.request_target_limit") return "targetProviderLimit";
  if (message === "error.exchange.request_fee_unavailable") return "requestFeeUnavailable";
  if (message === "error.wallet.insufficient_available") return "insufficientFunds";
  if (message === "error.user_policy.ekyc_required") return "ekycRequired";
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
  const merchantCanPublishIntelligence = context === "merchant" && Boolean(auth?.hasPermission(CREATE_INTELLIGENCE_PERMISSION));
  const type = getExchangeComposerMode(context);
  const canPublishDefaultType = context !== "merchant" || merchantCanPublishIntelligence;
  const contentLocale = contentLocaleForLanguage(language);
  const [open, setOpen] = useState(false);
  const [editingLocale, setEditingLocale] = useState<ExchangeContentLocale>(contentLocale);
  const [savedLocale, setSavedLocale] = useState<ExchangeContentLocale | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [step, setStep] = useState<ExchangeComposerStep>("edit");
  const [pending, setPending] = useState(false);
  const [requestDraft, setRequestDraft] = useState<RequestComposerDraft>(() => createEmptyRequestDraft(contentLocale));
  const [intelligenceDraft, setIntelligenceDraft] = useState<IntelligenceComposerDraft>(() => createEmptyIntelligenceDraft(contentLocale));
  const [requestContext, setRequestContext] = useState<ExchangeRequestPublicationContext | null>(null);
  const [requestContextStatus, setRequestContextStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [requestContextVersion, setRequestContextVersion] = useState(0);
  const [intelligenceServiceOptions, setIntelligenceServiceOptions] = useState<ExchangeIntelligenceServiceOption[]>([]);
  const [intelligenceServicesStatus, setIntelligenceServicesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [intelligenceServicesVersion, setIntelligenceServicesVersion] = useState(0);
  const [normalizedPayload, setNormalizedPayload] = useState<PublishExchangePostInput | null>(null);
  const [errorKey, setErrorKey] = useState<ExchangeComposerErrorKey | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const publicationAttempt = useRef<{ serializedPayload: string; idempotencyKey: string } | null>(null);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);

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

  useEffect(() => {
    if (!open || type !== "intelligence") return;
    const controller = new AbortController();
    setIntelligenceServicesStatus("loading");
    const load = async () => {
      const first = await listExchangeIntelligenceServiceOptions({
        page: 1,
        pageSize: 100,
        signal: controller.signal
      });
      const options = [...first.list];
      let page = 2;
      while (options.length < first.total) {
        const next = await listExchangeIntelligenceServiceOptions({
          page,
          pageSize: 100,
          signal: controller.signal
        });
        options.push(...next.list);
        if (next.list.length === 0) break;
        page += 1;
      }
      if (!controller.signal.aborted) {
        setIntelligenceServiceOptions(options);
        setIntelligenceServicesStatus("ready");
        setIntelligenceDraft((current) =>
          current.serviceRef && !options.some((option) => option.serviceRef === current.serviceRef)
            ? { ...current, serviceRef: "", campaignPriceJpy: "" }
            : current
        );
      }
    };
    void load().catch(() => {
      if (controller.signal.aborted) return;
      setIntelligenceServicesStatus("error");
    });
    return () => controller.abort();
  }, [open, intelligenceServicesVersion, type]);

  const openComposer = () => {
    setEditingLocale(contentLocale);
    setSavedLocale(null);
    setRequestDraft((current) => hasRequestDraftContent(current) ? current : createEmptyRequestDraft(contentLocale));
    setIntelligenceDraft((current) => hasIntelligenceDraftContent(current) ? current : createEmptyIntelligenceDraft(contentLocale));
    if (type === "demand") {
      setRequestContext(null);
      setRequestContextStatus("loading");
    } else {
      setIntelligenceServicesStatus("loading");
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
    setSyncOpen(false);
    setSavedLocale(null);
    setRequestDraft(createEmptyRequestDraft(contentLocale));
    setIntelligenceDraft(createEmptyIntelligenceDraft(contentLocale));
    setRequestContext(null);
    setRequestContextStatus("idle");
    setIntelligenceServiceOptions([]);
    setIntelligenceServicesStatus("idle");
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
      result = normalizeRequestDraft(requestDraft, requestContext, Date.now());
    } else {
      const selectedService = intelligenceServiceOptions.find(
        (option) => option.serviceRef === intelligenceDraft.serviceRef
      );
      result = normalizeIntelligenceDraft(
        intelligenceDraft,
        selectedService?.catalogPriceJpy ?? null,
        Date.now()
      );
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
    if (normalizedPayload.type === "demand" && Date.parse(normalizedPayload.expiresAt) <= Date.now()) {
      setErrorKey("applicationDeadlinePassed");
      setNormalizedPayload(null);
      setStep("edit");
      return;
    }
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

  const dirty = type === "demand"
    ? isRequestDraftDirty(requestDraft, contentLocale)
    : isIntelligenceDraftDirty(intelligenceDraft, contentLocale);
  const title = t(type === "demand" ? "sendDemand" : "sendIntelligence");
  const introTitle = t(type === "demand" ? "tellPlatform" : "fillIntelligence");
  const introDescription = t(type === "demand" ? "demandComposerIntro" : "intelligenceComposerIntro");
  const activeDraft = type === "demand" ? requestDraft : intelligenceDraft;
  const editingContent = editingLocale === activeDraft.contentLocale
    ? { title: activeDraft.title, detail: activeDraft.detail }
    : activeDraft.contentTranslations?.[editingLocale] ?? { title: "", detail: "" };
  const selectedDraft = { ...activeDraft, ...editingContent };
  const selectLocale = (locale: ExchangeContentLocale) => {
    setSavedLocale(null);
    if (!activeDraft.title && !activeDraft.detail && !Object.values(activeDraft.contentTranslations ?? {}).some((value) => value?.title || value?.detail)) {
      if (type === "demand") setRequestDraft((current) => ({ ...current, contentLocale: locale }));
      else setIntelligenceDraft((current) => ({ ...current, contentLocale: locale }));
    }
    setEditingLocale(locale);
  };
  const editRequest = (patch: Partial<RequestComposerDraft>) => {
    setSavedLocale(null);
    setRequestDraft((current) => {
      if (editingLocale === current.contentLocale) return applyRequestDraftPatch(current, patch);
      const { title, detail, ...rest } = patch;
      const localized = current.contentTranslations?.[editingLocale] ?? { title: "", detail: "" };
      return applyRequestDraftPatch(current, {
        ...rest,
        ...((title !== undefined || detail !== undefined) ? {
          contentTranslations: { ...current.contentTranslations, [editingLocale]: { title: title ?? localized.title, detail: detail ?? localized.detail } }
        } : {})
      });
    });
  };
  const editIntelligence = (patch: Partial<IntelligenceComposerDraft>) => {
    setSavedLocale(null);
    setIntelligenceDraft((current) => {
      if (editingLocale === current.contentLocale) return { ...current, ...patch };
      const { title, detail, ...rest } = patch;
      const localized = current.contentTranslations?.[editingLocale] ?? { title: "", detail: "" };
      return {
        ...current, ...rest,
        ...((title !== undefined || detail !== undefined) ? {
          contentTranslations: { ...current.contentTranslations, [editingLocale]: { title: title ?? localized.title, detail: detail ?? localized.detail } }
        } : {})
      };
    });
  };
  const syncAll = () => {
    const content = { title: editingContent.title, detail: editingContent.detail };
    const translations = Object.fromEntries(contentLocales
      .filter(({ code }) => code !== activeDraft.contentLocale)
      .map(({ code }) => [code, content]));
    if (type === "demand") setRequestDraft((current) => ({ ...current, ...content, contentTranslations: translations }));
    else setIntelligenceDraft((current) => ({ ...current, ...content, contentTranslations: translations }));
    setSyncOpen(false);
  };

  const review = normalizedPayload ? (
    <>
      <ExchangePublicationReview
        coverUrl={normalizedPayload.type === "demand" ? requestDraft.cover?.uploadedUrl ?? null : null}
        coverAlt={t("demandCoverPreviewAlt")}
        detail={normalizedPayload.detail}
        rows={[
          { label: t("title"), value: normalizedPayload.title },
          { label: t("authoredLanguage"), value: contentLocaleLabel(normalizedPayload.contentLocale) },
          ...(normalizedPayload.type === "demand"
            ? [
              { label: t("serviceMode"), value: t(normalizedPayload.serviceMode === "home" ? "home" : "store") },
              { label: t("addressLine1"), value: normalizedPayload.addressLine1 },
              { label: t("serviceWindow"), value: `${formatComposerDateTime(normalizedPayload.serviceStartAt, language)} ～ ${formatComposerDateTime(normalizedPayload.serviceEndAt, language)}` },
              { label: t("applicationDeadlineTime"), value: formatComposerDateTime(normalizedPayload.expiresAt, language) },
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
                ? [{ label: t("addressLine2"), value: `${normalizedPayload.addressLine2} · ${t("hiddenUntilMatch")}` }]
                : []),
              ...(normalizedPayload.addressLine3
                ? [{ label: t("addressLine3"), value: `${normalizedPayload.addressLine3} · ${t("hiddenUntilMatch")}` }]
                : []),
              { label: t("publisherIdentityVisible"), value: t(normalizedPayload.publisherIdentityPublic ? "visibleToProviders" : "hiddenUntilMatch") }
              ]
            : [
              {
                label: t("intelligenceService"),
                value: intelligenceServiceOptions.find(
                  (option) => option.serviceRef === normalizedPayload.serviceRef
                )?.name ?? normalizedPayload.serviceRef
              },
              { label: t("serviceWindow"), value: `${formatComposerDateTime(normalizedPayload.serviceStartAt, language)} ～ ${formatComposerDateTime(normalizedPayload.serviceEndAt, language)}` },
              { label: t("expiry"), value: formatComposerDateTime(normalizedPayload.expiresAt, language) },
              {
                label: t("originalPrice"),
                value: formatComposerMoney(
                  intelligenceServiceOptions.find(
                    (option) => option.serviceRef === normalizedPayload.serviceRef
                  )?.catalogPriceJpy ?? null
                )
              },
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

  if (!canPublishDefaultType) return null;

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
          <LocalizedContentLocaleRail
            ariaLabel={t("authoredLanguage")}
            locale={editingLocale}
            onSelect={selectLocale}
            saveAction={{ label: translateText("保存", language), ariaLabel: translateText("保存当前语言", language), onClick: () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); setSavedLocale(editingLocale); } }}
            syncAction={{ label: translateText("同步", language), ariaLabel: translateText("同步到全部语言版本", language), disabled: !editingContent.title.trim() || !editingContent.detail.trim(), onClick: () => setSyncOpen(true) }}
            testId="exchange-composer-locale-rail"
          />
          {savedLocale === editingLocale ? <p className="sr-only" role="status">{translateText("当前语言已保存到草稿", language)}</p> : null}
          {errorKey && step === "edit" ? (
            <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">
              {t(errorKey)}
            </p>
          ) : null}
          {type === "demand" ? (
            requestContextStatus === "ready" && requestContext ? (
              <>
                <DemandCoverField
                  language={language}
                  onChange={(cover) => setRequestDraft((current) => ({ ...current, cover }))}
                  value={requestDraft.cover}
                />
                <RequestComposerFields
                  context={requestContext}
                  draft={selectedDraft as RequestComposerDraft}
                  language={language}
                  onChange={editRequest}
                />
              </>
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
              draft={selectedDraft as IntelligenceComposerDraft}
              language={language}
              onRetryServiceOptions={() => setIntelligenceServicesVersion((version) => version + 1)}
              onChange={editIntelligence}
              serviceOptions={intelligenceServiceOptions}
              serviceOptionsStatus={intelligenceServicesStatus === "idle" ? "loading" : intelligenceServicesStatus}
            />
          )}
        </ExchangeComposerShell>
      ) : null}
      {syncOpen ? <DangerConfirmDialog
        confirmLabel={translateText("确认同步", language)}
        description={translateText("当前版本的文字会覆盖其他四个版本。", language)}
        onCancel={() => setSyncOpen(false)}
        onConfirm={syncAll}
        open={syncOpen}
        title={translateText("同步到全部语言版本", language)}
      /> : null}
    </>
  );
}
