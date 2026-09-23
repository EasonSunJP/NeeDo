import { cn } from "../../lib/utils";
import { contentLocales, type ContentLocale } from "./localizedText";

type RailAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
};

export function LocalizedContentLocaleRail({
  locale,
  onSelect,
  saveAction,
  syncAction,
  testId,
  ariaLabel = "内容语言",
}: {
  locale: ContentLocale;
  onSelect: (locale: ContentLocale) => void;
  saveAction?: RailAction;
  syncAction?: RailAction;
  testId: string;
  ariaLabel?: string;
}) {
  return (
    <aside
      aria-label={ariaLabel}
      className="relative z-[70] mx-auto my-3 flex w-full max-w-full flex-col gap-1.5 rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.3)] backdrop-blur sm:fixed sm:right-2 sm:top-1/2 sm:my-0 sm:w-auto sm:-translate-y-1/2"
      data-testid={testId}
    >
      <div aria-label={ariaLabel} className="flex w-full min-w-0 gap-1 sm:max-h-[55dvh] sm:flex-col sm:overflow-y-auto" role="tablist">
        {contentLocales.map((item) => (
          <button
            aria-label={item.label}
            aria-pressed={locale === item.code}
            aria-selected={locale === item.code}
            className={cn(
              "focus-ring flex h-9 min-w-0 flex-1 items-center justify-center rounded-[12px] px-1 text-[11px] font-black sm:min-w-9 sm:px-2",
              locale === item.code
                ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-ink)]"
                : "text-[color:var(--client-muted)]"
            )}
            key={item.code}
            onClick={() => onSelect(item.code)}
            role="tab"
            title={item.label}
            type="button"
          >
            <span data-no-i18n>{item.shortLabel}</span>
          </button>
        ))}
      </div>
      {saveAction || syncAction ? <div className="flex w-full shrink-0 items-center justify-end gap-1 border-t border-[color:var(--client-line)] pt-1.5 sm:flex-col">
        {saveAction ? <button className="focus-ring rounded-[12px] bg-[color:var(--client-primary)] px-2 py-2 text-[10px] font-black text-[color:var(--client-primary-ink)] disabled:opacity-45" disabled={saveAction.disabled} onClick={saveAction.onClick} type="button">{saveAction.label}</button> : null}
        {syncAction ? <button aria-label={syncAction.ariaLabel ?? syncAction.label} className="focus-ring rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-danger)_48%,transparent)] px-2 py-2 text-[10px] font-black text-[color:var(--client-danger)] disabled:opacity-45" disabled={syncAction.disabled} onClick={syncAction.onClick} type="button">{syncAction.label}</button> : null}
      </div> : null}
    </aside>
  );
}
