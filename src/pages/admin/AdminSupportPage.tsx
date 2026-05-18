import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const contactChannels = [
  {
    title: "官方邮箱",
    value: "support@needo.jp",
    note: "适用于支付异常、资料审核、合同结算、发票和系统问题。",
    badge: "Email"
  },
  {
    title: "LINE Official",
    value: "@needo_support",
    note: "适用于店铺、技师和平台代理商的日常咨询与值班联络。",
    badge: "LINE"
  },
  {
    title: "客服电话",
    value: "+81 3-6824-7788",
    note: "工作日 10:00 - 19:00，紧急工单和节假日值班以官方通知为准。",
    badge: "Call"
  }
];

const supportRules = [
  "支付失败、退款延迟、结算异常：优先邮件并附订单号。",
  "IM 风控、投诉升级、站外交易风险：优先 LINE 值班群同步。",
  "用户安全、技师安全、SOS 异常：直接拨打客服电话并同步后台工单。"
];

export function AdminSupportPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="官方客服"
        description="这里用于查看怎么联系 NeeDo 官方团队，包括邮件、LINE 和电话。客服 icon 打开的是这张联系方式页面，不再跳去评价或业务模块。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">复制联系信息</Button>
            <Button>打开值班说明</Button>
          </div>
        }
      >
        <section className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4">
            {contactChannels.map((channel) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={channel.title}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black">{channel.title}</h2>
                      <Badge tone="yellow">{channel.badge}</Badge>
                    </div>
                    <p className="mt-3 text-xl font-black text-moss">{channel.value}</p>
                    <p className="mt-2 text-sm leading-6 text-ink/60">{channel.note}</p>
                  </div>
                  <Button variant="secondary" size="sm">复制</Button>
                </div>
              </article>
            ))}
          </div>

          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <h2 className="text-lg font-black">联系建议</h2>
            <div className="mt-4 space-y-3">
              {supportRules.map((rule) => (
                <article className="rounded-lg border border-line bg-paper p-3" key={rule}>
                  <p className="text-sm leading-6 text-ink/70">{rule}</p>
                </article>
              ))}
            </div>

            <div className="mt-5 rounded-lg bg-paper p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">值班说明</p>
              <p className="mt-3 text-sm leading-7 text-ink/65">
                正常情况下，后台运营与店铺咨询建议优先使用邮件或 LINE Official。
                如果涉及人身安全、在途异常、服务中断或大额支付问题，请先电话联系，再补充后台工单与邮件材料。
              </p>
            </div>
          </section>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
