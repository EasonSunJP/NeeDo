import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../client-ui/AppScaffold";
import { cn } from "../../lib/utils";
import {
  floatingHeaderSearchActionClassName,
  floatingHeaderSearchFieldClassName,
  floatingHeaderSearchIconClassName,
  floatingHeaderSearchInputClassName,
  floatingHeaderSearchRowClassName,
  floatingHeaderSearchTextClassName
} from "./FloatingHomeHeader";

type FloatingHeaderSearchBarProps = {
  actionAriaLabel?: string;
  actionLabel?: ReactNode;
  className?: string;
  fieldAriaLabel?: string;
  fieldClassName?: string;
  inputId?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  placeholder: string;
  to?: string;
  value?: string;
};

export function FloatingHeaderSearchBar({
  actionAriaLabel,
  actionLabel = "搜索",
  className,
  fieldAriaLabel,
  fieldClassName,
  inputId,
  onChange,
  onSubmit,
  placeholder,
  to,
  value = ""
}: FloatingHeaderSearchBarProps) {
  if (to) {
    return (
      <div className={cn(floatingHeaderSearchRowClassName, className)}>
        <Link aria-label={fieldAriaLabel ?? placeholder} className={cn("focus-ring", floatingHeaderSearchFieldClassName, fieldClassName)} to={to}>
          <AppIcon className={floatingHeaderSearchIconClassName} name="search" />
          <span className={floatingHeaderSearchTextClassName}>{placeholder}</span>
        </Link>
        <Link aria-label={actionAriaLabel} className={floatingHeaderSearchActionClassName} to={to}>
          {actionLabel}
        </Link>
      </div>
    );
  }

  return (
    <form
      className={cn(floatingHeaderSearchRowClassName, className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <label className={cn(floatingHeaderSearchFieldClassName, fieldClassName)}>
        <span className="sr-only">{fieldAriaLabel ?? placeholder}</span>
        <AppIcon className={floatingHeaderSearchIconClassName} name="search" />
        <input
          className={floatingHeaderSearchInputClassName}
          id={inputId}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </label>
      <button aria-label={actionAriaLabel} className={floatingHeaderSearchActionClassName} type="submit">
        {actionLabel}
      </button>
    </form>
  );
}
