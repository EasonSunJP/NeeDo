import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppIcon, AppTopBar, PageScaffold } from "../../components/client-ui/AppScaffold";
import { ContactEventTimeline, type ContactEventTimelineEntry } from "../../components/mobile/ContactEventTimeline";
import { OFFICIAL_NOTICE_CHANGED_EVENT, officialNoticesApi, type OfficialNoticeLocale, type RecipientOfficialNotice } from "../../api/officialNotices";
import { subscribeRealtimeEvents } from "../../features/realtime/api";
import { useI18n } from "../../i18n/I18nProvider";
import { registerTranslationEntries, translateText } from "../../i18n/translations";

registerTranslationEntries({
  "通知中心": { "zh-Hant": "通知中心", ja: "通知センター", en: "Notifications", ko: "알림 센터" },
  "暂无通知": { "zh-Hant": "暫無通知", ja: "通知はありません", en: "No notifications", ko: "알림이 없습니다" },
  "新": { "zh-Hant": "新", ja: "新着", en: "New", ko: "새 알림" },
  "已读": { "zh-Hant": "已讀", ja: "既読", en: "Read", ko: "읽음" },
  "读取通知失败，请稍后重试": { "zh-Hant": "讀取通知失敗，請稍後重試", ja: "通知を読み込めませんでした。後でもう一度お試しください", en: "Could not load notifications. Please try again later", ko: "알림을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요" },
  "上一页": { "zh-Hant": "上一頁", ja: "前へ", en: "Previous", ko: "이전" },
  "下一页": { "zh-Hant": "下一頁", ja: "次へ", en: "Next", ko: "다음" }
});

const pageSize = 30;

export function ClientNotificationsPage() {
  const { language } = useI18n();
  const location = useLocation();
  const home = location.pathname.startsWith("/merchant/") ? "/merchant"
    : location.pathname.startsWith("/technician/") ? "/technician" : "/";
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RecipientOfficialNotice[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const t = (value: string) => translateText(value, language);
  const locale: OfficialNoticeLocale = language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language;

  const refresh = useCallback(async () => {
    try {
      const result = await officialNoticesApi.listInbox({ locale, unreadOnly: false, page, pageSize });
      setItems(result.list);
      setTotal(result.total);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [locale, page]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => subscribeRealtimeEvents({
    onEvent: (event) => {
      if (event.type === "notification.created" && typeof event.payload === "object" && event.payload !== null && "kind" in event.payload && event.payload.kind === "official_notice") {
        void refresh();
      }
    }
  }), [refresh]);
  useEffect(() => {
    window.addEventListener(OFFICIAL_NOTICE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(OFFICIAL_NOTICE_CHANGED_EVENT, refresh);
  }, [refresh]);

  const markRead = async (item: RecipientOfficialNotice) => {
    if (item.readAt) return;
    try {
      const updated = await officialNoticesApi.markRead(item.publicId);
      setItems((current) => current.map((candidate) => candidate.publicId === item.publicId ? { ...candidate, readAt: updated.readAt } : candidate));
      window.dispatchEvent(new Event(OFFICIAL_NOTICE_CHANGED_EVENT));
    } catch {
      setError(true);
    }
  };
  const timelineEvents: ContactEventTimelineEntry[] = items.map((item) => ({
    id: item.publicId,
    atLabel: <time dateTime={item.sentAt} data-no-i18n>
      <span className="block">{new Date(item.sentAt).toLocaleDateString(language, { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
      <span className="block">{new Date(item.sentAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}</span>
    </time>,
    preserveAtLabel: true,
    actorName: <span data-no-i18n>{item.title}</span>,
    actorRole: t(item.readAt ? "已读" : "新"),
    title: item.title,
    message: <span data-no-i18n>{item.summary}</span>,
    icon: <AppIcon className="h-4 w-4 text-[color:var(--client-primary)]" name="broadcast" />,
    tone: item.readAt ? "neutral" : "green",
    actions: item.readAt ? undefined : <button className="focus-ring rounded-full border border-[color:var(--client-primary)] px-3 py-1.5 text-xs font-black text-[color:var(--client-primary)]" onClick={() => { void markRead(item); }} type="button">{t("标记已读")}</button>
  }));

  return (
    <PageScaffold contentClassName="space-y-4 pb-28">
      <AppTopBar closeTo={home} title={t("通知中心")} />
      {error ? <p className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 text-sm text-[color:var(--client-text)]" role="alert">{t("读取通知失败，请稍后重试")}</p> : null}
      {loading ? <p className="py-8 text-center text-sm text-[color:var(--client-muted)]">{t("正在加载…")}</p> : null}
      {!loading && items.length === 0 ? <p className="py-8 text-center text-sm text-[color:var(--client-muted)]">{t("暂无通知")}</p> : null}
      {timelineEvents.length > 0 ? <ContactEventTimeline events={timelineEvents} layout="compact-three-column" showCommentComposer={false} /> : null}
      {total > pageSize ? (
        <div className="flex justify-between gap-3 text-sm font-semibold">
          <button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">{t("上一页")}</button>
          <button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 disabled:opacity-40" disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)} type="button">{t("下一页")}</button>
        </div>
      ) : null}
    </PageScaffold>
  );
}
