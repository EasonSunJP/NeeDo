import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createAwsCli } from "./aws-staging-cli.mjs";
import {
  parseAwsStagingArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
import { deployAwsStagingInfrastructure } from "./aws-staging-deploy-lib.mjs";
import { runAwsStagingPreflight } from "./aws-staging-preflight-lib.mjs";

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(modulePath);
const defaultOutputDirectory = path.resolve(moduleDir, "..", "outputs", "aws-staging");
const evidenceFileName = "environment-stack.json";

function assertRedactedEvidence(evidence) {
  if (!evidence || typeof evidence !== "object"
    || evidence.scope !== "environment-only"
    || evidence.applicationDeployed !== false
    || evidence.migrationRun !== false
    || evidence.seedRun !== false
    || evidence.dnsModified !== false) {
    throw new Error("AWS Staging evidence is missing the explicit environment-only scope flags");
  }

  const serialized = JSON.stringify(evidence);
  if (/arn:[a-z0-9-]+:/i.test(serialized)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)
    || /"(?:alertEmail|callerArn|credentials|parameters|userData)"\s*:/i.test(serialized)) {
    throw new Error("AWS Staging evidence contains a forbidden secret, ARN, email, or parameter surface");
  }
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export async function writeAwsStagingEnvironmentEvidence({
  evidence,
  outputDirectory = defaultOutputDirectory,
  fileSystem = fs
}) {
  const contents = assertRedactedEvidence(evidence);
  await fileSystem.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const directoryStat = await fileSystem.lstat(outputDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("AWS Staging evidence output path must be a real directory");
  }
  await fileSystem.chmod(outputDirectory, 0o700);

  const finalPath = path.join(outputDirectory, evidenceFileName);
  const temporaryPath = path.join(
    outputDirectory,
    `.${evidenceFileName}.${process.pid}.${randomUUID()}.tmp`
  );
  let temporaryCreated = false;

  try {
    const handle = await fileSystem.open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fileSystem.chmod(temporaryPath, 0o600);
    await fileSystem.rename(temporaryPath, finalPath);
    temporaryCreated = false;
    await fileSystem.chmod(finalPath, 0o600);
    return finalPath;
  } finally {
    if (temporaryCreated) {
      await fileSystem.unlink(temporaryPath).catch(() => {});
    }
  }
}

export async function runAwsStagingDeployCli(argv) {
  const config = resolveAwsStagingConfig(parseAwsStagingArgs(argv));
  const aws = createAwsCli({ profile: config.profile, region: config.region });
  const evidence = await deployAwsStagingInfrastructure({
    aws,
    config,
    runPreflight: runAwsStagingPreflight
  });
  const evidencePath = await writeAwsStagingEnvironmentEvidence({ evidence });
  return Object.freeze({
    gate: "aws-staging-deploy",
    scope: evidence.scope,
    stackStatus: evidence.stackStatus,
    evidenceFile: path.relative(path.resolve(moduleDir, ".."), evidencePath),
    applicationDeployed: false,
    migrationRun: false,
    seedRun: false,
    dnsModified: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const summary = await runAwsStagingDeployCli(process.argv.slice(2));
  console.log(JSON.stringify(summary));
}
