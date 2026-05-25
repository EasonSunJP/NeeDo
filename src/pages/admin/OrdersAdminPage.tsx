import { useEffect, useState } from "react";
import { backofficeRealDataApi, mapBackofficeOrder } from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { Tabs } from "../../components/ui/Tabs";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { paymentStatusLabel, paymentStatusTone, statusLabel, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { Order } from "../../types/domain";

const statusTabs = ["全部订单", "待确认", "待支付", "待服务", "服务中", "待评价", "已完成", "已取消", "退款中", "已退款"];

export function OrdersAdminPage() {
  const { customers, technicians } = useEntityStore();
  const { language } = useI18n();
  const [active, setActive] = useState("全部订单");
  const [selected, setSelected] = useState<Order | null>(null);
  const [orderRows, setOrderRows] = useState<Order[]>([]);
  const getPaymentStatusLabel = (status: Order["paymentStatus"]) => translateText(paymentStatusLabel(status), language);
  const getCustomerDisplayName = (order: Order) => {
    const customer = customers.find((item) => item.id === order.customerId);
    return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? order.customerName;
  };
  const getProviderDisplayName = (order: Order) => {
    if (order.storeName) {
      return order.storeName;
    }

    if (!order.technicianName) {
      return "待分配";
    }

    const technician = technicians.find((item) => item.name === order.technicianName || item.nickname === order.technicianName);
    return technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? order.technicianName;
  };

  useEffect(() => {
    let activeRequest = true;

    backofficeRealDataApi.orders("backoffice").then((response) => {
      if (activeRequest) {
        setOrderRows(response.list.map(mapBackofficeOrder));
      }
    }).catch(() => {
      if (activeRequest) {
        setOrderRows([]);
      }
    });

    return () => {
      activeRequest = false;
    };
  }, []);

  return (
    <AdminLayout>
      <ModuleShell
        title="订单中心"
        description="覆盖上门订单与到店预约订单的确认、改期、派单、改价、取消、退款、收款确认与单据打印。"
        actions={<Button>创建预约</Button>}
      >
        <Tabs active={active} items={statusTabs} onChange={setActive} />
        <div className="mt-4">
          <FilterBar
            filters={[
              { label: "城市", options: [{ label: "东京", value: "tokyo" }, { label: "大阪", value: "osaka" }] },
              { label: "来源", options: [{ label: "App", value: "app" }, { label: "LINE", value: "line" }] },
              {
                label: "支付状态",
                options: [
                  { label: getPaymentStatusLabel("paid"), value: "paid" },
                  { label: getPaymentStatusLabel("unpaid"), value: "unpaid" },
                  { label: getPaymentStatusLabel("depositPaid"), value: "depositPaid" },
                  { label: getPaymentStatusLabel("refunded"), value: "refunded" }
                ]
              }
            ]}
          />
        </div>
        <div className="mt-4">
          <DataTable<Order>
            columns={[
              { key: "orderNo", title: "订单编号", render: (row) => row.orderNo },
              { key: "customer", title: "用户信息", render: (row) => getCustomerDisplayName(row) },
              { key: "service", title: "服务信息", render: (row) => row.itemName },
              { key: "provider", title: "门店/技师", render: (row) => getProviderDisplayName(row) },
              { key: "amount", title: "价格组成", render: (row) => yen(row.amount) },
              { key: "pay", title: "支付状态", render: (row) => <Badge tone={paymentStatusTone(row.paymentStatus)}>{getPaymentStatusLabel(row.paymentStatus)}</Badge> },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "refunding" ? "red" : "yellow"}>{statusLabel(row.status)}</Badge> }
            ]}
            rows={orderRows}
            onView={setSelected}
          />
        </div>
      </ModuleShell>

      <Drawer open={Boolean(selected)} title="订单详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "订单编号", value: selected.orderNo },
                { label: "用户信息", value: `${getCustomerDisplayName(selected)} / ${selected.customerId}` },
                { label: "服务信息", value: selected.itemName },
                { label: "门店/技师", value: getProviderDisplayName(selected) },
                { label: "价格组成", value: yen(selected.amount) },
                { label: "支付状态", value: <Badge tone={paymentStatusTone(selected.paymentStatus)}>{getPaymentStatusLabel(selected.paymentStatus)}</Badge> },
                { label: "预约时间", value: selected.bookedAt },
                { label: "备注", value: selected.remark ?? "无" }
              ]}
            />
            <section className="rounded-lg border border-line bg-paper p-4">
              <h3 className="font-bold">状态流转记录 / 操作日志</h3>
              <div className="mt-3 space-y-2 text-sm text-ink/65">
                <p>创建订单 · {selected.createdAt} · 用户</p>
                <p>支付确认 · {getPaymentStatusLabel(selected.paymentStatus)} · 支付网关</p>
                <p>运营查看 · 当前会话</p>
              </div>
            </section>
            <section className="rounded-lg border border-line bg-paper p-4">
              <TitleWithInfo
                as="h3"
                info="用户咨询改期、发票、技师到达时间等消息会归档到订单详情。"
                label="聊天 / 客服记录说明"
                title="聊天 / 客服记录"
                titleClassName="font-bold"
                variant="paper"
              />
            </section>
            <div className="flex flex-wrap gap-2">
              {["确认订单", "改期", "分配技师", "修改价格", "取消订单", "退款", "收款确认", "打印单据"].map((action) => (
                <Button key={action} size="sm" variant={action === "退款" ? "danger" : "secondary"}>
                  {action}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </AdminLayout>
  );
}
