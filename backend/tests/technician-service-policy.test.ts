import {
  TECHNICIAN_SERVICE_LIMIT,
  assertCompleteServiceOrder,
  assertTechnicianServiceQuota,
  isPublicEligibleTechnicianService,
  selectPrimaryTechnicianService
} from "../src/services/technician-service-policy";

const service = (
  overrides: Partial<{
    id: number;
    isActive: boolean;
    reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
    sortOrder: number;
    deletedAt: Date | null;
  }> = {}
) => ({
  id: 1,
  isActive: true,
  reviewStatus: "APPROVED" as const,
  sortOrder: 0,
  deletedAt: null,
  ...overrides
});

describe("technician service portfolio policy", () => {
  it("publishes only active, approved, non-deleted services", () => {
    expect(isPublicEligibleTechnicianService(service())).toBe(true);
    expect(isPublicEligibleTechnicianService(service({ isActive: false }))).toBe(false);
    expect(
      isPublicEligibleTechnicianService(service({ reviewStatus: "PENDING" }))
    ).toBe(false);
    expect(
      isPublicEligibleTechnicianService(service({ reviewStatus: "REJECTED" }))
    ).toBe(false);
    expect(
      isPublicEligibleTechnicianService(service({ deletedAt: new Date("2026-09-01T00:00:00Z") }))
    ).toBe(false);
  });

  it("selects the first eligible service by sort order and stable id", () => {
    const services = [
      service({ id: 9, sortOrder: 0, isActive: false }),
      service({ id: 8, sortOrder: 2 }),
      service({ id: 7, sortOrder: 1 }),
      service({ id: 6, sortOrder: 1 })
    ];

    expect(selectPrimaryTechnicianService(services)).toMatchObject({ id: 6 });
    expect(services.map(({ id }) => id)).toEqual([9, 8, 7, 6]);
    expect(selectPrimaryTechnicianService([service({ reviewStatus: "PENDING" })])).toBeNull();
  });

  it("accepts zero through five non-deleted services and rejects the sixth", () => {
    expect(TECHNICIAN_SERVICE_LIMIT).toBe(5);
    for (let count = 0; count <= TECHNICIAN_SERVICE_LIMIT; count += 1) {
      expect(() => assertTechnicianServiceQuota(count)).not.toThrow();
    }

    expect(() => assertTechnicianServiceQuota(TECHNICIAN_SERVICE_LIMIT + 1)).toThrow(
      expect.objectContaining({
        message: "error.technician_service.limit_reached",
        statusCode: 409
      })
    );
  });

  it("requires a complete, duplicate-free order of the owned service ids", () => {
    expect(() => assertCompleteServiceOrder([11, 12, 13], [13, 11, 12])).not.toThrow();

    for (const submittedIds of [
      [11, 11, 13],
      [11, 12],
      [11, 12, 13, 14],
      [11, 12, 99]
    ]) {
      expect(() => assertCompleteServiceOrder([11, 12, 13], submittedIds)).toThrow(
        expect.objectContaining({
          message: "error.technician_service.invalid_order",
          statusCode: 400
        })
      );
    }
  });
});
