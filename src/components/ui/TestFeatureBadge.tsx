import { cn } from "../../lib/utils";

export function TestFeatureBadge({ className }: { className?: string }) {
  return (
    <span
      aria-label="Test 功能"
      className={cn(
        "inline-flex min-h-5 items-center rounded-full border border-red-300/70 bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-[0_8px_20px_rgba(239,68,68,0.28)]",
        className
      )}
    >
      Test
    </span>
  );
}
