import { createHash } from "node:crypto";
import { resolve4 } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { requireAwsStagingHostname } from "./aws-staging-config.mjs";
import {
  AWS_STAGING_EXPECTED_RESOURCES,
  awsStagingResourceIdentitySha256,
  requireAwsStagingOutputs,
  requireAwsStagingResources,
  requireAwsStagingStack,
  requireAwsStagingStackId
} from "./aws-staging-stack-contract.mjs";

const SAFE_PREFLIGHT_STACK_STATES = new Set(["ABSENT"]);
const CREATE_COMPLETE_ONLY = new Set(["CREATE_COMPLETE"]);
const MAX_INLINE_TEMPLATE_BYTES = 51_200;

function requireInProcessPreflight(preflight, config) {
  if (!preflight || typeof preflight !== "object" || !Object.isFrozen(preflight)) {
    throw new Error("AWS Staging requires a fresh immutable in-process preflight result");
  }
  if (preflight.accountId !== config.accountId) {
    throw new Error("AWS Staging preflight account does not match deployment configuration");
  }
  if (preflight.region !== config.region) {
    throw new Error("AWS Staging preflight region does not match deployment configuration");
  }
  if (preflight.hostname !== config.hostname) {
    throw new Error("AWS Staging preflight hostname does not match deployment configuration");
  }
  if (preflight.callerKind !== "assumed-role"
    || preflight.templateValidation !== "VALID"
    || preflight.amiArchitecture !== "arm64") {
    throw new Error("AWS Staging preflight did not pass every required safety gate");
  }
  if (!SAFE_PREFLIGHT_STACK_STATES.has(preflight.stackState)) {
    throw new Error(`AWS Staging preflight stack state is unsafe: ${preflight.stackState || "UNKNOWN"}`);
  }
  if (!Array.isArray(preflight.dnsA)
    || !Object.isFrozen(preflight.dnsA)
    || preflight.dnsA.some((address) => typeof address !== "string")) {
    throw new Error("AWS Staging preflight DNS baseline is invalid");
  }

  const canonicalDns = [...new Set(preflight.dnsA)].sort();
  if (JSON.stringify(canonicalDns) !== JSON.stringify(preflight.dnsA)) {
    throw new Error("AWS Staging preflight DNS baseline must be sorted and unique");
  }
}

async function resolveDnsA(resolveDns, hostname) {
  let addresses;
  try {
    addresses = await resolveDns(hostname);
  } catch (error) {
    if (error?.code === "ENODATA" || error?.code === "ENOTFOUND") return [];
    throw error;
  }

  if (!Array.isArray(addresses) || addresses.some((address) => typeof address !== "string")) {
    throw new Error("DNS A-record resolution returned an invalid result");
  }
  return [...new Set(addresses)].sort();
}

function requireUnchangedDns(preflightDns, currentDns) {
  if (JSON.stringify(preflightDns) !== JSON.stringify(currentDns)) {
    throw new Error("AWS Staging DNS A-records changed after preflight; deployment refused");
  }
}

function requireInstance(described, expectedInstanceId) {
  const reservations = described?.Reservations;
  if (!Array.isArray(reservations)) {
    throw new Error("Expected exactly one EC2 instance description");
  }
  const instances = reservations.flatMap((reservation) => (
    Array.isArray(reservation?.Instances) ? reservation.Instances : []
  ));
  if (instances.length !== 1) {
    throw new Error("Expected exactly one EC2 instance description");
  }

  const [instance] = instances;
  const instanceId = String(instance?.InstanceId ?? "");
  const instanceType = String(instance?.InstanceType ?? "");
  const state = String(instance?.State?.Name ?? "");
  if (instanceId !== expectedInstanceId || !instanceType || !state) {
    throw new Error("EC2 instance identity, type, or state is invalid");
  }
  return Object.freeze({ instanceId, instanceType, state });
}

function requireTemplateBody(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("AWS Staging CloudFormation template must be non-empty UTF-8 text");
  }
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > MAX_INLINE_TEMPLATE_BYTES) {
    throw new Error(`AWS Staging CloudFormation template exceeds ${MAX_INLINE_TEMPLATE_BYTES} bytes`);
  }
  return value;
}

