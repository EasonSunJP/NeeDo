import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type ContactEventTimelineTone = "neutral" | "red" | "green" | "accent";

export type ContactEventTimelineEntry = {
  actorAvatarSrc?: string;
  actorName?: ReactNode;
  actorRole?: ReactNode;
  atLabel: ReactNode;
  conflicts?: ReactNode[];
  detail?: ReactNode;
  icon?: ReactNode;
  id: string;
  message?: ReactNode;
  operator?: ReactNode;
  reason?: ReactNode;
  reasonLabel?: ReactNode;
  title: ReactNode;
  tone?: ContactEventTimelineTone;
};

export function ContactEventTimeline({
  className,
  commentAuthorAvatarSrc,
  commentAuthorName = "我",
  commentAuthorRole = "评论",
  commentButtonLabel = "评论",
  commentPlaceholder = "写下留言...",
  emptyLabel = "暂无时间轴记录。",
  events,
  onCommentSubmit
}: {
  className?: string;
  commentAuthorAvatarSrc?: string;
  commentAuthorName?: string;
  commentAuthorRole?: string;
  commentButtonLabel?: string;
  commentPlaceholder?: string;
  emptyLabel?: ReactNode;
  events: ContactEventTimelineEntry[];
  onCommentSubmit?: (comment: string) => void;
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentEvents, setCommentEvents] = useState<ContactEventTimelineEntry[]>([]);
  const renderedEvents = [...events, ...commentEvents];
  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const comment = commentDraft.trim();

    if (!comment) {
      return;
    }

    if (onCommentSubmit) {
      onCommentSubmit(comment);
    } else {
      setCommentEvents((current) => [
        ...current,
        {
          actorName: commentAuthorName,
          actorRole: commentAuthorRole,
          actorAvatarSrc: commentAuthorAvatarSrc,
          atLabel: "刚刚",
          id: `comment-${Date.now()}-${current.length}`,
          message: comment,
          title: commentAuthorRole,
          tone: "green"
        }
      ]);
    }
    setCommentDraft("");
    setCommentOpen(false);
  };

  if (renderedEvents.length === 0) {
    return (
      <div className={cn("grid gap-4", className)}>
        <div className="rounded-[18px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-4 py-6 text-center text-xs font-bold text-[color:var(--client-muted)]">
          {emptyLabel}
        </div>
        <ContactEventTimelineCommentRow
          buttonLabel={commentButtonLabel}
          commentAuthorAvatarSrc={commentAuthorAvatarSrc}
          commentAuthorName={commentAuthorName}
          commentDraft={commentDraft}
          commentOpen={commentOpen}
          onChange={setCommentDraft}
          onClose={() => {
            setCommentDraft("");
            setCommentOpen(false);
          }}
          onOpen={() => setCommentOpen(true)}
          onSubmit={handleCommentSubmit}
          placeholder={commentPlaceholder}
        />
      </div>
    );
  }

  return (
    <div className={cn("grid gap-0", className)}>
      {renderedEvents.map((event, index) => {
        const actorName = event.actorName ?? event.operator ?? event.title;
        const actorRole = event.actorRole ?? event.title;
        const message = event.message ?? event.detail;
        const isLastEvent = index === renderedEvents.length - 1;
        const isSystemEvent = isSystemTimelineEvent(event, actorName, actorRole);
        const systemIcon = isSystemEvent ? <ContactEventTimelineComputerIcon warning={isBlockingSystemTimelineEvent(event, actorName, actorRole)} /> : undefined;

        return (
          <div className="grid grid-cols-[96px,22px,minmax(0,1fr)] gap-3" key={event.id}>
            <div className="break-words whitespace-pre-line pt-1 text-right text-[11px] font-medium leading-5 text-[color:var(--client-muted)] tabular-nums">
              {formatContactTimelineAtLabel(event.atLabel, message)}
            </div>
            <div className="relative flex justify-center pb-7 pt-1">
              {index > 0 ? (
                <span className={cn("absolute left-1/2 top-0 h-2 w-px -translate-x-1/2", getContactEventTimelineLineClassName(renderedEvents[index - 1]?.tone))} />
              ) : null}
              <span className={cn("absolute left-1/2 top-[18px] w-px -translate-x-1/2", isLastEvent ? "bottom-[-18px]" : "bottom-0", getContactEventTimelineLineClassName(event.tone))} />
              <span className={cn("relative z-[1] h-[14px] w-[14px] rounded-full shadow-[0_0_0_4px_color-mix(in_srgb,var(--client-bg)_86%,transparent)]", getContactEventTimelineDotClassName(event.tone))} />
            </div>
            <div className={cn("min-w-0 pb-5", index === renderedEvents.length - 1 && "pb-0")}>
              <div className="grid grid-cols-[40px,minmax(0,1fr)] items-start gap-2.5">
                <ContactEventTimelineAvatar
                  icon={systemIcon ?? event.icon}
                  name={actorName}
                  src={event.actorAvatarSrc}
                  tone={event.tone === "red" ? "red" : "neutral"}
                />
                <div className="min-w-0">
                  <div
                    className={cn(
                      "max-w-full rounded-[18px] rounded-tl-[8px] px-3.5 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.08)]",
                      event.tone === "red"
                        ? "border border-[#ef4444]/35 bg-[#ef4444]/10"
                        : "bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-primary)_8%)]"
                    )}
                  >
                    <p className={cn("text-[13px] font-black leading-5", event.tone === "red" ? "text-[#ef4444]" : "text-[color:var(--client-text)]")}>
                      <span>{actorName}（{actorRole}）：</span>
                      {message ? <span>{message}</span> : null}
                    </p>
                  </div>
                </div>
              </div>
              {event.conflicts && event.conflicts.length > 0 ? (
                <div className="mt-2 grid gap-2 pl-[50px]">
                  {event.conflicts.map((conflict, conflictIndex) => (
                    <div className="grid grid-cols-[auto,minmax(0,1fr)] items-start gap-2 rounded-[14px] border border-[#ef4444]/45 bg-[#ef4444]/10 px-3 py-2" key={`${event.id}-conflict-${conflictIndex}`}>
                      <RedAlertIcon />
                      <p className="text-[12px] font-black leading-5 text-[#ef4444]">{conflict}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {event.reason ? (
                <div className="mt-2 grid grid-cols-[34px,minmax(0,1fr)] gap-2 pl-[50px]">
                  <span className={cn("pt-2 text-[11px] font-black", event.tone === "red" ? "text-[#ef4444]" : "text-[color:var(--client-muted)]")}>
                    {event.reasonLabel ?? "理由"}
                  </span>
                  <p
                    className={cn(
                      "rounded-[14px] border px-3 py-2 text-[12px] font-bold leading-5",
                      event.tone === "red"
                        ? "border-[#ef4444]/45 bg-[#ef4444]/10 text-[#ef4444]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] text-[color:var(--client-muted)]"
                    )}
                  >
                    {event.reason}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <ContactEventTimelineCommentRow
        buttonLabel={commentButtonLabel}
        commentAuthorAvatarSrc={commentAuthorAvatarSrc}
        commentAuthorName={commentAuthorName}
        commentDraft={commentDraft}
        commentOpen={commentOpen}
        onChange={setCommentDraft}
        onClose={() => {
          setCommentDraft("");
          setCommentOpen(false);
        }}
        onOpen={() => setCommentOpen(true)}
        onSubmit={handleCommentSubmit}
        placeholder={commentPlaceholder}
      />
    </div>
  );
}

function ContactEventTimelineCommentRow({
  buttonLabel,
  commentAuthorAvatarSrc,
  commentAuthorName,
  commentDraft,
  commentOpen,
  onChange,
  onClose,
  onOpen,
  onSubmit,
  placeholder
}: {
  buttonLabel: string;
  commentAuthorAvatarSrc?: string;
  commentAuthorName: string;
  commentDraft: string;
  commentOpen: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onOpen: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!commentOpen) {
      return;
    }

    textareaRef.current?.focus({ preventScroll: true });
  }, [commentOpen]);

  return (
    <div className="grid grid-cols-[96px,22px,minmax(0,1fr)] gap-3">
      <div />
      <div className="relative flex justify-center py-1">
        <button
          aria-label={buttonLabel}
          aria-expanded={commentOpen}
          className="focus-ring relative z-[1] grid aspect-square h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--client-primary)] bg-[color:var(--client-bg)] p-0 text-[color:var(--client-primary)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--client-bg)_86%,transparent)] transition active:scale-95"
          onClick={onOpen}
          type="button"
        >
          <ChatBubbleIcon />
        </button>
      </div>
      <div className="min-w-0 py-1">
        <div className="grid grid-cols-[40px,minmax(0,1fr)] items-start gap-2.5">
          <ContactEventTimelineAvatar name={commentAuthorName} src={commentAuthorAvatarSrc} />
          <div className="min-w-0">
            {commentOpen ? (
              <form className="grid gap-2" onSubmit={onSubmit}>
                <textarea
                  autoFocus
                  className="min-h-[72px] w-full resize-none rounded-[10px] border-2 border-[color:var(--client-primary)] bg-transparent px-3 py-2 text-sm font-bold leading-5 text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
                  onChange={(event) => onChange(event.target.value)}
                  placeholder={placeholder}
                  ref={textareaRef}
                  value={commentDraft}
                />
                <div className="flex justify-end gap-2">
                  <button
                    className="focus-ring h-9 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-muted)]"
                    onClick={onClose}
                    type="button"
                  >
                    取消
                  </button>
                  <button className="focus-ring h-9 rounded-full bg-[color:var(--client-primary)] px-4 text-[12px] font-black text-[color:var(--client-primary-contrast)]" type="submit">
                    发送
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="focus-ring min-h-11 w-full rounded-[10px] border-2 border-[color:var(--client-primary)] bg-transparent px-3 text-left text-[12px] font-black text-[color:var(--client-primary)] transition active:scale-[0.99]"
                onClick={onOpen}
                type="button"
              >
                {buttonLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContactEventTimelinePanel({
  className,
  commentAuthorAvatarSrc,
  commentAuthorName,
  commentAuthorRole,
  commentButtonLabel,
  commentPlaceholder,
  emptyLabel,
  events,
  headerVariant = "bar",
  onCommentSubmit,
  timelineClassName,
  title
}: {
  className?: string;
  commentAuthorAvatarSrc?: string;
  commentAuthorName?: string;
  commentAuthorRole?: string;
  commentButtonLabel?: string;
  commentPlaceholder?: string;
  emptyLabel?: ReactNode;
  events: ContactEventTimelineEntry[];
  headerVariant?: "bar" | "plain";
  onCommentSubmit?: (comment: string) => void;
  timelineClassName?: string;
  title: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] shadow-panel",
        headerVariant === "plain" && "p-4",
        className
      )}
    >
      {headerVariant === "bar" ? (
        <h2 className="border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-3 text-base font-black text-[color:var(--client-text)]">{title}</h2>
      ) : (
        <p className="text-sm font-black text-[color:var(--client-text)]">{title}</p>
      )}
      <ContactEventTimeline
        className={cn(headerVariant === "bar" ? "px-4 py-4" : "mt-4", timelineClassName)}
        commentAuthorAvatarSrc={commentAuthorAvatarSrc}
        commentAuthorName={commentAuthorName}
        commentAuthorRole={commentAuthorRole}
        commentButtonLabel={commentButtonLabel}
        commentPlaceholder={commentPlaceholder}
        emptyLabel={emptyLabel}
        events={events}
        onCommentSubmit={onCommentSubmit}
      />
    </section>
  );
}

function getContactEventTimelineDotClassName(tone: ContactEventTimelineTone = "neutral") {
  if (tone === "red") {
    return "bg-[#ef4444]";
  }

  return "bg-[color:var(--client-primary)]";
}

function getContactEventTimelineLineClassName(tone: ContactEventTimelineTone = "green") {
  if (tone === "red") {
    return "bg-[#ef4444]";
  }

  return "bg-[color:color-mix(in_srgb,var(--client-primary)_72%,var(--client-line)_28%)]";
}

function ContactEventTimelineAvatar({
  icon,
  name,
  src,
  tone = "neutral"
}: {
  icon?: ReactNode;
  name: ReactNode;
  src?: string;
  tone?: "neutral" | "red";
}) {
  const fallback = typeof name === "string" ? name.slice(0, 1) : "管";

  return (
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[14px] border text-sm font-black",
        tone === "red"
          ? "border-[#ef5b55]/30 bg-[#ef5b55]/12 text-[#ef5b55]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-muted)]"
      )}
    >
      {src ? <img alt={typeof name === "string" ? name : "时间轴头像"} className="h-full w-full rounded-[14px] object-cover" src={src} /> : icon ?? <span>{fallback || "管"}</span>}
    </span>
  );
}

function getTimelineNodeText(value: ReactNode) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}

function padTimelineTimeSegment(value: number) {
  return String(value).padStart(2, "0");
}

function getTimelineTodayParts() {
  const now = new Date();

  return {
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    month: now.getMonth() + 1,
    second: now.getSeconds(),
    year: now.getFullYear()
  };
}

function getTimelineTodayKey() {
  const today = getTimelineTodayParts();

  return `${today.year}-${padTimelineTimeSegment(today.month)}-${padTimelineTimeSegment(today.day)}`;
}

function getTimelineTimePartsFromText(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  if (!match) {
    return null;
  }

  return {
    hour: Math.max(0, Math.min(23, Number(match[1]))),
    minute: Math.max(0, Math.min(59, Number(match[2]))),
    second: Math.max(0, Math.min(59, Number(match[3] ?? 0)))
  };
}

function formatContactTimelineAtLabel(value: ReactNode, fallback?: ReactNode) {
  const raw = getTimelineNodeText(value).trim();

  if (!raw || raw === "-") {
    return value;
  }

  const fallbackText = getTimelineNodeText(fallback);
  const today = getTimelineTodayParts();
  const fallbackTime = getTimelineTimePartsFromText(`${raw} ${fallbackText}`) ?? {
    hour: today.hour,
    minute: today.minute,
    second: today.second
  };
  let year = today.year;
  let month = today.month;
  let day = today.day;
  let time = fallbackTime;

  if (/^(现在|刚刚)$/.test(raw)) {
    time = { hour: today.hour, minute: today.minute, second: today.second };
  } else if (/^(今日|今天)/.test(raw)) {
    time = getTimelineTimePartsFromText(raw) ?? fallbackTime;
  } else {
    const isoMatch = raw.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    const compactMatch = raw.match(/\b(\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})\b/);
    const chineseMatch = raw.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
    const slashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    const match = isoMatch ?? compactMatch ?? chineseMatch ?? slashMatch;

    if (match) {
      if (match === isoMatch) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
      } else if (match === compactMatch) {
        year = 2000 + Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
      } else if (match === chineseMatch) {
        year = match[1] ? Number(match[1]) : today.year;
        month = Number(match[2]);
        day = Number(match[3]);
      } else {
        month = Number(match[1]);
        day = Number(match[2]);
      }
    } else if (!getTimelineTimePartsFromText(raw)) {
      return value;
    }
  }

  const dateKey = `${year}-${padTimelineTimeSegment(month)}-${padTimelineTimeSegment(day)}`;
  const timeLabel = `${padTimelineTimeSegment(time.hour)}:${padTimelineTimeSegment(time.minute)}:${padTimelineTimeSegment(time.second)}`;

  if (dateKey === getTimelineTodayKey()) {
    return `今天 ${timeLabel}`;
  }

  return `${year}年${month}月${day}日 ${timeLabel}`;
}

function isSystemTimelineEvent(event: ContactEventTimelineEntry, actorName: ReactNode, actorRole: ReactNode) {
  const text = [
    getTimelineNodeText(actorName),
    getTimelineNodeText(actorRole),
    getTimelineNodeText(event.title),
    getTimelineNodeText(event.operator)
  ].join(" ");

  return /系统|系統|system/i.test(text);
}

function isBlockingSystemTimelineEvent(event: ContactEventTimelineEntry, actorName: ReactNode, actorRole: ReactNode) {
  const text = [
    getTimelineNodeText(actorName),
    getTimelineNodeText(actorRole),
    getTimelineNodeText(event.title),
    getTimelineNodeText(event.operator),
    getTimelineNodeText(event.message),
    getTimelineNodeText(event.detail),
    getTimelineNodeText(event.reason)
  ].join(" ");

  return event.tone === "red" || Boolean(event.conflicts?.length) || /异常|異常|阻断|阻斷|冲突|衝突|失败|失敗|过期|過期|取消|未到|迟到|遅刻|风险|風險/i.test(text);
}

function ContactEventTimelineComputerIcon({ warning = false }: { warning?: boolean }) {
  return (
    <span className="relative grid h-5 w-5 place-items-center">
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="11" rx="2.4" stroke="currentColor" strokeWidth="1.9" width="16" x="4" y="5" />
        <path d="M9 19h6M12 16v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
      {warning ? (
        <span className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#ef4444] px-0.5 text-[9px] font-black leading-none text-white">
          !
        </span>
      ) : null}
    </span>
  );
}

function ChatBubbleIcon() {
  return (
    <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24">
      <path
        d="M7.5 18.5H7a3.5 3.5 0 0 1-3.5-3.5V8A3.5 3.5 0 0 1 7 4.5h10A3.5 3.5 0 0 1 20.5 8v7A3.5 3.5 0 0 1 17 18.5h-4.7L8 21v-2.5h-.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function RedAlertIcon() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ef4444] text-[13px] font-black leading-none text-white">
      !
    </span>
  );
}
