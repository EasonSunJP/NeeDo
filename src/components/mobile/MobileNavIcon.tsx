import type { ReactNode } from "react";

function IconSvg({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1">
        {children}
      </g>
    </svg>
  );
}

export function MobileNavIcon({ name }: { name: string }) {
  switch (name) {
    case "home":
      return (
        <IconSvg>
          <path d="m3 11 9-7 9 7" />
          <path d="M5.5 10v10h13V10" />
          <path d="M9.5 20v-6h5v6" />
        </IconSvg>
      );
    case "categories":
      return (
        <IconSvg>
          <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />
        </IconSvg>
      );
    case "store":
      return (
        <IconSvg>
          <path d="M4 10h16" />
          <path d="m5 10 1-5h12l1 5" />
          <path d="M6 10v9h12v-9" />
          <path d="M9 19v-5h6v5" />
        </IconSvg>
      );
    case "orders":
      return (
        <IconSvg>
          <path d="M7 4h10l2 3v13H5V7l2-3Z" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </IconSvg>
      );
    case "booking":
      return (
        <IconSvg>
          <path d="M6 4v3M18 4v3M4.5 8h15" />
          <rect height="15" rx="3" width="15" x="4.5" y="5.5" />
          <path d="m8.5 14 2.2 2.2 4.8-5" />
        </IconSvg>
      );
    case "message":
      return (
        <IconSvg>
          <path d="M5 6.5h14v9.5H9l-4 3v-12.5Z" />
          <path d="M8.5 10h7M8.5 13h4" />
        </IconSvg>
      );
    case "moments":
      return (
        <IconSvg>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="8" r="3" />
          <circle cx="8" cy="16" r="3" />
          <circle cx="16" cy="16" r="3" />
          <path d="M11 8h2M11 16h2M8 11v2M16 11v2" />
        </IconSvg>
      );
    case "needo":
      return (
        <IconSvg>
          <path d="M6.5 17.5v-11l11 11v-11" />
          <path d="M8.5 19.5h7" />
          <path d="m17.5 4.5 1.2-2 1.2 2 2 .8-2 .8-1.2 2-1.2-2-2-.8 2-.8Z" />
        </IconSvg>
      );
    case "me":
      return (
        <IconSvg>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M4.5 20c1.4-4 4-6 7.5-6s6.1 2 7.5 6" />
        </IconSvg>
      );
    case "staff":
      return (
        <IconSvg>
          <path d="M8.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
          <path d="M3.5 19c.9-3.8 2.6-5.7 5-5.7s4.1 1.9 5 5.7" />
          <path d="M16.5 10.5a2.7 2.7 0 1 0 0-5.4" />
          <path d="M15.5 13.5c2.7.3 4.4 2.1 5 5.5" />
        </IconSvg>
      );
    case "customers":
      return (
        <IconSvg>
          <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M4.5 20c1.4-4.4 3.9-6.6 7.5-6.6s6.1 2.2 7.5 6.6" />
          <path d="M17.5 5.5h3M19 4v3" />
        </IconSvg>
      );
    case "contacts":
      return (
        <IconSvg>
          <path d="M6 5.5h11.5a2 2 0 0 1 2 2v11H7a2.5 2.5 0 0 1-2.5-2.5V7A1.5 1.5 0 0 1 6 5.5Z" />
          <path d="M7.5 5.5v13" />
          <path d="M11.2 11a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 0 0-4.2 0ZM10.3 16c.8-1.5 1.9-2.2 3-2.2s2.2.7 3 2.2" />
        </IconSvg>
      );
    case "schedule":
      return (
        <IconSvg>
          <path d="M6 4v3M18 4v3M4 8h16" />
          <rect height="16" rx="3" width="16" x="4" y="5" />
          <path d="M8 12h3M13 12h3M8 16h3" />
        </IconSvg>
      );
    case "marketing":
      return (
        <IconSvg>
          <path d="M5 9h14v10H5z" />
          <path d="M7 9c-1.2-1.6-.2-4 1.8-4 1.6 0 2.6 1.4 3.2 4 .6-2.6 1.6-4 3.2-4 2 0 3 2.4 1.8 4" />
          <path d="M12 9v10" />
        </IconSvg>
      );
    case "tasks":
      return (
        <IconSvg>
          <path d="M5 6h14M5 12h14M5 18h14" />
          <path d="m7 6 1 1 2-2M7 12l1 1 2-2M7 18l1 1 2-2" />
        </IconSvg>
      );
    case "jobs":
      return (
        <IconSvg>
          <path d="M8 7V5h8v2" />
          <rect height="13" rx="3" width="16" x="4" y="7" />
          <path d="M9 12h6M9 16h4" />
        </IconSvg>
      );
    case "income":
      return (
        <IconSvg>
          <path d="M12 4v16" />
          <path d="M16 7.5c-.8-1-2.1-1.5-4-1.5-2.2 0-4 1.1-4 3s1.7 2.6 4 3 4 1 4 3-1.8 3-4 3c-1.9 0-3.3-.5-4.3-1.6" />
        </IconSvg>
      );
    default:
      return (
        <IconSvg>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l3 2" />
        </IconSvg>
      );
  }
}
