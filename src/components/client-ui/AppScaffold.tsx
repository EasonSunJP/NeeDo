import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn, hasLocalizedTitleText } from "../../lib/utils";
import { MobileShell, type MobileNavItem } from "../mobile/MobileShell";
import { ShareNetworkIconPath } from "../ui/ShareNetworkIcon";
import { TitleWithInfo } from "../ui/TitleWithInfo";

function shouldRenderTitleEyebrow(eyebrow?: ReactNode) {
  if (!eyebrow) {
    return false;
  }

  return typeof eyebrow !== "string" || hasLocalizedTitleText(eyebrow);
}

function InteractiveWrapper({
  children,
  to,
  onClick,
  className
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  if (to) {
    return (
      <Link className={className} to={to}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        {children}
      </button>
    );
  }

  return <div className={className}>{children}</div>;
}

function iconPath(name: IconName) {
  switch (name) {
    case "back":
      return <path d="m14.5 6.5-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />;
    case "close":
      return <path d="M7 7 17 17M17 7 7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />;
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </>
      );
    case "plus":
      return <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />;
    case "minus":
      return <path d="M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />;
    case "menu":
      return <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.1" />;
    case "settings":
      return (
        <>
          <path
            d="M11.2 3.8h1.6l.7 2.1a6.7 6.7 0 0 1 1.6.7l2-1 1.1 1.2-1 2a7.8 7.8 0 0 1 .7 1.6l2.1.7v1.6l-2.1.7a7.8 7.8 0 0 1-.7 1.6l1 2-1.2 1.1-2-1a6.7 6.7 0 0 1-1.6.7l-.7 2.1h-1.6l-.7-2.1a6.7 6.7 0 0 1-1.6-.7l-2 1-1.1-1.1 1-2a7.8 7.8 0 0 1-.7-1.6l-2.1-.7v-1.6l2.1-.7a7.8 7.8 0 0 1 .7-1.6l-1-2L7.6 5.6l2 1a6.7 6.7 0 0 1 1.6-.7l.7-2.1Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="M5 18.8h4.1L18.2 9.7a2.1 2.1 0 0 0 0-3l-.9-.9a2.1 2.1 0 0 0-3 0L5.2 14.9 5 18.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
          <path d="m13.2 6.9 3.9 3.9M4.5 20h15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        </>
      );
    case "check":
      return <path d="m5.5 12.5 4.2 4.2 8.8-9.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />;
    case "calendar":
      return (
        <>
          <rect height="15" rx="3" stroke="currentColor" strokeWidth="1.9" width="16" x="4" y="5" />
          <path d="M8 3.5v4M16 3.5v4M4 9.5h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        </>
      );
    case "chat":
      return (
        <>
          <path d="M6 6.5h12a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 18 16.5H11l-4 3v-3H6A2.5 2.5 0 0 1 3.5 14V9A2.5 2.5 0 0 1 6 6.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
          <path d="M8.5 11h7M8.5 13.8h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        </>
      );
    case "support":
      return (
        <>
          <path d="M5.2 12.4A6.8 6.8 0 0 1 12 5.5a6.8 6.8 0 0 1 6.8 6.9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
          <path d="M5.2 12.2h-.5A2.2 2.2 0 0 0 2.5 14.4v1a2.2 2.2 0 0 0 2.2 2.2h1.1v-5.4h-.6ZM18.8 12.2h.5a2.2 2.2 0 0 1 2.2 2.2v1a2.2 2.2 0 0 1-2.2 2.2h-1.1v-5.4h.6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M8.1 10.5h7.8a2.3 2.3 0 0 1 2.3 2.3v2.3a2.3 2.3 0 0 1-2.3 2.3h-3.4l-3 2.1v-2.1H8.1a2.3 2.3 0 0 1-2.3-2.3v-2.3a2.3 2.3 0 0 1 2.3-2.3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9.2 14h.1M12 14h.1M14.8 14h.1" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
        </>
      );
    case "map":
      return (
        <>
          <path d="M12 20s6-4.6 6-10a6 6 0 1 0-12 0c0 5.4 6 10 6 10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
          <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.9" />
        </>
      );
    case "star":
      return <path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6-4.9 2.6.9-5.3-4-3.9 5.5-.8L12 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />;
    case "heart":
      return <path d="M12 19.2s-6.8-4.3-8.6-8.3C2 7.8 4 5.2 7 5.2c1.8 0 3.2.8 5 2.9 1.8-2.1 3.2-2.9 5-2.9 3 0 5 2.6 3.6 5.7-1.8 4-8.6 8.3-8.6 8.3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />;
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 8v4.3l2.8 1.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        </>
      );
    case "palette":
      return (
        <>
          <path d="M12 4a8 8 0 0 0 0 16h.8a1.8 1.8 0 0 0 1.8-1.8c0-.7-.4-1.4-1.1-1.8l-.6-.3c-.8-.4-1.1-1.4-.8-2.2.3-.7 1.1-1.2 1.9-1.1h1a5 5 0 0 0 0-10h-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <circle cx="8" cy="10" r="1" fill="currentColor" />
          <circle cx="9.5" cy="14.5" r="1" fill="currentColor" />
          <circle cx="13.5" cy="8.5" r="1" fill="currentColor" />
        </>
      );
    case "globe":
      return (
        <>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.9" />
          <path d="M4.6 9.5h14.8M4.6 14.5h14.8M12 4.2c2.1 2.2 3.3 5 3.3 7.8S14.1 17.6 12 19.8M12 4.2c-2.1 2.2-3.3 5-3.3 7.8s1.2 5.6 3.3 7.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 4.2c2.1 1.7 4.6 2.5 7.2 2.5v4.6c0 4.4-2.7 7.3-7.2 8.9-4.5-1.6-7.2-4.5-7.2-8.9V6.7c2.6 0 5.1-.8 7.2-2.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
          <path d="m9.2 12.2 2 2 3.8-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M8.5 17.5h7l-1-1.8v-3.1a3.5 3.5 0 1 0-7 0v3.1l-1 1.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      );
    case "sparkles":
      return (
        <>
          <path d="m12 4 1.1 3.4L16.5 8l-3.4 1.1L12 12.5l-1.1-3.4L7.5 8l3.4-1.1L12 4ZM18.5 14l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1ZM6 14l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7L6 14Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
        </>
      );
    case "share":
      return <ShareNetworkIconPath />;
    case "manager":
      return (
        <>
          <path d="M12 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.4 20.2c.6-4 3.3-6.4 7.6-6.4s7 2.4 7.6 6.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="m10.2 14.2 1.8 2.2 1.8-2.2M12 16.4v3.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </>
      );
  }
}

