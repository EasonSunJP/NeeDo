import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "FieldJob 表与 migration",
  "派工、改派和状态机 API",
  "照片、异常、导航与审计链路"
];

export function FieldJobsPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="上门工单中心"
        description="该路由保留给正式上门履约模块；当前数据库与接口尚未提供独立 FieldJob 业务合同。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式上门工单功能尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟地址、报价、技师或工单状态，也不会开放没有数据库写入和审计证据的创建、派工、改派、导航、照片上传、异常上报或完工操作。
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
            <Button to="/admin/orders" variant="secondary">查看正式订单</Button>
            <Button to="/admin/technicians" variant="secondary">查看正式技师</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
