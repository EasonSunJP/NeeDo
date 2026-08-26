import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../src/utils/transaction-conflict-retry";

describe("transaction conflict retry", () => {
  it.each([
    [{ code: "P2034" }],
    [{ code: "1213" }],
    [{ meta: { code: "1213" } }],
    [{ message: "Deadlock found when trying to get lock" }],
    [{ message: "SQLSTATE 40001 serialization failure" }]
  ])("recognizes a retryable transaction conflict", (error) => {
    expect(isRetryableTransactionConflict(error)).toBe(true);
  });

  it("stops after three failed transaction attempts and preserves the final error", async () => {
    const finalFailure = Object.assign(new Error("deadlock 1213"), { code: "P2034" });
    const operation = jest.fn().mockRejectedValue(finalFailure);

    await expect(runWithTransactionConflictRetry(operation)).rejects.toBe(finalFailure);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry an unrelated failure", async () => {
    const failure = new Error("validation conflict");
    const operation = jest.fn().mockRejectedValue(failure);

    await expect(runWithTransactionConflictRetry(operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
