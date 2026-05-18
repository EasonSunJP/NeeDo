import { cn } from "../../lib/utils";

export function PinBadgeIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4", className)} fill="none" viewBox="0 0 48 48">
      <circle cx="24" cy="24" fill="var(--pin-badge-fill, #43a07b)" r="22" />
      <path d="M14 14h20" stroke="var(--pin-badge-glyph, #163630)" strokeLinecap="round" strokeWidth="3.8" />
      <path d="M24 34V19" stroke="var(--pin-badge-glyph, #163630)" strokeLinecap="round" strokeWidth="3.8" />
      <path d="M24 18.5 16.5 26" stroke="var(--pin-badge-glyph, #163630)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.8" />
      <path d="M24 18.5 31.5 26" stroke="var(--pin-badge-glyph, #163630)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.8" />
    </svg>
  );
}
