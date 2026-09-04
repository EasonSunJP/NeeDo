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
import { requireAcceptedEnvironment } from "./aws-staging-application-lib.mjs";

const execFileAsync = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "outputs", "aws-staging");
const environmentEvidencePath = path.join(outputDirectory, "environment-acceptance.json");
const deploymentEvidencePath = path.join(outputDirectory, "application-deployment.json");
const accountSyncEvidencePath = path.join(outputDirectory, "account-sync.json");

const fail = (message) => { throw new Error(message); };
const shellQuote = (value) => {
  if (typeof value !== "string" || !value || /[\0\r\n]/u.test(value)) fail("Active release probe value is invalid");
  return `'${value.replaceAll("'", "'\\''")}'`;
};

export function buildActiveReleaseProbeCommand({
  manifestPath = "/srv/needo/active-release.json",
  currentLink = "/srv/needo/current",
  releaseRoot = "/srv/needo/releases"
} = {}) {
  if (![manifestPath, currentLink, releaseRoot].every((value) => path.isAbsolute(value))) fail("Active release probe path is invalid");
  const python = "import json,os,re,sys; manifest,current,root=sys.argv[1:4]; value=json.load(open(manifest,encoding='utf-8')); assert set(value)=={'sourceRevision','archiveSha256'}; revision=value['sourceRevision']; archive=value['archiveSha256']; assert isinstance(revision,str) and re.fullmatch(r'[a-f0-9]{40}',revision); assert isinstance(archive,str) and re.fullmatch(r'[a-f0-9]{64}',archive); expected=os.path.join(os.path.realpath(root),revision+'-'+archive[:16]); assert os.path.realpath(current)==expected; print(json.dumps({'sourceRevision':revision},separators=(',',':')))";
  return [
    "set -euo pipefail", `manifest_path=${shellQuote(manifestPath)}`, `current_link=${shellQuote(currentLink)}`, "test -f \"$manifest_path\"",
    "current_release=$(readlink -f \"$current_link\")", "test -d \"$current_release\"",
    `python3 -c ${shellQuote(python)} \"$manifest_path\" \"$current_release\" ${shellQuote(releaseRoot)}`
  ].join("\n");
}

