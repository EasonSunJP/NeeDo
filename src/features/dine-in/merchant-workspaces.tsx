import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { cn, yen } from "../../lib/utils";
import {
  DineInCashierCard,
  DineInFacilityCard,
  DineInItemQueueCard,
  DineInMenuItemCard,
  DineInMetricGrid,
  DineInOrderCard,
  DineInStatusPill,
  ProductionAreaBadge,
  buildOrderSummary,
  getFacilityTone,
  getOrderTone
} from "./components";
import {
  dineInMenuKindLabels,
  dineInOrderItemStatusLabels,
  dineInOrderStatusLabels,
  facilityStatusLabels,
  facilityTypeLabels,
  paymentStatusLabels,
  staffPresenceStatusLabels
} from "./labels";
import {
  getDineInOrderItems,
  getDineInSessionBillTotal,
  getMenuItemMaximumOrderQuantity,
  getMenuItemMinimumOrderQuantity,
  getMenuItemTaxIncludedPriceJpy,
  isMenuItemSpecialOfferActive,
  useDineInStore
} from "./store";
import type { DineInMenuKind, DineInMenuItem, DineInOrder, DineInOrderItem, FacilityArea, FacilityUnit, MenuCategory, MenuItemRestrictionFlag, ProductionArea } from "./types";

type MerchantDineOrderView = "orders" | "kds" | "serve" | "cashier";

const dineOrderViewTabs: Array<{ value: MerchantDineOrderView; label: string; path: string }> = [
  { value: "orders", label: "点单", path: "/merchant/dine/orders" },
  { value: "kds", label: "KDS", path: "/merchant/dine/kds" },
  { value: "serve", label: "上菜", path: "/merchant/dine/serve" },
  { value: "cashier", label: "收银", path: "/merchant/dine/cashier" }
];

function SectionPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-line bg-white p-4 shadow-panel", className)}>{children}</section>;
}

function DineInWorkspaceHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">DINE_IN</p>
        <h1 className="mt-1 text-2xl font-black">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/52">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

function getFacilityByOrder(facilities: FacilityUnit[], order: DineInOrder) {
  return facilities.find((facility) => facility.id === order.facilityUnitId);
}

