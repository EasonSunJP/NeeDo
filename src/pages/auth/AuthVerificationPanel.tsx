import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { VerificationChallengePayload } from "../../api/auth";
import { cn } from "../../lib/utils";

export type AuthVerificationLabels = {
  back: string;
  codeLabel: string;
  cooldown: (seconds: number) => string;
  destination: (maskedEmail: string) => string;
  eyebrow: string;
  expired: string;
  expires: (seconds: number) => string;
  invalidLength: string;
  resend: string;
  submit: string;
  submitting: string;
  title: string;
};

type AuthVerificationPanelProps = {
  attemptFeedback?: string;
  challenge: VerificationChallengePayload;
  error?: string;
  labels: AuthVerificationLabels;
  onBack: () => void;
  onResend: () => Promise<void> | void;
  onSubmit: (otp: string) => Promise<void> | void;
  pending?: boolean;
};

function normalizeOtp(value: string) {
  return value.replace(/\D/gu, "").slice(0, 6);
}

export function AuthVerificationPanel({
  attemptFeedback,
  challenge,
  error,
  labels,
  onBack,
  onResend,
  onSubmit,
  pending = false,
}: AuthVerificationPanelProps) {
  const [otp, setOtp] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(challenge.expiresIn);
  const [cooldownSeconds, setCooldownSeconds] = useState(
    challenge.cooldownSeconds,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const errorId = useId();
  const expired = remainingSeconds <= 0;

  useEffect(() => {
    setOtp("");
    setRemainingSeconds(challenge.expiresIn);
    setCooldownSeconds(challenge.cooldownSeconds);
    inputRef.current?.focus();
  }, [challenge.challengeId, challenge.cooldownSeconds, challenge.expiresIn]);

  useEffect(() => {
    if (remainingSeconds <= 0 && cooldownSeconds <= 0) {
      return;
    }

    const timer = globalThis.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1_000);

    return () => globalThis.clearInterval(timer);
  }, [cooldownSeconds > 0, remainingSeconds > 0]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pending || expired || otp.length !== 6) {
      return;
    }

    void onSubmit(otp);
  };

  return (
    <form
      className="space-y-5 text-left"
      data-testid="auth-verification-panel"
      onSubmit={handleSubmit}
    >
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">
          {labels.eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-normal text-[color:var(--client-text)]">
          {labels.title}
        </h2>
        <p
          className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]"
          id={descriptionId}
        >
          {labels.destination(challenge.maskedEmail)}
        </p>
      </div>

      <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-primary)_32%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_7%,var(--client-surface))] p-4 shadow-[var(--client-shadow)]">
        <label
          className="block text-sm font-black text-[color:var(--client-muted)]"
          htmlFor={`${descriptionId}-code`}
        >
          {labels.codeLabel}
        </label>
        <div
          className={cn(
            "group relative mt-3 grid grid-cols-6 gap-2 rounded-[14px] focus-within:outline-none focus-within:ring-2 focus-within:ring-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)]",
            expired && "opacity-60",
          )}
          onClick={() => inputRef.current?.focus()}
        >
          <input
            aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(error)}
            aria-label={labels.codeLabel}
            autoComplete="one-time-code"
            className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
            data-testid="auth-verification-code"
            disabled={pending || expired}
            id={`${descriptionId}-code`}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setOtp(normalizeOtp(event.target.value))}
            pattern="[0-9]*"
            ref={inputRef}
            type="text"
            value={otp}
          />
          {Array.from({ length: 6 }, (_, index) => (
            <span
              aria-hidden="true"
              className={cn(
                "flex h-14 min-w-0 items-center justify-center rounded-[10px] border bg-[color:var(--client-surface)] font-mono text-xl font-black tabular-nums text-[color:var(--client-text)] transition-colors",
                index === otp.length && !expired
                  ? "border-[color:var(--client-primary)]"
                  : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)]",
              )}
              key={index}
            >
              {otp[index] ?? ""}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold leading-5">
          <span
            className={
              expired
                ? "text-[color:var(--client-accent)]"
                : "text-[color:var(--client-muted)]"
            }
          >
            {expired ? labels.expired : labels.expires(remainingSeconds)}
          </span>
          <span className="text-[color:var(--client-soft-muted)]">
            {cooldownSeconds > 0
              ? labels.cooldown(cooldownSeconds)
              : attemptFeedback}
          </span>
        </div>
      </div>

      {attemptFeedback && cooldownSeconds > 0 ? (
        <p className="text-xs font-semibold leading-5 text-[color:var(--client-muted)]">
          {attemptFeedback}
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-accent)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-accent)_10%,var(--client-bg))] px-4 py-3 text-sm font-bold leading-5 text-[color:var(--client-accent)]"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        className="h-14 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-base font-black text-[color:var(--client-needo-text)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="auth-verification-submit"
        disabled={pending || expired || otp.length !== 6}
        type="submit"
      >
        {pending ? labels.submitting : labels.submit}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          className="min-h-11 rounded-full px-4 text-sm font-black text-[color:var(--client-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="auth-verification-back"
          disabled={pending}
          onClick={onBack}
          type="button"
        >
          {labels.back}
        </button>
        <button
          className="min-h-11 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-black text-[color:var(--client-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="auth-verification-resend"
          disabled={pending || cooldownSeconds > 0}
          onClick={() => void onResend()}
          type="button"
        >
          {cooldownSeconds > 0
            ? labels.cooldown(cooldownSeconds)
            : labels.resend}
        </button>
      </div>
    </form>
  );
}
