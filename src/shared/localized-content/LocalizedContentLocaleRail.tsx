import { cn } from "../../lib/utils";
import { registerTranslationEntries } from "../../i18n/translations";
import { contentLocales, type ContentLocale } from "./localizedText";

registerTranslationEntries({
  "当前语言已保存到草稿": { "zh-Hant": "目前語言已儲存至草稿", ja: "現在の言語を下書きに保存しました", en: "Current language saved to draft", ko: "현재 언어를 초안에 저장했습니다" },
  "同步到全部语言版本": { "zh-Hant": "同步到全部語言版本", ja: "すべての言語版に同期", en: "Copy to all language versions", ko: "모든 언어 버전에 복사" },
  "确认同步": { "zh-Hant": "確認同步", ja: "同期を確認", en: "Confirm copy", ko: "복사 확인" },
  "当前版本的文字会覆盖其他四个版本。": { "zh-Hant": "目前版本的文字會覆蓋其他四個版本。", ja: "現在の版のテキストで他の4つの版を上書きします。", en: "This text will replace the other four versions.", ko: "현재 버전의 텍스트가 다른 네 버전을 덮어씁니다." }
});

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
      className="fixed right-[calc(env(safe-area-inset-right,0px)+8px)] top-[58%] z-[70] flex w-14 -translate-y-1/2 flex-col gap-1.5 rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.3)] backdrop-blur"
      data-testid={testId}
    >
      <div aria-label={ariaLabel} className="flex max-h-[55dvh] w-full min-w-0 flex-col gap-1 overflow-y-auto" role="tablist">
        {contentLocales.map((item) => (
          <button
            aria-label={item.label}
            aria-pressed={locale === item.code}
            aria-selected={locale === item.code}
            className={cn(
              "focus-ring flex h-9 min-w-0 shrink-0 items-center justify-center rounded-[12px] px-1 text-[11px] font-black",
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
      {saveAction || syncAction ? <div className="flex w-full shrink-0 flex-col items-center justify-end gap-1 border-t border-[color:var(--client-line)] pt-1.5">
        {saveAction ? <button aria-label={saveAction.ariaLabel ?? saveAction.label} className="focus-ring w-full rounded-[12px] bg-[color:var(--client-primary)] px-1 py-2 text-[10px] font-black text-[color:var(--client-primary-ink)] disabled:opacity-45" disabled={saveAction.disabled} onClick={saveAction.onClick} type="button">{saveAction.label}</button> : null}
        {syncAction ? <button aria-label={syncAction.ariaLabel ?? syncAction.label} className="focus-ring rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-danger)_48%,transparent)] px-2 py-2 text-[10px] font-black text-[color:var(--client-danger)] disabled:opacity-45" disabled={syncAction.disabled} onClick={syncAction.onClick} type="button">{syncAction.label}</button> : null}
      </div> : null}
    </aside>
  );
}
