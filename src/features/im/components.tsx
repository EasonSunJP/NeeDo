import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type ReactNode
} from "react";
import { Link, useLocation } from "react-router-dom";
import { floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { InteractiveAvatar } from "../../components/ui/InteractiveAvatar";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Button } from "../../components/ui/Button";
import { NotificationBadge } from "../../components/ui/NotificationBadge";
import { PinBadgeIcon } from "../../components/ui/PinBadgeIcon";
import { ShareNetworkIcon } from "../../components/ui/ShareNetworkIcon";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { cn } from "../../lib/utils";
import { CustomerMembershipBadge } from "../../shared/profile-card";
import { getClientThemeClassName, useClientTheme } from "../../theme/ClientThemeProvider";
import { IdentityBadge, VerificationBadge } from "../social/components/SocialUi";
import { getDisplayName, getImContactSignatureCaption, type ContactRelation, type Conversation, type ConversationMessage, type ImMessageType, type ImUser, type MessageExt } from "./model";

export function ImIcon({
  name,
  className
}: {
	  name:
	    | "back"
	    | "chevron-down"
	    | "search"
	    | "add"
	    | "edit"
	    | "more"
    | "mute"
    | "pin"
    | "organization"
    | "group"
    | "video"
    | "call"
    | "emoji"
    | "plus"
    | "mic"
    | "photo"
    | "camera"
    | "file"
    | "location"
    | "card"
    | "friend"
    | "scan"
    | "payment"
    | "tag"
    | "filter"
    | "service"
    | "blacklist"
    | "check"
    | "delete"
    | "reply"
    | "forward"
    | "link"
    | "select"
    | "translate"
    | "top"
    | "copy";
  className?: string;
}) {
  if (name === "back") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="m14.5 6.5-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "chevron-down") {
    return (
      <svg aria-hidden="true" className={cn("h-4 w-4", className)} fill="none" viewBox="0 0 24 24">
        <path d="m6.5 9.5 5.5 5 5.5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="2" />
        <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "add" || name === "plus") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="m5 16.8-.8 3 3-.8L18.1 8.1a2 2 0 0 0 0-2.8l-.4-.4a2 2 0 0 0-2.8 0L5 14.8v2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="m13.6 6.2 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "more") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <circle cx="5" cy="12" fill="currentColor" r="1.6" />
        <circle cx="12" cy="12" fill="currentColor" r="1.6" />
        <circle cx="19" cy="12" fill="currentColor" r="1.6" />
      </svg>
    );
  }

  if (name === "mute") {
    return (
      <svg aria-hidden="true" className={cn("h-4 w-4", className)} fill="none" viewBox="0 0 24 24">
        <path d="M5 10.5h3l4-3v9l-4-3H5v-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="m16 9 4 6M20 9l-4 6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "pin") {
    return <PinBadgeIcon className={cn("h-4 w-4", className)} />;
  }

  if (name === "organization") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <rect height="5" rx="1.5" stroke="currentColor" strokeWidth="2" width="7" x="8.5" y="4" />
        <rect height="5" rx="1.5" stroke="currentColor" strokeWidth="2" width="6" x="4" y="15" />
        <rect height="5" rx="1.5" stroke="currentColor" strokeWidth="2" width="6" x="14" y="15" />
        <path d="M12 9v3M7 12h10M7 12v3M17 12v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "group") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="10" r="2.6" stroke="currentColor" strokeWidth="2" />
        <path d="M4.5 18a4.5 4.5 0 0 1 7-3.7M13 17.5a4 4 0 0 1 7 0" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "video") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <rect height="10" rx="2" stroke="currentColor" strokeWidth="2" width="11" x="4" y="7" />
        <path d="m15 10 4-2v8l-4-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "call") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M7.2 4.8 9.3 4c.7-.3 1.5 0 1.8.7l1 2.4c.2.6.1 1.2-.4 1.6l-1.1 1c.8 1.7 2 3 3.7 3.8l1.1-1c.5-.4 1.1-.5 1.7-.2l2.3 1.1c.7.3 1 1.1.7 1.8l-.9 2.1c-.3.7-1 1.1-1.7 1-7-.9-12.4-6.3-13.3-13.2-.1-.8.3-1.5 1-1.8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "emoji") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <circle cx="9" cy="10" fill="currentColor" r="1" />
        <circle cx="15" cy="10" fill="currentColor" r="1" />
        <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "mic") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M12 5.5a3 3 0 0 1 3 3v3a3 3 0 1 1-6 0v-3a3 3 0 0 1 3-3ZM7.5 11.5a4.5 4.5 0 0 0 9 0M12 16v2.5M9 19.5h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "photo") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <rect height="14" rx="3" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
        <circle cx="9" cy="10" fill="currentColor" r="1.6" />
        <path d="m7 17 4-4 2.5 2.5 2.5-3 2 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "camera") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M8.2 6.5 9.6 4.8h4.8l1.4 1.7H18a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3h2.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="2" />
        <path d="M17.5 9h.1" stroke="currentColor" strokeLinecap="round" strokeWidth="2.6" />
      </svg>
    );
  }

  if (name === "file") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M8 3.5h6l4 4V20a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M14 3.5V8h4" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "location") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M12 20s6-4.6 6-10a6 6 0 1 0-12 0c0 5.4 6 10 6 10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "card") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <rect height="14" rx="2.5" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
        <circle cx="9" cy="11" r="2" stroke="currentColor" strokeWidth="2" />
        <path d="M14 10h4M14 14h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "friend") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M12 13.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 19.5a7 7 0 0 1 14 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M18.5 5.5v4M16.5 7.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "scan") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M7 5H5v4M17 5h2v4M7 19H5v-4M19 15v4h-2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M8 12h8M9.5 9.5h5M9.5 14.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "payment") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <rect height="12" rx="2.5" stroke="currentColor" strokeWidth="2" width="16" x="4" y="6" />
        <path d="M4 10h16M8 14h3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "tag") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M10 4h7a2 2 0 0 1 2 2v7l-8 8-6-6 8-8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <circle cx="15.5" cy="8.5" fill="currentColor" r="1.4" />
      </svg>
    );
  }

  if (name === "filter") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M5 5.5h14l-5.3 6.1v5.8L10.3 19v-7.4L5 5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M15.5 14h3.5M15.5 17.5h2.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "service") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M7 7h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-5l-4 3v-3H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M9 11h6M9 14h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "blacklist") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="m6 12 4 4 8-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "delete") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M6 7h12M9 7V5h6v2m-7 3v7m4-7v7m4-7v7M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L17 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "reply") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="m9 8-4 4 4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M20 12H5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "forward") {
    return <ShareNetworkIcon className={cn("h-5 w-5", className)} />;
  }

  if (name === "copy") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <rect height="12" rx="2" stroke="currentColor" strokeWidth="2" width="10" x="8" y="6" />
        <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "link") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M10 14 8.5 15.5a3 3 0 1 1-4.2-4.2L7 8.6M14 10l1.5-1.5a3 3 0 1 1 4.2 4.2L17 15.4M9 15l6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "select") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="m5 7 1.7 1.7L10 5.5M5 13l1.7 1.7L10 11.5M5 19l1.7 1.7L10 17.5M13 8h6M13 14h6M13 20h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "translate") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M4 5h9M8.5 3v2M11 5c-.8 3.6-2.8 6.3-6 8M6.5 8c1.1 2 2.8 3.5 5.5 4.7M13 20l4-9 4 9M14.4 17h5.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "top") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M6 5h12M12 19V8M8 12l4-4 4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      <path d="M6 8h12M6 12h8M6 16h6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export type ImChatComposerPanel = "emoji" | "more" | null;
export type ImChatComposerAction = {
  icon: Parameters<typeof ImIcon>[0]["name"];
  key: string;
  label: string;
  run: () => void;
};
export type ImChatComposerRecordingState = {
  active: boolean;
  cancel: boolean;
  durationSeconds: number;
};

const imChatComposerEmojis = ["😀", "😄", "🥹", "👌", "👍", "🙏", "😭", "🔥", "🎉", "💬", "❤️", "🤝", "✅", "📍", "😴", "🥳"];

