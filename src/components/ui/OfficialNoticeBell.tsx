import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  OFFICIAL_NOTICE_CHANGED_EVENT,
  officialNoticesApi,
  type OfficialNoticeLocale
} from "../../api/officialNotices";
import { useRealtimeUnreadCounts } from "../../features/realtime/useRealtimeUnreadCounts";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { NotificationBadge } from "./NotificationBadge";

export function OfficialNoticeBell({ to }: { to: string }) {
  const { language } = useOptionalI18n();
  const { notifications: realtimeNotificationVersion } = useRealtimeUnreadCounts();
  const previousRealtimeNotificationVersion = useRef(realtimeNotificationVersion);
  const [unreadCount, setUnreadCount] = useState(0);
  const locale = useMemo<OfficialNoticeLocale>(
    () => language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language,
    [language]
  );
  const refresh = useCallback(async () => {
    try {
      const result = await officialNoticesApi.listInbox({
        locale,
        unreadOnly: true,
        page: 1,
        pageSize: 1
      });
      setUnreadCount(result.total);
    } catch {
      // Keep the last durable official-notice count while the recipient API reconnects.
    }
  }, [locale]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (previousRealtimeNotificationVersion.current === realtimeNotificationVersion) return;
    previousRealtimeNotificationVersion.current = realtimeNotificationVersion;
    window.dispatchEvent(new Event(OFFICIAL_NOTICE_CHANGED_EVENT));
  }, [realtimeNotificationVersion]);
  useEffect(() => {
    const handleChange = () => { void refresh(); };
    window.addEventListener(OFFICIAL_NOTICE_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(OFFICIAL_NOTICE_CHANGED_EVENT, handleChange);
  }, [refresh]);

  return (
    <NavLink
      aria-label="消息"
      className="focus-ring relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink/70 transition hover:text-moss"
      to={to}
    >
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 4a6 6 0 0 0-6 6v2.5L4.7 15a1 1 0 0 0 .7 1.7H18.6a1 1 0 0 0 .7-1.7L18 12.5V10a6 6 0 0 0-6-6Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M9.5 19a2.5 2.5 0 0 0 5 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      {unreadCount > 0 ? (
        <NotificationBadge
          className="pointer-events-none absolute -right-2 -top-2 z-10"
          count={unreadCount}
          size="sm"
        />
      ) : null}
    </NavLink>
  );
}
