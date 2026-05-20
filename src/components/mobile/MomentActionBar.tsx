import { cn } from "../../lib/utils";
import { ShareNetworkIcon } from "../ui/ShareNetworkIcon";

function MomentActionIcon({ name }: { name: "like" | "reply" | "translate" | "forward" }) {
  if (name === "like") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M7.5 20H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.5M7.5 20V9.2L11.3 3c1.4.2 2.3 1.5 2 2.9L12.8 9H18a3 3 0 0 1 2.9 3.6l-1.1 5.2A3 3 0 0 1 16.9 20H7.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "reply") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M5 6.5h14v9.5H9l-4 3V6.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M8.5 10h7M8.5 13h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "translate") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M5 6.5h9M8 6.5c0 5-1.6 8.4-4 11M9.5 11c1 2.3 2.7 4.6 5.2 6.6M13.5 6.5h5.5M17 4v15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  return <ShareNetworkIcon className="h-4 w-4" />;
}

type MomentActionBarProps = {
  dark?: boolean;
  tone?: "default" | "client";
  bordered?: boolean;
  liked: boolean;
  likeCount: number;
  replyCount: number;
  translated?: boolean;
  onLike: () => void;
  onReply: () => void;
  onTranslate?: () => void;
  onForward: () => void;
};

export function MomentActionBar({
  dark = false,
  tone = "default",
  bordered = true,
  liked,
  likeCount,
  replyCount,
  translated,
  onLike,
  onReply,
  onTranslate,
  onForward
}: MomentActionBarProps) {
  const actionClass =
    tone === "client"
      ? "text-[color:color-mix(in_srgb,var(--client-muted)_86%,transparent)] hover:text-[color:var(--client-text)]"
      : dark
        ? "text-[#f7ead0]/54 hover:text-[#f3cf78]"
        : "text-ink/45 hover:text-ink";

  return (
    <div
      className={cn(
        "flex items-center justify-between",
        bordered ? cn("mt-4 border-t pt-3", dark ? "border-[#2e2417]" : "border-line/80") : "mt-0 pt-0"
      )}
    >
      <button className={cn("inline-flex items-center gap-1.5 text-xs font-bold transition", actionClass, liked && (dark ? "text-[#f3cf78]" : "text-coral"))} onClick={onLike} type="button">
        <MomentActionIcon name="like" />
        <span>{likeCount}</span>
      </button>
      <button className={cn("inline-flex items-center gap-1.5 text-xs font-bold transition", actionClass)} onClick={onReply} type="button">
        <MomentActionIcon name="reply" />
        <span>{replyCount}</span>
      </button>
      {onTranslate ? (
        <button
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-bold transition",
            actionClass,
            translated && (tone === "client" ? "text-[color:var(--client-primary)]" : dark ? "text-[#f3cf78]" : "text-moss")
          )}
          onClick={onTranslate}
          type="button"
        >
          <MomentActionIcon name="translate" />
          <span>翻译</span>
        </button>
      ) : null}
      <button className={cn("inline-flex items-center gap-1.5 text-xs font-bold transition", actionClass)} onClick={onForward} type="button">
        <MomentActionIcon name="forward" />
        <span>转发</span>
      </button>
    </div>
  );
}
