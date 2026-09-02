import { useEffect, useState } from "react";
import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { getScheduleOrderDetailRoute } from "../../lib/scheduleDetailTarget";
import { getExchangeMatching } from "./api";
import { exchangeText, type ExchangeTextKey } from "./i18n";
import type { ExchangeMatching } from "./types";

function localeForLanguage(language: Language) {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  if (language === "ja") return "ja-JP";
  if (language === "ko") return "ko-KR";
  return "en-US";
}

function formatWindow(startsAt: string, endsAt: string, language: Language) {
  const locale = localeForLanguage(language);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(start);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time.format(start)}–${time.format(end)}`;
}

export function ExchangeMatchedBookingCard({
  context,
  language,
  postId
}: {
  context: MessageCenterContext;
  language: Language;
  postId: string;
}) {
  const t = (key: ExchangeTextKey) => exchangeText(key, language);
  const [matching, setMatching] = useState<ExchangeMatching | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void getExchangeMatching(postId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setMatching(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId, reloadVersion]);

  const participant = matching?.participants[0] ?? null;

  return (
    <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel" data-testid="exchange-matched-booking-card">
      <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("bookingProviderSelected")}</h2>
      {loading ? <p className="mt-4 text-sm font-bold text-[color:var(--client-muted)]" role="status">{t("matchingLoading")}</p> : null}
      {error ? (
        <div className="mt-4">
          <p className="text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("bookingLoadFailed")}</p>
          <button className="focus-ring mt-3 min-h-11 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-black text-[color:var(--client-text)]" onClick={() => setReloadVersion((value) => value + 1)} type="button">{t("bookingRetry")}</button>
        </div>
      ) : null}
      {!loading && !error && participant ? (
        <div className="mt-4 min-w-0 rounded-[22px] bg-[color:var(--client-bg-soft)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-black text-[color:var(--client-text)]">{participant.service.name}</p>
              <p className="mt-1 truncate text-xs font-bold text-[color:var(--client-text)]">{participant.provider.displayName}</p>
              <p className="mt-1 truncate font-mono text-[10px] font-black text-[color:var(--client-primary)]">{participant.provider.publicId}</p>
            </div>
            <strong className="shrink-0 text-lg font-black text-[color:var(--client-primary)]">¥{participant.quoteAmountJpy.toLocaleString("ja-JP")}</strong>
          </div>
          <p className="mt-3 text-xs font-bold text-[color:var(--client-muted)]">{formatWindow(participant.estimatedStartsAt, participant.estimatedEndsAt, language)}</p>
          {participant.booking ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--client-line)] pt-3">
              <p className="min-w-0 text-xs font-black text-[color:var(--client-text)]">{t("bookingOrderNumber")} · {participant.booking.orderNo}</p>
              <a aria-label={t("bookingViewOrder")} className="focus-ring inline-flex min-h-10 items-center rounded-full bg-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary-contrast)]" href={getScheduleOrderDetailRoute(String(participant.booking.orderId), context)}>{t("bookingViewOrder")}</a>
            </div>
          ) : <p className="mt-4 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-3 text-xs font-black text-[color:var(--client-muted)]">{t("bookingAwaitingOwner")}</p>}
        </div>
      ) : null}
    </section>
  );
}
