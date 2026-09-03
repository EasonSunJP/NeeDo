import { resolve4 } from "node:dns/promises";

const STAGING_HOSTNAME = "staging.needo.dackou.com";
const STABLE_STACK_STATES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
const SAFE_PREFLIGHT_STACK_STATES = new Set(["ABSENT", ...STABLE_STACK_STATES]);
const REQUIRED_OUTPUT_KEYS = Object.freeze([
  "InstanceId",
  "ElasticIp",
  "DataVolumeId",
  "ReleaseBucketName",
  "BackupBucketName",
  "ApplicationSecretArn",
  "HostBootstrapDocumentName",
  "HostVerificationDocumentName",
  "CloudWatchAgentConfigParameterName",
  "BudgetName"
]);

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

async function resolveDnsA(resolveDns) {
  let addresses;
  try {
    addresses = await resolveDns(STAGING_HOSTNAME);
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

function requireSingleStableStack(described, stackName) {
  const stacks = described?.Stacks;
  if (!Array.isArray(stacks) || stacks.length !== 1) {
    throw new Error(`Expected exactly one CloudFormation stack named ${stackName}`);
  }
  const [stack] = stacks;
  const stackStatus = String(stack?.StackStatus ?? "");
  if (!STABLE_STACK_STATES.has(stackStatus)) {
    throw new Error(`CloudFormation stack ${stackName} did not finish safely: ${stackStatus || "UNKNOWN"}`);
  }
  return { stack, stackStatus };
}

function requireOutputs(stack) {
  const rawOutputs = stack?.Outputs;
  if (!Array.isArray(rawOutputs)) {
    throw new Error("CloudFormation outputs must be an array");
  }

  const outputs = {};
  for (const output of rawOutputs) {
    const key = String(output?.OutputKey ?? "");
    const value = String(output?.OutputValue ?? "");
    if (!key || !value) {
      throw new Error("Every CloudFormation output must have a non-empty key and value");
    }
    if (Object.hasOwn(outputs, key)) {
      throw new Error(`CloudFormation output key is duplicate: ${key}`);
    }
    outputs[key] = value;
  }

  for (const key of REQUIRED_OUTPUT_KEYS) {
    if (!Object.hasOwn(outputs, key)) {
      throw new Error(`CloudFormation output is missing required key: ${key}`);
    }
  }
  if (rawOutputs.length !== REQUIRED_OUTPUT_KEYS.length) {
    throw new Error(`CloudFormation must return exactly ${REQUIRED_OUTPUT_KEYS.length} approved outputs`);
  }

  return outputs;
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

function deploymentArguments(config) {
  return [
    "cloudformation", "deploy",
    "--stack-name", config.stackName,
    "--template-file", config.templatePath,
    "--parameter-overrides",
    `AlertEmail=${config.alertEmail}`,
    `BudgetAmount=${config.budgetAmount}`,
    `BudgetUnit=${config.budgetUnit}`,
    `Owner=${config.owner}`,
    "--capabilities", "CAPABILITY_NAMED_IAM",
    "--no-fail-on-empty-changeset",
    "--tags",
    "Project=needo",
    "Environment=staging",
    `Owner=${config.owner}`,
    "ManagedBy=cloudformation"
  ];
}

export async function deployAwsStagingInfrastructure({
  aws,
  config,
  resolveDns = resolve4,
  runPreflight
}) {
  if (typeof runPreflight !== "function") {
    throw new Error("An in-process AWS Staging preflight runner is required");
  }

  const preflight = await runPreflight({ aws, config, resolveDns });
  requireInProcessPreflight(preflight, config);

  const currentDns = await resolveDnsA(resolveDns);
  requireUnchangedDns(preflight.dnsA, currentDns);

  await aws.text(deploymentArguments(config));

  const describedStack = await aws.json([
    "cloudformation", "describe-stacks",
    "--stack-name", config.stackName
  ]);
  const { stack, stackStatus } = requireSingleStableStack(describedStack, config.stackName);
  const outputs = requireOutputs(stack);

  const describedInstances = await aws.json([
    "ec2", "describe-instances",
    "--instance-ids", outputs.InstanceId
  ]);
  const instance = requireInstance(describedInstances, outputs.InstanceId);

  return Object.freeze({
    scope: "environment-only",
    accountId: config.accountId,
    region: config.region,
    stackName: config.stackName,
    stackStatus,
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
