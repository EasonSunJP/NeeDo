import { useRef, useState, type ReactNode } from "react";
import { MobileFullscreenHeader, MobileFullscreenCloseButton } from "./MobileFullscreenHeader";
import { FloatingTopRightControl } from "../client-ui/AppScaffold";
import { AvatarImage } from "../ui/AvatarImage";
import { Button } from "../ui/Button";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { shareContent } from "../../lib/share";
import { cn } from "../../lib/utils";
import { BaseInfoCard, buildInfoCardDataFromDetail } from "../../shared/profile-card";
import { RecentTwoWeekAvailability } from "../../shared/profile-detail/sections/RecentTwoWeekAvailability";
import type { DetailAvailabilityTone, DetailBadge, DetailProfile, PersonalDetailProfile } from "../../types/detailProfile";

export type DetailPageAction = {
  label: string;
  variant?: "primary" | "secondary";
  to?: string;
  href?: string;
  onClick?: () => void;
};

function getToneClasses(dark: boolean, tone: DetailBadge["tone"] = "neutral") {
  if (dark) {
    switch (tone) {
      case "primary":
        return "border-[#f3cf78]/35 bg-[#241b10] text-[#f3cf78]";
      case "success":
        return "border-[#4a7d58]/35 bg-[#102115] text-[#8bd8a1]";
      case "warning":
        return "border-[#7e6030]/35 bg-[#21160c] text-[#f0c987]";
      case "danger":
        return "border-[#84413c]/35 bg-[#2a1110] text-[#ff998f]";
      default:
        return "border-[#3b2f18]/45 bg-[#14110d] text-[#f7ead0]/78";
    }
  }

  switch (tone) {
    case "primary":
      return "border-[#c9a35a]/35 bg-[#fff4de] text-[#8d6925]";
    case "success":
      return "border-[#66a176]/35 bg-[#edf8f0] text-[#2f6846]";
    case "warning":
      return "border-[#d7c27a]/35 bg-[#fff7da] text-[#795b00]";
    case "danger":
      return "border-[#d39991]/35 bg-[#fff0ec] text-[#a63f32]";
    default:
      return "border-line bg-paper text-ink/68";
  }
}

function getAvailabilityToneClasses(dark: boolean, tone: DetailAvailabilityTone) {
  if (dark) {
    switch (tone) {
      case "available":
        return "bg-[#112618] text-[#9de4b0]";
      case "limited":
        return "bg-[#2a2110] text-[#f1cd84]";
      case "busy":
        return "bg-[#2d1514] text-[#ff9d94]";
      case "offline":
        return "bg-[#171411] text-[#b7aa8b]";
      default:
        return "bg-[#171411] text-[#f7ead0]/72";
    }
  }

  switch (tone) {
    case "available":
      return "bg-[#edf8f0] text-[#2f6846]";
    case "limited":
      return "bg-[#fff7da] text-[#8a6800]";
    case "busy":
      return "bg-[#fff0ec] text-[#a63f32]";
    case "offline":
      return "bg-[#f1efe9] text-[#6f6655]";
    default:
      return "bg-paper text-ink/60";
  }
}

function buildActionButton(action: DetailPageAction, dark: boolean, key: string) {
  if (action.href) {
    return (
      <a
        className={cn(
          "focus-ring inline-flex h-11 items-center justify-center rounded-full px-3 text-[13px] font-black transition",
          action.variant === "primary"
            ? dark
              ? "bg-[#f0cf7b] text-[#080705]"
              : "bg-moss text-white"
            : dark
              ? "border border-[#3d3018]/55 bg-[#14110d] text-white"
              : "border border-line bg-white text-ink"
        )}
        href={action.href}
        key={key}
        rel="noreferrer"
        target="_blank"
      >
        {action.label}
      </a>
    );
  }

  if (action.to) {
    return (
      <Button
        className="h-11 rounded-full px-3 text-[13px] font-black"
        key={key}
        size="md"
        to={action.to}
        variant={action.variant === "primary" ? "primary" : "secondary"}
      >
        {action.label}
      </Button>
    );
  }

  return (
    <Button
      className="h-11 rounded-full px-3 text-[13px] font-black"
      key={key}
      onClick={action.onClick}
      size="md"
      variant={action.variant === "primary" ? "primary" : "secondary"}
    >
      {action.label}
    </Button>
  );
}

