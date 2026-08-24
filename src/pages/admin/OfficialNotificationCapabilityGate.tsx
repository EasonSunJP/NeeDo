import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "OfficialNotice、NoticeAudience 与 NoticeDelivery 表和 migration",
  "草稿、审核、定时发送、取消与归档状态机 API",
  "目标快照、幂等投递、重试、失败回执与审计",
  "附件存储、模板版本、服务端分页与 RBAC"
];

export function OfficialNotificationCapabilityGateContent({ title = "官方通知" }: { title?: string }) {
  return (
    <ModuleShell
      title={title}
      description="正式官方通知必须使用可审计的受众快照、定时任务和逐收件人投递记录。"
      actions={<Badge tone="yellow">未启用</Badge>}
    >
      <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
        <div className="max-w-3xl">
          <h2 className="text-xl font-black text-ink">正式官方通知发送尚未启用</h2>
          <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
            当前不会展示模拟通知、更新记录、目标账号或发送状态，也不会把浏览器里的正文、附件、定时设置或账号选择显示为已发送。
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
          <Button to="/admin/docs/api" variant="secondary">查看正式 API 文档</Button>
          <Button to="/admin/data" variant="secondary">查看正式数据中心</Button>
        </div>
      </section>
    </ModuleShell>
  );
}

export function OfficialNotificationCapabilityGate({ title }: { title?: string }) {
  return (
    <AdminLayout>
      <OfficialNotificationCapabilityGateContent title={title} />
    </AdminLayout>
  );
}
