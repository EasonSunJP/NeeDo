import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { AppIcon, floatingHeaderControlButtonClassName } from "../client-ui/AppScaffold";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "./FloatingHomeHeader";

export const mobileFullscreenHeaderSurfaceClassName =
  `${floatingHeaderGlassPanelClassName} text-[color:var(--client-text)]`;

export const mobileFullscreenHeaderDarkSurfaceClassName =
  `${floatingHeaderGlassPanelClassName} text-white`;

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
  closeLabel = "关闭",
  showSpacer = true
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
  showSpacer?: boolean;
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
    <FloatingHomeHeader
      className="gap-0"
      frameClassName="z-40"
      maxWidth="480px"
      panelClassName={cn(dark ? mobileFullscreenHeaderDarkSurfaceClassName : mobileFullscreenHeaderSurfaceClassName, className)}
      showSpacer={showSpacer}
      spacerGapPx={0}
    >
      <div className={floatingHeaderInnerClassName}>
        <div
          className={cn(
            "mx-auto grid min-h-11 w-full items-center gap-3",
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
      </div>
    </FloatingHomeHeader>
  );
}
