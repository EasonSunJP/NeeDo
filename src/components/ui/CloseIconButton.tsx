import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { AppIcon } from "../client-ui/AppScaffold";

type CloseIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label?: string;
  iconClassName?: string;
};

export function CloseIconButton({
  label = "关闭",
  className,
  iconClassName,
  type = "button",
  ...props
}: CloseIconButtonProps) {
  return (
    <button aria-label={label} className={cn("admin-close-icon-button focus-ring", className)} type={type} {...props}>
      <AppIcon className={cn("h-5 w-5", iconClassName)} name="close" />
    </button>
  );
}
