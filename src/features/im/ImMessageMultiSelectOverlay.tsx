import type { Language } from "../../i18n/translations";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { ImIcon } from "./components";
import { translateImUiText } from "./ui-copy";

export type ImMultiSelectAction = "copy" | "delete" | "favorite" | "forward";

export function ImMessageMultiSelectCircle({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full",
        checked
          ? "text-[color:var(--client-primary)]"
          : "text-[color:var(--client-muted)]",
      )}
      data-im-multiselect-control="true"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      role="checkbox"
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full border-2 text-[14px] font-black transition",
          checked
            ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
            : "border-[color:color-mix(in_srgb,var(--client-muted)_72%,transparent)] bg-transparent",
        )}
      >
        {checked ? "✓" : null}
      </span>
    </button>
  );
}

export function ImMessageMultiSelectOverlay({
  actionItems,
  deleteConfirmationOpen,
  deleteConfirmationText,
  language,
  notice,
  onCancel,
  onConfirmDelete,
  onCopy,
  onDelete,
  onDismissDeleteConfirmation,
  onFavorite,
  onForward,
  onSelectToPoint,
  pendingAction,
  recordActionsSupported,
  selectedCount,
  selectedCountText,
  showRangeControls = true,
}: {
  actionItems?: Array<{
    icon: "copy" | "delete" | "forward" | "top";
    key: ImMultiSelectAction;
    label: string;
    onClick: () => void;
  }>;
  deleteConfirmationOpen: boolean;
  deleteConfirmationText?: string;
  language: Language;
  notice: string | null;
  onCancel: () => void;
  onConfirmDelete: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDismissDeleteConfirmation: () => void;
  onFavorite: () => void;
  onForward: () => void;
  onSelectToPoint: (pointY: number) => void;
  pendingAction: ImMultiSelectAction | null;
  recordActionsSupported: boolean;
  selectedCount: number;
  selectedCountText?: string;
  showRangeControls?: boolean;
}) {
  const hereLabel = translateImUiText("选择到这里", language);
  const selectedCountLabel = selectedCountText ?? translateImUiText("已选择 {count} 条信息", language).replace("{count}", String(selectedCount));
  const deleteConfirmation = deleteConfirmationText ?? translateImUiText("将从你的聊天记录中删除 {count} 条信息，不影响对方。", language).replace("{count}", String(selectedCount));
  const disabled = selectedCount === 0 || pendingAction !== null;
  const unsupportedRecordNotice = !recordActionsSupported && selectedCount > 0
    ? translateImUiText("所选信息包含暂不支持转发或收藏的类型", language)
    : null;
  const actions = actionItems ?? [
    { icon: "forward" as const, key: "forward", label: "转发", onClick: onForward },
    { icon: "copy" as const, key: "copy", label: "复制", onClick: onCopy },
    { icon: "top" as const, key: "favorite", label: "收藏", onClick: onFavorite },
    { icon: "delete" as const, key: "delete", label: "删除", onClick: onDelete },
  ];

  const selectToButtonCenter = (element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    onSelectToPoint(rect.top + (rect.height / 2));
  };

  return (
    <>
      <header
        className="client-app-frame client-app-gutter fixed inset-x-0 top-0 z-[72] flex h-[calc(env(safe-area-inset-top)+62px)] items-end justify-between border-b border-[color:color-mix(in_srgb,var(--client-line)_52%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] pb-3"
      >
        <button
          className="focus-ring min-h-11 min-w-11 rounded-full px-2 text-sm font-black text-[color:var(--client-primary)]"
          data-im-multiselect-control="true"
          onClick={onCancel}
          type="button"
        >
          {translateText("取消", language)}
        </button>
        <p aria-atomic="true" aria-live="polite" className="pb-3 text-[15px] font-black text-[color:var(--client-text)]" data-im-multiselect-selected-count={selectedCount}>
          {selectedCountLabel}
        </p>
        <span aria-hidden="true" className="h-11 w-11" />
      </header>

      {showRangeControls ? (["upper", "lower"] as const).map((position) => (
        <button
          className={cn(
            "focus-ring fixed left-3 z-[71] min-h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)] shadow-[0_10px_28px_rgba(0,0,0,0.16)]",
            position === "upper"
              ? "top-[calc(env(safe-area-inset-top)+70px)]"
              : "bottom-[calc(env(safe-area-inset-bottom)+90px)]",
          )}
          data-im-multiselect-control="true"
          data-im-multiselect-range={position}
          key={position}
          onClick={(event) => selectToButtonCenter(event.currentTarget)}
          type="button"
        >
          {position === "upper" ? "↑" : "↓"} {hereLabel}
        </button>
      )) : null}

      <div
        className="client-liquid-glass-surface fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+8px)] z-[72] mx-auto grid max-w-[min(856px,calc(100vw-1.5rem))] gap-1 rounded-[24px] p-1.5"
        data-im-multiselect-action-bar="true"
        style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
      >
        {actions.map((action) => (
          <button
            aria-busy={pendingAction === action.key ? "true" : undefined}
            className="focus-ring flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[18px] px-1 py-1 text-[11px] font-black text-[color:var(--client-text)] disabled:cursor-not-allowed disabled:opacity-35"
            data-im-multiselect-control="true"
            data-im-multiselect-action={action.key}
            disabled={disabled || (!recordActionsSupported && (action.key === "forward" || action.key === "favorite"))}
            key={action.key}
            onClick={action.onClick}
            type="button"
          >
            <ImIcon className="h-5 w-5" name={action.icon} />
            <span className="mt-0.5">{translateImUiText(action.label, language)}</span>
          </button>
        ))}
      </div>

      {unsupportedRecordNotice ? (
        <p className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[73] mx-auto max-w-sm text-center text-xs font-bold text-[color:var(--client-muted)]" role="status">
          {unsupportedRecordNotice}
        </p>
      ) : null}

      {notice ? (
        <p
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[74] mx-auto max-w-sm rounded-2xl bg-[#202124]/95 px-4 py-3 text-center text-sm font-black text-white"
          role="alert"
        >
          {translateImUiText(notice, language)}
        </p>
      ) : null}

      {deleteConfirmationOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 px-5" role="presentation">
          <section
            aria-modal="true"
            className="client-liquid-glass-surface w-full max-w-sm rounded-[24px] p-5"
            role="dialog"
          >
            <p className="text-[15px] font-black leading-6 text-[color:var(--client-text)]">
              {deleteConfirmation}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button className="focus-ring min-h-11 rounded-full text-sm font-black" data-im-multiselect-control="true" disabled={pendingAction !== null} onClick={onDismissDeleteConfirmation} type="button">
                {translateText("取消", language)}
              </button>
              <button className="focus-ring min-h-11 rounded-full bg-[#ef4f3f] text-sm font-black text-white disabled:opacity-40" data-im-multiselect-control="true" disabled={pendingAction !== null} onClick={onConfirmDelete} type="button">
                {translateImUiText("删除", language)}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