export type IconName =
  | "back"
  | "close"
  | "search"
  | "plus"
  | "minus"
  | "menu"
  | "settings"
  | "edit"
  | "check"
  | "calendar"
  | "chat"
  | "support"
  | "map"
  | "star"
  | "heart"
  | "clock"
  | "palette"
  | "globe"
  | "shield"
  | "bell"
  | "sparkles"
  | "share"
  | "manager";

export function AppIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      {iconPath(name)}
    </svg>
  );
}

export function IconButton({
  icon,
  label,
  to,
  onClick,
  className
}: {
  icon: IconName;
  label: string;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <InteractiveWrapper
      className={cn(
        "focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] text-[color:var(--client-text)] shadow-[0_14px_32px_rgba(0,0,0,0.08)] backdrop-blur",
        className
      )}
      onClick={onClick}
      to={to}
    >
      <AppIcon name={icon} />
      <span className="sr-only">{label}</span>
    </InteractiveWrapper>
  );
}

export function FloatingTopLeftControl({
  children,
  className,
  contentClassName
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("pointer-events-none fixed inset-x-0 safe-floating-top z-[80]", className)}>
      <div className={cn("mx-auto flex w-full max-w-[480px] justify-start px-4", contentClassName)}>
        <div className="pointer-events-auto">{children}</div>
      </div>
    </div>
  );
}

