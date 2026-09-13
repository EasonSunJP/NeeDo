import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeServiceCreateInput,
  type BackofficeServicePayload,
  type BackofficeShopCreateInput,
  type BackofficeShopPayload
} from "../../api/backofficeRealData";
import { merchantSaasBillingApi, refreshMerchantAccountCard } from "../../api/merchantSaasBilling";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { MerchantAccountDetailDrawer } from "../../components/admin/MerchantAccountDetailDrawer";
import { MerchantAccountCollection } from "../../components/admin/MerchantAccountCollection";
import { MerchantBillingEditorDialog } from "../../components/admin/MerchantBillingEditorDialog";
import { MerchantSuspensionDialog } from "../../components/admin/MerchantSuspensionDialog";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { coreReadApi, type CoreCategory } from "../../features/core-read/api";
import { translateMerchantBillingText } from "../../features/merchant-saas-billing/i18n";
import type { MerchantAccountCard } from "../../features/merchant-saas-billing/model";
import { useI18n } from "../../i18n/I18nProvider";
import { openMerchantAdminPreviewWindow, startMerchantAdminPreview } from "../../auth/merchantAdminPreview";
import { yen } from "../../lib/utils";
import { readPositiveIntegerSearchParam } from "./adminSearchParams";

const tabs = ["店铺列表", "服务项目", "店铺分类"];
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