export function ImChatComposer({
  actions = [],
  blocked = false,
  draft,
  isNight,
  maxVoiceRecordingSeconds = 60,
  onCancelRecording,
  onDraftChange,
  onEndRecording,
  onMoveRecording,
  onPanelChange,
  onSend,
  onStartRecording,
  onToggleVoice,
  panel,
  placeholder = "发送消息",
  recording = { active: false, cancel: false, durationSeconds: 0 },
  textareaRef,
  voiceMode = false
}: {
  actions?: ImChatComposerAction[];
  blocked?: boolean;
  draft: string;
  isNight: boolean;
  maxVoiceRecordingSeconds?: number;
  onCancelRecording?: () => void;
  onDraftChange: (value: string) => void;
  onEndRecording?: () => void;
  onMoveRecording?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPanelChange: (panel: ImChatComposerPanel | ((value: ImChatComposerPanel) => ImChatComposerPanel)) => void;
  onSend: () => void;
  onStartRecording?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onToggleVoice?: () => void;
  panel: ImChatComposerPanel;
  placeholder?: string;
  recording?: ImChatComposerRecordingState;
  textareaRef?: Ref<HTMLTextAreaElement>;
  voiceMode?: boolean;
}) {
  const composerShellClass = isNight
    ? "border-t border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] backdrop-blur-md"
    : "border-t border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] backdrop-blur-md";
  const composerInputShellClass = isNight
    ? "min-h-[40px] min-w-0 flex-1 rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
    : "min-h-[40px] min-w-0 flex-1 rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_62%,var(--client-bg)_38%)] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(21,33,27,0.12)]";
  const composerIconButtonClass = "shrink-0 text-[color:var(--client-muted)]";
  const composerTextareaClass =
    "max-h-[132px] min-h-[24px] w-full resize-none border-none bg-transparent p-0 text-[15px] leading-6 text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]";
  const composerPanelClass =
    "mt-3 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,var(--client-bg)_14%)] p-4 shadow-[0_18px_44px_color-mix(in_srgb,var(--client-text)_16%,transparent)] backdrop-blur-xl";
  const composerEmojiButtonClass =
    "rounded-xl py-2 transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]";
  const composerActionButtonClass =
    "min-w-0 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-1.5 py-3 text-center text-[color:var(--client-text)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface)_90%)] sm:px-3 sm:py-4";
  const composerActionIconClass =
    "mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--client-primary)_18%,var(--client-surface)_82%)] text-[color:var(--client-primary)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-text)_12%,transparent)] sm:h-11 sm:w-11";

  return (
    <div
      className={cn("relative z-10 max-w-full overflow-x-hidden px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 [overflow-x:clip]", composerShellClass)}
      data-im-composer-root="true"
    >
      <div className="flex min-w-0 max-w-full items-end gap-2">
        <button
          className={cn("focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full", composerIconButtonClass)}
          onClick={() => {
            onToggleVoice?.();
            onPanelChange(null);
          }}
          type="button"
        >
          <ImIcon name="mic" />
        </button>
        <div className={composerInputShellClass}>
          {voiceMode ? (
            <button
              className={cn(
                "w-full rounded-[18px] px-4 py-3 text-sm font-medium transition",
                recording.active ? (recording.cancel ? "bg-[#fff2ef] text-[#ef4f3f]" : "bg-[#edf7ee] text-[#1f6f4d]") : "bg-[#f5f5f5] text-ink/55"
              )}
              disabled={blocked}
              onPointerCancel={onCancelRecording}
              onPointerDown={onStartRecording}
              onPointerMove={onMoveRecording}
              onPointerUp={onEndRecording}
              type="button"
            >
              {recording.active
                ? recording.cancel
                  ? `松开取消发送 · ${recording.durationSeconds}/${maxVoiceRecordingSeconds}s`
                  : `松开发送，上滑取消 · ${recording.durationSeconds}/${maxVoiceRecordingSeconds}s`
                : `按住说话（最长 ${maxVoiceRecordingSeconds} 秒）`}
            </button>
          ) : (
            <textarea
              className={composerTextareaClass}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={blocked ? "你已将对方加入黑名单" : placeholder}
              ref={textareaRef}
              rows={1}
              value={draft}
            />
          )}
        </div>
        <button
          className={cn("focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full", composerIconButtonClass)}
          onClick={() => onPanelChange((value) => (value === "emoji" ? null : "emoji"))}
          type="button"
        >
          <ImIcon name="emoji" />
        </button>
        {draft.trim() && !voiceMode ? (
          <Button className="h-10 shrink-0 rounded-full px-4 text-sm" disabled={blocked} onClick={onSend}>
            发送
          </Button>
        ) : (
          <button
            className={cn("focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full", composerIconButtonClass)}
            onClick={() => onPanelChange((value) => (value === "more" ? null : "more"))}
            type="button"
          >
            <ImIcon name="plus" />
          </button>
        )}
      </div>

      {panel === "emoji" ? (
        <div className={composerPanelClass}>
          <p className="mb-3 text-xs text-[color:var(--client-muted)]">最近使用和常用表情</p>
          <div className="grid grid-cols-8 gap-2 text-center text-[24px]">
            {imChatComposerEmojis.map((emoji) => (
              <button
                className={composerEmojiButtonClass}
                key={emoji}
                onClick={() => onDraftChange(`${draft}${emoji}`)}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {panel === "more" && actions.length > 0 ? (
        <div className={composerPanelClass}>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {actions.map((action) => (
              <button className={composerActionButtonClass} key={action.key} onClick={action.run} type="button">
                <span className={composerActionIconClass}>
                  <ImIcon name={action.icon} />
                </span>
                <span className="mt-2 block truncate text-[11px] font-medium text-[color:var(--client-muted)] sm:text-xs">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ImStandaloneShell({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const { theme, isNight } = useClientTheme();
  const location = useLocation();

  useEffect(() => {
    let frame = 0;

    const resetHorizontalScroll = () => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const hasHorizontalOffset =
        window.scrollX !== 0 ||
        scrollingElement.scrollLeft !== 0 ||
        document.documentElement.scrollLeft !== 0 ||
        document.body.scrollLeft !== 0;

      if (!hasHorizontalOffset) {
        return;
      }

      scrollingElement.scrollLeft = 0;
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    };

    const scheduleReset = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        resetHorizontalScroll();
      });
    };

    resetHorizontalScroll();
    window.addEventListener("scroll", scheduleReset, { passive: true });
    window.addEventListener("resize", scheduleReset);
    window.visualViewport?.addEventListener("scroll", scheduleReset, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleReset);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      window.removeEventListener("scroll", scheduleReset);
      window.removeEventListener("resize", scheduleReset);
      window.visualViewport?.removeEventListener("scroll", scheduleReset);
      window.visualViewport?.removeEventListener("resize", scheduleReset);
    };
  }, [location.hash, location.pathname, location.search]);

  return (
    <div
      className={cn(
        "safe-screen-shell client-shell min-h-[100dvh] w-full max-w-full min-w-0 overflow-x-hidden [overflow-x:clip]",
        isNight ? "client-theme-night" : "client-theme-day",
        getClientThemeClassName(theme),
        className
      )}
      data-page-drag-ignore="true"
      data-scroll-drag-ignore="true"
    >
      <div className="mx-auto min-h-[100dvh] w-full min-w-0 overflow-x-hidden [overflow-x:clip] bg-transparent" style={{ maxWidth: "min(880px, 100%)" }}>
        {children}
      </div>
    </div>
  );
}

export function ImTopBar({
  title,
  subtitle,
  onBack,
  actions,
  centerTitle = false,
  footer,
  footerClassName,
  fixed = false,
  className
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
  centerTitle?: boolean;
  footer?: ReactNode;
  footerClassName?: string;
  fixed?: boolean;
  className?: string;
}) {
  const titleNode = typeof title === "string" ? <h1 className="truncate text-[18px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">{title}</h1> : title;
  const spacerClassName = footer ? "h-[calc(env(safe-area-inset-top)+7.25rem)]" : "h-[calc(env(safe-area-inset-top)+4rem)]";
  const topBarSurfaceClassName = "safe-header-top fixed inset-x-0 top-0 z-40 w-full max-w-full overflow-x-hidden border-b border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:var(--client-bg)] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-shadow)_16%,transparent)] [overflow-x:clip]";

  const content = (
    <>
      <div className={cn("relative flex items-center justify-between gap-3", centerTitle || onBack ? "min-h-11" : "")}>
        {onBack ? <ImTopBarBackButton onClick={onBack} /> : null}
        {centerTitle ? (
          <>
            <div className="min-h-10 flex-1" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-[72px]">
              <div className="min-w-0 max-w-full flex-1 text-center">
                {titleNode}
                {subtitle ? <p className="truncate text-[11px] font-semibold text-[color:var(--client-muted)]">{subtitle}</p> : null}
              </div>
            </div>
            {actions ? <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div> : <div className="h-10 w-10 shrink-0" />}
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center">
              <div className={cn("min-w-0 flex-1", onBack ? "pl-[56px] sm:pl-[60px]" : "")}>
                {titleNode}
                {subtitle ? <p className="truncate text-[11px] font-semibold text-[color:var(--client-muted)]">{subtitle}</p> : null}
              </div>
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
          </>
        )}
      </div>
      {footer ? <div className={cn("mt-3", footerClassName)}>{footer}</div> : null}
    </>
  );

  if (fixed) {
    return (
      <header
        className={cn(
          topBarSurfaceClassName,
          className
        )}
      >
        <div className="mx-auto w-full px-4 pb-3" style={{ maxWidth: "min(880px, 100%)" }}>
          {content}
        </div>
      </header>
    );
  }

  return (
    <div className="contents">
      <header
        className={cn(
          topBarSurfaceClassName,
          className
        )}
      >
        <div className="mx-auto w-full px-4 pb-3" style={{ maxWidth: "min(880px, 100%)" }}>
          {content}
        </div>
      </header>
      <div aria-hidden="true" className={spacerClassName} />
    </div>
  );
}

function ImTopBarBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="返回"
      className={cn(floatingHeaderControlButtonClassName, "absolute left-0 top-0 z-10")}
      onClick={onClick}
      type="button"
    >
      <ImIcon name="back" />
    </button>
  );
}

export function PrivateConversationTitle({
  title,
  privateMode,
  className,
  iconClassName,
  textClassName
}: {
  title: string;
  privateMode?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}>
      {privateMode ? <PrivateModeIcon className={iconClassName} /> : null}
      <span className={cn("min-w-0 truncate", textClassName)}>{title}</span>
    </span>
  );
}

function PrivateModeIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <path
        d="M10.55 5.15A9.2 9.2 0 0 1 12 5c5.25 0 8.8 4.8 9.8 6.36.25.39.25.89 0 1.28a15.2 15.2 0 0 1-3.35 3.76"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M14.1 14.55A3.15 3.15 0 0 1 9.45 9.9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M6.35 6.8A15 15 0 0 0 2.2 11.36c-.25.39-.25.89 0 1.28C3.2 14.2 6.75 19 12 19c1.55 0 3-.42 4.28-1.06"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ImActorHeaderSummary({
  avatar,
  levelLabel,
  membershipLevel,
  name,
  subtitle,
  to,
  entityType,
  verifiedStatus
}: {
  avatar?: string;
  levelLabel?: string;
  membershipLevel?: string;
  name: string;
  subtitle: string;
  to?: string;
  entityType: "user" | "technician" | "shop";
  verifiedStatus: "none" | "rising" | "verified" | "business";
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <InteractiveAvatar
        alt={name}
        className="h-12 w-12 border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]"
        src={avatar}
        to={to}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate text-[22px] font-black tracking-[-0.04em] text-[color:var(--client-text)] sm:text-[24px]">{name}</h1>
          {entityType === "shop" ? null : <VerificationBadge status={verifiedStatus} />}
          {membershipLevel ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <CustomerMembershipBadge
                className="-my-0.5 h-5 w-5"
                fallbackClassName="text-[11px] font-black leading-none text-[color:var(--client-muted)]"
                imageClassName="h-5 w-5"
                level={membershipLevel}
              />
              {levelLabel ? <span className="text-[11px] font-black leading-none text-[color:var(--client-muted)]">{levelLabel}</span> : null}
            </span>
          ) : null}
          <IdentityBadge entityType={entityType} />
        </div>
        <p className="mt-1 truncate text-[12px] font-semibold leading-none text-[color:var(--client-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

export function ImHeaderAction({
  label,
  onClick,
  children
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button aria-label={label} className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] text-[color:var(--client-text)]" onClick={onClick} type="button">
      {children}
    </button>
  );
}

export function ImSearchTrigger({
  to,
  placeholder,
  onClick
}: {
  to?: string;
  placeholder: string;
  onClick?: () => void;
}) {
  const content = (
    <span className="flex h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] px-4 text-sm text-[color:var(--client-muted)]">
      <ImIcon name="search" className="h-4 w-4" />
      <span>{placeholder}</span>
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

export function ImEntryCell({
  icon,
  title,
  caption,
  badge,
  to,
  onClick
}: {
  icon: ReactNode;
  title: string;
  caption?: string;
  badge?: string | number;
  to?: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)] shadow-[0_10px_24px_rgba(15,143,92,0.12)]">
        {typeof badge === "number" && badge > 0 ? (
          <NotificationBadge className="absolute -right-1 -top-1" count={badge} size="sm" />
        ) : badge ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-[#f54a46] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        ) : null}
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <strong className="truncate text-[15px] font-black text-[color:var(--client-text)]">{title}</strong>
          {caption ? <span className="shrink-0 text-xs font-bold text-[color:var(--client-muted)]">{caption}</span> : null}
        </div>
      </div>
    </div>
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

const swipeActionWidth = 72;
const flatListSwipeActionWidth = 58;
const swipeRowActiveEventName = "needo.im.swipe-row.active";
let swipeRowIdSeed = 0;

function getSwipeActionWidth(action: { width?: number }, isFlatList: boolean) {
  return action.width ?? (isFlatList ? flatListSwipeActionWidth : swipeActionWidth);
}

function getSwipeRowId() {
  swipeRowIdSeed += 1;
  return `swipe-row-${swipeRowIdSeed}`;
}

function emitActiveSwipeRow(id: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(swipeRowActiveEventName, { detail: { id } }));
}

export function SwipeActionRow({
  actions,
  children,
  variant = "card"
}: {
  actions: Array<{ key: string; label: string; tone: "neutral" | "warning" | "danger"; width?: number; onClick: () => void }>;
  children: ReactNode;
  variant?: "card" | "flat-list";
}) {
  const isFlatList = variant === "flat-list";
  const actionLayouts = actions.map((action) => ({
    ...action,
    width: getSwipeActionWidth(action, isFlatList)
  }));
  const totalWidth = actions.reduce((sum, action) => sum + getSwipeActionWidth(action, isFlatList), 0);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const session = useRef<{ pointerId: number; startX: number; startY: number; startOffset: number; moved: boolean; captured: boolean } | null>(null);
  const settledOffset = dragging ? offset : revealed ? -totalWidth : 0;
  const revealedWidth = Math.max(0, Math.min(totalWidth, -settledOffset));
  const actionTrailingOffsets = new Array(actionLayouts.length).fill(0);
  let trailingOffset = 0;

  for (let index = actionLayouts.length - 1; index >= 0; index -= 1) {
    actionTrailingOffsets[index] = trailingOffset;
    trailingOffset += actionLayouts[index].width;
  }

  if (!rowIdRef.current) {
    rowIdRef.current = getSwipeRowId();
  }

  const closeRow = () => {
    setRevealed(false);
    setDragging(false);
    setOffset(0);
    suppressClickRef.current = false;
    session.current = null;
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleActiveSwipe = (event: Event) => {
      const activeId = (event as CustomEvent<{ id?: string }>).detail?.id;

      if (!activeId || activeId === rowIdRef.current) {
        return;
      }

      closeRow();
    };

    window.addEventListener(swipeRowActiveEventName, handleActiveSwipe);
    return () => window.removeEventListener(swipeRowActiveEventName, handleActiveSwipe);
  }, []);

  useEffect(() => {
    if (!revealed || typeof document === "undefined") {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }

      closeRow();
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [revealed]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (event.target instanceof Element && event.target.closest("[data-swipe-action-button='true']")) {
      return;
    }

    suppressClickRef.current = false;
    session.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: revealed ? -totalWidth : 0,
      moved: false,
      captured: false
    };
    setOffset(revealed ? -totalWidth : 0);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!session.current || session.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - session.current.startX;
    const deltaY = event.clientY - session.current.startY;

    if (!session.current.moved && Math.abs(deltaY) > Math.abs(deltaX) + 4) {
      session.current = null;
      setDragging(false);
      setOffset(revealed ? -totalWidth : 0);
      suppressClickRef.current = false;
      return;
    }

    if (Math.abs(deltaX) < 6) {
      return;
    }

    if (!session.current.moved) {
      const rowId = rowIdRef.current;

      if (rowId) {
        emitActiveSwipeRow(rowId);
      }

      session.current.moved = true;
      session.current.captured = true;
      suppressClickRef.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    setOffset(Math.max(-totalWidth, Math.min(0, session.current.startOffset + deltaX)));
  };

  const handlePointerEnd = (pointerId: number) => {
    if (!session.current || session.current.pointerId !== pointerId) {
      return;
    }

    if (session.current.captured && rootRef.current?.hasPointerCapture?.(pointerId)) {
      rootRef.current.releasePointerCapture(pointerId);
    }

    if (!session.current.moved) {
      session.current = null;
      setDragging(false);
      setOffset(revealed ? -totalWidth : 0);
      suppressClickRef.current = false;
      return;
    }

    const nextReveal = offset <= -totalWidth * 0.45;
    setRevealed(nextReveal);
    setDragging(false);
    setOffset(nextReveal ? -totalWidth : 0);
    session.current = null;
  };

  const handleContentClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (revealed) {
      closeRow();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden",
        isFlatList
          ? "rounded-none border-none bg-transparent shadow-none"
          : "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,var(--client-bg)_22%)] bg-[color:var(--client-surface)] shadow-[0_14px_30px_rgba(10,14,12,0.08)]"
      )}
      ref={rootRef}
      onPointerCancel={(event) => handlePointerEnd(event.pointerId)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => handlePointerEnd(event.pointerId)}
      style={{
        touchAction: "pan-y"
      }}
    >
      <div
        className={cn(
          "absolute z-0 flex items-stretch",
          isFlatList ? "inset-y-0 right-0 gap-0" : "inset-y-0 right-0",
          dragging || revealed ? "pointer-events-auto" : "pointer-events-none"
        )}
        style={{ width: totalWidth }}
      >
        {actionLayouts.map((action, index) => {
          const revealProgress = Math.max(0, Math.min(1, (revealedWidth - actionTrailingOffsets[index]) / action.width));

          return (
          <button
            className={cn(
              "flex items-center justify-center text-white",
              isFlatList
                ? "h-full px-2 text-[11px] font-semibold tracking-[-0.01em]"
                : "text-xs font-black",
              action.tone === "neutral"
                ? "bg-[color:color-mix(in_srgb,var(--client-muted)_82%,#444_18%)]"
                : action.tone === "warning"
                  ? "bg-[color:color-mix(in_srgb,var(--client-warm)_82%,#7a571f_18%)]"
                  : "bg-[color:color-mix(in_srgb,var(--client-accent)_82%,#6b231b_18%)]"
            )}
            data-swipe-action-button="true"
            key={action.key}
            onClick={() => {
              action.onClick();
              closeRow();
            }}
            style={{
              opacity: revealProgress,
              transform: `translateX(${(1 - revealProgress) * 16}px) scale(${0.94 + revealProgress * 0.06})`,
              transformOrigin: "right center",
              transition: dragging ? "none" : "opacity 180ms ease, transform 180ms ease",
              width: action.width
            }}
            type="button"
          >
            {action.label}
          </button>
          );
        })}
      </div>
      <div
        className={cn(
          "relative z-10 w-full overflow-hidden transition",
          isFlatList
            ? "rounded-none bg-transparent"
            : "rounded-[24px] bg-[color:var(--client-surface)]"
        )}
        style={{
          transform: `translateX(${settledOffset}px)`,
          transition: dragging ? "none" : "transform 180ms ease"
        }}
      >
        <div className="min-h-full w-full bg-inherit" onClickCapture={handleContentClickCapture}>{children}</div>
      </div>
    </div>
  );
}

export function ConversationRow({
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
  to,
  onClick,
  avatarTo,
  onAvatarClick
}: {
  avatar: string;
  title: string;
  preview: { text: string; isDraft?: boolean };
  time: string;
  unreadCount: number;
  muted?: boolean;
  pinned?: boolean;
  group?: boolean;
  privacyMode?: boolean;
  mention?: string;
  to?: string;
  onClick?: () => void;
  avatarTo?: string;
  onAvatarClick?: () => void;
}) {
  const summary = (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <strong className="flex min-w-0 flex-1 items-center text-[16px] font-black text-[color:var(--client-text)]">
            <PrivateConversationTitle privateMode={privacyMode} title={title} />
          </strong>
          {muted ? <ImIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--client-muted)]" name="mute" /> : null}
          {pinned ? <ImIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--client-warm)]" name="pin" /> : null}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm">
          {preview.isDraft ? <span className="shrink-0 text-[#ef4f3f]">[草稿]</span> : null}
          {mention ? <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--client-accent)_16%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--client-accent)]">{mention}</span> : null}
          <p className={cn("truncate", preview.isDraft ? "text-[#ef4f3f]" : "text-[color:var(--client-muted)]")}>{preview.text || "暂无消息"}</p>
        </div>
      </div>
      <div className="flex min-w-[56px] flex-col items-end gap-2 pt-0.5 text-right">
        <div className="text-[11px] font-bold text-[color:var(--client-muted)]">{time}</div>
        {unreadCount > 0 ? <NotificationBadge count={unreadCount} size="sm" /> : null}
      </div>
    </div>
  );

  const body = to ? (
    <Link className="min-w-0 flex-1 text-left" to={to}>
      {summary}
    </Link>
  ) : (
    <button className="min-w-0 flex-1 text-left" onClick={onClick} type="button">
      {summary}
    </button>
  );

  return (
    <div
      className={cn(
        "w-full rounded-[24px] px-4 py-3",
        pinned
          ? "bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-primary)_18%)]"
          : "bg-[color:var(--client-surface)]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <InteractiveAvatar
            alt={title}
            className="h-12 w-12"
            onClick={onAvatarClick}
            src={avatar}
            stopPropagation
            to={avatarTo}
          />
          {group ? <span className="absolute -bottom-1 -right-1 rounded-full bg-[color:var(--client-primary)] px-1 py-0.5 text-[9px] font-bold text-[color:var(--client-primary-contrast)]">群</span> : null}
        </div>
        {body}
      </div>
    </div>
  );
}

export function ContactRow({
  user,
  contact,
  caption,
  to,
  onClick,
  avatarTo,
  onAvatarClick,
  avatarBadge
}: {
  user: ImUser;
  contact?: ContactRelation;
  caption?: string;
  to?: string;
  onClick?: () => void;
  avatarTo?: string;
  onAvatarClick?: () => void;
  avatarBadge?: ReactNode;
}) {
  const summary = (
    <div className="relative min-w-0 flex-1">
      <div className="min-w-0">
          <strong className="truncate text-[16px] font-black text-[color:var(--client-text)]">{getDisplayName(user, contact)}</strong>
          {caption ? <p className="mt-1 truncate text-xs text-[color:var(--client-muted)]">{caption}</p> : null}
      </div>
      {user.serviceAccount ? (
        <span className="pointer-events-none absolute right-0 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-full bg-[color:var(--client-primary-soft)] px-2 py-1 text-[10px] font-black text-[color:var(--client-primary)]">
          服务号
        </span>
      ) : null}
    </div>
  );

  const body = to ? (
    <Link className="min-w-0 flex-1 text-left" to={to}>
      {summary}
    </Link>
  ) : onClick ? (
    <button className="min-w-0 flex-1 text-left" onClick={onClick} type="button">
      {summary}
    </button>
  ) : (
    summary
  );

  return (
    <div className="flex min-h-[74px] items-center gap-3 border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] px-4 py-3">
      <div className="relative shrink-0">
        <InteractiveAvatar alt={user.nickname} className="h-10 w-10" onClick={onAvatarClick} src={user.avatar} stopPropagation to={avatarTo} />
        {avatarBadge ? <span aria-hidden="true" className="pointer-events-none absolute -bottom-1 -right-1">{avatarBadge}</span> : null}
      </div>
      {body}
    </div>
  );
}

export function SectionTag({ children }: { children: ReactNode }) {
  return <span className="px-4 py-2 text-xs font-black tracking-[0.08em] text-[color:var(--client-muted)]">{children}</span>;
}

export function ImBottomSheet({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[color:var(--client-overlay)]" onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[880px] rounded-t-[32px] bg-[color:var(--client-surface)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_48px_rgba(0,0,0,0.16)]" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]" />
        {title ? <h3 className="mb-3 text-center text-sm font-black text-[color:var(--client-muted)]">{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}

export type ImMessageActionSheetItem = {
  disabled?: boolean;
  icon: Parameters<typeof ImIcon>[0]["name"];
  key: string;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
};

export type ImMessageReactionSummary = {
  emoji: string;
  people: Array<{
    id: string;
    name: string;
    avatar?: string;
  }>;
  reactedByMe?: boolean;
};

export function hasActiveImMessageTextSelection(root: HTMLElement | null | undefined) {
  if (typeof window === "undefined" || !root) {
    return false;
  }

  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) {
    return false;
  }

  return root.contains(selection.anchorNode) || root.contains(selection.focusNode);
}

type ImSelectionOffsets = {
  end: number;
  length: number;
  start: number;
};

type ImSelectionHandlePosition = {
  x: number;
  y: number;
};

type ImSelectionHandlePositions = {
  end: ImSelectionHandlePosition | null;
  start: ImSelectionHandlePosition | null;
};

type ImSelectionHandleDrag = {
  handle: "start" | "end";
  pointerOffsetX: number;
  pointerOffsetY: number;
};

function getImSelectableTextRoot(messageRoot: HTMLElement | null | undefined) {
  return messageRoot?.querySelector<HTMLElement>("[data-im-message-selectable-text='true']") ?? null;
}

function getTextLength(root: HTMLElement) {
  return root.textContent?.length ?? 0;
}

function getSelectionOffset(root: HTMLElement, node: Node, offset: number) {
  if (!root.contains(node)) {
    return null;
  }

  const range = document.createRange();
  range.setStart(root, 0);

  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }

  return range.toString().length;
}

function resolveTextOffset(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const length = getTextLength(root);
  let remaining = Math.max(0, Math.min(offset, length));
  let lastTextNode: Text | null = null;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    lastTextNode = textNode;

    if (remaining <= textNode.length) {
      return { node: textNode, offset: remaining };
    }

    remaining -= textNode.length;
  }

  return lastTextNode ? { node: lastTextNode, offset: lastTextNode.length } : null;
}

function getVisibleRangeRects(range: Range) {
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
}

function getCurrentTextSelectionOffsets(root: HTMLElement): ImSelectionOffsets | null {
  if (typeof window === "undefined") {
    return null;
  }

  const selection = window.getSelection();
  const length = getTextLength(root);

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || length === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const start = getSelectionOffset(root, range.startContainer, range.startOffset);
  const end = getSelectionOffset(root, range.endContainer, range.endOffset);

  if (start === null || end === null) {
    return null;
  }

  return {
    end: Math.max(0, Math.min(end, length)),
    length,
    start: Math.max(0, Math.min(start, length))
  };
}

function hasNonCollapsedDocumentSelection() {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
}

function setTextSelectionOffsets(root: HTMLElement, start: number, end: number) {
  const length = getTextLength(root);
  const nextStart = Math.max(0, Math.min(start, Math.max(0, length - 1)));
  const nextEnd = Math.max(nextStart + 1, Math.min(end, length));
  const startPoint = resolveTextOffset(root, nextStart);
  const endPoint = resolveTextOffset(root, nextEnd);

  if (!startPoint || !endPoint) {
    return;
  }

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getTextOffsetFromCharacterRects(root: HTMLElement, clientX: number, clientY: number) {
  const length = getTextLength(root);

  if (length === 0) {
    return null;
  }

  const characters: Array<{ offset: number; rect: DOMRect }> = [];

  for (let index = 0; index < length; index += 1) {
    const startPoint = resolveTextOffset(root, index);
    const endPoint = resolveTextOffset(root, index + 1);

    if (!startPoint || !endPoint) {
      continue;
    }

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    characters.push(...getVisibleRangeRects(range).map((rect) => ({ offset: index, rect })));
  }

  if (characters.length === 0) {
    return null;
  }

  const verticalDistance = (rect: DOMRect) => {
    if (clientY < rect.top) {
      return rect.top - clientY;
    }

    if (clientY > rect.bottom) {
      return clientY - rect.bottom;
    }

    return 0;
  };
  const closestDistance = Math.min(...characters.map((item) => verticalDistance(item.rect)));
  const lineCharacters = characters
    .filter((item) => Math.abs(verticalDistance(item.rect) - closestDistance) <= 0.5)
    .sort((left, right) => left.rect.left - right.rect.left || left.offset - right.offset);
  const firstCharacter = lineCharacters[0];
  const lastCharacter = lineCharacters[lineCharacters.length - 1];

  if (!firstCharacter || !lastCharacter) {
    return null;
  }

  if (clientX <= firstCharacter.rect.left) {
    return firstCharacter.offset;
  }

  for (const item of lineCharacters) {
    const midpoint = item.rect.left + item.rect.width / 2;

    if (clientX < midpoint) {
      return item.offset;
    }
  }

  return Math.min(length, lastCharacter.offset + 1);
}

function getCaretOffsetFromPoint(root: HTMLElement, clientX: number, clientY: number) {
  const characterOffset = getTextOffsetFromCharacterRects(root, clientX, clientY);

  if (characterOffset !== null) {
    return characterOffset;
  }

  const rect = root.getBoundingClientRect();
  const safeClientX = Math.max(rect.left + 1, Math.min(clientX, rect.right - 1));
  const safeClientY = Math.max(rect.top + 1, Math.min(clientY, rect.bottom - 1));
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caretPosition = doc.caretPositionFromPoint?.(safeClientX, safeClientY);

  if (caretPosition) {
    const offset = getSelectionOffset(root, caretPosition.offsetNode, caretPosition.offset);
    if (offset !== null) {
      return offset;
    }
  }

  const caretRange = doc.caretRangeFromPoint?.(safeClientX, safeClientY);

  if (caretRange) {
    const offset = getSelectionOffset(root, caretRange.startContainer, caretRange.startOffset);
    if (offset !== null) {
      return offset;
    }
  }

  return null;
}

function getCaretPosition(root: HTMLElement, offset: number, edge: "start" | "end"): ImSelectionHandlePosition | null {
  const point = resolveTextOffset(root, offset);

  if (!point) {
    return null;
  }

  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();

  if (rect.width > 0 || rect.height > 0) {
    return {
      x: edge === "start" ? rect.left : rect.right,
      y: edge === "start" ? rect.top : rect.bottom
    };
  }

  const fallbackStart = Math.max(0, offset - 1);
  const fallbackEnd = Math.min(getTextLength(root), Math.max(offset + 1, 1));
  const fallbackStartPoint = resolveTextOffset(root, fallbackStart);
  const fallbackEndPoint = resolveTextOffset(root, fallbackEnd);

  if (!fallbackStartPoint || !fallbackEndPoint) {
    return null;
  }

  const fallbackRange = document.createRange();
  fallbackRange.setStart(fallbackStartPoint.node, fallbackStartPoint.offset);
  fallbackRange.setEnd(fallbackEndPoint.node, fallbackEndPoint.offset);
  const fallbackRect = fallbackRange.getClientRects()[0] ?? fallbackRange.getBoundingClientRect();

  return {
    x: edge === "start" ? fallbackRect.left : fallbackRect.right,
    y: edge === "start" ? fallbackRect.top : fallbackRect.bottom
  };
}

function getSelectionHandlePositions(root: HTMLElement): ImSelectionHandlePositions {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { end: null, start: null };
  }

  const range = selection.getRangeAt(0);

  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return { end: null, start: null };
  }

  const rects = getVisibleRangeRects(range);

  if (rects.length > 0) {
    const startRect = rects[0];
    const endRect = rects[rects.length - 1];

    return {
      end: { x: endRect.right, y: endRect.bottom },
      start: { x: startRect.left, y: startRect.top }
    };
  }

  const offsets = getCurrentTextSelectionOffsets(root);

  if (!offsets) {
    return { end: null, start: null };
  }

  return {
    end: getCaretPosition(root, offsets.end, "end"),
    start: getCaretPosition(root, offsets.start, "start")
  };
}

