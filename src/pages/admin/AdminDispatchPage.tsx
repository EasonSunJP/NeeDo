import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "DispatchJob、DispatchAssignment 与 DispatchException 表和 migration",
  "创建、分派、接单、改派、升级与关闭状态机 API",
  "跨店技师可用性、冲突锁、范围 RBAC 与不可变审计",
  "服务端筛选、分页、聚合、SLA 与导出合同"
];

export function AdminDispatchPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="跨店派单中心"
        description="运营派单必须使用平台范围的正式工单、技师可用性和审计合同，不能借用单店商户工作区。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式跨店派单中心尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会跳转到任何单店商户工作区，也不会展示浏览器本地排班、模拟工单、技师位置、SLA 或派单结果。跨店调度合同完成前，不开放分派、改派、升级、关闭或导出操作。
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
            <Button to="/admin/orders" variant="secondary">查看正式订单</Button>
            <Button to="/admin/technicians" variant="secondary">查看正式技师资料</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
