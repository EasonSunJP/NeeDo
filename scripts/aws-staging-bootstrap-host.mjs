import { fileURLToPath, pathToFileURL } from "node:url";
import { createFrozenAwsCli } from "./aws-staging-cli.mjs";
import {
  parseAwsStagingBoundArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
import { bootstrapAwsStagingHost } from "./aws-staging-bootstrap-host-lib.mjs";
import { runAwsStagingPreflight } from "./aws-staging-preflight-lib.mjs";
import {
  captureAwsStagingRuntimeArtifact,
  requireAwsStagingRuntimeArtifact
} from "./aws-staging-runtime-artifact.mjs";

const modulePath = fileURLToPath(import.meta.url);

const FAILURE = Object.freeze({
  gate: "aws-staging-host-bootstrap",
  status: "failed"
});
const FAILURE_LINE = "{\"gate\":\"aws-staging-host-bootstrap\",\"status\":\"failed\"}";

function writeStdoutLine(line) {
  process.stdout.write(`${line}\n`);
}

function writeStderrLine(line) {
  process.stderr.write(`${line}\n`);
}

function setProcessExitCode(code) {
  process.exitCode = code;
}

export async function main(argv = process.argv.slice(2), {
  captureRuntimeArtifactImpl = captureAwsStagingRuntimeArtifact,
  parseAwsStagingBoundArgsImpl = parseAwsStagingBoundArgs,
  resolveAwsStagingConfigImpl = resolveAwsStagingConfig,
  createAwsCliImpl = createFrozenAwsCli,
  bootstrapAwsStagingHostImpl = bootstrapAwsStagingHost,
  runPreflightImpl = runAwsStagingPreflight
} = {}) {
  const runtimeArtifact = await captureRuntimeArtifactImpl({ argv, entrypointPath: modulePath });
  const parsed = parseAwsStagingBoundArgsImpl(argv);
  requireAwsStagingRuntimeArtifact(runtimeArtifact, parsed.sourceRevision);
  const config = resolveAwsStagingConfigImpl(parsed);
  await runtimeArtifact.assertCurrentState();
  const aws = await createAwsCliImpl({
    profile: config.profile,
    region: config.region,
    assertRuntimeCurrent: runtimeArtifact.assertCurrentState
  });
  try {
    return await bootstrapAwsStagingHostImpl({
      aws,
      config,
      runtimeArtifact,
      runPreflight: runPreflightImpl
    });
  } finally {
    await aws.dispose?.();
  }
}

export async function runCli({
  argv = process.argv.slice(2),
  execute = main,
  mainDependencies,
  writeStdout = writeStdoutLine,
  writeStderr = writeStderrLine,
  setExitCode = setProcessExitCode
} = {}) {
  try {
    const summary = await execute(argv, mainDependencies);
    writeStdout(JSON.stringify(summary));
    return { ok: true, summary };
  } catch {
    try {
      writeStderr(FAILURE_LINE);
    } catch {
      // A failed diagnostic channel must not expose the original exception.
    }
    try {
      setExitCode(1);
    } catch {
      process.exitCode = 1;
    }
    return { ok: false, failure: FAILURE };
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  await runCli();
}