export function ImMessageSelectionHandles({
  active,
  messageRoot
}: {
  active: boolean;
  messageRoot: HTMLElement | null | undefined;
}) {
  const [positions, setPositions] = useState<ImSelectionHandlePositions>({ end: null, start: null });
  const dragRef = useRef<ImSelectionHandleDrag | null>(null);
  const lastOffsetsRef = useRef<ImSelectionOffsets | null>(null);

  useEffect(() => {
    const textRoot = active ? getImSelectableTextRoot(messageRoot) : null;

    if (!textRoot || typeof window === "undefined") {
      setPositions({ end: null, start: null });
      lastOffsetsRef.current = null;
      return undefined;
    }

    const updatePositions = () => {
      const offsets = getCurrentTextSelectionOffsets(textRoot);

      if (!offsets) {
        if ((dragRef.current || hasNonCollapsedDocumentSelection()) && lastOffsetsRef.current) {
          setTextSelectionOffsets(textRoot, lastOffsetsRef.current.start, lastOffsetsRef.current.end);
          setPositions(getSelectionHandlePositions(textRoot));
          return;
        }

        setPositions({ end: null, start: null });
        return;
      }

      lastOffsetsRef.current = offsets;
      setPositions(getSelectionHandlePositions(textRoot));
    };

    const frame = window.requestAnimationFrame(updatePositions);
    document.addEventListener("selectionchange", updatePositions);
    window.addEventListener("resize", updatePositions);
    window.addEventListener("scroll", updatePositions, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", updatePositions);
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions, true);
    };
  }, [active, messageRoot]);

  const restoreLastSelection = (textRoot: HTMLElement | null) => {
    const offsets = lastOffsetsRef.current;

    if (!textRoot || !offsets) {
      return;
    }

    if (!getCurrentTextSelectionOffsets(textRoot)) {
      setTextSelectionOffsets(textRoot, offsets.start, offsets.end);
    }

    setPositions(getSelectionHandlePositions(textRoot));
  };

  const startHandleDrag = (handle: "start" | "end", event: ReactPointerEvent<HTMLButtonElement>) => {
    const textRoot = getImSelectableTextRoot(messageRoot);
    const handlePosition = handle === "start" ? positions.start : positions.end;

    if (!textRoot || !handlePosition) {
      return;
    }

    dragRef.current = {
      handle,
      pointerOffsetX: event.clientX - handlePosition.x,
      pointerOffsetY: event.clientY - handlePosition.y
    };
    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some mobile WebViews expose pointer events without reliable capture.
    }

    const moveSelectionHandle = (nativeEvent: PointerEvent) => {
      const drag = dragRef.current;

      if (!drag || drag.handle !== handle) {
        return;
      }

      const offsets = getCurrentTextSelectionOffsets(textRoot);
      const nextOffset = getCaretOffsetFromPoint(
        textRoot,
        nativeEvent.clientX - drag.pointerOffsetX,
        nativeEvent.clientY - drag.pointerOffsetY
      );

      if (!offsets || nextOffset === null) {
        return;
      }

      if (nativeEvent.cancelable) {
        nativeEvent.preventDefault();
      }

      nativeEvent.stopPropagation();

      if (handle === "start") {
        setTextSelectionOffsets(textRoot, Math.min(nextOffset, offsets.end - 1), offsets.end);
      } else {
        setTextSelectionOffsets(textRoot, offsets.start, Math.max(nextOffset, offsets.start + 1));
      }

      lastOffsetsRef.current = getCurrentTextSelectionOffsets(textRoot) ?? lastOffsetsRef.current;
      setPositions(getSelectionHandlePositions(textRoot));
    };

    const endSelectionHandleDrag = (nativeEvent?: PointerEvent) => {
      if (nativeEvent?.cancelable) {
        nativeEvent.preventDefault();
      }

      nativeEvent?.stopPropagation();
      dragRef.current = null;
      window.removeEventListener("pointermove", moveSelectionHandle, { capture: true });
      window.removeEventListener("pointerup", endSelectionHandleDrag, { capture: true });
      window.removeEventListener("pointercancel", endSelectionHandleDrag, { capture: true });
      window.requestAnimationFrame(() => restoreLastSelection(textRoot));
    };

    window.addEventListener("pointermove", moveSelectionHandle, { capture: true, passive: false });
    window.addEventListener("pointerup", endSelectionHandleDrag, { capture: true });
    window.addEventListener("pointercancel", endSelectionHandleDrag, { capture: true });
  };

  if (!active || !positions.start || !positions.end) {
    return null;
  }

  const keepSelectionOnHandleEvent = (event: ReactPointerEvent<HTMLButtonElement> | ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    window.requestAnimationFrame(() => restoreLastSelection(getImSelectableTextRoot(messageRoot)));
  };

  return (
    <>
      <button
        aria-label="调整选区起点"
        className="im-message-selection-handle im-message-selection-handle--start"
        onClick={keepSelectionOnHandleEvent}
        onFocus={(event) => event.currentTarget.blur()}
        onPointerDown={(event) => startHandleDrag("start", event)}
        onPointerUp={keepSelectionOnHandleEvent}
        style={{ left: positions.start.x, top: positions.start.y }}
        tabIndex={-1}
        type="button"
      />
      <button
        aria-label="调整选区终点"
        className="im-message-selection-handle im-message-selection-handle--end"
        onClick={keepSelectionOnHandleEvent}
        onFocus={(event) => event.currentTarget.blur()}
        onPointerDown={(event) => startHandleDrag("end", event)}
        onPointerUp={keepSelectionOnHandleEvent}
        style={{ left: positions.end.x, top: positions.end.y }}
        tabIndex={-1}
        type="button"
      />
    </>
  );
}

