import type { RefObject } from "react";
import { cn } from "../../../lib/utils";
import type { FulfillmentMode } from "../../../types/domain";
import { useCheckoutText, type CheckoutTextKey } from "./i18n";

export type CheckoutProgressKey = "package" | "fulfillment" | "time" | "location" | "technician" | "remark";
type CheckoutProgressIcon = "package" | "mode" | "time" | "location" | "technician" | "remark";

export type ActiveCheckoutStepInput = {
  progressBottom: number;
  sectionTops: readonly number[];
  viewportHeight: number;
};

const baseSteps: ReadonlyArray<{ key: CheckoutProgressKey; icon: CheckoutProgressIcon; label: string }> = [
  { key: "package", icon: "package", label: "套餐" },
  { key: "fulfillment", icon: "mode", label: "到店服务" },
  { key: "time", icon: "time", label: "时间" },
  { key: "location", icon: "location", label: "地址" },
  { key: "technician", icon: "technician", label: "技师" },
  { key: "remark", icon: "remark", label: "备注" }
];

function CheckoutProgressGlyph({ icon }: { icon: CheckoutProgressIcon }) {
  return (
    <svg aria-hidden="true" className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24">
      {icon === "package" ? (
        <>
          <path d="M12 3.7 19 7.5v9L12 20.3 5 16.5v-9L12 3.7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M5 7.5 12 11l7-3.5M12 11v9.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "mode" ? (
        <>
          <path d="M4.8 7.2h9.7c1.4 0 2.6 1.2 2.6 2.6v4.5c0 1.4-1.2 2.6-2.6 2.6H9.9l-3.3 2.6v-2.6H4.8c-1.4 0-2.6-1.2-2.6-2.6V9.8c0-1.4 1.2-2.6 2.6-2.6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M17.2 5.3h2a2.6 2.6 0 0 1 2.6 2.6v4.4a2.6 2.6 0 0 1-2.6 2.6h-.8v2.1l-2.5-2.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "time" ? (
        <>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7.8v4.5l3.1 1.9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "location" ? (
        <>
          <path d="M12 20s5.9-4.5 5.9-9.8a5.9 5.9 0 1 0-11.8 0C6.1 15.5 12 20 12 20Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <circle cx="12" cy="10.3" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "technician" ? (
        <>
          <circle cx="12" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6.8 19.2c.7-3 2.8-4.7 5.2-4.7s4.5 1.7 5.2 4.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "remark" ? (
        <>
          <path d="M7 6.2h10A1.8 1.8 0 0 1 18.8 8v7.4A1.8 1.8 0 0 1 17 17.2h-4l-3.2 2.6v-2.6H7A1.8 1.8 0 0 1 5.2 15.4V8A1.8 1.8 0 0 1 7 6.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M8.8 10.2h6.4M8.8 13h4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
    </svg>
  );
}

export function checkoutProgressSteps(fulfillmentMode: FulfillmentMode) {
  return baseSteps.map((step) => step.key === "fulfillment"
    ? { ...step, label: fulfillmentMode === "store" ? "到店服务" : "上门服务" }
    : step);
}

export function checkoutProgressPath(first: boolean) {
  return first
    ? "M18 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H18C10 64 4 58 4 50V18C4 10 10 4 18 4Z"
    : "M20 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H20C14 64 9 61 6 56L0 34L6 12C9 7 14 4 20 4Z";
}

export function resolveActiveCheckoutStep({ progressBottom, sectionTops, viewportHeight }: ActiveCheckoutStepInput) {
  const threshold = progressBottom + Math.max(0, (viewportHeight - progressBottom) / 2);
  return sectionTops.reduce((activeIndex, top, index) => top <= threshold ? index : activeIndex, 0);
}

export function CheckoutProgressNav({
  activeIndex,
  containerRef,
  fulfillmentMode,
  onSelect
}: {
  activeIndex: number;
  containerRef: RefObject<HTMLDivElement | null>;
  fulfillmentMode: FulfillmentMode;
  onSelect: (index: number, key: CheckoutProgressKey) => void;
}) {
  const { t } = useCheckoutText();
  const steps = checkoutProgressSteps(fulfillmentMode);
  const stepTextKeys: Record<CheckoutProgressKey, CheckoutTextKey> = {
    package: "package",
    fulfillment: fulfillmentMode === "store" ? "storeService" : "homeService",
    time: "time",
    location: "address",
    technician: "technician",
    remark: "remark"
  };

  return (
    <div className="px-1" ref={containerRef}>
      <nav aria-label={t("progressAria")} data-no-i18n>
        <div className="flex items-center">
          {steps.map((step, index) => {
            const active = index <= activeIndex;
            const localizedLabel = t(stepTextKeys[step.key]);
            return (
              <button
                aria-current={index === activeIndex ? "step" : undefined}
                aria-label={t("viewStep", { label: localizedLabel })}
                className="relative min-w-0 flex-1"
                data-active={active}
                key={step.key}
                onClick={() => onSelect(index, step.key)}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="h-[56px] w-full"
                  preserveAspectRatio="none"
                  style={{ color: active ? "var(--client-primary)" : "color-mix(in srgb, var(--client-surface) 88%, rgba(25,29,36,0.98))" }}
                  viewBox="0 0 156 68"
                >
                  <path d={checkoutProgressPath(index === 0)} fill="currentColor" />
                </svg>
                <span className={cn(
                  "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pb-0.5",
                  active ? "text-[#090806]" : "text-white/90"
                )}>
                  <CheckoutProgressGlyph icon={step.icon} />
                  <span className="max-w-full truncate px-0.5 text-[10px] font-black leading-none tracking-[0.02em]">{localizedLabel}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