export function FloatingTopRightControl({
  children,
  className,
  contentClassName
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("pointer-events-none fixed inset-x-0 safe-floating-top z-[80]", className)}>
      <div className={cn("mx-auto flex w-full max-w-[480px] justify-end px-4", contentClassName)}>
        <div className="pointer-events-auto">{children}</div>
      </div>
    </div>
  );
}

export const floatingHeaderControlButtonClassName =
  "focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] text-[color:var(--client-text)] shadow-[0_14px_30px_rgba(0,0,0,0.14)] backdrop-blur-xl transition active:scale-[0.97]";

const appTopBarSurfaceClassName =
  "border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-bg)] shadow-[0_14px_32px_color-mix(in_srgb,var(--client-shadow)_14%,transparent)]";

export function FloatingBackButton({
  onClick,
  className,
  label = "返回"
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <FloatingTopLeftControl>
      <button aria-label={label} className={cn(floatingHeaderControlButtonClassName, className)} onClick={onClick} type="button">
        <AppIcon className="h-5 w-5" name="back" />
      </button>
    </FloatingTopLeftControl>
  );
}

export function FloatingCloseButton({
  onClick,
  className,
  label = "关闭"
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <FloatingTopRightControl>
      <button
        aria-label={label}
        className={cn(floatingHeaderControlButtonClassName, "text-[color:var(--client-primary)]", className)}
        onClick={onClick}
        type="button"
      >
        <AppIcon className="h-5 w-5" name="close" />
      </button>
    </FloatingTopRightControl>
  );
}

function AppTopBarControlButton({
  icon,
  label,
  onClick,
  className
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button aria-label={label} className={cn(floatingHeaderControlButtonClassName, "shrink-0", className)} onClick={onClick} type="button">
      <AppIcon className="h-5 w-5" name={icon} />
    </button>
  );
}

export function PageScaffold({
  children,
  navItems,
  className,
  contentClassName,
  showTopEdgeMask
}: {
  children: ReactNode;
  navItems?: MobileNavItem[];
  className?: string;
  contentClassName?: string;
  showTopEdgeMask?: boolean;
}) {
  return (
    <MobileShell className={className} navItems={navItems} showTopEdgeMask={showTopEdgeMask}>
      <div className={cn("mx-auto w-full max-w-[1480px] px-4 pb-28 pt-4 sm:px-6 lg:px-8", contentClassName)}>{children}</div>
    </MobileShell>
  );
}

