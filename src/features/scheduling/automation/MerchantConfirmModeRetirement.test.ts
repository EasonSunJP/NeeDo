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

  it("removes feedback collection from the active automation workflow", () => {
    expect(automationWizardSource).not.toContain("StepFeedbackCollection");
    expect(automationWizardSource).not.toContain('label: "技师反馈"');
    expect(stepCreateCycleSource).not.toContain("STORE_COLLECT_CONFIRM");
    expect(stepCreateCycleSource).not.toContain("商户确认模式");
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