const imQuickReactions = ["OK", "😂", "🤣", "👍", "🥹", "😭"];
const imDefaultReactions = [
  "OK", "👍", "🙏", "💪", "🫰", "👏", "🙌", "+1",
  "😄", "😊", "😆", "😁", "😅", "😂", "🤣", "🥹",
  "😉", "😎", "🤔", "😭", "🥺", "😴", "🤫", "😳",
  "😮", "😵", "😤", "😡", "🤯", "😘", "😇", "😐",
  "🙂", "🙃", "😌", "😋", "😝", "😏", "😔", "😪",
  "😷", "🤒", "🤕", "🤢", "🤮", "🥳", "🥰", "😍",
  "🤩", "😬", "😱", "😢", "😓", "😰", "😵‍💫", "🤗",
  "🤝", "👊", "✌️", "👌", "👋", "🤲", "💯", "✨",
  "🌹", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤",
  "🎉", "🎊", "🔥", "⭐", "🌟", "💡", "☕", "🍵",
  "🍰", "🍀", "🧽", "🧹", "🛠️", "📌", "✅", "🙇"
];

function ImReactionButton({
  emoji,
  onClick,
  compact = false
}: {
  emoji: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      className={cn(
        "focus-ring grid place-items-center rounded-2xl text-center font-black transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]",
        compact ? "h-12 min-w-12 px-1 text-[24px]" : "h-11 px-1 text-[25px]"
      )}
      onClick={onClick}
      type="button"
    >
      {emoji}
    </button>
  );
}

