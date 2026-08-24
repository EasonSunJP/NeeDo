import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

export function PlatformContentCapabilityGate({
  title,
  description,
  heading,
  warning,
  requirements
}: {
  title: string;
  description: string;
  heading: string;
  warning: string;
  requirements: string[];
}) {
  return (
    <AdminLayout>
      <ModuleShell
        title={title}
        description={description}
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">{heading}</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">{warning}</p>
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
            <Button to="/admin/data" variant="secondary">查看正式数据中心</Button>
            <Button to="/admin/docs/api" variant="secondary">查看正式 API 文档</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
