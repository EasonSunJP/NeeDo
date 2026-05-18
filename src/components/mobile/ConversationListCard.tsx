import { ConversationListItem } from "../ui/ConversationListItem";
import { cn } from "../../lib/utils";

type ConversationListCardProps = {
  avatar: string;
  name: string;
  meta: string;
  preview: string;
  unreadCount?: number;
  trailing?: string;
  dark?: boolean;
  className?: string;
};

export function ConversationListCard({
  avatar,
  name,
  meta,
  preview,
  unreadCount = 0,
  trailing,
  dark = false,
  className
}: ConversationListCardProps) {
  const metaClass = dark ? "text-[#f7ead0]/52" : "text-ink/50";
  const previewClass = dark ? "text-[#f7ead0]/36" : "text-ink/40";

  return (
    <ConversationListItem
      avatar={avatar}
      className={className}
      meta={meta}
      metaClassName={metaClass}
      preview={preview}
      previewClassName={cn("truncate text-xs", previewClass)}
      sideText={trailing}
      sideTextClassName={previewClass}
      title={name}
      unreadCount={unreadCount}
    />
  );
}