function ImMessageActionButton({
  item,
  isNight
}: {
  item: ImMessageActionSheetItem;
  isNight: boolean;
}) {
  const danger = item.tone === "danger";

  return (
    <button
      className={cn(
        "focus-ring min-w-0 rounded-[18px] px-2 py-3 text-center transition",
        "bg-[color:color-mix(in_srgb,var(--client-surface)_78%,var(--client-bg)_22%)] text-[color:var(--client-text)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_13%,var(--client-surface)_87%)]",
        danger && (isNight ? "text-[#ff8e80]" : "text-[#ef4f3f]"),
        item.disabled && "cursor-not-allowed bg-[color:color-mix(in_srgb,var(--client-line)_24%,transparent)] text-[color:color-mix(in_srgb,var(--client-muted)_55%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--client-line)_24%,transparent)]"
      )}
      disabled={item.disabled}
      onClick={item.onClick}
      type="button"
    >
      <span className={cn("mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--client-line)_30%,transparent)]", item.disabled && "bg-[color:color-mix(in_srgb,var(--client-line)_18%,transparent)]")}>
        <ImIcon name={item.icon === "pin" ? "top" : item.icon} />
      </span>
      <span className="mt-2 block truncate text-xs font-black">{item.label}</span>
    </button>
  );
}

