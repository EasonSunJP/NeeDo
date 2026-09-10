const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const DEFAULT_SHARD_COUNT = 12;
const DEFAULT_BATCH_LIMITS = {
  maxFiles: 12,
  maxSourceBytes: 128 * 1024,
  isolateSourceBytes: 48 * 1024
};
const TEST_COUNT_KEYS = [
  "numTotalTestSuites",
  "numPassedTestSuites",
  "numFailedTestSuites",
  "numPendingTestSuites",
  "numTotalTests",
  "numPassedTests",
  "numFailedTests",
  "numPendingTests",
  "numTodoTests"
];

const resolveShardCount = (value) => {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_SHARD_COUNT;
  }

  const shardCount = Number(value);
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error("JEST_SHARD_COUNT must be a positive integer");
  }

  return shardCount;
};

const buildJestInvocations = (args, shardCount) => {
  const normalizedArgs = args.filter((arg) => arg !== "--runInBand");

  if (normalizedArgs.length > 0) {
    return [["--runInBand", ...normalizedArgs]];
  }

  return Array.from({ length: shardCount }, (_value, index) => [
    "--runInBand",
    `--shard=${index + 1}/${shardCount}`
  ]);
};

const buildTestFileInvocations = (testFiles, fileSize, limits = DEFAULT_BATCH_LIMITS) => {
  const isolatedFiles = [];
  const batchableFiles = [];

  for (const testFile of testFiles) {
    const sourceBytes = fileSize(testFile);
    if (sourceBytes >= limits.isolateSourceBytes || limits.isolateTestFile?.(testFile)) {
      isolatedFiles.push(testFile);
    } else {
      batchableFiles.push({ sourceBytes, testFile });
    }
  }

  const invocations = isolatedFiles.map((testFile) => [
    "--runInBand",
    "--runTestsByPath",
    testFile
  ]);
  let batch = [];
  let batchSourceBytes = 0;

  const flushBatch = () => {
    if (batch.length === 0) return;
    invocations.push(["--runInBand", "--runTestsByPath", ...batch]);
    batch = [];
    batchSourceBytes = 0;
  };

  for (const { sourceBytes, testFile } of batchableFiles) {
    const exceedsFileLimit = batch.length >= limits.maxFiles;
    const exceedsSourceLimit =
      batch.length > 0 && batchSourceBytes + sourceBytes > limits.maxSourceBytes;
    if (exceedsFileLimit || exceedsSourceLimit) flushBatch();

    batch.push(testFile);
    batchSourceBytes += sourceBytes;
  }

  flushBatch();
  return invocations;
};

const listTestFiles = (jestBin) => {
  const result = spawnSync(process.execPath, [jestBin, "--listTests"], {
    encoding: "utf8",
    env: process.env
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    throw new Error(`Jest test discovery failed with exit code ${result.status ?? 1}`);
  }

  return result.stdout
    .split("\n")
    .map((testFile) => testFile.trim())
    .filter(Boolean)
    .sort();
};

const requiresIsolatedProcess = (source) => /["'](?:supertest|bcryptjs)["']/.test(source);

const executeInvocations = (invocations, execute) => {
  let failed = 0;

  for (let index = 0; index < invocations.length; index += 1) {
    let result;
    try {
      result = execute(invocations[index], index);
    } catch (error) {
      result = { status: null, error };
    }

    if (result.error || result.status !== 0) {
      failed += 1;
    }
  }

  return {
    completed: invocations.length,
    failed,
    exitCode: failed === 0 ? 0 : 1
  };
};

const addTestCounts = (total, result) => {
  const next = { ...total };
  for (const key of TEST_COUNT_KEYS) {
    next[key] = (next[key] ?? 0) + (typeof result[key] === "number" ? result[key] : 0);
  }
  return next;
};

const formatAggregateCounts = (counts) =>
  [
    `Test Suites: ${counts.numFailedTestSuites} failed, ${counts.numPendingTestSuites} skipped, ${counts.numPassedTestSuites} passed, ${counts.numTotalTestSuites} total`,
    `Tests:       ${counts.numFailedTests} failed, ${counts.numPendingTests} skipped, ${counts.numTodoTests} todo, ${counts.numPassedTests} passed, ${counts.numTotalTests} total`
  ].join("\n");

const run = () => {
  const rawArgs = process.argv.slice(2);
  const jestBin = require.resolve("jest/bin/jest");
  const normalizedArgs = rawArgs.filter((arg) => arg !== "--runInBand");
  let invocations;

  if (normalizedArgs.length > 0) {
    invocations = buildJestInvocations(rawArgs, 1);
  } else if (process.env.JEST_SHARD_COUNT?.trim()) {
    invocations = buildJestInvocations([], resolveShardCount(process.env.JEST_SHARD_COUNT));
  } else {
    invocations = buildTestFileInvocations(
      listTestFiles(jestBin),
      (testFile) => statSync(testFile).size,
      {
        ...DEFAULT_BATCH_LIMITS,
        isolateTestFile: (testFile) => requiresIsolatedProcess(readFileSync(testFile, "utf8"))
      }
    );
  }

  if (invocations.length === 1) {
    const outcome = executeInvocations(invocations, (args) =>
      spawnSync(process.execPath, [jestBin, ...args], {
        env: process.env,
        stdio: "inherit"
      })
    );
    process.exitCode = outcome.exitCode;
    return;
  }

  const resultDirectory = mkdtempSync(join(tmpdir(), "needo-jest-suite-"));
  let aggregateCounts = {};
  let resultFileCount = 0;

  try {
    const outcome = executeInvocations(invocations, (args, index) => {
      const batchNumber = index + 1;
      const resultPath = join(resultDirectory, `batch-${batchNumber}.json`);
      process.stderr.write(`\n[jest-suite] starting batch ${batchNumber}/${invocations.length}\n`);

      const result = spawnSync(
        process.execPath,
        [jestBin, ...args, "--json", `--outputFile=${resultPath}`],
        { env: process.env, stdio: "inherit" }
      );

      if (result.error) {
        process.stderr.write(
          `[jest-suite] batch ${batchNumber} could not start: ${result.error.message}\n`
        );
        return result;
      }

      if (!existsSync(resultPath)) {
        process.stderr.write(`[jest-suite] batch ${batchNumber} did not produce a result file\n`);
        return { status: result.status === 0 ? 1 : result.status };
      }

      try {
        aggregateCounts = addTestCounts(
          aggregateCounts,
          JSON.parse(readFileSync(resultPath, "utf8"))
        );
        resultFileCount += 1;
      } catch (error) {
        process.stderr.write(
          `[jest-suite] batch ${batchNumber} result could not be read: ${error.message}\n`
        );
        return { status: result.status === 0 ? 1 : result.status };
      }

      return result;
    });

    process.stderr.write("\n[jest-suite] aggregate result\n");
    process.stderr.write(`${formatAggregateCounts(aggregateCounts)}\n`);
    process.stderr.write(
      `[jest-suite] batches: ${outcome.completed} completed, ${outcome.failed} failed; result files: ${resultFileCount}/${invocations.length}\n`
    );
    process.exitCode = outcome.exitCode;
  } finally {
    rmSync(resultDirectory, { force: true, recursive: true });
  }
};

if (require.main === module) {
  run();
}

module.exports = {
  addTestCounts,
  buildJestInvocations,
  buildTestFileInvocations,
  executeInvocations,
  formatAggregateCounts,
  requiresIsolatedProcess,
  resolveShardCount
};
