import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "Campaign、Coupon 与 Redemption 表和 migration",
  "创建、审核、启停与预算状态机 API",
  "领取、核销、归因与审计链路",
  "聚合统计与导出合同"
];

export function MarketingPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="营销中心"
        description="通用营销活动、优惠券和渠道归因尚未形成可审计的正式数据闭环。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式营销与优惠券功能尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟优惠券、发放量、核销量、GMV、ROI 或渠道活动，也不会开放只写入页面内存的创建、启停和导出操作。
            </p>
            <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm font-bold leading-6 text-yellow-900">
              现有 FeeCampaign 仅用于平台费用计算，不能代替面向用户的营销活动、优惠券领取和核销模型。
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {requirements.map((requirement, index) => (
              <article className="rounded-lg border border-line bg-paper p-4" key={requirement}>
                <span className="text-xs font-black text-moss">上线条件 {index + 1}</span>
                <p className="mt-2 text-sm font-black text-ink">{requirement}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button to="/admin/finance" variant="secondary">查看正式财务数据</Button>
            <Button to="/admin/data" variant="secondary">查看正式数据中心</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
