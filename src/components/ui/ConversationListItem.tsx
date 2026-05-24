import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { AvatarImage } from "./AvatarImage";
import { NotificationBadge } from "./NotificationBadge";

type ConversationListItemProps = {
  avatar: string;
  title: string;
  meta?: ReactNode;
  preview?: ReactNode;
  sideText?: ReactNode;
  unreadCount?: number;
  avatarBadge?: ReactNode;
  avatarNode?: ReactNode;
  titleAccessory?: ReactNode;
  className?: string;
  avatarClassName?: string;
  avatarWrapClassName?: string;
  bodyClassName?: string;
  titleClassName?: string;
  metaClassName?: string;
  previewClassName?: string;
  sideWrapClassName?: string;
  sideTextClassName?: string;
};

function hasVisibleContent(value: ReactNode | undefined) {
  return value !== undefined && value !== null && value !== "";
}

export function ConversationListItem({
  avatar,
  title,
  meta,
  preview,
  sideText,
  unreadCount = 0,
  avatarBadge,
  avatarNode,
  titleAccessory,
  className,
  avatarClassName,
  avatarWrapClassName,
  bodyClassName,
  titleClassName,
  metaClassName,
  previewClassName,
  sideWrapClassName,
  sideTextClassName
}: ConversationListItemProps) {
  const hasSideColumn = hasVisibleContent(sideText) || unreadCount > 0;

  return (
    <div className={cn("grid items-start gap-3", hasSideColumn ? "grid-cols-[auto,minmax(0,1fr)_auto]" : "grid-cols-[auto,minmax(0,1fr)]", className)}>
      <div className={cn("relative shrink-0", avatarWrapClassName)}>
        {avatarNode ?? <AvatarImage alt={title} className={cn("h-12 w-12", avatarClassName)} src={avatar} />}
        {unreadCount > 0 ? <NotificationBadge className="absolute -right-1 -top-1" count={unreadCount} size="sm" /> : null}
        {avatarBadge}
      </div>

      <div className={cn("min-w-0", bodyClassName)}>
        <div className="flex min-w-0 items-center gap-1.5">
          <strong className={cn("min-w-0 flex-1 truncate text-sm font-black leading-[1.25] text-[color:var(--client-text)]", titleClassName)}>{title}</strong>
          {titleAccessory ? <span className="flex shrink-0 items-center gap-1.5">{titleAccessory}</span> : null}
        </div>
        {hasVisibleContent(meta) ? <div className={cn("mt-1 truncate text-xs text-[color:var(--client-muted)]", metaClassName)}>{meta}</div> : null}
        {hasVisibleContent(preview) ? <div className={cn("mt-1 min-w-0", previewClassName)}>{preview}</div> : null}
      </div>

      {hasSideColumn ? (
        <div className={cn("flex min-w-[56px] flex-col items-end gap-2 pt-0.5 text-right", sideWrapClassName)}>
          {hasVisibleContent(sideText) ? (
            <div className={cn("text-[11px] font-medium tabular-nums text-[color:var(--client-soft-muted)]", sideTextClassName)}>{sideText}</div>
          ) : null}
          {unreadCount > 0 ? <NotificationBadge count={unreadCount} size="sm" /> : null}
        </div>
      ) : null}
    </div>
  );
}
