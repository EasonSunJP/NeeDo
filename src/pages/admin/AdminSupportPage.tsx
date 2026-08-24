import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "SupportTicket、SupportMessage、SupportAttachment 与 OnCallPolicy 表和 migration",
  "创建、分派、优先级、SLA、升级、解决、关闭与重开状态机 API",
  "租户范围 RBAC、敏感信息脱敏、附件权限与不可变审计",
  "通知投递、值班配置、服务端搜索、分页、SLA 聚合与导出"
];

export function AdminSupportPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="客服与支持"
        description="正式客服必须由可追踪工单、消息、附件、SLA 和值班策略驱动。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式客服工单与值班联系尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示未经验证的联系方式、模拟工单、SLA 或值班状态，也不会开放没有数据库、权限、投递回执和审计证据的创建、分派、升级、回复、解决或附件操作。
            </p>
            <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm font-bold leading-6 text-yellow-900">
              官方邮箱、LINE、电话和工作时间必须来自版本化配置，并经过运营审核与发布；在该配置存在前，前端不能硬编码或推测联系方式。人身安全等紧急情况应使用当地法定紧急服务，不能依赖未启用的平台工单。
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
            <Button to="/admin/docs" variant="secondary">查看操作文档</Button>
            <Button to="/admin/docs/api" variant="secondary">查看正式 API 文档</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
