import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "OperationEvent 与 OperationalIncident 表和 migration",
  "创建、指派、跟进、解决与归档状态机 API",
  "跨城市 RBAC 与不可变审计链路",
  "服务端筛选、分页、聚合与导出合同"
];

export function OperationTimelinePage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="运营时间线"
        description="正式运营时间线必须由可追溯的事件、异常工单和处理状态驱动。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式运营时间线尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟运营记录、负责人、城市、优先级或处理状态，也不会开放没有数据库、权限和审计证据的指派、跟进、解决、归档或导出操作。
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
            <Button to="/admin" variant="secondary">查看正式数据大盘</Button>
            <Button to="/admin/field-jobs" variant="secondary">查看外勤能力门禁</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