export function AppTopBar({
  title,
  info,
  subtitle,
  onBack,
  backTo,
  onClose,
  closeTo,
  actions,
  footer,
  footerClassName,
  containerClassName,
  hideBackButton = false,
  hideCloseButton = false,
  closeLabel = "关闭",
  controlButtonClassName,
  className,
  fixed = false
}: {
  title: ReactNode;
  info?: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  backTo?: string;
  onClose?: () => void;
  closeTo?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  footerClassName?: string;
  containerClassName?: string;
  hideBackButton?: boolean;
  hideCloseButton?: boolean;
  closeLabel?: string;
  controlButtonClassName?: string;
  className?: string;
  fixed?: boolean;
}) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (backTo) {
      navigate(backTo);
      return;
    }

    navigate(-1);
  };
  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }

    if (closeTo) {
      navigate(closeTo, { replace: true });
    }
  };
  const showCloseButton = Boolean(onClose || closeTo) && !hideCloseButton;
  const spacerClassName = footer ? "h-[calc(env(safe-area-inset-top)+7.75rem)]" : "h-[calc(env(safe-area-inset-top)+5.75rem)]";
  const rightControls = (
    <>
      {actions}
      {showCloseButton ? <AppTopBarControlButton className={cn("text-[color:var(--client-primary)]", controlButtonClassName)} icon="close" label={closeLabel} onClick={handleClose} /> : null}
    </>
  );
  const hasRightControls = Boolean(actions || showCloseButton);
  const titleColumnClassName = hideBackButton ? "col-start-1" : "col-start-2";
  const actionsColumnClassName = hideBackButton ? "col-start-2" : "col-start-3";
  const subtitleColumnClassName = cn(
    titleColumnClassName,
    hasRightControls ? "" : hideBackButton ? "col-end-3" : "col-end-4"
  );

  const content = (
    <>
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1480px] items-center gap-x-3",
          hideBackButton ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[44px_minmax(0,1fr)_auto]"
        )}
      >
        {!hideBackButton ? <AppTopBarControlButton className={cn("row-start-1", controlButtonClassName)} icon="back" label="返回" onClick={handleBack} /> : null}
        <div className={cn("row-start-1 flex h-11 min-w-0 items-center", titleColumnClassName)}>
          <TitleWithInfo
            as="h1"
            info={info}
            label={typeof title === "string" ? `${title} 说明` : "查看页面说明"}
            title={title}
            titleClassName="truncate text-[20px] font-black leading-none text-[color:var(--client-text)]"
          />
        </div>
        {hasRightControls ? <div className={cn("row-start-1 flex h-11 shrink-0 items-center gap-2", actionsColumnClassName)}>{rightControls}</div> : null}
        {subtitle ? <p className={cn("mt-1 truncate text-[12px] font-semibold text-[color:var(--client-muted)]", subtitleColumnClassName)}>{subtitle}</p> : null}
      </div>
      {footer ? <div className={cn("mx-auto mt-2 w-full max-w-[1480px]", footerClassName)}>{footer}</div> : null}
    </>
  );

  if (fixed) {
    return (
      <header
        className={cn(
          "safe-header-top fixed inset-x-0 top-0 z-40",
          appTopBarSurfaceClassName,
          className
        )}
      >
        <div className={cn("mx-auto w-full max-w-[1600px] px-4 pb-3 sm:px-6 lg:px-8", containerClassName)}>
          {content}
        </div>
      </header>
    );
  }

  return (
    <div className="contents">
      <header
        className={cn(
          "safe-header-top fixed inset-x-0 top-0 z-40",
          appTopBarSurfaceClassName,
          className
        )}
      >
        <div className={cn("mx-auto w-full max-w-[1600px] px-4 pb-3 sm:px-6 lg:px-8", containerClassName)}>
          {content}
        </div>
      </header>
      <div aria-hidden="true" className={spacerClassName} />
    </div>
  );
}

export function HeroHeader({
  eyebrow,
  title,
  description,
  media,
  meta,
  actions,
  aside
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  media?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] shadow-[var(--client-shadow)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_24%,transparent),transparent_42%),radial-gradient(circle_at_85%_10%,color-mix(in_srgb,var(--client-warm)_28%,transparent),transparent_34%)]" />
      {media ? (
        <div className="absolute inset-y-0 right-0 hidden w-[38%] overflow-hidden lg:block">
          <div className="absolute inset-0 bg-gradient-to-l from-black/30 via-black/5 to-transparent" />
          <img alt="" className="h-full w-full object-cover opacity-85" src={media} />
        </div>
      ) : null}
      <div className="relative grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.7fr)] lg:px-8 lg:py-8">
        <div className="min-w-0">
          {shouldRenderTitleEyebrow(eyebrow) ? <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[color:var(--client-primary)]">{eyebrow}</p> : null}
          <TitleWithInfo
            as="h2"
            className="mt-3"
            info={description}
            infoClassName="h-6 w-6 text-[12px]"
            label={typeof title === "string" ? `${title} 说明` : "查看模块说明"}
            title={title}
            titleClassName="max-w-3xl text-[32px] font-black leading-[1.02] tracking-[-0.04em] text-[color:var(--client-text)] sm:text-[38px] lg:text-[48px]"
          />
          {meta ? <div className="mt-5 flex flex-wrap gap-2.5">{meta}</div> : null}
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        <div className="flex min-h-full items-end justify-end">{aside}</div>
      </div>
    </section>
  );
}

