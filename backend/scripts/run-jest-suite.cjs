const { spawnSync } = require("node:child_process");

const DEFAULT_SHARD_COUNT = 4;

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
  if (args.length > 0) {
    return [["--runInBand", ...args]];
  }

  return Array.from({ length: shardCount }, (_value, index) => [
    "--runInBand",
    `--shard=${index + 1}/${shardCount}`
  ]);
};

const run = () => {
  const shardCount = resolveShardCount(process.env.JEST_SHARD_COUNT);
  const invocations = buildJestInvocations(process.argv.slice(2), shardCount);
  const jestBin = require.resolve("jest/bin/jest");

  for (const args of invocations) {
    const result = spawnSync(process.execPath, [jestBin, ...args], {
      env: process.env,
      stdio: "inherit"
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
};

if (require.main === module) {
  run();
}

module.exports = { buildJestInvocations, resolveShardCount };
