import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiClientError } from "../../api/httpClient";
import { travelFareApi, type OperationsTravelFarePolicyPage, type TravelRouteProviderStatus } from "../../api/travelFare";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const pageSize = 20;

function formatDistance(meters: number) {
  return meters < 1_000 ? `${meters} m` : `${(meters / 1_000).toFixed(meters % 1_000 === 0 ? 0 : 1)} km`;
}

function formatPolicy(policy: OperationsTravelFarePolicyPage["list"][number]["current"]) {
  if (!policy) return "未发布";
  return `v${policy.version} · ${policy.bands.map((band) => `${formatDistance(band.maximumDistanceMeters)} ¥${band.fareAmountJpy.toLocaleString("ja-JP")}`).join(" / ")}`;
}

function requestError(error: unknown) {
  if (error instanceof ApiClientError && !error.message.startsWith("error.")) return error.message;
  return "无法读取正式出行配置，请稍后重试。";
}

export function TravelSettingsPage() {
  const [provider, setProvider] = useState<TravelRouteProviderStatus | null>(null);
  const [policies, setPolicies] = useState<OperationsTravelFarePolicyPage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [city, setCity] = useState("");
  const [shopKeyword, setShopKeyword] = useState("");
  const [filters, setFilters] = useState({ city: "", shopKeyword: "" });

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [providerStatus, policyPage] = await Promise.all([
        travelFareApi.getProviderStatus(),
        travelFareApi.listPolicies({ page, pageSize, ...filters })
      ]);
      setProvider(providerStatus);
      setPolicies(policyPage);
      setStatus("ready");
    } catch (requestFailure) {
      setError(requestError(requestFailure));
      setStatus("error");
    }
  }, [filters, page]);

  useEffect(() => { void load(); }, [load]);

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters({ city: city.trim(), shopKeyword: shopKeyword.trim() });
  };

  const totalPages = policies ? Math.max(1, Math.ceil(policies.total / policies.page_size)) : 1;
  const providerHealthy = provider?.status === "healthy" || provider?.status === "configured";

  return (
    <AdminLayout>
      <ModuleShell
        title="出行设置"
        description="查看路线供应商就绪状态，以及各店铺当前和计划生效的正式出行费率。"
        actions={provider ? <Badge tone={!provider.configured ? "yellow" : providerHealthy ? "green" : "red"}>{!provider.configured ? "Geoapify 尚未配置" : provider.status === "healthy" ? "Geoapify 正常" : provider.status === "rate_limited" ? "Geoapify 已限流" : provider.status === "unavailable" ? "Geoapify 不可用" : "Geoapify 已配置，尚未探测"}</Badge> : null}
      >
        {status === "loading" ? <section className="rounded-lg border border-line bg-white p-8 text-sm font-bold text-ink/60">正在加载路线供应商与费率策略…</section> : null}
        {status === "error" ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h2 className="font-black text-red-900">供应商或策略读取失败</h2>
            <p className="mt-2 text-sm font-bold text-red-800">{error}</p>
            <Button className="mt-4" onClick={() => void load()} variant="secondary">重试</Button>
          </section>
        ) : null}
        {status === "ready" && provider && policies ? (
          <div className="space-y-5">
            <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><h2 className="text-lg font-black text-ink">路线供应商</h2><p className="mt-1 text-sm font-bold text-ink/60">驾驶路线 · 估价有效 {provider.estimateTtlSeconds} 秒 · 路线缓存 {provider.cacheTtlSeconds} 秒</p></div>
                <Badge tone={provider.configured ? "green" : "yellow"}>{provider.providerCode}</Badge>
              </div>
              {!provider.configured ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">Geoapify 尚未配置，当前无法创建新路线估价。系统不会使用静态距离、模拟路线或伪造价格兜底。</p> : null}
              {provider.configured && !providerHealthy ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900">最近一次正式路线请求状态：{provider.status === "rate_limited" ? "供应商限流" : "供应商不可用"}。{provider.checkedAt ? `检测时间 ${new Date(provider.checkedAt).toLocaleString("ja-JP")}` : ""}</p> : null}
            </section>
            <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
              <form className="flex flex-wrap items-end gap-3" onSubmit={submitFilters}>
                <label className="text-xs font-black text-ink/70">城市<input className="mt-1 block h-10 rounded-lg border border-line px-3 text-sm" onChange={(event) => setCity(event.target.value)} value={city} /></label>
                <label className="text-xs font-black text-ink/70">店铺<input className="mt-1 block h-10 rounded-lg border border-line px-3 text-sm" onChange={(event) => setShopKeyword(event.target.value)} value={shopKeyword} /></label>
                <Button type="submit" variant="secondary">筛选</Button>
              </form>
              {policies.list.length === 0 ? <p className="mt-6 rounded-lg bg-paper p-6 text-center text-sm font-bold text-ink/60">没有符合条件的店铺费率策略。</p> : (
                <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-line text-xs text-ink/50"><th className="px-3 py-3">店铺</th><th className="px-3 py-3">城市</th><th className="px-3 py-3">当前策略</th><th className="px-3 py-3">计划策略</th></tr></thead><tbody>{policies.list.map((item) => <tr className="border-b border-line/70" key={item.shopId}><td className="px-3 py-4 font-black text-ink">{item.shopName}<span className="mt-1 block text-xs font-bold text-ink/45">{item.shopPublicId ?? `#${item.shopId}`}</span></td><td className="px-3 py-4 font-bold text-ink/70">{item.city}</td><td className="px-3 py-4 font-bold text-ink/70">{formatPolicy(item.current)}</td><td className="px-3 py-4 font-bold text-ink/70">{formatPolicy(item.next)}</td></tr>)}</tbody></table></div>
              )}
              <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs font-bold text-ink/55">第 {policies.page} / {totalPages} 页，共 {policies.total} 家店铺</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="sm" variant="secondary">上一页</Button><Button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} size="sm" variant="secondary">下一页</Button></div></div>
            </section>
          </div>
        ) : null}
      </ModuleShell>
    </AdminLayout>
  );
}
