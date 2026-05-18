import type { PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { AvatarImage } from "./AvatarImage";

type InteractiveAvatarProps = {
  alt: string;
  src?: string;
  className?: string;
  wrapperClassName?: string;
  to?: string;
  onClick?: () => void;
  stopPropagation?: boolean;
};

function stopAvatarEvent(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

export function InteractiveAvatar({
  alt,
  src,
  className,
  wrapperClassName,
  to,
  onClick,
  stopPropagation = false
}: InteractiveAvatarProps) {
  const avatar = <AvatarImage alt={alt} className={className} src={src} />;
  const pointerHandlers = stopPropagation ? { onPointerDown: stopAvatarEvent } : undefined;

  if (to) {
    return (
      <Link className={cn("inline-flex shrink-0", wrapperClassName)} to={to} {...pointerHandlers}>
        {avatar}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button className={cn("inline-flex shrink-0", wrapperClassName)} onClick={onClick} type="button" {...pointerHandlers}>
        {avatar}
      </button>
    );
  }

  return <span className={cn("inline-flex shrink-0", wrapperClassName)}>{avatar}</span>;
}
