import { useEffect, useMemo, useState, type ReactNode } from "react";

interface AutoScrollListProps<T> {
  items: readonly T[];
  visibleCount: number;
  intervalMs: number;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}

export function AutoScrollList<T>({ className, getKey, intervalMs, items, renderItem, visibleCount }: AutoScrollListProps<T>) {
  const [startIndex, setStartIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const keys = useMemo(() => items.map(getKey).join("\u0000"), [getKey, items]);
  const maximumStart = Math.max(0, items.length - visibleCount);

  useEffect(() => setStartIndex(0), [keys, visibleCount]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMedia = () => setReducedMotion(Boolean(media?.matches));
    const onVisibility = () => setVisible(document.visibilityState !== "hidden");
    media?.addEventListener?.("change", onMedia);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media?.removeEventListener?.("change", onMedia);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (maximumStart === 0 || hovered || focused || !visible || reducedMotion) return;
    const timer = window.setInterval(() => {
      setStartIndex((current) => current >= maximumStart ? 0 : current + 1);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [focused, hovered, intervalMs, maximumStart, reducedMotion, visible]);

  const safeStart = Math.min(startIndex, maximumStart);
  const visibleItems = items.slice(safeStart, safeStart + visibleCount);

  return (
    <div
      className={className}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-start-index={safeStart}
      data-testid="auto-scroll-window"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onFocus={() => setFocused(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visibleItems.map((item, offset) => (
        <div className="live-dashboard-scroll-row" key={getKey(item)}>{renderItem(item, safeStart + offset)}</div>
      ))}
    </div>
  );
}
