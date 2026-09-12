import type { CSSProperties } from "react";

export function ScheduleCacheRefreshIndicator({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center opacity-50"
      role="status"
    >
      <div className="schedule-cache-refresh-ring" aria-label={label}>
        {Array.from({ length: 12 }, (_, index) => (
          <span
            className="schedule-cache-refresh-dot"
            key={index}
            style={{ "--schedule-dot-index": index } as CSSProperties}
          />
        ))}
        <span className="schedule-cache-refresh-label">LOADING</span>
      </div>
    </div>
  );
}
