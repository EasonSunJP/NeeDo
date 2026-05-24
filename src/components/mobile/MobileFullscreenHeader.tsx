import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { AppIcon, floatingHeaderControlButtonClassName } from "../client-ui/AppScaffold";
import { TitleWithInfo } from "../ui/TitleWithInfo";

export const mobileFullscreenHeaderSurfaceClassName =
  "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-top-chrome-bg)] text-[color:var(--client-text)] shadow-[0_14px_34px_rgba(0,0,0,0.10)]";

export const mobileFullscreenHeaderDarkSurfaceClassName =
  "border-white/10 bg-[color:var(--client-top-chrome-bg)] text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)]";

export function MobileFullscreenCloseButton({
  onClose,
  dark = false,
  label = "关闭",
  className,
  style
}: {
  onClose: () => void;
  dark?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        floatingHeaderControlButtonClassName,
        dark
          ? "border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] text-[color:var(--client-primary)]"
          : "text-[color:var(--client-primary)]",
        className
      )}
      onClick={onClose}
      style={style}
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
        dark
          ? "border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] text-[color:var(--client-primary)]"
          : undefined,
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
  const headerInfo = info && subtitle ? (
    <div className="grid gap-2">
      <div>{subtitle}</div>
      <div>{info}</div>
    </div>
  ) : info ?? subtitle;

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
            "mx-auto grid w-full max-w-[480px] items-center gap-3 px-4",
            showBackButton ? "grid-cols-[44px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"
          )}
        >
          {showBackButton ? (
            <MobileFullscreenBackButton dark={dark} label={backLabel} onBack={onBack!} />
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
                info={headerInfo}
                label={typeof title === "string" ? `${title} 说明` : "查看页面说明"}
                title={title}
                titleClassName={cn("truncate text-[20px] font-black leading-none", dark ? "text-white" : "text-current")}
                variant={dark ? "dark" : "client"}
              />
            </div>
          </div>
          {hasRightControls ? (
            <div className={cn("flex h-11 shrink-0 items-center gap-2", showBackButton ? "col-start-3" : "col-start-2")}>
              {action}
              {showCloseButton ? <MobileFullscreenCloseButton dark={dark} label={closeLabel} onClose={onClose!} /> : null}
            </div>
          ) : null}
        </div>
      </header>
    </div>
  );
}
