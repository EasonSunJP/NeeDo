const STABLE_STACK_STATES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
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
const SSM_REGISTRATION_TIMEOUT_MS = 10 * 60 * 1000;
const SSM_REGISTRATION_POLL_MS = 10 * 1000;
const MAX_SSM_REGISTRATION_POLLS = 61;
const INSTANCE_ID_PATTERN = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const VOLUME_ID_PATTERN = /^vol-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const SSM_DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9_.-]{3,128}$/;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

function requireSingleStableStack(described, stackName) {
  const stacks = described?.Stacks;
  if (!Array.isArray(stacks) || stacks.length !== 1) {
    throw new Error(`Expected exactly one CloudFormation stack named ${stackName}`);
  }

  const [stack] = stacks;
  const returnedStackName = stack?.StackName;
  if (typeof returnedStackName !== "string"
    || !returnedStackName
    || returnedStackName !== stackName) {
    throw new Error(`CloudFormation StackName identity must exactly match ${stackName}`);
  }
  const stackStatus = String(stack?.StackStatus ?? "");
  if (!STABLE_STACK_STATES.has(stackStatus)) {
    throw new Error(
      `CloudFormation stack ${stackName} is not stable: ${stackStatus || "UNKNOWN"}`
    );
  }
  return { stack, stackStatus };
}

function requireCompleteOutputs(stack) {
  const rawOutputs = stack?.Outputs;
  if (!Array.isArray(rawOutputs)) {
    throw new Error("CloudFormation outputs must be an array");
  }

  const outputs = {};
  for (const output of rawOutputs) {
    const key = output?.OutputKey;
    const value = output?.OutputValue;
    if (typeof key !== "string" || !key.trim()
      || typeof value !== "string" || !value.trim()) {
      throw new Error("Every CloudFormation output must have a non-empty string key and value");
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
    throw new Error(
      `CloudFormation must return exactly ${REQUIRED_OUTPUT_KEYS.length} approved outputs`
    );
  }
  return outputs;
}

function requireSafeConsumedOutputs(outputs) {
  if (!INSTANCE_ID_PATTERN.test(outputs.InstanceId)) {
    throw new Error("CloudFormation output InstanceId is invalid");
  }
  if (!VOLUME_ID_PATTERN.test(outputs.DataVolumeId)) {
    throw new Error("CloudFormation output DataVolumeId is invalid");
  }
  if (!SSM_DOCUMENT_NAME_PATTERN.test(outputs.HostBootstrapDocumentName)) {
    throw new Error("CloudFormation output HostBootstrapDocumentName is invalid");
  }
  if (outputs.CloudWatchAgentConfigParameterName !== "/needo/staging/cloudwatch-agent") {
    throw new Error("CloudFormation output CloudWatchAgentConfigParameterName is invalid");
  }
}

function readClock(now) {
  const value = now();
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("AWS Staging bootstrap clock must return a finite millisecond timestamp");
  }
  return value;
}

function toSafeTimestamp(milliseconds) {
  const timestamp = new Date(milliseconds);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("AWS Staging bootstrap clock returned an invalid timestamp");
  }
  return timestamp.toISOString();
}

function requireRegistrationState(described, instanceId) {
  const registrations = described?.InstanceInformationList;
  if (!Array.isArray(registrations)) {
    throw new Error("SSM instance information must contain a registration list");
  }
  if (described.NextToken !== undefined && described.NextToken !== "") {
    throw new Error("SSM instance information must not be paginated");
  }
  if (registrations.length > 1) {
    throw new Error("SSM instance information returned multiple registrations");
  }
  if (registrations.length === 0) return false;

  const [registration] = registrations;
  if (registration?.InstanceId !== instanceId) {
    throw new Error("SSM registration does not match the stack instance");
  }
  if (typeof registration.PingStatus !== "string" || !registration.PingStatus) {
    throw new Error("SSM registration PingStatus is malformed");
  }
  return registration.PingStatus === "Online";
}

