import { LedgerCurrencyService } from "../src/services/ledger-currency.service";

describe("LedgerCurrencyService", () => {
  it.each([
    [true, "TEST_NDP"],
    [false, "NDP"]
  ] as const)("maps isTestAccount=%s to %s", async (isTestAccount, expected) => {
    const repository = {
      findUserAccountClassification: jest.fn().mockResolvedValue({ isTestAccount })
    };

    await expect(new LedgerCurrencyService(repository).resolveForUser(41)).resolves.toBe(expected);
  });

  it("rejects a missing user", async () => {
    const repository = {
      findUserAccountClassification: jest.fn().mockResolvedValue(null)
    };

    await expect(new LedgerCurrencyService(repository).resolveForUser(404)).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it("rejects a mixed wallet currency", () => {
    expect(() =>
      LedgerCurrencyService.assertSameCurrency("NDP", ["NDP", "TEST_NDP"])
    ).toThrow("error.ledger.currency_mismatch");
  });
});
