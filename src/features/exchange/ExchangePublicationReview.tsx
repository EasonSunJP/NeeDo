export function ExchangePublicationReview({
  typeLabel,
  rows,
  detail,
  publicationFee
}: {
  typeLabel: string;
  rows: Array<{ label: string; value: string }>;
  detail: string;
  publicationFee?: { amountNdp: number; currency: "NDP" | "TEST_NDP" };
}) {
  return (
    <section
      className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel"
      data-testid="exchange-publication-review"
    >
      <h2 className="text-xl font-black text-[color:var(--client-text)]">{typeLabel}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div className="rounded-xl bg-[color:var(--client-bg-soft)] p-3" key={row.label}>
            <dt className="text-xs font-bold text-[color:var(--client-muted)]">{row.label}</dt>
            <dd className="mt-1 break-words text-sm font-black leading-6 text-[color:var(--client-text)]">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-xl bg-[color:var(--client-bg-soft)] p-3">
        <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[color:var(--client-text)]">{detail}</p>
      </div>
      {publicationFee ? (
        <p className="mt-3 rounded-xl border border-[color:var(--client-primary)] p-3 text-sm font-black text-[color:var(--client-text)]">
          {publicationFee.amountNdp.toLocaleString()} {publicationFee.currency}
        </p>
      ) : null}
    </section>
  );
}
