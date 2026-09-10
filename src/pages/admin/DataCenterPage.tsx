import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import {
  backofficeRealDataApi,
  type BackofficeCustomerPayload,
  type BackofficeFinanceSettlementPayload,
  type BackofficeOrderPayload,
  type BackofficeScheduleSlotPayload,
  type BackofficeServicePayload,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload,
  type PaginatedApiPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { yen } from "../../lib/utils";

type DataTab = "订单数据" | "客户数据" | "员工/技师数据" | "门店数据" | "服务数据" | "排班数据" | "库存数据" | "评价数据" | "结算数据";
type SupportedDataTab = Exclude<DataTab, "库存数据" | "评价数据">;
type DataCenterRow =
  | BackofficeOrderPayload
  | BackofficeCustomerPayload
  | BackofficeTechnicianPayload
  | BackofficeShopPayload
  | BackofficeServicePayload
  | BackofficeScheduleSlotPayload
  | BackofficeFinanceSettlementPayload;

const tabs: DataTab[] = ["订单数据", "客户数据", "员工/技师数据", "门店数据", "服务数据", "排班数据", "库存数据", "评价数据", "结算数据"];
const unsupportedTabs = new Set<DataTab>(["库存数据", "评价数据"]);
const retiredDashboardModules = new Set(["big-screen", "charts", "fullscreen-charts"]);
const pageSize = 20;

function describeDataCenterError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有读取数据中心的权限";
    if (error.status >= 500) return "数据中心服务暂时不可用，请稍后重试";
  }
  return "数据加载失败，请检查网络后重试";
}

function isSupportedTab(tab: DataTab): tab is SupportedDataTab {
  return !unsupportedTabs.has(tab);
}

function dataOwnerRoute(tab: SupportedDataTab) {
  if (tab === "订单数据") return "/admin/orders";
  if (tab === "客户数据") return "/admin/users";
  if (tab === "员工/技师数据") return "/admin/technicians";
  if (tab === "门店数据" || tab === "服务数据") return "/admin/merchants";
  if (tab === "结算数据") return "/admin/finance";
  return "/admin";
}

function statusBadge(status: string) {
  const positive = ["published", "available", "booked", "paid", "settled", "completed"].includes(status);
  return <Badge tone={positive ? "green" : "yellow"}>{status}</Badge>;
}

function formatOrderDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(value));
}

