import type { ScheduleCycleRepositoryPort } from "../src/repositories/schedule-cycle.repository";
import { ScheduleCycleService } from "../src/services/schedule-cycle.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type { ScheduleCyclePayload } from "../src/types/schedule-cycle.types";

const actor = {
  userId: 7,
  roles: ["merchant_owner"],
  currentIdentityId: 70,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 16
} as AuthenticatedAccessContext;
const context = { ip: "127.0.0.1", userAgent: "jest" };

const matrix = Array.from({ length: 7 }, (_, day) =>
  Array.from({ length: 24 }, (_, hour) => day > 0 && day < 6 && hour === 10)
);
const cycle: ScheduleCyclePayload = {
  id: "9a2d59d0-3f2d-49dc-82af-c34371a3cd8d",
  shopId: 16,
  name: "2026-12 自主排班",
  creationMethod: "new",
  mode: "TECH_SELF_FINAL",
  status: "FINAL_CONFIRMING",
  currentStep: 3,
  templateType: "WEEK",
  periodStart: "2026-12-01",
  periodEnd: "2026-12-20",
  targetTechnicianIds: [31],
  feedbackDeadline: null,
  templateMatrix: matrix,
  regularHolidayWeekdays: [],
  ruleSet: {
    minStaff: 1,
    targetStaff: 1,
    maxStaff: 1,
    maxDailyHours: 8,
    maxWeeklyHours: 40,
    minRestDaysPerWeek: 1,
    weekdayAdjustments: {},
    holidayAdjustments: {}
  },
  launchedAt: "2026-09-20T12:00:00.000Z",
  finalizedAt: null,
  activeAt: null,
  cancelledAt: null,
  lastAutoConfirmAt: null,
  autoConfirmSummary: null,
  feedbackRows: [{
    technicianProfileId: 31,
    date: "2026-12-01",
    hour: 10,
    status: "AVAILABLE",
    note: "",
    submittedAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z"
  }],
  finalShifts: [],
  version: 2,
  updatedAt: "2026-09-20T12:00:00.000Z"
};

describe("ScheduleCycleService", () => {
  it("uses persisted technician feedback across the entire cycle when auto-confirming", async () => {
    const repository = {
      findForShop: jest.fn(async () => cycle),
      replaceAutoConfirmedShifts: jest.fn(async (_shopId, _cycleId, input) => ({ cycle, summary: input.summary }))
    } as unknown as jest.Mocked<ScheduleCycleRepositoryPort>;
    const service = new ScheduleCycleService(repository, {
      createInput: jest.fn((input) => ({
        actorId: input.actor.userId,
        action: input.action,
        targetType: input.targetType,
        ip: input.context.ip,
        userAgent: input.context.userAgent,
        metadata: input.metadata
      }))
    });

    const result = await service.autoConfirm(actor, context, cycle.id, `${cycle.id}:auto-confirm`);

    expect(result.summary).toEqual({
      confirmedCount: 1,
      waitlistedCount: 0,
      shortageCount: 13,
      overflowCount: 0
    });
    expect(repository.replaceAutoConfirmedShifts).toHaveBeenCalledWith(
      16,
      cycle.id,
      expect.objectContaining({
        shifts: [expect.objectContaining({ technicianProfileId: 31, date: "2026-12-01", hour: 10, status: "CONFIRMED" })]
      }),
      expect.objectContaining({ action: "schedule_cycle.auto_confirm" })
    );
  });
});
