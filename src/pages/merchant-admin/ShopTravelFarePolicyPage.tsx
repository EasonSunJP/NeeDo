import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { travelFareApi, type ShopTravelFarePolicyHistoryPage, type ShopTravelFarePolicySummary, type TravelFareBand } from "../../api/travelFare";
import { useAuth } from "../../auth/AuthProvider";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

type DraftBand = { maximumDistanceKm: string; fareAmountJpy: string };
const inputClassName = "h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";
const initialBand: DraftBand = { maximumDistanceKm: "5", fareAmountJpy: "0" };

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return "当前账号没有查看或发布出行费率策略的权限。";
    if (error.status === 409) return "策略版本已经变化，请重新加载后再发布。";
  }
  return "无法读取或发布正式出行费率策略，请稍后重试。";
}

function validateBands(drafts: DraftBand[]): TravelFareBand[] | string {
  if (drafts.length === 0) return "至少需要一个距离费率区间。";
  if (drafts.length > 50) return "距离费率区间最多为 50 个。";
  const bands: TravelFareBand[] = [];
  let previousLimit = 0;
  for (const [ordinal, draft] of drafts.entries()) {
    const km = Number(draft.maximumDistanceKm);
    const fare = Number(draft.fareAmountJpy);
    if (!Number.isFinite(km) || km <= 0 || !Number.isInteger(km * 1_000)) return "距离必须是大于 0、精确到米的数值。";
    const limit = km * 1_000;
    if (limit <= previousLimit) return "距离上限必须严格递增。";
    if (!Number.isSafeInteger(fare) || fare < 0) return "交通费必须是非负整数日元。";
    bands.push({ ordinal, maximumDistanceMeters: limit, fareAmountJpy: fare });
    previousLimit = limit;
  }
  return bands;
}

function PolicySummary({ label, bands, version }: { label: string; bands: TravelFareBand[]; version: number }) {
  return <section className="rounded-lg border border-line bg-paper p-4"><div className="flex items-center justify-between"><h3 className="font-black text-ink">{label}</h3><Badge tone="blue">v{version}</Badge></div><ul className="mt-3 space-y-2">{bands.map((band) => <li className="flex justify-between text-sm font-bold text-ink/70" key={band.ordinal}><span>≤ {(band.maximumDistanceMeters / 1000).toLocaleString("ja-JP")} km</span><span>¥{band.fareAmountJpy.toLocaleString("ja-JP")}</span></li>)}</ul></section>;
}

export function ShopTravelFarePolicyPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("merchant-admin:travel-fare-policy:write");
  const [summary, setSummary] = useState<ShopTravelFarePolicySummary | null>(null);
  const [history, setHistory] = useState<ShopTravelFarePolicyHistoryPage | null>(null);
  const [latestVersion, setLatestVersion] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [bands, setBands] = useState<DraftBand[]>([initialBand]);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (requestedHistoryPage = historyPage) => {
    setStatus("loading"); setError("");
    try {
      const [nextSummary, nextHistory] = await Promise.all([
        travelFareApi.getMerchantPolicy(),
        travelFareApi.listMerchantPolicyVersions({ page: requestedHistoryPage, pageSize: 20 })
      ]);
      setSummary(nextSummary);
      setHistory(nextHistory);
      if (requestedHistoryPage === 1) {
        setLatestVersion(
          nextHistory.list[0]?.version
            ?? Math.max(nextSummary.current?.version ?? 0, nextSummary.next?.version ?? 0)
        );
      }
      setStatus("ready");
    }
    catch (loadError) { setError(describeError(loadError)); setStatus("error"); }
  }, [historyPage]);
  useEffect(() => { void load(historyPage); }, [historyPage, load]);

  const parsedBands = useMemo(() => validateBands(bands), [bands]);
  const canPublish = typeof parsedBands !== "string" && Boolean(effectiveFrom && reason.trim()) && !publishing;

  const requestConfirmation = () => {
    if (!canPublish || typeof parsedBands === "string") return;
    const effectiveDate = new Date(effectiveFrom);
    if (!Number.isFinite(effectiveDate.getTime())) { setError("请输入有效的生效时间。"); return; }
    setError("");
    setConfirming(true);
  };

  const publish = async () => {
    if (!canPublish || typeof parsedBands === "string") return;
    const effectiveDate = new Date(effectiveFrom);
    if (!Number.isFinite(effectiveDate.getTime())) { setError("请输入有效的生效时间。"); return; }
    setPublishing(true); setError(""); setPublished(false);
    try {
      await travelFareApi.publishMerchantPolicy({ expectedVersion: latestVersion, effectiveFrom: effectiveDate.toISOString(), reason: reason.trim(), bands: parsedBands.map(({ maximumDistanceMeters, fareAmountJpy }) => ({ maximumDistanceMeters, fareAmountJpy })) });
      setReason(""); setConfirming(false); setHistoryPage(1); await load(1); setPublished(true);
    } catch (publishError) { setError(describeError(publishError)); }
    finally { setPublishing(false); }
  };

  return <MerchantAdminLayout><ModuleShell title="上门交通费" description="按驾驶路线距离发布不可变的店铺交通费版本。" actions={<Badge tone="blue">正式策略</Badge>}>
    {status === "loading" ? <section className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/60">正在加载当前费率策略…</section> : null}
    {status === "error" ? <section className="rounded-lg border border-red-200 bg-red-50 p-5" role="alert"><p className="text-sm font-black text-red-900">{error}</p><Button className="mt-3" onClick={() => void load()} variant="secondary">重试</Button></section> : null}
    {status === "ready" && summary ? <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">{summary.current ? <PolicySummary bands={summary.current.bands} label="当前生效策略" version={summary.current.version} /> : <section className="rounded-lg border border-line bg-paper p-4 text-sm font-bold text-ink/60">尚未发布当前策略。</section>}{summary.next ? <PolicySummary bands={summary.next.bands} label="计划生效策略" version={summary.next.version} /> : <section className="rounded-lg border border-line bg-paper p-4 text-sm font-bold text-ink/60">没有计划生效的策略。</section>}</div>
      <section className="rounded-lg border border-line bg-white p-5 shadow-panel"><div className="flex items-center justify-between"><h2 className="text-lg font-black text-ink">不可变发布历史</h2><span className="text-xs font-bold text-ink/50">共 {history?.total ?? 0} 个版本</span></div>{history?.list.length ? <ol className="mt-3 divide-y divide-line">{history.list.map((version) => <li className="grid gap-1 py-3 text-sm sm:grid-cols-[5rem_1fr_1fr]" key={version.publicId}><strong>v{version.version}</strong><span>{new Date(version.effectiveFrom).toLocaleString("ja-JP")}</span><span className="text-ink/60">{version.reason} · 发布人 #{version.publishedByUserId}</span></li>)}</ol> : <p className="mt-3 text-sm font-bold text-ink/55">尚无已发布版本。</p>}<div className="mt-4 flex items-center justify-between"><span className="text-xs font-bold text-ink/55">第 {history?.page ?? historyPage} / {Math.max(1, Math.ceil((history?.total ?? 0) / (history?.page_size ?? 20)))} 页</span><div className="flex gap-2"><Button disabled={historyPage <= 1} onClick={() => setHistoryPage((value) => Math.max(1, value - 1))} size="sm" variant="secondary">上一页历史</Button><Button disabled={!history || historyPage * history.page_size >= history.total} onClick={() => setHistoryPage((value) => value + 1)} size="sm" variant="secondary">下一页历史</Button></div></div></section>
      {!canWrite ? <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900">当前账号只有查看权限，不能发布新的交通费策略。</section> : <section className="rounded-lg border border-line bg-white p-5 shadow-panel"><h2 className="text-lg font-black text-ink">发布新版本</h2><p className="mt-1 text-sm font-bold text-ink/55">已发布版本不会被修改；新版本按生效时间接替。</p>
        <div className="mt-4 space-y-3">{bands.map((band, index) => <div className="grid gap-2 rounded-lg border border-line bg-paper p-3 sm:grid-cols-[1fr_1fr_auto]" key={index}><label className="text-xs font-black text-ink/65">距离上限（km）<input aria-label={`距离上限 ${index + 1}`} className={inputClassName} min="0.001" onChange={(event) => setBands((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maximumDistanceKm: event.target.value } : item))} step="0.001" type="number" value={band.maximumDistanceKm} /></label><label className="text-xs font-black text-ink/65">交通费（JPY）<input aria-label={`交通费 ${index + 1}`} className={inputClassName} min="0" onChange={(event) => setBands((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fareAmountJpy: event.target.value } : item))} step="1" type="number" value={band.fareAmountJpy} /></label><Button disabled={bands.length === 1} onClick={() => setBands((current) => current.filter((_, itemIndex) => itemIndex !== index))} size="sm" variant="ghost">移除</Button></div>)}</div>
        <Button className="mt-3" disabled={bands.length >= 50} onClick={() => { setConfirming(false); setBands((current) => [...current, { maximumDistanceKm: "", fareAmountJpy: "" }]); }} size="sm" variant="secondary">添加距离区间</Button>
        {typeof parsedBands === "string" ? <p className="mt-3 text-sm font-bold text-red-600">{parsedBands}</p> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-ink/65">生效时间<input aria-label="生效时间" className={inputClassName} onChange={(event) => setEffectiveFrom(event.target.value)} type="datetime-local" value={effectiveFrom} /></label><label className="text-xs font-black text-ink/65">发布理由<input aria-label="发布理由" className={inputClassName} maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} /></label></div>
        {confirming && typeof parsedBands !== "string" ? <section className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4" aria-label="确认发布内容"><h3 className="font-black text-amber-950">确认发布内容</h3><p className="mt-2 text-sm font-bold text-amber-900">生效时间：{new Date(effectiveFrom).toLocaleString("ja-JP")}</p><p className="text-sm font-bold text-amber-900">理由：{reason.trim()}</p><ul className="mt-2 space-y-1">{parsedBands.map((band) => <li className="text-sm font-bold text-amber-900" key={band.ordinal}>≤ {(band.maximumDistanceMeters / 1000).toLocaleString("ja-JP")} km：¥{band.fareAmountJpy.toLocaleString("ja-JP")}</li>)}</ul><div className="mt-3 flex gap-2"><Button disabled={publishing} onClick={() => void publish()}>{publishing ? "正在发布…" : "确认发布"}</Button><Button disabled={publishing} onClick={() => setConfirming(false)} variant="secondary">取消</Button></div></section> : null}
        {error ? <p className="mt-3 text-sm font-bold text-red-600" role="alert">{error}</p> : null}{published ? <p className="mt-3 text-sm font-bold text-green-700">新费率版本已发布。</p> : null}<Button className="mt-4" disabled={!canPublish || confirming} onClick={requestConfirmation}>发布不可变版本</Button>
      </section>}
    </div> : null}
  </ModuleShell></MerchantAdminLayout>;
}
