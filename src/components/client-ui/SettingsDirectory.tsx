import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { AppIcon, AppTopBar, PageScaffold, SurfacePanel, type IconName } from "./AppScaffold";
import type { MobileNavItem } from "../mobile/MobileShell";
import { TitleWithInfo } from "../ui/TitleWithInfo";

function combineTitleInfo(info?: ReactNode, subtitle?: ReactNode) {
  if (!subtitle) {
    return info;
  }

  if (!info) {
    return subtitle;
  }

  return (
    <div className="space-y-2">
      <div className="font-black text-[color:var(--client-text)]">{subtitle}</div>
      <div>{info}</div>
    </div>
  );
}

function InteractiveRow({
  children,
  to,
  onClick,
  className,
  dataNoI18n = false
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
  dataNoI18n?: boolean;
}) {
  if (to) {
    return (
      <Link className={className} data-no-i18n={dataNoI18n || undefined} to={to}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button className={className} data-no-i18n={dataNoI18n || undefined} onClick={onClick} type="button">
        {children}
      </button>
    );
  }

  return (
    <div className={className} data-no-i18n={dataNoI18n || undefined}>
      {children}
    </div>
  );
}

function SelectionIndicator({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
        active
          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-transparent text-transparent"
      )}
    >
      <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 12 12">
        <path d="m2.5 6 2.2 2.2L9.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    </span>
  );
}

export function SettingsHomePage({
  title,
  info,
  subtitle,
  actions,
  backTo,
  onBack,
  navItems,
  children,
  contentClassName
}: {
  title: ReactNode;
  info?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  navItems?: MobileNavItem[];
  children: ReactNode;
  contentClassName?: string;
}) {
  const titleInfo = combineTitleInfo(info, subtitle);

  return (
    <PageScaffold contentClassName={cn("space-y-5 pt-[calc(env(safe-area-inset-top)+5.75rem)]", contentClassName)} navItems={navItems}>
      <AppTopBar actions={actions} backTo={backTo} fixed info={titleInfo} onBack={onBack} title={title} />
      {children}
    </PageScaffold>
  );
}

export function SettingsDetailPage({
  title,
  info,
  subtitle,
  actions,
  backTo = "/me/settings",
  onBack,
  navItems,
  children,
  contentClassName
}: {
  title: ReactNode;
  info?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  navItems?: MobileNavItem[];
  children: ReactNode;
  contentClassName?: string;
}) {
  const navigate = useNavigate();
  const titleInfo = combineTitleInfo(info, subtitle);
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (typeof window !== "undefined" && typeof window.history.state?.idx === "number" && window.history.state.idx > 0) {
      navigate(-1);
      return;
    }

    navigate(backTo, { replace: true });
  };

  return (
    <PageScaffold contentClassName={cn("space-y-6 pt-[calc(env(safe-area-inset-top)+5.75rem)]", contentClassName)} navItems={navItems}>
      <AppTopBar actions={actions} fixed info={titleInfo} onBack={handleBack} title={title} />
      {children}
    </PageScaffold>
  );
}