function GalleryCarousel({ title, images, dark }: { title: string; images: DetailProfile["galleryImages"]; dark: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const touchStartRef = useRef<number | null>(null);
  const currentImage = images[currentIndex] ?? images[0];

  const moveTo = (direction: -1 | 1) => {
    setCurrentIndex((prev) => {
      if (images.length <= 1) {
        return prev;
      }

      return (prev + direction + images.length) % images.length;
    });
  };

  if (!currentImage) {
    return null;
  }

  return (
    <>
      <section className={cn("overflow-hidden rounded-[34px] shadow-[0_20px_60px_rgba(18,22,18,0.14)]", dark ? "bg-[#120f0d]" : "bg-white")}>
        <button
          className="relative block w-full overflow-hidden bg-black"
          onClick={() => setPreviewOpen(true)}
          onTouchEnd={(event) => {
            if (touchStartRef.current === null) {
              return;
            }

            const delta = event.changedTouches[0].clientX - touchStartRef.current;
            touchStartRef.current = null;

            if (Math.abs(delta) < 36) {
              return;
            }

            moveTo(delta > 0 ? -1 : 1);
          }}
          onTouchStart={(event) => {
            touchStartRef.current = event.changedTouches[0].clientX;
          }}
          type="button"
        >
          <img alt={currentImage.alt} className="h-[280px] w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(currentImage.src)} />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/65 via-black/20 to-transparent px-4 pb-4 pt-12 text-white">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/72">
                {currentImage.category ?? "Gallery"}
              </p>
              <p className="mt-1 text-sm font-semibold text-white/92">{title}</p>
            </div>
            <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-black">
              {currentIndex + 1} / {images.length}
            </span>
          </div>
        </button>

        {images.length > 1 ? (
          <div className={cn("flex items-center gap-2 px-3 py-3", dark ? "bg-[#120f0d]" : "bg-white")}>
            <button
              className={cn(
                "focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black transition",
                dark ? "bg-[#171411] text-[#f3cf78]" : "bg-paper text-ink/75"
              )}
              onClick={() => moveTo(-1)}
              type="button"
            >
              ‹
            </button>
            <div className="scrollbar-none flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {images.map((image, index) => (
                <button
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-[18px] transition",
                    currentIndex === index
                      ? dark
                        ? "ring-2 ring-[#f3cf78]"
                        : "ring-2 ring-moss"
                      : dark
                        ? "opacity-70"
                        : "opacity-80"
                  )}
                  key={`${image.src}-${index}`}
                  onClick={() => setCurrentIndex(index)}
                  type="button"
                >
                  <img alt={image.alt} className="h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(image.src)} />
                </button>
              ))}
            </div>
            <button
              className={cn(
                "focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black transition",
                dark ? "bg-[#171411] text-[#f3cf78]" : "bg-paper text-ink/75"
              )}
              onClick={() => moveTo(1)}
              type="button"
            >
              ›
            </button>
          </div>
        ) : null}
      </section>

      {previewOpen ? (
        <div className="fixed inset-0 z-[88] bg-black/90 px-4 py-6">
          <FloatingTopRightControl className="z-[89]">
            <MobileFullscreenCloseButton className="border-white/25 bg-black/40 text-white" label="关闭大图" onClose={() => setPreviewOpen(false)} />
          </FloatingTopRightControl>
          <div className="mx-auto flex h-full w-full max-w-[480px] flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <img alt={currentImage.alt} className="max-h-full w-full rounded-[28px] object-contain" src={getGeneratedImageThumbnailUrl(currentImage.src)} />
            </div>
            {images.length > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-3 text-white">
                <Button onClick={() => moveTo(-1)} size="sm" variant="secondary" className="bg-white/10 text-white">
                  上一张
                </Button>
                <span className="text-sm font-black">{currentIndex + 1} / {images.length}</span>
                <Button onClick={() => moveTo(1)} size="sm" variant="secondary" className="bg-white/10 text-white">
                  下一张
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function SectionCard({
  title,
  description,
  dark,
  children
}: {
  title: string;
  description?: string;
  dark: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-[28px] border p-4 shadow-panel", dark ? "border-[#3b2f18]/55 bg-[#14110e] text-white" : "border-line bg-white text-ink")}>
      <div className="flex items-start justify-between gap-3">
        <TitleWithInfo
          as="h3"
          info={description}
          label={`${title} 说明`}
          title={title}
          titleClassName="text-sm font-black"
          variant={dark ? "dark" : "paper"}
        />
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ScoreSummaryCard({
  label,
  score,
  reviewLabel,
  dark
}: {
  label: string;
  score?: number;
  reviewLabel: string;
  dark: boolean;
}) {
  return (
    <div className={cn("rounded-[24px] border px-4 py-3", dark ? "border-[#45361c]/55 bg-[#100d0a]" : "border-line bg-paper")}>
      <p className={cn("text-[11px] font-black uppercase tracking-[0.14em]", dark ? "text-[#f7ead0]/52" : "text-ink/45")}>{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-[30px] font-black leading-none">{typeof score === "number" ? score.toFixed(1) : "--"}</span>
            <span className={cn("text-sm font-bold", dark ? "text-[#f7ead0]/55" : "text-ink/45")}>/5</span>
          </div>
          <p className={cn("mt-1 text-xs font-bold", dark ? "text-[#f7ead0]/55" : "text-ink/50")}>{reviewLabel}</p>
        </div>
        <div className={cn("rounded-full px-3 py-2 text-xs font-black", dark ? "bg-[#20150d] text-[#f3cf78]" : "bg-[#eff7f0] text-moss")}>
          {typeof score === "number" ? "已沉淀评价" : "等待首条评价"}
        </div>
      </div>
    </div>
  );
}

function DetailBadgeCloud({
  title,
  items,
  dark,
  emptyText = "暂无标签"
}: {
  title: string;
  items: Array<string | DetailBadge>;
  dark: boolean;
  emptyText?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const normalized = items.map((item) => (typeof item === "string" ? { label: item, tone: "neutral" as const } : item)).filter((item) => item.label.trim().length > 0);
  const visibleItems = expanded ? normalized : normalized.slice(0, 6);

  return (
    <SectionCard dark={dark} title={title}>
      {normalized.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            {visibleItems.map((item) => (
              <span className={cn("rounded-full border px-3 py-2 text-xs font-black", getToneClasses(dark, item.tone))} key={`${title}-${item.label}`}>
                {item.label}
              </span>
            ))}
          </div>
          {normalized.length > 6 ? (
            <button
              className={cn("mt-3 text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? "收起标签" : `展开剩余 ${normalized.length - 6} 个标签`}
            </button>
          ) : null}
        </>
      ) : (
        <p className={cn("text-sm leading-6", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>{emptyText}</p>
      )}
    </SectionCard>
  );
}

function InfoTableSection({
  title,
  rows,
  dark,
  columns = 2
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  dark: boolean;
  columns?: 1 | 2;
}) {
  return (
    <SectionCard dark={dark} title={title}>
      {rows.length > 0 ? (
        <div className={cn("grid gap-3", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {rows.map((row) => (
            <div
              className={cn("rounded-[22px] border px-3 py-3", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")}
              key={`${title}-${row.label}`}
            >
              <p className={cn("text-[11px] font-black uppercase tracking-[0.12em]", dark ? "text-[#f7ead0]/45" : "text-ink/42")}>{row.label}</p>
              <p className="mt-2 text-sm font-black leading-6">{row.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={cn("text-sm leading-6", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>暂无可展示信息。</p>
      )}
    </SectionCard>
  );
}

function IntroSection({
  blocks,
  dark
}: {
  blocks: DetailProfile["introBlocks"];
  dark: boolean;
}) {
  const [expandedIndices, setExpandedIndices] = useState<number[]>([]);

  return (
    <SectionCard dark={dark} title="介绍说明区">
      <div className="space-y-4">
        {blocks.map((block, index) => {
          const isExpanded = expandedIndices.includes(index);
          const shouldCollapse = block.content.length > 96;

          return (
            <article className={cn("rounded-[22px] border p-4", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")} key={`${block.title}-${index}`}>
              <h4 className="text-sm font-black">{block.title}</h4>
              <p className={cn("mt-2 text-sm leading-7", !isExpanded && shouldCollapse ? "line-clamp-4" : "", dark ? "text-[#f7ead0]/76" : "text-ink/68")}>
                {block.content}
              </p>
              {shouldCollapse ? (
                <button
                  className={cn("mt-3 text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}
                  onClick={() => {
                    setExpandedIndices((current) =>
                      current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
                    );
                  }}
                  type="button"
                >
                  {isExpanded ? "收起" : "展开更多"}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ReviewSummarySection({
  summary,
  dark
}: {
  summary: DetailProfile["reviewSummary"];
  dark: boolean;
}) {
  const hasReviews = summary.reviewCount > 0;

  return (
    <SectionCard dark={dark} title="评价概览区">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className={cn("rounded-[22px] border p-4", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={cn("text-xs font-black", dark ? "text-[#f7ead0]/48" : "text-ink/45")}>{summary.scoreLabel}</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[32px] font-black">{typeof summary.score === "number" ? summary.score.toFixed(1) : "--"}</span>
                <span className={cn("text-sm font-bold", dark ? "text-[#f7ead0]/52" : "text-ink/45")}>/5</span>
              </div>
              <p className={cn("mt-1 text-xs font-bold", dark ? "text-[#f7ead0]/55" : "text-ink/50")}>
                {hasReviews ? `${summary.reviewCount}${summary.reviewUnitLabel}` : "暂无评价"}
              </p>
            </div>
            <div className={cn("rounded-full px-3 py-2 text-xs font-black", dark ? "bg-[#20150d] text-[#f3cf78]" : "bg-[#fff4de] text-[#8d6925]")}>
              {hasReviews ? "最近评价已同步" : "等待评价沉淀"}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {summary.tags.length > 0 ? summary.tags.slice(0, 6).map((tag, index) => (
              <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", getToneClasses(dark, index % 2 === 0 ? "primary" : "neutral"))} key={tag}>
                {tag}
              </span>
            )) : (
              <span className={cn("text-sm", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>暂时还没有评价标签。</span>
            )}
          </div>
        </div>
        <div className={cn("rounded-[22px] border p-4", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")}>
          <p className={cn("text-xs font-black uppercase tracking-[0.14em]", dark ? "text-[#f7ead0]/45" : "text-ink/42")}>最近评价摘要</p>
          <p className={cn("mt-3 text-sm leading-7", dark ? "text-[#f7ead0]/76" : "text-ink/68")}>
            {summary.recentSummary ?? (hasReviews ? "首批评价摘要正在整理中。" : "暂无公开评价摘要。")}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function FlowSection({
  title,
  caption,
  dark,
  children,
  className
}: {
  title: string;
  caption?: string;
  dark: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("pt-6", className)}>
      <div className={cn("flex items-start justify-between gap-3 border-t pt-6", dark ? "border-[#2a2218]/70" : "border-line/70")}>
        <TitleWithInfo
          as="p"
          info={caption}
          label={`${title} 说明`}
          title={title}
          titleClassName={cn("text-[11px] font-black uppercase tracking-[0.16em]", dark ? "text-[#f7ead0]/44" : "text-ink/38")}
          variant={dark ? "dark" : "paper"}
        />
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfileInfoList({
  title,
  caption,
  rows,
  dark,
  columns = 2
}: {
  title: string;
  caption?: string;
  rows: Array<{ label: string; value: string }>;
  dark: boolean;
  columns?: 1 | 2;
}) {
  return (
    <FlowSection caption={caption} dark={dark} title={title}>
      {rows.length > 0 ? (
        <div className={cn("grid gap-x-5 gap-y-4", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {rows.map((row) => (
            <div className={cn("border-b pb-3", dark ? "border-[#2a2218]/70" : "border-line/70")} key={`${title}-${row.label}`}>
              <p className={cn("text-[11px] font-black uppercase tracking-[0.12em]", dark ? "text-[#f7ead0]/40" : "text-ink/38")}>{row.label}</p>
              <p className="mt-2 text-sm font-black leading-6">{row.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={cn("text-sm leading-6", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>暂无可展示信息。</p>
      )}
    </FlowSection>
  );
}

function AvailabilityPreview({
  detail,
  dark
}: {
  detail: Extract<DetailProfile, { roleType: "technician" | "user" }>;
  dark: boolean;
}) {
  const availability = detail.availabilityPreview;

  return (
    <FlowSection caption={availability.caption} dark={dark} title={availability.title}>
      <div className={cn("overflow-hidden rounded-[28px] px-3 py-3 shadow-panel", dark ? "bg-[#14110d]" : "bg-white")}>
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {availability.items.map((item) => (
            <div
              className={cn(
                "min-w-[82px] rounded-[18px] px-2 py-3",
                dark ? "bg-[#0f0d0b]" : "bg-paper"
              )}
              key={item.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("text-[11px] font-black", dark ? "text-[#f7ead0]/58" : "text-ink/45")}>{item.weekdayLabel}</span>
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-black", getAvailabilityToneClasses(dark, item.tone))}>{item.statusLabel}</span>
              </div>
              <p className="mt-2 text-sm font-black">{item.dateLabel}</p>
              {item.meta ? <p className={cn("mt-2 text-[11px] font-bold leading-5", dark ? "text-[#f7ead0]/64" : "text-ink/58")}>{item.meta}</p> : null}
              {item.caption ? <p className={cn("mt-1 text-[11px] leading-5", dark ? "text-[#f7ead0]/46" : "text-ink/42")}>{item.caption}</p> : null}
            </div>
          ))}
        </div>
        {(availability.footer || availability.actionLabel) ? (
          <div className={cn("mt-3 flex items-center justify-between gap-3 border-t pt-3", dark ? "border-[#2a2218]/70" : "border-line/70")}>
            <p className={cn("text-xs leading-5", dark ? "text-[#f7ead0]/56" : "text-ink/48")}>{availability.footer ?? "近期暂无新的预约排班。"}</p>
            {availability.actionLabel ? (
              <span className={cn("text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}>
                {availability.actionLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </FlowSection>
  );
}

function KeyInfoChips({
  detail,
  dark
}: {
  detail: Extract<DetailProfile, { roleType: "technician" | "user" }>;
  dark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleBadges = expanded ? detail.quickBadges : detail.quickBadges.slice(0, 10);

  return (
    <FlowSection caption="把支付、语言、接待范围、认证与关键条件集中成一组轻量 chip，不再拆成很多小框。" dark={dark} title="关键信息标签区">
      <div className="flex flex-wrap gap-2.5">
        {visibleBadges.map((badge) => (
          <span className={cn("rounded-full px-3 py-2 text-xs font-black", getToneClasses(dark, badge.tone))} key={badge.label}>
            {badge.label}
          </span>
        ))}
      </div>
      {detail.quickBadges.length > 10 ? (
        <button
          className={cn("mt-3 text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "收起标签" : `展开剩余 ${detail.quickBadges.length - 10} 个标签`}
        </button>
      ) : null}
    </FlowSection>
  );
}

function PersonalIntroSection({
  detail,
  dark
}: {
  detail: Extract<DetailProfile, { roleType: "technician" | "user" }>;
  dark: boolean;
}) {
  const [expandedIndices, setExpandedIndices] = useState<number[]>([]);

  return (
    <FlowSection dark={dark} title="个人介绍区">
      <div className="space-y-4">
        {detail.introBlocks.map((block, index) => {
          const isExpanded = expandedIndices.includes(index);
          const shouldCollapse = block.content.length > 110;

          return (
            <article className={cn("pb-4", index !== detail.introBlocks.length - 1 ? (dark ? "border-b border-[#2a2218]/70" : "border-b border-line/70") : "")} key={`${block.title}-${index}`}>
              <h4 className="text-sm font-black">{block.title}</h4>
              <p className={cn("mt-2 text-sm leading-7", !isExpanded && shouldCollapse ? "line-clamp-4" : "", dark ? "text-[#f7ead0]/76" : "text-ink/68")}>
                {block.content}
              </p>
              {shouldCollapse ? (
                <button
                  className={cn("mt-3 text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}
                  onClick={() => {
                    setExpandedIndices((current) =>
                      current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
                    );
                  }}
                  type="button"
                >
                  {isExpanded ? "收起" : "展开更多"}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </FlowSection>
  );
}

function PersonalReviewSummarySection({
  detail,
  dark
}: {
  detail: Extract<DetailProfile, { roleType: "technician" | "user" }>;
  dark: boolean;
}) {
  const summary = detail.reviewSummary;
  const hasReviews = summary.reviewCount > 0;

  return (
    <FlowSection dark={dark} title="评价摘要 / 徽章区">
      <div className={cn("overflow-hidden rounded-[30px] px-4 py-4 shadow-panel", dark ? "bg-[linear-gradient(180deg,#14110e_0%,#100d0a_100%)]" : "bg-[linear-gradient(180deg,#ffffff_0%,#f6f4ee_100%)]")}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={cn("text-[11px] font-black uppercase tracking-[0.16em]", dark ? "text-[#f7ead0]/46" : "text-ink/40")}>{summary.scoreLabel}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[34px] font-black leading-none">{typeof summary.score === "number" ? summary.score.toFixed(1) : "--"}</span>
              <span className={cn("text-sm font-bold", dark ? "text-[#f7ead0]/52" : "text-ink/45")}>/5</span>
            </div>
            <p className={cn("mt-2 text-sm font-bold", dark ? "text-[#f7ead0]/60" : "text-ink/55")}>
              {hasReviews ? `${summary.reviewCount}${summary.reviewUnitLabel}` : "暂无评价"}
            </p>
          </div>
          <div className={cn("rounded-full px-3 py-2 text-xs font-black", dark ? "bg-[#20150d] text-[#f3cf78]" : "bg-[#fff4de] text-[#8d6925]")}>
            {detail.roleType === "technician" ? "服务印象" : "信用印象"}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {summary.tags.length > 0 ? summary.tags.map((tag, index) => (
            <span className={cn("rounded-full px-3 py-2 text-xs font-black", getToneClasses(dark, index % 2 === 0 ? "primary" : "neutral"))} key={tag}>
              {tag}
            </span>
          )) : (
            <p className={cn("text-sm", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>暂时还没有评价标签。</p>
          )}
        </div>

        <div className={cn("mt-4 border-t pt-4", dark ? "border-[#2a2218]/70" : "border-line/70")}>
          <p className={cn("text-[11px] font-black uppercase tracking-[0.16em]", dark ? "text-[#f7ead0]/44" : "text-ink/38")}>近期评价摘要</p>
          <p className={cn("mt-2 text-sm leading-7", dark ? "text-[#f7ead0]/74" : "text-ink/68")}>
            {summary.recentSummary ?? (hasReviews ? "首批评价摘要正在整理中。" : "暂无公开评价摘要。")}
          </p>
        </div>
      </div>
    </FlowSection>
  );
}

function ProfileTagsSection({
  detail,
  dark
}: {
  detail: Extract<DetailProfile, { roleType: "technician" | "user" }>;
  dark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? detail.tags : detail.tags.slice(0, 14);

  return (
    <FlowSection dark={dark} title="标签区">
      {detail.tags.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2.5">
            {visibleItems.map((tag, index) => (
              <span className={cn("rounded-full px-3 py-2 text-xs font-black", getToneClasses(dark, index % 3 === 0 ? "primary" : "neutral"))} key={tag}>
                {tag}
              </span>
            ))}
          </div>
          {detail.tags.length > 14 ? (
            <button
              className={cn("mt-3 text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? "收起标签" : `展开剩余 ${detail.tags.length - 14} 个标签`}
            </button>
          ) : null}
        </>
      ) : (
        <p className={cn("text-sm leading-6", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>暂时还没有可展示的标签。</p>
      )}
    </FlowSection>
  );
}

function PersonalHeaderSummary({
  detail,
  dark,
  isFavorite,
  onToggleFavorite
}: {
  detail: Extract<DetailProfile, { roleType: "technician" | "user" }>;
  dark: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="-mt-10">
      <BaseInfoCard
        actionSlot={(
          <Button onClick={onToggleFavorite} size="sm" variant={isFavorite ? "primary" : "secondary"}>
            {isFavorite ? "已关注" : "关注"}
          </Button>
        )}
        className={cn(dark ? "bg-[linear-gradient(180deg,rgba(20,17,15,1)_0%,rgba(9,8,6,1)_100%)]" : "bg-[linear-gradient(180deg,rgba(251,250,246,0.98)_0%,rgba(247,247,242,1)_100%)]")}
        dark={dark}
        data={buildInfoCardDataFromDetail(detail)}
        variant="detailHeader"
      />
    </div>
  );
}

function ShopHeaderSummary({
  detail,
  dark,
  isFavorite,
  onToggleFavorite
}: {
  detail: Extract<DetailProfile, { roleType: "shop" }>;
  dark: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="-mt-12">
      <BaseInfoCard
        actionSlot={(
          <div className="flex shrink-0 gap-2">
            <Button onClick={onToggleFavorite} size="sm" variant={isFavorite ? "primary" : "secondary"}>
              {isFavorite ? "已收藏" : "收藏"}
            </Button>
            <Button
              onClick={() =>
                void shareContent({
                  title: `${detail.displayName} | NeeDo`,
                  text: `${detail.subtitle} · 在 NeeDo 查看详情`,
                  url: typeof window !== "undefined" ? window.location.href : undefined
                })
              }
              size="sm"
              variant="secondary"
            >
              分享
            </Button>
          </div>
        )}
        dark={dark}
        data={buildInfoCardDataFromDetail(detail)}
        footerSlot={(
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_152px]">
            <ScoreSummaryCard dark={dark} label={detail.scoreLabel} reviewLabel={detail.reviewLabel} score={detail.score} />
            <div className={cn("rounded-[24px] border p-4", dark ? "border-[#45361c]/55 bg-[#100d0a]" : "border-line bg-paper")}>
              <p className={cn("text-[11px] font-black uppercase tracking-[0.14em]", dark ? "text-[#f7ead0]/48" : "text-ink/42")}>店铺状态</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", getToneClasses(dark, detail.openStatusLabel === "营业中" ? "success" : "warning"))}>
                  {detail.openStatusLabel}
                </span>
                {detail.categories.slice(0, 2).map((category) => (
                  <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", getToneClasses(dark, "neutral"))} key={category}>
                    {category}
                  </span>
                ))}
              </div>
              <p className={cn("mt-3 text-xs leading-6", dark ? "text-[#f7ead0]/55" : "text-ink/52")}>
                最近可约 {detail.coreInfoItems[0]?.caption?.replace("最近可约 ", "") ?? "待确认"}
              </p>
            </div>
          </div>
        )}
        variant="detailHeader"
      />
    </div>
  );
}

function ShopCoreInfoBar({
  items,
  dark
}: {
  items: Extract<DetailProfile, { roleType: "shop" }>["coreInfoItems"];
  dark: boolean;
}) {
  return (
    <SectionCard dark={dark} title="核心信息条">
      <div className="grid gap-3">
        {items.map((item) => (
          <div className={cn("rounded-[22px] border px-4 py-3", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")} key={`${item.label}-${item.value}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn("text-[11px] font-black uppercase tracking-[0.14em]", dark ? "text-[#f7ead0]/45" : "text-ink/42")}>{item.label}</p>
                <p className="mt-2 text-sm font-black leading-6">{item.value}</p>
              </div>
              {item.caption ? <p className={cn("max-w-[38%] text-right text-xs leading-5", dark ? "text-[#f7ead0]/55" : "text-ink/50")}>{item.caption}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ShopServiceListSection({
  items,
  dark
}: {
  items: Extract<DetailProfile, { roleType: "shop" }>["serviceItems"];
  dark: boolean;
}) {
  return (
    <SectionCard dark={dark} title="服务项目区" description="把门店最重要的服务和价格区间前置出来，减少用户反复来回查看。">
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <article className={cn("rounded-[22px] border p-4", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")} key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-black">{item.name}</h4>
                  <p className={cn("mt-2 text-sm leading-6", dark ? "text-[#f7ead0]/72" : "text-ink/65")}>{item.summary}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}>{item.priceLabel}</p>
                  {item.durationLabel ? <p className={cn("mt-1 text-[11px]", dark ? "text-[#f7ead0]/52" : "text-ink/45")}>{item.durationLabel}</p> : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.tags.map((tag, index) => (
                  <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", getToneClasses(dark, index === 0 ? "primary" : "neutral"))} key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={cn("text-sm leading-6", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>暂时还没有同步到可展示的服务项目。</p>
      )}
    </SectionCard>
  );
}

function TeamSection({
  members,
  dark
}: {
  members: Extract<DetailProfile, { roleType: "shop" }>["teamMembers"];
  dark: boolean;
}) {
  return (
    <SectionCard dark={dark} title="团队 / 技师区">
      {members.length > 0 ? (
        <div className="space-y-3">
          {members.map((member) => (
            <article className={cn("flex gap-3 rounded-[22px] border p-4", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")} key={member.id}>
              <AvatarImage alt={member.name} className="h-16 w-16 shrink-0" src={member.avatar} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-black">{member.name}</h4>
                    <p className={cn("mt-1 text-xs leading-5", dark ? "text-[#f7ead0]/55" : "text-ink/50")}>{member.subtitle}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-xs font-black", dark ? "text-[#f3cf78]" : "text-moss")}>{typeof member.score === "number" ? member.score.toFixed(1) : "--"} /5</p>
                    <p className={cn("mt-1 text-[11px]", dark ? "text-[#f7ead0]/52" : "text-ink/45")}>{member.reviewCount ? `${member.reviewCount}人评价` : "暂无评价"}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {member.tags.map((tag, index) => (
                    <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", getToneClasses(dark, index === 0 ? "primary" : "neutral"))} key={`${member.id}-${tag}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={cn("text-sm leading-6", dark ? "text-[#f7ead0]/52" : "text-ink/50")}>当前门店还没有公开展示的团队成员。</p>
      )}
    </SectionCard>
  );
}

function MapSection({
  detail,
  dark
}: {
  detail: Extract<DetailProfile, { roleType: "shop" }>;
  dark: boolean;
}) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detail.mapInfo.address)}`;

  return (
    <SectionCard dark={dark} title="地图与位置区">
      <div className={cn("overflow-hidden rounded-[24px] border", dark ? "border-[#2f2515]/55 bg-[#100d0a]" : "border-line/80 bg-paper")}>
        <div className={cn("grid min-h-[180px] place-items-center px-4 py-6 text-center", dark ? "bg-[radial-gradient(circle_at_top,_rgba(243,207,120,0.14),_transparent_58%)]" : "bg-[radial-gradient(circle_at_top,_rgba(63,107,78,0.10),_transparent_58%)]")}>
          <div>
            <p className={cn("text-xs font-black tracking-[0.16em]", dark ? "text-[#f7ead0]/45" : "text-ink/42")}>位置</p>
            <p className="mt-3 text-base font-black leading-7">{detail.mapInfo.address}</p>
            <p className={cn("mt-2 text-sm leading-6", dark ? "text-[#f7ead0]/68" : "text-ink/58")}>{detail.mapInfo.access}</p>
            {detail.mapInfo.nearestStation ? <p className={cn("mt-2 text-xs", dark ? "text-[#f7ead0]/55" : "text-ink/45")}>{detail.mapInfo.nearestStation}</p> : null}
            {detail.mapInfo.landmark ? <p className={cn("mt-1 text-xs", dark ? "text-[#f7ead0]/48" : "text-ink/42")}>附近地标：{detail.mapInfo.landmark}</p> : null}
            <a
              className={cn(
                "focus-ring mt-4 inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-black transition",
                dark ? "bg-[#f0cf7b] text-[#080705]" : "bg-moss text-white"
              )}
              href={mapUrl}
              rel="noreferrer"
              target="_blank"
            >
              打开地图
            </a>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function UserBasicDetailBody({
  detail,
  dark,
  isFavorite,
  onToggleFavorite,
  extraContent
}: {
  detail: PersonalDetailProfile & { roleType: "user" };
  dark: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  extraContent?: ReactNode;
}) {
  const basicRowLabels = new Set(["系统ID", "性别", "年龄", "身高", "所在区域", "支持语言", "会员种类", "认证状态", "最近预约", "最近下单"]);
  const compactRows = [...detail.basicInfoRows, ...detail.capabilityRows]
    .filter((row) => row.value.trim().length > 0 && basicRowLabels.has(row.label));
  const badges = [...detail.statusBadges, ...detail.summaryBadges].slice(0, 6);

  return (
    <div className="space-y-4 px-4 pb-32">
      <section className={cn("overflow-hidden rounded-[28px] border", dark ? "border-[#3b2f18]/45 bg-[#14110d]" : "border-line bg-white")}>
        <div className="flex items-start gap-4 px-5 py-5">
          <AvatarImage alt={detail.displayName} className="h-20 w-20 shrink-0" src={detail.avatar || detail.galleryImages[0]?.src || ""} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-[11px] font-black uppercase tracking-[0.14em]", dark ? "text-[#f7ead0]/44" : "text-ink/40")}>{detail.subtitle}</p>
            <h2 className="mt-1 text-[24px] font-black leading-tight">{detail.displayName}</h2>
            <p className={cn("mt-2 text-sm leading-6", dark ? "text-[#f7ead0]/62" : "text-ink/58")}>{detail.locationLabel}</p>
            {badges.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <span className={cn("rounded-full px-3 py-1.5 text-xs font-black", getToneClasses(dark, badge.tone))} key={badge.label}>
                    {badge.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <Button onClick={onToggleFavorite} size="sm" variant={isFavorite ? "primary" : "secondary"}>
            {isFavorite ? "已关注" : "关注"}
          </Button>
        </div>
      </section>

      <ProfileInfoList
        caption="用户资料保持轻量，参考聊天软件的个人资料页组织方式，只保留基础信息与备注。"
        columns={1}
        dark={dark}
        rows={compactRows}
        title="基本资料"
      />

      {detail.introBlocks.length > 0 ? (
        <FlowSection dark={dark} title="个人介绍">
          <div className="space-y-3">
            {detail.introBlocks.map((block) => (
              <div key={block.title}>
                <p className={cn("text-xs font-black uppercase tracking-[0.14em]", dark ? "text-[#f7ead0]/44" : "text-ink/40")}>{block.title}</p>
                <p className={cn("mt-2 text-sm leading-7", dark ? "text-[#f7ead0]/72" : "text-ink/68")}>{block.content}</p>
              </div>
            ))}
          </div>
        </FlowSection>
      ) : null}

      {detail.tags.length > 0 ? (
        <FlowSection dark={dark} title="标签 / 备注">
          <div className="flex flex-wrap gap-2">
            {detail.tags.map((tag) => (
              <span className={cn("rounded-full px-3 py-2 text-xs font-black", getToneClasses(dark, "neutral"))} key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </FlowSection>
      ) : null}

      {extraContent ? <FlowSection dark={dark} title="补充信息">{extraContent}</FlowSection> : null}
    </div>
  );
}

function TechnicianDetailBody({
  detail,
  dark,
  isFavorite,
  onToggleFavorite,
  availabilitySection,
  priorityContent,
  extraContent
}: {
  detail: PersonalDetailProfile & { roleType: "technician" };
  dark: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  availabilitySection?: ReactNode;
  priorityContent?: ReactNode;
  extraContent?: ReactNode;
}) {
  return (
    <div className="space-y-1 px-4 pb-32">
      <div className="-mx-4">
        <GalleryCarousel dark={dark} images={detail.galleryImages} title={detail.displayName} />
      </div>
      <PersonalHeaderSummary dark={dark} detail={detail} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} />
      {availabilitySection ?? <RecentTwoWeekAvailability />}
      {priorityContent}
      <KeyInfoChips dark={dark} detail={detail} />
      <ProfileInfoList
        caption="技师详情沿用聊天页主结构，但把近期可约统一成首页的最近两周预约模块。"
        columns={2}
        dark={dark}
        rows={detail.basicInfoRows}
        title="基本资料区"
      />
      <ProfileInfoList columns={2} dark={dark} rows={detail.capabilityRows} title={detail.capabilityTitle} />
      <PersonalIntroSection dark={dark} detail={detail} />
      {extraContent ? <FlowSection dark={dark} title="补充信息">{extraContent}</FlowSection> : null}
      <PersonalReviewSummarySection dark={dark} detail={detail} />
      <ProfileTagsSection dark={dark} detail={detail} />
    </div>
  );
}

function ShopDetailBody({
  detail,
  dark,
  isFavorite,
  onToggleFavorite,
  availabilitySection,
  priorityContent,
  extraContent
}: {
  detail: Extract<DetailProfile, { roleType: "shop" }>;
  dark: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  availabilitySection?: ReactNode;
  priorityContent?: ReactNode;
  extraContent?: ReactNode;
}) {
  return (
    <div className="space-y-5 pb-32">
      <GalleryCarousel dark={dark} images={detail.galleryImages} title={detail.displayName} />
      <ShopHeaderSummary dark={dark} detail={detail} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} />
      <ShopCoreInfoBar dark={dark} items={detail.coreInfoItems} />
      {availabilitySection ?? <RecentTwoWeekAvailability />}
      {priorityContent}
      <IntroSection blocks={detail.introBlocks} dark={dark} />
      <InfoTableSection columns={1} dark={dark} rows={detail.detailInfoRows} title="店铺详细信息区" />
      <ShopServiceListSection dark={dark} items={detail.serviceItems} />
      <TeamSection dark={dark} members={detail.teamMembers} />
      {extraContent}
      <ReviewSummarySection dark={dark} summary={detail.reviewSummary} />
      <DetailBadgeCloud dark={dark} emptyText="暂时还没有聚合出的高频标签。" items={detail.tags} title="标签区" />
      <MapSection dark={dark} detail={detail} />
    </div>
  );
}

export function buildDefaultDetailActions({
  detail,
  isFavorite,
  onToggleFavorite
}: {
  detail: DetailProfile;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}): DetailPageAction[] {
  if (detail.roleType === "shop") {
    return [
      { label: "聊天咨询", variant: "secondary" },
      { label: isFavorite ? "已收藏" : "收藏", variant: "secondary", onClick: onToggleFavorite },
      { label: "查看服务", variant: "secondary" },
      { label: "立即预约", variant: "primary" }
    ];
  }

  return [
    { label: "聊天", variant: "secondary" },
    { label: isFavorite ? "已关注" : "关注", variant: "secondary", onClick: onToggleFavorite },
    { label: detail.roleType === "technician" ? "立即预约" : "发起联系", variant: "primary" }
  ];
}

export function StickyActionBar({
  actions,
  dark,
  className
}: {
  actions: DetailPageAction[];
  dark: boolean;
  className?: string;
}) {
  const columnCount = Math.max(actions.length, 1);

  return (
    <div className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-[75] mx-auto w-full max-w-[480px] px-3 pb-3", className)}>
      <div
        className={cn(
          "pointer-events-auto rounded-[28px] border p-3 shadow-soft backdrop-blur-xl",
          dark ? "border-[#3d3018]/55 bg-[#090806]/94" : "border-line bg-white/95"
        )}
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
          {actions.map((action, index) => buildActionButton(action, dark, `${action.label}-${index}`))}
        </div>
      </div>
    </div>
  );
}

export function DetailPageBody({
  detail,
  dark,
  availabilitySection,
  priorityContent,
  extraContent,
  isFavorite,
  onToggleFavorite
}: {
  detail: DetailProfile;
  dark: boolean;
  availabilitySection?: ReactNode;
  priorityContent?: ReactNode;
  extraContent?: ReactNode;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  if (detail.roleType === "shop") {
    return <ShopDetailBody availabilitySection={availabilitySection} dark={dark} detail={detail} extraContent={extraContent} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} priorityContent={priorityContent} />;
  }

  if (detail.roleType === "user") {
    return <UserBasicDetailBody dark={dark} detail={detail as PersonalDetailProfile & { roleType: "user" }} extraContent={extraContent} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} />;
  }

  return <TechnicianDetailBody availabilitySection={availabilitySection} dark={dark} detail={detail as PersonalDetailProfile & { roleType: "technician" }} extraContent={extraContent} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} priorityContent={priorityContent} />;
}

export function EntityDetailPage({
  detail,
  dark,
  availabilitySection,
  priorityContent,
  extraContent,
  actions,
  onClose
}: {
  detail: DetailProfile;
  dark: boolean;
  availabilitySection?: ReactNode;
  priorityContent?: ReactNode;
  extraContent?: ReactNode;
  actions?: DetailPageAction[];
  onClose: () => void;
}) {
  const [isFavorite, setIsFavorite] = useState(false);
  const resolvedActions = actions ?? buildDefaultDetailActions({
    detail,
    isFavorite,
    onToggleFavorite: () => setIsFavorite((current) => !current)
  });
  const surfaceClass = dark ? "bg-[#090806] text-white" : "bg-paper text-ink";

  return (
    <section className={cn("safe-screen-shell fixed inset-y-0 left-1/2 z-[72] flex h-[100dvh] w-full max-w-[480px] -translate-x-1/2 flex-col overflow-hidden shadow-soft", surfaceClass)}>
      <MobileFullscreenHeader
        dark={dark}
        onClose={onClose}
        subtitle={detail.subtitle}
        title={detail.displayName}
      />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <DetailPageBody
          availabilitySection={availabilitySection}
          dark={dark}
          detail={detail}
          priorityContent={priorityContent}
          extraContent={extraContent}
          isFavorite={isFavorite}
          onToggleFavorite={() => setIsFavorite((current) => !current)}
        />
      </main>
      <StickyActionBar actions={resolvedActions} dark={dark} />
    </section>
  );
}
