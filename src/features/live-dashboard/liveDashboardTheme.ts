import {
  defaultDayAdminTheme,
  defaultNightAdminTheme,
  detectSystemAdminTheme,
  normalizeAdminTheme,
  platformAdminThemeOptions
} from "../../theme/AdminTheme";

const themeStorageKey = "needo.admin.theme";
const themeModeStorageKey = "needo.admin.theme.mode";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getInitialLiveDashboardTheme(): string {
  const theme = readStorage(themeModeStorageKey) === "manual"
    ? normalizeAdminTheme(readStorage(themeStorageKey), defaultDayAdminTheme, platformAdminThemeOptions, defaultNightAdminTheme)
    : detectSystemAdminTheme(defaultDayAdminTheme, defaultNightAdminTheme, platformAdminThemeOptions);
  return `admin-theme-${theme}`;
}
