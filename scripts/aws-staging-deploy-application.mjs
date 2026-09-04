import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildApplicationDeploymentCommand,
  createRedactedApplicationEvidence,
  releaseKey,
  requireAcceptedEnvironment,
  sha256Hex
} from "./aws-staging-application-lib.mjs";

const execFileAsync = promisify(execFile);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDir, "..");
const outputDirectory = path.join(repositoryRoot, "outputs", "aws-staging");
const environmentEvidencePath = path.join(outputDirectory, "environment-acceptance.json");
const packageEvidencePath = path.join(outputDirectory, "application-package.json");

function parseArgs(argv) {
  const allowed = new Set(["--profile", "--account-id", "--region", "--source-revision"]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || !value || value.startsWith("--") || parsed[flag]) {
      throw new Error("Expected exact application deployment arguments");
    }
    parsed[flag] = value;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(parsed["--profile"] ?? "")
    || parsed["--profile"] === "default"
    || parsed["--account-id"] !== "430611185505"
    || parsed["--region"] !== "ap-southeast-2"
    || !/^[0-9a-f]{40}$/.test(parsed["--source-revision"] ?? "")) {
    throw new Error("Application deployment target is not approved");
  }
  return {
    accountId: parsed["--account-id"],
    profile: parsed["--profile"],
    region: parsed["--region"],
    revision: parsed["--source-revision"]
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createAws({ executable, profile, region }) {
  if (!path.isAbsolute(executable)) throw new Error("NEEDO_AWS_CLI must be an absolute AWS CLI v2 path");
  const invoke = async (args, { allowInvocationDelay = false } = {}) => {
    try {
      const result = await execFileAsync(executable, [
        ...args,
        "--profile", profile,
        "--region", region,
        "--output", "json",
        "--no-cli-pager"
      ], {
        env: {
          ...process.env,
          AWS_CLI_AUTO_PROMPT: "off",
          AWS_PAGER: ""
        },
        maxBuffer: 32 * 1024 * 1024
      });
      return result.stdout.trim() ? JSON.parse(result.stdout) : {};
    } catch (error) {
      if (allowInvocationDelay && String(error?.stderr ?? "").includes("InvocationDoesNotExist")) {
        return null;
      }
      throw new Error(`AWS operation failed: ${args[0]} ${args[1]}`);
    }
  };
  return { json: invoke };
}

function stackOutput(described, key) {
  const stacks = described?.Stacks;
  if (!Array.isArray(stacks) || stacks.length !== 1) throw new Error("Expected one staging stack");
  const outputs = stacks[0]?.Outputs;
  if (!Array.isArray(outputs)) throw new Error("Staging stack outputs are invalid");
  const matches = outputs.filter((item) => item?.OutputKey === key);
  if (matches.length !== 1 || typeof matches[0].OutputValue !== "string") {
    throw new Error(`Missing staging stack output: ${key}`);
  }
  return matches[0].OutputValue;
}

async function waitForSnapshot(aws, snapshotId) {
  let lastState;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const described = await aws.json(["ec2", "describe-snapshots", "--snapshot-ids", snapshotId]);
    const snapshots = described?.Snapshots;
    if (!Array.isArray(snapshots) || snapshots.length !== 1 || snapshots[0]?.SnapshotId !== snapshotId) {
      throw new Error("Snapshot identity could not be verified");
    }
    const state = snapshots[0].State;
    if (state !== lastState) {
      process.stdout.write(`${JSON.stringify({ phase: "snapshot", state })}\n`);
      lastState = state;
    }
    if (state === "completed") return;
    if (state === "error") throw new Error("Pre-migration snapshot failed");
    await sleep(15_000);
  }
  throw new Error("Pre-migration snapshot timed out");
}

