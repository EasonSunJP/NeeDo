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
      className="mt-4 flex flex-wrap items-center gap-4"
      aria-label="特殊评价"
    >
      {tags.map((tag) => (
        <span
          className="relative inline-grid h-10 w-10 place-items-center text-[30px] leading-none"
          data-testid="special-review-icon"
          key={tag.code}
          title={tag.label}
        >
          <span aria-hidden="true">{tag.icon}</span>
          <span
            className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#f7f9f7] px-1 text-center text-[10px] font-black leading-5 text-[#031014]"
            aria-label={`${tag.label} ${tag.count}次评价`}
          >
            {Math.max(0, tag.count)}
          </span>
        </span>
      ))}
    </div>
  );
}
