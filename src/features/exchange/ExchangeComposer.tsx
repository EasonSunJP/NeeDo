import { useRef, useState, type ReactNode } from "react";
import { FloatingActionButton } from "../../components/mobile/FloatingActionButton";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { publishExchangePost } from "./api";
import { ExchangeComposerShell, type ExchangeComposerStep } from "./ExchangeComposerShell";
import { ExchangePublicationReview } from "./ExchangePublicationReview";
import { IntelligenceComposerFields } from "./IntelligenceComposerFields";
import {
  normalizeDemandDraft,
  normalizeIntelligenceDraft,
  type DemandComposerDraft,
  type ExchangeComposerErrorKey,
  type IntelligenceComposerDraft
} from "./exchange-composer-model";
import { exchangeText } from "./i18n";
import type {
  ExchangeContentLocale,
  ExchangePost,
  ExchangePostType,
  PublishExchangePostInput
} from "./types";

export function getExchangeComposerMode(context: MessageCenterContext): ExchangePostType {
  return context === "user" ? "demand" : "intelligence";
}

function contentLocaleForLanguage(language: Language): ExchangeContentLocale {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  return language;
}

function createEmptyDemandDraft(contentLocale: ExchangeContentLocale): DemandComposerDraft {
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
    budgetMinJpy: "",
    budgetMaxJpy: ""
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

const fieldClassName = "focus-ring min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-semibold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:var(--client-primary-soft)]";

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black text-[color:var(--client-muted)]">
      <span>
        {label}
        {required ? <span aria-hidden="true" className="text-[color:var(--client-primary)]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

const localeLabels: Record<ExchangeContentLocale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  en: "English",
  ko: "한국어"
};

function DemandComposerFields({
  draft,
  language,
  onChange
}: {
  draft: DemandComposerDraft;
  language: Language;
  onChange: (patch: Partial<DemandComposerDraft>) => void;
}) {
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  return (
    <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
      <div className="grid gap-4">
        <Field label={t("authoredLanguage")} required>
          <div className="flex min-h-12 items-center rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-black text-[color:var(--client-text)]">
            {localeLabels[draft.contentLocale]}
          </div>
        </Field>
        <Field label={t("postType")} required>
          <div className="flex min-h-12 items-center rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-black text-[color:var(--client-text)]">
            {t("demand")}
          </div>
        </Field>
        <Field label={t("title")} required>
          <input className={fieldClassName} maxLength={120} name="title" onChange={(event) => onChange({ title: event.target.value })} value={draft.title} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("serviceStartDate")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} name="serviceStartDate" onChange={(event) => onChange({ serviceStartDate: event.target.value })} type="date" value={draft.serviceStartDate} />
          </Field>
          <Field label={t("serviceStartTime")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} name="serviceStartTime" onChange={(event) => onChange({ serviceStartTime: event.target.value })} type="time" value={draft.serviceStartTime} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("serviceEndDate")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} min={draft.serviceStartDate || undefined} name="serviceEndDate" onChange={(event) => onChange({ serviceEndDate: event.target.value })} type="date" value={draft.serviceEndDate} />
          </Field>
          <Field label={t("serviceEndTime")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} name="serviceEndTime" onChange={(event) => onChange({ serviceEndTime: event.target.value })} type="time" value={draft.serviceEndTime} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("expiryDate")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} min={draft.serviceEndDate || undefined} name="expiresDate" onChange={(event) => onChange({ expiresDate: event.target.value })} type="date" value={draft.expiresDate} />
          </Field>
          <Field label={t("expiryTime")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} name="expiresTime" onChange={(event) => onChange({ expiresTime: event.target.value })} type="time" value={draft.expiresTime} />
          </Field>
        </div>
        <Field label={t("area")} required>
          <input className={fieldClassName} maxLength={120} name="areaLabel" onChange={(event) => onChange({ areaLabel: event.target.value })} value={draft.areaLabel} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("minBudget")} required>
            <input className={`${fieldClassName} min-w-0`} min="0" name="budgetMinJpy" onChange={(event) => onChange({ budgetMinJpy: event.target.value })} step="1" type="number" value={draft.budgetMinJpy} />
          </Field>
          <Field label={t("maxBudget")} required>
            <input className={`${fieldClassName} min-w-0`} min="0" name="budgetMaxJpy" onChange={(event) => onChange({ budgetMaxJpy: event.target.value })} step="1" type="number" value={draft.budgetMaxJpy} />
          </Field>
        </div>
        <Field label={t("detail")} required>
          <textarea className={`${fieldClassName} min-h-40 resize-none py-3 leading-7`} maxLength={10000} name="detail" onChange={(event) => onChange({ detail: event.target.value })} value={draft.detail} />
        </Field>
      </div>
    </section>
  );
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

