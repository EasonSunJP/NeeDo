import { useRef } from "react";
import { AppIcon } from "../client-ui/AppScaffold";
import {
  floatingHeaderSearchActionClassName,
  floatingHeaderSearchFieldClassName,
  floatingHeaderSearchIconClassName,
  floatingHeaderSearchInputClassName,
  floatingHeaderSearchRowClassName
} from "../mobile/FloatingHomeHeader";
import { cn } from "../../lib/utils";

type ScheduleSearchFieldProps = {
  ariaLabel?: string;
  className?: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  submitLabel?: string;
  value: string;
};

export function ScheduleSearchField({
  ariaLabel = "行程搜索",
  className,
  onChange,
  onSearch,
  placeholder = "行程搜索",
  submitLabel = "搜索",
  value
}: ScheduleSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submitSearch = () => {
    onSearch?.(value.trim());
    inputRef.current?.blur();
  };

  return (
    <form
      className={cn(floatingHeaderSearchRowClassName, className)}
      onSubmit={(event) => {
        event.preventDefault();
        submitSearch();
      }}
      role="search"
    >
      <div className={cn("focus-ring-within", floatingHeaderSearchFieldClassName)}>
        <AppIcon className={floatingHeaderSearchIconClassName} name="search" />
        <input
          aria-label={ariaLabel}
          autoComplete="off"
          className={floatingHeaderSearchInputClassName}
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
            className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-full text-[color:var(--client-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_48%,transparent)] hover:text-[color:var(--client-text)]"
            data-schedule-search-clear="true"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            type="button"
          >
            <AppIcon className="h-3.5 w-3.5" name="close" />
          </button>
        ) : null}
      </div>
      <button
        aria-label={submitLabel}
        className={floatingHeaderSearchActionClassName}
        data-schedule-search-submit="true"
        type="submit"
      >
        {submitLabel}
      </button>
    </form>
  );
}
