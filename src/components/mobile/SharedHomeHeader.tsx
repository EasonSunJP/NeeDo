import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppIcon, IconButton } from "../client-ui/AppScaffold";
import { cn } from "../../lib/utils";
import { AvatarImage } from "../ui/AvatarImage";
import { useClientTheme } from "../../theme/ClientThemeProvider";
import { CustomerMembershipBadge } from "../../shared/profile-card";
import { resolveCustomerMembership } from "../../shared/profile-card/customerMembership";

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-3.5 w-3.5", className)} fill="none" viewBox="0 0 24 24">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function HeaderAvatar({
  alt,
  src,
  toneClass,
  membershipLevel,
  levelLabel
}: {
  alt: string;
  src: string;
  toneClass: string;
  membershipLevel?: string;
  levelLabel?: string;
}) {
  const membership = resolveCustomerMembership(membershipLevel);
  const showMembershipIcon = Boolean(membership.kind);
  const showLevelLabel = Boolean(levelLabel);

  return (
    <span className="relative block h-12 w-12 overflow-visible">
      <span className={cn("avatar-shape block h-full w-full overflow-hidden border bg-[color:var(--client-surface)]", toneClass)}>
        <AvatarImage alt={alt} className="h-full w-full border-0" src={src} />
      </span>
      {showMembershipIcon || showLevelLabel ? (
        <>
          {showMembershipIcon ? (
            <CustomerMembershipBadge
              className="absolute -top-3 left-1/2 z-10 h-6 w-6 -translate-x-1/2"
              imageClassName="h-6 w-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.42)]"
              level={membershipLevel}
              showFallback={false}
            />
          ) : null}
          {showLevelLabel ? (
            <span
              aria-hidden="true"
              className="absolute -bottom-2 left-1/2 z-10 flex h-4 -translate-x-1/2 items-center whitespace-nowrap text-[11px] font-black leading-none text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.72)]"
              title={`${membership.label} ${levelLabel}`}
            >
              {levelLabel}
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

export function SharedHomeHeader({
  avatarAlt,
  avatarSrc,
  avatarTo,
  avatarLabel = "打开个人主页",
  avatarMembershipLevel,
  avatarLevelLabel,
  onAvatarClick,
  locationLabel,
  locationCaption,
  locationTo,
  secondaryActionTo,
  secondaryActionLabel,
  secondaryActionIcon = "bell",
  settingsTo,
  settingsLabel = "打开设置",
  rightAction,
  onLocationClick,
  dark = false,
  forceLight = false,
  className
}: {
  avatarAlt: string;
  avatarSrc: string;
  avatarTo?: string;
  avatarLabel?: string;
  avatarMembershipLevel?: string;
  avatarLevelLabel?: string;
  onAvatarClick?: () => void;
  locationLabel: string;
  locationCaption?: string;
  locationTo?: string;
  secondaryActionTo?: string;
  secondaryActionLabel?: string;
  secondaryActionIcon?: "bell" | "chat";
  settingsTo?: string;
  settingsLabel?: string;
  rightAction?: ReactNode;
  onLocationClick?: () => void;
  dark?: boolean;
  forceLight?: boolean;
  className?: string;
}) {
  const { isNight } = useClientTheme();
  const resolvedLocationLabel = locationLabel.trim() || "定位中";
  const useBrightIcons = forceLight ? false : dark || isNight;
  const locationToneClass = dark
    ? "border-white/12 bg-white/10 text-white shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
    : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-[color:var(--client-text)] shadow-[0_12px_30px_rgba(0,0,0,0.07)]";
  const avatarToneClass = dark
    ? "border-white/15"
    : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]";
  const bubbleToneClass = useBrightIcons
    ? "bg-white/12 text-white"
    : "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]";
  const captionToneClass = dark ? "text-white/55" : "text-[color:var(--client-muted)]";
  const labelToneClass = dark ? "text-white" : "text-[color:var(--client-text)]";
  const avatarNode = (
    <HeaderAvatar
      alt={avatarAlt}
      levelLabel={avatarLevelLabel}
      membershipLevel={avatarMembershipLevel}
      src={avatarSrc}
      toneClass={avatarToneClass}
    />
  );

  const locationContent = (
    <>
      <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full", bubbleToneClass)}>
        <AppIcon className="h-4 w-4" name="map" />
      </span>
      <span className="min-w-0 flex-1">
        {locationCaption ? <span className={cn("block text-[11px] font-bold", captionToneClass)}>{locationCaption}</span> : null}
        <span className={cn("block truncate text-[14px] font-black", labelToneClass)}>{resolvedLocationLabel}</span>
      </span>
      {onLocationClick || locationTo ? <ChevronIcon className={useBrightIcons ? "text-white/55" : "text-[color:var(--client-muted)]"} /> : null}
    </>
  );

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {onAvatarClick ? (
        <button aria-label={avatarLabel} className="shrink-0" onClick={onAvatarClick} type="button">
          {avatarNode}
        </button>
      ) : avatarTo ? (
        <Link aria-label={avatarLabel} className="shrink-0" to={avatarTo}>
          {avatarNode}
        </Link>
      ) : (
        <div className="shrink-0">
          {avatarNode}
        </div>
      )}

      {onLocationClick ? (
        <button
          className={cn("flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[20px] border px-3 text-left", locationToneClass)}
          onClick={onLocationClick}
          type="button"
        >
          {locationContent}
        </button>
      ) : locationTo ? (
        <Link className={cn("focus-ring flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[20px] border px-3 text-left", locationToneClass)} to={locationTo}>
          {locationContent}
        </Link>
      ) : (
        <div className={cn("flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[20px] border px-3", locationToneClass)}>
          {locationContent}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2">
        {secondaryActionTo && secondaryActionLabel ? (
          <IconButton
            className={cn(
              dark
                ? "border-white/12 bg-white/10 text-white shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
                : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-[color:var(--client-text)]"
            )}
            icon={secondaryActionIcon}
            label={secondaryActionLabel}
            to={secondaryActionTo}
          />
        ) : null}
        {rightAction ?? (
          settingsTo ? (
            <IconButton
              className={cn(
                dark
                  ? "border-white/12 bg-white/10 text-white shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
                  : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-[color:var(--client-text)]"
              )}
              icon="settings"
              label={settingsLabel}
              to={settingsTo}
            />
          ) : null
        )}
      </div>
    </div>
  );
}
