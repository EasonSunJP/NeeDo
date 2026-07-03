import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

export type ClientTheme = "light-green" | "dark-green" | "black-gold" | "vital-mono" | "cool-black-gray" | "special-black" | "neon-pink";
export type LegacyClientTheme = "day" | "night";
export type ClientThemePreferenceMode = "auto" | "manual";

export type ClientThemeDefinition = {
  id: ClientTheme;
  legacyMode: LegacyClientTheme;
  label: string;
  shortLabel: string;
  description: string;
};

interface ClientThemeContextValue {
  theme: ClientTheme;
  themes: ClientThemeDefinition[];
  setTheme: (theme: ClientTheme | LegacyClientTheme) => void;
  toggleTheme: () => void;
  isNight: boolean;
}

type ClientThemeState = {
  theme: ClientTheme;
  preferenceMode: ClientThemePreferenceMode;
};

type ClientPwaThemeColors = {
  themeColor: string;
  statusBackground: string;
};

const ClientThemeContext = createContext<ClientThemeContextValue | null>(null);
const themeStorageKey = "needo.client.theme";
const themePreferenceModeStorageKey = "needo.client.theme.mode";
const systemDarkModeMediaQuery = "(prefers-color-scheme: dark)";
const defaultDayClientTheme: ClientTheme = "light-green";
const defaultNightClientTheme: ClientTheme = "dark-green";
const defaultClientTheme: ClientTheme = defaultDayClientTheme;
const clientPwaThemeColors: Record<ClientTheme, ClientPwaThemeColors> = {
  "light-green": {
    themeColor: "#f6fbf8",
    statusBackground: "#f6fbf8"
  },
  "dark-green": {
    themeColor: "#02070c",
    statusBackground: "#02070c"
  },
  "black-gold": {
    themeColor: "#000000",
    statusBackground: "#000000"
  },
  "vital-mono": {
    themeColor: "#f7f7f8",
    statusBackground: "#f7f7f8"
  },
  "cool-black-gray": {
    themeColor: "#0a0d10",
    statusBackground: "#0a0d10"
  },
  "special-black": {
    themeColor: "#030509",
    statusBackground: "#030509"
  },
  "neon-pink": {
    themeColor: "#080a1a",
    statusBackground: "#080a1a"
  }
};

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

export const clientThemes: ClientThemeDefinition[] = [
  {
    id: "special-black",
    legacyMode: "night",
    label: "特殊黑",
    shortLabel: "特殊黑",
    description: "蓝黑暗底配半透明石墨面板、蓝色发光主按钮和粉橙绿细状态光，不使用实时模糊或折射运算。"
  },
  {
    id: "vital-mono",
    legacyMode: "day",
    label: "活力黑白版",
    shortLabel: "黑白",
    description: "白色主界面配深黑模块、柔和灰卡和亮蓝点缀，按钮与导航更接近参考图的活力黑白设备 UI。"
  },
  {
    id: "cool-black-gray",
    legacyMode: "night",
    label: "冷酷黑灰版",
    shortLabel: "黑灰",
    description: "深石墨黑底配冷灰玻璃卡、青蓝电光和低饱和阴影，更贴近参考图的冷酷黑灰移动设备 UI。"
  },
  {
    id: "light-green",
    legacyMode: "day",
    label: "白绿版",
    shortLabel: "白绿",
    description: "白色主底配白到墨绿横向渐变，图标统一绿色，高亮文字收成更沉稳的墨绿色。"
  },
  {
    id: "dark-green",
    legacyMode: "night",
    label: "黑绿版",
    shortLabel: "黑绿",
    description: "冷黑青底配荧光青柠高光、石墨玻璃卡和轻量霓虹描边，弱化橄榄绿感。"
  },
  {
    id: "neon-pink",
    legacyMode: "night",
    label: "霓虹粉紫版",
    shortLabel: "粉紫",
    description: "深蓝黑底配粉紫霓虹、柔和玻璃卡和轻微蓝紫光感，适合更强视觉记忆的夜间浏览。"
  },
  {
    id: "black-gold",
    legacyMode: "night",
    label: "黑金版",
    shortLabel: "黑金",
    description: "炭黑与石墨灰渐变为主，香槟金只用于高光、按钮和细描边，避免大面积土黄色。"
  }
];

function normalizeTheme(theme: string | null | undefined): ClientTheme {
  if (theme === "day" || theme === "jade-light" || theme === "light-green") {
    return "light-green";
  }

  if (theme === "noir-gold" || theme === "black-gold") {
    return "black-gold";
  }

  if (theme === "black-gray" || theme === "cool-gray" || theme === "cool-black-gray" || theme === "cold-black-gray") {
    return "cool-black-gray";
  }

  if (theme === "special-black" || theme === "special-dark" || theme === "特殊黑") {
    return "special-black";
  }

  if (theme === "black-white" || theme === "lively-black-white" || theme === "vital-black-white" || theme === "vital-mono") {
    return "vital-mono";
  }

  if (theme === "night" || theme === "dark-green") {
    return "dark-green";
  }

  if (theme === "lovely-neon" || theme === "neon-pink") {
    return "neon-pink";
  }

  return defaultClientTheme;
}

