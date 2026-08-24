import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

type NeedoExchangeAdminMode = "demand" | "info";

const requirements = [
  "ExchangePost、Demand、Offer 与 ExchangeReply 表和 migration",
  "创建、审核、发布、过期、驳回与撤回状态机 API",
  "发布身份、联系方式脱敏与范围 RBAC",
  "匹配、预约、支付、审计、分页与导出合同"
];

function NeedoExchangeAdminPage({ mode }: { mode: NeedoExchangeAdminMode }) {
  const title = mode === "demand" ? "需求中心" : "情报中心";

  return (
    <AdminLayout>
      <ModuleShell
        title={title}
        description="正式交易所后台必须由可追溯发布主体、审核状态、匹配和履约记录驱动。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式需求与情报中心尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟需求、情报、发布主体、联系方式、互动或支付履约数据，也不会开放没有数据库、身份范围、状态机和审计证据的创建、编辑、审核、发布、撤回或导出操作。
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
            <Button to="/admin/orders" variant="secondary">查看正式预约订单</Button>
            <Button to="/admin/finance" variant="secondary">查看正式财务数据</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}

export function NeedoDemandAdminPage() {
  return <NeedoExchangeAdminPage mode="demand" />;
}

export function NeedoInfoAdminPage() {
  return <NeedoExchangeAdminPage mode="info" />;
}