function columnsFor(tab: SupportedDataTab, onSelect: (row: DataCenterRow) => void): Column<DataCenterRow>[] {
  const detailColumn: Column<DataCenterRow> = {
    key: "detail",
    title: "详情",
    render: (row) => <Button size="sm" variant="secondary" onClick={() => onSelect(row)}>查看</Button>
  };

  if (tab === "订单数据") {
    const orderDetailColumn: Column<DataCenterRow> = {
      key: "detail",
      title: "详情",
      render: (row) => {
        const order = row as BackofficeOrderPayload;
        return <Button size="sm" variant="secondary" to={`/admin/orders?orderId=${order.id}`}>查看统一详情</Button>;
      }
    };
    return [
      { key: "order", title: "订单编号", render: (row) => (row as BackofficeOrderPayload).orderNo },
      { key: "customer", title: "客户", render: (row) => (row as BackofficeOrderPayload).customerName },
      { key: "service", title: "服务 / 店铺", render: (row) => `${(row as BackofficeOrderPayload).serviceName} / ${(row as BackofficeOrderPayload).shopName}` },
      { key: "amount", title: "金额", render: (row) => yen((row as BackofficeOrderPayload).priceAmount) },
      { key: "created", title: "下单时间", render: (row) => formatOrderDateTime((row as BackofficeOrderPayload).createdAt) },
      { key: "appointment", title: "预约时间", render: (row) => formatOrderDateTime((row as BackofficeOrderPayload).startsAt) },
      { key: "status", title: "状态", render: (row) => statusBadge((row as BackofficeOrderPayload).status) },
      orderDetailColumn
    ];
  }
  if (tab === "客户数据") {
    return [
      { key: "name", title: "客户", render: (row) => (row as BackofficeCustomerPayload).displayName },
      { key: "email", title: "邮箱", render: (row) => (row as BackofficeCustomerPayload).email },
      { key: "city", title: "城市", render: (row) => (row as BackofficeCustomerPayload).city ?? "未设置" },
      { key: "level", title: "会员等级", render: (row) => (row as BackofficeCustomerPayload).membershipLevel },
      { key: "bookings", title: "预约数", render: (row) => (row as BackofficeCustomerPayload).bookingCount },
      detailColumn
    ];
  }
  if (tab === "员工/技师数据") {
    return [
      { key: "name", title: "技师", render: (row) => (row as BackofficeTechnicianPayload).displayName },
      { key: "email", title: "邮箱", render: (row) => (row as BackofficeTechnicianPayload).email },
      { key: "shop", title: "所属店铺", render: (row) => (row as BackofficeTechnicianPayload).shopName ?? "未绑定" },
      { key: "city", title: "城市", render: (row) => (row as BackofficeTechnicianPayload).city },
      { key: "status", title: "状态", render: (row) => statusBadge((row as BackofficeTechnicianPayload).status) },
      detailColumn
    ];
  }
  if (tab === "门店数据") {
    return [
      { key: "name", title: "店铺", render: (row) => (row as BackofficeShopPayload).name },
      { key: "owner", title: "店主账号", render: (row) => (row as BackofficeShopPayload).ownerEmail ?? "未绑定" },
      { key: "city", title: "城市", render: (row) => (row as BackofficeShopPayload).city },
      { key: "address", title: "地址", render: (row) => (row as BackofficeShopPayload).address },
      { key: "status", title: "状态", render: (row) => statusBadge((row as BackofficeShopPayload).status) },
      detailColumn
    ];
  }
  if (tab === "服务数据") {
    return [
      { key: "name", title: "服务", render: (row) => (row as BackofficeServicePayload).name },
      { key: "shop", title: "店铺", render: (row) => (row as BackofficeServicePayload).shopName },
      { key: "category", title: "分类", render: (row) => (row as BackofficeServicePayload).categoryName },
      { key: "price", title: "价格", render: (row) => yen((row as BackofficeServicePayload).priceAmount) },
      { key: "status", title: "状态", render: (row) => statusBadge((row as BackofficeServicePayload).status) },
      detailColumn
    ];
  }
  if (tab === "排班数据") {
    return [
      { key: "service", title: "服务", render: (row) => (row as BackofficeScheduleSlotPayload).serviceName },
      { key: "shop", title: "店铺", render: (row) => (row as BackofficeScheduleSlotPayload).shopName },
      { key: "technician", title: "技师", render: (row) => (row as BackofficeScheduleSlotPayload).technicianName ?? "店铺统筹" },
      { key: "time", title: "开始时间", render: (row) => new Date((row as BackofficeScheduleSlotPayload).startsAt).toLocaleString("ja-JP") },
      { key: "capacity", title: "占用 / 容量", render: (row) => `${(row as BackofficeScheduleSlotPayload).bookedCount}/${(row as BackofficeScheduleSlotPayload).capacity}` },
      detailColumn
    ];
  }
  return [
    { key: "order", title: "订单", render: (row) => (row as BackofficeFinanceSettlementPayload).orderNo },
    { key: "shop", title: "店铺", render: (row) => (row as BackofficeFinanceSettlementPayload).shopName },
    { key: "gmv", title: "服务 GMV", render: (row) => yen((row as BackofficeFinanceSettlementPayload).estimatedServiceGmvJpy) },
    { key: "income", title: "平台 NDP 收入", render: (row) => (row as BackofficeFinanceSettlementPayload).platformNdpRevenue.toLocaleString("ja-JP") },
    { key: "status", title: "状态", render: (row) => statusBadge((row as BackofficeFinanceSettlementPayload).status) },
    detailColumn
  ];
}

function readable(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "未设置" : String(value);
}

