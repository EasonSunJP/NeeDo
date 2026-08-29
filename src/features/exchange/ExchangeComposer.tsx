import { useState, type FormEvent } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { publishExchangePost } from "./api";
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

function toIso(value: FormDataEntryValue | null) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function readRequired(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

function readMoney(form: FormData, key: string) {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function buildPublishInput(form: FormData, type: ExchangePostType): PublishExchangePostInput | string {
  const title = readRequired(form, "title");
  const detail = readRequired(form, "detail");
  const areaLabel = readRequired(form, "areaLabel");
  const contentLocale = readRequired(form, "contentLocale") as ExchangeContentLocale | null;
  const serviceStartAt = toIso(form.get("serviceStartAt"));
  const serviceEndAt = toIso(form.get("serviceEndAt"));
  const expiresAt = toIso(form.get("expiresAt"));

  if (!title || !detail || !areaLabel || !contentLocale || !serviceStartAt || !serviceEndAt || !expiresAt) {
    return "required";
  }

  if (!(serviceStartAt < serviceEndAt && serviceEndAt <= expiresAt)) {
    return "invalidWindow";
  }

  const common = { title, detail, areaLabel, contentLocale, serviceStartAt, serviceEndAt, expiresAt };
  if (type === "demand") {
    const budgetMinJpy = readMoney(form, "budgetMinJpy");
    const budgetMaxJpy = readMoney(form, "budgetMaxJpy");
    if (budgetMinJpy === null || budgetMaxJpy === null) return "required";
    if (budgetMinJpy > budgetMaxJpy) return "invalidBudget";
    return { type, ...common, budgetMinJpy, budgetMaxJpy };
  }

  const serviceAreas = String(form.get("serviceAreas") ?? "")
    .split(/[,，、]/u)
    .map((area) => area.trim())
    .filter(Boolean);
  const serviceMode = String(form.get("serviceMode") ?? "") as "store" | "onsite" | "flexible";
  const campaignPriceJpy = readMoney(form, "campaignPriceJpy");
  const originalPriceRaw = String(form.get("originalPriceJpy") ?? "").trim();
  const originalPriceJpy = originalPriceRaw ? readMoney(form, "originalPriceJpy") : null;
  if (!serviceAreas.length || !serviceMode || campaignPriceJpy === null) return "required";
  if (originalPriceRaw && originalPriceJpy === null) return "required";
  if (originalPriceJpy !== null && campaignPriceJpy > originalPriceJpy) return "invalidPrice";
  return {
    type,
    ...common,
    serviceMode,
    addressLabel: readRequired(form, "addressLabel"),
    serviceAreas: Array.from(new Set(serviceAreas)),
    originalPriceJpy,
    campaignPriceJpy
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-black text-[color:var(--client-muted)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

const fieldClassName = "min-h-12 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-semibold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)] focus:ring-2 focus:ring-[color:var(--client-primary-soft)]";

export function ExchangeComposer({
  context,
  onPublished
}: {
  context: MessageCenterContext;
  onPublished: (post: ExchangePost) => void;
}) {
  const { language } = useI18n();
  const type = getExchangeComposerMode(context);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<"required" | "invalidWindow" | "invalidBudget" | "invalidPrice" | "publishFailed" | null>(null);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const input = buildPublishInput(new FormData(event.currentTarget), type);
    if (typeof input === "string") {
      setErrorKey(input as typeof errorKey);
      return;
    }

    setErrorKey(null);
    setPending(true);
    try {
      const post = await publishExchangePost(input, globalThis.crypto.randomUUID());
      onPublished(post);
      setOpen(false);
    } catch {
      setErrorKey("publishFailed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-lg transition active:scale-[0.98]"
        data-action="open-composer"
        onClick={() => { setErrorKey(null); setOpen(true); }}
        type="button"
      >
        {t(type === "demand" ? "publishDemand" : "publishIntelligence")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="presentation">
          <section
            aria-label={t(type === "demand" ? "publishDemand" : "publishIntelligence")}
            aria-modal="true"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-5 shadow-2xl sm:max-w-xl sm:rounded-[30px] sm:p-7"
            data-page-drag-ignore="true"
            role="dialog"
          >
            <header className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--client-primary)]">NeeDo Exchange</p>
                <h2 className="mt-1 text-xl font-black text-[color:var(--client-text)]">{t(type === "demand" ? "publishDemand" : "publishIntelligence")}</h2>
              </div>
              <button className="min-h-11 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-black text-[color:var(--client-text)]" disabled={pending} onClick={() => setOpen(false)} type="button">{t("close")}</button>
            </header>

            <form className="grid gap-4" noValidate onSubmit={submit}>
              <Field label={t("authoredLanguage")}>
                <select className={fieldClassName} defaultValue={contentLocaleForLanguage(language)} name="contentLocale">
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="ja">日本語</option>
                  <option value="en">English</option>
                  <option value="ko">한국어</option>
                </select>
              </Field>
              <Field label={t("title")}><input className={fieldClassName} maxLength={120} name="title" /></Field>
              <Field label={t("detail")}><textarea className={`${fieldClassName} min-h-28 py-3`} maxLength={10000} name="detail" /></Field>
              <Field label={t("area")}><input className={fieldClassName} maxLength={120} name="areaLabel" /></Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("serviceStart")}><input className={fieldClassName} name="serviceStartAt" type="datetime-local" /></Field>
                <Field label={t("serviceEnd")}><input className={fieldClassName} name="serviceEndAt" type="datetime-local" /></Field>
                <Field label={t("expiry")}><input className={fieldClassName} name="expiresAt" type="datetime-local" /></Field>
              </div>

              {type === "demand" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("minBudget")}><input className={fieldClassName} min="0" name="budgetMinJpy" step="1" type="number" /></Field>
                  <Field label={t("maxBudget")}><input className={fieldClassName} min="0" name="budgetMaxJpy" step="1" type="number" /></Field>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("serviceMode")}>
                      <select className={fieldClassName} defaultValue="store" name="serviceMode">
                        <option value="store">{t("store")}</option>
                        <option value="onsite">{t("onsite")}</option>
                        <option value="flexible">{t("flexible")}</option>
                      </select>
                    </Field>
                    <Field label={t("publicAddress")}><input className={fieldClassName} maxLength={255} name="addressLabel" /></Field>
                  </div>
                  <Field label={t("serviceAreas")}><input className={fieldClassName} name="serviceAreas" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("originalPrice")}><input className={fieldClassName} min="0" name="originalPriceJpy" step="1" type="number" /></Field>
                    <Field label={t("campaignPrice")}><input className={fieldClassName} min="0" name="campaignPriceJpy" step="1" type="number" /></Field>
                  </div>
                </>
              )}

              {errorKey ? <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">{t(errorKey)}</p> : null}
              <button className="min-h-12 rounded-2xl bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-50" data-action="submit-composer" disabled={pending} type="submit">
                {t(pending ? "publishing" : "submitPublish")}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
