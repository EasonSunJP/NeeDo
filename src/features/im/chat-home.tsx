import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { InteractiveAvatar } from "../../components/ui/InteractiveAvatar";
import { NotificationBadge } from "../../components/ui/NotificationBadge";
import { useI18n } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { useClientTheme } from "../../theme/ClientThemeProvider";
import type { Conversation, ImRoleType } from "./model";
import { ImIcon, PrivateConversationTitle, SwipeActionRow } from "./components";

type UnifiedConversationPreview = {
  text: string;
  isDraft?: boolean;
};

type UnifiedSwipeAction = {
  key: string;
  label: string;
  tone: "neutral" | "warning" | "danger";
  width?: number;
  onClick: () => void;
};

export function UnifiedChatHomePage({
  roleType,
  title,
  actions,
  searchBar,
  children
}: {
  roleType: ImRoleType;
  title: ReactNode;
  actions?: ReactNode;
  searchBar: ReactNode;
  children: ReactNode;
}) {
  const titleNode = typeof title === "string" ? <h1 className="truncate text-[29px] font-semibold tracking-[-0.05em] text-[color:var(--client-text)]">{title}</h1> : title;

  return (
    <div
      className="relative min-h-[calc(100dvh-88px)] overflow-hidden bg-transparent"
      data-role-type={roleType}
    >
      <div className="fixed inset-x-0 top-0 z-40 mx-auto w-full max-w-[880px]">
        <header className="safe-header-top border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] backdrop-blur-xl">
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">{titleNode}</div>
              {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
            <div className="mt-4">{searchBar}</div>
          </div>
        </header>
      </div>

      <div
        className="relative z-10 px-5 pb-6"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 9.25rem)"
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function UnifiedChatHeaderAction({
  label,
  onClick,
  children
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_54%,var(--client-bg)_46%)] text-[color:var(--client-text)] transition-transform active:scale-[0.98]"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function UnifiedConversationSearchBar({
  to,
  placeholder,
  onClick
}: {
  to?: string;
  placeholder: string;
  onClick?: () => void;
}) {
  const content = (
    <span className="flex h-12 w-full items-center gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_46%,var(--client-bg)_54%)] px-4 text-[14px] text-[color:var(--client-muted)]">
      <ImIcon className="h-4 w-4 text-[color:var(--client-soft-muted)]" name="search" />
      <span className="truncate">{placeholder}</span>
    </span>
  );

  if (to) {
    return <Link to={to}>{content}</Link>;
  }

  return (
    <button className="w-full text-left" onClick={onClick} type="button">
      {content}
    </button>
  );
}

export function UnifiedConversationList({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function UnifiedPinnedConversationToggle({
  collapsed,
  count,
  onClick
}: {
  collapsed: boolean;
  count: number;
  onClick: () => void;
}) {
  const { isNight } = useClientTheme();

  return (
    <button
      aria-expanded={!collapsed}
      className="mb-2 flex w-full items-center gap-3 rounded-full bg-[color:color-mix(in_srgb,var(--client-warm)_6%,var(--client-surface)_94%)] px-4 py-2.5 text-left text-[color:var(--client-text)] transition-colors active:bg-[color:color-mix(in_srgb,var(--client-warm)_10%,var(--client-surface)_90%)]"
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
        <ImIcon className={cn("h-4.5 w-4.5", isNight ? "text-[#43a07b]" : "text-[color:var(--client-accent-text)]")} name="pin" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.01em]">置顶信息</span>
      <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--client-warm)_10%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--client-soft-muted)]">
        {count}
      </span>
    </button>
  );
}

export function UnifiedPinnedConversationDivider({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative mb-1 mt-1 h-8">
      <div className="absolute inset-x-0 top-1/2 border-b border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)]" />
      <button
        aria-label="收起置顶信息"
        className="absolute left-1/2 top-1/2 inline-flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[color:var(--client-bg)] ring-4 ring-[color:var(--client-bg)] transition-transform active:scale-[0.97]"
        onClick={onClick}
        type="button"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--client-soft-muted)]" />
      </button>
    </div>
  );
}

