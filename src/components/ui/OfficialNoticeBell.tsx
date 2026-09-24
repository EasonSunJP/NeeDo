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
import { NotificationBellGlyph } from "./NotificationBellGlyph";

export function useOfficialNoticeUnreadCount(enabled = true) {
  const { language } = useOptionalI18n();
  const { notifications: realtimeNotificationVersion } = useRealtimeUnreadCounts();
  const previousRealtimeNotificationVersion = useRef(realtimeNotificationVersion);
  const [unreadCount, setUnreadCount] = useState(0);
  const locale = useMemo<OfficialNoticeLocale>(
    () => language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language,
    [language]
  );
  const refresh = useCallback(async () => {
    if (!enabled) return;
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
  }, [enabled, locale]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (previousRealtimeNotificationVersion.current === realtimeNotificationVersion) return;
    previousRealtimeNotificationVersion.current = realtimeNotificationVersion;
    if (enabled) window.dispatchEvent(new Event(OFFICIAL_NOTICE_CHANGED_EVENT));
  }, [enabled, realtimeNotificationVersion]);
  useEffect(() => {
    const handleChange = () => { void refresh(); };
    window.addEventListener(OFFICIAL_NOTICE_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(OFFICIAL_NOTICE_CHANGED_EVENT, handleChange);
  }, [refresh]);

  return unreadCount;
}

export function OfficialNoticeBell({ to }: { to: string }) {
  const unreadCount = useOfficialNoticeUnreadCount();

  return (
    <NavLink
      aria-label="消息"
      className="focus-ring relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink/70 transition hover:text-moss"
      to={to}
    >
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <NotificationBellGlyph />
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
