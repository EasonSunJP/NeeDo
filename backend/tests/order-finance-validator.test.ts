import { serviceIncomeReportBodySchema } from "../src/validators/order-finance.validator";

describe("service income component validation", () => {
  it("accepts an exact persisted service, extension, and nomination breakdown", () => {
    expect(
      serviceIncomeReportBodySchema.parse({
        serviceAmountJpy: 15_500,
        baseServiceAmountJpy: 10_000,
        extensionAmountJpy: 4_000,
        nominationChargeAmountJpy: 1_500,
        wasTechnicianNominated: true,
        platformCollectedServiceAmountJpy: 15_500
      })
    ).toMatchObject({
      baseServiceAmountJpy: 10_000,
      extensionAmountJpy: 4_000,
      nominationChargeAmountJpy: 1_500,
      wasTechnicianNominated: true
    });
  });

  it("rejects a component breakdown that does not equal total service income", () => {
    expect(() =>
      serviceIncomeReportBodySchema.parse({
        serviceAmountJpy: 15_500,
        baseServiceAmountJpy: 10_000,
        extensionAmountJpy: 4_000,
        nominationChargeAmountJpy: 0
      })
    ).toThrow();
  });

  it("keeps aggregate-only historical reports valid without inventing components", () => {
    const parsed = serviceIncomeReportBodySchema.parse({ serviceAmountJpy: 8_800 });
    expect(parsed.serviceAmountJpy).toBe(8_800);
    expect(parsed).not.toHaveProperty("baseServiceAmountJpy");
    expect(parsed).not.toHaveProperty("extensionAmountJpy");
    expect(parsed).not.toHaveProperty("nominationChargeAmountJpy");
    expect(parsed).not.toHaveProperty("wasTechnicianNominated");
  });
});