export function isNightClientTheme(theme: ClientTheme | LegacyClientTheme | string | null | undefined) {
  const normalizedTheme = normalizeTheme(theme);
  return normalizedTheme !== "light-green" && normalizedTheme !== "vital-mono";
}

export function getClientThemeClassName(theme: ClientTheme | LegacyClientTheme | string | null | undefined) {
  return `client-theme-${normalizeTheme(theme)}`;
}

export function getClientThemeModeClassName(theme: ClientTheme | LegacyClientTheme | string | null | undefined) {
  return isNightClientTheme(theme) ? "client-theme-night" : "client-theme-day";
}

export function getClientPwaThemeColors(theme: ClientTheme | LegacyClientTheme | string | null | undefined): ClientPwaThemeColors {
  return clientPwaThemeColors[normalizeTheme(theme)];
}

function normalizeThemePreferenceMode(mode: string | null | undefined): ClientThemePreferenceMode {
  return mode === "manual" ? "manual" : "auto";
}

function syncClientPwaTheme(theme: ClientTheme) {
  if (typeof document === "undefined") {
    return;
  }

  const colors = getClientPwaThemeColors(theme);
  const root = document.documentElement;
  const body = document.body;
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const appleStatusBarMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');

  root.style.setProperty("--needo-pwa-theme-color", colors.themeColor);
  root.style.setProperty("--needo-pwa-status-bg", colors.statusBackground);
  root.style.setProperty("--client-top-chrome-bg", colors.statusBackground);
  root.dataset.needoClientTheme = theme;

  if (body) {
    body.style.setProperty("--needo-pwa-theme-color", colors.themeColor);
    body.style.setProperty("--needo-pwa-status-bg", colors.statusBackground);
    body.style.setProperty("--client-top-chrome-bg", colors.statusBackground);
  }

  themeColorMeta?.setAttribute("content", colors.themeColor);
  appleStatusBarMeta?.setAttribute("content", "black-translucent");
}

export function detectSystemClientTheme(): ClientTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return defaultClientTheme;
  }

  return window.matchMedia(systemDarkModeMediaQuery).matches ? defaultNightClientTheme : defaultDayClientTheme;
}

export function getInitialClientThemeState(): ClientThemeState {
  if (typeof window === "undefined") {
    return {
      theme: defaultClientTheme,
      preferenceMode: "auto"
    };
  }

  const preferenceMode = normalizeThemePreferenceMode(readBrowserStorage(themePreferenceModeStorageKey, { silent: true }));

  if (preferenceMode === "manual") {
    return {
      theme: normalizeTheme(readBrowserStorage(themeStorageKey, { silent: true })),
      preferenceMode
    };
  }

  return {
    theme: detectSystemClientTheme(),
    preferenceMode
  };
}

export function ClientThemeProvider({ children }: { children: ReactNode }) {
  const [{ theme, preferenceMode }, setThemeState] = useState<ClientThemeState>(getInitialClientThemeState);

  useEffect(() => {
    writeBrowserStorage(themeStorageKey, theme, { silent: true });
    writeBrowserStorage(themePreferenceModeStorageKey, preferenceMode, { silent: true });
  }, [preferenceMode, theme]);

  useEffect(() => {
    syncClientPwaTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function" || preferenceMode !== "auto") {
      return;
    }

    const mediaQuery = window.matchMedia(systemDarkModeMediaQuery);
    const syncTheme = () => {
      setThemeState((current) => {
        if (current.preferenceMode !== "auto") {
          return current;
        }

        const nextTheme = detectSystemClientTheme();
        return current.theme === nextTheme ? current : { ...current, theme: nextTheme };
      });
    };

    syncTheme();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncTheme);
    } else if (typeof (mediaQuery as LegacyMediaQueryList).addListener === "function") {
      (mediaQuery as LegacyMediaQueryList).addListener?.(syncTheme);
    }

    window.addEventListener("pageshow", syncTheme);

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", syncTheme);
      } else if (typeof (mediaQuery as LegacyMediaQueryList).removeListener === "function") {
        (mediaQuery as LegacyMediaQueryList).removeListener?.(syncTheme);
      }

      window.removeEventListener("pageshow", syncTheme);
    };
  }, [preferenceMode]);

  const value = useMemo<ClientThemeContextValue>(
    () => ({
      theme,
      themes: clientThemes,
      setTheme(nextTheme) {
        setThemeState({
          theme: normalizeTheme(nextTheme),
          preferenceMode: "manual"
        });
      },
      toggleTheme() {
        setThemeState((current) => ({
          theme: clientThemes[(clientThemes.findIndex((item) => item.id === current.theme) + 1) % clientThemes.length]?.id ?? defaultClientTheme,
          preferenceMode: "manual"
        }));
      },
      isNight: isNightClientTheme(theme)
    }),
    [theme]
  );

  return <ClientThemeContext.Provider value={value}>{children}</ClientThemeContext.Provider>;
}

export function useClientTheme() {
  const context = useContext(ClientThemeContext);

  if (!context) {
    throw new Error("useClientTheme must be used within ClientThemeProvider");
  }

  return context;
}
