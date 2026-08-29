import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { payrollSchedulePolicyApi } from "./payrollSchedulePolicy";

vi.mock("./httpClient", () => ({
  httpClient: { request: vi.fn() },
}));

describe("payroll schedule policy API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the JWT-scoped shop routes without accepting shopId", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    await payrollSchedulePolicyApi.getShop("2026-08-29");
    await payrollSchedulePolicyApi.updateShop({
      cadence: "weekly",
      weeklySettlementWeekday: 5,
      monthlySettlementDay: null,
      holidayAdjustment: "previous_business_day",
      timezone: "Asia/Tokyo",
      effectiveFrom: "2026-08-29",
      effectiveTo: null,
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/merchant-admin/payroll-schedule-policy",
      { query: { referenceDate: "2026-08-29" } },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/merchant-admin/payroll-schedule-policy",
      {
        method: "PUT",
        body: expect.not.objectContaining({ shopId: expect.anything() }),
      },
    );
  });

  it("encodes the canonical technician NeeDoID and uses employee override routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const body = {
      inheritShopPolicy: true,
      cadence: null,
      weeklySettlementWeekday: null,
      monthlySettlementDay: null,
      holidayAdjustment: null,
      timezone: null,
      effectiveFrom: "2026-08-29",
      effectiveTo: null,
    } as const;
    await payrollSchedulePolicyApi.getEmployee(" s0000000047/東京 ", "2026-08-29");
    await payrollSchedulePolicyApi.updateEmployee(" s0000000047/東京 ", body);

    const path =
      "/merchant-admin/employees/s0000000047%2F%E6%9D%B1%E4%BA%AC/payroll-schedule-policy";
    expect(httpClient.request).toHaveBeenNthCalledWith(1, path, {
      query: { referenceDate: "2026-08-29" },
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, path, {
      method: "PUT",
      body,
    });
  });
});
