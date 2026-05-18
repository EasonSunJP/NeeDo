import { cn } from "../../lib/utils";

type AdminToggleSwitchProps = {
  checked: boolean;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  title?: string;
};

export function AdminToggleSwitch({
  checked,
  ariaLabel,
  className,
  disabled = false,
  onChange,
  title
}: AdminToggleSwitchProps) {
  const label = title ?? ariaLabel;
  const switchClassName = cn("needo-travel-toggle", checked ? "is-on" : "is-off", onChange && "is-interactive", className);
  const thumb = <span className="needo-travel-toggle-thumb" />;

  if (onChange) {
    return (
      <button
        aria-checked={checked}
        aria-disabled={disabled}
        aria-label={ariaLabel}
        className={switchClassName}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        title={label}
        type="button"
      >
        {thumb}
      </button>
    );
  }

  return (
    <span aria-label={ariaLabel} className={switchClassName} role="img" title={label}>
      {thumb}
    </span>
  );
}
