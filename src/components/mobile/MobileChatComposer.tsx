import { cn } from "../../lib/utils";

export type MobileChatComposerActionKey =
  | "image"
  | "order"
  | "location"
  | "camera"
  | "videoCall"
  | "call"
  | "intro"
  | "payment";

export type MobileChatComposerAction = {
  accept?: string;
  key: MobileChatComposerActionKey;
  label: string;
  onClick?: () => void;
  onFileSelect?: (fileName?: string) => void;
};

function MobileChatComposerIcon({
  name
}: {
  name: MobileChatComposerActionKey | "emoji" | "mic" | "plus" | "send" | "voice";
}) {
  if (name === "voice") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M12 5.5a3 3 0 0 1 3 3v3a3 3 0 0 1-6 0v-3a3 3 0 0 1 3-3ZM7.5 11.5a4.5 4.5 0 0 0 9 0M12 16v2.5M9 19.5h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "camera") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M8 7.5 9.5 5h5L16 7.5h2A2 2 0 0 1 20 9.5v7A2 2 0 0 1 18 18.5H6A2 2 0 0 1 4 16.5v-7A2 2 0 0 1 6 7.5h2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "videoCall") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="10" rx="2" stroke="currentColor" strokeWidth="2" width="11" x="4" y="7" />
        <path d="m15 10 4-2v8l-4-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "call") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M7.2 4.8 9.3 4c.7-.3 1.5 0 1.8.7l1 2.4c.2.6.1 1.2-.4 1.6l-1.1 1c.8 1.7 2 3 3.7 3.8l1.1-1c.5-.4 1.1-.5 1.7-.2l2.3 1.1c.7.3 1 1.1.7 1.8l-.9 2.1c-.3.7-1 1.1-1.7 1-7-.9-12.4-6.3-13.3-13.2-.1-.8.3-1.5 1-1.8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "intro") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M7.5 7.5h9a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-6.8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
        <path d="M9.2 11.2h5.6M9.2 14.2h3.8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "payment") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="12" rx="2.5" stroke="currentColor" strokeWidth="2" width="16" x="4" y="6" />
        <path d="M4 10h16M8 14h3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "emoji") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <circle cx="9" cy="10" fill="currentColor" r="1" />
        <circle cx="15" cy="10" fill="currentColor" r="1" />
        <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "mic") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M12 5.5a2.8 2.8 0 0 1 2.8 2.8v3.4a2.8 2.8 0 1 1-5.6 0V8.3A2.8 2.8 0 0 1 12 5.5ZM7.8 11.7a4.2 4.2 0 1 0 8.4 0M12 16v2.5M9.4 19.5h5.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "image") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="14" rx="3" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
        <circle cx="9" cy="10" fill="currentColor" r="1.6" />
        <path d="m7 17 4-4 2.5 2.5 2.5-3 2 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "order") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M8 4.5h8M8 8h8M7 3h10a2 2 0 0 1 2 2v14l-3.5-2-3.5 2-3.5-2-3.5 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "location") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M12 20s6-4.6 6-10a6 6 0 1 0-12 0c0 5.4 6 10 6 10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M4.5 12 19 5.5l-3.4 13-3.3-4.1L8.6 18l1.1-5.2L4.5 12Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.7 12.8 19 5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function MobileChatComposer({
  actions = [],
  dark = false,
  draft,
  onDraftChange,
  onEmoji,
  onSend,
  onToggleActions,
  onVoice,
  placeholder = "输入信息",
  showActions = false
}: {
  actions?: MobileChatComposerAction[];
  dark?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onEmoji?: () => void;
  onSend: () => void;
  onToggleActions?: () => void;
  onVoice?: () => void;
  placeholder?: string;
  showActions?: boolean;
}) {
  const footerClass = dark ? "border-[#3d3018]/45 bg-[#0b0907]/96 backdrop-blur-xl" : "border-line bg-white/96 backdrop-blur-xl";
  const composerShellClass = dark ? "border-[#3d3018]/55 bg-[#14110e]" : "border-line bg-white";
  const composerLabelClass = dark ? "text-[#f7ead0]/38" : "text-ink/35";
  const composerInputClass = dark ? "text-[color:var(--client-text)] placeholder:text-[color:var(--client-muted)]" : "text-ink placeholder:text-ink/45";
  const iconButtonClass = dark ? "border-[#4b3a1d]/55 bg-[#11100e] text-white/82" : "border-line bg-white text-ink/72";

  return (
    <footer
      className={cn("shrink-0 border-t px-3 pt-2 pb-[calc(max(env(safe-area-inset-bottom),6px)+16px)]", footerClass)}
      data-im-composer-root="true"
    >
      {showActions && actions.length > 0 ? (
        <div className={cn("mb-3 rounded-[26px] border px-3 py-4 shadow-panel", composerShellClass)}>
          <div className="grid grid-cols-4 gap-x-3 gap-y-4">
            {actions.map((item) => {
              const content = (
                <div className="flex flex-col items-center gap-2">
                  <span className={cn("grid h-14 w-14 place-items-center rounded-[18px]", dark ? "bg-[#1c1916] text-white/88" : "bg-[#eef4ef] text-ink/82")}>
                    <MobileChatComposerIcon name={item.key} />
                  </span>
                  <span className={cn("text-[11px] font-bold", composerLabelClass)}>{item.label}</span>
                </div>
              );

              if (item.onFileSelect) {
                return (
                  <label className="cursor-pointer" key={item.key}>
                    <input
                      accept={item.accept}
                      className="hidden"
                      type="file"
                      onChange={(event) => item.onFileSelect?.(event.target.files?.[0]?.name)}
                    />
                    {content}
                  </label>
                );
              }

              return (
                <button className="text-center" key={item.key} onClick={item.onClick} type="button">
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <button
          className={cn("focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border shadow-panel transition", iconButtonClass)}
          onClick={onVoice}
          type="button"
        >
          <MobileChatComposerIcon name="voice" />
        </button>
        <div className={cn("flex min-w-0 flex-1 items-end gap-2 rounded-[28px] border px-3 py-2 shadow-panel", composerShellClass)}>
          <div className={cn("flex h-12 min-w-0 flex-1 items-center rounded-[16px] px-3", dark ? "bg-[#2b2a29]" : "bg-[#edf0ee]")}>
            <input
              className={cn("h-full min-w-0 flex-1 bg-transparent text-sm outline-none", composerInputClass)}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSend();
                }
              }}
              placeholder={placeholder}
              value={draft}
            />
            <button
              className={cn(
                "focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full transition",
                draft.trim()
                  ? (dark ? "bg-[#f3cf78] text-[#17130f]" : "bg-moss text-[color:var(--client-primary-contrast)]")
                  : (dark ? "text-white/58 hover:text-white" : "text-ink/45 hover:text-ink")
              )}
              onClick={draft.trim() ? onSend : onVoice}
              type="button"
            >
              <MobileChatComposerIcon name={draft.trim() ? "send" : "mic"} />
            </button>
          </div>
          <button
            className={cn("focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border transition", iconButtonClass)}
            onClick={onEmoji}
            type="button"
          >
            <MobileChatComposerIcon name="emoji" />
          </button>
          <button
            className={cn("focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border transition", iconButtonClass)}
            onClick={onToggleActions}
            type="button"
          >
            <MobileChatComposerIcon name="plus" />
          </button>
        </div>
      </div>
    </footer>
  );
}
