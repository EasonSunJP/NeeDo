import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "ExternalProviderConfig、TravelPolicy 与 RouteEstimate 表和 migration",
  "地址、经纬度、出行方式与人工交通费上限的正式配置 API",
  "地图/路线供应商适配器、限流、超时、缓存与 provider_unavailable 合同",
  "计费版本、审批、范围 RBAC、审计、分页与导出"
];

export function TravelSettingsPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="出行设置"
        description="地图、导航、路线估算和自动交通费依赖外部供应商；供应商与正式策略合同完成前保持不可用。"
        actions={<Badge tone="yellow">外部服务未配置</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">地图、导航与出行计费尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示静态城市车费、试算结果或“已启用”交通方式，也不会开放没有数据库、供应商回执和审计证据的导入、保存、路线推荐或自动报销操作。
            </p>
            <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold leading-6 text-blue-900">
              地址和经纬度基础数据仍可由正式店铺/订单接口保存；文本地址、人工确认交通费与线下客服流程不依赖付费地图 API。供应商未配置时，相关调用必须稳定返回 provider_unavailable，不能伪造距离、路线、价格或成功结果。
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
            <Button to="/admin/merchants" variant="secondary">查看正式店铺地址</Button>
            <Button to="/admin/orders" variant="secondary">查看正式订单地址</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