export function SettingsSectionHeader({
  title,
  description,
  action,
  mode = "info"
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  mode?: "default" | "info";
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {mode === "info" ? (
          <TitleWithInfo
            as="h2"
            className="gap-2.5"
            info={description}
            infoClassName="h-5 w-5 text-[11px]"
            label={typeof title === "string" ? `查看${title}说明` : "查看模块说明"}
            title={title}
            titleClassName="text-[17px] font-black tracking-[-0.02em] text-[color:var(--client-text)]"
            variant="client"
          />
        ) : (
          <>
            <p className="text-[17px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">{title}</p>
            {description ? <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-muted)]">{description}</p> : null}
          </>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
  panelClassName,
  headerMode = "info"
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  headerMode?: "default" | "info";
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <SettingsSectionHeader action={action} description={description} mode={headerMode} title={title} />
      <SurfacePanel className={cn("overflow-hidden p-0", panelClassName)}>{children}</SurfacePanel>
    </section>
  );
}

export function SettingsValueText({
  children,
  tone = "default",
  className
}: {
  children?: ReactNode;
  tone?: "default" | "accent" | "muted";
  className?: string;
}) {
  if (!children) {
    return null;
  }

  return (
    <span
      className={cn(
        "max-w-[11rem] truncate text-right text-[13px] font-semibold",
        tone === "accent"
          ? "text-[color:var(--client-primary)]"
          : tone === "muted"
            ? "text-[color:var(--client-muted)]"
            : "text-[color:var(--client-text)]",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SettingsArrow({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4 text-[color:var(--client-muted)]", className)} fill="none" viewBox="0 0 20 20">
      <path d="m7 4.5 5.5 5.5L7 15.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function SettingsStatusBadge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black",
        tone === "accent"
          ? "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
          : "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-muted)]"
      )}
    >
      {children}
    </span>
  );
}

export function SettingsListItem({
  title,
  value,
  subtitle,
  icon,
  to,
  onClick,
  trailing,
  dataNoI18n = false
}: {
  title: ReactNode;
  value?: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  to?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  dataNoI18n?: boolean;
}) {
  const interactive = Boolean(to || onClick);

  return (
    <InteractiveRow
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition",
        interactive ? "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_6%,transparent)]" : ""
      )}
      dataNoI18n={dataNoI18n}
      onClick={onClick}
      to={to}
    >
      {icon ? (
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-primary)]">
          <AppIcon className="h-[18px] w-[18px]" name={icon} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-black text-[color:var(--client-text)]">{title}</p>
        {subtitle ? <p className="mt-0.5 truncate text-[12px] text-[color:var(--client-muted)]">{subtitle}</p> : null}
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <SettingsValueText>{value}</SettingsValueText>
        {trailing ?? (interactive ? <SettingsArrow /> : null)}
      </div>
    </InteractiveRow>
  );
}

export type SettingsRadioOption<T extends string> = {
  value: T;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  dataNoI18n?: boolean;
};

export function SettingsRadioListPage<T extends string>({
  title,
  info,
  subtitle,
  backTo,
  onBack,
  sectionTitle = "可选项",
  sectionDescription,
  options,
  value,
  onChange,
  footer,
  navItems,
  contentClassName
}: {
  title: ReactNode;
  info?: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  sectionTitle?: ReactNode;
  sectionDescription?: ReactNode;
  options: SettingsRadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  footer?: ReactNode;
  navItems?: MobileNavItem[];
  contentClassName?: string;
}) {
  return (
    <SettingsDetailPage backTo={backTo} contentClassName={contentClassName} info={info} navItems={navItems} onBack={onBack} subtitle={subtitle} title={title}>
      <SettingsSection description={sectionDescription} panelClassName="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]" title={sectionTitle}>
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              className={cn(
                "flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition",
                active ? "bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]" : "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_6%,transparent)]"
              )}
              data-no-i18n={option.dataNoI18n || undefined}
              key={String(option.value)}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-black text-[color:var(--client-text)]">{option.title}</p>
                {option.subtitle ? <p className="mt-0.5 truncate text-[12px] text-[color:var(--client-muted)]">{option.subtitle}</p> : null}
              </div>
              {option.meta ? <SettingsValueText className="max-w-[8rem]" tone="muted">{option.meta}</SettingsValueText> : null}
              <SelectionIndicator active={active} />
            </button>
          );
        })}
      </SettingsSection>
      {footer}
    </SettingsDetailPage>
  );
}

export const UnifiedSettingsHomePage = SettingsHomePage;
export const UnifiedSettingsSection = SettingsSection;
export const UnifiedSettingsListItem = SettingsListItem;
export const UnifiedSettingsStatusText = SettingsValueText;
export const UnifiedSettingsDetailPage = SettingsDetailPage;
export const UnifiedSettingsRadioListPage = SettingsRadioListPage;
