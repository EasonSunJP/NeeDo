import { useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { SettingsDetailPage } from "../../components/client-ui/SettingsDirectory";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
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
  onBack,
  error,
  onDismissError,
  hideNavigation = false
}: {
  title: string;
  info: string;
  children: ReactNode;
  backTo?: string;
  onBack?: () => void;
  error?: string;
  onDismissError?: () => void;
  hideNavigation?: boolean;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);

  return (
    <SettingsDetailPage
      backTo={backTo}
      closeLabel={t("关闭")}
      closeTo="/me/settings/portal"
      contentClassName="pb-[calc(env(safe-area-inset-bottom)+10.5rem)]"
      headerFrameClassName="!z-[140]"
      headerOverlay={error ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-full max-w-[880px]">
          <div aria-atomic="true" className="pointer-events-auto flex items-start gap-3 rounded-[20px] border border-[color:var(--client-danger)] bg-[color:var(--client-surface)] px-4 py-3 text-sm font-semibold leading-6 text-[color:var(--client-text)] shadow-[0_12px_32px_rgba(0,0,0,0.2)]" role="alert">
            <span className="min-w-0 flex-1 break-words">{t(error)}</span>
            {onDismissError ? <button aria-label={t("关闭提示")} className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--client-muted)]" onClick={onDismissError} type="button"><AppIcon className="h-4 w-4" name="close" /></button> : null}
          </div>
        </div>
      ) : undefined}
      info={t(info)}
      navItems={hideNavigation ? [] : undefined}
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

export function ApplicationSection({ title, info, children, className }: {
  title: string;
  info?: string;
  children: ReactNode;
  className?: string;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  return (
    <ApplicationCard className={cn("space-y-4", className)}>
      <TitleWithInfo as="h2" info={info ? t(info) : undefined} label={t("申请分区说明：{title}").replace("{title}", t(title))} title={t(title)} titleClassName="text-[17px] font-black text-[color:var(--client-text)]" variant="client" />
      {children}
    </ApplicationCard>
  );
}

export function ApplicationFileUpload({ accept, file, label, onChange }: {
  accept: string;
  file: File | null;
  label: string;
  onChange: (file: File | null) => void;
}) {
  const { language } = useI18n();
  return (
    <label className="focus-ring flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 focus-within:border-[color:var(--client-primary)]">
      <span className="min-w-0 truncate text-sm font-bold text-[color:var(--client-text)]">{file?.name ?? label}</span>
      <span className="shrink-0 rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-xs font-black text-[color:var(--client-primary-contrast)]">{translateText("上传图片", language)}</span>
      <input accept={accept} aria-label={label} className="sr-only" onChange={(event) => onChange(event.target.files?.[0] ?? null)} type="file" />
    </label>
  );
}

export function ApplicationBottomAction({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] mx-auto w-full max-w-[880px] px-[var(--client-bottom-nav-inline-gap,12px)] pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-8">
      <div className="pointer-events-auto p-3">{children}</div>
    </div>
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

export function ApplicationField({ label, hint, required, children, as: Component = "label" }: { label: string; hint?: string; required?: boolean; children: ReactNode; as?: "label" | "div" }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  return (
    <Component className="block space-y-2">
      <span className="flex items-center gap-2 text-[13px] font-black text-[color:var(--client-text)]">
        {t(label)}
        <span className={cn("text-[10px]", required ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-muted)]")}>
          {required ? t("必填") : t("选填")}
        </span>
      </span>
      {children}
      {hint ? <span className="block text-[11px] leading-5 text-[color:var(--client-muted)]">{t(hint)}</span> : null}
    </Component>
  );
}

export function ApplicationReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div className="min-w-0 rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 py-3 text-left">
      <p className="text-[11px] font-black text-[color:var(--client-muted)]">{t(label)}</p>
      <p className="mt-1 break-words whitespace-pre-wrap text-sm font-bold text-[color:var(--client-text)]">{isEmpty ? "—" : value}</p>
    </div>
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
