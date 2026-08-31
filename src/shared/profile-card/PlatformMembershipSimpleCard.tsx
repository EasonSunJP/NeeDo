import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/utils";

const defaultSimpleTopColor = "#0d2f27";
const defaultSimpleBottomColor = "#132630";

export type PlatformMembershipSimpleCardProps = {
  actionSlot?: ReactNode;
  avatarUrl: string | null;
  bio: string;
  className?: string;
  displayName: string;
  ekycVerified: boolean;
  entityKind: "customer" | "technician" | "shop" | "service";
  level: number | null;
  needoId: string;
  onOpenDetails?: () => void;
  simpleBottomColor?: string | null;
  simpleTopColor?: string | null;
};

export function PlatformMembershipSimpleCard({
  actionSlot,
  avatarUrl,
  bio,
  className,
  displayName,
  ekycVerified,
  entityKind,
  level,
  needoId,
  onOpenDetails,
  simpleBottomColor,
  simpleTopColor,
}: PlatformMembershipSimpleCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onOpenDetails || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onOpenDetails();
  };
  const showLevel = entityKind === "customer" && level !== null;

  return (
    <article
      aria-label={onOpenDetails ? `${displayName} contact card` : undefined}
      className={cn(
        "relative w-[338px] max-w-[84vw] overflow-hidden rounded-[28px] border border-white/10 text-white shadow-[0_12px_30px_rgba(0,0,0,0.22)]",
        onOpenDetails && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]",
        className,
      )}
      data-platform-membership-simple-card="true"
      onClick={onOpenDetails}
      onKeyDown={handleKeyDown}
      role={onOpenDetails ? "button" : undefined}
      tabIndex={onOpenDetails ? 0 : undefined}
    >
      <div
        className="min-h-[84px] px-4 pb-4 pl-[116px] pt-4"
        style={{ backgroundColor: simpleTopColor ?? defaultSimpleTopColor }}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <strong className="truncate text-[18px] font-black leading-6">{displayName}</strong>
              {ekycVerified ? (
                <span
                  aria-label="eKYC verified"
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#85d20a] text-[10px] font-black leading-none text-[#071106]"
                  title="eKYC verified"
                >
                  ✓
                </span>
              ) : null}
              {showLevel ? (
                <span className="shrink-0 text-[12px] font-black text-white/88">Lv.{level}</span>
              ) : null}
            </div>
          </div>
          {actionSlot ? <div className="shrink-0" onClick={(event) => event.stopPropagation()}>{actionSlot}</div> : null}
        </div>
      </div>

      <div
        className="min-h-[112px] px-4 pb-4 pl-[116px] pt-3"
        style={{ backgroundColor: simpleBottomColor ?? defaultSimpleBottomColor }}
      >
        <p className="truncate text-[12px] font-bold text-white/72">ID {needoId}</p>
        <p className="mt-2 line-clamp-2 min-h-10 text-[13px] leading-5 text-white/82">{bio}</p>
      </div>

      <div className="absolute left-4 top-[48px] h-[88px] w-[88px] overflow-hidden rounded-[24px] border-2 border-white/42 bg-black/20 shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
        {avatarUrl ? (
          <img alt="" className="h-full w-full object-cover" src={avatarUrl} />
        ) : (
          <span className="grid h-full w-full place-items-center text-2xl font-black text-white/80">
            {displayName.slice(0, 1)}
          </span>
        )}
      </div>
    </article>
  );
}
