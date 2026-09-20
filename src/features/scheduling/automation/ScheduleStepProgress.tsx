import type { CSSProperties } from "react";
import type { DispatchCycle, DispatchStep } from "../../dispatch-center/domain";

const selfSchedulingStepItems: Array<{ step: DispatchStep; label: string }> = [
  { step: 1, label: "模式选择" },
  { step: 2, label: "规则设定" },
  { step: 3, label: "最终确认" }
];

const directSchedulingStepItems: Array<{ step: DispatchStep; label: string }> = [
  { step: 1, label: "模式选择" },
  { step: 2, label: "规则设定" },
  { step: 3, label: "技师反馈" },
  { step: 4, label: "最终确认" }
];

export function ScheduleStepProgress({ cycle, surface }: { cycle: DispatchCycle; surface: "desktop" | "mobile" }) {
  const stepItems = cycle.mode === "STORE_ASSIGN_FINAL" ? directSchedulingStepItems : selfSchedulingStepItems;

  return (
    <nav aria-label="排班步骤" data-schedule-stepper="true" data-surface={surface}>
      <ol
        className="schedule-stepper-track"
        data-step-count={stepItems.length}
        style={{ "--schedule-step-count": stepItems.length } as CSSProperties}
      >
        {stepItems.map((item) => {
          const active = cycle.currentStep === item.step;
          const done = cycle.currentStep > item.step;
          const state = done ? "complete" : active ? "current" : "upcoming";

          return (
            <li
              aria-current={active ? "step" : undefined}
              className="schedule-stepper-step"
              data-state={state}
              key={item.step}
            >
              <span className="schedule-stepper-content">
                <span aria-hidden="true" className="schedule-stepper-index">{done ? "✓" : item.step}</span>
                <span className="schedule-stepper-label">{item.label}</span>
                <span className="sr-only">{done ? "已完成" : active ? "当前步骤" : "未开始"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