export function ImMessageActionSheet({
  actions,
  expanded,
  isNight,
  listActions = [],
  onClose,
  onExpandedChange,
  onReact
}: {
  actions: ImMessageActionSheetItem[];
  expanded: boolean;
  isNight: boolean;
  listActions?: ImMessageActionSheetItem[];
  onClose: () => void;
  onExpandedChange: (expanded: boolean) => void;
  onReact: (emoji: string) => void;
}) {
  const expandedRef = useRef(expanded);
  const handleDragRef = useRef<{ startY: number; moved: boolean; closed: boolean } | null>(null);
  const handleDragAbortRef = useRef<AbortController | null>(null);
  const activeHandlePointerIdRef = useRef<number | null>(null);
  const suppressHandleClickRef = useRef(false);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    return () => {
      handleDragAbortRef.current?.abort();
      handleDragAbortRef.current = null;
    };
  }, []);

  const suppressNextHandleClick = () => {
    suppressHandleClickRef.current = true;

    if (typeof window === "undefined") {
      return;
    }

    window.setTimeout(() => {
      suppressHandleClickRef.current = false;
    }, 0);
  };

  const updateExpandedFromDrag = (clientY: number) => {
    const drag = handleDragRef.current;

    if (!drag || drag.closed) {
      return;
    }

    const deltaY = clientY - drag.startY;

    if (Math.abs(deltaY) > 6) {
      drag.moved = true;
    }

    if (!drag.moved) {
      return;
    }

    if (deltaY < -28) {
      expandedRef.current = true;
      onExpandedChange(true);
      drag.startY = clientY;
      return;
    }

    if (deltaY > 36) {
      if (expandedRef.current) {
        if (deltaY > 96) {
          drag.closed = true;
          suppressNextHandleClick();
          onClose();
          return;
        }

        expandedRef.current = false;
        onExpandedChange(false);
        drag.startY = clientY;
        return;
      }

      drag.closed = true;
      suppressNextHandleClick();
      onClose();
    }
  };

  const finishHandleDrag = () => {
    const drag = handleDragRef.current;

    handleDragAbortRef.current?.abort();
    handleDragAbortRef.current = null;
    activeHandlePointerIdRef.current = null;

    if (drag?.moved) {
      suppressNextHandleClick();
    }

    handleDragRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    handleDragRef.current = { startY: event.clientY, moved: false, closed: false };
    activeHandlePointerIdRef.current = event.pointerId;
    handleDragAbortRef.current?.abort();

    const controller = new AbortController();
    handleDragAbortRef.current = controller;

    window.addEventListener(
      "pointermove",
      (nativeEvent) => {
        if (nativeEvent.pointerId !== activeHandlePointerIdRef.current) {
          return;
        }

        updateExpandedFromDrag(nativeEvent.clientY);

        if (handleDragRef.current?.moved && nativeEvent.cancelable) {
          nativeEvent.preventDefault();
        }
      },
      { passive: false, signal: controller.signal }
    );
    window.addEventListener(
      "pointerup",
      (nativeEvent) => {
        if (nativeEvent.pointerId === activeHandlePointerIdRef.current) {
          finishHandleDrag();
        }
      },
      { passive: true, signal: controller.signal }
    );
    window.addEventListener(
      "pointercancel",
      (nativeEvent) => {
        if (nativeEvent.pointerId === activeHandlePointerIdRef.current) {
          finishHandleDrag();
        }
      },
      { passive: true, signal: controller.signal }
    );
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture release is best-effort across mobile browsers.
    }

    finishHandleDrag();
  };

  const handleHandleClick = () => {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }

    onExpandedChange(!expandedRef.current);
  };

  const sheetClass = "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_96%,var(--client-bg)_4%)] text-[color:var(--client-text)] shadow-[0_-18px_48px_color-mix(in_srgb,var(--client-shadow)_24%,transparent)]";
  const listShellClass = "divide-y divide-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,var(--client-bg)_24%)]";

  return (
    <section
      className={cn("relative z-20 shrink-0 overflow-hidden rounded-t-[28px] border-t backdrop-blur-xl transition-[height] duration-200", sheetClass)}
      data-im-message-action-sheet="true"
      style={{ height: expanded ? "min(76dvh, 620px)" : "min(43dvh, 360px)" }}
    >
      <button
        aria-label={expanded ? "收起消息操作面板" : "展开消息操作面板"}
        className="focus-ring mx-auto mt-2 block h-8 w-20 touch-none rounded-full text-[color:var(--client-muted)]"
        onClick={handleHandleClick}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => {
          updateExpandedFromDrag(event.clientY);
          if (handleDragRef.current?.moved) {
            event.preventDefault();
          }
        }}
        onPointerUp={handlePointerUp}
        type="button"
      >
        <span className="mx-auto block h-1.5 w-11 rounded-full bg-[color:color-mix(in_srgb,var(--client-muted)_28%,transparent)]" />
      </button>

      <div className="scrollbar-none h-[calc(100%-2.5rem)] touch-pan-y overflow-y-auto overscroll-y-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 [-webkit-overflow-scrolling:touch]">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] items-center gap-1 py-2">
          {imQuickReactions.map((emoji) => (
            <ImReactionButton emoji={emoji} key={emoji} onClick={() => onReact(emoji)} />
          ))}
          <button
            aria-label={expanded ? "收起默认表情" : "展开默认表情"}
            className={cn(
              "focus-ring grid h-11 place-items-center rounded-full transition",
              "bg-[color:color-mix(in_srgb,var(--client-line)_30%,transparent)] text-[color:var(--client-muted)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
            )}
            onClick={() => onExpandedChange(!expanded)}
            type="button"
          >
            <ImIcon name="more" />
          </button>
        </div>

        {expanded ? (
          <div className="space-y-4 pb-4 pt-1">
            <section>
              <p className="mb-2 text-xs font-black text-[color:var(--client-muted)]">默认表情</p>
              <div className="grid grid-cols-7 gap-2 sm:grid-cols-9">
                {imDefaultReactions.map((emoji) => (
                  <ImReactionButton compact emoji={emoji} key={`default-${emoji}`} onClick={() => onReact(emoji)} />
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {actions.length > 0 ? (
          <div className="grid grid-cols-4 gap-3">
            {actions.map((item) => (
              <ImMessageActionButton isNight={isNight} item={item} key={item.key} />
            ))}
          </div>
        ) : null}

        {listActions.length > 0 ? (
          <div className={cn("mt-4 overflow-hidden rounded-[22px]", listShellClass)}>
            {listActions.map((item) => (
              <button
                className={cn(
                  "focus-ring flex w-full items-center gap-3 px-4 py-4 text-left text-[15px] font-black transition",
                  "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]",
                  item.tone === "danger" && (isNight ? "text-[#ff8e80]" : "text-[#ef4f3f]"),
                  item.disabled && "cursor-not-allowed text-[color:color-mix(in_srgb,var(--client-muted)_55%,transparent)] hover:bg-transparent"
                )}
                disabled={item.disabled}
                key={item.key}
                onClick={item.onClick}
                type="button"
              >
                <ImIcon className="h-5 w-5 shrink-0" name={item.icon} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <button
          className="focus-ring mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black text-[color:var(--client-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--client-line)_18%,transparent)]"
          onClick={onClose}
          type="button"
        >
          收起
        </button>
      </div>
    </section>
  );
}

export function ImEmptyState({
  title,
  caption,
  action
}: {
  title: string;
  caption: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-8 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
        <ImIcon name="service" />
      </div>
      <h3 className="mt-4 text-base font-black text-[color:var(--client-text)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{caption}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ToggleRow({
  title,
  caption,
  checked,
  onChange
}: {
  title: string;
  caption?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-4 py-3">
      <div className="min-w-0">
        <div className="text-[15px] font-black text-[color:var(--client-text)]">{title}</div>
        {caption ? <p className="mt-1 text-xs text-[color:var(--client-muted)]">{caption}</p> : null}
      </div>
      <ToggleSwitch ariaLabel={title} checked={checked} onChange={onChange} size="md" />
    </div>
  );
}

function formatSize(bytes?: number) {
  if (!bytes) {
    return "0 KB";
  }

  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

function previewLabel(type: ImMessageType) {
  const map: Record<ImMessageType, string> = {
    text: "文本",
    emoji: "表情",
    image: "图片",
    voice: "语音",
    video: "视频",
    file: "文件",
    location: "位置",
    "contact-card": "名片",
    system: "系统消息",
    recalled: "撤回消息"
  };

  return map[type];
}

function formatDisappearingRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (days > 0) {
    return `${days}日 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
}

function DisappearingCountdownStatus({
  disappearing,
  now: externalNow
}: {
  disappearing: NonNullable<MessageExt["disappearing"]>;
  now?: number;
}) {
  const [internalNow, setInternalNow] = useState(() => Date.now());
  const remainingTextRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!disappearing.expiresAt) {
      return undefined;
    }

    const updateRemainingText = () => {
      const nextNow = Date.now();
      const expiresAtMs = new Date(disappearing.expiresAt ?? "").getTime();
      const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - nextNow) : 0;

      if (remainingTextRef.current) {
        remainingTextRef.current.textContent = formatDisappearingRemaining(remainingMs);
      }

      setInternalNow(nextNow);
    };

    updateRemainingText();
    const timer = window.setInterval(updateRemainingText, 500);
    return () => window.clearInterval(timer);
  }, [disappearing.expiresAt]);

  const now = externalNow ?? internalNow;

  if (!disappearing.expiresAt) {
    return (
      <div className="mt-1 w-full max-w-[220px] px-1">
        <p className="text-[11px] font-black text-[color:var(--client-primary)]">
          {disappearing.mode === "read_by_all" ? "等待全员已读后开始倒计时" : "消失倒计时准备中"}
        </p>
      </div>
    );
  }

  const expiresAtMs = new Date(disappearing.expiresAt).getTime();
  const remainingMs = Math.max(0, expiresAtMs - now);
  return (
    <div className="mt-1 w-full max-w-[220px] px-1">
      <div aria-live="polite" className="text-[11px] font-black text-[color:var(--client-primary)]">
        <span className="tabular-nums">
          剩余 <span ref={remainingTextRef}>{formatDisappearingRemaining(remainingMs)}</span>
        </span>
      </div>
    </div>
  );
}

function contactCardKindLabel(profileKind: NonNullable<MessageExt["contactCard"]>["profileKind"]) {
  if (profileKind === "store") {
    return "店铺名片";
  }

  if (profileKind === "technician") {
    return "技师名片";
  }

  if (profileKind === "person") {
    return "用户名片";
  }

  return "服务号名片";
}

export function MessageBubble({
  message,
  isMine,
  avatar,
  avatarTo,
  senderName,
  showSender,
  quotedMessage,
  quotedSenderName,
  quotedSenderAvatar,
  reactions = [],
  onToggleReaction,
  disappearingNow,
  onPreviewMedia,
  onOpenContact,
  renderContactCard,
  renderContactCardAction
}: {
  message: ConversationMessage;
  isMine: boolean;
  avatar?: string;
  avatarTo?: string;
  senderName?: string;
  showSender?: boolean;
  quotedMessage?: ConversationMessage;
  quotedSenderName?: string;
  quotedSenderAvatar?: string;
  reactions?: ImMessageReactionSummary[];
  onToggleReaction?: (emoji: string) => void;
  disappearingNow?: number;
  onPreviewMedia?: (message: ConversationMessage) => void;
  onOpenContact?: (userId: string) => void;
  renderContactCard?: (contactCard: NonNullable<MessageExt["contactCard"]>, message: ConversationMessage) => ReactNode;
  renderContactCardAction?: (contactCard: NonNullable<MessageExt["contactCard"]>, message: ConversationMessage) => ReactNode;
}) {
  const bubbleClass = isMine ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "bg-[color:var(--client-surface)] text-[color:var(--client-text)]";
  const disappearing = message.ext?.disappearing;
  const [expandedReactionEmoji, setExpandedReactionEmoji] = useState<string | null>(null);
  const quotedPreview = quotedMessage?.content || (quotedMessage ? previewLabel(quotedMessage.type) : "");
  const quotedAuthor = quotedSenderName ?? (quotedMessage?.senderId === message.senderId ? (isMine ? "我" : senderName ?? "对方") : "前文消息");

  if (message.type === "system" || message.type === "recalled") {
    const label = message.type === "recalled" ? (isMine ? "你已经撤回" : "对方已经撤回") : message.content;
    return <div className="px-8 py-2 text-center text-xs font-bold text-[color:var(--client-muted)]">{label}</div>;
  }

  const bubbleContent = (() => {
    if (message.type === "text" || message.type === "emoji") {
      return <p className={cn("min-w-0 max-w-full whitespace-pre-wrap break-words text-[15px] leading-6 [overflow-wrap:anywhere]", message.type === "emoji" && "text-[28px]")} data-im-message-selectable-text="true">{message.content}</p>;
    }

    if (message.type === "image" || message.type === "video") {
      return (
        <div className="space-y-2">
          <button className="relative overflow-hidden rounded-2xl" onClick={() => onPreviewMedia?.(message)} type="button">
            <img alt={message.ext?.fileName ?? previewLabel(message.type)} className="max-h-[220px] w-[180px] object-cover" src={message.ext?.thumbnailUrl ?? message.content} />
            {message.type === "video" ? (
              <span className="absolute inset-0 grid place-items-center bg-black/24 text-white">
                <ImIcon className="h-9 w-9" name="video" />
              </span>
            ) : null}
          </button>
          {message.ext?.caption ? (
            <p className="min-w-0 max-w-[180px] whitespace-pre-wrap break-words text-[14px] leading-5 [overflow-wrap:anywhere]" data-im-message-selectable-text="true">
              {message.ext.caption}
            </p>
          ) : null}
        </div>
      );
    }

    if (message.type === "voice") {
      return (
        <div className="min-w-[200px] space-y-2">
          <div className="flex items-center gap-2">
            <ImIcon className="h-4 w-4" name="mic" />
            <div className="h-0.5 flex-1 rounded-full bg-black/20" />
            <span className="text-sm">{message.ext?.duration ?? 0}"</span>
          </div>
          <audio
            className="block h-10 w-full max-w-[220px]"
            controls
            preload="none"
            src={message.ext?.url ?? message.content}
          />
        </div>
      );
    }

    if (message.type === "file") {
      return (
        <div className="flex min-w-[220px] items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-black/6">
              <ImIcon name="file" />
            </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{message.ext?.fileName ?? "未命名文件"}</p>
            <p className={cn("mt-1 text-xs", isMine ? "text-[color:var(--client-primary-contrast-muted)]" : "text-ink/45")}>{formatSize(message.ext?.fileSize)}</p>
          </div>
        </div>
      );
    }

    if (message.type === "location") {
      return (
        <div className={cn("w-[220px] overflow-hidden rounded-2xl", isMine ? "bg-[color:color-mix(in_srgb,var(--client-primary-contrast)_12%,transparent)]" : "bg-black/[0.04]")}>
          <div className="h-24 bg-[linear-gradient(135deg,#b6e3cf_0%,#dff2ea_55%,#f9fbf7_100%)]" />
          <div className="px-3 py-3">
            <p className="text-[14px] font-medium">{message.ext?.location?.title ?? "位置"}</p>
            <p className={cn("mt-1 text-xs leading-5", isMine ? "text-[color:var(--client-primary-contrast-muted)]" : "text-ink/45")}>{message.ext?.location?.address}</p>
          </div>
        </div>
      );
    }

    if (message.type === "contact-card" && message.ext?.contactCard) {
      const card = message.ext.contactCard;
      const customCard = renderContactCard?.(card, message);
      const caption = card.headline ?? card.userIdLabel ?? contactCardKindLabel(card.profileKind);
      const action = renderContactCardAction?.(card, message);

      if (customCard) {
        return customCard;
      }

      return (
        <div className="w-[248px] overflow-hidden rounded-2xl bg-white/72 text-[color:var(--client-text)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
          <button className="block w-full p-3 text-left" onClick={() => onOpenContact?.(card.userId)} type="button">
            <div className="flex items-center gap-3">
              <AvatarImage alt={card.displayName} className="h-12 w-12" src={card.avatar} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-black">{card.displayName}</p>
                <p className={cn("mt-1 line-clamp-1 text-xs", isMine ? "text-[color:var(--client-primary-contrast-muted)]" : "text-ink/52")}>{caption}</p>
              </div>
            </div>
          </button>
          <div className="flex items-center justify-between gap-3 border-t border-black/5 px-3 py-2">
            <span className={cn("text-[11px] font-black", isMine ? "text-[color:var(--client-primary-contrast-muted)]" : "text-ink/42")}>{contactCardKindLabel(card.profileKind)}</span>
            {action}
          </div>
        </div>
      );
    }

    return <p className="min-w-0 max-w-full break-words text-[15px] [overflow-wrap:anywhere]" data-im-message-selectable-text="true">{message.content}</p>;
  })();

  const status = isMine
    ? message.status === "sending"
      ? "发送中"
      : message.status === "failed"
        ? "发送失败"
        : undefined
    : undefined;

  const avatarNode = (
    <InteractiveAvatar
      alt={isMine ? "我的头像" : senderName ?? "联系人"}
      className="h-9 w-9"
      src={avatar}
      stopPropagation
      to={avatarTo}
    />
  );
  const quoteNode = quotedMessage ? (
    <div className={cn("mb-2 w-full border-b pb-2", isMine ? "border-[color:color-mix(in_srgb,var(--client-primary-contrast)_18%,transparent)] text-[color:var(--client-primary-contrast-muted)]" : "border-[color:color-mix(in_srgb,var(--client-line)_18%,transparent)] text-[color:var(--client-muted)]")}>
      <div className="flex min-w-0 items-center gap-2">
        {quotedSenderAvatar ? (
          <AvatarImage alt={quotedAuthor} className="h-7 w-7 shrink-0" src={quotedSenderAvatar} />
        ) : (
          <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-[11px] font-black", isMine ? "bg-black/[0.06]" : "bg-[color:color-mix(in_srgb,var(--client-line)_18%,transparent)]")}>
            {quotedAuthor.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[13px] font-black">{quotedAuthor}</p>
          <p className="mt-0.5 line-clamp-1 whitespace-pre-wrap break-words text-[13px] leading-5 opacity-80 [overflow-wrap:anywhere]">{quotedPreview}</p>
        </div>
      </div>
    </div>
  ) : null;
  const reactionNode = reactions.length > 0 ? (
    <div className="mt-2 flex max-w-full flex-wrap gap-1.5">
      {reactions.map((reaction) => {
        const names = reaction.people.map((person) => person.name).filter(Boolean);
        const nameLabel = names.length > 2 ? `${names[0]}等${names.length}人` : names.join("、");
        const expanded = expandedReactionEmoji === reaction.emoji;

        return (
          <span className={cn("relative inline-flex min-w-0 items-center overflow-visible rounded-full px-1.5 py-1", isMine ? "bg-black/[0.08]" : "bg-[color:color-mix(in_srgb,var(--client-line)_18%,transparent)]")} key={`${message.id}-${reaction.emoji}`}>
            <button
              aria-pressed={reaction.reactedByMe}
              className={cn(
                "grid h-7 min-w-7 shrink-0 place-items-center rounded-[10px] px-1 text-[18px] transition",
                reaction.reactedByMe ? (isMine ? "bg-black/[0.12]" : "bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)]") : "hover:bg-black/[0.06]"
              )}
              key={`${message.id}-${reaction.emoji}-emoji`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleReaction?.(reaction.emoji);
              }}
              type="button"
            >
              {reaction.emoji}
            </button>
            <button
              className="min-w-0 max-w-[9rem] truncate px-2 text-left text-[12px] font-black opacity-78"
              key={`${message.id}-${reaction.emoji}-names`}
              onClick={(event) => {
                event.stopPropagation();
                setExpandedReactionEmoji(expanded ? null : reaction.emoji);
              }}
              type="button"
            >
              {nameLabel || `${reaction.people.length}人`}
            </button>
            {expanded ? (
              <span className={cn("absolute bottom-[calc(100%+6px)] left-0 z-20 min-w-[160px] rounded-[14px] px-3 py-2 text-left text-[12px] font-black shadow-[0_10px_24px_rgba(0,0,0,0.22)]", isMine ? "bg-[#18231e] text-white" : "bg-[color:var(--client-elevated)] text-[color:var(--client-text)]")}>
                {reaction.people.map((person) => (
                  <span className="flex min-w-0 items-center gap-2 py-1" key={person.id}>
                    {person.avatar ? <AvatarImage alt={person.name} className="h-6 w-6 shrink-0" src={person.avatar} /> : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] bg-black/[0.08]">{person.name.slice(0, 1)}</span>}
                    <span className="truncate">{person.name}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  ) : null;
  const bubbleShellClass = message.type === "contact-card" && !quotedMessage ? "rounded-[24px]" : cn("rounded-[20px] px-3 py-2", bubbleClass);
  const contentNode = quoteNode || reactionNode ? (
    <div className="min-w-0 max-w-full overflow-hidden">
      {quoteNode}
      {bubbleContent}
      {reactionNode}
    </div>
  ) : bubbleContent;

  return (
    <div className={cn("flex items-end gap-2 px-3 py-1", isMine ? "justify-end" : "justify-start")}>
      {!isMine ? avatarNode : null}
      <div className={cn("flex flex-col", message.type === "contact-card" ? "max-w-[calc(100%-3.25rem)]" : "max-w-[78%]", isMine ? "items-end" : "items-start")}>
        {showSender && !isMine ? <p className="mb-1 px-1 text-[11px] font-bold text-[color:var(--client-muted)]">{senderName}</p> : null}
        <div className={cn("inline-flex min-w-0 max-w-full overflow-hidden", bubbleShellClass)} data-im-message-bubble="true">{contentNode}</div>
        {disappearing ? <DisappearingCountdownStatus disappearing={disappearing} now={disappearingNow} /> : null}
        {status ? <p className={cn("mt-1 px-1 text-[11px] font-bold", message.status === "failed" ? "text-[#ef4f3f]" : "text-[color:var(--client-muted)]")}>{status}</p> : null}
      </div>
      {isMine ? avatarNode : null}
    </div>
  );
}

export function DetailRow({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] py-3 last:border-b-0">
      <span className="w-20 shrink-0 text-sm font-bold text-[color:var(--client-muted)]">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-[color:var(--client-text)]">{value}</div>
    </div>
  );
}

export function ContactSummaryCard({
  user,
  contact,
  detailTo,
  hiddenTags = [],
  onOpenDetails,
  showTags = true
}: {
  user: ImUser;
  contact?: ContactRelation;
  detailTo?: string;
  hiddenTags?: string[];
  onOpenDetails?: () => void;
  showTags?: boolean;
}) {
  const chips = useMemo(() => {
    const hiddenTagSet = new Set(hiddenTags);
    return Array.from(new Set([...(contact?.tags ?? []), ...user.tags])).filter((tag) => !hiddenTagSet.has(tag)).slice(0, 4);
  }, [contact?.tags, hiddenTags, user.tags]);
  const signatureCaption = getImContactSignatureCaption(user);
  const summary = (
    <div className="flex items-center gap-4">
      <AvatarImage alt={user.nickname} className="h-16 w-16" src={user.avatar} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[22px] font-black text-[color:var(--client-text)]">{getDisplayName(user, contact)}</h2>
        {signatureCaption ? <p className="mt-1 text-sm text-[color:var(--client-muted)]">{signatureCaption}</p> : null}
        <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">ID {user.userIdLabel}</p>
      </div>
    </div>
  );

  const header = detailTo ? (
    <Link className="block text-left" to={detailTo}>
      {summary}
    </Link>
  ) : onOpenDetails ? (
    <button className="block w-full text-left" onClick={onOpenDetails} type="button">
      {summary}
    </button>
  ) : (
    summary
  );

  return (
    <section className="rounded-[26px] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-5 py-5 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
      {header}
      {showTags && chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-xs font-black text-[color:var(--client-primary)]" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
