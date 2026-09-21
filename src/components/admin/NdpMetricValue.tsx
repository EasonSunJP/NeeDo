export function NdpMetricValue({ ndp, testNdp, showTestNdp = true }: { ndp: number; testNdp: number; showTestNdp?: boolean }) {
  return (
    <div>
      <strong className="mt-2 block text-xl">{ndp.toLocaleString("ja-JP")} NDP</strong>
      {showTestNdp ? <span className="mt-1 block text-xs font-bold text-ink/45">
        + {testNdp.toLocaleString("ja-JP")} Test NDP
      </span> : null}
    </div>
  );
}
