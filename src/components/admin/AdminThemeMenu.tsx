import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { getAdminThemeOption, platformAdminThemeOptions, type AdminTheme, type AdminThemeOption } from "../../theme/AdminTheme";

type AdminThemeMenuProps = {
  theme: AdminTheme;
  onThemeChange: (theme: AdminTheme) => void;
  align?: "left" | "right";
  options?: readonly AdminThemeOption[];
};

function PaletteIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M12.2 4.2a7.9 7.9 0 0 0-8 7.8 7.6 7.6 0 0 0 7.6 7.8h1.1a1.8 1.8 0 0 0 1.2-3.1 1.4 1.4 0 0 1 1-2.4h1.7a3.2 3.2 0 0 0 3.2-3.3c0-3.7-3.3-6.8-7.8-6.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M7.9 11.2h.01M10.1 7.9h.01M14.4 8.1h.01M16.7 11.2h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.7" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4 transition", open && "rotate-180")} fill="none" viewBox="0 0 24 24">
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="m5 12.4 4.2 4.1L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
    </svg>
  );
}

export function AdminThemeMenu({ theme, onThemeChange, align = "right", options = platformAdminThemeOptions }: AdminThemeMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const currentTheme = getAdminThemeOption(theme, options);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="admin-theme-menu relative shrink-0" ref={rootRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`选择后台 UI 主题，当前为${currentTheme.label}`}
        className="admin-theme-menu-trigger focus-ring h-10 w-[128px] shrink-0 text-left transition"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="admin-theme-trigger-content flex h-full items-center gap-2 px-3">
          <span className="admin-theme-trigger-icon grid h-7 w-7 shrink-0 place-items-center" aria-hidden="true">
            <PaletteIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase leading-none">UI</span>
            <span className="mt-0.5 block truncate text-xs font-black leading-4">{currentTheme.shortLabel}</span>
          </span>
          <ChevronIcon open={open} />
        </span>
      </button>

      {open ? (
        <div
          className={cn(
            "admin-theme-menu-panel absolute top-[calc(100%+10px)] z-[90] w-72 overflow-hidden rounded-lg border p-2 shadow-panel",
            align === "right" ? "right-0" : "left-0"
          )}
          id={menuId}
          role="menu"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="text-[11px] font-black uppercase tracking-[0.14em]">后台 UI 主题</p>
          </div>
          <div className="space-y-1">
            {options.map((item) => {
              const active = item.id === theme;

              return (
                <button
                  aria-checked={active}
                  className={cn("admin-theme-menu-option focus-ring flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition", active && "is-active")}
                  key={item.id}
                  onClick={() => {
                    onThemeChange(item.id);
                    setOpen(false);
                  }}
                  role="menuitemradio"
                  type="button"
                >
                  <span className="admin-theme-menu-swatches flex h-8 w-12 shrink-0 overflow-hidden rounded-md border" aria-hidden="true">
                    {item.swatches.map((swatch) => (
                      <span className="min-w-0 flex-1" key={swatch} style={{ backgroundColor: swatch }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold">{item.caption}</span>
                  </span>
                  <span className="admin-theme-menu-check grid h-6 w-6 shrink-0 place-items-center rounded-md">{active ? <CheckIcon /> : null}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
