import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  mapBackofficeOrder,
  mapBackofficeStore,
  mapBackofficeTechnician,
  type BackofficeCustomerPayload,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import { CustomerManagementModule } from "../../components/admin/CustomerManagementModule";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { TechnicianListModule } from "../../components/admin/TechnicianListModule";
import { TechnicianProfilePanel } from "../../components/admin/TechnicianProfilePanel";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { formatSystemId } from "../../lib/systemIds";
import type { Customer, Technician } from "../../types/domain";

type PeopleModule = "staff" | "customers" | "reviews";
const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

function normalizeModule(value: string | null): PeopleModule {
  return value === "customers" || value === "reviews" ? value : "staff";
}

function mapCustomer(row: BackofficeCustomerPayload): Customer {
  return {
    id: `customer-${row.id}`,
    systemId: formatSystemId("u", row.id),
    name: row.displayName,
    nickname: row.displayName,
    avatar: "/images/generated/profiles/ai-profile-30.jpg",
    phone: "",
    accountUsername: row.email,
    memberLevel: row.membershipLevel,
    tags: [row.city ?? "", row.isPublic ? "公开资料" : "非公开"].filter(Boolean),
    ltv: 0,
    orderCount: row.bookingCount,
    lastOrderAt: "",
    activeScore: row.bookingCount,
    churnRisk: "low"
  };
}

export function MerchantAdminPeoplePage() {
  const [searchParams] = useSearchParams();
  const module = normalizeModule(searchParams.get("module"));
  const [staffRecords, setStaffRecords] = useState<BackofficeTechnicianPayload[]>([]);
  const [customerRecords, setCustomerRecords] = useState<BackofficeCustomerPayload[]>([]);
  const [shops, setShops] = useState<BackofficeShopPayload[]>([]);
  const [orders, setOrders] = useState<ReturnType<typeof mapBackofficeOrder>[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ displayName: "", city: "", serviceArea: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [staffPage, customerPage, shopPage, orderPage] = await Promise.all([
        backofficeRealDataApi.technicians("merchant-admin", { page: 1, pageSize: 100 }),
        backofficeRealDataApi.customers("merchant-admin", { page: 1, pageSize: 100 }),
        backofficeRealDataApi.merchantShop(),
        backofficeRealDataApi.orders("merchant-admin", { page: 1, pageSize: 100 })
      ]);
      setStaffRecords(staffPage.list);
      setCustomerRecords(customerPage.list);
      setShops(shopPage.list);
      setOrders(orderPage.list.map(mapBackofficeOrder));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const staff = useMemo(() => staffRecords.map(mapBackofficeTechnician), [staffRecords]);
  const customers = useMemo(() => customerRecords.map(mapCustomer), [customerRecords]);
  const stores = useMemo(() => shops.map(mapBackofficeStore), [shops]);
  const selectedRecord = staffRecords.find((item) => item.id === selectedId) ?? null;
  const selectedStaff = selectedRecord ? mapBackofficeTechnician(selectedRecord) : null;

  const openStaff = (technician: Technician) => {
    const id = Number(technician.id.replace("tech-", ""));
    const record = staffRecords.find((item) => item.id === id);
    if (!record) return;
    setSelectedId(record.id);
    setDraft({ displayName: record.displayName, city: record.city, serviceArea: record.serviceArea ?? "" });
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
    <MerchantAdminLayout>
      <ModuleShell
        description={module === "staff" ? "只展示当前登录店铺范围内的真实技师。" : module === "customers" ? "只展示与当前店铺存在真实预约关系的客户。" : "评价写 API 尚未进入当前微步骤，此处不展示模拟评价。"}
        title={module === "staff" ? "员工列表" : module === "customers" ? "用户管理" : "评价中心"}
      >
        {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        {loading ? <p className="text-sm font-bold text-ink/50">正在读取当前店铺的正式数据...</p> : null}
        {module === "staff" ? <TechnicianListModule context="merchant" onSelectTechnician={openStaff} stores={stores} technicians={staff} /> : null}
        {module === "customers" ? <CustomerManagementModule customers={customers} orderRows={orders} /> : null}
        {module === "reviews" ? <div className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/55">评价模块将在正式 Review API 完成后开放；当前不会回退到 demo 数据。</div> : null}

        <Drawer onClose={() => setSelectedId(null)} open={Boolean(selectedRecord)} title="员工集中详情">
          {selectedRecord && selectedStaff ? <div className="space-y-5">
            <DetailGrid items={[{ label: "技师 ID", value: selectedRecord.id }, { label: "登录邮箱", value: selectedRecord.email }, { label: "状态", value: selectedRecord.status }, { label: "所属店铺", value: selectedRecord.shopName ?? "未分配" }, { label: "审核时间", value: selectedRecord.verifiedAt ?? "未审核" }]} />
            <TechnicianProfilePanel context="merchant" technician={selectedStaff} />
            {(["displayName", "city", "serviceArea"] as const).map((field) => <label className="block" key={field}><span className="mb-2 block text-sm font-black">{field}</span><input className={inputClassName} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} value={draft[field]} /></label>)}
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void mutate(() => backofficeRealDataApi.updateTechnician("merchant-admin", selectedRecord.id, { displayName: draft.displayName, city: draft.city, serviceArea: draft.serviceArea || null }))}>保存资料</Button>
              {selectedRecord.status !== "published" ? <Button disabled={saving} onClick={() => void mutate(() => backofficeRealDataApi.approveTechnician("merchant-admin", selectedRecord.id))} variant="secondary">审核通过</Button> : null}
              <Button disabled={saving} onClick={() => void mutate(async () => { await backofficeRealDataApi.deleteTechnician("merchant-admin", selectedRecord.id); setSelectedId(null); })} variant="danger">移除技师</Button>
            </div>
          </div> : null}
        </Drawer>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