function detailItemsFor(tab: SupportedDataTab, selected: DataCenterRow) {
  if (tab === "客户数据") {
    const customer = selected as BackofficeCustomerPayload;
    return [
      { label: "客户名称", value: customer.displayName },
      { label: "邮箱", value: customer.email },
      { label: "城市", value: readable(customer.city) },
      { label: "会员等级", value: customer.membershipLevel },
      { label: "预约数量", value: customer.bookingCount },
      { label: "资料可见性", value: customer.isPublic ? "公开" : "非公开" },
      { label: "创建时间", value: formatOrderDateTime(customer.createdAt) }
    ];
  }
  if (tab === "员工/技师数据") {
    const technician = selected as BackofficeTechnicianPayload;
    return [
      { label: "NeeDoID", value: technician.needoId },
      { label: "技师名称", value: technician.displayName },
      { label: "邮箱", value: technician.email },
      { label: "所属店铺", value: readable(technician.shopName) },
      { label: "城市", value: technician.city },
      { label: "服务区域", value: readable(technician.serviceArea) },
      { label: "雇佣类型", value: technician.employmentType },
      { label: "状态", value: statusBadge(technician.status) }
    ];
  }
  if (tab === "门店数据") {
    const shop = selected as BackofficeShopPayload;
    return [
      { label: "门店名称", value: shop.name },
      { label: "店主账号", value: readable(shop.ownerEmail) },
      { label: "城市", value: shop.city },
      { label: "地址", value: shop.address },
      { label: "联系电话", value: readable(shop.phone) },
      { label: "状态", value: statusBadge(shop.status) },
      { label: "门店介绍", value: readable(shop.description) }
    ];
  }
  if (tab === "服务数据") {
    const service = selected as BackofficeServicePayload;
    return [
      { label: "服务名称", value: service.name },
      { label: "门店名称", value: service.shopName },
      { label: "服务分类", value: service.categoryName },
      { label: "服务方式", value: service.serviceMode === "store" ? "到店服务" : "上门服务" },
      { label: "价格", value: yen(service.priceAmount) },
      { label: "服务时长", value: `${service.durationMinutes}分钟` },
      { label: "状态", value: statusBadge(service.status) },
      { label: "服务介绍", value: readable(service.description) }
    ];
  }
  if (tab === "排班数据") {
    const schedule = selected as BackofficeScheduleSlotPayload;
    return [
      { label: "服务名称", value: schedule.serviceName },
      { label: "门店名称", value: schedule.shopName },
      { label: "技师", value: schedule.technicianName ?? "店铺统筹" },
      { label: "开始时间", value: formatOrderDateTime(schedule.startsAt) },
      { label: "结束时间", value: formatOrderDateTime(schedule.endsAt) },
      { label: "占用 / 容量", value: `${schedule.bookedCount}/${schedule.capacity}` },
      { label: "状态", value: statusBadge(schedule.status) }
    ];
  }
  const settlement = selected as BackofficeFinanceSettlementPayload;
  return [
    { label: "订单编号", value: settlement.orderNo },
    { label: "门店名称", value: settlement.shopName },
    { label: "技师", value: settlement.technicianName ?? "未安排" },
    { label: "服务 GMV", value: yen(settlement.estimatedServiceGmvJpy) },
    { label: "平台 NDP 收入", value: settlement.platformNdpRevenue.toLocaleString("ja-JP") },
    { label: "支付渠道", value: settlement.paymentChannel },
    { label: "结算状态", value: statusBadge(settlement.status) },
    { label: "创建时间", value: formatOrderDateTime(settlement.createdAt) }
  ];
}

export function DataCenterPage() {
  const [searchParams] = useSearchParams();
  const module = searchParams.get("module");

  if (module && retiredDashboardModules.has(module)) {
    return <Navigate replace to="/admin" />;
  }
  if (module === "cities") return <Navigate replace to="/admin/cities" />;
  return <DataCenterTablePage />;
}

