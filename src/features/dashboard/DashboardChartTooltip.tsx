import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

type DashboardChartTooltipAnchor = {
  clientX: number;
  clientY: number;
  host: HTMLElement;
  index: number;
};

export type DashboardChartTooltipItem = {
  color: string;
  key: string;
  label: string;
  value: string;
};

function anchorFromElement(element: SVGElement, index: number): DashboardChartTooltipAnchor {
  const bounds = element.getBoundingClientRect();
  return {
    clientX: bounds.left + bounds.width / 2,
    clientY: bounds.top + bounds.height / 2,
    host: element.closest<HTMLElement>("[data-dashboard-tooltip-portal-host], .admin-shell, .merchant-admin-shell") ?? document.body,
    index
  };
}

function anchorFromMouseEvent(event: ReactMouseEvent<SVGElement>, index: number): DashboardChartTooltipAnchor {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    host: event.currentTarget.closest<HTMLElement>("[data-dashboard-tooltip-portal-host], .admin-shell, .merchant-admin-shell") ?? document.body,
    index
  };
}

export function useDashboardChartTooltip(bucketKey: string) {
  const [hovered, setHovered] = useState<DashboardChartTooltipAnchor | null>(null);
  const [selected, setSelected] = useState<DashboardChartTooltipAnchor | null>(null);

  useEffect(() => {
    setHovered(null);
    setSelected(null);
  }, [bucketKey]);

  return {
    active: selected ?? hovered,
    dismiss: () => {
      setHovered(null);
      setSelected(null);
    },
    hover: (index: number, event: ReactMouseEvent<SVGElement>) => {
      setHovered(anchorFromMouseEvent(event, index));
    },
    leave: () => setHovered(null),
    select: (index: number, event: ReactMouseEvent<SVGElement>) => {
      setSelected(anchorFromMouseEvent(event, index));
    },
    selectOnKeyboard: (index: number, event: ReactKeyboardEvent<SVGElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setSelected(anchorFromElement(event.currentTarget, index));
    }
  };
}

export function DashboardChartTooltip({
  anchor,
  closeLabel,
  items,
  label,
  onClose,
  variant = "admin"
}: {
  anchor: DashboardChartTooltipAnchor | null;
  closeLabel: string;
  items: DashboardChartTooltipItem[];
  label: string;
  onClose: () => void;
  variant?: "admin" | "client";
}) {
  if (!anchor || typeof document === "undefined") return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const x = Math.min(Math.max(anchor.clientX, 12), viewportWidth - 12);
  const y = Math.min(Math.max(anchor.clientY, 12), viewportHeight - 12);
  const transformX = x > viewportWidth - 240
    ? "translateX(calc(-100% - 12px))"
    : "translateX(12px)";
  const transformY = y < 150
    ? "translateY(12px)"
    : "translateY(calc(-100% - 12px))";

  return createPortal(
    <div
      aria-label={label}
      className={`fixed z-[320] min-w-44 max-w-[min(236px,calc(100vw-24px))] rounded-xl border p-3 text-xs font-bold shadow-[0_18px_38px_rgba(0,0,0,0.32)] ${variant === "client" ? "border-[color:var(--client-line)] bg-[color:var(--client-elevated)] text-[color:var(--client-text)]" : "border-line bg-white text-ink"}`}
      data-dashboard-point-detail="true"
      role="status"
      style={{
        left: x,
        top: y,
        transform: `${transformX} ${transformY}`
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <strong data-no-i18n>{label}</strong>
        <button
          aria-label={closeLabel}
          className={variant === "client" ? "rounded-md px-1.5 text-[color:var(--client-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]" : "rounded-md px-1.5 text-ink/45 hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"}
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li className="flex items-center justify-between gap-4" key={item.key}>
            <span className="inline-flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
              <span>{item.label}</span>
            </span>
            <span className="shrink-0" data-no-i18n>{item.value}</span>
          </li>
        ))}
      </ul>
    </div>,
    anchor.host
  );
}
