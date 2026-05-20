import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode
} from "react";
import { cn } from "../../lib/utils";

type InfoVariant = "client" | "paper" | "dark";
type InfoPanelMode = "tooltip" | "sheet";

const triggerVariantClassMap: Record<InfoVariant, string> = {
  client:
    "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-muted)] hover:text-[color:var(--client-text)]",
  paper:
    "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] text-[color:var(--client-muted)] hover:text-[color:var(--client-text)]",
  dark:
    "border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_20%,var(--client-surface)_80%)] text-[color:var(--client-primary)] hover:text-[color:var(--client-primary-strong)]"
};

const panelVariantClassMap: Record<InfoVariant, string> = {
  client:
    "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_96%,transparent)] text-[color:var(--client-text)] shadow-[0_18px_42px_rgba(0,0,0,0.18)] backdrop-blur-xl",
  paper:
    "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,var(--client-surface)_4%)] text-[color:var(--client-text)] shadow-panel",
  dark:
    "border-[color:color-mix(in_srgb,var(--client-primary)_34%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-primary)_12%)] text-[color:var(--client-text)] shadow-[0_18px_42px_rgba(0,0,0,0.34)] backdrop-blur-xl"
};

const sheetPanelVariantClassMap: Record<InfoVariant, string> = {
  client:
    "border-[color:color-mix(in_srgb,var(--client-primary)_22%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,white_8%)] text-[color:var(--client-text)] shadow-[0_24px_56px_rgba(0,0,0,0.24)] backdrop-blur-2xl",
  paper:
    "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,var(--client-surface)_4%)] text-[color:var(--client-text)] shadow-[0_20px_44px_rgba(22,23,26,0.12)] backdrop-blur-2xl",
  dark:
    "border-[color:color-mix(in_srgb,var(--client-primary)_38%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_90%,var(--client-primary)_10%)] text-[color:var(--client-text)] shadow-[0_24px_52px_rgba(0,0,0,0.44)] backdrop-blur-2xl"
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function InfoTooltipTrigger({
  content,
  label = "查看说明",
  variant = "client",
  panelMode = "tooltip",
  icon = "i",
  className,
  iconClassName,
  panelClassName
}: {
  content: ReactNode;
  label?: string;
  variant?: InfoVariant;
  panelMode?: InfoPanelMode;
  icon?: ReactNode;
  className?: string;
  iconClassName?: string;
  panelClassName?: string;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    placement: "bottom" as "top" | "bottom",
    ready: false
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;

      if (!trigger || !panel) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gap = panelMode === "sheet" ? 12 : 10;
      const viewportPadding = 12;
      const navPanel = trigger.closest(".client-shell")?.querySelector("[data-client-bottom-nav-panel]") as HTMLElement | null;
      const navPanelRect = navPanel?.getBoundingClientRect();
      const sheetWidth = navPanelRect
        ? Math.min(navPanelRect.width, viewportWidth - viewportPadding * 2)
        : Math.min(viewportWidth - viewportPadding * 2, 880);
      const panelWidth = panelMode === "sheet" ? sheetWidth : Math.min(panel.offsetWidth || 280, viewportWidth - viewportPadding * 2);

      // Apply the final sheet width before measuring height so the first open
      // uses the real wrapped layout instead of a transient 0px-wide panel.
      if (panelMode === "sheet") {
        panel.style.width = `${panelWidth}px`;
      } else {
        panel.style.removeProperty("width");
      }

      const panelHeight = panel.offsetHeight || 0;

      const hasBottomSpace = triggerRect.bottom + gap + panelHeight <= viewportHeight - viewportPadding;
      const left =
        panelMode === "sheet"
          ? clamp(navPanelRect?.left ?? (viewportWidth - panelWidth) / 2, viewportPadding, viewportWidth - panelWidth - viewportPadding)
          : clamp(
              triggerRect.left + triggerRect.width / 2 - panelWidth / 2,
              viewportPadding,
              viewportWidth - panelWidth - viewportPadding
            );
      const hasTopSpace = triggerRect.top - gap - panelHeight >= viewportPadding;
      const placement = panelMode === "sheet" ? "top" : hasBottomSpace || !hasTopSpace ? "bottom" : "top";
      const top =
        panelMode === "sheet"
          ? clamp(triggerRect.top - panelHeight - gap, viewportPadding, viewportHeight - panelHeight - viewportPadding)
          : placement === "bottom"
          ? clamp(triggerRect.bottom + gap, viewportPadding, viewportHeight - panelHeight - viewportPadding)
          : clamp(triggerRect.top - panelHeight - gap, viewportPadding, viewportHeight - panelHeight - viewportPadding);

      setPosition({ top, left, width: panelWidth, placement, ready: true });
    };

    setPosition((current) => ({ ...current, ready: false, width: current.width }));
    const frame = window.requestAnimationFrame(updatePosition);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, panelMode]);

  const portalHost =
    (triggerRef.current?.closest("[data-info-tooltip-portal-host], .client-shell, .merchant-admin-shell, .admin-shell") as HTMLElement | null) ??
    (typeof document !== "undefined" ? document.body : null);

  return (
    <>
      <button
        aria-controls={open ? tooltipId : undefined}
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "focus-ring inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-black leading-none transition",
          triggerVariantClassMap[variant],
          className
        )}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        <span className={cn("translate-y-[-0.5px]", iconClassName)}>{icon}</span>
      </button>

      {open && portalHost
        ? createPortal(
            <div
              aria-label={label}
              className={cn(
                panelMode === "sheet"
                  ? "fixed z-[120] max-h-[calc(100vh-24px)] overflow-y-auto rounded-[28px] border px-5 py-4 text-[14px] font-medium leading-6"
                  : "fixed z-[120] max-h-[calc(100vh-24px)] max-w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-[18px] border px-3.5 py-3 text-[13px] leading-6",
                panelMode === "sheet" ? sheetPanelVariantClassMap[variant] : panelVariantClassMap[variant],
                position.placement === "top" ? "origin-bottom" : "origin-top",
                panelClassName
              )}
              id={tooltipId}
              ref={panelRef}
              role="dialog"
              style={{
                top: position.top,
                left: position.left,
                width: panelMode === "sheet" ? `${position.width}px` : undefined,
                visibility: position.ready ? "visible" : "hidden"
              }}
            >
              {content}
            </div>,
            portalHost
          )
        : null}
    </>
  );
}

export function TitleWithInfo({
  title,
  info,
  label,
  as: Component = "div",
  variant = "client",
  infoIcon = "i",
  infoPanelMode,
  className,
  titleClassName,
  infoClassName,
  infoPanelClassName
}: {
  title: ReactNode;
  info?: ReactNode;
  label?: string;
  as?: ElementType;
  variant?: InfoVariant;
  infoIcon?: ReactNode;
  infoPanelMode?: InfoPanelMode;
  className?: string;
  titleClassName?: string;
  infoClassName?: string;
  infoPanelClassName?: string;
}) {
  const resolvedPanelMode = infoPanelMode ?? "sheet";

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Component className={cn("min-w-0", titleClassName)}>{title}</Component>
      {info ? (
        <InfoTooltipTrigger
          className={infoClassName}
          content={info}
          icon={infoIcon}
          label={label}
          panelMode={resolvedPanelMode}
          panelClassName={infoPanelClassName}
          variant={variant}
        />
      ) : null}
    </div>
  );
}
