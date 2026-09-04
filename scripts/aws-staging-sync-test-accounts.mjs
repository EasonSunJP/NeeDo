import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  orchestrateStagingAccountSync,
  sha256Hex,
  writeRedactedEvidenceAtomic
} from "./aws-staging-account-sync-lib.mjs";

const execFileAsync = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "outputs", "aws-staging");
const environmentEvidencePath = path.join(outputDirectory, "environment-acceptance.json");
const deploymentEvidencePath = path.join(outputDirectory, "application-deployment.json");
const accountSyncEvidencePath = path.join(outputDirectory, "account-sync.json");

const fail = (message) => { throw new Error(message); };

function parseArgs(argv) {
  const allowed = new Set(["--profile", "--account-id", "--region", "--bundle", "--sha256", "--source-revision"]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || !value || value.startsWith("--") || parsed[flag]) fail("Expected exact staging account-sync arguments");
    parsed[flag] = value;
  }
  if (Object.keys(parsed).length !== allowed.size
    || parsed["--profile"] !== "needo-staging-bootstrap"
    || parsed["--account-id"] !== "430611185505"
    || parsed["--region"] !== "ap-southeast-2"
    || !path.isAbsolute(parsed["--bundle"] ?? "")
    || !/^[a-f0-9]{64}$/.test(parsed["--sha256"] ?? "")
    || !/^[a-f0-9]{40}$/.test(parsed["--source-revision"] ?? "")) fail("Staging account-sync target is not approved");
  return {
    profile: parsed["--profile"], accountId: parsed["--account-id"], region: parsed["--region"],
    bundlePath: parsed["--bundle"], bundleSha256: parsed["--sha256"], sourceRevision: parsed["--source-revision"]
  };
}

function createAws({ executable, profile, region }) {
  if (!path.isAbsolute(executable ?? "")) fail("NEEDO_AWS_CLI must be an absolute AWS CLI v2 path");
  const json = async (args) => {
    try {
      const result = await execFileAsync(executable, [...args, "--profile", profile, "--region", region, "--output", "json", "--no-cli-pager"], {
        env: { ...process.env, AWS_CLI_AUTO_PROMPT: "off", AWS_PAGER: "" }, maxBuffer: 4 * 1024 * 1024
      });
      return result.stdout.trim() ? JSON.parse(result.stdout) : {};
    } catch {
      fail(`AWS operation failed: ${args[0]} ${args[1]}`);
    }
  };
  return { json };
}

function stackOutput(stack, key) {
  const matches = stack?.Stacks?.length === 1 && Array.isArray(stack.Stacks[0]?.Outputs)
    ? stack.Stacks[0].Outputs.filter((output) => output?.OutputKey === key) : [];
  if (matches.length !== 1 || typeof matches[0].OutputValue !== "string" || !matches[0].OutputValue) fail(`Missing staging stack output: ${key}`);
  return matches[0].OutputValue;
}

function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitForReadonlyCommand(aws, commandId, instanceId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const invocation = await aws.json(["ssm", "get-command-invocation", "--command-id", commandId, "--instance-id", instanceId]);
    if (invocation?.Status === "Success" && invocation?.ResponseCode === 0) {
      try {
        const result = JSON.parse(String(invocation.StandardOutputContent ?? "").trim());
        if (Object.keys(result).length === 1 && /^[a-f0-9]{40}$/.test(result.sourceRevision ?? "")) return result.sourceRevision;
      } catch { /* rejected below */ }
      fail("Active release probe returned an invalid summary");
    }
    if (["Cancelled", "Cancelling", "Failed", "TimedOut", "Undeliverable", "Terminated"].includes(invocation?.Status)) fail("Active release probe failed");
    await sleep(5_000);
  }
  fail("Active release probe timed out");
}

async function readActiveReleaseRevision(aws, instanceId) {
  const command = [
    "set -euo pipefail", "current_release=$(readlink -f /srv/needo/current)", "test -d \"$current_release\"",
    "manifest_path=\"$current_release/application-deployment.json\"", "test -f \"$manifest_path\"",
    "node -e 'const fs=require(\"fs\"); const value=JSON.parse(fs.readFileSync(process.argv[1],\"utf8\")); process.stdout.write(JSON.stringify({sourceRevision:value.sourceRevision}))' \"$manifest_path\""
  ].join("\n");
  const sent = await aws.json(["ssm", "send-command", "--document-name", "AWS-RunShellScript", "--instance-ids", instanceId, "--timeout-seconds", "120", "--comment", "NeeDo staging active release probe", "--parameters", JSON.stringify({ commands: [command], executionTimeout: ["120"] })]);
  const commandId = sent?.Command?.CommandId;
  if (!/^[0-9a-f-]{36}$/.test(commandId ?? "")) fail("Active release probe command identity is invalid");
  return waitForReadonlyCommand(aws, commandId, instanceId);
}

