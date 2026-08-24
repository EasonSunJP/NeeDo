import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "FloorArea、FloorResource 与 FloorLayoutVersion 表",
  "店铺范围草稿、发布、回滚与版本 API",
  "坐标校验、乐观锁与变更审计",
  "Booking 与 Schedule 驱动的实时占用合同"
];

export function FloorplanPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="场控布局 / 平面图"
        description="运营场控视图需要跨店铺权限、版本化布局和真实预约占用合同。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式场控布局尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟区域、利用率、流水或预约占用，也不会开放没有数据库版本、RBAC 和审计证据的拖拽、缩放、删除或智能整理操作。
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
            <Button to="/admin/schedule" variant="secondary">查看正式排班</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
