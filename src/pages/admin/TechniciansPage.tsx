import { useCallback, useEffect, useMemo, useState } from "react";
import {
  backofficeRealDataApi,
  mapBackofficeStore,
  mapBackofficeTechnician,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { TechnicianListModule } from "../../components/admin/TechnicianListModule";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import type { Technician } from "../../types/domain";

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

export function TechniciansPage() {
  const [technicians, setTechnicians] = useState<BackofficeTechnicianPayload[]>([]);
  const [shops, setShops] = useState<BackofficeShopPayload[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ displayName: "", city: "", serviceArea: "", shopId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [technicianPage, shopPage] = await Promise.all([
        backofficeRealDataApi.technicians("backoffice", { page: 1, pageSize: 100 }),
        backofficeRealDataApi.shops("backoffice", { page: 1, pageSize: 100 })
      ]);
      setTechnicians(technicianPage.list);
      setShops(shopPage.list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedRecord = technicians.find((technician) => technician.id === selectedId) ?? null;
  const mappedTechnicians = useMemo(() => technicians.map(mapBackofficeTechnician), [technicians]);
  const mappedShops = useMemo(() => shops.map(mapBackofficeStore), [shops]);

  const openTechnician = (technician: Technician) => {
    const id = Number(technician.id.replace("tech-", ""));
    const record = technicians.find((item) => item.id === id);
    if (!record) return;
    setSelectedId(record.id);
    setDraft({ displayName: record.displayName, city: record.city, serviceArea: record.serviceArea ?? "", shopId: record.shopId ? String(record.shopId) : "" });
  };

  const mutate = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await action();
      await load();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <ModuleShell title="技师管理" description="只展示数据库中的真实技师账号；待审核、店铺归属、资料更新和软删除均写入正式 API。">
        {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        {loading ? <p className="text-sm font-bold text-ink/50">正在读取正式技师数据...</p> : null}
        <section className="mb-4 grid gap-3 md:grid-cols-3">
          {[{ label: "全部技师", value: technicians.length }, { label: "待审核", value: technicians.filter((item) => item.status === "pending_review").length }, { label: "已发布", value: technicians.filter((item) => item.status === "published").length }].map((metric) => <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={metric.label}><p className="text-sm font-bold text-ink/50">{metric.label}</p><strong className="mt-2 block text-3xl font-black">{metric.value}</strong></article>)}
        </section>
        <TechnicianListModule context="platform" onSelectTechnician={openTechnician} stores={mappedShops} technicians={mappedTechnicians} />
      </ModuleShell>

      <Drawer open={Boolean(selectedRecord)} title="技师集中详情" onClose={() => setSelectedId(null)}>
        {selectedRecord ? <div className="space-y-5">
          <DetailGrid items={[{ label: "技师 ID", value: selectedRecord.id }, { label: "登录邮箱", value: selectedRecord.email }, { label: "状态", value: selectedRecord.status }, { label: "所属店铺", value: selectedRecord.shopName ?? "未分配" }, { label: "审核时间", value: selectedRecord.verifiedAt ?? "未审核" }, { label: "创建时间", value: selectedRecord.createdAt }]} />
          {(["displayName", "city", "serviceArea"] as const).map((field) => <label className="block" key={field}><span className="mb-2 block text-sm font-black">{field}</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} value={draft[field]} /></label>)}
          <label className="block"><span className="mb-2 block text-sm font-black">所属店铺</span><select className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, shopId: event.target.value }))} value={draft.shopId}><option value="">未分配</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => void mutate(() => backofficeRealDataApi.updateTechnician("backoffice", selectedRecord.id, { displayName: draft.displayName, city: draft.city, serviceArea: draft.serviceArea || null, shopId: draft.shopId ? Number(draft.shopId) : null }))}>保存资料</Button>
            {selectedRecord.status !== "published" ? <Button disabled={saving || !draft.shopId} onClick={() => void mutate(() => backofficeRealDataApi.approveTechnician("backoffice", selectedRecord.id, { ...(draft.shopId ? { shopId: Number(draft.shopId) } : {}) }))} variant="secondary">审核通过</Button> : <Badge tone="green">已审核</Badge>}
            <Button disabled={saving} onClick={() => void mutate(async () => { await backofficeRealDataApi.deleteTechnician("backoffice", selectedRecord.id); setSelectedId(null); })} variant="danger">软删除</Button>
          </div>
        </div> : null}
      </Drawer>
    </AdminLayout>
  );
}
