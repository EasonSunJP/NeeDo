import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { settlements } from "../../data/mock";
import { yen } from "../../lib/utils";
import type { Settlement } from "../../types/domain";

export function FinancePage() {
  const [selected, setSelected] = useState<Settlement | null>(null);

  return (
    <AdminLayout>
      <ModuleShell
        title="财务结算中心"
        description="今日营收、待结算、退款、渠道手续费、商家分账、技师分账、退款审核、结算单导出和发票记录。"
        actions={<Button>生成结算单</Button>}
      >
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["今日营收", 8426000],
            ["待结算金额", 12840000],
            ["退款金额", 286000],
            ["渠道手续费", 184000],
            ["商家应结算", 10490000],
            ["技师应结算", 2680000]
          ].map(([label, value]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-sm text-ink/55">{label}</p>
              <strong className="mt-2 block text-xl">{yen(Number(value))}</strong>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-panel">
          <h2 className="font-bold">结算规则配置</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {["结算周期 T+7", "平台佣金 8%-18%", "退款自动扣回", "发票月度归档"].map((rule) => (
              <button className="rounded-lg bg-paper p-3 text-left text-sm font-bold" key={rule} type="button">
                {rule}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-5">
          <FilterBar
            searchPlaceholder="搜索商家、结算单、周期"
            filters={[
              { label: "状态", options: [{ label: "待审核", value: "pending" }, { label: "审核中", value: "reviewing" }, { label: "已打款", value: "paid" }] },
              { label: "周期", options: [{ label: "周结", value: "week" }, { label: "月结", value: "month" }] },
              { label: "城市", options: [{ label: "东京", value: "tokyo" }, { label: "大阪", value: "osaka" }] }
            ]}
          />
        </div>
        <div className="mt-4">
          <DataTable<Settlement>
            columns={[
              { key: "merchant", title: "商家", render: (row) => row.merchantName },
              { key: "period", title: "周期", render: (row) => row.period },
              { key: "gross", title: "流水", render: (row) => yen(row.grossAmount) },
              { key: "fee", title: "平台佣金", render: (row) => yen(row.platformFee) },
              { key: "refund", title: "退款", render: (row) => yen(row.refundAmount) },
              { key: "payable", title: "应结算", render: (row) => yen(row.payableAmount) },
              { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{row.status}</Badge> }
            ]}
            rows={settlements}
            onView={setSelected}
          />
        </div>
      </ModuleShell>

      <Drawer open={Boolean(selected)} title="结算单详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "商家", value: selected.merchantName },
                { label: "结算周期", value: selected.period },
                { label: "流水", value: yen(selected.grossAmount) },
                { label: "渠道手续费", value: yen(Math.round(selected.grossAmount * 0.022)) },
                { label: "平台佣金", value: yen(selected.platformFee) },
                { label: "退款金额", value: yen(selected.refundAmount) },
                { label: "商家应结算", value: yen(selected.payableAmount) },
                { label: "状态", value: selected.status }
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {["结算审核", "商家分账", "技师分账", "退款审核", "结算单导出", "发票记录"].map((action) => (
                <Button key={action} size="sm" variant="secondary">
                  {action}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </AdminLayout>
  );
}
