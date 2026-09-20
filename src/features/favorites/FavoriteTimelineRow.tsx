import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Language } from "../../i18n/translations";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  ImIcon,
  ImMessageActionSheet,
  SwipeActionRow,
  type ImMessageActionSheetItem,
} from "../im/components";
import { MessagePressable } from "../im/pages";
import type { UnifiedFavoriteItem } from "./model";

const typeLabels: Record<UnifiedFavoriteItem["type"], string> = {
  shop: "店铺",
  technician: "技师",
  service: "服务",
  social_post: "动态",
  chat_record: "聊天记录",
};

const localeByLanguage: Record<Language, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ja: "ja-JP",
  en: "en-US",
  ko: "ko-KR",
};

function formatTime(value: string, language: Language) {
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function FavoriteTimelineRow({
  busy,
  isNight = false,
  item,
  language,
  multiSelectActive = false,
  onDelete,
  onForward,
  onMultiSelect,
  onPin,
  onReact,
  onToggleSelected,
  selected = false,
}: {
  busy: boolean;
  isNight?: boolean;
  item: UnifiedFavoriteItem;
  language: Language;
  multiSelectActive?: boolean;
  onDelete: () => void;
  onForward: () => void;
  onMultiSelect: () => void;
  onPin: () => void;
  onReact: (reaction: string | null) => void;
  onToggleSelected?: () => void;
  selected?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionsExpanded, setReactionsExpanded] = useState(false);
  const pinLabel = translateText(item.pinnedAt ? "取消置顶" : "置顶", language);
  const menuPinLabel = translateText(
    item.pinnedAt ? "取消信息置顶" : "信息置顶",
    language,
  );

  const closeAndRun = (callback: () => void) => () => {
    setMenuOpen(false);
    callback();
  };
  const actions: ImMessageActionSheetItem[] = [
    {
      disabled: busy || !item.canForward,
      icon: "forward",
      key: "forward",
      label: translateText("转发", language),
      onClick: closeAndRun(onForward),
    },
    {
      disabled: busy,
      icon: "top",
      key: "pin",
      label: menuPinLabel,
      onClick: closeAndRun(onPin),
    },
    {
      disabled: busy || !item.canDelete,
      icon: "delete",
      key: "delete",
      label: translateText("删除", language),
      onClick: closeAndRun(onDelete),
      tone: "danger",
    },
    {
      disabled: busy,
      icon: "select",
      key: "multi-select",
      label: translateText("多选", language),
      onClick: closeAndRun(onMultiSelect),
    },
  ];

  const content = (
    <article
      aria-busy={busy ? "true" : undefined}
      className={cn(
        "relative flex min-h-[94px] items-center gap-3 border-b border-[color:color-mix(in_srgb,var(--client-line)_52%,transparent)] bg-[color:var(--client-bg)] px-1 py-3",
        selected && "bg-[color:color-mix(in_srgb,var(--client-primary)_9%,var(--client-bg)_91%)]",
      )}
      data-favorite-row={item.key}
    >
      {multiSelectActive ? (
        <button
          aria-checked={selected}
          aria-label={translateText(selected ? "取消选择" : "选择", language)}
          className={cn(
            "focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-full border-2",
            selected
              ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
              : "border-[color:var(--client-muted)]",
          )}
          data-im-multiselect-control="true"
          onClick={onToggleSelected}
          role="checkbox"
          type="button"
        >
          {selected ? "✓" : null}
        </button>
      ) : null}
      <Link
        aria-label={item.title}
        className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl"
        onClick={(event) => {
          if (!multiSelectActive) return;
          event.preventDefault();
          onToggleSelected?.();
        }}
        to={item.detailPath}
      >
        <div className="grid h-[70px] w-[92px] shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[color:var(--client-surface)] text-[color:var(--client-primary)]">
          {item.imageUrl ? (
            <img alt="" className="h-full w-full object-cover" src={item.imageUrl} />
          ) : (
            <ImIcon className="h-7 w-7" name={item.type === "service" ? "service" : item.type === "chat_record" ? "message" : "card"} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[15px] font-black leading-5 text-[color:var(--client-text)]">
              {item.title}
            </h3>
            <time className="shrink-0 text-[11px] font-bold text-[color:var(--client-muted)]" dateTime={item.activityAt}>
              {formatTime(item.activityAt, language)}
            </time>
          </div>
          {item.summary ? (
            <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-4 text-[color:var(--client-muted)]">
              {item.summary}
            </p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2 text-[11px] font-black text-[color:var(--client-muted)]">
            <span>{translateText(typeLabels[item.type], language)}</span>
            {item.pinnedAt ? <span>{translateText("置顶", language)}</span> : null}
            {item.reaction ? <span aria-label={translateText("快捷表情", language)}>{item.reaction}</span> : null}
          </div>
        </div>
      </Link>
    </article>
  );

  return (
    <>
      <SwipeActionRow
        actions={[
          { key: "pin", label: pinLabel, tone: "warning", onClick: onPin },
          { key: "delete", label: translateText("删除", language), tone: "danger", onClick: onDelete },
        ]}
        variant="flat-list"
      >
        <div ref={anchorRef}>
          <MessagePressable onOpenMenu={() => {
            if (!busy && !multiSelectActive) setMenuOpen(true);
          }}>
            {content}
          </MessagePressable>
        </div>
      </SwipeActionRow>
      {menuOpen ? (
        <ImMessageActionSheet
          actions={actions}
          anchorElement={anchorRef.current}
          expanded={reactionsExpanded}
          isNight={isNight}
          onClose={() => setMenuOpen(false)}
          onExpandedChange={setReactionsExpanded}
          onReact={(emoji) => {
            setMenuOpen(false);
            onReact(item.reaction === emoji ? null : emoji);
          }}
          selectedEmoji={item.reaction ?? undefined}
        />
      ) : null}
    </>
  );
}
