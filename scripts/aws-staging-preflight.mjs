import { fileURLToPath, pathToFileURL } from "node:url";
import { createFrozenAwsCli } from "./aws-staging-cli.mjs";
import {
  parseAwsStagingBoundArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
import {
  createAwsStagingPreflightSummary,
  runAwsStagingPreflight
} from "./aws-staging-preflight-lib.mjs";
import { captureAwsStagingTemplateArtifact } from "./aws-staging-template-artifact.mjs";
import {
  captureAwsStagingRuntimeArtifact,
  requireAwsStagingRuntimeArtifact
} from "./aws-staging-runtime-artifact.mjs";

const modulePath = fileURLToPath(import.meta.url);

const failure = Object.freeze({ gate: "aws-staging-preflight", status: "failed" });
const failureLine = "{\"gate\":\"aws-staging-preflight\",\"status\":\"failed\"}";

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
  captureTemplateArtifactImpl = captureAwsStagingTemplateArtifact,
  createAwsCliImpl = createFrozenAwsCli,
  runAwsStagingPreflightImpl = runAwsStagingPreflight
} = {}) {
  const runtimeArtifact = await captureRuntimeArtifactImpl({ argv, entrypointPath: modulePath });
  const parsed = parseAwsStagingBoundArgsImpl(argv);
  requireAwsStagingRuntimeArtifact(runtimeArtifact, parsed.sourceRevision);
  const config = resolveAwsStagingConfigImpl(parsed);
  const templateArtifact = await captureTemplateArtifactImpl({
    templatePath: config.templatePath,
    approvedRevision: parsed.sourceRevision
  });
  await runtimeArtifact.assertCurrentState();
  await templateArtifact.assertCurrentState();
  const aws = await createAwsCliImpl({
    profile: config.profile,
    region: config.region,
    assertRuntimeCurrent: runtimeArtifact.assertCurrentState
  });
  try {
    const result = await runAwsStagingPreflightImpl({
      aws,
      config,
      runtimeArtifact,
      templateArtifact
    });
    return createAwsStagingPreflightSummary(result);
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
      writeStderr(failureLine);
    } catch {
      // Diagnostic failures must never reveal the original exception.
    }
    try {
      setExitCode(1);
    } catch {
      process.exitCode = 1;
    }
    return { ok: false, failure };
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  await runCli();
}
