import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { CustomerEntitySyncEditor, StoreEntitySyncEditor, TechnicianEntitySyncEditor } from "../../components/admin/EntitySyncEditor";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { Tabs } from "../../components/ui/Tabs";
import { inventoryItems, merchants, orders, reviews, settlements } from "../../data/mock";
import { statusLabel, yen } from "../../lib/utils";
import { CustomerMembershipBadge } from "../../shared/profile-card";
import { useEntityStore } from "../../state/entityStore";
import type { Customer, InventoryItem, Merchant, Order, Review, Settlement, Store, Technician } from "../../types/domain";
import { DataBigScreenPage } from "./DataBigScreenPage";

type DataTab = "订单数据" | "客户数据" | "员工/技师数据" | "门店数据" | "商家数据" | "库存数据" | "评价数据" | "结算数据";
type AnyRow = Order | Customer | Technician | Store | Merchant | InventoryItem | Review | Settlement;

const tabs: DataTab[] = ["订单数据", "客户数据", "员工/技师数据", "门店数据", "商家数据", "库存数据", "评价数据", "结算数据"];

function isCustomerRow(row: AnyRow): row is Customer {
  return "memberLevel" in row && "churnRisk" in row && "ltv" in row;
}

function isTechnicianRow(row: AnyRow): row is Technician {
  return "acceptRate" in row && "serviceAreas" in row && "storeId" in row;
}

function isStoreRow(row: AnyRow): row is Store {
  return "openStatus" in row && "merchantId" in row && "businessHours" in row;
}

export function DataCenterPage() {
  const [searchParams] = useSearchParams();
  const module = searchParams.get("module");

  if (module === "big-screen" || module === "charts" || module === "fullscreen-charts") {
    return <DataBigScreenPage backLabel="返回数据中心" backTo="/admin/data" />;
  }

  if (module === "cities") {
    return <Navigate replace to="/admin/cities" />;
  }

  return <DataCenterTablePage />;
}

