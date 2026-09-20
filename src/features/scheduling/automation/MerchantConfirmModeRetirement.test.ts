import { describe, expect, it } from "vitest";
import domainSource from "../../dispatch-center/domain.ts?raw";
import storeSource from "../../dispatch-center/store.ts?raw";
import automationWizardSource from "./AutomationWizard.tsx?raw";
import stepCreateCycleSource from "./StepCreateCycle.tsx?raw";
import stepModeSelectionSource from "./StepModeSelection.tsx?raw";
import legacyTypesSource from "../../../types/shiftPlanning.ts?raw";
import legacyDomainSource from "../../../lib/shiftPlanning.ts?raw";
import legacyStoreSource from "../../../state/shiftPlanningStore.ts?raw";
import technicianPanelSource from "../../../components/scheduling/TechnicianShiftPlanningPanel.tsx?raw";

describe("merchant scheduling mode retirement", () => {
  it("offers only technician self-scheduling and merchant direct scheduling", () => {
    expect(stepModeSelectionSource).toContain('mode: "TECH_SELF_FINAL"');
    expect(stepModeSelectionSource).toContain('mode: "STORE_ASSIGN_FINAL"');
    expect(stepModeSelectionSource).not.toContain("STORE_COLLECT_CONFIRM");
    expect(stepModeSelectionSource).not.toContain("商户确认模式");
    expect(domainSource).not.toContain('"STORE_COLLECT_CONFIRM"');
  });

  it("uses three steps for technician self-scheduling and preserves direct-scheduling feedback", () => {
    expect(automationWizardSource).not.toContain("StepFeedbackCollection");
    expect(stepCreateCycleSource).not.toContain("STORE_COLLECT_CONFIRM");
    expect(stepCreateCycleSource).not.toContain("商户确认模式");
    expect(automationWizardSource).not.toContain("商户先给可排班范围");
    expect(stepModeSelectionSource).toContain("直接完成自己的下一周期排班");
    expect(stepModeSelectionSource).toContain("确认店铺排班，可提交请假 / 调整申请");
    expect(stepCreateCycleSource).toContain('cycle.mode === "STORE_ASSIGN_FINAL"');
    expect(stepCreateCycleSource).toContain('type="datetime-local"');
    expect(stepCreateCycleSource).toContain("技师反馈截止");
    expect(stepCreateCycleSource).toContain("已进入最终确认");
    expect(automationWizardSource).toContain('{ step: 3, label: "最终确认" }');
    expect(automationWizardSource).toContain('{ step: 3, label: "技师反馈" }');
    expect(automationWizardSource).toContain('{ step: 4, label: "最终确认" }');
  });

  it("uses a generic unsupported-mode fallback without restoring the retired mode", () => {
    expect(storeSource).toContain("function normalizeUnsupportedCycleMode");
    expect(storeSource).toContain('supportedDispatchCycleModes.includes(String(cycle.mode) as DispatchCycleMode)');
    expect(storeSource).not.toContain("STORE_COLLECT_CONFIRM");
    expect(storeSource).not.toContain("商户确认模式");
  });

  it("removes the retired mode from the legacy scheduling compatibility layer", () => {
    [legacyTypesSource, legacyDomainSource, legacyStoreSource, technicianPanelSource].forEach((source) => {
      expect(source).not.toContain("STORE_CONFIRM_REQUIRED");
      expect(source).not.toContain("requiresStoreConfirmation");
      expect(source).not.toContain("商户确认模式");
    });
  });
});
