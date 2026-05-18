import { cn } from "../../lib/utils";

type KycVerifiedBadgeProps = {
  className?: string;
  label?: string;
  size?: "inline" | "label";
};

export function KycVerifiedBadge({ className, label = "KYC 已验证", size = "inline" }: KycVerifiedBadgeProps) {
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[#a7ef4f] font-black leading-none text-black ring-1 ring-[rgba(215,255,137,0.72)]",
        size === "label"
          ? "h-[14px] w-[14px] text-[7px] shadow-[0_0_8px_rgba(167,239,79,0.46)]"
          : "h-[0.88em] w-[0.88em] text-[0.55em] align-[-0.06em] shadow-[0_0_0.55em_rgba(167,239,79,0.46)]",
        className
      )}
      title={label}
    >
      ✓
    </span>
  );
}
