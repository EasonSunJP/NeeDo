import type { Customer, Order, Settlement, Store, Technician } from "../../types/domain";
import { cn } from "../../lib/utils";

export interface ShopAnalyticsDashboardProps {
  store: Store;
  stores: Store[];
  technicians: Technician[];
  customers: Customer[];
  orders: Order[];
  settlements: Settlement[];
  personnelMonthlyCost?: number;
  surface?: "mobile" | "admin";
  className?: string;
}

export function ShopAnalyticsDashboard({ className }: ShopAnalyticsDashboardProps) {
  return (
    <section className={cn("rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-[color:var(--client-text)]", className)}>
      <p className="text-xs font-black text-[color:var(--client-primary)]">数据中心暂未开放</p>
      <h2 className="mt-2 text-xl font-black">等待正式 Analytics API</h2>
      <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
        收入、利润、订单、技师、客户与财务指标不会再由浏览器本地数组聚合。完成店铺范围查询、统一统计口径、权限和审计后再显示正式数据。
      </p>
    </section>
  );
}
