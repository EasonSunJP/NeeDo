import { Button } from "../../components/ui/Button";
import type { CpsSidebarPage } from "../../components/cps/sidebar/cpsSidebarMenus";

export function CpsPlaceholderPage({ page }: { page: CpsSidebarPage }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">Afirieito Module</p>
          <h1 className="mt-2 text-2xl font-black">{page.label}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">{page.description}</p>
        </div>
        <Button to="/NDA-admin/statistics">返回统计数据</Button>
      </div>

      <div className="mt-5 rounded-lg border border-line bg-paper p-4">
        <h2 className="text-base font-black">功能预留</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {page.features.map((feature) => (
            <div className="rounded-md border border-line bg-white p-3 text-sm font-bold text-ink/70" key={feature}>
              {feature}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