export function parseArgs(argv) {
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

export function createAws({ executable, profile, region, execute = execFileAsync }) {
  if (!path.isAbsolute(executable ?? "")) fail("NEEDO_AWS_CLI must be an absolute AWS CLI v2 path");
  const json = async (args, { allowInvocationDelay = false } = {}) => {
    try {
      const result = await execute(executable, [...args, "--profile", profile, "--region", region, "--output", "json", "--no-cli-pager"], {
        env: { ...process.env, AWS_CLI_AUTO_PROMPT: "off", AWS_PAGER: "" }, maxBuffer: 4 * 1024 * 1024
      });
      return result.stdout.trim() ? JSON.parse(result.stdout) : {};
    } catch (error) {
      if (allowInvocationDelay && String(error?.stderr ?? "").includes("InvocationDoesNotExist")) return null;
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
    const invocation = await aws.json(["ssm", "get-command-invocation", "--command-id", commandId, "--instance-id", instanceId], { allowInvocationDelay: true });
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
  const command = buildActiveReleaseProbeCommand();
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

export function requireAcceptedDeployment(deployment, target, accepted) {
  const deploymentKeys = ["gate", "status", "timestamp", "accountId", "region", "hostname", "sourceRevision", "archiveSha256", "releaseObjectKey", "objectVersionId", "snapshotId", "instanceId", "commandId", "secretVersionCount", "applicationDeployed", "migrationRun", "seedRun", "dnsModified", "businessDataMutation"];
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment) || JSON.stringify(Object.keys(deployment).sort()) !== JSON.stringify(deploymentKeys.sort())
    || deployment.gate !== "aws-staging-application-deployment" || deployment.status !== "passed" || deployment.accountId !== target.accountId || deployment.region !== target.region || deployment.hostname !== accepted.hostname || deployment.sourceRevision !== target.sourceRevision || deployment.instanceId !== accepted.instanceId || deployment.applicationDeployed !== true || deployment.migrationRun !== true || deployment.seedRun !== false || deployment.dnsModified !== false || deployment.businessDataMutation !== true || deployment.secretVersionCount !== 1 || !/^[a-f0-9]{64}$/.test(deployment.archiveSha256 ?? "") || !/^[A-Za-z0-9._-]{1,1024}$/.test(deployment.objectVersionId ?? "") || !/^snap-[0-9a-f]{17}$/.test(deployment.snapshotId ?? "") || !/^[0-9a-f-]{36}$/.test(deployment.commandId ?? "")) fail("Application deployment evidence is not accepted for this revision");
  if (deployment.releaseObjectKey !== `staging/releases/${deployment.sourceRevision}/${deployment.archiveSha256}.tar.gz`) fail("Application deployment evidence is not accepted for this revision");
  return Object.freeze({ ...deployment });
}

async function collectLiveEnvironment(aws, target, environment, deployment) {
  const accepted = requireAcceptedEnvironment(environment);
  const approvedDeployment = requireAcceptedDeployment(deployment, target, accepted);
  const caller = await aws.json(["sts", "get-caller-identity"]);
  const stack = await aws.json(["cloudformation", "describe-stacks", "--stack-name", accepted.stackName]);
  const instanceId = stackOutput(stack, "InstanceId");
  const volumeId = stackOutput(stack, "DataVolumeId");
  const releaseBucket = stackOutput(stack, "ReleaseBucketName");
  const backupBucket = stackOutput(stack, "BackupBucketName");
  const registered = await aws.json(["ssm", "describe-instance-information", "--filters", `Key=InstanceIds,Values=${instanceId}`]);
  const registrations = registered?.InstanceInformationList;
  const ssmOnline = Array.isArray(registrations) && registrations.length === 1 && registrations[0]?.InstanceId === instanceId && registrations[0]?.PingStatus === "Online";
  if (instanceId !== accepted.instanceId || volumeId !== accepted.dataVolumeId || releaseBucket !== accepted.releaseBucketName || backupBucket !== accepted.backupBucketName) fail("Live stack outputs changed after environment acceptance");
  const activeReleaseRevision = await readActiveReleaseRevision(aws, instanceId);
  const registrationCode = await verifyRegistrationDisabled(accepted.hostname);
  return {
    accountId: caller?.Account, region: target.region, callerKind: String(caller?.Arn ?? "").includes(":assumed-role/") ? "assumed-role" : "other",
    stackName: accepted.stackName, stackStatus: stack?.Stacks?.[0]?.StackStatus, instanceId, volumeId, releaseBucket, backupBucket,
    releaseRevision: activeReleaseRevision, ssmOnline, registrationCode, applicationDeployment: { sourceRevision: approvedDeployment.sourceRevision, status: approvedDeployment.status }
  };
}

async function main() {
  const target = parseArgs(process.argv.slice(2));
  const [bundle, environmentBytes, deploymentBytes] = await Promise.all([fs.readFile(target.bundlePath), fs.readFile(environmentEvidencePath), fs.readFile(deploymentEvidencePath)]);
  if (sha256Hex(bundle) !== target.bundleSha256) fail("Bundle SHA-256 does not match the approved argument");
  const environment = JSON.parse(environmentBytes.toString("utf8"));
  const deployment = JSON.parse(deploymentBytes.toString("utf8"));
  const accepted = requireAcceptedEnvironment(environment);
  const aws = createAws({ executable: process.env.NEEDO_AWS_CLI, profile: target.profile, region: target.region });
  const live = await collectLiveEnvironment(aws, target, environment, deployment);
  const evidence = await orchestrateStagingAccountSync({
    aws,
    input: { ...target, bundleBytes: bundle.length, instanceId: accepted.instanceId, volumeId: accepted.dataVolumeId, releaseBucket: accepted.releaseBucketName, backupBucket: accepted.backupBucketName },
    localSha256: sha256Hex(bundle), live, timestamp: new Date().toISOString(),
    writeEvidence: (value) => writeRedactedEvidenceAtomic(accountSyncEvidencePath, value)
  });
  process.stdout.write(`${JSON.stringify({ gate: evidence.gate, status: evidence.status, sourceRevision: evidence.sourceRevision, evidenceFile: path.relative(repositoryRoot, accountSyncEvidencePath) })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ gate: "aws-staging-account-sync", status: "failed" })}\n`);
    process.exitCode = 1;
  });
}
