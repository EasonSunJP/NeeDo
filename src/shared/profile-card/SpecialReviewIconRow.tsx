export type SpecialReviewTag = {
  code: string;
  count: number;
  icon?: string;
  label: string;
};

export function ThemeReviewStampIcon({
  code,
}: {
  code: string;
  index?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className="block h-full w-full text-[color:var(--client-primary)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--client-primary)_42%,transparent)]"
      data-review-stamp-code={code}
      data-testid="theme-review-stamp-icon"
      fill="none"
      style={{ color: "var(--client-primary)" }}
      viewBox="0 0 48 48"
    >
      {code === "appeal_max" ? (
        <>
          <circle cx="24" cy="16" r="7" fill="currentColor" />
          <path d="M12 39c0-9 5-14 12-14s12 5 12 14H12Z" fill="currentColor" />
          <path d="m10 9 1.3 3.2L15 13.5l-3.7 1.3L10 18l-1.3-3.2L5 13.5l3.7-1.3L10 9ZM38 4l1 2.5L42 7.5l-3 1L38 11l-1-2.5-3-1 3-1L38 4Z" fill="currentColor" />
        </>
      ) : code === "service_max" ? (
        <>
          <path d="M24 16c-4-7-13-4-13 3 0 7 13 14 13 14s13-7 13-14c0-7-9-10-13-3Z" fill="currentColor" />
          <path d="M5 28c5 1 8 5 12 11M43 28c-5 1-8 5-12 11M9 24c1 5 5 9 10 12M39 24c-1 5-5 9-10 12" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
        </>
      ) : code === "emotion_max" ? (
        <path d="M8 11h32v23H25l-8 7 2-7H8V11Zm16 7c-3-5-10-3-10 3 0 5 10 10 10 10s10-5 10-10c0-6-7-8-10-3Z" fill="currentColor" fillRule="evenodd" />
      ) : code === "energy_max" ? (
        <>
          <circle cx="24" cy="24" r="12" fill="currentColor" />
          <path d="M24 3v6M24 39v6M3 24h6M39 24h6M9 9l4 4M35 35l4 4M39 9l-4 4M13 35l-4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
          <circle cx="20" cy="22" r="1.5" fill="#031014" />
          <circle cx="28" cy="22" r="1.5" fill="#031014" />
          <path d="M19 28c3 3 7 3 10 0" stroke="#031014" strokeLinecap="round" strokeWidth="2" />
        </>
      ) : (
        <path d="m24 5 5 13 14 1-11 9 4 14-12-8-12 8 4-14-11-9 14-1 5-13Z" fill="currentColor" />
      )}
    </svg>
  );
}

export function SpecialReviewIconRow({ tags }: { tags: SpecialReviewTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-4"
      aria-label="特殊评价"
    >
      {tags.map((tag, index) => (
        <span
          className="relative inline-grid h-7 w-7 place-items-center text-[color:var(--client-primary)] sm:h-10 sm:w-10"
          data-testid="special-review-icon"
          key={tag.code}
          title={tag.label}
        >
          <ThemeReviewStampIcon code={tag.code} index={index} />
          <span
            className="absolute -right-1 -top-1 min-w-4 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_55%,var(--client-bg))] bg-[color:color-mix(in_srgb,var(--client-bg)_74%,var(--client-primary)_26%)] px-0.5 text-center text-[8px] font-black leading-4 text-[color:var(--client-primary)] sm:min-w-5 sm:px-1 sm:text-[10px] sm:leading-5"
            aria-label={`${tag.label} ${tag.count}次评价`}
          >
            {Math.max(0, tag.count)}
          </span>
        </span>
      ))}
    </div>
  );
}
