import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function ClientActionDialog({
  open,
  title,
  description,
  children,
  actions,
  onClose,
  closeOnBackdrop = true,
  placement = "bottom",
  className,
  panelClassName
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  placement?: "bottom" | "center";
  className?: string;
  panelClassName?: string;
}) {
  if (!open) {
    return null;
  }

  const handleBackdropClick = () => {
    if (closeOnBackdrop) {
      onClose?.();
    }
  };

  return (
    <div
      aria-modal="true"
      className={cn(
        "client-action-dialog-overlay fixed inset-0 z-[125] flex justify-center px-4 py-[max(16px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))] text-[color:var(--client-text)]",
        placement === "center" ? "items-center" : "items-end sm:items-center",
        className
      )}
      onClick={handleBackdropClick}
      role="dialog"
    >
      <section
        className={cn(
          "client-action-dialog-panel safe-panel-bottom w-full max-w-[460px] rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] p-5 shadow-[0_30px_84px_color-mix(in_srgb,var(--client-shadow)_38%,transparent)]",
          panelClassName
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {placement === "bottom" ? (
          <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-[color:color-mix(in_srgb,var(--client-muted)_28%,transparent)]" />
        ) : null}
        <h2 className="text-[22px] font-black leading-tight">{title}</h2>
        {description ? (
          <p className="mt-3 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{description}</p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {actions ? <div className="mt-5">{actions}</div> : null}
      </section>
    </div>
  );
}
