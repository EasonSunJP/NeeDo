import { useNavigate } from "react-router-dom";
import {
  PrimaryButton,
  SecondaryButton,
} from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";

const supportCategories = [
  "订单咨询",
  "退款申请",
  "改期协助",
  "商家入驻",
  "投诉与风控",
];

const unavailableSupportCopy =
  "在线客服与工单尚未接入，当前无法在此发起咨询或创建工单。";

export function SupportPage() {
  const navigate = useNavigate();

  const closePage = () => {
    if (
      typeof window !== "undefined" &&
      typeof window.history.state?.idx === "number" &&
      window.history.state.idx > 0
    ) {
      navigate(-1);
      return;
    }

    navigate("/me", { replace: true });
  };

  return (
    <MobileShell showBottomNav={false} showTopEdgeMask={false}>
      <MobileFullscreenPage>
        <MobileFullscreenHeader
          info="在线客服与工单尚未接入，当前无法在此发起咨询或创建工单。"
          onClose={closePage}
          showSpacer={false}
          title="联系客服"
        />

        <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(116px+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+86px)]">
          <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,var(--client-bg)_16%)] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black">客服功能正在准备中</h2>
              <TestFeatureBadge />
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
              {unavailableSupportCopy}
            </p>
          </section>

          <section aria-label="可咨询范围" className="mt-4">
            <h2 className="px-1 text-sm font-black text-[color:var(--client-muted)]">
              可咨询范围
            </h2>
            <ul className="mt-3 grid gap-3">
              {supportCategories.map((item) => (
                <li
                  className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,var(--client-bg)_28%)] px-4 py-4 text-sm font-black text-[color:var(--client-text)]"
                  key={item}
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </main>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-6"
          data-testid="support-floating-actions"
        >
          <div className="pointer-events-auto mx-auto grid w-full max-w-[480px] grid-cols-2 gap-3">
            <SecondaryButton className="min-w-0 px-3 text-center" to="/">
              返回首页
            </SecondaryButton>
            <PrimaryButton className="min-w-0 px-3 text-center" to="/orders">
              查看我的订单
            </PrimaryButton>
          </div>
        </div>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
