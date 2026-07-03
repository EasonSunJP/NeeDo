import { cn } from "../../lib/utils";

export type SpecialBlackIconName =
  | "home"
  | "profile"
  | "plus"
  | "calendar"
  | "bell"
  | "settings"
  | "search"
  | "map"
  | "technician"
  | "service"
  | "clock"
  | "checklist"
  | "nav-home"
  | "nav-profile"
  | "nav-progress"
  | "nav-bell"
  | "nav-chat"
  | "nav-my";

export type SpecialBlackFlatIconName =
  | "home"
  | "feed"
  | "contacts"
  | "settings"
  | "location"
  | "store"
  | "technician"
  | "service"
  | "calendar"
  | "search"
  | "bell"
  | "filter"
  | "warning"
  | "edit"
  | "message-square"
  | "translate"
  | "eye"
  | "plus-circle"
  | "chat"
  | "share-add";

export function getSpecialBlackIconSrc(name: SpecialBlackIconName) {
  return `/icons/special-black/${name}.png`;
}

export function getSpecialBlackFlatIconSrc(name: SpecialBlackFlatIconName) {
  return `/icons/special-black/flat/${name}.png`;
}

export function SpecialBlackIcon({
  name,
  className,
  imageClassName
}: {
  name: SpecialBlackIconName;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("inline-grid place-items-center overflow-hidden", className)}>
      <img
        alt=""
        className={cn("h-full w-full object-cover", imageClassName)}
        draggable={false}
        src={getSpecialBlackIconSrc(name)}
      />
    </span>
  );
}

export function SpecialBlackFlatIcon({
  name,
  className,
  imageClassName
}: {
  name: SpecialBlackFlatIconName;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("inline-grid place-items-center overflow-visible", className)}>
      <img
        alt=""
        className={cn("h-full w-full object-contain", imageClassName)}
        draggable={false}
        src={getSpecialBlackFlatIconSrc(name)}
      />
    </span>
  );
}
