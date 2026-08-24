import { useSearchParams } from "react-router-dom";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "店铺展示配置表与 migration",
  "店铺范围草稿、发布与版本 API",
  "MediaAsset 上传、排序与删除审计",
  "用户端正式配置读取与回滚"
];

export function MerchantAdminDesignPage() {
  const [searchParams] = useSearchParams();
  const isCardModule = searchParams.get("module") === "cards";

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title={isCardModule ? "信息卡装修" : "店铺 UI 装修"}
        description="装修能力需要独立、可版本化的数据合同；当前数据库与 API 尚未形成完整发布闭环。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式店铺装修功能尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会把装修配置保存到浏览器，也不会显示“已发布”但刷新后丢失的页面、信息卡、轮播图或展示文案操作。
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
            <Button to="/merchant-admin/settings" variant="secondary">维护正式店铺资料</Button>
            <Button to="/merchant-admin/orders" variant="secondary">查看正式订单</Button>
          </div>
        </section>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
