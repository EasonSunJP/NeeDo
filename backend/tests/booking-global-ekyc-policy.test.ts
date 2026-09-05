import { ERROR_CODES } from "../src/constants/error-codes";
import { BookingService } from "../src/services/booking.service";
import { AppError } from "../src/utils/app-error";

const occurredAt = new Date("2026-09-01T10:00:00.000Z");
const actor = { userId: 41, roles: ["customer"], currentIdentityType: "customer" };

function fixture(reject = false) {
  const repository = {
    findScheduleSlotShopId: jest.fn(async () => 7),
    createBooking: jest.fn(async () => ({ id: 91 })),
    findOrderById: jest.fn(async () => ({ id: 80, customerUserId: 41 }))
  };
  const enforcement = {
    assertServiceEkyc: jest.fn(async () => {
      if (reject) {
        throw new AppError({
          code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED,
          message: "error.user_policy.ekyc_required",
          statusCode: 403,
          data: {
            requiredAction: "ekyc_required",
            policyVersionPublicId: "policy-v3",
            effectiveAt: occurredAt.toISOString()
          }
        });
      }
    })
  };
  const service = new BookingService(
    repository as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => occurredAt,
    enforcement as never
  );
  return { enforcement, repository, service };
}

describe("booking global eKYC policy", () => {
  it.each(["home", "store"] as const)(
    "passes the authenticated user, %s mode and server time to the shared gate",
    async (fulfillmentMode) => {
      const state = fixture();
      await state.service.createBooking(actor, {
        scheduleSlotId: 11,
        fulfillmentMode,
        ...(fulfillmentMode === "home"
          ? {
              fulfillmentAddress: {
                countryCode: "JP",
                postalCode: "160-0022",
                prefecture: "東京都",
                city: "新宿区",
                addressLine1: "新宿1-2-3"
              },
              travelEstimatePublicId: "estimate-ekyc-policy"
            }
          : {})
      });
      expect(state.enforcement.assertServiceEkyc).toHaveBeenCalledWith(
        41,
        fulfillmentMode,
        occurredAt
      );
      expect(state.repository.createBooking).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects before slot lookup or booking mutation and returns only safe policy data", async () => {
    const state = fixture(true);
    await expect(
      state.service.createBooking(actor, { scheduleSlotId: 11, fulfillmentMode: "home" })
    ).rejects.toMatchObject({
      code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED,
      statusCode: 403,
      data: {
        requiredAction: "ekyc_required",
        policyVersionPublicId: "policy-v3"
      }
    });
    expect(state.repository.findScheduleSlotShopId).not.toHaveBeenCalled();
    expect(state.repository.createBooking).not.toHaveBeenCalled();
  });

  it("does not retroactively gate an existing booking read", async () => {
    const state = fixture(true);
    await expect(state.service.getOrder(actor, 80)).resolves.toMatchObject({ id: 80 });
    expect(state.enforcement.assertServiceEkyc).not.toHaveBeenCalled();
  });
});
