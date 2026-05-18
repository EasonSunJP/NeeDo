import { cn } from "../../lib/utils";

export function ShareNetworkIconPath({ strokeWidth = 2.3 }: { strokeWidth?: number }) {
  return (
    <>
      <path d="M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4" stroke="currentColor" strokeLinecap="round" strokeWidth={strokeWidth} />
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
    </>
  );
}

export function ShareNetworkIcon({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      <ShareNetworkIconPath strokeWidth={strokeWidth} />
    </svg>
  );
}
