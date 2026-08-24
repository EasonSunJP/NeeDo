import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "Review 表与 migration",
  "分页、搜索与 RBAC API",
  "评价回复和风控审计日志"
];

export function ReviewsPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="评价中心"
        description="评价功能保留正式入口，但在数据库、接口、权限和审计链路完成前不读取旧演示数据。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式评价功能尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟评分、评价内容、回复状态或风控预警，也不会开放无后端支撑的评价规则、回复、标记、导出或批量操作。
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {requirements.map((requirement, index) => (
              <article className="rounded-lg border border-line bg-paper p-4" key={requirement}>
                <span className="text-xs font-black text-moss">上线条件 {index + 1}</span>
                <p className="mt-2 text-sm font-black text-ink">{requirement}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button to="/admin/data" variant="secondary">返回真实数据中心</Button>
            <Button to="/admin/orders" variant="secondary">查看正式订单</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
