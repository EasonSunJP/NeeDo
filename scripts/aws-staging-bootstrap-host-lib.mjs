import { resolve4 } from "node:dns/promises";
import { requireAwsStagingHostname, requireAwsStagingRegion } from "./aws-staging-config.mjs";
import { requireAwsStagingRuntimeArtifact } from "./aws-staging-runtime-artifact.mjs";
import { requireAwsStagingTemplateArtifact } from "./aws-staging-template-artifact.mjs";
import {
  attestAwsStagingCloudWatchParameter,
  attestAwsStagingDocument,
  loadAwsStagingAttestationContracts
} from "./aws-staging-attestation.mjs";
import {
  requireAwsStagingOutputs,
  requireAwsStagingResources,
  requireAwsStagingStack
} from "./aws-staging-stack-contract.mjs";

const STABLE_STACK_STATES = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
const SSM_REGISTRATION_TIMEOUT_MS = 10 * 60 * 1000;
const SSM_REGISTRATION_POLL_MS = 10 * 1000;
const MAX_SSM_REGISTRATION_POLLS = 61;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

function requireResolvedConfig(config) {
  if (!config || typeof config !== "object" || !Object.isFrozen(config)) {
    throw new Error("A frozen resolved AWS Staging configuration is required");
  }
  if (!/^\d{12}$/.test(String(config.accountId ?? ""))) {
    throw new Error("AWS Staging bootstrap account is invalid");
  }
  requireAwsStagingRegion(config.region);
  requireAwsStagingHostname(config.hostname);
  if (config.stackName !== "needo-staging-infrastructure"
    || config.owner !== "needo") {
    throw new Error("AWS Staging bootstrap stack configuration is not approved");
  }
}

