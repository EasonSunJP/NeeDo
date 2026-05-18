import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { CpsSidebar, getInitialCpsSidebarCollapsed, writeCpsSidebarCollapsed } from "../cps/sidebar/CpsSidebar";
import { cn } from "../../lib/utils";
import { defaultDayAdminTheme, defaultNightAdminTheme, detectSystemAdminTheme, normalizeAdminTheme, sharedAdminThemeOptions, type AdminTheme } from "../../theme/AdminTheme";
import { AdminThemeMenu } from "../admin/AdminThemeMenu";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { NotificationBadge } from "../ui/NotificationBadge";

const themeStorageKey = "needo.afirieito-admin.theme";
const themePreferenceModeStorageKey = "needo.afirieito-admin.theme.mode";
const inheritedThemeSources = [
  { themeStorageKey: "needo.cps-admin.theme", themePreferenceModeStorageKey: "needo.cps-admin.theme.mode" },
  { themeStorageKey: "needo.admin.theme", themePreferenceModeStorageKey: "needo.admin.theme.mode" },
  { themeStorageKey: "needo.merchant-admin.theme", themePreferenceModeStorageKey: "needo.merchant-admin.theme.mode" }
];
const mirroredAdminThemeTargets = [
  { themeStorageKey: "needo.cps-admin.theme", themePreferenceModeStorageKey: "needo.cps-admin.theme.mode" },
  { themeStorageKey: "needo.admin.theme", themePreferenceModeStorageKey: "needo.admin.theme.mode" },
  { themeStorageKey: "needo.merchant-admin.theme", themePreferenceModeStorageKey: "needo.merchant-admin.theme.mode" }
];

type AdminThemePreferenceMode = "auto" | "manual";

type AdminThemeState = {
  theme: AdminTheme;
  preferenceMode: AdminThemePreferenceMode;
};

function normalizeThemePreferenceMode(mode: string | null | undefined): AdminThemePreferenceMode {
  return mode === "manual" ? "manual" : "auto";
}

function getStoredManualTheme(
  source: {
    themeStorageKey: string;
    themePreferenceModeStorageKey: string;
  }
) {
  const preferenceMode = normalizeThemePreferenceMode(window.localStorage.getItem(source.themePreferenceModeStorageKey));
  const stored = window.localStorage.getItem(source.themeStorageKey);

  if (preferenceMode !== "manual" || !stored) {
    return null;
  }

  return normalizeAdminTheme(stored, defaultDayAdminTheme, sharedAdminThemeOptions, defaultNightAdminTheme);
}

function getInitialThemeState(): AdminThemeState {
  if (typeof window === "undefined") {
    return {
      theme: "pink-purple-black",
      preferenceMode: "auto"
    };
  }

  const preferenceMode = normalizeThemePreferenceMode(window.localStorage.getItem(themePreferenceModeStorageKey));
  const stored = window.localStorage.getItem(themeStorageKey);

  if (preferenceMode === "manual") {
    return {
      theme: normalizeAdminTheme(stored, defaultDayAdminTheme, sharedAdminThemeOptions, defaultNightAdminTheme),
      preferenceMode
    };
  }

  for (const source of inheritedThemeSources) {
    const inheritedTheme = getStoredManualTheme(source);

    if (inheritedTheme) {
      return {
        theme: inheritedTheme,
        preferenceMode: "manual"
      };
    }
  }

  return {
    theme: detectSystemAdminTheme(defaultDayAdminTheme, defaultNightAdminTheme, sharedAdminThemeOptions),
    preferenceMode
  };
}

export function BusinessCpsAdminLayout({ children }: { children: ReactNode }) {
  const [{ theme, preferenceMode }, setThemeState] = useState<AdminThemeState>(getInitialThemeState);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialCpsSidebarCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const setTheme = (nextTheme: AdminTheme) => {
    setThemeState({
      theme: nextTheme,
      preferenceMode: "manual"
    });
  };

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, theme);
    window.localStorage.setItem(themePreferenceModeStorageKey, preferenceMode);

    if (preferenceMode === "manual") {
      for (const target of mirroredAdminThemeTargets) {
        window.localStorage.setItem(target.themeStorageKey, theme);
        window.localStorage.setItem(target.themePreferenceModeStorageKey, preferenceMode);
      }
    }
  }, [preferenceMode, theme]);

  useEffect(() => {
    writeCpsSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  return (
    <div
      className={cn(
        "admin-shell merchant-admin-shell cps-admin-shell min-h-screen bg-paper text-ink",
        `admin-theme-${theme}`,
        sidebarCollapsed && "is-sidebar-collapsed",
        mobileNavOpen && "is-mobile-nav-open"
      )}
    >
      <button aria-label="关闭 NDA管理后台导航" className="cps-admin-mobile-backdrop" onClick={() => setMobileNavOpen(false)} type="button" />
      <CpsSidebar collapsed={mobileNavOpen ? false : sidebarCollapsed} onCloseMobile={() => setMobileNavOpen(false)} onCollapsedChange={setSidebarCollapsed} />

      <div className="cps-admin-body">
        <header className="admin-topbar cps-admin-topbar fixed top-0 z-[60] border-b border-line bg-white/90 backdrop-blur">
          <div className="w-full px-4 py-3 md:px-5 2xl:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
              <button className="cps-admin-mobile-menu-button" onClick={() => setMobileNavOpen(true)} type="button" aria-label="打开 NDA管理后台导航">
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.1" />
                </svg>
              </button>
              <div className="flex items-center gap-2 text-sm">
                <LanguageSwitcher className="shrink-0" iconOnly />
                <AdminThemeMenu onThemeChange={setTheme} options={sharedAdminThemeOptions} theme={theme} />
                <NavLink
                  aria-label="公告"
                  className="focus-ring relative grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink/70 transition hover:text-moss"
                  to="/NDA-admin/announcements"
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <path d="M12 4a6 6 0 0 0-6 6v2.5L4.7 15a1 1 0 0 0 .7 1.7H18.6a1 1 0 0 0 .7-1.7L18 12.5V10a6 6 0 0 0-6-6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
                    <path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                  </svg>
                  <NotificationBadge className="absolute right-1.5 top-1.5" count={12} size="sm" />
                </NavLink>
                <NavLink
                  aria-label="联系客服"
                  className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink/70 transition hover:text-moss"
                  to="/NDA-admin/support"
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <path d="M4 13.5a8 8 0 0 1 16 0v3a2 2 0 0 1-2 2h-1.2a1.8 1.8 0 0 1-1.8-1.8v-1.4a1.8 1.8 0 0 1 1.8-1.8H18v-.2a6 6 0 0 0-12 0v.2h1.2A1.8 1.8 0 0 1 9 15.3v1.4a1.8 1.8 0 0 1-1.8 1.8H6a2 2 0 0 1-2-2v-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
                    <path d="M12 18.5h2.5a2 2 0 0 0 2-2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                  </svg>
                </NavLink>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-main cps-admin-main w-full px-4 pb-6 pt-24 md:px-5 lg:pt-20 2xl:px-6">{children}</main>
      </div>
    </div>
  );
}
