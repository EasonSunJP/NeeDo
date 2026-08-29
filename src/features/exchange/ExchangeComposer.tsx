import { useState, type FormEvent } from "react";
import { FloatingActionButton } from "../../components/mobile/FloatingActionButton";
import { MobileBottomActionBar } from "../../components/mobile/MobileBottomActionBar";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
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

type DemandComposerDraft = {
  title: string;
  detail: string;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  budgetMinJpy: string;
  budgetMaxJpy: string;
};

const emptyDemandDraft: DemandComposerDraft = {
  title: "",
  detail: "",
  areaLabel: "",
  serviceStartAt: "",
  serviceEndAt: "",
  budgetMinJpy: "",
  budgetMaxJpy: ""
};

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 24 24">
      <path d="M12 16V7m0 0-3.5 3.5M12 7l3.5 3.5M5 16.5v1A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <rect height="14" rx="3" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
    </svg>
  );
}

function formatComposerMoney(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() ? `¥${parsed.toLocaleString("ja-JP")}` : "—";
}

function formatComposerDateTime(value: string, language: Language) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const locale = language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language === "ja" ? "ja-JP" : language === "ko" ? "ko-KR" : "en-US";
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [demandDraft, setDemandDraft] = useState<DemandComposerDraft>(emptyDemandDraft);
  const [errorKey, setErrorKey] = useState<"required" | "invalidWindow" | "invalidBudget" | "invalidPrice" | "publishFailed" | null>(null);
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const openComposer = () => {
    setErrorKey(null);
    setOpen(true);
  };

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
      if (type === "demand") setDemandDraft(emptyDemandDraft);
      setOpen(false);
    } catch {
      setErrorKey("publishFailed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {triggerVariant === "floating" ? (
        <FloatingActionButton
          ariaLabel={t(type === "demand" ? "publishDemand" : "publishIntelligence")}
          onClick={openComposer}
        >
          <svg aria-hidden="true" className="h-[42px] w-[42px] overflow-visible" fill="none" viewBox="0 0 32 32">
            <path d="M10 9.6h10.6a3.1 3.1 0 0 1 3.1 3.1v4.9a3.1 3.1 0 0 1-3.1 3.1h-5.7l-5.1 3.35a.7.7 0 0 1-1.09-.58v-2.9A3.1 3.1 0 0 1 6.9 17.6v-4.9A3.1 3.1 0 0 1 10 9.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.65" />
            <path d="m11.15 15.15 3.25 3.05L25.15 8.35" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.85" />
          </svg>
        </FloatingActionButton>
      ) : (
        <button
          className="min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-lg transition active:scale-[0.98]"
          data-action="open-composer"
          onClick={openComposer}
          type="button"
        >
          {t(type === "demand" ? "publishDemand" : "publishIntelligence")}
        </button>
      )}

      {open ? (
        type === "demand" ? (
          <MobileFullscreenPage innerClassName="client-glass-page-surface">
            <MobileFullscreenHeader
              className="needo-composer-glass-header"
              onClose={() => setOpen(false)}
              showSpacer={false}
              title={t("sendDemand")}
            />
            <form
              aria-label={t("sendDemand")}
              aria-modal="true"
              className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-[calc(env(safe-area-inset-top)+86px)]"
              data-testid="exchange-demand-composer-page"
              id="exchange-demand-composer-form"
              noValidate
              onSubmit={submit}
              role="dialog"
            >
              <input name="contentLocale" type="hidden" value={contentLocaleForLanguage(language)} />
              <input name="expiresAt" type="hidden" value={demandDraft.serviceEndAt} />

              <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
                <TitleWithInfo
                  as="h3"
                  info={t("demandComposerIntro")}
                  label={t("demandComposerIntroLabel")}
                  title={t("tellPlatform")}
                  titleClassName="text-xl font-black"
                  variant="client"
                />
              </section>

              <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
                <div className="grid gap-4">
                  <Field label={t("postType")}>
                    <div className="flex min-h-12 items-center rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-black text-[color:var(--client-text)]">{t("demand")}</div>
                  </Field>
                  <Field label={t("title")}>
                    <input className={fieldClassName} maxLength={120} name="title" onChange={(event) => setDemandDraft((current) => ({ ...current, title: event.target.value }))} value={demandDraft.title} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("serviceStart")}>
                      <input className={`${fieldClassName} min-w-0 px-3`} name="serviceStartAt" onChange={(event) => setDemandDraft((current) => ({ ...current, serviceStartAt: event.target.value }))} type="datetime-local" value={demandDraft.serviceStartAt} />
                    </Field>
                    <Field label={t("serviceEnd")}>
                      <input className={`${fieldClassName} min-w-0 px-3`} min={demandDraft.serviceStartAt || undefined} name="serviceEndAt" onChange={(event) => setDemandDraft((current) => ({ ...current, serviceEndAt: event.target.value }))} type="datetime-local" value={demandDraft.serviceEndAt} />
                    </Field>
                  </div>
                  <Field label={t("area")}>
                    <input className={fieldClassName} maxLength={120} name="areaLabel" onChange={(event) => setDemandDraft((current) => ({ ...current, areaLabel: event.target.value }))} value={demandDraft.areaLabel} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("minBudget")}>
                      <input className={`${fieldClassName} min-w-0`} min="0" name="budgetMinJpy" onChange={(event) => setDemandDraft((current) => ({ ...current, budgetMinJpy: event.target.value }))} step="1" type="number" value={demandDraft.budgetMinJpy} />
                    </Field>
                    <Field label={t("maxBudget")}>
                      <input className={`${fieldClassName} min-w-0`} min="0" name="budgetMaxJpy" onChange={(event) => setDemandDraft((current) => ({ ...current, budgetMaxJpy: event.target.value }))} step="1" type="number" value={demandDraft.budgetMaxJpy} />
                    </Field>
                  </div>
                  <Field label={t("detail")}>
                    <textarea className={`${fieldClassName} min-h-40 resize-none py-3 leading-7`} maxLength={10000} name="detail" onChange={(event) => setDemandDraft((current) => ({ ...current, detail: event.target.value }))} value={demandDraft.detail} />
                  </Field>
                </div>
              </section>

              <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
                <TitleWithInfo
                  as="h3"
                  info={t("referenceMediaDeferred")}
                  label={t("referenceMediaInfo")}
                  title={t("uploadReference")}
                  titleClassName="text-xl font-black"
                  variant="client"
                />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }, (_, index) => (
                    <button
                      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] text-[color:var(--client-muted)] disabled:cursor-not-allowed"
                      data-action="reference-upload-deferred"
                      disabled
                      key={index}
                      type="button"
                    >
                      <UploadIcon />
                      <span className="text-xs font-black">{t("upload")}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel" data-no-i18n="true">
                <h3 className="text-xl font-black text-[color:var(--client-text)]">{t("beforePublish")}</h3>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    [t("postType"), t("demand")],
                    [t("area"), demandDraft.areaLabel || "—"],
                    [t("time"), `${formatComposerDateTime(demandDraft.serviceStartAt, language)} ～ ${formatComposerDateTime(demandDraft.serviceEndAt, language)}`],
                    [t("budget"), `${formatComposerMoney(demandDraft.budgetMinJpy)} ～ ${formatComposerMoney(demandDraft.budgetMaxJpy)}`]
                  ].map(([label, value]) => (
                    <div className="rounded-xl bg-[color:var(--client-bg-soft)] p-3" key={label}>
                      <p className="text-[11px] font-bold text-[color:var(--client-muted)]">{label}</p>
                      <strong className="mt-1 block break-words text-sm leading-6 text-[color:var(--client-text)]">{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded-xl bg-[color:var(--client-bg-soft)] p-3">
                  <p className="text-[11px] font-bold text-[color:var(--client-muted)]">{t("remark")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[color:var(--client-text)]">{demandDraft.detail.trim() || "—"}</p>
                </div>
              </section>

              {errorKey ? <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">{t(errorKey)}</p> : null}
            </form>

            <MobileBottomActionBar contentClassName="flex justify-center">
              <button
                className="pointer-events-auto min-h-12 min-w-[240px] rounded-full bg-[color:var(--client-primary)] px-8 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-soft disabled:opacity-50"
                data-action="submit-composer"
                disabled={pending}
                form="exchange-demand-composer-form"
                type="submit"
              >
                {t(pending ? "publishing" : "sendToNeedo")}
              </button>
            </MobileBottomActionBar>
          </MobileFullscreenPage>
        ) : (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="presentation">
          <section
            aria-label={t("publishIntelligence")}
            aria-modal="true"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-5 shadow-2xl sm:max-w-xl sm:rounded-[30px] sm:p-7"
            data-page-drag-ignore="true"
            role="dialog"
          >
            <header className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--client-primary)]">NeeDo Exchange</p>
                <h2 className="mt-1 text-xl font-black text-[color:var(--client-text)]">{t("publishIntelligence")}</h2>
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

              {errorKey ? <p className="rounded-2xl bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]" role="alert">{t(errorKey)}</p> : null}
              <button className="min-h-12 rounded-2xl bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-50" data-action="submit-composer" disabled={pending} type="submit">
                {t(pending ? "publishing" : "submitPublish")}
              </button>
            </form>
          </section>
        </div>
        )
      ) : null}
    </>
  );
}