function requireFreshPreflight(preflight, config, runtimeArtifact, templateArtifact) {
  if (!preflight || typeof preflight !== "object" || !Object.isFrozen(preflight)) {
    throw new Error("AWS Staging bootstrap requires a fresh immutable in-process preflight");
  }
  if (preflight.accountId !== config.accountId) throw new Error("Bootstrap preflight account mismatch");
  if (preflight.region !== config.region) throw new Error("Bootstrap preflight region mismatch");
  if (preflight.hostname !== config.hostname) {
    throw new Error("Bootstrap preflight hostname mismatch");
  }
  if (preflight.runtimeSourceRevision !== runtimeArtifact.runtimeSourceRevision
    || preflight.runtimeManifestSha256 !== runtimeArtifact.runtimeManifestSha256
    || preflight.runtimeEntrypoint !== runtimeArtifact.runtimeEntrypoint) {
    throw new Error("Bootstrap preflight runtime identity mismatch");
  }
  if (preflight.templateSha256 !== templateArtifact.templateSha256
    || preflight.sourceRevision !== templateArtifact.sourceRevision) {
    throw new Error("Bootstrap preflight template identity mismatch");
  }
  if (preflight.callerKind !== "assumed-role"
    || preflight.templateValidation !== "VALID"
    || preflight.amiArchitecture !== "arm64"
    || !STABLE_STACK_STATES.has(preflight.stackState)) {
    throw new Error("Bootstrap preflight did not pass every required safety gate");
  }
  if (!Array.isArray(preflight.dnsA) || !Object.isFrozen(preflight.dnsA)) {
    throw new Error("Bootstrap preflight DNS evidence is invalid");
  }
  const canonicalDns = [...new Set(preflight.dnsA)].sort();
  if (preflight.dnsA.some((address) => typeof address !== "string")
    || JSON.stringify(canonicalDns) !== JSON.stringify(preflight.dnsA)) {
    throw new Error("Bootstrap preflight DNS evidence must be sorted and unique");
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

function requireInstanceBinding(response, instanceId) {
  if (!response || typeof response !== "object" || Array.isArray(response)
    || (response.NextToken !== undefined && response.NextToken !== "")
    || !Array.isArray(response.Reservations)) {
    throw new Error("EC2 instance identity response is malformed or paginated");
  }
  const instances = response.Reservations.flatMap((reservation) => (
    Array.isArray(reservation?.Instances) ? reservation.Instances : []
  ));
  if (instances.length !== 1
    || instances[0]?.InstanceId !== instanceId
    || instances[0]?.InstanceType !== "t4g.large"
    || !new Set(["pending", "running"]).has(instances[0]?.State?.Name)) {
    throw new Error("EC2 instance identity does not match the approved stack instance");
  }
}

function requireDataVolumeAttachment(response, instanceId, volumeId) {
  if (!response || typeof response !== "object" || Array.isArray(response)
    || (response.NextToken !== undefined && response.NextToken !== "")
    || !Array.isArray(response.Volumes)
    || response.Volumes.length !== 1) {
    throw new Error("EC2 data volume attachment response is malformed or paginated");
  }
  const [volume] = response.Volumes;
  if (volume?.VolumeId !== volumeId || volume?.State !== "in-use"
    || !Array.isArray(volume.Attachments) || volume.Attachments.length !== 1) {
    throw new Error("EC2 data volume identity or attachment is invalid");
  }
  const [attachment] = volume.Attachments;
  if (attachment?.InstanceId !== instanceId
    || attachment?.Device !== "/dev/sdf"
    || attachment?.State !== "attached") {
    throw new Error("EC2 data volume attachment does not match the approved stack instance");
  }
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
  sleep = defaultSleep,
  runPreflight,
  runtimeArtifact,
  templateArtifact,
  resolveDns = resolve4,
  loadAttestationContracts = loadAwsStagingAttestationContracts
}) {
  if (!aws || typeof aws.json !== "function" || typeof aws.text !== "function") {
    throw new Error("The guarded AWS CLI adapter is required");
  }
  requireResolvedConfig(config);
  if (typeof now !== "function" || typeof sleep !== "function") {
    throw new Error("AWS Staging bootstrap requires clock and sleep boundaries");
  }
  if (typeof runPreflight !== "function"
    || typeof resolveDns !== "function"
    || typeof loadAttestationContracts !== "function") {
    throw new Error("AWS Staging bootstrap requires preflight and attestation boundaries");
  }

  const approvedRuntime = requireAwsStagingRuntimeArtifact(runtimeArtifact);
  const approvedTemplate = requireAwsStagingTemplateArtifact(
    templateArtifact,
    approvedRuntime.runtimeSourceRevision
  );
  const startedAtMilliseconds = readClock(now);
  const preflight = await runPreflight({
    aws,
    config,
    resolveDns,
    runtimeArtifact: approvedRuntime,
    templateArtifact: approvedTemplate
  });
  requireFreshPreflight(preflight, config, approvedRuntime, approvedTemplate);
  const contracts = await loadAttestationContracts();

  const describedStack = await aws.json([
    "cloudformation", "describe-stacks", "--stack-name", config.stackName
  ]);
  const { stack, stackId, stackStatus } = requireAwsStagingStack(describedStack, config, {
    allowedStatuses: STABLE_STACK_STATES
  });
  const outputs = requireAwsStagingOutputs(stack, config);
  const listedResources = await aws.json([
    "cloudformation", "list-stack-resources", "--stack-name", stackId
  ]);
  requireAwsStagingResources(listedResources, outputs, config, {
    allowedStatuses: STABLE_STACK_STATES
  });

  const describedInstance = await aws.json([
    "ec2", "describe-instances", "--instance-ids", outputs.InstanceId
  ]);
  requireInstanceBinding(describedInstance, outputs.InstanceId);
  const describedVolume = await aws.json([
    "ec2", "describe-volumes", "--volume-ids", outputs.DataVolumeId
  ]);
  requireDataVolumeAttachment(describedVolume, outputs.InstanceId, outputs.DataVolumeId);

  const describedDocument = await aws.json([
    "ssm", "get-document",
    "--name", outputs.HostBootstrapDocumentName,
    "--document-version", "$LATEST",
    "--document-format", "JSON"
  ]);
  const documentAttestation = attestAwsStagingDocument(describedDocument, {
    expectedName: outputs.HostBootstrapDocumentName,
    expectedContent: contracts?.bootstrapDocumentContent,
    label: "Host bootstrap"
  });
  const describedParameter = await aws.json([
    "ssm", "get-parameter", "--name", outputs.CloudWatchAgentConfigParameterName
  ]);
  const parameterAttestation = attestAwsStagingCloudWatchParameter(describedParameter, {
    config,
    expectedName: outputs.CloudWatchAgentConfigParameterName,
    expectedContent: contracts?.cloudWatchAgentConfig
  });

  await aws.text([
    "ec2", "wait", "instance-status-ok",
    "--instance-ids", outputs.InstanceId
  ]);
  await waitForSsmOnline({ aws, instanceId: outputs.InstanceId, now, sleep });

  await approvedRuntime.assertCurrentState();
  const commandResponse = await aws.json([
    "ssm", "send-command",
    "--document-name", outputs.HostBootstrapDocumentName,
    "--document-version", documentAttestation.version,
    "--instance-ids", outputs.InstanceId,
    "--parameters",
    `DataVolumeId=${outputs.DataVolumeId},CloudWatchAgentConfigParameter=${outputs.CloudWatchAgentConfigParameterName},CloudWatchAgentConfigParameterVersion=${parameterAttestation.version}`,
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
    documentVersion: documentAttestation.version,
    documentSha256: documentAttestation.sha256,
    agentParameterVersion: parameterAttestation.version,
    agentParameterSha256: parameterAttestation.sha256,
    runtimeSourceRevision: approvedRuntime.runtimeSourceRevision,
    runtimeManifestSha256: approvedRuntime.runtimeManifestSha256,
    runtimeEntrypoint: approvedRuntime.runtimeEntrypoint,
    startedAt: toSafeTimestamp(startedAtMilliseconds),
    completedAt: toSafeTimestamp(readClock(now))
  });
}
