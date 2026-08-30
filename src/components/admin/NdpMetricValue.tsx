export function NdpMetricValue({ ndp, testNdp }: { ndp: number; testNdp: number }) {
  return (
    <div>
      <strong className="mt-2 block text-xl">{ndp.toLocaleString("ja-JP")} NDP</strong>
      <span className="mt-1 block text-xs font-bold text-ink/45">
        + {testNdp.toLocaleString("ja-JP")} Test NDP
      </span>
    </div>
  );
}