function DataCenterTablePage() {
  const { customers, stores, technicians, revision: entityRevision } = useEntityStore();
  const [active, setActive] = useState<DataTab>("订单数据");
  const [selected, setSelected] = useState<AnyRow | null>(null);

  const config = useMemo(() => {
    if (active === "订单数据") {
      const getCustomerDisplayName = (order: Order) => {
        const customer = customers.find((item) => item.id === order.customerId);
        return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? order.customerName;
      };
      return {
        rows: orders,
        columns: [
          { key: "orderNo", title: "订单编号", render: (row: Order) => row.orderNo },
          { key: "customer", title: "客户", render: (row: Order) => getCustomerDisplayName(row) },
          { key: "item", title: "服务", render: (row: Order) => row.itemName },
          { key: "status", title: "状态", render: (row: Order) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
          { key: "amount", title: "金额", render: (row: Order) => yen(row.amount) }
        ] as Column<Order>[]
      };
    }
    if (active === "客户数据") {
      return {
        rows: customers,
        columns: [
          { key: "name", title: "客户", render: (row: Customer) => row.nickname ? `${row.nickname} / ${row.name}` : row.name },
          {
            key: "level",
            title: "等级",
            render: (row: Customer) => (
              <CustomerMembershipBadge
                className="h-9 w-9"
                fallbackClassName="text-xs font-black text-ink/60"
                imageClassName="h-9 w-9"
                level={row.memberLevel}
              />
            )
          },
          { key: "ltv", title: "LTV", render: (row: Customer) => yen(row.ltv) },
          { key: "orders", title: "订单数", render: (row: Customer) => row.orderCount },
          { key: "risk", title: "流失风险", render: (row: Customer) => <Badge tone={row.churnRisk === "high" ? "red" : "green"}>{row.churnRisk}</Badge> }
        ] as Column<Customer>[]
      };
    }
    if (active === "员工/技师数据") {
      return {
        rows: technicians,
        columns: [
          { key: "name", title: "姓名", render: (row: Technician) => row.nickname ? `${row.nickname} / ${row.name}` : row.name },
          { key: "status", title: "状态", render: (row: Technician) => <Badge tone={row.status === "available" ? "green" : "yellow"}>{row.status}</Badge> },
          { key: "rating", title: "评分", render: (row: Technician) => row.rating },
          { key: "income", title: "收入", render: (row: Technician) => yen(row.income) },
          { key: "accept", title: "接单率", render: (row: Technician) => `${row.acceptRate}%` }
        ] as Column<Technician>[]
      };
    }
    if (active === "门店数据") {
      return {
        rows: stores,
        columns: [
          { key: "name", title: "店铺", render: (row: Store) => row.name },
          { key: "area", title: "区域", render: (row: Store) => row.area },
          { key: "rating", title: "评分", render: (row: Store) => row.rating },
          { key: "price", title: "价格", render: (row: Store) => row.priceLabel },
          { key: "status", title: "状态", render: (row: Store) => <Badge tone={row.openStatus === "open" ? "green" : "yellow"}>{row.openStatus}</Badge> }
        ] as Column<Store>[]
      };
    }
    if (active === "商家数据") {
      return {
        rows: merchants,
        columns: [
          { key: "name", title: "商家", render: (row: Merchant) => row.name },
          { key: "city", title: "城市", render: (row: Merchant) => row.city },
          { key: "categories", title: "类目", render: (row: Merchant) => row.categories.join("、") },
          { key: "commission", title: "佣金", render: (row: Merchant) => `${row.commissionRate}%` },
          { key: "status", title: "状态", render: (row: Merchant) => <Badge tone={row.status === "pending" ? "yellow" : "green"}>{row.status}</Badge> }
        ] as Column<Merchant>[]
      };
    }
    if (active === "库存数据") {
      return {
        rows: inventoryItems,
        columns: [
          { key: "name", title: "物料", render: (row: InventoryItem) => row.name },
          { key: "store", title: "门店", render: (row: InventoryItem) => row.storeName },
          { key: "stock", title: "库存", render: (row: InventoryItem) => `${row.stock}${row.unit}` },
          { key: "warning", title: "预警线", render: (row: InventoryItem) => `${row.warningLine}${row.unit}` },
          { key: "status", title: "状态", render: (row: InventoryItem) => <Badge tone={row.stock < row.warningLine ? "red" : "green"}>{row.stock < row.warningLine ? "预警" : "正常"}</Badge> }
        ] as Column<InventoryItem>[]
      };
    }
    if (active === "评价数据") {
      const getCustomerDisplayName = (name: string) => {
        const customer = customers.find((item) => item.name === name || item.nickname === name);
        return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? name;
      };
      const getTargetDisplayName = (name: string) => {
        const technician = technicians.find((item) => item.name === name || item.nickname === name);
        return technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? name;
      };
      return {
        rows: reviews,
        columns: [
          { key: "customer", title: "客户", render: (row: Review) => getCustomerDisplayName(row.customerName) },
          { key: "target", title: "对象", render: (row: Review) => getTargetDisplayName(row.targetName) },
          { key: "rating", title: "评分", render: (row: Review) => row.rating },
          { key: "tone", title: "类型", render: (row: Review) => <Badge tone={row.tone === "negative" ? "red" : "green"}>{row.tone}</Badge> },
          { key: "replied", title: "回复", render: (row: Review) => (row.replied ? "已回复" : "未回复") }
        ] as Column<Review>[]
      };
    }
    return {
      rows: settlements,
      columns: [
        { key: "merchant", title: "商家", render: (row: Settlement) => row.merchantName },
        { key: "period", title: "周期", render: (row: Settlement) => row.period },
        { key: "gross", title: "流水", render: (row: Settlement) => yen(row.grossAmount) },
        { key: "payable", title: "应结", render: (row: Settlement) => yen(row.payableAmount) },
        { key: "status", title: "状态", render: (row: Settlement) => <Badge tone="yellow">{row.status}</Badge> }
      ] as Column<Settlement>[]
    };
  }, [active, customers, entityRevision, stores, technicians]);

  return (
    <AdminLayout>
      <ModuleShell
        title="数据管理中心"
        description="订单、客户、员工、门店、商家、库存、评价、结算统一表格管理，支持搜索、筛选、排序、分页、导出和批量操作。"
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button to="/admin/data?module=big-screen" variant="dark">全屏图表</Button>
            <Button>新建数据</Button>
          </div>
        )}
      >
        <Tabs active={active} items={tabs} onChange={(item) => setActive(item as DataTab)} />
        <div className="mt-4">
          <FilterBar
            filters={[
              { label: "城市", options: [{ label: "东京", value: "tokyo" }, { label: "大阪", value: "osaka" }] },
              { label: "状态", options: [{ label: "启用", value: "active" }, { label: "待审核", value: "pending" }] },
              { label: "时间", options: [{ label: "今日", value: "today" }, { label: "近30天", value: "30d" }] }
            ]}
          />
        </div>
        <div className="mt-4">
          <DataTable rows={config.rows as AnyRow[]} columns={config.columns as Column<AnyRow>[]} onView={setSelected} />
        </div>
      </ModuleShell>

      <Drawer open={Boolean(selected)} title={`${active}详情`} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            {isCustomerRow(selected) ? <CustomerEntitySyncEditor key={selected.id} customer={selected} /> : null}
            {isTechnicianRow(selected) ? <TechnicianEntitySyncEditor key={selected.id} technician={selected} /> : null}
            {isStoreRow(selected) ? <StoreEntitySyncEditor key={selected.id} store={selected} /> : null}
            <DetailGrid
              items={Object.entries(selected)
                .slice(0, 12)
                .map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join("、") : String(value) }))}
            />
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled variant="secondary">
            {selected && (isCustomerRow(selected) || isTechnicianRow(selected) || isStoreRow(selected)) ? "使用上方表单保存并同步" : "当前记录为只读 mock 数据"}
          </Button>
          <Button variant="secondary">导出记录</Button>
        </div>
      </Drawer>
    </AdminLayout>
  );
}
