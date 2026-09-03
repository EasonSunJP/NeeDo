import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFrozenAwsCli } from "./aws-staging-cli.mjs";
import {
  parseAwsStagingArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
import { runAwsStagingPreflight } from "./aws-staging-preflight-lib.mjs";
import {
  verifyAwsStagingEnvironment,
  writeAwsStagingAcceptanceEvidence
} from "./aws-staging-verify-lib.mjs";

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(modulePath);
const repoRoot = path.resolve(moduleDir, "..");
const failure = Object.freeze({
  gate: "aws-staging-environment-acceptance",
  status: "failed"
});
const failureLine = "{\"gate\":\"aws-staging-environment-acceptance\",\"status\":\"failed\"}";

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
  parseAwsStagingArgsImpl = parseAwsStagingArgs,
  resolveAwsStagingConfigImpl = resolveAwsStagingConfig,
  createAwsCliImpl = createFrozenAwsCli,
  runAwsStagingPreflightImpl = runAwsStagingPreflight,
  verifyAwsStagingEnvironmentImpl = verifyAwsStagingEnvironment,
  writeAwsStagingAcceptanceEvidenceImpl = writeAwsStagingAcceptanceEvidence
} = {}) {
  const config = resolveAwsStagingConfigImpl(parseAwsStagingArgsImpl(argv));
  const aws = await createAwsCliImpl({ profile: config.profile, region: config.region });
  try {
    const evidence = await verifyAwsStagingEnvironmentImpl({
      aws,
      config,
      runPreflight: runAwsStagingPreflightImpl
    });
    const evidencePath = await writeAwsStagingAcceptanceEvidenceImpl({ evidence });
    return Object.freeze({
      gate: "aws-staging-environment-acceptance",
      status: "passed",
      evidenceFile: path.relative(repoRoot, evidencePath),
      applicationDeployed: false,
      migrationRun: false,
      seedRun: false,
      dnsModified: false,
      businessDataMutation: false
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
      writeStderr(failureLine);
    } catch {
      // Diagnostic channel failures must not reveal the original exception.
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
