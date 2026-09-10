/* eslint-disable @typescript-eslint/no-require-imports */
const {
  addTestCounts,
  buildJestInvocations,
  buildTestFileInvocations,
  executeInvocations,
  requiresIsolatedProcess,
  resolveShardCount
} = require("../scripts/run-jest-suite.cjs") as {
  addTestCounts: (
    total: Record<string, number>,
    result: Record<string, number>
  ) => Record<string, number>;
  buildJestInvocations: (args: string[], shardCount: number) => string[][];
  buildTestFileInvocations: (
    testFiles: string[],
    fileSize: (testFile: string) => number,
    limits: {
      maxFiles: number;
      maxSourceBytes: number;
      isolateSourceBytes: number;
      isolateTestFile?: (testFile: string) => boolean;
    }
  ) => string[][];
  executeInvocations: (
    invocations: string[][],
    execute: (args: string[], index: number) => { status: number | null; error?: Error }
  ) => { completed: number; failed: number; exitCode: number };
  requiresIsolatedProcess: (source: string) => boolean;
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
    expect(
      buildJestInvocations(["--runInBand", "tests/booking-api.test.ts", "-t", "cancel"], 4)
    ).toEqual([["--runInBand", "tests/booking-api.test.ts", "-t", "cancel"]]);
  });

  it("still shards the full suite when npm forwards only --runInBand", () => {
    expect(buildJestInvocations(["--runInBand"], 3)).toEqual([
      ["--runInBand", "--shard=1/3"],
      ["--runInBand", "--shard=2/3"],
      ["--runInBand", "--shard=3/3"]
    ]);
  });

  it("builds bounded file batches and isolates source-heavy suites", () => {
    const sizes = new Map([
      ["heavy.test.ts", 8],
      ["one.test.ts", 4],
      ["two.test.ts", 5],
      ["three.test.ts", 6]
    ]);

    expect(
      buildTestFileInvocations(
        ["heavy.test.ts", "one.test.ts", "two.test.ts", "three.test.ts"],
        (testFile) => sizes.get(testFile) ?? 0,
        { maxFiles: 2, maxSourceBytes: 10, isolateSourceBytes: 8 }
      )
    ).toEqual([
      ["--runInBand", "--runTestsByPath", "heavy.test.ts"],
      ["--runInBand", "--runTestsByPath", "one.test.ts", "two.test.ts"],
      ["--runInBand", "--runTestsByPath", "three.test.ts"]
    ]);
  });

  it("isolates CPU-intensive suites even when their source files are small", () => {
    expect(
      buildTestFileInvocations(["before.test.ts", "bcrypt.test.ts", "after.test.ts"], () => 1, {
        maxFiles: 12,
        maxSourceBytes: 128,
        isolateSourceBytes: 64,
        isolateTestFile: (testFile: string) => testFile === "bcrypt.test.ts"
      })
    ).toEqual([
      ["--runInBand", "--runTestsByPath", "bcrypt.test.ts"],
      ["--runInBand", "--runTestsByPath", "before.test.ts", "after.test.ts"]
    ]);
  });

  it("classifies direct HTTP harness and password hashing tests for process isolation", () => {
    expect(requiresIsolatedProcess('import request from "supertest";')).toBe(true);
    expect(requiresIsolatedProcess('import { hash } from "bcryptjs";')).toBe(true);
    expect(requiresIsolatedProcess('import { expect } from "@jest/globals";')).toBe(false);
  });

  it("executes every shard and returns a deterministic failure after collecting all results", () => {
    const seen: string[][] = [];
    const outcome = executeInvocations([["first"], ["second"], ["third"]], (args) => {
      seen.push(args);
      return { status: args[0] === "second" ? 9 : 0 };
    });

    expect(seen).toEqual([["first"], ["second"], ["third"]]);
    expect(outcome).toEqual({ completed: 3, failed: 1, exitCode: 1 });
  });

  it("aggregates complete Jest suite and assertion counts across isolated processes", () => {
    const first = {
      numTotalTestSuites: 2,
      numPassedTestSuites: 2,
      numFailedTestSuites: 0,
      numPendingTestSuites: 0,
      numTotalTests: 7,
      numPassedTests: 6,
      numFailedTests: 0,
      numPendingTests: 1,
      numTodoTests: 0
    };
    const second = {
      numTotalTestSuites: 3,
      numPassedTestSuites: 2,
      numFailedTestSuites: 1,
      numPendingTestSuites: 0,
      numTotalTests: 9,
      numPassedTests: 7,
      numFailedTests: 1,
      numPendingTests: 0,
      numTodoTests: 1
    };

    expect(addTestCounts(addTestCounts({}, first), second)).toEqual({
      numTotalTestSuites: 5,
      numPassedTestSuites: 4,
      numFailedTestSuites: 1,
      numPendingTestSuites: 0,
      numTotalTests: 16,
      numPassedTests: 13,
      numFailedTests: 1,
      numPendingTests: 1,
      numTodoTests: 1
    });
  });

  it("accepts a positive shard override and rejects invalid values", () => {
    expect(resolveShardCount(undefined)).toBe(12);
    expect(resolveShardCount("6")).toBe(6);
    expect(() => resolveShardCount("0")).toThrow("JEST_SHARD_COUNT");
    expect(() => resolveShardCount("abc")).toThrow("JEST_SHARD_COUNT");
  });
});
