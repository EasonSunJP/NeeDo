import type { ReactNode } from "react";
import type { Language } from "../../i18n/translations";
import { exchangeText } from "./i18n";
import type { IntelligenceComposerDraft } from "./exchange-composer-model";

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
  onChange
}: {
  draft: IntelligenceComposerDraft;
  language: Language;
  onChange: (patch: Partial<IntelligenceComposerDraft>) => void;
}) {
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const showAddress = draft.serviceMode !== "onsite";
  const showServiceAreas = draft.serviceMode !== "store";

  return (
    <section
      className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel"
      data-testid="exchange-intelligence-composer-fields"
    >
      <div className="grid gap-4">
        <Field label={t("authoredLanguage")} required>
          <div className="flex min-h-12 items-center rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-black text-[color:var(--client-text)]">
            {localeLabels[draft.contentLocale]}
          </div>
        </Field>

        <Field label={t("postType")} required>
          <div className="flex min-h-12 items-center rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-black text-[color:var(--client-text)]">
            {t("intelligence")}
          </div>
        </Field>

        <Field label={t("title")} required>
          <input
            className={fieldClassName}
            maxLength={120}
            name="title"
            onChange={(event) => onChange({ title: event.target.value })}
            value={draft.title}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("serviceStartDate")} required>
            <input
              className={`${fieldClassName} min-w-0 px-3`}
              name="serviceStartDate"
              onChange={(event) => onChange({ serviceStartDate: event.target.value })}
              type="date"
              value={draft.serviceStartDate}
            />
          </Field>
          <Field label={t("serviceStartTime")} required>
            <input
              className={`${fieldClassName} min-w-0 px-3`}
              name="serviceStartTime"
              onChange={(event) => onChange({ serviceStartTime: event.target.value })}
              type="time"
              value={draft.serviceStartTime}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("serviceEndDate")} required>
            <input
              className={`${fieldClassName} min-w-0 px-3`}
              min={draft.serviceStartDate || undefined}
              name="serviceEndDate"
              onChange={(event) => onChange({ serviceEndDate: event.target.value })}
              type="date"
              value={draft.serviceEndDate}
            />
          </Field>
          <Field label={t("serviceEndTime")} required>
            <input
              className={`${fieldClassName} min-w-0 px-3`}
              name="serviceEndTime"
              onChange={(event) => onChange({ serviceEndTime: event.target.value })}
              type="time"
              value={draft.serviceEndTime}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("expiryDate")} required>
            <input
              className={`${fieldClassName} min-w-0 px-3`}
              min={draft.serviceEndDate || undefined}
              name="expiresDate"
              onChange={(event) => onChange({ expiresDate: event.target.value })}
              type="date"
              value={draft.expiresDate}
            />
          </Field>
          <Field label={t("expiryTime")} required>
            <input
              className={`${fieldClassName} min-w-0 px-3`}
              name="expiresTime"
              onChange={(event) => onChange({ expiresTime: event.target.value })}
              type="time"
              value={draft.expiresTime}
            />
          </Field>
        </div>

        <Field label={t("serviceMode")} required>
          <div
            aria-label={t("serviceMode")}
            className="grid grid-cols-3 gap-1 rounded-2xl bg-[color:var(--client-bg)] p-1"
            role="radiogroup"
          >
            {(["store", "onsite", "flexible"] as const).map((mode) => (
              <button
                aria-checked={draft.serviceMode === mode}
                className={draft.serviceMode === mode
                  ? "focus-ring min-h-11 rounded-xl bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] shadow-soft"
                  : "focus-ring min-h-11 rounded-xl text-sm font-bold text-[color:var(--client-muted)]"}
                key={mode}
                onClick={() => onChange({ serviceMode: mode })}
                role="radio"
                type="button"
              >
                {t(mode)}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("area")} required>
          <input
            className={fieldClassName}
            maxLength={120}
            name="areaLabel"
            onChange={(event) => onChange({ areaLabel: event.target.value })}
            value={draft.areaLabel}
          />
        </Field>

        {showAddress ? (
          <Field label={t("publicAddress")}>
            <input
              className={fieldClassName}
              maxLength={255}
              name="addressLabel"
              onChange={(event) => onChange({ addressLabel: event.target.value })}
              value={draft.addressLabel}
            />
          </Field>
        ) : null}

        {showServiceAreas ? (
          <Field label={t("serviceAreas")} required>
            <input
              className={fieldClassName}
              name="serviceAreas"
              onChange={(event) => onChange({ serviceAreas: event.target.value })}
              value={draft.serviceAreas}
            />
          </Field>
        ) : (
          <input name="serviceAreas" readOnly type="hidden" value={draft.serviceAreas} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("originalPrice")}>
            <input
              className={`${fieldClassName} min-w-0`}
              min="0"
              name="originalPriceJpy"
              onChange={(event) => onChange({ originalPriceJpy: event.target.value })}
              step="1"
              type="number"
              value={draft.originalPriceJpy}
            />
          </Field>
          <Field label={t("campaignPrice")} required>
            <input
              className={`${fieldClassName} min-w-0`}
              min="0"
              name="campaignPriceJpy"
              onChange={(event) => onChange({ campaignPriceJpy: event.target.value })}
              step="1"
              type="number"
              value={draft.campaignPriceJpy}
            />
          </Field>
        </div>

        <Field label={t("detail")} required>
          <textarea
            className={`${fieldClassName} min-h-40 resize-none py-3 leading-7`}
            maxLength={10000}
            name="detail"
            onChange={(event) => onChange({ detail: event.target.value })}
            value={draft.detail}
          />
        </Field>
      </div>
    </section>
  );
}