export function MetaPill({
  icon,
  label,
  tone = "neutral"
}: {
  icon?: IconName;
  label: ReactNode;
  tone?: "neutral" | "accent" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-bold",
        tone === "primary"
          ? "border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
          : tone === "accent"
            ? "border-[color:color-mix(in_srgb,var(--client-warm)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-warm)_18%,transparent)] text-[color:color-mix(in_srgb,var(--client-warm)_74%,var(--client-text))]"
            : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] text-[color:var(--client-muted)]"
      )}
    >
      {icon ? <AppIcon className="h-4 w-4" name={icon} /> : null}
      <span>{label}</span>
    </span>
  );
}

export function PrimaryButton({
  children,
  to,
  onClick,
  className
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <InteractiveWrapper
      className={cn(
        "focus-ring inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_18px_40px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition hover:-translate-y-0.5",
        className
      )}
      onClick={onClick}
      to={to}
    >
      {children}
    </InteractiveWrapper>
  );
}

export function SecondaryButton({
  children,
  to,
  onClick,
  className
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <InteractiveWrapper
      className={cn(
        "focus-ring inline-flex h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] px-5 text-sm font-black text-[color:var(--client-text)] backdrop-blur transition hover:-translate-y-0.5",
        className
      )}
      onClick={onClick}
      to={to}
    >
      {children}
    </InteractiveWrapper>
  );
}

