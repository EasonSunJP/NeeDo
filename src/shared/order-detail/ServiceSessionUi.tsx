import { useMemo, useState, type ReactNode } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { cn } from "../../lib/utils";

export type ServiceReviewTag = {
  label: string;
  count?: number;
  kind?: "stamp" | "chip";
};

export type ServiceReviewSubmission = {
  rating: number;
  tags: string[];
  tagCounts: Record<string, number>;
};

export function ContactInfoDetailText({ text }: { text: string }) {
  const parts = text.split(/(￥[\d,]+|(?:\d+~)?\d+NDP|NDP)/g).filter(Boolean);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("￥")) {
          return (
            <strong className="font-black text-[#ff6b61]" key={`${part}-${index}`}>
              {part}
            </strong>
          );
        }

        if (part.includes("NDP")) {
          return (
            <strong className="font-black text-[#f7c948]" key={`${part}-${index}`}>
              {part}
            </strong>
          );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

export function ServiceCountdownPill({
  minutes,
  seconds,
  className,
  label = "剩余"
}: {
  minutes?: number;
  seconds?: number;
  className?: string;
  label?: ReactNode;
}) {
  const totalSeconds = typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : Math.max(0, Math.ceil((minutes ?? 0) * 60));
  const displayMinutes = Math.floor(totalSeconds / 60);
  const displaySeconds = totalSeconds % 60;

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] px-4 py-2 text-sm font-black text-[color:var(--client-text)] shadow-[0_14px_30px_rgba(0,0,0,0.16)]",
        className
      )}
    >
      <AppIcon className="h-4 w-4 text-[color:var(--client-primary)]" name="clock" />
      <span>{label}</span>
      <strong className="text-[color:var(--client-primary)]">{displayMinutes}分钟{displaySeconds}秒</strong>
    </div>
  );
}

export function ServiceRingAlert({
  title,
  message,
  actionLabel = "点击关闭",
  onDismiss
}: {
  title: ReactNode;
  message: ReactNode;
  actionLabel?: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed -inset-y-20 inset-x-0 z-[140] grid place-items-center bg-black/52 px-4 backdrop-blur-sm"
      onClick={onDismiss}
      role="presentation"
    >
      <section
        aria-modal="true"
        className="w-full max-w-[340px] rounded-[30px] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-bg)_8%)] px-5 py-6 text-center text-[color:var(--client-text)] shadow-[0_24px_70px_rgba(0,0,0,0.36)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <span className="absolute h-16 w-16 animate-ping rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)]" />
          <span className="relative grid h-16 w-16 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_18%,var(--client-surface)_82%)] text-[color:var(--client-primary)]">
            <AppIcon className="h-8 w-8" name="bell" />
          </span>
        </div>
        <h2 className="mt-4 text-xl font-black leading-tight">{title}</h2>
        <p className="mt-3 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{message}</p>
        <button
          className="focus-ring mt-5 inline-flex h-11 min-w-36 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[#090806] shadow-[0_14px_30px_color-mix(in_srgb,var(--client-primary)_30%,transparent)]"
          onClick={onDismiss}
          type="button"
        >
          {actionLabel}
        </button>
      </section>
    </div>
  );
}

type ServiceStampIconName = "appeal" | "service" | "empathy" | "energy";

const stampVisuals: Array<{
  accent: string;
  border: string;
  icon: ServiceStampIconName;
  iconBox: string;
  surface: string;
}> = [
  {
    accent: "text-[#cdb7ff]",
    border: "border-[#cdb7ff]/24",
    icon: "appeal",
    iconBox: "border-[#cdb7ff]/18 bg-[#cdb7ff]/10",
    surface: "bg-[#201b2b]"
  },
  {
    accent: "text-[#9edbf0]",
    border: "border-[#9edbf0]/24",
    icon: "service",
    iconBox: "border-[#9edbf0]/18 bg-[#9edbf0]/10",
    surface: "bg-[#192631]"
  },
  {
    accent: "text-[#efc46f]",
    border: "border-[#efc46f]/24",
    icon: "empathy",
    iconBox: "border-[#efc46f]/18 bg-[#efc46f]/10",
    surface: "bg-[#2b2319]"
  },
  {
    accent: "text-[#f3aa86]",
    border: "border-[#f3aa86]/24",
    icon: "energy",
    iconBox: "border-[#f3aa86]/18 bg-[#f3aa86]/10",
    surface: "bg-[#2b1f1b]"
  },
  {
    accent: "text-[#f5a6bd]",
    border: "border-[#f5a6bd]/24",
    icon: "empathy",
    iconBox: "border-[#f5a6bd]/18 bg-[#f5a6bd]/10",
    surface: "bg-[#2b1d25]"
  },
  {
    accent: "text-[#9fb9f4]",
    border: "border-[#9fb9f4]/24",
    icon: "service",
    iconBox: "border-[#9fb9f4]/18 bg-[#9fb9f4]/10",
    surface: "bg-[#1b2230]"
  }
];

