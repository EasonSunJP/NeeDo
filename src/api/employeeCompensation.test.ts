import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { employeeCompensationApi } from "./employeeCompensation";

vi.mock("./httpClient", () => ({
  httpClient: { request: vi.fn() },
}));

describe("employee compensation API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses encoded public NeeDoID routes without client shop or technician IDs", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const input = {
      name: "LifeDance 正式员工薪酬",
      wageMode: "base_plus_commission" as const,
      baseSalaryJpy: 230_000,
      commissionRatePercent: 20,
      bonusRules: [],
      deductionRules: [],
    };
    await employeeCompensationApi.get(" s0000000047/東京 ");
    await employeeCompensationApi.update(" s0000000047/東京 ", input);
    await employeeCompensationApi.preview(" s0000000047/東京 ", {
      serviceAmountJpy: 10_000,
      workedMinutes: 60,
    });

    const path =
      "/merchant-admin/employees/s0000000047%2F%E6%9D%B1%E4%BA%AC/compensation-profile";
    expect(httpClient.request).toHaveBeenNthCalledWith(1, path);
    expect(httpClient.request).toHaveBeenNthCalledWith(2, path, {
      method: "PUT",
      body: expect.not.objectContaining({
        shopId: expect.anything(),
        technicianProfileId: expect.anything(),
      }),
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, `${path}/preview`, {
      method: "POST",
      body: { serviceAmountJpy: 10_000, workedMinutes: 60 },
    });
  });
});
