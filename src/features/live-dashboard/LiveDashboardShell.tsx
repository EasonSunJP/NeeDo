import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { getInitialLiveDashboardTheme } from "./liveDashboardTheme";

interface LiveDashboardShellProps {
  children: ReactNode;
  header: ReactNode;
}

export function LiveDashboardShell({ children, header }: LiveDashboardShellProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [themeClass, setThemeClass] = useState(getInitialLiveDashboardTheme);
  const [fullscreen, setFullscreen] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));
  const [fullscreenError, setFullscreenError] = useState("");
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      setFullscreenError("");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "needo.admin.theme" || event.key === "needo.admin.theme.mode") {
        setThemeClass(getInitialLiveDashboardTheme());
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await (rootRef.current?.requestFullscreen?.() ?? document.documentElement.requestFullscreen());
    } catch {
      setFullscreenError(t("无法进入全屏，当前页面仍可正常使用"));
    }
  };

  return (
    <main ref={rootRef} className={cn("admin-shell live-dashboard-shell min-h-[100dvh] bg-paper text-ink", themeClass)}>
      <header className="live-dashboard-header">
        {header}
        <button className="live-dashboard-fullscreen-button" onClick={() => void toggleFullscreen()} type="button">
          <span aria-hidden="true">{fullscreen ? "↙" : "↗"}</span>
          {t(fullscreen ? "退出全屏" : "进入全屏")}
        </button>
      </header>
      {fullscreenError ? <p className="live-dashboard-alert" role="alert">{fullscreenError}</p> : null}
      <section className="live-dashboard-grid" data-testid="live-dashboard-grid">{children}</section>
    </main>
  );
}
