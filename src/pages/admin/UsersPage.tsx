import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeCustomerDetailPayload,
  type BackofficeCustomerPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { FormalCustomerDetailPanel } from "../../components/admin/FormalProfileDetailPanels";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  createFormalDetailRequestCoordinator,
  hasFormalDetailRefreshFailure,
  runFormalDetailMutationSequence
} from "./formalDetailRequest";
import { UserManagementWorkspace } from "./UserManagementWorkspace";

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

function CustomerProfilesWorkspace() {
  const { language } = useOptionalI18n();
  const languageRef = useRef(language);
  languageRef.current = language;
  const [customers, setCustomers] = useState<BackofficeCustomerPayload[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerDetail, setCustomerDetail] = useState<BackofficeCustomerDetailPayload | null>(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [customerDetailError, setCustomerDetailError] = useState("");
  const [draft, setDraft] = useState({ displayName: "", city: "", membershipLevel: "standard", isPublic: true });
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (rejectOnError = false) => {
    setLoading(true);
    setError("");
    try {
      const page = await backofficeRealDataApi.customers("backoffice", { keyword: keyword || undefined, page: 1, pageSize: 100 });
      setCustomers(page.list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      if (rejectOnError) throw loadError;
    } finally {
      setLoading(false);
    }
  }, [keyword]);

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
    onSuccess: (detail) => {
      setCustomerDetail(detail);
      setDraft({
        displayName: detail.displayName,
        city: detail.city ?? "",
        membershipLevel: detail.membershipLevel,
        isPublic: detail.isPublic
      });
    },
    request: (customerId) => backofficeRealDataApi.customer("backoffice", customerId)
  }), []);

  useEffect(() => {
    customerDetailRequest.activate();
    return () => customerDetailRequest.dispose();
  }, [customerDetailRequest]);

  const closeCustomer = useCallback(() => {
    customerDetailRequest.invalidate();
    setSelectedCustomerId(null);
    setCustomerDetail(null);
    setCustomerDetailLoading(false);
    setCustomerDetailError("");
  }, [customerDetailRequest]);

  useEffect(() => { void load(); }, [load]);

  const openCustomer = (customer: BackofficeCustomerPayload) => {
    setSelectedCustomerId(customer.id);
    setDraft({ displayName: "", city: "", membershipLevel: "standard", isPublic: true });
    void customerDetailRequest.load(customer.id);
  };

  const mutate = async (customerId: number, action: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      const result = await runFormalDetailMutationSequence({
        isDetailCurrent: () => customerDetailRequest.getSelectedId() === customerId,
        mutate: action,
        refreshDetail: () => customerDetailRequest.loadOrThrow(customerId),
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

  const deleteCustomer = async (customerId: number) => {
    setSaving(true);
    setError("");
    try {
      await backofficeRealDataApi.deleteCustomer(customerId);
      if (customerDetailRequest.getSelectedId() === customerId) {
        closeCustomer();
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
      <ModuleShell title="客户资料" description="运营人员查看和维护正式客户档案；账号、角色及权限仍在账号管理中维护。" actions={<Button onClick={() => void load()} variant="secondary">刷新</Button>}>
        <div className="mb-4 flex gap-2 rounded-lg border border-line bg-white p-2 shadow-panel"><input className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm font-bold outline-none" onChange={(event) => setKeyword(event.target.value)} placeholder="按姓名、城市或邮箱搜索" value={keyword} /><Button onClick={() => void load()} size="sm" variant="dark">搜索</Button></div>
        {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        {loading ? <p className="mb-4 text-sm font-bold text-ink/50">正在读取正式客户资料...</p> : null}
        <DataTable columns={[
          { key: "name", title: "客户", render: (row: BackofficeCustomerPayload) => row.displayName },
          { key: "email", title: "邮箱", render: (row: BackofficeCustomerPayload) => row.email },
          { key: "city", title: "城市", render: (row: BackofficeCustomerPayload) => row.city ?? "未设置" },
          { key: "level", title: "会员等级", render: (row: BackofficeCustomerPayload) => row.membershipLevel },
          { key: "orders", title: "预约数", render: (row: BackofficeCustomerPayload) => row.bookingCount },
          { key: "public", title: "公开资料", render: (row: BackofficeCustomerPayload) => <Badge tone={row.isPublic ? "green" : "neutral"}>{row.isPublic ? "公开" : "不公开"}</Badge> }
        ]} footerPlacement="inline" onView={openCustomer} rows={customers} />
      </ModuleShell>

      <Drawer onClose={closeCustomer} open={selectedCustomerId !== null} title="客户集中详情">
        {customerDetailLoading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">{translateText("正在读取客户正式详情...", language)}</p> : null}
        {!customerDetailLoading && customerDetailError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{customerDetailError}</span>
            <Button onClick={() => void customerDetailRequest.retry()} size="sm" variant="secondary">{translateText("重试", language)}</Button>
          </div>
        ) : null}
        {!customerDetailLoading && !customerDetailError && customerDetail ? (
          <FormalCustomerDetailPanel
            actionContent={<Button disabled={saving} onClick={() => void deleteCustomer(customerDetail.id)} variant="danger">软删除客户</Button>}
            detail={customerDetail}
            editContent={<div className="space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-black">显示名称</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} value={draft.displayName} /></label>
              <label className="block"><span className="mb-2 block text-sm font-black">城市</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} value={draft.city} /></label>
              <label className="block"><span className="mb-2 block text-sm font-black">会员等级</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, membershipLevel: event.target.value }))} value={draft.membershipLevel} /></label>
              <label className="flex items-center gap-3 text-sm font-black"><input checked={draft.isPublic} onChange={(event) => setDraft((current) => ({ ...current, isPublic: event.target.checked }))} type="checkbox" />允许公开客户资料</label>
              <Button disabled={saving} onClick={() => void mutate(customerDetail.id, () => backofficeRealDataApi.updateCustomer(customerDetail.id, { ...draft, city: draft.city || null }))}>保存资料</Button>
            </div>}
          />
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}

export function UsersPage() {
  const [searchParams] = useSearchParams();
  return searchParams.get("view") === "customers" ? <CustomerProfilesWorkspace /> : <UserManagementWorkspace mode="users" />;
}