function isDemandDraftDirty(draft: DemandComposerDraft) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyDemandDraft(draft.contentLocale));
}

function isIntelligenceDraftDirty(draft: IntelligenceComposerDraft) {
  return JSON.stringify(draft) !== JSON.stringify(createEmptyIntelligenceDraft(draft.contentLocale));
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
  const type = getExchangeComposerMode(context);
  const contentLocale = contentLocaleForLanguage(language);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ExchangeComposerStep>("edit");
  const [pending, setPending] = useState(false);
  const [demandDraft, setDemandDraft] = useState<DemandComposerDraft>(() => createEmptyDemandDraft(contentLocale));
  const [intelligenceDraft, setIntelligenceDraft] = useState<IntelligenceComposerDraft>(() => createEmptyIntelligenceDraft(contentLocale));
  const [normalizedPayload, setNormalizedPayload] = useState<PublishExchangePostInput | null>(null);
  const [errorKey, setErrorKey] = useState<ExchangeComposerErrorKey | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const publicationAttempt = useRef<{ serializedPayload: string; idempotencyKey: string } | null>(null);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);

  const openComposer = () => {
    setDemandDraft((current) => isDemandDraftDirty(current) ? current : createEmptyDemandDraft(contentLocale));
    setIntelligenceDraft((current) => isIntelligenceDraftDirty(current) ? current : createEmptyIntelligenceDraft(contentLocale));
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

  const resetCurrentDraft = () => {
    if (type === "demand") {
      setDemandDraft(createEmptyDemandDraft(contentLocale));
    } else {
      setIntelligenceDraft(createEmptyIntelligenceDraft(contentLocale));
    }
    setNormalizedPayload(null);
    setErrorKey(null);
    setStep("edit");
    publicationAttempt.current = null;
  };

  const closeComposer = () => {
    resetCurrentDraft();
    setOpen(false);
    focusTrigger();
  };

  const next = () => {
    const result = type === "demand"
      ? normalizeDemandDraft(demandDraft)
      : normalizeIntelligenceDraft(intelligenceDraft);
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
    } catch {
      setErrorKey("publishFailed");
    } finally {
      setPending(false);
    }
  };

  const dirty = type === "demand" ? isDemandDraftDirty(demandDraft) : isIntelligenceDraftDirty(intelligenceDraft);
  const title = t(type === "demand" ? "sendDemand" : "sendIntelligence");
  const introTitle = t(type === "demand" ? "tellPlatform" : "fillIntelligence");
  const introDescription = t(type === "demand" ? "demandComposerIntro" : "intelligenceComposerIntro");

  const review = normalizedPayload ? (
    <>
      <ExchangePublicationReview
        detail={normalizedPayload.detail}
        rows={normalizedPayload.type === "demand"
          ? [
              { label: t("area"), value: normalizedPayload.areaLabel },
              { label: t("serviceWindow"), value: `${formatComposerDateTime(normalizedPayload.serviceStartAt, language)} ～ ${formatComposerDateTime(normalizedPayload.serviceEndAt, language)}` },
              { label: t("expiry"), value: formatComposerDateTime(normalizedPayload.expiresAt, language) },
              { label: t("budget"), value: `${formatComposerMoney(normalizedPayload.budgetMinJpy)} ～ ${formatComposerMoney(normalizedPayload.budgetMaxJpy)}` }
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
            ]}
        typeLabel={t(normalizedPayload.type === "demand" ? "demand" : "intelligence")}
      />
      {errorKey ? (
        <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </>
  ) : null;

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
          pending={pending}
          review={review}
          step={step}
          title={title}
        >
          {type === "demand" ? (
            <DemandComposerFields
              draft={demandDraft}
              language={language}
              onChange={(patch) => setDemandDraft((current) => ({ ...current, ...patch }))}
            />
          ) : (
            <IntelligenceComposerFields
              draft={intelligenceDraft}
              language={language}
              onChange={(patch) => setIntelligenceDraft((current) => ({ ...current, ...patch }))}
            />
          )}
          {errorKey && step === "edit" ? (
            <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">
              {t(errorKey)}
            </p>
          ) : null}
        </ExchangeComposerShell>
      ) : null}
    </>
  );
}
