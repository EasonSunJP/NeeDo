import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { backofficeRealDataApi, type BackofficeCustomerPayload } from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { UserManagementWorkspace } from "./UserManagementWorkspace";

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

function CustomerProfilesWorkspace() {
  const [customers, setCustomers] = useState<BackofficeCustomerPayload[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<BackofficeCustomerPayload | null>(null);
  const [draft, setDraft] = useState({ displayName: "", city: "", membershipLevel: "standard", isPublic: true });
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => { void load(); }, [load]);

  const openCustomer = (customer: BackofficeCustomerPayload) => {
    setSelectedCustomer(customer);
    setDraft({ displayName: customer.displayName, city: customer.city ?? "", membershipLevel: customer.membershipLevel, isPublic: customer.isPublic });
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

      <Drawer onClose={() => setSelectedCustomer(null)} open={Boolean(selectedCustomer)} title="客户集中详情">
        {selectedCustomer ? <div className="space-y-5">
          <DetailGrid items={[{ label: "客户档案 ID", value: selectedCustomer.id }, { label: "账号 ID", value: selectedCustomer.userId }, { label: "登录邮箱", value: selectedCustomer.email }, { label: "预约数", value: selectedCustomer.bookingCount }, { label: "创建时间", value: selectedCustomer.createdAt }]} />
          <label className="block"><span className="mb-2 block text-sm font-black">显示名称</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} value={draft.displayName} /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">城市</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} value={draft.city} /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">会员等级</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, membershipLevel: event.target.value }))} value={draft.membershipLevel} /></label>
          <label className="flex items-center gap-3 text-sm font-black"><input checked={draft.isPublic} onChange={(event) => setDraft((current) => ({ ...current, isPublic: event.target.checked }))} type="checkbox" />允许公开客户资料</label>
          <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={() => void mutate(async () => setSelectedCustomer(await backofficeRealDataApi.updateCustomer(selectedCustomer.id, { ...draft, city: draft.city || null })))}>保存资料</Button><Button disabled={saving} onClick={() => void mutate(async () => { await backofficeRealDataApi.deleteCustomer(selectedCustomer.id); setSelectedCustomer(null); })} variant="danger">软删除客户</Button></div>
        </div> : null}
      </Drawer>
    </AdminLayout>
  );
}

export function UsersPage() {
  const [searchParams] = useSearchParams();
  return searchParams.get("view") === "customers" ? <CustomerProfilesWorkspace /> : <UserManagementWorkspace mode="users" />;
}
