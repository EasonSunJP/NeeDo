import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import type { DispatchCycle } from "./domain";
import { createDispatchCenterApi } from "./api";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

const cycle = {
  id: "9a2d59d0-3f2d-49dc-82af-c34371a3cd8d",
  storeId: "store-16",
  name: "2026-12 自主排班",
  creationMethod: "new",
  mode: "TECH_SELF_FINAL",
  status: "draft",
  currentStep: 1,
  templateType: "week",
  periodStart: "2026-12-01",
  periodEnd: "2026-12-20",
  targetTechnicianIds: ["31"],
  feedbackDeadline: null,
  templateMatrix: Array.from({ length: 7 }, () => Array(24).fill(false)),
  regularHolidayWeekdays: [],
  ruleSet: {},
  launchedAt: null,
  finalizedAt: null,
  activeAt: null,
  cancelledAt: null,
  lastAutoConfirmAt: null,
  autoConfirmSummary: null,
  updatedAt: "2026-09-20T12:00:00.000Z"
} as unknown as DispatchCycle;

const serverCycle = {
  ...cycle,
  shopId: 16,
  status: "DRAFT",
  templateType: "WEEK",
  targetTechnicianIds: [31],
  feedbackRows: [],
  finalShifts: [],
  version: 1
};

describe("dispatch center formal API", () => {
  beforeEach(() => {
    vi.mocked(httpClient.request).mockReset();
  });

  it("uses authenticated server endpoints for the complete cycle lifecycle", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [serverCycle], total: 1, page: 1, page_size: 20 })
      .mockResolvedValueOnce(serverCycle)
      .mockResolvedValueOnce(serverCycle)
      .mockResolvedValueOnce({ ...serverCycle, status: "FINAL_CONFIRMING" })
      .mockResolvedValueOnce({ cycle: serverCycle, summary: { confirmedCount: 1, waitlistedCount: 0, shortageCount: 0, overflowCount: 0 } })
      .mockResolvedValueOnce({ ...serverCycle, status: "CONFIRMED" });

    const api = createDispatchCenterApi("operator-7");
    await api.listCycles("store-16");
    await api.createCycleDraft("store-16", ["31"]);
    await api.saveCycleDraft(cycle);
    await api.launchCycle(cycle.id);
    await api.runAutoConfirm(cycle.id);
    await api.finalizeCycle(cycle.id);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant-admin/schedule-cycles", {
      query: { page: 1, pageSize: 20 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/schedule-cycles", {
      body: { targetTechnicianIds: [31] },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, `/merchant-admin/schedule-cycles/${cycle.id}`, {
      body: {
        name: cycle.name,
        mode: cycle.mode,
        currentStep: cycle.currentStep,
        templateType: "WEEK",
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        targetTechnicianIds: [31],
        feedbackDeadline: null,
        templateMatrix: cycle.templateMatrix,
        regularHolidayWeekdays: [],
        ruleSet: cycle.ruleSet,
        version: undefined
      },
      method: "PUT"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, `/merchant-admin/schedule-cycles/${cycle.id}/launch`, {
      body: { idempotencyKey: `${cycle.id}:launch` },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(5, `/merchant-admin/schedule-cycles/${cycle.id}/auto-confirm`, {
      body: { idempotencyKey: `${cycle.id}:auto-confirm` },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(6, `/merchant-admin/schedule-cycles/${cycle.id}/finalize`, {
      body: { idempotencyKey: `${cycle.id}:finalize` },
      method: "POST"
    });
  });
});
