import { cn } from "../../lib/utils";
import { customerMembershipIcons, resolveCustomerMembership, type SocialProfileMiniMembershipKind } from "./customerMembership";

type CustomerMembershipIconProps = {
  kind: SocialProfileMiniMembershipKind;
  className?: string;
  imageClassName?: string;
};

type CustomerMembershipBadgeProps = {
  level?: string;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  showFallback?: boolean;
};

export function CustomerMembershipIcon({ kind, className, imageClassName }: CustomerMembershipIconProps) {
  const icon = customerMembershipIcons[kind];

  return (
    <span aria-label={icon.alt} className={cn("inline-flex shrink-0 items-center justify-center", className)} title={icon.alt}>
      <img alt="" className={cn("h-8 w-8 shrink-0 object-contain", imageClassName)} draggable={false} src={icon.src} />
    </span>
  );
}

export function CustomerMembershipBadge({
  level,
  className,
  fallbackClassName,
  imageClassName,
  showFallback = true
}: CustomerMembershipBadgeProps) {
  const membership = resolveCustomerMembership(level);

  if (membership.kind) {
    return <CustomerMembershipIcon className={className} imageClassName={imageClassName} kind={membership.kind} />;
  }

  if (!showFallback) {
    return null;
  }

  return <span className={fallbackClassName}>{membership.label}</span>;
}