async function verifyRegistrationDisabled(hostname) {
  const body = JSON.stringify({ email: "invalid", password: "invalid", challengeId: "invalid", otp: "invalid" });
  const results = await Promise.all(["/api/v1/auth/register", "/api/v1/auth/register/verify"].map(async (route) => {
    const response = await fetch(`https://${hostname}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(10_000) });
    let payload;
    try { payload = await response.json(); } catch { fail("Registration endpoint returned invalid JSON"); }
    return response.status === 403 && payload?.code === 40313;
  }));
  if (!results.every(Boolean)) fail("Public registration is not disabled");
  return 40313;
}

async function collectLiveEnvironment(aws, target, environment, deployment) {
  const resourceIds = environment?.resourceIds;
  if (environment?.accountId !== target.accountId || environment?.region !== target.region || environment?.stack?.name !== "needo-staging-infrastructure" || typeof environment?.hostname !== "string" || !resourceIds) fail("Environment evidence is not an accepted staging target");
  if (deployment?.gate !== "aws-staging-application-deployment" || deployment?.status !== "passed" || deployment?.sourceRevision !== target.sourceRevision || deployment?.applicationDeployed !== true) fail("Application deployment evidence is not accepted for this revision");
  const caller = await aws.json(["sts", "get-caller-identity"]);
  const stack = await aws.json(["cloudformation", "describe-stacks", "--stack-name", environment.stack.name]);
  const instanceId = stackOutput(stack, "InstanceId");
  const volumeId = stackOutput(stack, "DataVolumeId");
  const releaseBucket = stackOutput(stack, "ReleaseBucketName");
  const backupBucket = stackOutput(stack, "BackupBucketName");
  const registered = await aws.json(["ssm", "describe-instance-information", "--filters", `Key=InstanceIds,Values=${instanceId}`]);
  const registrations = registered?.InstanceInformationList;
  const ssmOnline = Array.isArray(registrations) && registrations.length === 1 && registrations[0]?.InstanceId === instanceId && registrations[0]?.PingStatus === "Online";
  const activeReleaseRevision = await readActiveReleaseRevision(aws, instanceId);
  const registrationCode = await verifyRegistrationDisabled(environment.hostname);
  return {
    accountId: caller?.Account, region: target.region, callerKind: String(caller?.Arn ?? "").includes(":assumed-role/") ? "assumed-role" : "other",
    stackName: environment.stack.name, stackStatus: stack?.Stacks?.[0]?.StackStatus, instanceId, volumeId, releaseBucket, backupBucket,
    releaseRevision: activeReleaseRevision, ssmOnline, registrationCode, applicationDeployment: { sourceRevision: deployment.sourceRevision, status: deployment.status }
  };
}

async function main() {
  const target = parseArgs(process.argv.slice(2));
  const [bundle, environmentBytes, deploymentBytes] = await Promise.all([fs.readFile(target.bundlePath), fs.readFile(environmentEvidencePath), fs.readFile(deploymentEvidencePath)]);
  if (sha256Hex(bundle) !== target.bundleSha256) fail("Bundle SHA-256 does not match the approved argument");
  const environment = JSON.parse(environmentBytes.toString("utf8"));
  const deployment = JSON.parse(deploymentBytes.toString("utf8"));
  const aws = createAws({ executable: process.env.NEEDO_AWS_CLI, profile: target.profile, region: target.region });
  const live = await collectLiveEnvironment(aws, target, environment, deployment);
  const evidence = await orchestrateStagingAccountSync({
    aws,
    input: { ...target, bundleBytes: bundle.length, instanceId: environment.resourceIds.instanceId, volumeId: environment.resourceIds.dataVolumeId, releaseBucket: environment.resourceIds.releaseBucketName, backupBucket: environment.resourceIds.backupBucketName },
    localSha256: sha256Hex(bundle), live, timestamp: new Date().toISOString(),
    writeEvidence: (value) => writeRedactedEvidenceAtomic(accountSyncEvidencePath, value)
  });
  process.stdout.write(`${JSON.stringify({ gate: evidence.gate, status: evidence.status, sourceRevision: evidence.sourceRevision, evidenceFile: path.relative(repositoryRoot, accountSyncEvidencePath) })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ gate: "aws-staging-account-sync", status: "failed", reason: String(error?.message ?? "unknown error").slice(0, 240) })}\n`);
  process.exitCode = 1;
});
