import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeCustomerDetailPayload,
  type BackofficeCustomerPayload,
  type BackofficeTechnicianDetailPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import {
  FormalCustomerDetailPanel,
  FormalTechnicianDetailPanel
} from "../../components/admin/FormalProfileDetailPanels";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { loadCoreReadWithTransientRetry } from "../../features/core-read/transientRetry";
import { describeMerchantReadError } from "../../features/merchant-admin/merchantReadError";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  createFormalDetailRequestCoordinator,
  hasFormalDetailRefreshFailure,
  runFormalDetailMutationSequence
} from "../admin/formalDetailRequest";

type PeopleModule = "staff" | "customers" | "reviews";
type TechnicianDraft = { displayName: string; city: string; serviceArea: string };
type ConfirmationAction = "approve" | "delete" | null;

const pageSize = 20;
const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

function normalizeModule(value: string | null): PeopleModule {
  return value === "customers" || value === "reviews" ? value : "staff";
}

function technicianDraft(technician: BackofficeTechnicianPayload): TechnicianDraft {
  return {
    displayName: technician.displayName,
    city: technician.city,
    serviceArea: technician.serviceArea ?? ""
  };
}

function statusTone(status: string): "green" | "yellow" | "red" | "neutral" {
  if (status === "published" || status === "active") return "green";
  if (status === "archived" || status === "suspended") return "red";
  if (status === "pending_review" || status === "draft") return "yellow";
  return "neutral";
}

