import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";

export function CpsWorkspace({
  routeBase,
  scope
}: {
  routeBase: string;
  scope: "ops-sync" | "business-admin";
}) {
  void routeBase;
  void scope;
  return (
    <ModuleShell
      description="推广计划、素材、归因、佣金、钱包、风控和推广者资料必须通过正式 API 与数据库读取。"
      title="Afirieito"
    >
      <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">功能暂未开放</p>
        <h2 className="mt-2 text-xl font-black">等待正式 Afirieito 数据合同</h2>
        <p className="mt-3 text-sm font-semibold leading-7 text-ink/60">
          当前不会展示本地推广者、计划、点击、订单、佣金、结算或风控记录，也不会把浏览器操作显示为已保存。
        </p>
      </section>
    </ModuleShell>
  );
}

export function CpsPage() {
  return (
    <AdminLayout>
      <CpsWorkspace routeBase="/admin/afirieito" scope="ops-sync" />
    </AdminLayout>
  );
}