async function waitForCommand(aws, commandId, instanceId) {
  let lastStatus;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const invocation = await aws.json([
      "ssm", "get-command-invocation",
      "--command-id", commandId,
      "--instance-id", instanceId
    ], { allowInvocationDelay: true });
    if (!invocation) {
      await sleep(10_000);
      continue;
    }
    const status = invocation.Status;
    if (status !== lastStatus) {
      process.stdout.write(`${JSON.stringify({ phase: "ssm-deployment", status })}\n`);
      lastStatus = status;
    }
    if (status === "Success" && invocation.ResponseCode === 0) return;
    if (["Cancelled", "Cancelling", "Failed", "TimedOut", "Undeliverable", "Terminated"].includes(status)) {
      throw new Error(`SSM application deployment ended with ${status}`);
    }
    await sleep(10_000);
  }
  throw new Error("SSM application deployment timed out");
}

function requestReady(address, hostname) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: address,
      port: 80,
      path: "/api/v1/ready",
      headers: { Host: hostname },
      timeout: 10_000
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (response.statusCode !== 200 || body?.code !== 0) {
            reject(new Error("Public readiness response is invalid"));
            return;
          }
          resolve();
        } catch {
          reject(new Error("Public readiness response is invalid"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Public readiness request timed out")));
    request.on("error", reject);
  });
}