export function MerchantsPage({ embeddedDetail }: {
  embeddedDetail?: { id: number; type: string; onClose: () => void };
} = {}) {
  const { language } = useI18n();
  const t = (source: string) => translateMerchantBillingText(source, language);
  const [searchParams, setSearchParams] = useSearchParams();
  const detailShopId = embeddedDetail ? null : readPositiveIntegerSearchParam(searchParams, "detailShopId");
  const detailServiceId = embeddedDetail?.id ?? readPositiveIntegerSearchParam(searchParams, "detailServiceId");
  const detailServiceType = embeddedDetail?.type ?? searchParams.get("detailServiceType");
  const searchKeyword = (searchParams.get("keyword") ?? "").trim().slice(0, 100);
  const navigate = useNavigate();
  const [active, setActive] = useState(
    searchParams.get("module") === "categories"
      ? "店铺分类"
      : searchParams.get("module") === "services"
        ? "服务项目"
        : "店铺列表"
  );
  const [shops, setShops] = useState<BackofficeShopPayload[]>([]);
  const [services, setServices] = useState<BackofficeServicePayload[]>([]);
  const [categories, setCategories] = useState<CoreCategory[]>([]);
  const [billingAccounts, setBillingAccounts] = useState<MerchantAccountCard[]>([]);
  const [billingEditorCard, setBillingEditorCard] = useState<MerchantAccountCard | null>(null);
  const [businessSettingsCard, setBusinessSettingsCard] = useState<MerchantAccountCard | null>(null);
  const [billingDetailCard, setBillingDetailCard] = useState<MerchantAccountCard | null>(null);
  const [billingDetailLoading, setBillingDetailLoading] = useState(false);
  const [billingDetailError, setBillingDetailError] = useState("");
  const billingDetailRequestRef = useRef(0);
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
  const [loadedSearchKeyword, setLoadedSearchKeyword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (embeddedDetail) {
        const categoryPage = await coreReadApi.listCategories({ page: 1, pageSize: 100 });
        setCategories(categoryPage.list);
        for (let page = 1; ; page += 1) {
          const result = await backofficeRealDataApi.services("backoffice", { page, pageSize: 100 });
          const service = result.list.find((item) => item.id === embeddedDetail.id);
          if (service || page * result.page_size >= result.total || result.list.length === 0) {
            setServices(service ? [service] : []);
            break;
          }
        }
        return;
      }
      const [shopPage, servicePage, categoryPage, billingPage] = await Promise.all([
        backofficeRealDataApi.shops("backoffice", { keyword: searchKeyword || undefined, page: 1, pageSize: 100 }),
        backofficeRealDataApi.services("backoffice", { page: 1, pageSize: 100 }),
        coreReadApi.listCategories({ page: 1, pageSize: 100 }),
        merchantSaasBillingApi.listAccounts({ page: 1, pageSize: 100 })
      ]);
      setShops(shopPage.list);
      setServices(servicePage.list);
      setCategories(categoryPage.list);
      setBillingAccounts(billingPage.list);
      setLoadedSearchKeyword(searchKeyword);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [embeddedDetail?.id, searchKeyword]);

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

  const refreshBillingDetails = useCallback(async (card: MerchantAccountCard) => {
    const requestId = ++billingDetailRequestRef.current;
    setBillingDetailLoading(true);
    setBillingDetailError("");
    try {
      const refreshed = await refreshMerchantAccountCard(card);
      if (billingDetailRequestRef.current === requestId) setBillingDetailCard(refreshed);
    } catch (detailError) {
      if (billingDetailRequestRef.current === requestId) {
        setBillingDetailError(detailError instanceof Error ? detailError.message : String(detailError));
      }
    } finally {
      if (billingDetailRequestRef.current === requestId) setBillingDetailLoading(false);
    }
  }, []);

  const openBillingDetails = useCallback((card: MerchantAccountCard) => {
    setBillingDetailCard(card);
    void refreshBillingDetails(card);
  }, [refreshBillingDetails]);

  const closeBillingDetails = () => {
    billingDetailRequestRef.current += 1;
    setBillingDetailCard(null);
    setBillingDetailLoading(false);
    setBillingDetailError("");
  };

  const openShop = (shop: BackofficeShopPayload) => {
    setSelectedShop(shop);
    setShopDraft({ name: shop.name, city: shop.city, address: shop.address });
  };

  useEffect(() => {
    if (detailShopId === null || loading || error || loadedSearchKeyword !== searchKeyword) return;
    const shop = shops.find((shop) => shop.id === detailShopId);
    if (shop) {
      openShop(shop);
    } else {
      setError("未找到可访问的正式店铺");
    }
  }, [detailShopId, error, loadedSearchKeyword, loading, searchKeyword, shops]);

  const closeShop = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("detailShopId");
    setSearchParams(params, { replace: true });
    setSelectedShop(null);
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

  const openService = useCallback((service: BackofficeServicePayload) => {
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
  }, []);

  useEffect(() => {
    if (detailServiceId === null || loading || error) return;
    setActive("服务项目");
    if (detailServiceType !== "service") {
      if (!loading) setError("当前技师服务不属于店铺服务详情范围");
      return;
    }
    const service = services.find((service) => service.id === detailServiceId);
    if (service) {
      openService(service);
    } else if (!loading) {
      setError("未找到可访问的正式服务项目");
    }
  }, [detailServiceId, detailServiceType, loading, error, openService, services]);

  const closeService = () => {
    if (embeddedDetail) { embeddedDetail.onClose(); return; }
    const params = new URLSearchParams(searchParams);
    params.delete("detailServiceId");
    params.delete("detailServiceType");
    setSearchParams(params, { replace: true });
    setSelectedService(null);
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

  const openMerchantAdminPreview = (card: MerchantAccountCard, selectedShopId?: number) => {
    const query = searchParams.toString();
    const preview = startMerchantAdminPreview(
      card,
      `/admin/merchants${query ? `?${query}` : ""}`,
      selectedShopId,
    );

    if (!preview) {
      setError(t("商家暂无旗下店铺，暂不能进入商户后台"));
      return;
    }

    if (!openMerchantAdminPreviewWindow()) {
      setError(t("浏览器阻止了新页面，请允许弹出窗口后重试"));
    }
  };

  const serviceDetailDrawer = (
      <Drawer open={Boolean(embeddedDetail || selectedService)} title="服务项目详情" onClose={closeService}>
        {embeddedDetail && loading ? <p role="status">{t("正在加载")}</p> : null}
        {embeddedDetail && error ? <div role="alert" className="space-y-3 text-coral"><p>{error}</p><Button onClick={() => void load()} variant="secondary">{t("重试")}</Button></div> : null}
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
          <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={saveService}>保存服务</Button><Button disabled={saving} onClick={() => void mutate(async () => { await backofficeRealDataApi.deleteService("backoffice", selectedService.id); closeService(); })} variant="danger">软删除服务</Button></div>
        </div> : null}
      </Drawer>
  );
  if (embeddedDetail) return serviceDetailDrawer;

  return (
    <AdminLayout>
      <ModuleShell title="店铺与商家管理" description="店铺账号、审核、基础资料与服务项目全部读取和写入正式数据库。" actions={<Button onClick={() => setCreateShopOpen(true)}>新增店铺</Button>}>
        <Tabs active={active} items={tabs} onChange={setActive} />
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        {loading ? <p className="mt-6 text-sm font-bold text-ink/50">正在读取正式数据...</p> : null}

        {active === "店铺列表" ? (
          <MerchantAccountCollection
            accounts={billingAccounts}
            onEditBilling={setBillingEditorCard}
            onOpenBusinessSettings={setBusinessSettingsCard}
            onOpenMerchantAdminPreview={openMerchantAdminPreview}
            onViewDetails={openBillingDetails}
          />
        ) : null}

        {active === "服务项目" ? <div className="mt-4 space-y-4"><div className="flex justify-end"><Button onClick={() => setCreateServiceOpen(true)} variant="secondary">新增服务项目</Button></div><DataTable columns={[
          { key: "name", title: "服务项目", render: (row: BackofficeServicePayload) => row.name },
          { key: "shop", title: "店铺", render: (row: BackofficeServicePayload) => row.shopName },
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

      <MerchantBillingEditorDialog
        card={billingEditorCard}
        open={Boolean(billingEditorCard)}
        onChanged={load}
        onClose={() => setBillingEditorCard(null)}
      />
      <MerchantSuspensionDialog
        card={businessSettingsCard}
        open={Boolean(businessSettingsCard)}
        onChanged={load}
        onClose={() => setBusinessSettingsCard(null)}
      />

      <MerchantAccountDetailDrawer
        card={billingDetailCard}
        error={billingDetailError}
        loading={billingDetailLoading}
        onClose={closeBillingDetails}
        onOpenMerchantAdminPreview={openMerchantAdminPreview}
        onRetry={billingDetailCard ? () => void refreshBillingDetails(billingDetailCard) : undefined}
      />

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

      <Drawer open={Boolean(selectedShop)} title="店铺集中详情" onClose={closeShop}>
        {selectedShop ? <div className="space-y-5">
          <DetailGrid items={[{ label: "店铺 ID", value: selectedShop.id }, { label: "负责人账号", value: selectedShop.ownerEmail ?? "未绑定" }, { label: "状态", value: selectedShop.status }, { label: "电话", value: selectedShop.phone ?? "未设置" }, { label: "推荐", value: selectedShop.isRecommended ? "是" : "否" }, { label: "创建时间", value: selectedShop.createdAt }]} />
          {(["name", "city", "address"] as const).map((field) => <label className="block" key={field}><span className="mb-2 block text-sm font-black">{field}</span><input className={inputClassName} onChange={(event) => setShopDraft((current) => ({ ...current, [field]: event.target.value }))} value={shopDraft[field]} /></label>)}
          <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={saveShop}>保存资料</Button>{selectedShop.status !== "published" ? <Button disabled={saving} onClick={() => void mutate(async () => setSelectedShop(await backofficeRealDataApi.approveShop(selectedShop.id)))} variant="secondary">审核通过</Button> : null}<Button disabled={saving} onClick={() => void mutate(async () => { await backofficeRealDataApi.deleteShop(selectedShop.id); setSelectedShop(null); })} variant="danger">软删除</Button></div>
        </div> : null}
      </Drawer>

      {serviceDetailDrawer}
    </AdminLayout>
  );
}
