// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildJestInvocations, resolveShardCount } = require("../scripts/run-jest-suite.cjs") as {
  buildJestInvocations: (args: string[], shardCount: number) => string[][];
  resolveShardCount: (value: string | undefined) => number;
};

describe("Jest suite runner", () => {
  it("splits a full suite into serial shards so each Node process can release memory", () => {
    expect(buildJestInvocations([], 4)).toEqual([
      ["--runInBand", "--shard=1/4"],
      ["--runInBand", "--shard=2/4"],
      ["--runInBand", "--shard=3/4"],
      ["--runInBand", "--shard=4/4"]
    ]);
  });

  it("keeps focused npm test arguments in one serial Jest invocation", () => {
    expect(buildJestInvocations(["tests/booking-api.test.ts", "-t", "cancel"], 4)).toEqual([
      ["--runInBand", "tests/booking-api.test.ts", "-t", "cancel"]
    ]);
  });

  it("accepts a positive shard override and rejects invalid values", () => {
    expect(resolveShardCount(undefined)).toBe(12);
    expect(resolveShardCount("6")).toBe(6);
    expect(() => resolveShardCount("0")).toThrow("JEST_SHARD_COUNT");
    expect(() => resolveShardCount("abc")).toThrow("JEST_SHARD_COUNT");
  });
});
