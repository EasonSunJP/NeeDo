import { useMemo, useState, type ReactNode } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/utils";
import {
  getServiceReviewStampVisual,
  splitMaxReviewStampLabel,
  type ServiceReviewTagOption
} from "./serviceReviewTagCatalog";

export type ServiceReviewTag = ServiceReviewTagOption;

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

function normalizeReviewTags(tags: Array<string | ServiceReviewTag>) {
  return tags.map<ServiceReviewTag>((tag) => typeof tag === "string" ? { label: tag } : tag);
}

function clampReviewTag(value: string) {
  return Array.from(value).slice(0, 5).join("");
}

function renderStampLabel(label: string) {
  const labelParts = splitMaxReviewStampLabel(label);

  if (!labelParts.marker) {
    return <span>{label}</span>;
  }

  return (
    <>
      <span className="block text-[12px] leading-[1.05] tracking-normal sm:text-[13px]">{labelParts.title}</span>
      <span className="mt-0.5 block text-[17px] leading-[0.92] tracking-normal sm:text-[18px]">{labelParts.marker}</span>
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
  const headerInfo = (
    <div className="grid gap-1">
      <p className="text-xs font-black text-[color:var(--client-primary)]">服务评价</p>
      <p>{message}</p>
    </div>
  );

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
    <div className="service-review-prompt-overlay fixed inset-0 z-[150] bg-[color:var(--client-bg)] text-[color:var(--client-text)]" data-info-tooltip-portal-host>
      <div className="service-review-prompt mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-[color:var(--client-bg)] shadow-soft">
        <MobileFullscreenHeader
          className="service-review-prompt__header"
          closeLabel="关闭评价"
          info={headerInfo}
          onClose={onSkip}
          title={title}
        />

        <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+156px)] pt-4">
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
            <p className="mt-2 text-center text-[11px] font-bold leading-4 text-[color:var(--client-soft-muted)]">
              评价会在随机次数后反应，不会马上反应
            </p>
          </section>

          <section className="mt-4">
            <div className={cn("grid overflow-visible", hasStampTags ? "grid-cols-4 gap-2.5 px-0.5 pt-2" : "grid-cols-2 gap-3 sm:grid-cols-3")}>
              {baseTags.map((tag, index) => {
                const selected = selectedTags.includes(tag.label);
                const count = tagCounts[tag.label] ?? tag.count ?? 0;
                const isStamp = tag.kind === "stamp";
                const stampVisual = getServiceReviewStampVisual(tag, index);
                const disabledByStampLimit = isStamp && Boolean(selectedStampTag) && !selected;

                return (
                  <button
                    className={cn(
                      "focus-ring relative min-w-0 transition active:scale-95",
                      isStamp
                        ? cn("service-review-stamp", `service-review-stamp--${stampVisual.tone}`, selected ? "is-selected" : "")
                        : "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] px-3 py-3 text-sm font-black text-[color:var(--client-text)]",
                      selected && !isStamp ? "ring-2 ring-[color:var(--client-primary)]" : "",
                      disabledByStampLimit ? "cursor-not-allowed opacity-48 saturate-50" : ""
                    )}
                    disabled={disabledByStampLimit}
                    key={`${tag.label}-${index}`}
                    onClick={() => clickTag(tag.label)}
                    type="button"
                  >
                    {isStamp ? (
                      <>
                        <span className="service-review-stamp__icon">
                          <img
                            alt=""
                            aria-hidden="true"
                            draggable={false}
                            src={stampVisual.iconSrc}
                          />
                        </span>
                        <span className="service-review-stamp__label">
                          {renderStampLabel(tag.label)}
                        </span>
                        <span className="service-review-stamp__count">
                          ×{count}
                        </span>
                      </>
                    ) : (
                      <span className="break-words">{tag.label}</span>
                    )}
                    {!isStamp ? (
                      <span className="absolute -right-1.5 -top-2 rounded-full bg-[#6f7480] px-2.5 py-1 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,0,0,0.2)]">
                        ×{count}
                      </span>
                    ) : null}
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
              ) : (
                <Badge className="service-review-empty-tag" tone="neutral">
                  暂无评价标签
                </Badge>
              )}
            </div>
          </section>
        </main>

        <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+14px)] pt-16">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-full bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_68%,transparent)_28%,color-mix(in_srgb,var(--client-bg)_94%,transparent)_58%,var(--client-bg)_100%)]"
          />
          <div className="pointer-events-auto relative space-y-3">
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
          </div>
        </footer>
      </div>
    </div>
  );
}
