import path from "node:path";
import { resolve4 } from "node:dns/promises";

const AMI_PARAMETER_NAME = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64";
const AMAZON_AMI_OWNER_ID = "137112412989";
const STAGING_HOSTNAME = "staging.needo.dackou.com";
const STABLE_STACK_STATES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);

function requireTemporaryCredentialSource(configureList) {
  const source = String(configureList).toLowerCase();
  if (/shared[-_ ]credentials(?:[-_ ]file)?/.test(source)) {
    throw new Error("A shared-credentials source is forbidden for AWS Staging");
  }
  const hasTemporarySourceLine = source
    .split(/\r?\n/)
    .some((line) => /^\s*(?:sso_session|sso_start_url|credential_process)\b/.test(line)
      || /(?:^|\s)(?:sso|assume-role)\s*$/.test(line));
  if (!hasTemporarySourceLine) {
    throw new Error("A temporary SSO, credential_process, or assume-role credential source is required");
  }
}

function requireAssumedRole(identity, expectedAccountId) {
  const accountId = String(identity?.Account ?? "");
  const callerArn = String(identity?.Arn ?? "");

  if (accountId !== expectedAccountId) {
    throw new Error(`AWS caller account mismatch: expected ${expectedAccountId}`);
  }
  if (callerArn === `arn:aws:iam::${expectedAccountId}:root`
    || /^arn:[a-z0-9-]+:iam::\d{12}:root$/.test(callerArn)) {
    throw new Error("AWS root callers are forbidden");
  }
  if (/^arn:[a-z0-9-]+:iam::\d{12}:user\//.test(callerArn)) {
    throw new Error("AWS Staging requires temporary assumed-role credentials; IAM users are forbidden");
  }

  const assumedRolePattern = new RegExp(
    `^arn:[a-z0-9-]+:sts::${expectedAccountId}:assumed-role/[^/]+/[^/]+$`
  );
  if (!assumedRolePattern.test(callerArn)) {
    throw new Error("AWS caller ARN must identify an STS assumed-role session");
  }

  return callerArn;
}

function requireAmiId(parameterResult) {
  const amiId = String(parameterResult?.Parameter?.Value ?? "").trim();
  if (!amiId) throw new Error("The AL2023 ARM64 SSM AMI parameter returned no AMI ID");
  return amiId;
}

function requireSafeAmi(imageResult, amiId) {
  const images = imageResult?.Images;
  if (!Array.isArray(images) || images.length !== 1) {
    throw new Error(`Expected exactly one image for AMI ${amiId}`);
  }

  const [image] = images;
  if (image.ImageId && image.ImageId !== amiId) {
    throw new Error(`EC2 returned an unexpected image for AMI ${amiId}`);
  }
  if (image.Architecture !== "arm64") {
    throw new Error(`AMI ${amiId} architecture must be arm64`);
  }
  if (image.State !== "available") {
    throw new Error(`AMI ${amiId} state must be available`);
  }
  if (image.OwnerId !== AMAZON_AMI_OWNER_ID) {
    throw new Error(`AMI ${amiId} must use the Amazon owner ID`);
  }

  return image.Architecture;
}

function isExactAbsentStackError(error, stackName) {
  const message = error instanceof Error ? error.message : "";
  const escapedStackName = stackName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.includes("ValidationError")
    && new RegExp(`Stack with id ${escapedStackName} does not exist`, "i").test(message);
}

async function getStackState(aws, stackName) {
  let described;
  try {
    described = await aws.json([
      "cloudformation", "describe-stacks",
      "--stack-name", stackName
    ]);
  } catch (error) {
    if (isExactAbsentStackError(error, stackName)) return "ABSENT";
    throw error;
  }

  const stacks = described?.Stacks;
  if (!Array.isArray(stacks) || stacks.length !== 1) {
    throw new Error(`Expected exactly one CloudFormation stack named ${stackName}`);
  }
  const stackState = String(stacks[0]?.StackStatus ?? "");
  if (!STABLE_STACK_STATES.has(stackState)) {
    throw new Error(`CloudFormation stack ${stackName} is not stable: ${stackState || "UNKNOWN"}`);
  }
  return stackState;
}

async function getDnsBaseline(resolveDns) {
  let addresses;
  try {
    addresses = await resolveDns(STAGING_HOSTNAME);
  } catch (error) {
    if (error?.code === "ENODATA" || error?.code === "ENOTFOUND") return Object.freeze([]);
    throw error;
  }

  if (!Array.isArray(addresses) || addresses.some((address) => typeof address !== "string")) {
    throw new Error("DNS A-record resolution returned an invalid result");
  }
  return Object.freeze([...new Set(addresses)].sort());
}

export function createAwsStagingPreflightSummary(result) {
  return Object.freeze({
    gate: "aws-staging-preflight",
    accountId: result.accountId,
    callerKind: result.callerKind,
    region: result.region,
    amiArchitecture: result.amiArchitecture,
    stackState: result.stackState,
    dnsA: result.dnsA
  });
}

export async function runAwsStagingPreflight({ aws, config, resolveDns = resolve4 }) {
  const credentialSource = await aws.text(["configure", "list"]);
  requireTemporaryCredentialSource(credentialSource);

  const identity = await aws.json(["sts", "get-caller-identity"]);
  const callerArn = requireAssumedRole(identity, config.accountId);

  const parameterResult = await aws.json([
    "ssm", "get-parameter",
    "--name", AMI_PARAMETER_NAME
  ]);
  const amiId = requireAmiId(parameterResult);

  const imageResult = await aws.json(["ec2", "describe-images", "--image-ids", amiId]);
  const amiArchitecture = requireSafeAmi(imageResult, amiId);

  if (!path.isAbsolute(config.templatePath)) {
    throw new Error("AWS Staging template path must be absolute");
  }
  await aws.json([
    "cloudformation", "validate-template",
    "--template-body", `file://${config.templatePath}`
  ]);

  const stackState = await getStackState(aws, config.stackName);
  const dnsA = await getDnsBaseline(resolveDns);

  return Object.freeze({
    accountId: config.accountId,
    callerArn,
    callerKind: "assumed-role",
    region: config.region,
    amiId,
    amiArchitecture,
    templateValidation: "VALID",
    stackState,
    dnsA
  });
}