function getOrderMetrics(orders: DineInOrder[]) {
  return {
    todayNew: orders.filter((order) => order.status === "PENDING").length,
    preparing: orders.filter((order) => order.status.includes("PREPARING") || order.status === "ACCEPTED").length,
    ready: orders.filter((order) => order.status.includes("READY")).length,
    checkout: orders.filter((order) => order.status === "CHECKOUT_REQUESTED").length,
    unpaid: orders.filter((order) => !["PAID", "COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status)).reduce((sum, order) => sum + order.totalJpy, 0),
    alerts: orders.reduce((sum, order) => sum + order.alertFlags.length, 0)
  };
}

function DineOrderTabs({ activeView, admin = false }: { activeView: MerchantDineOrderView; admin?: boolean }) {
  return (
    <div className="scrollbar-none flex items-center gap-2 overflow-x-auto">
      {dineOrderViewTabs.map((tab) => {
        const to = admin ? tab.path.replace("/merchant/dine", "/merchant-admin/dine") : tab.path;

        return (
          <Link
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-black transition",
              activeView === tab.value ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/58 hover:border-moss"
            )}
            key={tab.value}
            to={to}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function DineOrderWorkspace({
  activeView = "orders",
  admin = false,
  hideTopIntro = false
}: {
  activeView?: MerchantDineOrderView;
  admin?: boolean;
  hideTopIntro?: boolean;
}) {
  const navigate = useNavigate();
  const { state, actions } = useDineInStore();
  const [filter, setFilter] = useState<"all" | "TABLE" | "ROOM" | "BED" | "PENDING" | "PREPARING" | "CHECKOUT_REQUESTED" | "PAID">("all");
  const [selectedOrder, setSelectedOrder] = useState<DineInOrder | null>(null);
  const metrics = getOrderMetrics(state.orders);
  const visibleOrders = useMemo(
    () =>
      state.orders.filter((order) => {
        const facility = getFacilityByOrder(state.facilityUnits, order);

        if (filter === "all") {
          return true;
        }

        if (filter === "TABLE" || filter === "ROOM" || filter === "BED") {
          return facility?.type === filter;
        }

        if (filter === "PREPARING") {
          return order.status.includes("PREPARING") || order.status === "ACCEPTED";
        }

        return order.status === filter;
      }),
    [filter, state.facilityUnits, state.orders]
  );
  const productionItems = useMemo(
    () => state.orderItems.filter((item) => ["CONFIRMED", "PREPARING", "READY"].includes(item.status)),
    [state.orderItems]
  );
  const kitchenItems = productionItems.filter((item) => item.productionArea === "KITCHEN" || item.productionArea === "BAR");
  const serveItems = productionItems.filter((item) => item.status === "READY");
  const cashierOrders = state.orders.filter((order) => ["CHECKOUT_REQUESTED", "PAID"].includes(order.status));
  const isTableLayout = admin;

  const findOrder = (item: DineInOrderItem) => state.orders.find((order) => order.id === item.orderId);
  const findFacility = (order?: DineInOrder) => order ? getFacilityByOrder(state.facilityUnits, order) : undefined;

  return (
    <div className="space-y-4">
      {!hideTopIntro ? (
        <DineInWorkspaceHeader
          actions={<Button onClick={() => actions.reset()} size="sm" variant="secondary">重置演示数据</Button>}
          subtitle="店内扫码产生的 DINE_IN 订单独立于原 Booking / Request，接单、出品、上菜和收款都在这里闭环。"
          title="点单 / オーダー"
        />
      ) : null}

      <DineOrderTabs activeView={activeView} admin={admin} />

      <DineInMetricGrid
        items={[
          ["今日新单", `${metrics.todayNew} 单`],
          ["制作中", `${metrics.preparing} 单`],
          ["待上菜", `${metrics.ready} 单`],
          ["待结账", `${metrics.checkout} 单`],
          ["未收款", yen(metrics.unpaid)],
          ["异常提醒", `${metrics.alerts} 件`]
        ]}
      />

      {activeView === "orders" ? (
        <>
          <div className="scrollbar-none flex items-center gap-2 overflow-x-auto">
            {[
              ["all", "全部"],
              ["TABLE", "桌台"],
              ["ROOM", "包厢"],
              ["BED", "床位"],
              ["PENDING", "未接单"],
              ["PREPARING", "制作中"],
              ["CHECKOUT_REQUESTED", "待结账"],
              ["PAID", "已付款"]
            ].map(([value, label]) => (
              <Button
                className={filter === value ? "" : "bg-white text-ink"}
                key={value}
                onClick={() => setFilter(value as typeof filter)}
                size="sm"
                variant={filter === value ? "primary" : "secondary"}
              >
                {label}
              </Button>
            ))}
          </div>

          {isTableLayout ? (
            <DataTable<DineInOrder>
              columns={[
                { key: "orderNo", title: "订单号", render: (order) => order.orderNo },
                { key: "facility", title: "位置", render: (order) => getFacilityByOrder(state.facilityUnits, order)?.label ?? order.facilityUnitId },
                { key: "guest", title: "用户", render: (order) => order.guestLabel },
                { key: "summary", title: "商品摘要", render: (order) => buildOrderSummary(state, order) },
                { key: "status", title: "状态", render: (order) => <Badge tone="yellow">{dineInOrderStatusLabels[order.status]}</Badge> },
                { key: "amount", title: "金额", render: (order) => yen(order.totalJpy) }
              ]}
              onView={setSelectedOrder}
              rows={visibleOrders}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleOrders.map((order) => (
                <DineInOrderCard
                  facility={getFacilityByOrder(state.facilityUnits, order)}
                  items={getDineInOrderItems(state, order.id)}
                  key={order.id}
                  onAccept={() => actions.updateOrderStatus(order.id, "ACCEPTED")}
                  onCheckout={() => actions.requestCheckout(order.sessionId, "CASH")}
                  onView={() => admin ? setSelectedOrder(order) : navigate(`/merchant/dine/orders/${order.id}`)}
                  order={order}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {activeView === "kds" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {kitchenItems.map((item) => {
            const order = findOrder(item);

            if (!order) {
              return null;
            }

            return (
              <DineInItemQueueCard
                facility={findFacility(order)}
                item={item}
                key={item.id}
                onPreparing={() => actions.updateItemStatus(item.id, "PREPARING")}
                onReady={() => actions.updateItemStatus(item.id, "READY")}
                onServed={() => actions.updateItemStatus(item.id, "SERVED")}
                order={order}
              />
            );
          })}
        </div>
      ) : null}

      {activeView === "serve" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {serveItems.map((item) => {
            const order = findOrder(item);

            if (!order) {
              return null;
            }

            return (
              <DineInItemQueueCard
                facility={findFacility(order)}
                item={item}
                key={item.id}
                onServed={() => actions.updateItemStatus(item.id, "SERVED")}
                order={order}
              />
            );
          })}
        </div>
      ) : null}

      {activeView === "cashier" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cashierOrders.map((order) => {
            const payment = state.payments.find((item) => item.sessionId === order.sessionId);

            return (
              <DineInCashierCard
                facility={findFacility(order)}
                key={order.id}
                onConfirm={payment ? () => actions.confirmPayment(payment.id, payment.method, payment.posReference) : undefined}
                order={order}
                payment={payment}
              />
            );
          })}
        </div>
      ) : null}

      <Drawer onClose={() => setSelectedOrder(null)} open={Boolean(selectedOrder)} title="点单详情">
        {selectedOrder ? (
          <DineOrderDetailContent
            order={selectedOrder}
            onAccept={() => actions.updateOrderStatus(selectedOrder.id, "ACCEPTED")}
            onCheckout={() => actions.requestCheckout(selectedOrder.sessionId, "CASH")}
            state={state}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

export function DineOrderDetailWorkspace({ orderId }: { orderId?: string }) {
  const { state, actions } = useDineInStore();
  const order = state.orders.find((item) => item.id === orderId) ?? state.orders[0];

  if (!order) {
    return (
      <SectionPanel>
        <h1 className="text-xl font-black">点单不存在</h1>
      </SectionPanel>
    );
  }

  return (
    <DineOrderDetailContent
      order={order}
      onAccept={() => actions.updateOrderStatus(order.id, "ACCEPTED")}
      onCheckout={() => actions.requestCheckout(order.sessionId, "CASH")}
      state={state}
    />
  );
}

function DineOrderDetailContent({
  order,
  onAccept,
  onCheckout,
  state
}: {
  order: DineInOrder;
  onAccept: () => void;
  onCheckout: () => void;
  state: ReturnType<typeof useDineInStore>["state"];
}) {
  const items = getDineInOrderItems(state, order.id);
  const facility = getFacilityByOrder(state.facilityUnits, order);

  return (
    <div className="space-y-4">
      <SectionPanel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-ink/35">{order.orderNo}</p>
            <h2 className="mt-1 text-2xl font-black">{facility?.label ?? order.facilityUnitId}</h2>
            <p className="mt-2 text-sm text-ink/52">{order.guestLabel} · 担当 {order.assignedStaffId ?? "未分配"}</p>
          </div>
          <DineInStatusPill tone={getOrderTone(order.status)}>{dineInOrderStatusLabels[order.status]}</DineInStatusPill>
        </div>
        <DineInMetricGrid
          items={[
            ["商品小计", yen(order.subtotalJpy)],
            ["服务费", yen(order.serviceFeeJpy)],
            ["设施费", yen(order.facilityFeeJpy)],
            ["应收", yen(order.totalJpy)]
          ]}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button disabled={order.status !== "PENDING"} onClick={onAccept}>接单</Button>
          <Button onClick={onCheckout} variant="secondary">发起结账</Button>
        </div>
      </SectionPanel>

      <div className="space-y-3">
        {items.map((item) => (
          <section className="rounded-lg border border-line bg-white p-4 shadow-panel" key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black">{item.nameSnapshot} x{item.quantity}</h3>
                <p className="mt-1 text-xs font-bold text-ink/45">{item.optionsSnapshot.join(" / ") || "无规格"}{item.note ? ` · ${item.note}` : ""}</p>
              </div>
              <ProductionAreaBadge value={item.productionArea} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <DineInStatusPill>{dineInOrderItemStatusLabels[item.status]}</DineInStatusPill>
              <strong>{yen(item.priceSnapshotJpy * item.quantity)}</strong>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const dineMenuKindTabs: Array<{ value: DineInMenuKind; label: string }> = [
  { value: "FOOD", label: "菜单" },
  { value: "DRINK", label: "酒单" },
  { value: "SERVICE", label: "服务单" }
];

const itemRestrictionOptions: Array<{ value: MenuItemRestrictionFlag; label: string }> = [
  { value: "ONLINE_RESERVATION_ONLY", label: "网上预约限定" },
  { value: "ADVANCE_RESERVATION_ONLY", label: "提前预约限定" },
  { value: "BIRTHDAY_ONLY", label: "生日限定" },
  { value: "IN_STORE_ONLY", label: "店内限定" },
  { value: "ALCOHOL", label: "酒精" },
  { value: "AGE_CHECK", label: "年龄确认" }
];

function getCategoryDisplayName(category: MenuCategory) {
  return category.name.zh || category.name.ja;
}

function readOptionalPositiveNumber(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value ? Number(value) : undefined;
}

export function DineMenuWorkspace({ admin = false, hideTopIntro = false }: { admin?: boolean; hideTopIntro?: boolean }) {
  const { state, actions } = useDineInStore();
  const [activeMenuKind, setActiveMenuKind] = useState<DineInMenuKind>("FOOD");
  const [activeCategoryId, setActiveCategoryId] = useState<"all" | string>("all");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [creatingItemCategoryId, setCreatingItemCategoryId] = useState<string | null>(null);
  const [itemImageDraft, setItemImageDraft] = useState<string | null>(null);
  const activeMenus = useMemo(
    () => state.menus.filter((menu) => menu.active && menu.kind === activeMenuKind),
    [activeMenuKind, state.menus]
  );
  const activeMenuIds = useMemo(() => new Set(activeMenus.map((menu) => menu.id)), [activeMenus]);
  const activeCategories = useMemo(
    () =>
      state.menuCategories
        .filter((category) => activeMenuIds.has(category.menuId))
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [activeMenuIds, state.menuCategories]
  );
  const visibleItems = useMemo(
    () =>
      state.menuItems.filter((item) =>
        activeMenuIds.has(item.menuId) &&
        (activeCategoryId === "all" || item.categoryId === activeCategoryId)
      ),
    [activeCategoryId, activeMenuIds, state.menuItems]
  );
  const editingItem = state.menuItems.find((item) => item.id === editingItemId) ?? null;
  const selectedCategory = activeCategoryId === "all" ? null : activeCategories.find((category) => category.id === activeCategoryId) ?? null;
  const creatingCategory = creatingItemCategoryId ? activeCategories.find((category) => category.id === creatingItemCategoryId) ?? null : null;
  const itemFormOpen = Boolean(editingItem || creatingCategory);
  const activeMenu = activeMenus[0];
  const activeCount = state.menuItems.filter((item) => item.active && item.stockStatus !== "SOLD_OUT").length;
  const soldOutCount = state.menuItems.filter((item) => item.stockStatus === "SOLD_OUT").length;
  const fieldClass = "mt-2 h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-bold text-ink outline-none focus:border-moss";
  const textAreaClass = "mt-2 min-h-24 w-full rounded-2xl border border-line bg-white px-3 py-3 text-sm font-bold leading-6 text-ink outline-none focus:border-moss";
  const fallbackItemImage = visibleItems[0]?.imageUrl ?? state.menuItems[0]?.imageUrl ?? "";

  const handleTabChange = (kind: DineInMenuKind) => {
    setActiveMenuKind(kind);
    setActiveCategoryId("all");
    setCategoryCreatorOpen(false);
  };

  const handleSaveCategory = (category: MenuCategory) => {
    const nextName = (categoryDrafts[category.id] ?? getCategoryDisplayName(category)).trim();

    if (!nextName) {
      return;
    }

    actions.updateMenuCategory(category.id, { name: { zh: nextName, ja: nextName, en: nextName, ko: nextName } });
  };

  const handleCreateCategory = () => {
    if (!activeMenu) {
      return;
    }

    const nextName = newCategoryName.trim();

    if (!nextName) {
      return;
    }

    const category = actions.createMenuCategory(activeMenu.id, nextName);
    setNewCategoryName("");
    setCategoryCreatorOpen(false);
    setActiveCategoryId(category.id);
  };

  const handleItemImageUpload = (file: File | null) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setItemImageDraft(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const openEditItem = (itemId: string) => {
    setCreatingItemCategoryId(null);
    setItemImageDraft(null);
    setEditingItemId(itemId);
  };

  const openCreateItem = (categoryId: string) => {
    setEditingItemId(null);
    setItemImageDraft(null);
    setCreatingItemCategoryId(categoryId);
  };

  const closeItemDrawer = () => {
    setEditingItemId(null);
    setCreatingItemCategoryId(null);
    setItemImageDraft(null);
  };

  const handleSaveItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingItem && !creatingCategory) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const defaultName = editingItem?.name.zh ?? "新单品";
    const defaultDescription = editingItem?.description.zh ?? "请输入单品介绍。";
    const basePriceJpy = Number(formData.get("basePriceJpy") ?? editingItem?.basePriceJpy ?? 1000);
    const nameZh = String(formData.get("nameZh") ?? defaultName).trim() || defaultName;
    const descriptionZh = String(formData.get("descriptionZh") ?? defaultDescription).trim() || defaultDescription;
    const specialLabel = String(formData.get("specialLabel") ?? editingItem?.specialOffer?.label ?? "特价").trim() || "特价";
    const categoryId = String(formData.get("categoryId") ?? editingItem?.categoryId ?? creatingCategory?.id);
    const stockStatus = String(formData.get("stockStatus") ?? editingItem?.stockStatus ?? "AVAILABLE") as DineInMenuItem["stockStatus"];
    const productionArea = String(formData.get("productionArea") ?? editingItem?.productionArea ?? "KITCHEN") as ProductionArea;
    const restrictionFlags = itemRestrictionOptions
      .filter((option) => formData.get(`restriction-${option.value}`) === "on")
      .map((option) => option.value);
    const input = {
      name: { zh: nameZh, ja: nameZh, en: nameZh, ko: nameZh },
      description: { zh: descriptionZh, ja: descriptionZh, en: descriptionZh, ko: descriptionZh },
      imageUrl: itemImageDraft ?? editingItem?.imageUrl ?? fallbackItemImage,
      categoryId,
      basePriceJpy,
      taxMode: "TAX_INCLUDED" as const,
      minimumOrderQuantity: Number(formData.get("minimumOrderQuantity") ?? (editingItem ? getMenuItemMinimumOrderQuantity(editingItem) : 1)),
      maximumPurchaseQuantity: readOptionalPositiveNumber(formData, "maximumPurchaseQuantity"),
      maximumPerOrderQuantity: readOptionalPositiveNumber(formData, "maximumPerOrderQuantity"),
      maximumPerPersonQuantity: readOptionalPositiveNumber(formData, "maximumPerPersonQuantity"),
      stockStatus,
      active: formData.get("active") === "on",
      productionArea,
      restrictionFlags,
      specialOffer: {
        active: formData.get("specialActive") === "on",
        priceJpy: Number(formData.get("specialPriceJpy") ?? editingItem?.specialOffer?.priceJpy ?? basePriceJpy),
        label: specialLabel
      }
    };

    if (editingItem) {
      actions.updateMenuItem(editingItem.id, input);
    } else {
      actions.createMenuItem({ ...input, categoryId });
      setActiveCategoryId(categoryId);
    }

    closeItemDrawer();
  };

  const itemFormCategory = editingItem
    ? activeCategories.find((category) => category.id === editingItem.categoryId) ?? selectedCategory ?? activeCategories[0]
    : creatingCategory;
  const itemFormImage = itemImageDraft ?? editingItem?.imageUrl ?? fallbackItemImage;
  const itemFormProductionArea: ProductionArea = editingItem?.productionArea ?? (activeMenuKind === "DRINK" ? "BAR" : activeMenuKind === "SERVICE" ? "CAST" : "KITCHEN");

  return (
    <div className="space-y-4">
      {!hideTopIntro ? (
        <DineInWorkspaceHeader
          subtitle="扫码菜单支持餐饮、酒水饮料、服务加购、分类、价格、库存和起售规则管理。"
          title="菜单 / メニュー"
        />
      ) : null}
      <DineInMetricGrid
        items={[
          ["菜单数", `${state.menus.filter((menu) => menu.active).length} 套`],
          ["单品", `${state.menuItems.length} 项`],
          ["可售", `${activeCount} 项`],
          ["售罄", `${soldOutCount} 项`]
        ]}
      />
      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        {dineMenuKindTabs.map((tab) => (
          <Button
            className={activeMenuKind === tab.value ? "" : "bg-white text-ink"}
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            size="sm"
            variant={activeMenuKind === tab.value ? "primary" : "secondary"}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <SectionPanel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black">{activeMenuKind === "FOOD" ? "饭菜分类" : `${dineInMenuKindLabels[activeMenuKind]}分类`}</h2>
            <p className="mt-1 text-xs font-bold text-ink/45">分类可修改、增减；单品会按当前插页和分类展示。</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="green">{activeCategories.length} 类</Badge>
            <Button
              aria-label="添加分类"
              className="h-10 w-10 px-0 text-lg"
              onClick={() => setCategoryCreatorOpen((open) => !open)}
              size="sm"
              variant={categoryCreatorOpen ? "primary" : "secondary"}
            >
              +
            </Button>
          </div>
        </div>
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          <Button
            className={activeCategoryId === "all" ? "" : "bg-white text-ink"}
            onClick={() => setActiveCategoryId("all")}
            size="sm"
            variant={activeCategoryId === "all" ? "primary" : "secondary"}
          >
            全部
          </Button>
          {activeCategories.map((category) => (
            <Button
              className={activeCategoryId === category.id ? "" : "bg-white text-ink"}
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              size="sm"
              variant={activeCategoryId === category.id ? "primary" : "secondary"}
            >
              {getCategoryDisplayName(category)}
            </Button>
          ))}
        </div>
        {categoryCreatorOpen ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-3">
            <label className="text-[11px] font-black text-ink/42">新增分类</label>
            <input
              className={fieldClass}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="例如：甜品"
              value={newCategoryName}
            />
            <Button className="mt-2 w-full" disabled={!newCategoryName.trim()} onClick={handleCreateCategory} size="sm">
              添加到{dineInMenuKindLabels[activeMenuKind]}
            </Button>
          </div>
        ) : null}
        {selectedCategory ? (
          <div className="rounded-lg border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-black text-ink/42">当前分类</p>
                <h3 className="mt-1 text-lg font-black">{getCategoryDisplayName(selectedCategory)}</h3>
              </div>
              <Button onClick={() => openCreateItem(selectedCategory.id)} size="sm" variant="dark">
                追加单品
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr,auto] md:items-end">
              <label className="block text-sm font-black">
                分类名称
                <input
                  className={fieldClass}
                  onChange={(event) => setCategoryDrafts((current) => ({ ...current, [selectedCategory.id]: event.target.value }))}
                  value={categoryDrafts[selectedCategory.id] ?? getCategoryDisplayName(selectedCategory)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2 md:w-72">
                <Button onClick={() => handleSaveCategory(selectedCategory)} size="sm" variant="secondary">保存分类</Button>
                <Button
                  disabled={activeCategories.length <= 1}
                  onClick={() => {
                    actions.deleteMenuCategory(selectedCategory.id);
                    setActiveCategoryId("all");
                  }}
                  size="sm"
                  variant="ghost"
                >
                  删除
                </Button>
              </div>
            </div>
          </div>
        ) : activeCategoryId === "all" ? (
          <div className="rounded-lg border border-line bg-paper p-4 text-sm font-bold text-ink/48">
            选择一个分类后，可以单独修改该分类名称并追加新的单品。
          </div>
        ) : null}
      </SectionPanel>
      {activeCategoryId === "all" ? null : (
        <SectionPanel className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-ink/42">当前分类单品</p>
            <h2 className="mt-1 text-lg font-black">{selectedCategory ? getCategoryDisplayName(selectedCategory) : "分类"}</h2>
          </div>
          {selectedCategory ? (
            <Button onClick={() => openCreateItem(selectedCategory.id)} size="sm">
              追加单品
            </Button>
          ) : null}
        </SectionPanel>
      )}
      {admin ? (
        <DataTable
          columns={[
            { key: "name", title: "单品", render: (item) => item.name.zh },
            {
              key: "price",
              title: "价格",
              render: (item) => (
                <span className="font-black">
                  {isMenuItemSpecialOfferActive(item) ? <span className="mr-1 text-ink/35 line-through">{yen(item.basePriceJpy)}</span> : null}
                  {yen(getMenuItemTaxIncludedPriceJpy(item))} <span className="text-[10px] text-ink/42">税入</span>
                </span>
              )
            },
            {
              key: "limit",
              title: "限制",
              render: (item) => [
                `${getMenuItemMinimumOrderQuantity(item)} 个起售`,
                getMenuItemMaximumOrderQuantity(item) ? `最多 ${getMenuItemMaximumOrderQuantity(item)} 个` : null
              ].filter(Boolean).join(" / ")
            },
            { key: "area", title: "制作区", render: (item) => <ProductionAreaBadge value={item.productionArea} /> },
            { key: "stock", title: "库存", render: (item) => <Badge tone={item.stockStatus === "SOLD_OUT" ? "red" : "green"}>{item.stockStatus}</Badge> },
            { key: "scope", title: "设施", render: (item) => item.facilityTypeScope?.map((type) => facilityTypeLabels[type]).join(" / ") ?? "全部" },
            { key: "action", title: "操作", render: (item) => <Button onClick={() => openEditItem(item.id)} size="sm" variant="dark">编辑</Button> }
          ]}
          pageSize={8}
          rows={visibleItems}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleItems.map((item) => (
            <DineInMenuItemCard
              item={item}
              key={item.id}
              onEdit={() => openEditItem(item.id)}
              onStockChange={(status) => actions.setMenuItemStockStatus(item.id, status)}
            />
          ))}
          {visibleItems.length === 0 ? (
            <section className="rounded-lg border border-line bg-white p-6 text-center text-sm font-bold text-ink/50 shadow-panel">当前分类暂无单品</section>
          ) : null}
        </div>
      )}
      <Drawer onClose={closeItemDrawer} open={itemFormOpen} title={editingItem ? "编辑单品" : "新增单品"}>
        {itemFormOpen && itemFormCategory ? (
          <form className="space-y-4" key={editingItem?.id ?? `new-${itemFormCategory.id}`} onSubmit={handleSaveItem}>
            <section className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-start gap-3">
                {itemFormImage ? (
                  <img alt={editingItem?.name.zh ?? "新增单品"} className="h-20 w-20 rounded-lg object-cover" src={itemFormImage} />
                ) : (
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-paper text-xs font-black text-ink/35">照片</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-ink/42">{dineInMenuKindLabels[activeMenuKind]} · {getCategoryDisplayName(itemFormCategory)}</p>
                  <h3 className="mt-1 truncate text-lg font-black">{editingItem?.name.zh ?? "追加新单品"}</h3>
                  <label className="mt-3 inline-flex cursor-pointer rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-black text-ink">
                    上传照片
                    <input accept="image/*" className="hidden" onChange={(event) => handleItemImageUpload(event.target.files?.[0] ?? null)} type="file" />
                  </label>
                </div>
              </div>
            </section>
            <label className="block text-sm font-black">
              名字
              <input className={fieldClass} defaultValue={editingItem?.name.zh ?? ""} name="nameZh" placeholder="请输入单品名字" />
            </label>
            <label className="block text-sm font-black">
              介绍
              <textarea className={textAreaClass} defaultValue={editingItem?.description.zh ?? ""} name="descriptionZh" placeholder="请输入单品介绍" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm font-black">
                价格（税入）
                <input className={fieldClass} defaultValue={editingItem?.basePriceJpy ?? 1000} min={1} name="basePriceJpy" type="number" />
              </label>
              <label className="block text-sm font-black">
                最低几个起售
                <input className={fieldClass} defaultValue={editingItem ? getMenuItemMinimumOrderQuantity(editingItem) : 1} min={1} name="minimumOrderQuantity" type="number" />
              </label>
              <label className="block text-sm font-black">
                最多只能买几个
                <input className={fieldClass} defaultValue={editingItem?.maximumPurchaseQuantity ?? ""} min={1} name="maximumPurchaseQuantity" placeholder="不填则不限" type="number" />
              </label>
              <label className="block text-sm font-black">
                一次性最多点几个
                <input className={fieldClass} defaultValue={editingItem?.maximumPerOrderQuantity ?? ""} min={1} name="maximumPerOrderQuantity" placeholder="不填则不限" type="number" />
              </label>
              <label className="block text-sm font-black">
                一人限定几个
                <input className={fieldClass} defaultValue={editingItem?.maximumPerPersonQuantity ?? ""} min={1} name="maximumPerPersonQuantity" placeholder="不填则不限" type="number" />
              </label>
              <label className="block text-sm font-black">
                分类
                <select className={fieldClass} defaultValue={editingItem?.categoryId ?? itemFormCategory.id} name="categoryId">
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>{getCategoryDisplayName(category)}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-black">
                制作区
                <select className={fieldClass} defaultValue={itemFormProductionArea} name="productionArea">
                  <option value="KITCHEN">厨房</option>
                  <option value="BAR">吧台</option>
                  <option value="FRONT">前台</option>
                  <option value="CAST">技师/服务</option>
                </select>
              </label>
              <label className="block text-sm font-black">
                库存
                <select className={fieldClass} defaultValue={editingItem?.stockStatus ?? "AVAILABLE"} name="stockStatus">
                  <option value="AVAILABLE">可售</option>
                  <option value="LIMITED">限量</option>
                  <option value="SOLD_OUT">售罄</option>
                </select>
              </label>
              <label className="mt-8 flex items-center gap-2 text-sm font-black">
                <input className="h-4 w-4 accent-moss" defaultChecked={editingItem?.active ?? true} name="active" type="checkbox" />
                上架显示
              </label>
            </div>
            <section className="rounded-lg border border-line bg-paper p-4">
              <h3 className="text-sm font-black">限定条件</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {itemRestrictionOptions.map((option) => (
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-black" key={option.value}>
                    <input
                      className="h-4 w-4 accent-moss"
                      defaultChecked={editingItem?.restrictionFlags?.includes(option.value) ?? false}
                      name={`restriction-${option.value}`}
                      type="checkbox"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-coral/20 bg-coral/5 p-4">
              <label className="flex items-center gap-2 text-sm font-black text-coral">
                <input className="h-4 w-4 accent-coral" defaultChecked={editingItem?.specialOffer?.active ?? false} name="specialActive" type="checkbox" />
                开启特价标签
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-black">
                  新价格
                  <input className={fieldClass} defaultValue={editingItem?.specialOffer?.priceJpy ?? editingItem?.basePriceJpy ?? 1000} min={1} name="specialPriceJpy" type="number" />
                </label>
                <label className="block text-sm font-black">
                  特效标签
                  <input className={fieldClass} defaultValue={editingItem?.specialOffer?.label ?? "特价"} name="specialLabel" />
                </label>
              </div>
            </section>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={closeItemDrawer} variant="secondary">取消</Button>
              <Button type="submit">{editingItem ? "保存单品" : "新增单品"}</Button>
            </div>
          </form>
        ) : null}
      </Drawer>
    </div>
  );
}

export function DineFloorWorkspace({ admin = false, hideTopIntro = false }: { admin?: boolean; hideTopIntro?: boolean }) {
  const { state, actions } = useDineInStore();
  const [areaId, setAreaId] = useState<"all" | string>("all");
  const areas: FacilityArea[] = state.facilityAreas.filter((area) => area.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const facilities = state.facilityUnits.filter((facility) => areaId === "all" || facility.areaId === areaId);
  const totalUnpaid = state.diningSessions.reduce((sum, session) => sum + getDineInSessionBillTotal(state, session.id), 0);
  const openCallCount = state.serviceCalls.filter((call) => call.status === "OPEN" || call.status === "ACKNOWLEDGED").length;

  const getFacilityTotal = (facility: FacilityUnit) => {
    const sessionId = facility.currentSessionId;

    return sessionId ? getDineInSessionBillTotal(state, sessionId) : 0;
  };

  const getFacilityCallCount = (facility: FacilityUnit) =>
    state.serviceCalls.filter((call) => call.facilityUnitId === facility.id && (call.status === "OPEN" || call.status === "ACKNOWLEDGED")).length;

  return (
    <div className="space-y-4">
      {!hideTopIntro ? (
        <DineInWorkspaceHeader
          subtitle="场控统一展示桌台、包厢、床位、吧台和担当人员状态，二维码管理也归在这里。"
          title="场控 / 店内"
        />
      ) : null}
      <DineInMetricGrid
        items={[
          ["设施", `${state.facilityUnits.length} 个`],
          ["使用中", `${state.facilityUnits.filter((unit) => !["AVAILABLE", "CLEANING", "BLOCKED"].includes(unit.status)).length} 个`],
          ["未收款", yen(totalUnpaid)],
          ["服务呼叫", `${openCallCount} 件`]
        ]}
      />
      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        <Button className={areaId === "all" ? "" : "bg-white text-ink"} onClick={() => setAreaId("all")} size="sm" variant={areaId === "all" ? "primary" : "secondary"}>
          全部区域
        </Button>
        {areas.map((area) => (
          <Button
            className={areaId === area.id ? "" : "bg-white text-ink"}
            key={area.id}
            onClick={() => setAreaId(area.id)}
            size="sm"
            variant={areaId === area.id ? "primary" : "secondary"}
          >
            {area.name}
          </Button>
        ))}
      </div>

      {admin ? (
        <DataTable
          columns={[
            { key: "label", title: "设施", render: (facility) => facility.label },
            { key: "type", title: "类型", render: (facility) => facilityTypeLabels[facility.type] },
            { key: "status", title: "状态", render: (facility) => <Badge tone="yellow">{facilityStatusLabels[facility.status]}</Badge> },
            { key: "amount", title: "消费", render: (facility) => yen(getFacilityTotal(facility)) },
            { key: "calls", title: "呼叫", render: (facility) => getFacilityCallCount(facility) }
          ]}
          rows={facilities}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {facilities.map((facility) => (
            <DineInFacilityCard
              facility={facility}
              key={facility.id}
              onBlock={() => actions.setFacilityStatus(facility.id, "BLOCKED")}
              onClean={() => actions.setFacilityStatus(facility.id, "CLEANING")}
              openCallCount={getFacilityCallCount(facility)}
              sessionTotal={getFacilityTotal(facility)}
            />
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.1fr,0.9fr]">
        <SectionPanel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black">服务员 / 员工实时状态</h2>
            <Badge tone="green">实时</Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.staffPresence.map((staff) => (
              <div className="rounded-lg bg-paper px-3 py-3" key={staff.id}>
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{staff.staffName}</strong>
                  <DineInStatusPill tone={staff.status === "AVAILABLE" ? "green" : staff.status === "BUSY" ? "yellow" : "neutral"}>
                    {staffPresenceStatusLabels[staff.status]}
                  </DineInStatusPill>
                </div>
                <p className="mt-1 text-xs font-bold text-ink/45">{staff.roleName} · 任务 {staff.currentTaskCount} · 呼叫 {staff.openCallCount}</p>
              </div>
            ))}
          </div>
        </SectionPanel>
        <SectionPanel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black">呼叫处理</h2>
            <Badge tone="yellow">{openCallCount} 件</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {state.serviceCalls.map((call) => {
              const facility = state.facilityUnits.find((unit) => unit.id === call.facilityUnitId);

              return (
                <div className="rounded-lg bg-paper px-3 py-3" key={call.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm">{facility?.label ?? call.facilityUnitId}</strong>
                    <DineInStatusPill tone={call.status === "OPEN" ? "red" : "yellow"}>{call.status}</DineInStatusPill>
                  </div>
                  <p className="mt-1 text-xs font-bold text-ink/45">{call.note ?? call.type}</p>
                </div>
              );
            })}
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}
