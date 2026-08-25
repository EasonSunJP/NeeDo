import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  backofficeRealDataApi,
  mapBackofficeStore,
  mapBackofficeTechnician,
  type BackofficeShopPayload,
  type BackofficeTechnicianDetailPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { FormalTechnicianDetailPanel } from "../../components/admin/FormalProfileDetailPanels";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { TechnicianListModule } from "../../components/admin/TechnicianListModule";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import type { Technician } from "../../types/domain";
import {
  createFormalDetailRequestCoordinator,
  hasFormalDetailRefreshFailure,
  runFormalDetailMutationSequence
} from "./formalDetailRequest";

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

export function TechniciansPage() {
  const { language } = useOptionalI18n();
  const languageRef = useRef(language);
  languageRef.current = language;
  const [technicians, setTechnicians] = useState<BackofficeTechnicianPayload[]>([]);
  const [shops, setShops] = useState<BackofficeShopPayload[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<number | null>(null);
  const [technicianDetail, setTechnicianDetail] = useState<BackofficeTechnicianDetailPayload | null>(null);
  const [technicianDetailLoading, setTechnicianDetailLoading] = useState(false);
  const [technicianDetailError, setTechnicianDetailError] = useState("");
  const [draft, setDraft] = useState({ displayName: "", city: "", serviceArea: "", shopId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (rejectOnError = false) => {
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
      if (rejectOnError) throw loadError;
    } finally {
      setLoading(false);
    }
  }, []);

  const technicianDetailRequest = useMemo(() => createFormalDetailRequestCoordinator<BackofficeTechnicianDetailPayload>({
    onError: (detailError) => {
      const message = detailError instanceof Error ? detailError.message : typeof detailError === "string" ? detailError : "";
      setTechnicianDetailError(message.trim() || translateText("技师正式详情读取失败", languageRef.current));
    },
    onFinally: () => setTechnicianDetailLoading(false),
    onStart: () => {
      setTechnicianDetail(null);
      setTechnicianDetailLoading(true);
      setTechnicianDetailError("");
    },
    onSuccess: (detail) => {
      setTechnicianDetail(detail);
      setDraft({
        displayName: detail.displayName,
        city: detail.city,
        serviceArea: detail.serviceArea ?? "",
        shopId: detail.shopId ? String(detail.shopId) : ""
      });
    },
    request: (technicianId) => backofficeRealDataApi.technician("backoffice", technicianId)
  }), []);

  useEffect(() => {
    technicianDetailRequest.activate();
    return () => technicianDetailRequest.dispose();
  }, [technicianDetailRequest]);

  const closeTechnician = useCallback(() => {
    technicianDetailRequest.invalidate();
    setSelectedTechnicianId(null);
    setTechnicianDetail(null);
    setTechnicianDetailLoading(false);
    setTechnicianDetailError("");
  }, [technicianDetailRequest]);

  useEffect(() => { void load(); }, [load]);

  const mappedTechnicians = useMemo(() => technicians.map(mapBackofficeTechnician), [technicians]);
  const mappedShops = useMemo(() => shops.map(mapBackofficeStore), [shops]);

  const openTechnician = (technician: Technician) => {
    const id = Number(technician.id.replace("tech-", ""));
    const record = technicians.find((item) => item.id === id);
    if (!record) return;
    setSelectedTechnicianId(record.id);
    setDraft({ displayName: "", city: "", serviceArea: "", shopId: "" });
    void technicianDetailRequest.load(record.id);
  };

  const mutate = async (technicianId: number, action: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      const result = await runFormalDetailMutationSequence({
        isDetailCurrent: () => technicianDetailRequest.getSelectedId() === technicianId,
        mutate: action,
        refreshDetail: () => technicianDetailRequest.loadOrThrow(technicianId),
        refreshList: () => load(true)
      });
      if (hasFormalDetailRefreshFailure(result)) {
        setError(translateText("资料已保存，但刷新失败，请重试", language));
      }
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setSaving(false);
    }
  };

  const deleteTechnician = async (technicianId: number) => {
    setSaving(true);
    setError("");
    try {
      await backofficeRealDataApi.deleteTechnician("backoffice", technicianId);
      if (technicianDetailRequest.getSelectedId() === technicianId) {
        closeTechnician();
      }
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

      <Drawer open={selectedTechnicianId !== null} title="技师集中详情" onClose={closeTechnician}>
        {technicianDetailLoading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">{translateText("正在读取技师正式详情...", language)}</p> : null}
        {!technicianDetailLoading && technicianDetailError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{technicianDetailError}</span>
            <Button onClick={() => void technicianDetailRequest.retry()} size="sm" variant="secondary">{translateText("重试", language)}</Button>
          </div>
        ) : null}
        {!technicianDetailLoading && !technicianDetailError && technicianDetail ? (
          <FormalTechnicianDetailPanel
            actionContent={<>
              {technicianDetail.status !== "published" ? <Button disabled={saving || !draft.shopId} onClick={() => void mutate(technicianDetail.id, () => backofficeRealDataApi.approveTechnician("backoffice", technicianDetail.id, { ...(draft.shopId ? { shopId: Number(draft.shopId) } : {}) }))} variant="secondary">审核通过</Button> : <Badge tone="green">已审核</Badge>}
              <Button disabled={saving} onClick={() => void deleteTechnician(technicianDetail.id)} variant="danger">软删除</Button>
            </>}
            detail={technicianDetail}
            editContent={<div className="space-y-4">
              {(["displayName", "city", "serviceArea"] as const).map((field) => <label className="block" key={field}><span className="mb-2 block text-sm font-black">{field}</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} value={draft[field]} /></label>)}
              <label className="block"><span className="mb-2 block text-sm font-black">所属店铺</span><select className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, shopId: event.target.value }))} value={draft.shopId}><option value="">未分配</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
              <Button disabled={saving} onClick={() => void mutate(technicianDetail.id, () => backofficeRealDataApi.updateTechnician("backoffice", technicianDetail.id, { displayName: draft.displayName, city: draft.city, serviceArea: draft.serviceArea || null, shopId: draft.shopId ? Number(draft.shopId) : null }))}>保存资料</Button>
            </div>}
          />
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
