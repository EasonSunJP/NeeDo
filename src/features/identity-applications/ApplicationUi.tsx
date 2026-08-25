import { useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { SettingsDetailPage } from "../../components/client-ui/SettingsDirectory";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { identityApplicationsApi } from "./api";

const controlClassName =
  "min-h-12 w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_74%,transparent)] px-4 text-[15px] font-semibold text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]";

export function ApplicationShell({
  title,
  info,
  children,
  backTo = "/me/settings/portal",
  onBack
}: {
  title: string;
  info: string;
  children: ReactNode;
  backTo?: string;
  onBack?: () => void;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);

  return (
    <SettingsDetailPage
      backTo={backTo}
      closeLabel={t("关闭")}
      closeTo="/me/settings/portal"
      contentClassName="pb-[calc(env(safe-area-inset-bottom)+2rem)]"
      info={t(info)}
      navItems={undefined}
      onBack={onBack}
      title={t(title)}
    >
      {children}
    </SettingsDetailPage>
  );
}

export function ApplicationCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)] sm:p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

export function ApplicationSteps({ current, labels }: { current: number; labels: string[] }) {
  const { language } = useI18n();
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={translateText("申请进度", language)}>
      {labels.map((label, index) => (
        <li className="min-w-0" key={label}>
          <div className={cn("h-1.5 rounded-full", index <= current ? "bg-[color:var(--client-primary)]" : "bg-[color:var(--client-line)]")} />
          <p className={cn("mt-2 truncate text-center text-[11px] font-black", index === current ? "text-[color:var(--client-text)]" : "text-[color:var(--client-muted)]")}>
            {translateText(label, language)}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function ApplicationField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-[13px] font-black text-[color:var(--client-text)]">
        {t(label)}
        <span className={cn("text-[10px]", required ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-muted)]")}>
          {required ? t("必填") : t("选填")}
        </span>
      </span>
      {children}
      {hint ? <span className="block text-[11px] leading-5 text-[color:var(--client-muted)]">{t(hint)}</span> : null}
    </label>
  );
}

export function ApplicationInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClassName, props.className)} />;
}

export function ApplicationTextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlClassName, "min-h-28 resize-y py-3", props.className)} />;
}

export function ApplicationSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlClassName, props.className)} />;
}

export function ApplicationButton({ children, disabled = false, onClick, tone = "primary", type = "button", className }: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  tone?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-black transition",
        tone === "primary"
          ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_16px_36px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
          : tone === "danger"
            ? "bg-[color:var(--client-danger)] text-white"
            : "border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-[color:var(--client-text)]",
        disabled ? "cursor-not-allowed opacity-45" : "hover:-translate-y-0.5",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function ApplicationNotice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "error" | "success" }) {
  return (
    <div className={cn(
      "rounded-[20px] border px-4 py-3 text-[12px] font-semibold leading-6",
      tone === "error"
        ? "border-[color:color-mix(in_srgb,var(--client-danger)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--client-danger)_10%,transparent)] text-[color:var(--client-danger)]"
        : tone === "success"
          ? "border-[color:color-mix(in_srgb,var(--client-primary)_40%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-text)]"
          : "border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_80%,transparent)] text-[color:var(--client-muted)]"
    )}>
      {children}
    </div>
  );
}

export function ProtectedApplicationImage({ applicationId, mediaId, alt, className }: { applicationId: number; mediaId: number; alt: string; className?: string }) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    identityApplicationsApi.readMedia(applicationId, mediaId).then((dataUrl) => {
      if (active) setSource(dataUrl);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [applicationId, mediaId]);

  if (failed) {
    return <div className={cn("grid min-h-36 place-items-center rounded-[20px] bg-[color:var(--client-elevated)] text-xs font-bold text-[color:var(--client-muted)]", className)}>{alt}</div>;
  }

  return source ? <img alt={alt} className={cn("w-full rounded-[20px] object-cover", className)} src={source} /> : <div className={cn("min-h-36 animate-pulse rounded-[20px] bg-[color:var(--client-elevated)]", className)} />;
}
