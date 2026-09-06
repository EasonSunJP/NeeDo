import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { TechnicianRankingModule, type TechnicianRankingSelection } from "../../components/admin/TechnicianRankingModule";
import { TechnicianListModule } from "../../components/admin/TechnicianListModule";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateText } from "../../i18n/translations";
import type { Technician } from "../../types/domain";
import {
  createFormalDetailRequestCoordinator,
  hasFormalDetailRefreshFailure,
  runFormalDetailMutationSequence
} from "./formalDetailRequest";
import { readPositiveIntegerSearchParam } from "./adminSearchParams";

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

export function TechniciansPage({ embeddedDetail }: {
  embeddedDetail?: { id: number; onClose: () => void };
} = {}) {
  const { language } = useOptionalI18n();
  const translate = useCallback((text: string) => translateText(text, language), [language]);
  const [searchParams, setSearchParams] = useSearchParams();
  const detailTechnicianId = embeddedDetail?.id ?? readPositiveIntegerSearchParam(searchParams, "detailTechnicianId");
  const isReviewMode = searchParams.get("module") === "review";
  const isRankingMode = searchParams.get("module") === "ranking";
  const languageRef = useRef(language);
  languageRef.current = language;
  const [technicians, setTechnicians] = useState<BackofficeTechnicianPayload[]>([]);
  const [shops, setShops] = useState<BackofficeShopPayload[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<number | null>(null);
  const [selectedRanking, setSelectedRanking] = useState<TechnicianRankingSelection | null>(null);
  const [technicianDetail, setTechnicianDetail] = useState<BackofficeTechnicianDetailPayload | null>(null);
  const [technicianDetailLoading, setTechnicianDetailLoading] = useState(false);
  const [technicianDetailError, setTechnicianDetailError] = useState("");
  const [draft, setDraft] = useState({ displayName: "", city: "", serviceArea: "", shopId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rankingRefreshKey, setRankingRefreshKey] = useState(0);

  const load = useCallback(async (rejectOnError = false) => {
    setLoading(true);
    setError("");
    try {
      if (isRankingMode || embeddedDetail) {
        const shopPage = await backofficeRealDataApi.shops("backoffice", {
          page: 1,
          pageSize: 100
        });
        setTechnicians([]);
        setShops(shopPage.list);
        return;
      }
      const [technicianPage, shopPage] = await Promise.all([
        backofficeRealDataApi.technicians("backoffice", {
          page: 1,
          pageSize: 100,
          status: isReviewMode ? "pending_review" : undefined
        }),
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
  }, [isRankingMode, isReviewMode, embeddedDetail?.id]);

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

  useEffect(() => {
    if (detailTechnicianId === null) return;
    setSelectedTechnicianId(detailTechnicianId);
    setSelectedRanking(null);
    setDraft({ displayName: "", city: "", serviceArea: "", shopId: "" });
    void technicianDetailRequest.load(detailTechnicianId);
  }, [detailTechnicianId, technicianDetailRequest]);

  const closeTechnician = useCallback(() => {
    technicianDetailRequest.invalidate();
    setSelectedTechnicianId(null);
    setSelectedRanking(null);
    setTechnicianDetail(null);
    setTechnicianDetailLoading(false);
    setTechnicianDetailError("");
    if (embeddedDetail) { embeddedDetail.onClose(); return; }
    const params = new URLSearchParams(searchParams);
    params.delete("detailTechnicianId");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, technicianDetailRequest, embeddedDetail]);

  useEffect(() => { void load(); }, [load]);

  const mappedTechnicians = useMemo(() => technicians.map(mapBackofficeTechnician), [technicians]);
  const reviewTechnicians = useMemo(() => technicians.filter((item) => item.status === "pending_review"), [technicians]);
  const mappedShops = useMemo(() => shops.map(mapBackofficeStore), [shops]);

  const openTechnician = (technician: Technician) => {
    const id = Number(technician.id.replace("tech-", ""));
    const record = technicians.find((item) => item.id === id);
    if (!record) return;
    setSelectedTechnicianId(record.id);
    setDraft({ displayName: "", city: "", serviceArea: "", shopId: "" });
    void technicianDetailRequest.load(record.id);
  };

  const openRankingTechnician = (selection: TechnicianRankingSelection) => {
    setSelectedRanking(selection);
    setSelectedTechnicianId(selection.row.technicianProfileId);
    setDraft({ displayName: "", city: "", serviceArea: "", shopId: "" });
    void technicianDetailRequest.load(selection.row.technicianProfileId);
  };

  const selectedRankingAverageOrderValue = selectedRanking && selectedRanking.row.completedOrderCount > 0
    ? selectedRanking.row.completedServiceAmountJpy / selectedRanking.row.completedOrderCount
    : 0;
  const rankingCurrencyFormatter = useMemo(
    () => new Intl.NumberFormat(languageLocales[language], { currency: "JPY", maximumFractionDigits: 0, style: "currency" }),
    [language]
  );
  const rankingNumberFormatter = useMemo(() => new Intl.NumberFormat(languageLocales[language]), [language]);

  const mutate = async (technicianId: number, action: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      const result = await runFormalDetailMutationSequence({
        isDetailCurrent: () => technicianDetailRequest.getSelectedId() === technicianId,
        mutate: action,
        refreshDetail: () => technicianDetailRequest.loadOrThrow(technicianId),
        refreshList: async () => {
          await load(true);
          if (isRankingMode) setRankingRefreshKey((value) => value + 1);
        }
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
      if (isRankingMode) setRankingRefreshKey((value) => value + 1);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setSaving(false);
    }
  };

  const detailDrawer = (
      <Drawer open={selectedTechnicianId !== null} title={translate("技师集中详情")} onClose={closeTechnician}>
        {embeddedDetail && error ? <p role="alert" className="text-sm font-bold text-coral">{error}</p> : null}
        {selectedRanking ? (
          <section className="mb-4 rounded-xl border border-line bg-paper p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">{translate("榜单期间")}</p>
            <p className="mt-1 text-sm font-bold text-ink/55">{selectedRanking.period.from && selectedRanking.period.to ? `${selectedRanking.period.from} — ${selectedRanking.period.to}` : translate("历史累计")} · Asia/Tokyo</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[["名次", `#${selectedRanking.row.rank}`], ["服务金额", rankingCurrencyFormatter.format(selectedRanking.row.completedServiceAmountJpy)], ["完成订单", rankingNumberFormatter.format(selectedRanking.row.completedOrderCount)], ["工作天数", rankingNumberFormatter.format(selectedRanking.row.workingDayCount)], ["平均客单价", rankingCurrencyFormatter.format(selectedRankingAverageOrderValue)]].map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-xs font-black text-ink/45">{translate(label)}</dt><dd className="mt-1 truncate text-sm font-black text-ink">{value}</dd></div>)}
            </dl>
          </section>
        ) : null}
        {technicianDetailLoading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">{translateText("正在读取技师正式详情...", language)}</p> : null}
        {!technicianDetailLoading && technicianDetailError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{technicianDetailError}</span>
            <Button onClick={() => void technicianDetailRequest.retry()} size="sm" variant="secondary">{translateText("重试", language)}</Button>
          </div>
        ) : null}
        {!technicianDetailLoading && !technicianDetailError && technicianDetail ? (
          <>
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
          </>
        ) : null}
      </Drawer>
  );
  if (embeddedDetail) return detailDrawer;

  return (
    <AdminLayout>
      <ModuleShell
        actions={isReviewMode || isRankingMode ? <></> : undefined}
        title={isRankingMode ? translate("技师榜单") : isReviewMode ? "技师资料审核" : "技师管理"}
        description={isRankingMode
          ? translate("按已完成订单核算技师业绩；服务金额包含已记账的加钟金额，同一订单只计一单，至少完成一单计为一个工作日。")
          : isReviewMode
            ? "审核用户端提交的技师申请；这里只显示正式数据库中待审核的技师资料。"
            : "只展示数据库中的真实技师账号；待审核、店铺归属、资料更新和软删除均写入正式 API。"}
      >
        {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        {loading && !isRankingMode ? <p className="text-sm font-bold text-ink/50">正在读取正式技师数据...</p> : null}
        {isRankingMode ? (
          <TechnicianRankingModule
            onSelectTechnician={openRankingTechnician}
            refreshKey={rankingRefreshKey}
            shops={shops}
          />
        ) : isReviewMode ? (
          !loading && !error && reviewTechnicians.length === 0 ? (
            <section className="rounded-lg border border-dashed border-line bg-white px-5 py-12 text-center shadow-panel">
              <p className="text-base font-black text-ink">暂无待审核的技师申请</p>
              <p className="mt-2 text-sm font-bold text-ink/50">用户端提交的新申请会进入这里。</p>
            </section>
          ) : reviewTechnicians.length > 0 ? (
            <DataTable<BackofficeTechnicianPayload>
              columns={[
                { key: "applicant", title: "申请人", render: (row) => <button className="font-black text-moss hover:underline" onClick={() => openTechnician(mapBackofficeTechnician(row))} type="button">{row.displayName}</button> },
                { key: "email", title: "邮箱", render: (row) => row.email },
                { key: "city", title: "城市", render: (row) => row.city },
                { key: "type", title: "申请类型", render: (row) => row.shopId ? row.shopName ?? "店铺所属技师" : "个人技师" },
                { key: "submittedAt", title: "创建时间", render: (row) => row.createdAt },
                { key: "status", title: "状态", render: () => <Badge tone="yellow">待审核</Badge> }
              ]}
              onView={(row) => openTechnician(mapBackofficeTechnician(row))}
              pageSize={10}
              rows={reviewTechnicians}
              showFooterActions={false}
            />
          ) : null
        ) : (
          <>
            <section className="mb-4 grid gap-3 md:grid-cols-3">
              {[{ label: "全部技师", value: technicians.length }, { label: "待审核", value: technicians.filter((item) => item.status === "pending_review").length }, { label: "已发布", value: technicians.filter((item) => item.status === "published").length }].map((metric) => <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={metric.label}><p className="text-sm font-bold text-ink/50">{metric.label}</p><strong className="mt-2 block text-3xl font-black">{metric.value}</strong></article>)}
            </section>
            <TechnicianListModule context="platform" onSelectTechnician={openTechnician} stores={mappedShops} technicians={mappedTechnicians} />
          </>
        )}
      </ModuleShell>

      {detailDrawer}
    </AdminLayout>
  );
}
