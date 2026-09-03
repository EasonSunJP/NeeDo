import path from "node:path";
import { resolve4 } from "node:dns/promises";

const AMI_PARAMETER_NAME = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64";
const AMAZON_AMI_OWNER_ID = "137112412989";
const STAGING_HOSTNAME = "staging.needo.dackou.com";
const STABLE_STACK_STATES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
const TEMPORARY_CREDENTIAL_TYPES = new Set(["sso", "assume-role", "custom-process"]);

function requireTemporaryCredentialSource(configureList) {
  const rows = String(configureList)
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s{2,}/))
    .filter((columns) => columns.length >= 3);
  const accessRow = rows.find(([name]) => name === "access_key");
  const secretRow = rows.find(([name]) => name === "secret_key");
  const accessType = accessRow?.[2];
  const secretType = secretRow?.[2];

  if (!TEMPORARY_CREDENTIAL_TYPES.has(accessType)
    || !TEMPORARY_CREDENTIAL_TYPES.has(secretType)
    || accessType !== secretType) {
    throw new Error("AWS configure list credential TYPE must be the same temporary provider");
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
  if (image.ImageId !== amiId) {
    throw new Error(`EC2 ImageId must match requested AMI ${amiId}`);
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
  const absentStackPattern = new RegExp(
    `^AWS CLI failed \\([^()\\r\\n]+\\): An error occurred \\(ValidationError\\) when calling the DescribeStacks operation: Stack with id ${escapedStackName} does not exist$`
  );
  return absentStackPattern.test(message);
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
