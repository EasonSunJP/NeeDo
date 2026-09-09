export type SpecialReviewTag = {
  code: string;
  count: number;
  icon: string;
  label: string;
};

export function SpecialReviewIconRow({ tags }: { tags: SpecialReviewTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-4"
      aria-label="特殊评价"
    >
      {tags.map((tag) => (
        <span
          className="relative inline-grid h-7 w-7 place-items-center text-[20px] leading-none sm:h-10 sm:w-10 sm:text-[30px]"
          data-testid="special-review-icon"
          key={tag.code}
          title={tag.label}
        >
          <span aria-hidden="true">{tag.icon}</span>
          <span
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#f7f9f7] px-0.5 text-center text-[8px] font-black leading-4 text-[#031014] sm:min-w-5 sm:px-1 sm:text-[10px] sm:leading-5"
            aria-label={`${tag.label} ${tag.count}次评价`}
          >
            {Math.max(0, tag.count)}
          </span>
        </span>
      ))}
    </div>
  );
}
