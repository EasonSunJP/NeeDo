import { useCallback, useEffect, useRef, useState } from "react";
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
import { UserManagementWorkspace } from "./UserManagementWorkspace";

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

function CustomerProfilesWorkspace() {
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
  const mountedRef = useRef(false);
  const selectedCustomerIdRef = useRef<number | null>(null);
  const customerDetailRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      customerDetailRequestRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await backofficeRealDataApi.customers("backoffice", { keyword: keyword || undefined, page: 1, pageSize: 100 });
      setCustomers(page.list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const loadCustomerDetail = useCallback(async (customerId: number) => {
    const requestId = ++customerDetailRequestRef.current;
    setCustomerDetail(null);
    setCustomerDetailLoading(true);
    setCustomerDetailError("");
    try {
      const detail = await backofficeRealDataApi.customer("backoffice", customerId);
      if (!mountedRef.current || requestId !== customerDetailRequestRef.current || selectedCustomerIdRef.current !== customerId) return;
      setCustomerDetail(detail);
      setDraft({
        displayName: detail.displayName,
        city: detail.city ?? "",
        membershipLevel: detail.membershipLevel,
        isPublic: detail.isPublic
      });
    } catch (detailError) {
      if (!mountedRef.current || requestId !== customerDetailRequestRef.current || selectedCustomerIdRef.current !== customerId) return;
      setCustomerDetailError(detailError instanceof Error ? detailError.message : String(detailError));
    } finally {
      if (mountedRef.current && requestId === customerDetailRequestRef.current && selectedCustomerIdRef.current === customerId) {
        setCustomerDetailLoading(false);
      }
    }
  }, []);

  const closeCustomer = useCallback(() => {
    selectedCustomerIdRef.current = null;
    customerDetailRequestRef.current += 1;
    setSelectedCustomerId(null);
    setCustomerDetail(null);
    setCustomerDetailLoading(false);
    setCustomerDetailError("");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCustomer = (customer: BackofficeCustomerPayload) => {
    selectedCustomerIdRef.current = customer.id;
    setSelectedCustomerId(customer.id);
    setDraft({ displayName: "", city: "", membershipLevel: "standard", isPublic: true });
    void loadCustomerDetail(customer.id);
  };

  const mutate = async (customerId: number, action: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await action();
      await load();
      if (mountedRef.current && selectedCustomerIdRef.current === customerId) {
        await loadCustomerDetail(customerId);
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
      if (selectedCustomerIdRef.current === customerId) {
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
        {customerDetailLoading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">正在读取客户正式详情...</p> : null}
        {!customerDetailLoading && customerDetailError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{customerDetailError}</span>
            <Button onClick={() => { if (selectedCustomerId !== null) void loadCustomerDetail(selectedCustomerId); }} size="sm" variant="secondary">重试</Button>
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
