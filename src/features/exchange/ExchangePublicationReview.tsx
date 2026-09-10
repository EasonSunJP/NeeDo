export function ExchangePublicationReview({
  typeLabel,
  rows,
  detail,
  publicationFee
}: {
  typeLabel: string;
  rows: Array<{ label: string; value: string }>;
  detail: string;
  publicationFee?: {
    amountNdp: number;
    currency: "NDP" | "TEST_NDP";
    label: string;
    notice: string;
  };
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
        <div className="mt-3 rounded-xl border border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] p-3 text-[color:var(--client-text)]">
          <p className="text-xs font-black text-[color:var(--client-muted)]">{publicationFee.label}</p>
          <p className="mt-1 text-lg font-black">
            {publicationFee.amountNdp.toLocaleString()} {publicationFee.currency === "TEST_NDP" ? "Test NDP" : "NDP"}
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">{publicationFee.notice}</p>
        </div>
      ) : null}
    </section>
  );
}