export function SectionBlock({
  eyebrow,
  title,
  description,
  action,
  children,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-1", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {shouldRenderTitleEyebrow(eyebrow) ? <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">{eyebrow}</p> : null}
          <TitleWithInfo
            as="h3"
            className="mt-1"
            info={description}
            label={typeof title === "string" ? `${title} 说明` : "查看模块说明"}
            title={title}
            titleClassName="text-[22px] font-black tracking-[-0.03em] text-[color:var(--client-text)]"
          />
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange
}: {
  items: Array<{ label: ReactNode; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="client-segmented-tabs inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] p-1">
      {items.map((item) => {
        const active = item.value === value;

        return (
          <button
            className={cn(
              "client-segmented-tab rounded-full px-4 py-2.5 text-sm font-black transition",
              active
                ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_8px_22px_color-mix(in_srgb,var(--client-primary)_22%,transparent)]"
                : "text-[color:var(--client-muted)]"
            )}
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export type ScheduleViewSegmentedValue = "day" | "week" | "month";

const scheduleViewSegmentedItems: Array<{ label: string; value: ScheduleViewSegmentedValue }> = [
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" }
];

export function ScheduleViewSegmentedTabs({
  value,
  onChange,
  className
}: {
  value: ScheduleViewSegmentedValue;
  onChange: (value: ScheduleViewSegmentedValue) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "client-segmented-tabs inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--client-line,var(--admin-line,#d9e4df))_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface,var(--admin-surface,#ffffff))_74%,transparent)] p-1",
        className
      )}
    >
      {scheduleViewSegmentedItems.map((item) => {
        const active = item.value === value;

        return (
          <button
            aria-pressed={active}
            className={cn(
              "client-segmented-tab min-w-[56px] rounded-full px-4 py-2.5 text-sm font-black transition",
              active
                ? "bg-[color:var(--client-primary,var(--admin-accent,#7f6df2))] text-[color:var(--client-needo-text,#101418)] shadow-[0_8px_22px_color-mix(in_srgb,var(--client-primary,var(--admin-accent,#7f6df2))_22%,transparent)]"
                : "text-[color:var(--client-muted,var(--admin-muted,#718179))]"
            )}
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function getAdaptiveTabLabelClass(label: ReactNode) {
  if (typeof label !== "string") {
    return "inline-flex min-w-0 max-w-full items-center justify-center";
  }

  const length = Array.from(label.replace(/\s/g, "")).length;

  if (length <= 3) {
    return "inline-block max-w-full whitespace-nowrap";
  }

  if (length <= 5) {
    return "inline-block w-[122%] max-w-[122%] -mx-[11%] whitespace-nowrap [transform:scaleX(0.82)] [transform-origin:center]";
  }

  if (length <= 8) {
    return "inline-block w-[136%] max-w-[136%] -mx-[18%] whitespace-nowrap [transform:scaleX(0.72)] [transform-origin:center]";
  }

  return "line-clamp-2 max-w-full whitespace-normal break-words leading-[1.08]";
}

export function FeatureSegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  className
}: {
  items: Array<{ label: ReactNode; value: T }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const { language } = useI18n();

  return (
    <div
      className={cn(
        "client-feature-segmented-tabs flex w-full items-stretch gap-0.5 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.12)] backdrop-blur-xl",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        const label = typeof item.label === "string" ? translateText(item.label, language) : item.label;

        return (
          <button
            className={cn(
              "client-feature-segmented-tab flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-full px-1 py-2 text-center text-[11px] font-black leading-none transition sm:px-2 sm:text-[13px]",
              active ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-muted)]"
            )}
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            <span className={cn("overflow-hidden", getAdaptiveTabLabelClass(label))}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FilterChips({
  items,
  active,
  onChange
}: {
  items: string[];
  active?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => {
        const isActive = active === item;

        return (
          <button
            className={cn(
              "rounded-full border px-3 py-2 text-xs font-black whitespace-nowrap transition",
              isActive
                ? "border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
                : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] text-[color:var(--client-muted)]"
            )}
            key={item}
            onClick={() => onChange?.(item)}
            type="button"
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

export function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          className="rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-3 py-1.5 text-[11px] font-bold text-[color:var(--client-muted)]"
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function UnifiedListItem({
  title,
  subtitle,
  description,
  media,
  meta,
  tags,
  to,
  onClick,
  trailing,
  className
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  meta?: ReactNode;
  tags?: string[];
  to?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <InteractiveWrapper
      className={cn(
        "focus-ring grid gap-4 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 lg:grid-cols-[auto,1fr,auto]",
        className
      )}
      onClick={onClick}
      to={to}
    >
      {media ? <div className="shrink-0">{media}</div> : null}
      <div className="min-w-0">
        {subtitle ? <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">{subtitle}</p> : null}
        <div className="mt-1 flex items-start justify-between gap-3">
          <h4 className="min-w-0 text-[18px] font-black leading-6 tracking-[-0.02em] text-[color:var(--client-text)]">{title}</h4>
          {meta ? <div className="shrink-0 text-right text-xs font-bold text-[color:var(--client-muted)]">{meta}</div> : null}
        </div>
        {description ? <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{description}</p> : null}
        {tags?.length ? <div className="mt-3"><TagList items={tags} /></div> : null}
      </div>
      {trailing ? <div className="flex items-center lg:justify-end">{trailing}</div> : null}
    </InteractiveWrapper>
  );
}

export function StickyBottomBar({
  children
}: {
  children: ReactNode;
}) {
  return (
    <div className="safe-nav-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] px-3 pb-3">
      <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-3 shadow-[0_-18px_40px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}

export function SettingsEntryRow({
  title,
  description,
  icon,
  to,
  onClick,
  trailing
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  to?: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <InteractiveWrapper
      className="focus-ring flex items-center gap-4 rounded-[22px] px-1 py-3 text-left transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_62%,transparent)]"
      onClick={onClick}
      to={to}
    >
      {icon ? (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
          <AppIcon name={icon} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-black text-[color:var(--client-text)]">{title}</p>
        {description ? <p className="mt-1 text-[13px] leading-6 text-[color:var(--client-muted)]">{description}</p> : null}
      </div>
      <div className="shrink-0 text-sm font-black text-[color:var(--client-muted)]">{trailing ?? "›"}</div>
    </InteractiveWrapper>
  );
}

export function SurfacePanel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.05)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function EmptyStatePanel({
  title,
  caption,
  action
}: {
  title: ReactNode;
  caption: ReactNode;
  action?: ReactNode;
}) {
  return (
    <SurfacePanel className="py-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
        <AppIcon name="sparkles" />
      </div>
      <h3 className="mt-4 text-xl font-black text-[color:var(--client-text)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[color:var(--client-muted)]">{caption}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </SurfacePanel>
  );
}
