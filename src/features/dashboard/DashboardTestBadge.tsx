export function DashboardTestBadge({
  ariaLabel = "TEST",
  disabled = false
}: {
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <span
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      className="inline-flex rounded-full border border-coral/40 bg-coral/10 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-coral"
      data-analytics-disabled-detail={disabled || undefined}
      data-dashboard-test-badge="true"
      title={disabled ? ariaLabel : undefined}
    >
      TEST
    </span>
  );
}
