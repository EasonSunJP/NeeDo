export type PwaInstallPlatform = "ios" | "android" | "desktop" | "other";

export type PwaInstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

export type PwaInstallPromptChoice = {
  outcome?: string;
  platform?: string;
};

export type BeforeInstallPromptEvent = Event & {
  readonly platforms?: string[];
  readonly userChoice: Promise<PwaInstallPromptChoice>;
  prompt: () => Promise<PwaInstallPromptChoice | void>;
};

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

type PwaNavigatorLike = Pick<Navigator, "userAgent"> &
  Partial<Pick<Navigator, "maxTouchPoints" | "platform">>;

const standaloneDisplayModeQueries = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)"
];

function safeMatches(win: Window, query: string) {
  try {
    return typeof win.matchMedia === "function" && win.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function isPwaStandaloneWindow(win: Window | undefined = typeof window === "undefined" ? undefined : window) {
  if (!win) {
    return false;
  }

  const iosNavigator = win.navigator as StandaloneNavigator;

  return (
    iosNavigator.standalone === true ||
    standaloneDisplayModeQueries.some((query) => safeMatches(win, query)) ||
    win.document?.documentElement?.dataset.needoDisplayMode === "standalone"
  );
}

export function shouldShowPwaInstallSetting(win: Window | undefined = typeof window === "undefined" ? undefined : window) {
  return Boolean(win) && !isPwaStandaloneWindow(win);
}

export function detectPwaInstallPlatform(navigatorLike: PwaNavigatorLike | undefined = typeof navigator === "undefined" ? undefined : navigator) {
  if (!navigatorLike) {
    return "other" satisfies PwaInstallPlatform;
  }

  const userAgent = navigatorLike.userAgent;
  const platform = navigatorLike.platform ?? "";
  const maxTouchPoints = navigatorLike.maxTouchPoints ?? 0;
  const isiPadDesktopMode = platform === "MacIntel" && maxTouchPoints > 1;

  if (/iPad|iPhone|iPod/i.test(userAgent) || isiPadDesktopMode) {
    return "ios" satisfies PwaInstallPlatform;
  }

  if (/Android/i.test(userAgent)) {
    return "android" satisfies PwaInstallPlatform;
  }

  if (/Macintosh|Windows|Linux|CrOS/i.test(userAgent)) {
    return "desktop" satisfies PwaInstallPlatform;
  }

  return "other" satisfies PwaInstallPlatform;
}

export function normalizePwaInstallPromptOutcome(choice?: PwaInstallPromptChoice | void): PwaInstallPromptOutcome {
  return choice?.outcome === "accepted" || choice?.outcome === "dismissed" ? choice.outcome : "unavailable";
}
