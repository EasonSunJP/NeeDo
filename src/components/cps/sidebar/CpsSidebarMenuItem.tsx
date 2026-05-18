import { Link } from "react-router-dom";
import { cn } from "../../../lib/utils";
import type { CpsSidebarMenu } from "./cpsSidebarMenus";

function CpsSidebarIcon({ name }: { name: CpsSidebarMenu["icon"] }) {
  switch (name) {
    case "analytics":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M5 19V11M12 19V5M19 19v-9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          <path d="M4 19h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      );
    case "overview":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M4.5 5.5h6v5h-6v-5ZM13.5 5.5h6v8h-6v-8ZM4.5 13.5h6v5h-6v-5ZM13.5 16.5h6v2h-6v-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "link":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M9.8 14.2 14.2 9.8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          <path d="M10.8 7.2 12 6a4 4 0 0 1 5.7 5.7l-1.2 1.2M13.2 16.8 12 18a4 4 0 1 1-5.7-5.7l1.2-1.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        </svg>
      );
    case "grid":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M5 5h5.5v5.5H5V5ZM13.5 5H19v5.5h-5.5V5ZM5 13.5h5.5V19H5v-5.5ZM13.5 13.5H19V19h-5.5v-5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "wallet":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M4.5 8.5A2.5 2.5 0 0 1 7 6h10.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19H7a2.5 2.5 0 0 1-2.5-2.5v-8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M16 12h4v3h-4a1.5 1.5 0 0 1 0-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M7 6.2 15.6 4 17 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "user-plus":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.8 20c.6-3.8 2.8-6 6.2-6s5.6 2.2 6.2 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M18 7v6M15 10h6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M11.3 4h1.4l.7 2.1c.5.1 1 .3 1.5.6l2-.9 1 1-1 2c.3.5.5 1 .6 1.5l2.1.7v1.4l-2.1.7c-.1.5-.3 1-.6 1.5l1 2-1 1-2-.9c-.5.3-1 .5-1.5.6l-.7 2.1h-1.4l-.7-2.1c-.5-.1-1-.3-1.5-.6l-2 .9-1-1 1-2c-.3-.5-.5-1-.6-1.5l-2.1-.7V11l2.1-.7c.1-.5.3-1 .6-1.5l-1-2 1-1 2 .9c.5-.3 1-.5 1.5-.6L11.3 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case "book":
      return (
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H19M9 7h6M9 10h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
  }
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg aria-hidden="true" className={cn("cps-sidebar-chevron", expanded && "is-expanded")} fill="none" viewBox="0 0 24 24">
      <path d="m7 9 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  );
}

export function CpsSidebarMenuItem({
  active,
  collapsed,
  expanded,
  item,
  onLeafNavigate,
  onToggle
}: {
  active: boolean;
  collapsed: boolean;
  expanded: boolean;
  item: CpsSidebarMenu;
  onLeafNavigate: () => void;
  onToggle: () => void;
}) {
  const content = (
    <>
      <span className="cps-sidebar-icon" aria-hidden="true">
        <CpsSidebarIcon name={item.icon} />
      </span>
      <span className="cps-sidebar-label">{item.label}</span>
      {item.children?.length && !collapsed ? <ChevronIcon expanded={expanded} /> : null}
    </>
  );

  if (item.children?.length) {
    return (
      <button
        aria-expanded={expanded}
        className={cn("cps-sidebar-menu-item", active && "is-active", expanded && "is-expanded")}
        onClick={onToggle}
        title={collapsed ? item.label : undefined}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      className={cn("cps-sidebar-menu-item", active && "is-active")}
      onClick={onLeafNavigate}
      title={collapsed ? item.label : undefined}
      to={item.path ?? "/NDA-admin"}
    >
      {content}
    </Link>
  );
}
