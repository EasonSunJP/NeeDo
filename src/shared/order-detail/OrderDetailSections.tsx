import type { ReactNode } from "react";

export function OrderDetailFactGrid({
  rows,
  title
}: {
  rows: Array<[string, ReactNode]>;
  title: string;
}) {
  return (
    <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
      <h2 className="text-base font-black text-[color:var(--client-text)]">{title}</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div className="rounded-[16px] bg-[color:var(--client-elevated)] px-3 py-3" key={label}>
            <dt className="text-[11px] font-black text-[color:var(--client-muted)]">{label}</dt>
            <dd className="mt-1 text-sm font-black text-[color:var(--client-text)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function OrderDetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-black text-[color:var(--client-muted)]">{title}</h2>
      {children}
    </section>
  );
}
