import type { ReactNode } from "react";
import { AppIcon } from "../client-ui/AppScaffold";
import { cn } from "../../lib/utils";

export type ContactInfoStatusResolution = "active" | "expired" | "resolved";
export type ContactInfoStatusFilter = ContactInfoStatusResolution | "all";

export type ContactInfoStatusItem = {
  dateLabel?: string;
  detail: string;
  icon: ReactNode;
  id: string;
  status: ContactInfoStatusResolution;
  statusLabel: string;
  timestampLabel?: string;
  title: string;
  tone?: "neutral" | "red";
};

const contactInfoStatusFilterOptions: Array<{ label: string; value: ContactInfoStatusFilter }> = [
  { label: "未解决", value: "active" },
  { label: "已过期", value: "expired" },
  { label: "已解决", value: "resolved" },
  { label: "全部", value: "all" }
];

function getStatusPillClassName(status: ContactInfoStatusResolution) {
  if (status === "expired") {
    return "border-[#ef5b55]/28 bg-[#ef5b55]/10 text-[#ef5b55]";
  }

  if (status === "resolved") {
    return "border-[color:color-mix(in_srgb,var(--client-primary)_26%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[color:var(--client-primary)]";
  }

  return "border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-muted)]";
}

function ContactInfoStatusRow<TItem extends ContactInfoStatusItem>({
  item,
  onSelect
}: {
  item: TItem;
  onSelect?: (item: TItem) => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[18px] border text-base font-black",
          item.tone === "red"
            ? "border-[#ef5b55]/30 bg-[#ef5b55]/12 text-[#ef5b55]"
            : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-muted)]"
        )}
      >
        {item.icon}
      </span>
      <span className="min-w-0 self-center">
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr),auto] items-start gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[17px] font-black leading-tight text-[color:var(--client-text)]">
              {item.title}
            </span>
            <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none", getStatusPillClassName(item.status))}>
              {item.statusLabel}
            </span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-right text-[12px] font-black leading-5 text-[color:var(--client-soft-muted)] tabular-nums">
            {item.dateLabel ?? item.timestampLabel ?? "-"}
          </span>
        </span>
        <span className="mt-1 block text-left text-[13px] font-bold leading-5 text-[color:var(--client-muted)]">
          {item.detail}
        </span>
      </span>
    </>
  );
  const className = "grid w-full grid-cols-[auto,minmax(0,1fr)] items-start gap-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-4 text-left";

  if (onSelect) {
    return (
      <button className={cn("focus-ring transition active:scale-[0.99]", className)} onClick={() => onSelect(item)} type="button">
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function ContactInfoStatusPanel<TItem extends ContactInfoStatusItem>({
  className,
  emptyDateLabel = "-",
  emptyDetail = "当前筛选条件下没有联系信息。",
  emptyIcon = <AppIcon className="h-6 w-6" name="bell" />,
  emptyId = "contact-info-empty",
  emptyStatusLabel = "空",
  emptyTitle = "系统信息",
  filter,
  items,
  onFilterChange,
  onSelect,
  title = "联系信息"
}: {
  className?: string;
  emptyDateLabel?: string;
  emptyDetail?: string;
  emptyIcon?: ReactNode;
  emptyId?: string;
  emptyStatusLabel?: string;
  emptyTitle?: string;
  filter: ContactInfoStatusFilter;
  items: TItem[];
  onFilterChange: (filter: ContactInfoStatusFilter) => void;
  onSelect?: (item: TItem) => void;
  title?: string;
}) {
  const visibleItems = filter === "all" ? items : items.filter((item) => item.status === filter);
  const emptyItem: ContactInfoStatusItem = {
    dateLabel: emptyDateLabel,
    detail: emptyDetail,
    icon: emptyIcon,
    id: emptyId,
    status: "active",
    statusLabel: emptyStatusLabel,
    title: emptyTitle
  };

  return (
    <section
      className={cn(
        "client-nav-aligned-panel rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] p-4 shadow-panel",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-[17px] font-black leading-none text-[color:var(--client-text)]">{title}</span>
        <div className="flex max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] p-1">
          {contactInfoStatusFilterOptions.map((option) => {
            const active = filter === option.value;

            return (
              <button
                aria-pressed={active}
                className={cn(
                  "focus-ring h-9 shrink-0 rounded-full px-3 text-[12px] font-black transition",
                  active
                    ? option.value === "expired"
                      ? "bg-[#ef4444] text-white"
                      : "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]"
                    : "text-[color:var(--client-muted)]"
                )}
                key={option.value}
                onClick={() => onFilterChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => <ContactInfoStatusRow item={item} key={item.id} onSelect={onSelect} />)
        ) : (
          <ContactInfoStatusRow item={emptyItem} />
        )}
      </div>
    </section>
  );
}
