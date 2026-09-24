import type { ReactNode } from "react";
import type { Language } from "../../i18n/translations";
import { InfoTooltipTrigger } from "../../components/ui/TitleWithInfo";
import { ShopTaxonomyRegistrationField } from "../shop-taxonomy/ShopTaxonomyRegistrationField";
import { exchangeText } from "./i18n";
import type { RequestComposerDraft } from "./exchange-composer-model";
import type { ExchangeRequestPublicationContext } from "./types";

const fieldClassName = "focus-ring min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-semibold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:var(--client-primary-soft)]";
const halfHourOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`);

function HalfHourSelect({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label} required>
      <select className={`${fieldClassName} min-w-0 px-3`} name={name} onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">—</option>
        {halfHourOptions.map((time) => <option key={time} value={time}>{time}</option>)}
      </select>
    </Field>
  );
}

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
  options: Array<{ label: string; value: TValue; info?: string; infoLabel?: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <Field label={label} required>
      <div aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl bg-[color:var(--client-bg)] p-1" role="radiogroup">
        {options.map((option) => (
          <div className="relative min-w-0" key={option.value}>
            <button
              aria-checked={value === option.value}
              className={`${value === option.value
                ? "bg-[color:var(--client-surface)] font-black text-[color:var(--client-text)] shadow-soft"
                : "font-bold text-[color:var(--client-muted)]"} focus-ring min-h-11 w-full rounded-xl text-sm ${option.info ? "pr-9" : ""}`}
              onClick={() => onChange(option.value)}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
            {option.info ? <InfoTooltipTrigger className="absolute right-1 top-1/2 -translate-y-1/2" content={option.info} label={option.infoLabel} /> : null}
          </div>
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

export function RequestComposerFields({
  context,
  draft,
  language,
  onChange,
  onKeywordLabelsChange
}: {
  context: ExchangeRequestPublicationContext;
  draft: RequestComposerDraft;
  language: Language;
  onChange: (patch: Partial<RequestComposerDraft>) => void;
  onKeywordLabelsChange?: (labels: string[]) => void;
}) {
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  return (
    <section
      className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel"
      data-testid="exchange-request-composer-fields"
    >
      <div className="grid gap-4">
        <Field label={t("postType")} required>
          <div className="flex min-h-12 items-center rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-black text-[color:var(--client-text)]">
            {t("demand")}
          </div>
        </Field>

        <ShopTaxonomyRegistrationField
          categoryLimit={1}
          description={t("requestTagsInfo")}
          keywordLimit={10}
          language={language}
          onKeywordLabelsChange={onKeywordLabelsChange}
          onChange={(value) => onChange({
            categoryId: value.serviceCategoryIds[0] ?? null,
            businessKeywordIds: value.businessKeywordIds
          })}
          value={{
            serviceCategoryIds: draft.categoryId ? [draft.categoryId] : [],
            businessKeywordIds: draft.businessKeywordIds
          }}
        />

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
          <Field label={t("requestServiceStartDate")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} name="serviceStartDate" onChange={(event) => onChange({ serviceStartDate: event.target.value })} type="date" value={draft.serviceStartDate} />
          </Field>
          <HalfHourSelect label={t("requestServiceStartTime")} name="serviceStartTime" onChange={(serviceStartTime) => onChange({ serviceStartTime })} value={draft.serviceStartTime} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("requestServiceEndDate")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} min={draft.serviceStartDate || undefined} name="serviceEndDate" onChange={(event) => onChange({ serviceEndDate: event.target.value })} type="date" value={draft.serviceEndDate} />
          </Field>
          <HalfHourSelect label={t("requestServiceEndTime")} name="serviceEndTime" onChange={(serviceEndTime) => onChange({ serviceEndTime })} value={draft.serviceEndTime} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("applicationDeadlineDate")} required>
            <input className={`${fieldClassName} min-w-0 px-3`} max={draft.serviceStartDate || undefined} name="expiresDate" onChange={(event) => onChange({ expiresDate: event.target.value })} type="date" value={draft.expiresDate} />
          </Field>
          <HalfHourSelect label={t("applicationDeadlineTime")} name="expiresTime" onChange={(expiresTime) => onChange({ expiresTime })} value={draft.expiresTime} />
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
            { label: t("quickMatch"), value: "quick", info: t("quickMatchInfo"), infoLabel: t("quickMatchInfoLabel") },
            { label: t("selectiveMatch"), value: "selective", info: t("selectiveMatchInfo"), infoLabel: t("selectiveMatchInfoLabel") }
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
          <input className={fieldClassName} maxLength={255} name="addressLine1" onChange={(event) => onChange({ addressLine1: event.target.value })} placeholder={t("addressLine1Example")} value={draft.addressLine1} />
        </Field>
        <p className="text-xs font-semibold text-[color:var(--client-muted)]">{t("addressLine1PublicNotice")}</p>

        <Field label={t("addressLine2")}>
          <input
            className={fieldClassName}
            maxLength={255}
            name="addressLine2"
            onChange={(event) => onChange({
              addressLine2: event.target.value,
              addressLine2Public: false
            })}
            placeholder={t("addressLine2Example")}
            value={draft.addressLine2}
          />
        </Field>

        <Field label={t("addressLine3")}>
          <input
            className={fieldClassName}
            maxLength={255}
            name="addressLine3"
            onChange={(event) => onChange({
              addressLine3: event.target.value,
              addressLine3Public: false
            })}
            value={draft.addressLine3}
          />
        </Field>

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
