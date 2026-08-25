import { LedgerRepository } from "../src/repositories/ledger.repository";

interface LedgerVocabularyAdapter {
  ownerTypeToDb(value: string): string;
  ownerTypeFromDb(value: string): string;
  transactionTypeToDb(value: string): string;
  transactionTypeFromDb(value: string): string;
  directionToDb(value: string): string;
  directionFromDb(value: string): string;
}

describe("affiliate ledger vocabulary", () => {
  const adapter = new LedgerRepository({} as never) as unknown as LedgerVocabularyAdapter;

  it("round-trips merchant-account wallet ownership", () => {
    expect(adapter.ownerTypeToDb("merchant_account")).toBe("MERCHANT_ACCOUNT");
    expect(adapter.ownerTypeFromDb("MERCHANT_ACCOUNT")).toBe("merchant_account");
  });

  it.each([
    ["affiliate_task_budget_freeze", "AFFILIATE_TASK_BUDGET_FREEZE"],
    ["affiliate_task_budget_release", "AFFILIATE_TASK_BUDGET_RELEASE"],
    ["affiliate_reward_settlement", "AFFILIATE_REWARD_SETTLEMENT"],
    ["affiliate_reward_reversal", "AFFILIATE_REWARD_REVERSAL"],
    ["affiliate_reward_recovery", "AFFILIATE_REWARD_RECOVERY"]
  ])("round-trips %s", (serviceValue, dbValue) => {
    expect(adapter.transactionTypeToDb(serviceValue)).toBe(dbValue);
    expect(adapter.transactionTypeFromDb(dbValue)).toBe(serviceValue);
  });

  it("round-trips a frozen-balance credit", () => {
    expect(adapter.directionToDb("frozen_credit")).toBe("FROZEN_CREDIT");
    expect(adapter.directionFromDb("FROZEN_CREDIT")).toBe("frozen_credit");
  });
});