function requireTimestamp(now) {
  const milliseconds = now();
  if (!Number.isFinite(milliseconds)) {
    throw new Error("AWS Staging deployment timestamp source is invalid");
  }
  return new Date(milliseconds).toISOString();
}

function createArguments(config, templateBody) {
  return [
    "cloudformation", "create-stack",
    "--stack-name", config.stackName,
    "--template-body", templateBody,
    "--parameters",
    `ParameterKey=ExpectedRegion,ParameterValue=${config.region}`,
    `ParameterKey=ExpectedAccountId,ParameterValue=${config.accountId}`,
    `ParameterKey=AlertEmail,ParameterValue=${config.alertEmail}`,
    `ParameterKey=BudgetAmount,ParameterValue=${config.budgetAmount}`,
    `ParameterKey=BudgetUnit,ParameterValue=${config.budgetUnit}`,
    `ParameterKey=Owner,ParameterValue=${config.owner}`,
    "--capabilities", "CAPABILITY_NAMED_IAM",
    "--tags",
    "Key=Project,Value=needo",
    "Key=Environment,Value=staging",
    `Key=Owner,Value=${config.owner}`,
    "Key=ManagedBy,Value=cloudformation",
    "--on-failure", "DO_NOTHING"
  ];
}

export async function deployAwsStagingInfrastructure({
  aws,
  config,
  resolveDns = resolve4,
  runPreflight,
  readTemplate = readFile,
  now = Date.now
}) {
  const hostname = requireAwsStagingHostname(config.hostname);
  if (typeof runPreflight !== "function") {
    throw new Error("An in-process AWS Staging preflight runner is required");
  }
  if (typeof readTemplate !== "function" || typeof now !== "function") {
    throw new Error("AWS Staging deployment dependencies are invalid");
  }

  const preflight = await runPreflight({ aws, config, resolveDns });
  requireInProcessPreflight(preflight, config);

  const currentDns = await resolveDnsA(resolveDns, hostname);
  requireUnchangedDns(preflight.dnsA, currentDns);

  // Read once and pass those exact bytes to create-stack. The recorded digest is
  // therefore bound to the submitted template rather than a mutable path.
  const templateBody = requireTemplateBody(await readTemplate(config.templatePath, "utf8"));
  const templateSha256 = createHash("sha256").update(templateBody, "utf8").digest("hex");
  const created = await aws.json(createArguments(config, templateBody));
  const stackId = requireAwsStagingStackId(created?.StackId, config, "Created CloudFormation StackId");

  await aws.text([
    "cloudformation", "wait", "stack-create-complete", "--stack-name", stackId
  ]);

  const describedStack = await aws.json([
    "cloudformation", "describe-stacks", "--stack-name", stackId
  ]);
  const { stack, stackStatus, stackTags } = requireAwsStagingStack(describedStack, config, {
    expectedStackId: stackId,
    allowedStatuses: CREATE_COMPLETE_ONLY
  });
  const outputs = requireAwsStagingOutputs(stack, config);

  const listedResources = await aws.json([
    "cloudformation", "list-stack-resources", "--stack-name", stackId
  ]);
  const resources = requireAwsStagingResources(listedResources, outputs, config, {
    allowedStatuses: CREATE_COMPLETE_ONLY
  });

  const describedInstances = await aws.json([
    "ec2", "describe-instances", "--instance-ids", outputs.InstanceId
  ]);
  const instance = requireInstance(describedInstances, outputs.InstanceId);

  return Object.freeze({
    scope: "environment-only",
    timestamp: requireTimestamp(now),
    accountId: config.accountId,
    region: config.region,
    hostname,
    stackId,
    stackName: config.stackName,
    stackStatus,
    templateSha256,
    resourceIdentitySha256: awsStagingResourceIdentitySha256(resources),
    resourceCount: AWS_STAGING_EXPECTED_RESOURCES.length,
    stackTags,
    outputs: Object.freeze({
      ...outputs,
      ApplicationSecretArn: "REDACTED"
    }),
    instance,
    applicationDeployed: false,
    migrationRun: false,
    seedRun: false,
    dnsModified: false
  });
}
