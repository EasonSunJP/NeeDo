export type AdminTheme = "pink-purple-black" | "classic-white-black" | "blue-black";

export type AdminThemeOption = {
  id: AdminTheme;
  label: string;
  shortLabel: string;
  caption: string;
  mode: "light" | "dark";
  swatches: readonly [string, string, string];
};

export const defaultDayAdminTheme: AdminTheme = "classic-white-black";
export const defaultNightAdminTheme: AdminTheme = "blue-black";

export const sharedAdminThemeOptions: readonly AdminThemeOption[] = [
  {
    id: "pink-purple-black",
    label: "粉紫黑",
    shortLabel: "粉紫黑",
    caption: "后台专用 / 白昼",
    mode: "light",
    swatches: ["#ffffff", "#13091f", "#9d5cff"]
  },
  {
    id: "classic-white-black",
    label: "经典白黑",
    shortLabel: "经典白黑",
    caption: "后台专用 / 白黑",
    mode: "light",
    swatches: ["#ffffff", "#09090b", "#111827"]
  },
  {
    id: "blue-black",
    label: "经典蓝黑",
    shortLabel: "经典蓝黑",
    caption: "后台专用 / 黑夜",
    mode: "dark",
    swatches: ["#171825", "#4b7cff", "#7fb7ff"]
  }
];

export const platformAdminThemeOptions: readonly AdminThemeOption[] = sharedAdminThemeOptions;

export const adminThemeOptions = platformAdminThemeOptions;

function normalizeLegacyTheme(value: string | null | undefined, legacyDarkTheme: AdminTheme) {
  if (value === "light" || value === "light-green" || value === "vital-mono" || value === "day" || value === "jade-light") {
    return "pink-purple-black";
  }

  if (value === "dark") {
    return legacyDarkTheme;
  }

  if (value === "lovely-neon" || value === "neon-pink") {
    return "pink-purple-black";
  }

  if (value === "classic-white-black" || value === "white-black" || value === "black-white" || value === "lively-black-white" || value === "vital-black-white") {
    return "classic-white-black";
  }

  if (value === "dark-green" || value === "black-gold" || value === "noir-gold" || value === "cool-black-gray" || value === "black-gray" || value === "cool-gray" || value === "cold-black-gray") {
    return legacyDarkTheme;
  }

  return value;
}

export function detectSystemAdminTheme(
  dayTheme: AdminTheme = defaultDayAdminTheme,
  nightTheme: AdminTheme = defaultNightAdminTheme,
  options: readonly AdminThemeOption[] = platformAdminThemeOptions
): AdminTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return normalizeAdminTheme(dayTheme, defaultDayAdminTheme, options);
  }

  return normalizeAdminTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? nightTheme : dayTheme, dayTheme, options);
}

export function normalizeAdminTheme(
  value: string | null | undefined,
  fallback: AdminTheme = defaultDayAdminTheme,
  options: readonly AdminThemeOption[] = platformAdminThemeOptions,
  legacyDarkTheme: AdminTheme = defaultNightAdminTheme
): AdminTheme {
  const allowedIds = new Set(options.map((item) => item.id));
  const resolvedFallback = allowedIds.has(fallback) ? fallback : options[0]?.id ?? defaultDayAdminTheme;
  const normalizedValue = normalizeLegacyTheme(value, legacyDarkTheme);

  return allowedIds.has(normalizedValue as AdminTheme) ? (normalizedValue as AdminTheme) : resolvedFallback;
}

export function getAdminThemeOption(theme: AdminTheme, options: readonly AdminThemeOption[] = platformAdminThemeOptions): AdminThemeOption {
  const fallbackOption = platformAdminThemeOptions[0];

  if (!fallbackOption) {
    throw new Error("No admin theme options configured");
  }

  return options.find((item) => item.id === theme) ?? platformAdminThemeOptions.find((item) => item.id === theme) ?? options[0] ?? fallbackOption;
}

export function isDarkAdminTheme(theme: AdminTheme) {
  return getAdminThemeOption(theme).mode === "dark";
}
