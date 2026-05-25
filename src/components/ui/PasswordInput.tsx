import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "type"> & {
  hidePasswordLabel?: string;
  inputClassName?: string;
  prefix?: ReactNode;
  showPasswordLabel?: string;
  toggleClassName?: string;
  wrapperClassName?: string;
};

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
      {visible ? <path d="M4 20 20 4" /> : null}
    </svg>
  );
}

export function PasswordInput({
  autoComplete = "current-password",
  disabled,
  hidePasswordLabel = "Hide password",
  id,
  inputClassName,
  prefix,
  showPasswordLabel = "Show password",
  toggleClassName,
  wrapperClassName,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? hidePasswordLabel : showPasswordLabel;

  return (
    <div className={cn("relative", wrapperClassName)}>
      {prefix}
      <input
        {...props}
        autoComplete={autoComplete}
        className={inputClassName}
        disabled={disabled}
        id={inputId}
        type={visible ? "text" : "password"}
      />
      <button
        aria-controls={inputId}
        aria-label={toggleLabel}
        aria-pressed={visible}
        className={cn(
          "absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-current opacity-60 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current/20 disabled:cursor-not-allowed disabled:opacity-30",
          toggleClassName
        )}
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        <PasswordVisibilityIcon visible={visible} />
      </button>
    </div>
  );
}
