import { cn } from "../../lib/utils";

type ToggleSwitchSize = "sm" | "md";

const sizeClasses: Record<ToggleSwitchSize, { root: string; knob: string; off: string; on: string }> = {
  sm: {
    root: "h-6 w-11",
    knob: "h-5 w-5",
    off: "translate-x-[2px]",
    on: "translate-x-[19px]"
  },
  md: {
    root: "h-8 w-14",
    knob: "h-6 w-6",
    off: "translate-x-1",
    on: "translate-x-7"
  }
};

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  size = "sm"
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  size?: ToggleSwitchSize;
}) {
  const classes = sizeClasses[size];

  return (
    <button
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex shrink-0 items-center overflow-hidden rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] p-0 transition",
        "disabled:cursor-not-allowed disabled:opacity-55",
        classes.root,
        className
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          "rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.22)] transition",
          classes.knob,
          checked ? cn(classes.on, "bg-[color:var(--client-primary)]") : cn(classes.off, "bg-white")
        )}
      />
    </button>
  );
}
