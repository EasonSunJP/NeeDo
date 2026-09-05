import { NavLink } from "react-router-dom";
import { useRealtimeUnreadCounts } from "../../features/realtime/useRealtimeUnreadCounts";
import { NotificationBadge } from "./NotificationBadge";

export function OfficialNoticeBell({ to }: { to: string }) {
  const { notifications } = useRealtimeUnreadCounts();

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
      {notifications > 0 ? (
        <NotificationBadge
          className="absolute right-1.5 top-1.5"
          count={notifications}
          size="sm"
        />
      ) : null}
    </NavLink>
  );
}
