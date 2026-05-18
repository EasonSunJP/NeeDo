import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { AppIcon, floatingHeaderControlButtonClassName } from "../client-ui/AppScaffold";
import { TitleWithInfo } from "../ui/TitleWithInfo";

export const mobileFullscreenHeaderSurfaceClassName =
  "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,var(--client-surface)_4%)] text-[color:var(--client-text)] shadow-[0_14px_34px_rgba(0,0,0,0.10)]";

export const mobileFullscreenHeaderDarkSurfaceClassName =
  "border-white/10 bg-[#050505] text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)]";

export function MobileFullscreenCloseButton({
  onClose,
  dark = false,
  label = "关闭",
  className
}: {
  onClose: () => void;
  dark?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        floatingHeaderControlButtonClassName,
        dark ? "border-white/12 bg-white/10 text-white" : "text-[color:var(--client-primary)]",
        className
      )}
      onClick={onClose}
      type="button"
    >
      <AppIcon className="h-5 w-5" name="close" />
    </button>
  );
}

export function MobileFullscreenBackButton({
  onBack,
  dark = false,
  label = "返回",
  className
}: {
  onBack: () => void;
  dark?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        floatingHeaderControlButtonClassName,
        dark ? "border-white/12 bg-white/10 text-white" : undefined,
        className
      )}
      onClick={onBack}
      type="button"
    >
      <AppIcon className="h-5 w-5" name="back" />
    </button>
  );
}

export function MobileFullscreenHeader({
  title,
  info,
  subtitle,
  onBack,
  onClose,
  action,
  dark = false,
  className,
  hideBackButton = false,
  hideCloseButton = false,
  backLabel = "返回",
  closeLabel = "关闭"
}: {
  title: ReactNode;
  info?: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  action?: ReactNode;
  dark?: boolean;
  className?: string;
  hideBackButton?: boolean;
  hideCloseButton?: boolean;
  backLabel?: string;
  closeLabel?: string;
}) {
  const showBackButton = Boolean(onBack) && !hideBackButton;
  const showCloseButton = Boolean(onClose) && !hideCloseButton;
  const hasRightControls = Boolean(action || showCloseButton);

  return (
    <div className="contents">
      <header
        className={cn(
          "safe-header-top relative z-40 isolate min-h-16 shrink-0 border-b pb-3",
          dark ? mobileFullscreenHeaderDarkSurfaceClassName : mobileFullscreenHeaderSurfaceClassName,
          className
        )}
      >
        <div
          className={cn(
            "mx-auto grid w-full max-w-[480px] items-start gap-3 px-4",
            showBackButton ? "grid-cols-[44px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"
          )}
        >
          {showBackButton ? (
            <MobileFullscreenBackButton className={dark ? "text-white" : undefined} label={backLabel} onBack={onBack!} />
          ) : null}
          <div
            className={cn(
              "min-w-0",
              showBackButton ? "col-start-2" : "col-start-1",
              hasRightControls ? "" : showBackButton ? "col-end-4" : "col-end-3"
            )}
          >
            <div className="flex min-h-11 flex-col justify-center">
              <TitleWithInfo
                as="h1"
                info={info}
                label={typeof title === "string" ? `${title} 说明` : "查看页面说明"}
                title={title}
                titleClassName={cn("truncate text-[20px] font-black leading-none", dark ? "text-white" : "text-current")}
                variant={dark ? "dark" : "client"}
              />
            </div>
            {subtitle ? <p className={cn("mt-0.5 text-[11px] font-bold leading-5", dark ? "text-white/60" : "text-ink/45")}>{subtitle}</p> : null}
          </div>
          {hasRightControls ? (
            <div className={cn("flex h-11 shrink-0 items-center gap-2", showBackButton ? "col-start-3" : "col-start-2")}>
              {action}
              {showCloseButton ? <MobileFullscreenCloseButton label={closeLabel} onClose={onClose!} /> : null}
            </div>
          ) : null}
        </div>
      </header>
    </div>
  );
}
