import { useRef } from "react";
import { AppIcon } from "../client-ui/AppScaffold";
import { cn } from "../../lib/utils";
import { useClientTheme } from "../../theme/ClientThemeProvider";

type ScheduleSearchFieldProps = {
  ariaLabel?: string;
  className?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

export function ScheduleSearchField({
  ariaLabel = "行程搜索",
  className,
  onChange,
  placeholder = "行程搜索",
  value
}: ScheduleSearchFieldProps) {
  const { isNight } = useClientTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      className={cn(
        "focus-ring-within flex h-12 items-center gap-3 rounded-[20px] border px-3",
        isNight
          ? "border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_62%,var(--client-bg)_38%)] shadow-[0_18px_34px_rgba(0,0,0,0.22)]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] shadow-[0_12px_30px_rgba(0,0,0,0.07)]",
        className
      )}
      onSubmit={(event) => {
        event.preventDefault();
        inputRef.current?.blur();
      }}
      role="search"
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isNight
            ? "bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-bg)_88%)] text-[color:var(--client-primary)]"
            : "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
        )}
      >
        <AppIcon className="h-4 w-4" name="search" />
      </span>
      <input
        aria-label={ariaLabel}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-[15px] font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
        data-schedule-search-input="true"
        inputMode="search"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        role="searchbox"
        type="text"
        value={value}
      />
      {value ? (
        <button
          aria-label={`清空${ariaLabel}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] text-[color:var(--client-muted)] transition hover:text-[color:var(--client-text)]"
          data-schedule-search-clear="true"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          type="button"
        >
          <AppIcon className="h-4 w-4" name="close" />
        </button>
      ) : null}
    </form>
  );
}