function ServiceStampIcon({ name }: { name: ServiceStampIconName }) {
  switch (name) {
    case "appeal":
      return (
        <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24">
          <circle cx="10" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.6 19.2c.7-3.6 2.8-5.5 6.2-5.5 1.4 0 2.7.3 3.7 1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M17.4 19.1s-3.4-2.1-4.2-4c-.5-1.2.3-2.4 1.6-2.4.8 0 1.5.4 2.6 1.6 1.1-1.2 1.8-1.6 2.6-1.6 1.3 0 2.1 1.2 1.6 2.4-.8 1.9-4.2 4-4.2 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "service":
      return (
        <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24">
          <path d="M12 4.3c2 1.5 4.3 2.2 6.8 2.2v4.4c0 4.3-2.5 7.1-6.8 8.7-4.3-1.6-6.8-4.4-6.8-8.7V6.5c2.5 0 4.8-.7 6.8-2.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="m8.9 12.1 2 2 4.3-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "empathy":
      return (
        <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24">
          <path d="M6.6 6.5h10.8a3 3 0 0 1 3 3v4.1a3 3 0 0 1-3 3h-4.7l-4.1 3v-3h-2a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12 13.7s-2.8-1.7-3.4-3.2c-.4-.9.2-1.8 1.1-1.8.6 0 1.1.3 2.3 1.5 1.2-1.2 1.7-1.5 2.3-1.5.9 0 1.5.9 1.1 1.8-.6 1.5-3.4 3.2-3.4 3.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.45" />
        </svg>
      );
    case "energy":
      return (
        <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24">
          <path d="M4 13.1h3.3l1.9-4.2 3.1 8.2 2.1-4h5.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M6.4 7.4A7.7 7.7 0 0 1 12 5a7.8 7.8 0 0 1 7.3 5.1M17.6 17.2A7.7 7.7 0 0 1 12 19a7.8 7.8 0 0 1-6.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </svg>
      );
  }
}

function normalizeReviewTags(tags: Array<string | ServiceReviewTag>) {
  return tags.map<ServiceReviewTag>((tag) => typeof tag === "string" ? { label: tag } : tag);
}

function clampReviewTag(value: string) {
  return Array.from(value).slice(0, 5).join("");
}

function renderStampLabel(label: string) {
  const maxIndex = label.lastIndexOf("MAX");

  if (maxIndex <= 0 || maxIndex !== label.length - 3) {
    return <span>{label}</span>;
  }

  return (
    <>
      <span className="block text-[12px] leading-[1.05] tracking-normal sm:text-[13px]">{label.slice(0, maxIndex)}</span>
      <span className="mt-0.5 block text-[17px] leading-[0.92] tracking-normal sm:text-[18px]">MAX</span>
    </>
  );
}

function getStarFill(rating: number, star: number) {
  if (rating >= star) {
    return 100;
  }

  if (rating >= star - 0.5) {
    return 50;
  }

  return 0;
}

export function ServiceReviewPrompt({
  title,
  message,
  tagOptions,
  onSubmit,
  onSkip,
  submitLabel = "提交评价",
  submitHint,
  skipLabel = "跳过不评价",
  topContent
}: {
  title: ReactNode;
  message: ReactNode;
  tagOptions: Array<string | ServiceReviewTag>;
  onSubmit: (submission: ServiceReviewSubmission) => void;
  onSkip: () => void;
  submitLabel?: string;
  submitHint?: ReactNode;
  skipLabel?: string;
  topContent?: ReactNode;
}) {
  const baseTags = useMemo(() => normalizeReviewTags(tagOptions), [tagOptions]);
  const hasStampTags = baseTags.some((tag) => tag.kind === "stamp");
  const [rating, setRating] = useState(5);
  const [customLabel, setCustomLabel] = useState("");
  const [customTag, setCustomTag] = useState<ServiceReviewTag | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(baseTags.map((tag) => [tag.label, tag.count ?? 0]))
  );
  const selectedStampTag = selectedTags.find((label) => baseTags.some((tag) => tag.kind === "stamp" && tag.label === label));

  const clickTag = (label: string) => {
    if (selectedTags.includes(label)) {
      return;
    }

    const targetTag = baseTags.find((tag) => tag.label === label) ?? (customTag?.label === label ? customTag : undefined);

    if (targetTag?.kind === "stamp" && selectedStampTag) {
      return;
    }

    setSelectedTags((current) => [...current, label]);
    setTagCounts((current) => ({
      ...current,
      [label]: (current[label] ?? 0) + 1
    }));
  };
  const addCustomTag = () => {
    if (customTag) {
      return;
    }

    const label = clampReviewTag(customLabel.trim());

    if (!label) {
      return;
    }

    setCustomTag({ label, count: 0, kind: "chip" });
    clickTag(label);
    setCustomLabel("");
  };

  return (
    <div className="fixed inset-0 z-[150] bg-[color:var(--client-bg)] text-[color:var(--client-text)]">
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-[color:var(--client-bg)] shadow-soft">
        <MobileFullscreenHeader
          closeLabel="关闭评价"
          onClose={onSkip}
          subtitle="服务评价"
          title={title}
        />

        <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="mb-4">
            <p className="max-w-[310px] text-sm font-bold leading-6 text-[color:var(--client-muted)]">{message}</p>
          </section>

          {topContent ? <div className="mb-4">{topContent}</div> : null}

          <section className="rounded-[24px] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] px-4 py-5 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-[color:var(--client-muted)]">本次评分</p>
              <div className="inline-flex min-w-[82px] items-baseline justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_16%,var(--client-surface)_84%)] px-3 py-1.5 text-[color:var(--client-primary)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_16%,transparent)]">
                <strong className="text-[24px] font-black leading-none tracking-normal">{rating.toFixed(1)}</strong>
                <span className="ml-0.5 text-sm font-black text-[color:var(--client-muted)]">/5</span>
              </div>
            </div>
            <div className="mt-3 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((score) => {
                const fill = getStarFill(rating, score);

                return (
                  <span className="relative grid h-11 w-11 place-items-center" key={score}>
                    <span className="pointer-events-none absolute inset-0 grid place-items-center text-[34px] leading-none text-[color:color-mix(in_srgb,var(--client-muted)_38%,transparent)]">
                      ★
                    </span>
                    <span
                      className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden text-[34px] leading-none text-[#ffc84a]"
                      style={{ clipPath: `inset(0 ${100 - fill}% 0 0)` }}
                    >
                      ★
                    </span>
                    <button
                      aria-label={`${score - 0.5}星`}
                      className="focus-ring absolute inset-y-0 left-0 w-1/2 rounded-l-full"
                      onClick={() => setRating(score - 0.5)}
                      type="button"
                    />
                    <button
                      aria-label={`${score}星`}
                      className="focus-ring absolute inset-y-0 right-0 w-1/2 rounded-r-full"
                      onClick={() => setRating(score)}
                      type="button"
                    />
                  </span>
                );
              })}
            </div>
          </section>

          <section className="mt-4">
            <div className={cn("grid gap-3", hasStampTags ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
              {baseTags.map((tag, index) => {
                const selected = selectedTags.includes(tag.label);
                const count = tagCounts[tag.label] ?? tag.count ?? 0;
                const isStamp = tag.kind === "stamp";
                const stampVisual = stampVisuals[index % stampVisuals.length];
                const disabledByStampLimit = isStamp && Boolean(selectedStampTag) && !selected;

                return (
                  <button
                    className={cn(
                      "focus-ring relative min-w-0 transition active:scale-95",
                      isStamp
                        ? cn(
                            "grid aspect-[0.96/1] min-h-[78px] grid-rows-[30px_minmax(0,1fr)] items-center rounded-[20px] border px-2.5 pb-2.5 pt-3 text-center font-black text-[color:var(--client-text)] shadow-[0_12px_26px_rgba(0,0,0,0.18)] backdrop-blur sm:min-h-[92px]",
                            stampVisual.surface,
                            stampVisual.border
                          )
                        : "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] px-3 py-3 text-sm font-black text-[color:var(--client-text)]",
                      selected ? "ring-2 ring-[color:var(--client-primary)]" : "",
                      disabledByStampLimit ? "cursor-not-allowed opacity-48 saturate-50" : ""
                    )}
                    disabled={disabledByStampLimit}
                    key={`${tag.label}-${index}`}
                    onClick={() => clickTag(tag.label)}
                    type="button"
                  >
                    {isStamp ? (
                      <>
                        <span className="pointer-events-none absolute inset-x-2 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)]" />
                        <span className={cn("relative z-10 mx-auto grid h-8 w-8 place-items-center rounded-[12px] border", stampVisual.iconBox, stampVisual.accent)}>
                          <ServiceStampIcon name={stampVisual.icon} />
                        </span>
                        <span className="relative z-10 mt-1.5 block w-full">
                          {renderStampLabel(tag.label)}
                        </span>
                      </>
                    ) : (
                      <span className="break-words">{tag.label}</span>
                    )}
                    <span className="absolute -right-1.5 -top-2 rounded-full bg-[#6f7480] px-2.5 py-1 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,0,0,0.2)]">
                      ×{count}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 rounded-[24px] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 shadow-panel">
            <p className="text-sm font-black">自由追加标签</p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
              <input
                aria-label="自由追加标签"
                className="h-12 min-w-0 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,var(--client-bg)_16%)] px-4 text-sm font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                disabled={Boolean(customTag)}
                maxLength={5}
                onChange={(event) => setCustomLabel(clampReviewTag(event.target.value))}
                placeholder={customTag ? "已追加" : "最多5个字"}
                value={customLabel}
              />
              <button
                className="focus-ring h-12 rounded-[18px] bg-[color:var(--client-primary)] text-sm font-black text-[#090806] shadow-[0_12px_24px_color-mix(in_srgb,var(--client-primary)_26%,transparent)] disabled:opacity-45"
                disabled={Boolean(customTag) || !customLabel.trim()}
                onClick={addCustomTag}
                type="button"
              >
                追加
              </button>
            </div>
            <div className="mt-4 min-h-[42px]">
              {customTag ? (
                <button
                  className="focus-ring relative rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,var(--client-surface)_86%)] px-4 py-2.5 text-sm font-black text-[color:var(--client-text)]"
                  onClick={() => clickTag(customTag.label)}
                  type="button"
                >
                  {customTag.label}
                  <span className="absolute -right-2 -top-2 rounded-full bg-[#6f7480] px-2 py-0.5 text-[11px] font-black text-white">
                    ×{tagCounts[customTag.label] ?? 1}
                  </span>
                </button>
              ) : null}
            </div>
          </section>
        </main>

        <footer className="shrink-0 space-y-3 bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--client-bg)_94%,transparent)_20%,var(--client-bg)_100%)] px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+14px)] pt-2">
          {submitHint ? (
            <p className="text-center text-xs font-black text-[#f7c948]">{submitHint}</p>
          ) : null}
          <div className="grid grid-cols-[0.78fr_1fr] gap-3">
            <button
              className="focus-ring h-12 rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] text-sm font-black text-[color:var(--client-muted)]"
              onClick={onSkip}
              type="button"
            >
              {skipLabel}
            </button>
            <button
              className="focus-ring h-12 rounded-[20px] bg-[color:var(--client-primary)] px-3 text-sm font-black text-[#090806] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_30%,transparent)]"
              onClick={() => onSubmit({ rating, tags: selectedTags, tagCounts })}
              type="button"
            >
              {submitLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
