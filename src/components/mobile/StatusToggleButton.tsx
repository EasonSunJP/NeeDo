import { cn } from "../../lib/utils";

export function StatusToggleButton({
  checked,
  onClick,
  className
}: {
  checked: boolean;
  onClick: () => void;
  className?: string;
}) {
  const label = checked ? "ON" : "OFF";

  return (
    <button
      aria-pressed={checked}
      aria-label={label}
      data-state={checked ? "on" : "off"}
      className={cn(
        "min-w-[96px] rounded-full px-4 py-2 text-sm font-black text-white transition",
        checked ? "bg-green-600 hover:bg-green-500" : "bg-red-500 hover:bg-red-400",
        className
      )}
      onClick={onClick}
      type="button"
    >
      <span key={label}>{label}</span>
    </button>
  );
}
