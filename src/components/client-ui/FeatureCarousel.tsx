import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";

export const featureCarouselFrameClassName = "relative mx-auto w-full max-w-[856px]";

export type FeatureCarouselSlide = {
  id: string;
  badge?: string;
  title: string;
  caption?: string;
  cta?: string;
  image: string;
  to?: string;
};

export function FeatureCarousel({
  slides,
  className,
  autoRotateMs = 5000,
  cardHeightClassName = "h-[176px]",
  activeIndex,
  onActiveIndexChange,
  onSlideClick,
  showIndicators = true,
  viewportClassName,
  slideClassName,
  renderSlide
}: {
  slides: FeatureCarouselSlide[];
  className?: string;
  autoRotateMs?: number | null;
  cardHeightClassName?: string;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  onSlideClick?: (slide: FeatureCarouselSlide, index: number) => void;
  showIndicators?: boolean;
  viewportClassName?: string;
  slideClassName?: string;
  renderSlide?: (args: { slide: FeatureCarouselSlide; index: number; isActive: boolean }) => React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const scrollSettledTimerRef = useRef<number | null>(null);
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const isControlled = typeof activeIndex === "number";
  const resolvedActiveIndex =
    slides.length === 0 ? 0 : Math.min(Math.max(isControlled ? activeIndex ?? 0 : internalActiveIndex, 0), slides.length - 1);

  const clearScrollSettledTimer = () => {
    if (scrollSettledTimerRef.current === null) {
      return;
    }

    window.clearTimeout(scrollSettledTimerRef.current);
    scrollSettledTimerRef.current = null;
  };

  const getClosestSlideIndex = () => {
    const viewport = viewportRef.current;

    if (!viewport || slideRefs.current.length === 0) {
      return 0;
    }

    const currentScrollLeft = viewport.scrollLeft;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    slideRefs.current.forEach((slide, index) => {
      if (!slide) {
        return;
      }

      const distance = Math.abs(slide.offsetLeft - currentScrollLeft);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  };

  const updateActiveIndex = (nextIndex: number | ((current: number) => number)) => {
    const computedIndex = typeof nextIndex === "function" ? nextIndex(resolvedActiveIndex) : nextIndex;
    const clampedIndex = slides.length === 0 ? 0 : Math.min(Math.max(computedIndex, 0), slides.length - 1);

    if (!isControlled) {
      setInternalActiveIndex(clampedIndex);
    }

    onActiveIndexChange?.(clampedIndex);
  };

  useEffect(() => {
    slideRefs.current = slideRefs.current.slice(0, slides.length);
    setInternalActiveIndex((current) => {
      if (slides.length === 0) {
        return 0;
      }

      return Math.min(current, slides.length - 1);
    });
  }, [slides.length]);

  useEffect(() => {
    if (!autoRotateMs || slides.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      updateActiveIndex((current) => (current + 1) % slides.length);
    }, autoRotateMs);

    return () => window.clearInterval(timer);
  }, [autoRotateMs, resolvedActiveIndex, slides.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const currentSlide = slideRefs.current[resolvedActiveIndex];

    if (!viewport || !currentSlide) {
      return;
    }

    viewport.scrollTo({
      left: currentSlide.offsetLeft,
      behavior: "smooth"
    });
  }, [resolvedActiveIndex]);

  useEffect(
    () => () => {
      clearScrollSettledTimer();
    },
    []
  );

  if (slides.length === 0) {
    return null;
  }

  const renderDefaultSlideContent = (slide: FeatureCarouselSlide) => (
    <>
      <img alt={slide.title} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(slide.image)} />
      <div className="absolute inset-0 bg-gradient-to-r from-[rgba(0,0,0,0.62)] via-[rgba(0,0,0,0.28)] to-[rgba(0,0,0,0.08)]" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(0,0,0,0.34)] to-transparent" />
      <div className="relative flex h-full flex-col justify-between p-4 pb-8 text-white">
        <div>
          {slide.badge ? (
            <span className="inline-flex rounded-full bg-[rgba(255,255,255,0.16)] px-3 py-1 text-[11px] font-black backdrop-blur">
              {slide.badge}
            </span>
          ) : null}
          <h3 className="mt-3 max-w-[72%] text-[28px] font-black leading-[1.04] tracking-[-0.04em]">{slide.title}</h3>
          {slide.caption ? <p className="mt-2 max-w-[72%] text-[12px] leading-5 text-white/80">{slide.caption}</p> : null}
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white/14 px-3 py-2 text-[12px] font-black backdrop-blur">
          {slide.cta || "查看详情"}
          <svg aria-hidden="true" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
          </svg>
        </span>
      </div>
    </>
  );

  return (
    <section className={cn(featureCarouselFrameClassName, className)}>
      <div
        className={cn("scrollbar-none flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain", viewportClassName)}
        onScroll={() => {
          if (slides.length <= 1) {
            return;
          }

          clearScrollSettledTimer();

          scrollSettledTimerRef.current = window.setTimeout(() => {
            scrollSettledTimerRef.current = null;

            const nextIndex = getClosestSlideIndex();
            updateActiveIndex((current) => (current === nextIndex ? current : nextIndex));
          }, 140);
        }}
        ref={viewportRef}
      >
        {slides.map((slide, index) => (
          renderSlide ? (
            <div
              className={cn(
                "relative w-full min-w-full basis-full shrink-0 snap-start overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]",
                cardHeightClassName,
                slideClassName
              )}
              key={slide.id}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
            >
              {renderSlide({ slide, index, isActive: resolvedActiveIndex === index })}
            </div>
          ) : onSlideClick ? (
            <button
              className={cn(
                "relative w-full min-w-full basis-full shrink-0 snap-start overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] text-left",
                cardHeightClassName,
                slideClassName
              )}
              key={slide.id}
              onClick={() => onSlideClick(slide, index)}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
              type="button"
            >
              {renderDefaultSlideContent(slide)}
            </button>
          ) : slide.to ? (
            <Link
              className={cn(
                "relative w-full min-w-full basis-full shrink-0 snap-start overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]",
                cardHeightClassName,
                slideClassName
              )}
              key={slide.id}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
              to={slide.to}
            >
              {renderDefaultSlideContent(slide)}
            </Link>
          ) : (
            <div
              className={cn(
                "relative w-full min-w-full basis-full shrink-0 snap-start overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]",
                cardHeightClassName,
                slideClassName
              )}
              key={slide.id}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
            >
              {renderDefaultSlideContent(slide)}
            </div>
          )
        ))}
      </div>

      {showIndicators ? (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center">
          <div className="flex items-center justify-center gap-2">
            {slides.map((slide, index) => (
              <button
                aria-label={`切换到第 ${index + 1} 张轮播`}
                className={cn(
                  "h-2 rounded-full transition",
                  resolvedActiveIndex === index ? "w-6 bg-[color:var(--client-primary)]" : "w-2 bg-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)]"
                )}
                key={`${slide.id}-${index}`}
                onClick={() => updateActiveIndex(index)}
                type="button"
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
