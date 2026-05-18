import { useMemo, useState } from "react";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { merchantAdminDemo } from "../../data/merchantAdmin";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { paymentStatusLabel, paymentStatusTone, statusLabel, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { Order } from "../../types/domain";

export function MerchantAdminOrdersPage() {
  const { customers, technicians } = useEntityStore();
  const { language } = useI18n();
  const [statusFilter, setStatusFilter] = useState<"all" | Order["status"]>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const getPaymentStatusLabel = (status: Order["paymentStatus"]) => translateText(paymentStatusLabel(status), language);
  const visibleOrders = useMemo(
    () => merchantAdminDemo.orders.filter((order) => statusFilter === "all" || order.status === statusFilter),
    [statusFilter]
  );
  const getCustomerDisplayName = (order: Order) => {
    const customer = customers.find((item) => item.id === order.customerId);
    return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? order.customerName;
  };
  const getTechnicianDisplayName = (name?: string | null) => {
    if (!name) {
      return "待安排";
    }

    const technician = technicians.find((item) => item.name === name || item.nickname === name);
    return technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? name;
  };

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="订单中心"
        description="店铺后台只处理本店相关预约。支持查看详情、联系顾客、安排员工和确认店内准备。"
        actions={
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "全部"],
              ["pending", "待处理"],
              ["scheduled", "待服务"],
              ["completed", "已完成"]
            ].map(([value, label]) => (
              <Button
                className={statusFilter === value ? "" : "bg-white text-ink"}
                key={value}
                onClick={() => setStatusFilter(value as "all" | Order["status"])}
                variant={statusFilter === value ? "primary" : "secondary"}
              >
                {label}
              </Button>
            ))}
          </div>
        }
      >
        <DataTable<Order>
          columns={[
            { key: "orderNo", title: "订单号", render: (row) => row.orderNo },
            { key: "customerName", title: "顾客", render: (row) => getCustomerDisplayName(row) },
            { key: "itemName", title: "服务项目", render: (row) => row.itemName },
            { key: "mode", title: "方式", render: (row) => (row.mode === "store" ? "到店" : "关联员工上门") },
            { key: "bookedAt", title: "预约时间", render: (row) => row.bookedAt },
            { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
            { key: "amount", title: "金额", render: (row) => yen(row.amount) }
          ]}
          onView={setSelectedOrder}
          pageSize={10}
          rows={visibleOrders}
        />

        <Drawer onClose={() => setSelectedOrder(null)} open={Boolean(selectedOrder)} title="订单详情">
          {selectedOrder ? (
            <div className="space-y-5">
              <section className="rounded-lg bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-ink/45">订单编号</p>
                    <h2 className="mt-1 text-xl font-black">{selectedOrder.orderNo}</h2>
                  </div>
                  <Badge tone="yellow">{statusLabel(selectedOrder.status)}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink/60">{selectedOrder.itemName} · {selectedOrder.bookedAt}</p>
              </section>

              <DetailGrid
                items={[
                  { label: "顾客", value: getCustomerDisplayName(selectedOrder) },
                  { label: "预约方式", value: selectedOrder.mode === "store" ? "到店服务" : "关联员工上门" },
                  { label: "门店", value: selectedOrder.storeName ?? merchantAdminDemo.store.name },
                  { label: "员工", value: getTechnicianDisplayName(selectedOrder.technicianName) },
                  { label: "支付状态", value: <Badge tone={paymentStatusTone(selectedOrder.paymentStatus)}>{getPaymentStatusLabel(selectedOrder.paymentStatus)}</Badge> },
                  { label: "订单金额", value: yen(selectedOrder.amount) },
                  { label: "订单来源", value: selectedOrder.source },
                  { label: "备注", value: selectedOrder.remark ?? "无备注" }
                ]}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <Button to="/merchant/messages">联系顾客</Button>
                <Button variant="secondary" to="/merchant-admin/dispatch-center/current">
                  去调度中心
                </Button>
                <Button variant="secondary" to="/merchant-admin/settings">
                  门店准备
                </Button>
              </div>
            </div>
          ) : null}
        </Drawer>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
