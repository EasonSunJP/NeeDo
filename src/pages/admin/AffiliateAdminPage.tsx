import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "AffiliateProgram、Promoter、AffiliateLink、AttributionTouch 与 CommissionClaim 表和 migration",
  "申请、审核、链接签发、归因、佣金锁定、冲正与结算状态机 API",
  "防重复归因、幂等事件、范围 RBAC、风控与不可变审计",
  "钱包账本、结算批次、支付凭证、对账、分页、聚合与导出合同"
];

export function AffiliateAdminPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="Afirieito 管理"
        description="推广者、链接、归因、佣金和结算必须由正式数据库与可审计状态机驱动。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式 Afirieito 管理尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示浏览器保存的 GMV、ROI、预算、链接、佣金或结算数据，也不会把页面内存中的推广者、归因、钱包、对账和风控记录当成正式业务凭证。
            </p>
            <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm font-bold leading-6 text-yellow-900">
              现有 FeeCampaign、Wallet 与 Ledger 只覆盖平台费用和正式钱包基础能力，不能代替推广计划、点击归因、佣金债权与推广者结算模型。
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