function DataCenterTablePage() {
  const [active, setActive] = useState<DataTab>("订单数据");
  const [selected, setSelected] = useState<DataCenterRow | null>(null);
  const [rows, setRows] = useState<DataCenterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isSupportedTab(active)) {
      setRows([]);
      setTotal(0);
      setLoadStatus("idle");
      return;
    }

    let request: Promise<PaginatedApiPayload<DataCenterRow>>;
    const query = { page, pageSize, keyword: keyword || undefined };
    if (active === "订单数据") request = backofficeRealDataApi.orders("backoffice", query) as Promise<PaginatedApiPayload<DataCenterRow>>;
    else if (active === "客户数据") request = backofficeRealDataApi.customers("backoffice", query) as Promise<PaginatedApiPayload<DataCenterRow>>;
    else if (active === "员工/技师数据") request = backofficeRealDataApi.technicians("backoffice", query) as Promise<PaginatedApiPayload<DataCenterRow>>;
    else if (active === "门店数据") request = backofficeRealDataApi.shops("backoffice", query) as Promise<PaginatedApiPayload<DataCenterRow>>;
    else if (active === "服务数据") request = backofficeRealDataApi.services("backoffice", query) as Promise<PaginatedApiPayload<DataCenterRow>>;
    else if (active === "排班数据") request = backofficeRealDataApi.schedule("backoffice", query) as Promise<PaginatedApiPayload<DataCenterRow>>;
    else request = backofficeRealDataApi.financeSettlements("backoffice", query) as Promise<PaginatedApiPayload<DataCenterRow>>;

    let current = true;
    setLoadStatus("loading");
    setLoadError("");
    request.then((payload) => {
      if (!current) return;
      setRows(payload.list);
      setTotal(payload.total);
      setLoadStatus("success");
    }).catch((error: unknown) => {
      if (!current) return;
      setRows([]);
      setTotal(0);
      setLoadError(describeDataCenterError(error));
      setLoadStatus("error");
    });
    return () => {
      current = false;
    };
  }, [active, keyword, page, revision]);

  const columns = useMemo(
    () => isSupportedTab(active) ? columnsFor(active, setSelected) : [],
    [active]
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const changeTab = (next: string) => {
    setActive(next as DataTab);
    setPage(1);
    setSelected(null);
  };
  const submitSearch = () => {
    setPage(1);
    setKeyword(searchDraft.trim());
  };

  return (
    <AdminLayout>
      <ModuleShell title="数据管理中心" description="受权限保护的正式数据只读入口。搜索与翻页直接请求后端，不再合并浏览器 mock 或本地覆盖层。">
        <Tabs active={active} items={tabs} onChange={changeTab} />

        {unsupportedTabs.has(active) ? (
          <section className="mt-4 rounded-lg border border-line bg-paper p-6">
            <h2 className="font-black text-ink">库存和评价数据接口尚未启用</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/55">正式表结构、权限、分页查询和审计日志完成前，不展示旧库存或评价样例，也不允许新增、编辑、导出或批量操作。</p>
          </section>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="搜索当前数据集"
                className="focus-ring h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink"
                placeholder="输入名称、邮箱、订单号或店铺关键词"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                }}
              />
              <Button onClick={submitSearch}>搜索正式数据</Button>
              {keyword ? <Button variant="secondary" onClick={() => { setSearchDraft(""); setKeyword(""); setPage(1); }}>清除搜索</Button> : null}
            </div>

            {loadStatus === "loading" ? (
              <section className="mt-4 rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel" aria-live="polite">
                <p className="text-sm font-black text-ink">正在从正式数据库加载数据</p>
              </section>
            ) : null}
            {loadStatus === "error" ? (
              <section className="mt-4 rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
                <h2 className="font-black text-ink">当前数据集加载失败</h2>
                <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
                <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>重新加载当前数据</Button>
              </section>
            ) : null}
            {loadStatus === "success" && rows.length === 0 ? (
              <section className="mt-4 rounded-lg border border-dashed border-line bg-white px-5 py-10 text-center">
                <p className="text-sm font-black text-ink/55">当前数据集没有真实记录</p>
              </section>
            ) : null}
            {loadStatus === "success" && rows.length > 0 ? (
              <div className="mt-4">
                <DataTable<DataCenterRow> columns={columns} footerPlacement="inline" pageSize={pageSize} rows={rows} showFooterActions={false} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3">
                  <span className="text-sm font-bold text-ink/55">服务器共 {total} 条，第 {page} / {totalPages} 页</span>
                  <div className="flex gap-2">
                    <Button disabled={page <= 1} size="sm" variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
                    <Button disabled={page >= totalPages} size="sm" variant="secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </ModuleShell>

      <Drawer open={Boolean(selected)} title={`${active}详情`} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            {isSupportedTab(active) && active !== "订单数据" ? (
              <DetailGrid items={detailItemsFor(active, selected)} />
            ) : null}
            {isSupportedTab(active) ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button to={dataOwnerRoute(active)}>前往所属管理模块</Button>
                <Button variant="secondary" onClick={() => setSelected(null)}>关闭</Button>
              </div>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