async function main() {
  const target = parseArgs(process.argv.slice(2));
  const awsExecutable = process.env.NEEDO_AWS_CLI;
  if (!awsExecutable) throw new Error("NEEDO_AWS_CLI is required");
  const aws = createAws({ executable: awsExecutable, profile: target.profile, region: target.region });

  const [environmentBytes, packageBytes] = await Promise.all([
    fs.readFile(environmentEvidencePath),
    fs.readFile(packageEvidencePath)
  ]);
  const environment = requireAcceptedEnvironment(JSON.parse(environmentBytes.toString("utf8")));
  const packageEvidence = JSON.parse(packageBytes.toString("utf8"));
  if (packageEvidence?.status !== "passed"
    || packageEvidence?.sourceRevision !== target.revision
    || packageEvidence?.releaseBucketName !== environment.releaseBucketName
    || packageEvidence?.releaseObjectKey !== releaseKey(target.revision, packageEvidence?.archiveSha256)
    || typeof packageEvidence?.archivePath !== "string"
    || !path.isAbsolute(packageEvidence.archivePath)) {
    throw new Error("Application package evidence does not match the approved target");
  }
  const archiveBytes = await fs.readFile(packageEvidence.archivePath);
  if (sha256Hex(archiveBytes) !== packageEvidence.archiveSha256
    || archiveBytes.length !== packageEvidence.archiveBytes) {
    throw new Error("Application archive identity changed after packaging");
  }

  const caller = await aws.json(["sts", "get-caller-identity"]);
  if (caller?.Account !== target.accountId || !String(caller?.Arn ?? "").includes(":assumed-role/")) {
    throw new Error("AWS caller is not the approved assumed role");
  }
  const describedStack = await aws.json([
    "cloudformation", "describe-stacks", "--stack-name", environment.stackName
  ]);
  const secretId = stackOutput(describedStack, "ApplicationSecretArn");
  if (stackOutput(describedStack, "InstanceId") !== environment.instanceId
    || stackOutput(describedStack, "DataVolumeId") !== environment.dataVolumeId
    || stackOutput(describedStack, "ReleaseBucketName") !== environment.releaseBucketName
    || stackOutput(describedStack, "BackupBucketName") !== environment.backupBucketName) {
    throw new Error("Live stack outputs changed after environment acceptance");
  }

  const put = await aws.json([
    "s3api", "put-object",
    "--bucket", environment.releaseBucketName,
    "--key", packageEvidence.releaseObjectKey,
    "--body", packageEvidence.archivePath,
    "--content-type", "application/gzip",
    "--metadata", `source-revision=${target.revision},sha256=${packageEvidence.archiveSha256}`
  ]);
  const objectVersionId = put?.VersionId;
  if (!/^[A-Za-z0-9._-]{1,1024}$/.test(objectVersionId ?? "")) {
    throw new Error("Uploaded application object version is invalid");
  }
  const head = await aws.json([
    "s3api", "head-object",
    "--bucket", environment.releaseBucketName,
    "--key", packageEvidence.releaseObjectKey,
    "--version-id", objectVersionId
  ]);
  if (head?.ContentLength !== archiveBytes.length
    || head?.Metadata?.["source-revision"] !== target.revision
    || head?.Metadata?.sha256 !== packageEvidence.archiveSha256) {
    throw new Error("Uploaded application object postcondition failed");
  }
  process.stdout.write(`${JSON.stringify({ phase: "release-upload", status: "verified" })}\n`);

  const snapshot = await aws.json([
    "ec2", "create-snapshot",
    "--volume-id", environment.dataVolumeId,
    "--description", `NeeDo staging pre-migration ${target.revision}`,
    "--tag-specifications", JSON.stringify([{
      ResourceType: "snapshot",
      Tags: [
        { Key: "Project", Value: "needo" },
        { Key: "Environment", Value: "staging" },
        { Key: "Purpose", Value: "pre-migration" },
        { Key: "SourceRevision", Value: target.revision }
      ]
    }])
  ]);
  const snapshotId = snapshot?.SnapshotId;
  if (!/^snap-[0-9a-f]{17}$/.test(snapshotId ?? "")
    || snapshot?.VolumeId !== environment.dataVolumeId) {
    throw new Error("Pre-migration snapshot identity is invalid");
  }
  await waitForSnapshot(aws, snapshotId);

  const deploymentCommand = buildApplicationDeploymentCommand({
    accountId: target.accountId,
    archiveSha256: packageEvidence.archiveSha256,
    backupBucketName: environment.backupBucketName,
    hostname: environment.hostname,
    region: target.region,
    releaseBucketName: environment.releaseBucketName,
    releaseObjectKey: packageEvidence.releaseObjectKey,
    revision: target.revision,
    secretId
  });
  const sent = await aws.json([
    "ssm", "send-command",
    "--document-name", "AWS-RunShellScript",
    "--instance-ids", environment.instanceId,
    "--timeout-seconds", "3600",
    "--comment", `NeeDo staging release ${target.revision.slice(0, 12)}`,
    "--parameters", JSON.stringify({ commands: [deploymentCommand], executionTimeout: ["3600"] })
  ]);
  const commandId = sent?.Command?.CommandId;
  if (!/^[0-9a-f-]{36}$/.test(commandId ?? "")) throw new Error("SSM command identity is invalid");
  await waitForCommand(aws, commandId, environment.instanceId);
  await requestReady(environment.elasticIp, environment.hostname);

  const secretVersions = await aws.json([
    "secretsmanager", "list-secret-version-ids", "--secret-id", secretId,
    "--include-deprecated"
  ]);
  const versions = Array.isArray(secretVersions?.Versions) ? secretVersions.Versions : [];
  const activeVersions = versions.filter((item) => Array.isArray(item?.VersionStages)
    && item.VersionStages.includes("AWSCURRENT"));
  if (versions.length !== 1 || activeVersions.length !== 1) {
    throw new Error("Application secret version postcondition failed");
  }

  const evidence = createRedactedApplicationEvidence({
    archiveSha256: packageEvidence.archiveSha256,
    commandId,
    instanceId: environment.instanceId,
    objectVersionId,
    releaseObjectKey: packageEvidence.releaseObjectKey,
    revision: target.revision,
    secretVersionCount: versions.length,
    snapshotId,
    status: "passed",
    timestamp: new Date().toISOString()
  });
  const evidencePath = path.join(outputDirectory, "application-deployment.json");
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    gate: evidence.gate,
    status: evidence.status,
    sourceRevision: evidence.sourceRevision,
    evidenceFile: path.relative(repositoryRoot, evidencePath)
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    gate: "aws-staging-application-deployment",
    status: "failed",
    reason: String(error?.message ?? "unknown error").slice(0, 240)
  })}\n`);
  process.exitCode = 1;
});
