import type { ReactNode } from "react";
import type { Language } from "../../i18n/translations";
import { exchangeText } from "./i18n";
import type { RequestComposerDraft } from "./exchange-composer-model";
import type { ExchangeRequestPublicationContext } from "./types";

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

function SegmentedChoice<TValue extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ label: string; value: TValue }>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <Field label={label} required>
      <div aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl bg-[color:var(--client-bg)] p-1" role="radiogroup">
        {options.map((option) => (
          <button
            aria-checked={value === option.value}
            className={value === option.value
              ? "focus-ring min-h-11 rounded-xl bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] shadow-soft"
              : "focus-ring min-h-11 rounded-xl text-sm font-bold text-[color:var(--client-muted)]"}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

function VisibilitySwitch({
  checked,
  disabled = false,
  label,
  name,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-xs font-black ${disabled ? "opacity-50" : ""}`}>
      <span className="text-[color:var(--client-muted)]">{label}</span>
      <input
        checked={checked}
        className="focus-ring h-5 w-5 accent-[color:var(--client-primary)]"
        disabled={disabled}
        name={name}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

const localeLabels: Record<RequestComposerDraft["contentLocale"], string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  en: "English",
  ko: "한국어"
};

export function RequestComposerFields({
  context,
  draft,
  language,
  onChange
}: {
  context: ExchangeRequestPublicationContext;
  draft: RequestComposerDraft;
  language: Language;
  onChange: (patch: Partial<RequestComposerDraft>) => void;
}) {
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const optionalLine2Present = draft.addressLine2.trim().length > 0;
  const optionalLine3Present = draft.addressLine3.trim().length > 0;

  return (
    <section
      className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel"
      data-testid="exchange-request-composer-fields"
    >
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

        <SegmentedChoice
          label={t("serviceMode")}
          onChange={(serviceMode) => onChange({ serviceMode })}
          options={[
            { label: t("store"), value: "store" },
            { label: t("home"), value: "home" }
          ]}
          value={draft.serviceMode}
        />

        <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-primary-soft)] px-4 py-3">
          <p className="text-xs font-black text-[color:var(--client-text)]">
            {t("requestProviderLimit")}: {context.maxTargetProviderCount}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]">
            {context.capacitySource === "shop_merchant"
              ? t("shopMerchantCapacity")
              : `${t("membershipCapacity")} · ${context.membershipLevel ?? "—"}`}
          </p>
        </div>

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

        <Field label={t("targetProviderCount")} required>
          <input
            className={fieldClassName}
            max={context.maxTargetProviderCount}
            min="1"
            name="targetProviderCount"
            onChange={(event) => onChange({ targetProviderCount: event.target.value })}
            step="1"
            type="number"
            value={draft.targetProviderCount}
          />
        </Field>

        <SegmentedChoice
          label={t("matchMode")}
          onChange={(matchMode) => onChange({ matchMode })}
          options={[
            { label: t("quickMatch"), value: "quick" },
            { label: t("selectiveMatch"), value: "selective" }
          ]}
          value={draft.matchMode}
        />

        <SegmentedChoice
          label={t("budgetMode")}
          onChange={(budgetMode) => onChange({ budgetMode })}
          options={[
            { label: t("totalBudget"), value: "total" },
            { label: t("perProviderBudget"), value: "per_provider" }
          ]}
          value={draft.budgetMode}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("minBudgetOptional")}>
            <input className={`${fieldClassName} min-w-0`} min="0" name="budgetMinJpy" onChange={(event) => onChange({ budgetMinJpy: event.target.value })} step="1" type="number" value={draft.budgetMinJpy} />
          </Field>
          <Field label={t("maxBudgetRequired")} required>
            <input className={`${fieldClassName} min-w-0`} min="0" name="budgetMaxJpy" onChange={(event) => onChange({ budgetMaxJpy: event.target.value })} step="1" type="number" value={draft.budgetMaxJpy} />
          </Field>
        </div>

        <Field label={t("addressLine1")} required>
          <input className={fieldClassName} maxLength={255} name="addressLine1" onChange={(event) => onChange({ addressLine1: event.target.value })} value={draft.addressLine1} />
        </Field>

        <Field label={t("addressLine2")}>
          <input
            className={fieldClassName}
            maxLength={255}
            name="addressLine2"
            onChange={(event) => onChange({
              addressLine2: event.target.value,
              ...(!event.target.value.trim() ? { addressLine2Public: false } : {})
            })}
            value={draft.addressLine2}
          />
        </Field>
        <VisibilitySwitch
          checked={optionalLine2Present && draft.addressLine2Public}
          disabled={!optionalLine2Present}
          label={t("generallyVisible")}
          name="addressLine2Public"
          onChange={(addressLine2Public) => onChange({ addressLine2Public })}
        />

        <Field label={t("addressLine3")}>
          <input
            className={fieldClassName}
            maxLength={255}
            name="addressLine3"
            onChange={(event) => onChange({
              addressLine3: event.target.value,
              ...(!event.target.value.trim() ? { addressLine3Public: false } : {})
            })}
            value={draft.addressLine3}
          />
        </Field>
        <VisibilitySwitch
          checked={optionalLine3Present && draft.addressLine3Public}
          disabled={!optionalLine3Present}
          label={t("generallyVisible")}
          name="addressLine3Public"
          onChange={(addressLine3Public) => onChange({ addressLine3Public })}
        />

        <VisibilitySwitch
          checked={draft.publisherIdentityPublic}
          label={t("publisherIdentityVisible")}
          name="publisherIdentityPublic"
          onChange={(publisherIdentityPublic) => onChange({ publisherIdentityPublic })}
        />
        <p className="-mt-2 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]">{t("matchedParticipantsSeeAll")}</p>

        <Field label={t("detail")} required>
          <textarea className={`${fieldClassName} min-h-40 resize-none py-3 leading-7`} maxLength={10000} name="detail" onChange={(event) => onChange({ detail: event.target.value })} value={draft.detail} />
        </Field>
      </div>
    </section>
  );
}
