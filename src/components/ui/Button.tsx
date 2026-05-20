import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "dark" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-moss text-[color:var(--client-primary-contrast)] hover:brightness-95",
  secondary: "border border-line bg-white text-ink hover:border-moss",
  ghost: "text-ink hover:bg-black/5",
  dark: "bg-ink text-white hover:bg-black",
  danger: "bg-coral text-white hover:bg-[#d95c4d]"
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base"
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  to?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  to,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "focus-ring inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    className
  );

  if (to) {
    return (
      <Link className={classes} to={to}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} type="button" {...props}>
      {icon}
      {children}
    </button>
  );
}