async function waitForSsmOnline({ aws, instanceId, now, sleep }) {
  const deadline = readClock(now) + SSM_REGISTRATION_TIMEOUT_MS;

  for (let poll = 0; poll < MAX_SSM_REGISTRATION_POLLS; poll += 1) {
    if (readClock(now) > deadline) break;
    const described = await aws.json([
      "ssm", "describe-instance-information",
      "--filters", `Key=InstanceIds,Values=${instanceId}`
    ]);
    const currentTime = readClock(now);
    if (currentTime > deadline) break;
    if (requireRegistrationState(described, instanceId)) return;

    if (poll === MAX_SSM_REGISTRATION_POLLS - 1 || currentTime >= deadline) break;
    const delay = Math.min(SSM_REGISTRATION_POLL_MS, deadline - currentTime);
    if (delay <= 0) break;
    await sleep(delay);
    if (readClock(now) > deadline) break;
  }

  throw new Error("SSM instance did not become Online within ten minutes");
}

function requireCommandId(response) {
  const commandId = response?.Command?.CommandId;
  if (typeof commandId !== "string" || !COMMAND_ID_PATTERN.test(commandId)) {
    throw new Error("SSM send-command must return one non-empty CommandId");
  }
  return commandId;
}

function requireSuccessfulInvocation(invocation) {
  if (!invocation || typeof invocation !== "object" || Array.isArray(invocation)) {
    throw new Error("SSM command invocation response is malformed");
  }
  if (invocation.Status !== "Success") {
    throw new Error("SSM command invocation must have Status=Success");
  }
  if (typeof invocation.ResponseCode !== "number"
    || !Number.isFinite(invocation.ResponseCode)) {
    throw new Error("SSM command invocation must have a numeric ResponseCode");
  }
  if (invocation.ResponseCode !== 0) {
    throw new Error("SSM command invocation ResponseCode must be zero");
  }
  return { status: invocation.Status, responseCode: invocation.ResponseCode };
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function bootstrapAwsStagingHost({
  aws,
  config,
  now = Date.now,
  sleep = defaultSleep
}) {
  if (!aws || typeof aws.json !== "function" || typeof aws.text !== "function") {
    throw new Error("The guarded AWS CLI adapter is required");
  }
  if (!config || typeof config.stackName !== "string" || !config.stackName) {
    throw new Error("A resolved AWS Staging configuration is required");
  }
  if (typeof now !== "function" || typeof sleep !== "function") {
    throw new Error("AWS Staging bootstrap requires clock and sleep boundaries");
  }

  const startedAtMilliseconds = readClock(now);
  const describedStack = await aws.json([
    "cloudformation", "describe-stacks",
    "--stack-name", config.stackName
  ]);
  const { stack, stackStatus } = requireSingleStableStack(
    describedStack,
    config.stackName
  );
  const outputs = requireCompleteOutputs(stack);
  requireSafeConsumedOutputs(outputs);

  await aws.text([
    "ec2", "wait", "instance-status-ok",
    "--instance-ids", outputs.InstanceId
  ]);
  await waitForSsmOnline({
    aws,
    instanceId: outputs.InstanceId,
    now,
    sleep
  });

  const commandResponse = await aws.json([
    "ssm", "send-command",
    "--document-name", outputs.HostBootstrapDocumentName,
    "--instance-ids", outputs.InstanceId,
    "--parameters",
    `DataVolumeId=${outputs.DataVolumeId},CloudWatchAgentConfigParameter=${outputs.CloudWatchAgentConfigParameterName}`,
    "--comment", "NeeDo Staging environment-only host bootstrap"
  ]);
  const commandId = requireCommandId(commandResponse);

  await aws.text([
    "ssm", "wait", "command-executed",
    "--command-id", commandId,
    "--instance-id", outputs.InstanceId
  ]);
  const invocation = await aws.json([
    "ssm", "get-command-invocation",
    "--command-id", commandId,
    "--instance-id", outputs.InstanceId
  ]);
  const { status, responseCode } = requireSuccessfulInvocation(invocation);

  return Object.freeze({
    gate: "aws-staging-host-bootstrap",
    stackStatus,
    instanceId: outputs.InstanceId,
    commandId,
    status,
    responseCode,
    startedAt: toSafeTimestamp(startedAtMilliseconds),
    completedAt: toSafeTimestamp(readClock(now))
  });
}
