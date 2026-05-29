import { useState } from "react";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { cn } from "../../../lib/utils";

export function TechnicianColumnToggleIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      <path d="M12 4.25v15.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      <path d="m8.3 8.1-4 3.9 4 3.9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      <path d="M4.55 12H9.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      <path d="m15.7 8.1 4 3.9-4 3.9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      <path d="M14.2 12h5.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  );
}

export function TechnicianAvatarBadge({
  alt,
  src,
  className,
  fallbackClassName,
  shape = "circle"
}: {
  alt: string;
  src?: string;
  className?: string;
  fallbackClassName?: string;
  shape?: "circle" | "roundedSquare";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallbackLabel = alt.trim().charAt(0) || "技";
  const shapeClassName = shape === "roundedSquare" ? "rounded-[14px]" : "rounded-full";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/12 bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-bg)_8%)] text-[10px] font-black text-[color:var(--client-primary)] shadow-[0_8px_18px_rgba(0,0,0,0.12)]",
        shapeClassName,
        className
      )}
    >
      {src && !imageFailed ? (
        <AvatarImage
          alt={alt}
          className="h-full w-full"
          onError={() => setImageFailed(true)}
          src={src}
        />
      ) : (
        <span className={cn("leading-none", fallbackClassName)}>{fallbackLabel}</span>
      )}
    </span>
  );
}
