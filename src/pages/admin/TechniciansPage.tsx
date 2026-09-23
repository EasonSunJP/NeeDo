import { subscribeWorkStatusRefresh } from "../../features/technician-work-status/refresh";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  mapBackofficeStore,
  mapBackofficeTechnician,
  type BackofficeShopPayload,
  type BackofficeTechnicianDetailPayload,
  type BackofficeTechnicianPayload,
  type BackofficeTechnicianSummaryPayload
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
  const searchKeyword = (searchParams.get("keyword") ?? "").trim().slice(0, 100);
  const detailTechnicianId = embeddedDetail?.id ?? readPositiveIntegerSearchParam(searchParams, "detailTechnicianId");
  const isReviewMode = searchParams.get("module") === "review";
  const isRankingMode = searchParams.get("module") === "ranking";
  const languageRef = useRef(language);
  languageRef.current = language;
  const [technicians, setTechnicians] = useState<BackofficeTechnicianPayload[]>([]);
  const [summary, setSummary] = useState<BackofficeTechnicianSummaryPayload | null>(null);
  const [listTotal, setListTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUserNeedoId, setInviteUserNeedoId] = useState("");
  const [inviteShopId, setInviteShopId] = useState("");
  const [inviteShopSearch, setInviteShopSearch] = useState("");
  const [inviteShops, setInviteShops] = useState<BackofficeShopPayload[]>([]);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const listRequest = useRef(0);
  const load = useCallback(async (rejectOnError = false) => {
    const requestId = ++listRequest.current;
    setLoading(true);
    setError("");
    try {
      if (isRankingMode || embeddedDetail) {
        const shopPage = await backofficeRealDataApi.shops("backoffice", {
          page: 1,
          pageSize: 100
        });
        if (requestId !== listRequest.current) return;
        setTechnicians([]);
        setListTotal(0);
        setShops(shopPage.list);
        return;
      }
      const [technicianPage, shopPage, technicianSummary] = await Promise.all([
        backofficeRealDataApi.technicians("backoffice", {
          keyword: searchKeyword || undefined,
          page,
          pageSize: 10,
          shopId: selectedShopId ?? undefined,
          status: isReviewMode ? "pending_review" : undefined
        }),
        backofficeRealDataApi.shops("backoffice", { page: 1, pageSize: 100 }),
        isReviewMode ? Promise.resolve(null) : backofficeRealDataApi.technicianSummary()
      ]);
      if (requestId !== listRequest.current) return;
      setTechnicians(technicianPage.list);
      setListTotal(technicianPage.total);
      if (technicianSummary) setSummary(technicianSummary);
      setShops(shopPage.list);
    } catch (loadError) {
      if (requestId === listRequest.current) setError(loadError instanceof Error ? loadError.message : String(loadError));
      if (rejectOnError) throw loadError;
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }, [isRankingMode, isReviewMode, embeddedDetail?.id, page, searchKeyword, selectedShopId]);

  useEffect(() => { setPage(1); }, [isReviewMode, searchKeyword, selectedShopId]);

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

  useEffect(() => { void load(); const unsubscribe = subscribeWorkStatusRefresh(() => void load()); return () => { ++listRequest.current; unsubscribe(); }; }, [load]);

  const mappedTechnicians = useMemo(() => technicians.map(mapBackofficeTechnician), [technicians]);
  const openInvite = () => {
    setInviteUserNeedoId("");
    setInviteShopId("");
    setInviteShopSearch("");
    setInviteShops(shops);
    setInviteError("");
    setInviteSuccess(false);
    setInviteOpen(true);
  };
  const searchInviteShops = async () => {
    setInviteBusy(true);
    setInviteError("");
    try {
      const result = await backofficeRealDataApi.shops("backoffice", { page: 1, pageSize: 100, keyword: inviteShopSearch.trim() || undefined });
      setInviteShops(result.list);
      setInviteShopId("");
    } catch (searchError) {
      setInviteError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setInviteBusy(false);
    }
  };
  const submitInvite = async () => {
    if (!inviteUserNeedoId.trim() || !inviteShopId) return;
    setInviteBusy(true);
    setInviteError("");
    try {
      await backofficeRealDataApi.inviteTechnicianApplicant({ userNeedoId: inviteUserNeedoId.trim(), targetShopId: Number(inviteShopId) });
      setInviteSuccess(true);
    } catch (inviteFailure) {
      const message = inviteFailure instanceof Error ? inviteFailure.message : String(inviteFailure);
      const knownErrors: Record<string, string> = {
        "error.user.not_found": "未找到该 NeeDoID 对应的有效用户",
        "error.identity_application.conflict": "该用户已有进行中的技师申请",
        "error.identity_application.identity_already_active": "该用户已开通技师身份",
        "error.identity_application.target_shop_not_found": "目标店铺不可申请，请重新选择"
      };
      setInviteError(translate(knownErrors[message] ?? message));
    } finally {
      setInviteBusy(false);
    }
  };
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
              <label className="block"><span className="mb-2 block text-sm font-black">{translate("主展示店铺（不建立合作关系）")}</span><select className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, shopId: event.target.value }))} value={draft.shopId}><option value="">{translate("未分配")}</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select><small className="mt-2 block text-xs font-bold text-ink/50">{translate("正式合作绑定需由目标店铺在技师申请审核中批准；此处只能选择已有的有效合作店铺作为主展示店铺。")}</small></label>
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
        actions={isReviewMode || isRankingMode ? <></> : <Button onClick={openInvite}>{translate("新建技师")}</Button>}
        title={isRankingMode ? translate("技师榜单") : isReviewMode ? "技师资料审核" : "技师管理"}
        description={isRankingMode
          ? translate("按已完成订单核算技师业绩；服务金额包含已记账的加钟金额，同一订单只计一单，至少完成一单计为一个工作日。")
          : isReviewMode
            ? "这里只显示已开通技师身份、资料状态为待审核的档案；身份开通申请由目标店铺审核。"
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
              <p className="text-base font-black text-ink">暂无待审核的技师资料</p>
              <p className="mt-2 text-sm font-bold text-ink/50">技师身份申请由目标店铺审核，不在此资料列表中。</p>
            </section>
          ) : reviewTechnicians.length > 0 ? (
            <>
            <DataTable<BackofficeTechnicianPayload>
              columns={[
                { key: "technician", title: "技师", render: (row) => <button className="font-black text-moss hover:underline" onClick={() => openTechnician(mapBackofficeTechnician(row))} type="button">{row.displayName}</button> },
                { key: "email", title: "邮箱", render: (row) => row.email },
                { key: "city", title: "城市", render: (row) => row.city },
                { key: "shop", title: "主展示店铺", render: (row) => row.shopName ?? "未分配" },
                { key: "submittedAt", title: "创建时间", render: (row) => row.createdAt },
                { key: "status", title: "状态", render: () => <Badge tone="yellow">待审核</Badge> }
              ]}
              onView={(row) => openTechnician(mapBackofficeTechnician(row))}
              pageSize={10}
              paginationMode="server"
              rows={reviewTechnicians}
              showFooter={false}
              showFooterActions={false}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3"><span className="text-sm font-bold text-ink/55">服务器共 {listTotal} 条，第 {page} / {Math.max(1, Math.ceil(listTotal / 10))} 页</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage(page - 1)} size="sm" variant="secondary">上一页</Button><Button disabled={page * 10 >= listTotal} onClick={() => setPage(page + 1)} size="sm" variant="secondary">下一页</Button></div></div>
            </>
          ) : null
        ) : (
          <>
            <section className="mb-4 grid gap-3 md:grid-cols-3">
              {[
                { label: "全部技师", value: summary?.total ?? "—", note: "已开通技师身份，包含所有店铺" },
                { label: "待审核技师", value: summary?.pendingReview ?? "—", note: "申请开通技师身份，正在审核的用户" },
                { label: "今日活跃", value: summary?.activeToday ?? "—", note: "东京时间今日曾可接单或有自由排班日程的技师" }
              ].map((metric) => <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={metric.label}><p className="text-sm font-bold text-ink/50">{translate(metric.label)}</p><strong className="mt-2 block text-3xl font-black">{metric.value}</strong><p className="mt-2 text-xs font-bold text-ink/45">{translate(metric.note)}</p></article>)}
            </section>
            <TechnicianListModule context="platform" onSelectTechnician={openTechnician} stores={mappedShops} technicians={mappedTechnicians} page={page} total={listTotal} onPageChange={setPage} onShopFilterChange={setSelectedShopId} />
          </>
        )}
      </ModuleShell>

      {detailDrawer}
      <Drawer open={inviteOpen} title={translate("技师申请邀请")} onClose={() => setInviteOpen(false)}>
        <div className="space-y-5">
          <p className="text-sm font-bold text-ink/60">{translate("选择已有用户和目标店铺，系统将创建申请草稿并通知用户。用户提交后由店铺审核。")}</p>
          {inviteError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{inviteError}</p> : null}
          {inviteSuccess ? <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">{translate("申请草稿已创建，用户已收到通知。")}</p> : (
            <>
              <label className="block"><span className="mb-2 block text-sm font-black">{translate("用户 NeeDoID")}</span><input name="userNeedoId" className={inputClassName} maxLength={32} onChange={(event) => setInviteUserNeedoId(event.target.value)} value={inviteUserNeedoId} /></label>
              <div>
                <label className="block"><span className="mb-2 block text-sm font-black">{translate("搜索目标店铺")}</span><input className={inputClassName} onChange={(event) => setInviteShopSearch(event.target.value)} value={inviteShopSearch} /></label>
                <Button disabled={inviteBusy} onClick={() => void searchInviteShops()} size="sm" variant="secondary">{translate("搜索店铺")}</Button>
              </div>
              <label className="block"><span className="mb-2 block text-sm font-black">{translate("目标店铺")}</span><select name="targetShopId" className={inputClassName} onChange={(event) => setInviteShopId(event.target.value)} value={inviteShopId}><option value="">{translate("请选择店铺")}</option>{inviteShops.filter((shop) => shop.status === "published").map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
              <Button disabled={inviteBusy || !inviteUserNeedoId.trim() || !inviteShopId} onClick={() => void submitInvite()}>{translate("创建申请草稿")}</Button>
            </>
          )}
        </div>
      </Drawer>
    </AdminLayout>
  );
}
