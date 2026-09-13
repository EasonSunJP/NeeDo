import type { ReactNode } from "react";
import type { Language } from "../../i18n/translations";
import { exchangeText } from "./i18n";
import type { IntelligenceComposerDraft } from "./exchange-composer-model";
import type { ExchangeIntelligenceServiceOption } from "./types";

const fieldClassName = "focus-ring min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-semibold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:var(--client-primary-soft)]";

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black text-[color:var(--client-muted)]">
      <span>{label}{required ? <span aria-hidden="true" className="text-[color:var(--client-primary)]"> *</span> : null}</span>
      {children}
    </label>
  );
}

const localeLabels: Record<IntelligenceComposerDraft["contentLocale"], string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  en: "English",
  ko: "한국어"
};

export function IntelligenceComposerFields({
  draft,
  language,
  serviceOptions,
  serviceOptionsStatus,
  onRetryServiceOptions,
  onChange
}: {
  draft: IntelligenceComposerDraft;
  language: Language;
  serviceOptions: ExchangeIntelligenceServiceOption[];
  serviceOptionsStatus: "loading" | "ready" | "error";
  onRetryServiceOptions: () => void;
  onChange: (patch: Partial<IntelligenceComposerDraft>) => void;
}) {
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const selected = serviceOptions.find((option) => option.serviceRef === draft.serviceRef) ?? null;

  return (
    <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel" data-testid="exchange-intelligence-composer-fields">
      <div className="grid gap-4">
        <Field label={t("authoredLanguage")} required>
          <select
            aria-label={t("authoredLanguage")}
            className={fieldClassName}
            name="contentLocale"
            onChange={(event) => onChange({ contentLocale: event.target.value as IntelligenceComposerDraft["contentLocale"] })}
            value={draft.contentLocale}
          >
            {Object.entries(localeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label={t("postType")} required>
          <div className="flex min-h-12 items-center rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-black text-[color:var(--client-text)]">{t("intelligence")}</div>
        </Field>

        <Field label={t("intelligenceService")} required>
          {serviceOptionsStatus === "loading" ? (
            <p className="rounded-2xl bg-[color:var(--client-bg)] px-4 py-4 text-sm font-bold" role="status">{t("serviceOptionsLoading")}</p>
          ) : serviceOptionsStatus === "error" ? (
            <div className="rounded-2xl bg-[color:var(--client-bg)] p-4">
              <p className="text-sm font-bold" role="alert">{t("serviceOptionsFailed")}</p>
              <button className="focus-ring mt-3 min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)]" data-action="retry-intelligence-services" onClick={onRetryServiceOptions} type="button">{t("retry")}</button>
            </div>
          ) : serviceOptions.length === 0 ? (
            <p className="rounded-2xl bg-[color:var(--client-bg)] px-4 py-4 text-sm font-bold" role="status">{t("serviceOptionsEmpty")}</p>
          ) : (
            <div aria-label={t("intelligenceService")} className="grid gap-2" role="radiogroup">
              {serviceOptions.map((option) => (
                <button
                  aria-checked={draft.serviceRef === option.serviceRef}
                  className={draft.serviceRef === option.serviceRef ? "focus-ring rounded-2xl border-2 border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] p-4 text-left" : "focus-ring rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 text-left"}
                  data-service-ref={option.serviceRef}
                  key={option.serviceRef}
                  onClick={() => onChange({ serviceRef: option.serviceRef, campaignPriceJpy: String(option.catalogPriceJpy) })}
                  role="radio"
                  type="button"
                >
                  <span className="block text-sm font-black text-[color:var(--client-text)]">{option.name}</span>
                  <span className="mt-1 block text-xs font-semibold text-[color:var(--client-muted)]">{option.technician?.displayName ?? option.shop.name} · {option.durationMinutes} {t("minutes")} · ¥{option.catalogPriceJpy.toLocaleString("ja-JP")}</span>
                  <span className="mt-1 block text-xs font-semibold text-[color:var(--client-muted)]">{option.shop.name} · {option.shop.address}</span>
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label={t("title")} required><input className={fieldClassName} maxLength={120} name="title" onChange={(event) => onChange({ title: event.target.value })} value={draft.title} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("serviceStartDate")} required><input className={`${fieldClassName} min-w-0 px-3`} name="serviceStartDate" onChange={(event) => onChange({ serviceStartDate: event.target.value })} type="date" value={draft.serviceStartDate} /></Field>
          <Field label={t("serviceStartTime")} required><input className={`${fieldClassName} min-w-0 px-3`} name="serviceStartTime" onChange={(event) => onChange({ serviceStartTime: event.target.value })} type="time" value={draft.serviceStartTime} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("serviceEndDate")} required><input className={`${fieldClassName} min-w-0 px-3`} min={draft.serviceStartDate || undefined} name="serviceEndDate" onChange={(event) => onChange({ serviceEndDate: event.target.value })} type="date" value={draft.serviceEndDate} /></Field>
          <Field label={t("serviceEndTime")} required><input className={`${fieldClassName} min-w-0 px-3`} name="serviceEndTime" onChange={(event) => onChange({ serviceEndTime: event.target.value })} type="time" value={draft.serviceEndTime} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("expiryDate")} required><input className={`${fieldClassName} min-w-0 px-3`} min={draft.serviceEndDate || undefined} name="expiresDate" onChange={(event) => onChange({ expiresDate: event.target.value })} type="date" value={draft.expiresDate} /></Field>
          <Field label={t("expiryTime")} required><input className={`${fieldClassName} min-w-0 px-3`} name="expiresTime" onChange={(event) => onChange({ expiresTime: event.target.value })} type="time" value={draft.expiresTime} /></Field>
        </div>
        <Field label={t("campaignPrice")} required><input className={fieldClassName} disabled={!selected} max={selected?.catalogPriceJpy} min="0" name="campaignPriceJpy" onChange={(event) => onChange({ campaignPriceJpy: event.target.value })} step="1" type="number" value={draft.campaignPriceJpy} /></Field>
        <Field label={t("detail")} required><textarea className={`${fieldClassName} min-h-40 resize-none py-3 leading-7`} maxLength={10000} name="detail" onChange={(event) => onChange({ detail: event.target.value })} value={draft.detail} /></Field>
      </div>
    </section>
  );
}
