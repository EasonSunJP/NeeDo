import type { ReactNode } from "react";

export function DetailGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div className="rounded-lg border border-line bg-paper p-3" key={item.label}>
          <dt className="text-xs font-semibold text-ink/50">{item.label}</dt>
          <dd className="mt-1 text-sm font-bold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