export function UnifiedConversationItem({
  avatar,
  title,
  preview,
  time,
  unreadCount,
  muted,
  pinned,
  group,
  privacyMode,
  mention,
  conversationType,
  actions,
  showDivider = true,
  to,
  onClick,
  avatarTo
}: {
  avatar: string;
  title: string;
  preview: UnifiedConversationPreview;
  time: string;
  unreadCount: number;
  muted?: boolean;
  pinned?: boolean;
  group?: boolean;
  privacyMode?: boolean;
  mention?: string;
  conversationType?: Conversation["type"];
  actions?: UnifiedSwipeAction[];
  showDivider?: boolean;
  to?: string;
  onClick?: () => void;
  avatarTo?: string;
}) {
  const { language } = useI18n();
  const groupBadgeLabel = language === "zh" || language === "zh-Hant" ? "群" : "Group";
  const compactGroupBadge = groupBadgeLabel !== "群";
  const summary = (
    <div className={cn("relative min-w-0 flex-1", pinned ? "pr-[112px]" : "pr-[74px]", unreadCount > 0 ? "pb-1.5" : "")}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <strong className="flex min-w-0 flex-1 items-center text-[17px] font-semibold leading-6 text-[color:var(--client-text)]">
            <PrivateConversationTitle privateMode={privacyMode} title={title} />
          </strong>
          {muted ? <ImIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--client-soft-muted)]" name="mute" /> : null}
        </div>
        <div className="mt-1 min-w-0">
          <UnifiedConversationPreviewText conversationType={conversationType} mention={mention} preview={preview} />
        </div>
      </div>
      <div className={cn("absolute right-0 top-0 flex flex-col items-end gap-2 pt-0.5 text-right", pinned ? "w-[106px]" : "w-[68px]")}>
        <div className="flex min-h-5 max-w-full items-center justify-end gap-1">
          {pinned ? (
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
            >
              <ImIcon className="h-4 w-4" name="pin" />
            </span>
          ) : null}
          <div className="whitespace-nowrap text-[12px] font-medium tabular-nums text-[color:var(--client-soft-muted)]">{time}</div>
        </div>
        {unreadCount > 0 ? <NotificationBadge count={unreadCount} size="sm" /> : null}
      </div>
    </div>
  );

  const body = to ? (
    <Link className="block min-w-0 flex-1" to={to}>
      {summary}
    </Link>
  ) : (
    <button className="block min-w-0 flex-1 text-left" onClick={onClick} type="button">
      {summary}
    </button>
  );

  const content = (
    <div className="w-full">
      <div className="py-3.5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <InteractiveAvatar
              alt={title}
              className="h-14 w-14 border border-[color:color-mix(in_srgb,var(--client-line)_40%,transparent)]"
              src={avatar}
              stopPropagation
              to={avatarTo}
            />
            {group ? (
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 inline-flex h-[18px] items-center justify-center rounded-full border border-[color:var(--client-bg)] bg-[color:color-mix(in_srgb,var(--client-primary)_88%,white_12%)] text-[color:var(--client-needo-text)]",
                  compactGroupBadge ? "w-[34px] px-0" : "px-1.5"
                )}
              >
                <span
                  className={cn(
                    "block font-black leading-none",
                    compactGroupBadge
                      ? "origin-center scale-x-[0.9] text-[8.5px] tracking-[-0.08em]"
                      : "text-[9px] tracking-normal"
                  )}
                  data-no-i18n
                >
                  {groupBadgeLabel}
                </span>
              </span>
            ) : null}
          </div>

          {body}
        </div>
      </div>

      {showDivider ? <div className="ml-[68px] border-b border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)]" /> : null}
    </div>
  );

  if (actions && actions.length > 0) {
    return (
      <SwipeActionRow actions={actions} variant="flat-list">
        {content}
      </SwipeActionRow>
    );
  }

  return content;
}

export function UnifiedConversationPreviewText({
  preview,
  mention,
  conversationType
}: {
  preview: UnifiedConversationPreview;
  mention?: string;
  conversationType?: Conversation["type"];
}) {
  const text = preview.text || "暂无消息";
  const isLink = /^https?:\/\//i.test(text);
  const isMetaText = conversationType === "system" || /(撤回了一条消息|changed|left\b|语音通话|视频通话|系统消息)/i.test(text);

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[14px] leading-5">
      {preview.isDraft ? <span className="shrink-0 font-medium text-[color:var(--client-accent)]">草稿</span> : null}
      {mention ? (
        <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--client-accent)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--client-accent)]">
          {mention}
        </span>
      ) : null}
      <p
        className={cn(
          "truncate",
          preview.isDraft
            ? "text-[color:var(--client-accent)]"
            : isLink
              ? "text-[color:color-mix(in_srgb,var(--client-primary)_70%,var(--client-text)_30%)]"
              : isMetaText
                ? "text-[color:var(--client-soft-muted)]"
                : "text-[color:var(--client-muted)]"
        )}
      >
        {text}
      </p>
    </div>
  );
}
