import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeServiceCreateInput,
  type BackofficeServicePayload,
  type BackofficeShopCreateInput,
  type BackofficeShopPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { coreReadApi, type CoreCategory } from "../../features/core-read/api";
import { yen } from "../../lib/utils";

const tabs = ["店铺列表", "入驻审核", "服务项目", "店铺分类"];
const emptyShopForm: BackofficeShopCreateInput = {
  ownerEmail: "",
  ownerUsername: "",
  ownerPassword: "",
  name: "",
  city: "",
  address: ""
};
const emptyServiceForm: BackofficeServiceCreateInput = {
  categoryId: 0,
  name: "",
  city: "",
  serviceMode: "store",
  priceAmount: 0,
  durationMinutes: 60,
  status: "draft"
};
const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

export function MerchantsPage() {
  const [searchParams] = useSearchParams();
  const [active, setActive] = useState(searchParams.get("module") === "categories" ? "店铺分类" : "店铺列表");
  const [shops, setShops] = useState<BackofficeShopPayload[]>([]);
  const [services, setServices] = useState<BackofficeServicePayload[]>([]);
  const [categories, setCategories] = useState<CoreCategory[]>([]);
  const [selectedShop, setSelectedShop] = useState<BackofficeShopPayload | null>(null);
  const [selectedService, setSelectedService] = useState<BackofficeServicePayload | null>(null);
  const [shopForm, setShopForm] = useState(emptyShopForm);
  const [shopDraft, setShopDraft] = useState({ name: "", city: "", address: "" });
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [serviceDraft, setServiceDraft] = useState(emptyServiceForm);
  const [serviceShopId, setServiceShopId] = useState(0);
  const [createShopOpen, setCreateShopOpen] = useState(false);
  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [shopPage, servicePage, categoryPage] = await Promise.all([
        backofficeRealDataApi.shops("backoffice", { page: 1, pageSize: 100 }),
        backofficeRealDataApi.services("backoffice", { page: 1, pageSize: 100 }),
        coreReadApi.listCategories({ page: 1, pageSize: 100 })
      ]);
      setShops(shopPage.list);
      setServices(servicePage.list);
      setCategories(categoryPage.list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

  const openShop = (shop: BackofficeShopPayload) => {
    setSelectedShop(shop);
    setShopDraft({ name: shop.name, city: shop.city, address: shop.address });
  };

  const createShop = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void mutate(async () => {
      await backofficeRealDataApi.createShop(shopForm);
      setShopForm(emptyShopForm);
      setCreateShopOpen(false);
    });
  };

  const saveShop = () => {
    if (!selectedShop) return;
    void mutate(async () => setSelectedShop(await backofficeRealDataApi.updateShop(selectedShop.id, shopDraft)));
  };

  const openService = (service: BackofficeServicePayload) => {
    setSelectedService(service);
    setServiceDraft({
      categoryId: service.categoryId,
      technicianProfileId: service.technicianProfileId,
      name: service.name,
      description: service.description,
      city: service.city,
      serviceMode: service.serviceMode,
      priceAmount: service.priceAmount,
      durationMinutes: service.durationMinutes,
      status: service.status,
      isRecommended: service.isRecommended,
      sortOrder: service.sortOrder
    });
  };

  const createService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serviceShopId || !serviceForm.categoryId) return;
    void mutate(async () => {
      await backofficeRealDataApi.createService("backoffice", serviceForm, serviceShopId);
      setServiceForm(emptyServiceForm);
      setServiceShopId(0);
      setCreateServiceOpen(false);
    });
  };

  const saveService = () => {
    if (!selectedService) return;
    void mutate(async () => setSelectedService(await backofficeRealDataApi.updateService("backoffice", selectedService.id, serviceDraft)));
  };

  return (
    <AdminLayout>
      <ModuleShell title="店铺与商家管理" description="店铺账号、审核、基础资料与服务项目全部读取和写入正式数据库。" actions={<Button onClick={() => setCreateShopOpen(true)}>新增店铺</Button>}>
        <Tabs active={active} items={tabs} onChange={setActive} />
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        {loading ? <p className="mt-6 text-sm font-bold text-ink/50">正在读取正式数据...</p> : null}

        {active === "店铺列表" ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {shops.map((shop) => (
              <article className="rounded-lg border border-line bg-white p-5 shadow-panel" key={shop.id}>
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs font-bold text-ink/45">店铺 #{shop.id} · {shop.city}</p><h2 className="mt-1 text-xl font-black">{shop.name}</h2><p className="mt-2 text-sm text-ink/60">{shop.address}</p><p className="mt-1 text-xs font-bold text-moss">{shop.ownerEmail ?? "尚未绑定负责人"}</p></div>
                  <Badge tone={shop.status === "published" ? "green" : "yellow"}>{shop.status}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => openShop(shop)} size="sm">集中详情</Button>{shop.status !== "published" ? <Button onClick={() => void mutate(() => backofficeRealDataApi.approveShop(shop.id))} size="sm" variant="secondary">审核通过</Button> : null}</div>
              </article>
            ))}
            {!loading && shops.length === 0 ? <p className="text-sm text-ink/50">暂无店铺数据。</p> : null}
          </div>
        ) : null}

        {active === "入驻审核" ? <div className="mt-4"><DataTable columns={[
          { key: "name", title: "店铺", render: (row: BackofficeShopPayload) => row.name },
          { key: "owner", title: "负责人账号", render: (row: BackofficeShopPayload) => row.ownerEmail ?? "未绑定" },
          { key: "city", title: "城市", render: (row: BackofficeShopPayload) => row.city },
          { key: "status", title: "审核状态", render: (row: BackofficeShopPayload) => <Badge tone={row.status === "published" ? "green" : "yellow"}>{row.status}</Badge> }
        ]} footerPlacement="inline" onView={openShop} rows={shops.filter((shop) => shop.status !== "archived")} /></div> : null}

        {active === "服务项目" ? <div className="mt-4 space-y-4"><div className="flex justify-end"><Button onClick={() => setCreateServiceOpen(true)} variant="secondary">新增服务项目</Button></div><DataTable columns={[
          { key: "name", title: "服务项目", render: (row: BackofficeServicePayload) => row.name },
          { key: "shop", title: "店铺", render: (row: BackofficeServicePayload) => shops.find((shop) => shop.id === row.shopId)?.name ?? `#${row.shopId}` },
          { key: "category", title: "分类", render: (row: BackofficeServicePayload) => row.categoryName },
          { key: "mode", title: "模式", render: (row: BackofficeServicePayload) => row.serviceMode },
          { key: "price", title: "价格", render: (row: BackofficeServicePayload) => yen(row.priceAmount) },
          { key: "duration", title: "时长", render: (row: BackofficeServicePayload) => `${row.durationMinutes} 分钟` },
          { key: "status", title: "状态", render: (row: BackofficeServicePayload) => <Badge tone={row.status === "published" ? "green" : "neutral"}>{row.status}</Badge> }
        ]} footerPlacement="inline" onView={openService} rows={services} /></div> : null}

        {active === "店铺分类" ? <div className="mt-4"><DataTable columns={[
          { key: "id", title: "ID", render: (row: CoreCategory) => row.id },
          { key: "code", title: "代码", render: (row: CoreCategory) => row.code },
          { key: "name", title: "分类名称", render: (row: CoreCategory) => row.name },
          { key: "ja", title: "日本語", render: (row: CoreCategory) => row.nameJa ?? "-" },
          { key: "status", title: "状态", render: (row: CoreCategory) => <Badge tone={row.isActive ? "green" : "neutral"}>{row.isActive ? "启用" : "停用"}</Badge> }
        ]} footerPlacement="inline" rows={categories} /></div> : null}
      </ModuleShell>

      <Drawer open={createShopOpen} title="创建店铺与负责人账号" onClose={() => setCreateShopOpen(false)}>
        <form className="space-y-4" onSubmit={createShop}>
          {(["name", "city", "address", "ownerUsername", "ownerEmail", "ownerPassword"] as const).map((field) => <label className="block" key={field}><span className="mb-2 block text-sm font-black">{field}</span><input className={inputClassName} onChange={(event) => setShopForm((current) => ({ ...current, [field]: event.target.value }))} required type={field === "ownerEmail" ? "email" : field === "ownerPassword" ? "password" : "text"} value={shopForm[field] ?? ""} /></label>)}
          <p className="text-xs leading-5 text-ink/50">负责人账号在店铺审核通过前保持禁用。密码至少 8 位，并包含大小写字母、数字和符号。</p>
          <Button disabled={saving} type="submit">{saving ? "保存中..." : "创建待审核店铺"}</Button>
        </form>
      </Drawer>

      <Drawer open={createServiceOpen} title="创建服务项目" onClose={() => setCreateServiceOpen(false)}>
        <form className="space-y-4" onSubmit={createService}>
          <label className="block"><span className="mb-2 block text-sm font-black">店铺</span><select className={inputClassName} onChange={(event) => setServiceShopId(Number(event.target.value))} required value={serviceShopId}><option value={0}>请选择店铺</option>{shops.filter((shop) => shop.status === "published").map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
          <label className="block"><span className="mb-2 block text-sm font-black">分类</span><select className={inputClassName} onChange={(event) => setServiceForm((current) => ({ ...current, categoryId: Number(event.target.value) }))} required value={serviceForm.categoryId}><option value={0}>请选择分类</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="block"><span className="mb-2 block text-sm font-black">服务名称</span><input className={inputClassName} onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))} required value={serviceForm.name} /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">城市</span><input className={inputClassName} onChange={(event) => setServiceForm((current) => ({ ...current, city: event.target.value }))} required value={serviceForm.city} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-black">服务模式</span><select className={inputClassName} onChange={(event) => setServiceForm((current) => ({ ...current, serviceMode: event.target.value }))} value={serviceForm.serviceMode}><option value="store">到店</option><option value="home">上门</option></select></label>
            <label className="block"><span className="mb-2 block text-sm font-black">状态</span><select className={inputClassName} onChange={(event) => setServiceForm((current) => ({ ...current, status: event.target.value }))} value={serviceForm.status}><option value="draft">草稿</option><option value="published">发布</option><option value="paused">暂停</option></select></label>
            <label className="block"><span className="mb-2 block text-sm font-black">价格（日元）</span><input className={inputClassName} min={0} onChange={(event) => setServiceForm((current) => ({ ...current, priceAmount: Number(event.target.value) }))} required type="number" value={serviceForm.priceAmount} /></label>
            <label className="block"><span className="mb-2 block text-sm font-black">时长（分钟）</span><input className={inputClassName} min={1} onChange={(event) => setServiceForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} required type="number" value={serviceForm.durationMinutes} /></label>
          </div>
          <Button disabled={saving || !serviceShopId || !serviceForm.categoryId} type="submit">{saving ? "保存中..." : "创建服务项目"}</Button>
        </form>
      </Drawer>

      <Drawer open={Boolean(selectedShop)} title="店铺集中详情" onClose={() => setSelectedShop(null)}>
        {selectedShop ? <div className="space-y-5">
          <DetailGrid items={[{ label: "店铺 ID", value: selectedShop.id }, { label: "负责人账号", value: selectedShop.ownerEmail ?? "未绑定" }, { label: "状态", value: selectedShop.status }, { label: "电话", value: selectedShop.phone ?? "未设置" }, { label: "推荐", value: selectedShop.isRecommended ? "是" : "否" }, { label: "创建时间", value: selectedShop.createdAt }]} />
          {(["name", "city", "address"] as const).map((field) => <label className="block" key={field}><span className="mb-2 block text-sm font-black">{field}</span><input className={inputClassName} onChange={(event) => setShopDraft((current) => ({ ...current, [field]: event.target.value }))} value={shopDraft[field]} /></label>)}
          <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={saveShop}>保存资料</Button>{selectedShop.status !== "published" ? <Button disabled={saving} onClick={() => void mutate(async () => setSelectedShop(await backofficeRealDataApi.approveShop(selectedShop.id)))} variant="secondary">审核通过</Button> : null}<Button disabled={saving} onClick={() => void mutate(async () => { await backofficeRealDataApi.deleteShop(selectedShop.id); setSelectedShop(null); })} variant="danger">软删除</Button></div>
        </div> : null}
      </Drawer>

      <Drawer open={Boolean(selectedService)} title="服务项目详情" onClose={() => setSelectedService(null)}>
        {selectedService ? <div className="space-y-5">
          <DetailGrid items={[{ label: "服务 ID", value: selectedService.id }, { label: "店铺 ID", value: selectedService.shopId }, { label: "创建时间", value: selectedService.createdAt }, { label: "更新时间", value: selectedService.updatedAt }]} />
          <label className="block"><span className="mb-2 block text-sm font-black">分类</span><select className={inputClassName} onChange={(event) => setServiceDraft((current) => ({ ...current, categoryId: Number(event.target.value) }))} value={serviceDraft.categoryId}><option value={0}>请选择分类</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="block"><span className="mb-2 block text-sm font-black">服务名称</span><input className={inputClassName} onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} value={serviceDraft.name} /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">城市</span><input className={inputClassName} onChange={(event) => setServiceDraft((current) => ({ ...current, city: event.target.value }))} value={serviceDraft.city} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-black">服务模式</span><select className={inputClassName} onChange={(event) => setServiceDraft((current) => ({ ...current, serviceMode: event.target.value }))} value={serviceDraft.serviceMode}><option value="store">到店</option><option value="home">上门</option></select></label>
            <label className="block"><span className="mb-2 block text-sm font-black">状态</span><select className={inputClassName} onChange={(event) => setServiceDraft((current) => ({ ...current, status: event.target.value }))} value={serviceDraft.status}><option value="draft">草稿</option><option value="published">发布</option><option value="paused">暂停</option></select></label>
            <label className="block"><span className="mb-2 block text-sm font-black">价格（日元）</span><input className={inputClassName} min={0} onChange={(event) => setServiceDraft((current) => ({ ...current, priceAmount: Number(event.target.value) }))} type="number" value={serviceDraft.priceAmount} /></label>
            <label className="block"><span className="mb-2 block text-sm font-black">时长（分钟）</span><input className={inputClassName} min={1} onChange={(event) => setServiceDraft((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} type="number" value={serviceDraft.durationMinutes} /></label>
          </div>
          <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={saveService}>保存服务</Button><Button disabled={saving} onClick={() => void mutate(async () => { await backofficeRealDataApi.deleteService("backoffice", selectedService.id); setSelectedService(null); })} variant="danger">软删除服务</Button></div>
        </div> : null}
      </Drawer>
    </AdminLayout>
  );
}
