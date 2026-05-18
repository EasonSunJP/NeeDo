import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SurfacePanel } from "../../components/client-ui/AppScaffold";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { cn } from "../../lib/utils";

const earnExamples = [
  { label: "通常预约", value: "一人一次最多可获得 100 NDP", detail: "按实际完成的服务金额、人数和支付状态计算。" },
  { label: "活动加算", value: "+0~200 NDP", detail: "商户、技师或平台活动参与中时，可能追加获得。" },
  { label: "不满足条件", value: "0 NDP", detail: "取消，未到，异常交易，对象外服务/商户/技师" }
];

const earnSteps = [
  { title: "登录 NeeDo", detail: "使用同一账号预约、支付和查看订单，NDP 会归集到当前账号。" },
  { title: "完成对象预约", detail: "在支持 NDP 的商户或技师页面提交预约，并按预约内容完成服务。" },
  { title: "等待反映", detail: "服务完成并结算确认后，NDP 会按订单条件反映到钱包或会员账户。" }
];

const usageItems = [
  "在支持 NDP 的预约或支付页面，选择可使用的 NDP 数量。",
  "可抵扣范围、上限、有效期和是否可与优惠券并用，以页面实时显示为准。",
  "NDP 是 NeeDo 内部点数，不代表现金、电子货币、证券或可提现余额。"
];

const conditions = [
  "预约时和服务完成时均为登录状态。",
  "订单对象商户或技师参与 NDP 付与活动。",
  "按照预约内容实际到店或完成上门服务。",
  "订单金额、人数、支付方式和风控状态满足页面规则。"
];

const notes = [
  "当日取消、无联系未到、恶意改期或平台外交易时，NDP 可能不予付与或被取消。",
  "预约人数、服务时间、套餐、优惠券、会员等级和支付方式变更后，最终获得数量可能变化。",
  "使用 NDP 后取消预约时，已使用的 NDP 会按订单状态和退款规则处理。",
  "系统判断存在异常、刷单、虚假预约或违反服务规则时，NeeDo 可限制 NDP 付与、使用或账户功能。"
];

const faqs = [
  {
    question: "NDP 是什么？",
    answer: "NDP（NeeDoPoint）是 NeeDo 内部点数，可在指定服务、活动或会员权益中使用。"
  },
  {
    question: "为什么确认页显示 0~◯◯◯NDP？",
    answer: "预约提交前只能根据当前金额、人数和对象规则做预估；最终数量会在服务完成、支付确认和风控检查后确定。"
  },
  {
    question: "取消预约后还会获得 NDP 吗？",
    answer: "通常不会。若已经使用 NDP，返还或调整会按照订单状态、取消政策和页面提示处理。"
  }
];

function GuideSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-xl font-black text-[color:var(--client-text)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function NumberBadge({ index }: { index: number }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary)] text-xs font-black text-[#090806]">
      {index}
    </span>
  );
}

export function NdpGuidePage() {
  const navigate = useNavigate();

  return (
    <PageScaffold contentClassName="space-y-5 pb-[calc(env(safe-area-inset-bottom,0px)+9.5rem)] pt-[calc(env(safe-area-inset-top,0px)+4.75rem)]" navItems={[]}>
      <AppTopBar fixed title="NDP 指南" />

      <section className="overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:var(--client-primary)] p-5 text-[#090806] shadow-[0_22px_48px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]">
        <h1 className="text-[30px] font-black leading-tight">预约完成后获得 NDP</h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 opacity-80">
          登录后预约对象商户或技师，并按预约内容完成服务，即可根据订单条件获得 NDP。NDP 可在支持的预约、会员权益或平台活动中使用。
        </p>
      </section>

      <GuideSection title="可获得的 NDP 数量">
        <SurfacePanel className="space-y-3">
          {earnExamples.map((item, index) => (
            <div
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3",
                index === 0 ? "pt-0" : "border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)]",
                index === earnExamples.length - 1 ? "pb-0" : ""
              )}
              key={item.label}
            >
              <div className="min-w-0">
                <p className="text-sm font-black text-[color:var(--client-text)]">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{item.detail}</p>
              </div>
              <strong className="shrink-0 text-right text-sm font-black text-[color:var(--client-primary)]">{item.value}</strong>
            </div>
          ))}
        </SurfacePanel>
      </GuideSection>

      <GuideSection title="NDP 获得流程">
        <SurfacePanel className="space-y-4">
          {earnSteps.map((step, index) => (
            <div className="flex gap-3" key={step.title}>
              <NumberBadge index={index + 1} />
              <div className="min-w-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_56%,transparent)] pb-4 last:border-b-0 last:pb-0">
                <p className="text-sm font-black text-[color:var(--client-text)]">{step.title}</p>
                <p className="mt-1 text-xs leading-6 text-[color:var(--client-muted)]">{step.detail}</p>
              </div>
            </div>
          ))}
        </SurfacePanel>
      </GuideSection>

      <GuideSection title="NDP 的使用方法">
        <SurfacePanel>
          <ul className="space-y-3">
            {usageItems.map((item) => (
              <li className="flex items-start gap-3 text-sm leading-6 text-[color:var(--client-muted)]" key={item}>
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--client-primary)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SurfacePanel>
      </GuideSection>

      <GuideSection title="付与条件">
        <SurfacePanel>
          <div className="grid gap-2 sm:grid-cols-2">
            {conditions.map((item) => (
              <div className="flex items-start gap-2 rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] px-3 py-3 text-xs font-bold leading-5 text-[color:var(--client-text)]" key={item}>
                <span className="mt-0.5 text-[color:var(--client-primary)]">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </SurfacePanel>
      </GuideSection>

      <GuideSection title="注意事项">
        <SurfacePanel>
          <ul className="space-y-3">
            {notes.map((item) => (
              <li className="flex items-start gap-3 text-sm leading-6 text-[color:var(--client-muted)]" key={item}>
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--client-primary)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SurfacePanel>
      </GuideSection>

      <GuideSection title="常见问题">
        <SurfacePanel className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              className={cn(
                index === 0 ? "" : "border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-4"
              )}
              key={faq.question}
            >
              <p className="text-sm font-black text-[color:var(--client-text)]">{faq.question}</p>
              <p className="mt-1 text-xs leading-6 text-[color:var(--client-muted)]">{faq.answer}</p>
            </div>
          ))}
        </SurfacePanel>
      </GuideSection>

      <ClientEdgeMask
        edge="bottom"
        style={{
          "--client-edge-mask-bottom-height": "calc(env(safe-area-inset-bottom,0px) + 8.75rem)",
          "--client-edge-mask-bottom-mid-opacity": "0.82",
          "--client-edge-mask-bottom-mid-stop": "42%",
          "--client-edge-mask-bottom-strong-opacity": "1",
          "--client-edge-mask-bottom-strong-stop": "70%"
        } as CSSProperties}
      />
      <footer className="safe-nav-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)] pt-14">
        <PrimaryButton className="pointer-events-auto w-full" onClick={() => navigate(-1)}>
          返回预约页面
        </PrimaryButton>
      </footer>
    </PageScaffold>
  );
}
