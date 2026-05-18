import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { CloseIconButton } from "./CloseIconButton";
import { cn } from "../../lib/utils";

const defaultDrawerWidthStorageKey = "needo.ui.drawer.width";
const defaultDrawerWidth = 720;
const defaultMinDrawerWidth = 420;
const defaultMaxDrawerWidth = 980;

function clampDrawerWidth(value: number, minWidth: number, maxWidth: number) {
  const viewportMax = typeof window === "undefined" ? maxWidth : Math.max(minWidth, Math.min(maxWidth, window.innerWidth - 24));

  return Math.min(Math.max(value, minWidth), viewportMax);
}

function getInitialDrawerWidth(storageKey: string, defaultWidth: number, minWidth: number, maxWidth: number) {
  if (typeof window === "undefined") {
    return defaultWidth;
  }

  let stored = 0;

  try {
    stored = Number(window.localStorage.getItem(storageKey));
  } catch {
    return clampDrawerWidth(defaultWidth, minWidth, maxWidth);
  }

  const preferredWidth = Number.isFinite(stored) && stored > 0 ? stored : defaultWidth;

  return clampDrawerWidth(preferredWidth, minWidth, maxWidth);
}

export function Drawer({
  open,
  title,
  children,
  footer,
  onClose,
  resizable = true,
  widthStorageKey = defaultDrawerWidthStorageKey,
  defaultWidth = defaultDrawerWidth,
  minWidth = defaultMinDrawerWidth,
  maxWidth = defaultMaxDrawerWidth
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  resizable?: boolean;
  widthStorageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}) {
  const [drawerWidth, setDrawerWidth] = useState(() => getInitialDrawerWidth(widthStorageKey, defaultWidth, minWidth, maxWidth));
  const [isResizing, setIsResizing] = useState(false);
  const resolvedWidth = useMemo(() => clampDrawerWidth(drawerWidth, minWidth, maxWidth), [drawerWidth, maxWidth, minWidth]);
  const panelStyle = {
    width: `min(${resolvedWidth}px, 100vw)`,
    maxWidth: "100vw"
  } satisfies CSSProperties;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setDrawerWidth(getInitialDrawerWidth(widthStorageKey, defaultWidth, minWidth, maxWidth));
  }, [defaultWidth, maxWidth, minWidth, widthStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(widthStorageKey, String(Math.round(resolvedWidth)));
    } catch {
      // Width persistence is a convenience; rendering should keep working if storage is unavailable.
    }
  }, [resolvedWidth, widthStorageKey]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!resizable) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  };

  const resizeDrawer = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isResizing) {
      return;
    }

    const nextWidth = window.innerWidth - event.clientX;
    setDrawerWidth(clampDrawerWidth(nextWidth, minWidth, maxWidth));
  };

  const stopResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isResizing) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsResizing(false);
  };

  return (
    <div className={cn("fixed inset-0 z-[80] transition", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div
        className={cn("absolute inset-0 bg-ink/35 transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />
      <aside
        className={cn(
          "drawer-panel absolute right-0 top-0 flex h-full w-full flex-col shadow-soft transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={panelStyle}
      >
        {resizable ? (
          <button
            aria-label="调整侧栏宽度"
            aria-orientation="vertical"
            aria-valuemax={maxWidth}
            aria-valuemin={minWidth}
            aria-valuenow={Math.round(resolvedWidth)}
            className={cn("drawer-resize-handle focus-ring hidden lg:block", isResizing && "is-resizing")}
            onPointerCancel={stopResize}
            onPointerDown={startResize}
            onPointerMove={resizeDrawer}
            onPointerUp={stopResize}
            role="separator"
            title="调整侧栏宽度"
            type="button"
          />
        ) : null}
        <header className="drawer-panel-header flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <CloseIconButton onClick={onClose} />
        </header>
        <div className="drawer-panel-body min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="drawer-panel-footer shrink-0 border-t border-line px-5 py-4">{footer}</footer> : null}
      </aside>
    </div>
  );
}