export function MerchantAdminPeoplePage() {
  const [searchParams] = useSearchParams();
  const { language } = useOptionalI18n();
  const languageRef = useRef(language);
  languageRef.current = language;
  const module = normalizeModule(searchParams.get("module"));
  const [technicians, setTechnicians] = useState<BackofficeTechnicianPayload[]>([]);
  const [customers, setCustomers] = useState<BackofficeCustomerPayload[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [technicianDetail, setTechnicianDetail] = useState<BackofficeTechnicianDetailPayload | null>(null);
  const [customerDetail, setCustomerDetail] = useState<BackofficeCustomerDetailPayload | null>(null);
  const [technicianDetailLoading, setTechnicianDetailLoading] = useState(false);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [technicianDetailError, setTechnicianDetailError] = useState("");
  const [customerDetailError, setCustomerDetailError] = useState("");
  const [draft, setDraft] = useState<TechnicianDraft>({ displayName: "", city: "", serviceArea: "" });
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction>(null);

  const load = useCallback(async (rejectOnError = false) => {
    if (module === "reviews") {
      setTechnicians([]);
      setCustomers([]);
      setTotal(0);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const query = { page, pageSize, keyword: keyword || undefined };
      if (module === "staff") {
        const result = await loadCoreReadWithTransientRetry(
          () => backofficeRealDataApi.technicians("merchant-admin", query)
        );
        setTechnicians(result.list);
        setCustomers([]);
        setTotal(result.total);
      } else {
        const result = await loadCoreReadWithTransientRetry(
          () => backofficeRealDataApi.customers("merchant-admin", query)
        );
        setCustomers(result.list);
        setTechnicians([]);
        setTotal(result.total);
      }
    } catch (loadError) {
      setError(describeMerchantReadError(loadError, languageRef.current));
      if (rejectOnError) throw loadError;
    } finally {
      setLoading(false);
    }
  }, [keyword, module, page]);

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
      setDraft(technicianDraft(detail));
    },
    request: (technicianId) => backofficeRealDataApi.technician("merchant-admin", technicianId)
  }), []);

  const customerDetailRequest = useMemo(() => createFormalDetailRequestCoordinator<BackofficeCustomerDetailPayload>({
    onError: (detailError) => {
      const message = detailError instanceof Error ? detailError.message : typeof detailError === "string" ? detailError : "";
      setCustomerDetailError(message.trim() || translateText("客户正式详情读取失败", languageRef.current));
    },
    onFinally: () => setCustomerDetailLoading(false),
    onStart: () => {
      setCustomerDetail(null);
      setCustomerDetailLoading(true);
      setCustomerDetailError("");
    },
    onSuccess: setCustomerDetail,
    request: (customerId) => backofficeRealDataApi.customer("merchant-admin", customerId)
  }), []);

  useEffect(() => {
    technicianDetailRequest.activate();
    customerDetailRequest.activate();
    return () => {
      technicianDetailRequest.dispose();
      customerDetailRequest.dispose();
    };
  }, [customerDetailRequest, technicianDetailRequest]);

  const closeTechnician = useCallback(() => {
    technicianDetailRequest.invalidate();
    setSelectedTechnicianId(null);
    setTechnicianDetail(null);
    setTechnicianDetailLoading(false);
    setTechnicianDetailError("");
    setConfirmationAction(null);
  }, [technicianDetailRequest]);

  const closeCustomer = useCallback(() => {
    customerDetailRequest.invalidate();
    setSelectedCustomerId(null);
    setCustomerDetail(null);
    setCustomerDetailLoading(false);
    setCustomerDetailError("");
  }, [customerDetailRequest]);

  useEffect(() => {
    setPage(1);
    closeTechnician();
    closeCustomer();
  }, [closeCustomer, closeTechnician, module]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  const openTechnician = (technician: BackofficeTechnicianPayload) => {
    closeCustomer();
    setSelectedTechnicianId(technician.id);
    setDraft({ displayName: "", city: "", serviceArea: "" });
    setConfirmationAction(null);
    void technicianDetailRequest.load(technician.id);
  };

  const openCustomer = (customer: BackofficeCustomerPayload) => {
    closeTechnician();
    setSelectedCustomerId(customer.id);
    void customerDetailRequest.load(customer.id);
  };

  const runMutation = async (technicianId: number, mutation: () => Promise<BackofficeTechnicianPayload>) => {
    setSaving(true);
    setError("");
    try {
      const result = await runFormalDetailMutationSequence({
        isDetailCurrent: () => technicianDetailRequest.getSelectedId() === technicianId,
        mutate: mutation,
        refreshDetail: () => technicianDetailRequest.loadOrThrow(technicianId),
        refreshList: () => load(true)
      });
      if (hasFormalDetailRefreshFailure(result)) {
        setError(translateText("资料已保存，但刷新失败，请重试", language));
      }
      setConfirmationAction(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setSaving(false);
    }
  };

  const approveTechnician = async () => {
    if (selectedTechnicianId === null) return;
    if (confirmationAction !== "approve") {
      setConfirmationAction("approve");
      return;
    }
    await runMutation(selectedTechnicianId, () => backofficeRealDataApi.approveTechnician("merchant-admin", selectedTechnicianId));
  };

  const deleteTechnician = async () => {
    if (selectedTechnicianId === null) return;
    if (confirmationAction !== "delete") {
      setConfirmationAction("delete");
      return;
    }
    const technicianId = selectedTechnicianId;
    setSaving(true);
    setError("");
    try {
      await backofficeRealDataApi.deleteTechnician("merchant-admin", technicianId);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const description = module === "staff"
    ? "按当前活动店铺身份读取和维护真实技师档案。"
    : module === "customers"
      ? "只读取与当前店铺存在真实预约关系的客户档案。"
      : "Review 数据表、回复与审核 API 完成前不展示模拟评价。";

  return (
    <MerchantAdminLayout>
      <ModuleShell
        description={description}
        title={module === "staff" ? "员工列表" : module === "customers" ? "用户管理" : "评价中心"}
        actions={module !== "reviews" ? <Button onClick={() => void load()} variant="secondary">刷新正式数据</Button> : undefined}
      >
        {module !== "reviews" ? (
          <form className="mb-4 flex gap-2 rounded-lg border border-line bg-white p-2 shadow-panel" onSubmit={submitSearch}>
            <input className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm font-bold outline-none" maxLength={100} onChange={(event) => setKeywordInput(event.target.value)} placeholder="按姓名、城市或邮箱搜索" value={keywordInput} />
            <Button size="sm" type="submit" variant="dark">搜索</Button>
          </form>
        ) : null}

        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <span>{error}</span>
            <Button onClick={() => void load()} size="sm" variant="secondary">重新加载本店人员数据</Button>
          </div>
        ) : null}

        {loading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">正在读取当前店铺正式人员数据...</p> : null}

        {!loading && !error && module === "staff" ? (
          technicians.length ? (
            <DataTable<BackofficeTechnicianPayload>
              columns={[
                { key: "name", title: "技师", render: (row) => row.displayName },
                { key: "email", title: "邮箱", render: (row) => row.email },
                { key: "city", title: "城市", render: (row) => row.city },
                { key: "area", title: "服务区域", render: (row) => row.serviceArea ?? "未设置" },
                { key: "status", title: "状态", render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> }
              ]}
              footerPlacement="inline"
              onView={openTechnician}
              pageSize={pageSize}
              rows={technicians}
              showFooterActions={false}
            />
          ) : <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">本店当前没有符合条件的正式技师</p>
        ) : null}

        {!loading && !error && module === "customers" ? (
          customers.length ? (
            <DataTable<BackofficeCustomerPayload>
              columns={[
                { key: "name", title: "客户", render: (row) => row.displayName },
                { key: "email", title: "邮箱", render: (row) => row.email },
                { key: "city", title: "城市", render: (row) => row.city ?? "未设置" },
                { key: "membership", title: "会员等级", render: (row) => row.membershipLevel },
                { key: "bookings", title: "预约数", render: (row) => row.bookingCount },
                { key: "visibility", title: "公开资料", render: (row) => <Badge tone={row.isPublic ? "green" : "neutral"}>{row.isPublic ? "公开" : "不公开"}</Badge> }
              ]}
              footerPlacement="inline"
              onView={openCustomer}
              pageSize={pageSize}
              rows={customers}
              showFooterActions={false}
            />
          ) : <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">本店当前没有符合条件的正式客户</p>
        ) : null}

        {!loading && !error && module !== "reviews" && total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 text-sm font-bold shadow-panel">
            <span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <Button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} size="sm" variant="secondary">上一页</Button>
              <Button disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} size="sm" variant="secondary">下一页</Button>
            </div>
          </div>
        ) : null}

        {module === "reviews" ? (
          <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
            <Badge tone="yellow">未启用</Badge>
            <h2 className="mt-4 text-xl font-black text-ink">正式评价功能尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/55">当前不会展示模拟评价、评分或回复操作。上线前需要 Review 表与 migration、店铺范围分页 API、回复权限和风险审计。</p>
          </section>
        ) : null}

        <Drawer onClose={closeTechnician} open={selectedTechnicianId !== null} title="技师正式档案">
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
                {technicianDetail.status !== "published" ? <Button disabled={saving} onClick={() => void approveTechnician()} variant="secondary">{confirmationAction === "approve" ? "再次点击确认审核技师" : "审核通过"}</Button> : null}
                <Button disabled={saving} onClick={() => void deleteTechnician()} variant="danger">{confirmationAction === "delete" ? "再次点击确认移除技师" : "移除技师"}</Button>
              </>}
              detail={technicianDetail}
              editContent={<div className="space-y-4">
                <label className="block"><span className="mb-2 block text-sm font-black">显示名称</span><input className={inputClassName} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} value={draft.displayName} /></label>
                <label className="block"><span className="mb-2 block text-sm font-black">城市</span><input className={inputClassName} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} value={draft.city} /></label>
                <label className="block"><span className="mb-2 block text-sm font-black">服务区域</span><input className={inputClassName} maxLength={255} onChange={(event) => setDraft((current) => ({ ...current, serviceArea: event.target.value }))} value={draft.serviceArea} /></label>
                <Button disabled={saving || !draft.displayName.trim() || !draft.city.trim()} onClick={() => void runMutation(technicianDetail.id, () => backofficeRealDataApi.updateTechnician("merchant-admin", technicianDetail.id, { displayName: draft.displayName.trim(), city: draft.city.trim(), serviceArea: draft.serviceArea.trim() || null }))}>{saving ? "处理中..." : "保存资料"}</Button>
              </div>}
            />
          ) : null}
        </Drawer>

        <Drawer onClose={closeCustomer} open={selectedCustomerId !== null} title="客户正式档案">
          {customerDetailLoading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">{translateText("正在读取客户正式详情...", language)}</p> : null}
          {!customerDetailLoading && customerDetailError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <span>{customerDetailError}</span>
              <Button onClick={() => void customerDetailRequest.retry()} size="sm" variant="secondary">{translateText("重试", language)}</Button>
            </div>
          ) : null}
          {!customerDetailLoading && !customerDetailError && customerDetail ? <FormalCustomerDetailPanel detail={customerDetail} /> : null}
        </Drawer>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
