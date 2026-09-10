import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export type ScheduleViewPickerOption<TValue extends string> = {
  label: string;
  value: TValue;
};

export function ScheduleViewPicker<TValue extends string>({
  ariaLabel,
  className,
  label = "显示",
  onChange,
  options,
  value,
  variant = "toolbar",
}: {
  ariaLabel: string;
  className?: string;
  label?: string;
  onChange: (value: TValue) => void;
  options: Array<ScheduleViewPickerOption<TValue>>;
  value: TValue;
  variant?: "toolbar" | "field";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;

    const closeFromOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div className={cn("relative min-w-0", className)} data-schedule-view-picker="true" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(
          "focus-ring relative flex w-full items-center justify-center border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3 text-[color:var(--client-text)] shadow-[0_10px_22px_rgba(0,0,0,0.08)]",
          variant === "field" ? "min-h-12 rounded-[18px]" : "h-9 rounded-full",
        )}
        data-schedule-picker-variant={variant}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {label ? <span className="absolute left-3 text-[11px] font-black text-[color:var(--client-muted)]">{label}</span> : null}
        <strong className={cn("absolute inset-x-10 truncate text-center font-black", variant === "field" ? "text-[15px]" : "text-[13px]")}>{selectedOption?.label}</strong>
        <span
          aria-hidden="true"
          className={cn("absolute right-3 text-[12px] font-black text-[color:var(--client-muted)] transition", open && "rotate-180")}
          data-schedule-picker-chevron="true"
        >
          ⌄
        </span>
      </button>

      {open ? (
        <div
          aria-label={ariaLabel}
          className="absolute inset-x-0 top-[calc(100%+8px)] z-[80] overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_98%,var(--client-elevated)_2%)] p-1.5 text-[color:var(--client-text)] shadow-[0_20px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          data-schedule-view-menu="true"
          role="menu"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                aria-checked={selected}
                className={cn(
                  "focus-ring flex h-10 w-full items-center justify-between rounded-[13px] px-3 text-left text-[13px] font-black transition",
                  selected
                    ? "bg-[color:color-mix(in_srgb,var(--client-primary)_18%,var(--client-elevated)_82%)] text-[color:var(--client-primary-strong)]"
                    : "text-[color:var(--client-text)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)]",
                )}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                role="menuitemradio"
                type="button"
              >
                <span>{option.label}</span>
                <span aria-hidden="true" className={cn("text-[color:var(--client-primary)]", !selected && "invisible")}>✓</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
