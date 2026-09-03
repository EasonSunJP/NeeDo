import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { isIPv4 } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolve4 } from "node:dns/promises";
import {
  maskEmail,
  requireAwsStagingHostname,
  requireAwsStagingRegion
} from "./aws-staging-config.mjs";
import {
  AWS_STAGING_CLOUDWATCH_AGENT_CONFIG,
  AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT,
  attestAwsStagingCloudWatchParameter,
  attestAwsStagingDocument
} from "./aws-staging-attestation.mjs";
import { requireAwsStagingStackId } from "./aws-staging-stack-contract.mjs";
import { requireAwsStagingRuntimeArtifact } from "./aws-staging-runtime-artifact.mjs";
import { requireAwsStagingTemplateArtifact } from "./aws-staging-template-artifact.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultTrustedRoot = path.resolve(moduleDir, "..");
const defaultOutputDirectory = path.join(defaultTrustedRoot, "outputs", "aws-staging");
const evidenceFileName = "environment-acceptance.json";
const stableStackStates = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
const outputKeys = Object.freeze([
  "InstanceId", "ElasticIp", "DataVolumeId", "ReleaseBucketName", "BackupBucketName",
  "ApplicationSecretArn", "HostBootstrapDocumentName", "HostVerificationDocumentName",
  "CloudWatchAgentConfigParameterName", "BudgetName"
]);
const requiredTags = Object.freeze({
  Project: "needo",
  Environment: "staging",
  ManagedBy: "cloudformation"
});
const hostKeys = Object.freeze([
  "mount", "filesystem", "directories", "services", "runningContainers", "activeRelease"
]);
const topLevelEvidenceKeys = Object.freeze([
  "timestamp", "accountId", "region", "hostname", "runtimeSourceRevision",
  "runtimeManifestSha256", "runtimeEntrypoint", "stack", "resourceIds", "elasticIp",
  "tagCoverage", "ec2", "ingress", "volumes", "ssm", "host", "buckets",
  "secretVersionCount", "monitoring", "budget", "dns", "applicationDeployed",
  "migrationRun", "seedRun", "dnsModified", "businessDataMutation", "waivedBaselineFailures"
]);
const waivedBaselineFailures = Object.freeze([
  "ProfileDetailPage routing behavior > keeps /profiles/technician/17 on the social profile without loading the explicit card API",
  "ProfileDetailPage routing behavior > keeps /profiles/technician/17?view=social on the social profile without loading the explicit card API",
  "shop membership card adjustment API > strictly rejects client scope and creates a safe pending request > remainingSeconds assertion"
]);
const expectedResources = Object.freeze([
  ["Vpc", "AWS::EC2::VPC"],
  ["InternetGateway", "AWS::EC2::InternetGateway"],
  ["InternetGatewayAttachment", "AWS::EC2::VPCGatewayAttachment"],
  ["PublicSubnet", "AWS::EC2::Subnet"],
  ["PublicRouteTable", "AWS::EC2::RouteTable"],
  ["DefaultPublicRoute", "AWS::EC2::Route"],
  ["PublicSubnetRouteTableAssociation", "AWS::EC2::SubnetRouteTableAssociation"],
  ["WebSecurityGroup", "AWS::EC2::SecurityGroup"],
  ["ReleaseBucket", "AWS::S3::Bucket"],
  ["ReleaseBucketPolicy", "AWS::S3::BucketPolicy"],
  ["BackupBucket", "AWS::S3::Bucket"],
  ["BackupBucketPolicy", "AWS::S3::BucketPolicy"],
  ["ApplicationSecret", "AWS::SecretsManager::Secret"],
  ["SystemLogGroup", "AWS::Logs::LogGroup"],
  ["DockerLogGroup", "AWS::Logs::LogGroup"],
  ["InstanceRole", "AWS::IAM::Role"],
  ["InstanceProfile", "AWS::IAM::InstanceProfile"],
  ["Instance", "AWS::EC2::Instance"],
  ["ElasticIp", "AWS::EC2::EIP"],
  ["ElasticIpAssociation", "AWS::EC2::EIPAssociation"],
  ["DataVolume", "AWS::EC2::Volume"],
  ["DataVolumeAttachment", "AWS::EC2::VolumeAttachment"],
  ["AlertTopic", "AWS::SNS::Topic"],
  ["AlertSubscription", "AWS::SNS::Subscription"],
  ["CloudWatchAgentConfigParameter", "AWS::SSM::Parameter"],
  ["StatusCheckFailedAlarm", "AWS::CloudWatch::Alarm"],
  ["HighMemoryAlarm", "AWS::CloudWatch::Alarm"],
  ["RootDiskHighAlarm", "AWS::CloudWatch::Alarm"],
  ["DataDiskHighAlarm", "AWS::CloudWatch::Alarm"],
  ["MonthlyBudget", "AWS::Budgets::Budget"],
  ["HostBootstrapDocument", "AWS::SSM::Document"],
  ["HostVerificationDocument", "AWS::SSM::Document"]
]);
const taggableLogicalIds = Object.freeze([
  "Vpc", "InternetGateway", "PublicSubnet", "PublicRouteTable", "WebSecurityGroup",
  "ReleaseBucket", "BackupBucket", "ApplicationSecret", "SystemLogGroup", "DockerLogGroup",
  "InstanceRole", "Instance", "ElasticIp", "DataVolume", "AlertTopic",
  "CloudWatchAgentConfigParameter", "StatusCheckFailedAlarm", "HighMemoryAlarm",
  "RootDiskHighAlarm", "DataDiskHighAlarm", "MonthlyBudget",
  "HostBootstrapDocument", "HostVerificationDocument", "InstanceRootVolume"
]);
const resourceGroupsLogicalIds = Object.freeze([
  "Vpc", "InternetGateway", "PublicSubnet", "PublicRouteTable", "WebSecurityGroup",
  "Instance", "ElasticIp", "DataVolume", "InstanceRootVolume", "ReleaseBucket",
  "BackupBucket", "ApplicationSecret", "SystemLogGroup", "DockerLogGroup", "AlertTopic",
  "StatusCheckFailedAlarm", "HighMemoryAlarm", "RootDiskHighAlarm", "DataDiskHighAlarm"
]);
const resourceGroupsLogicalIdSet = new Set(resourceGroupsLogicalIds);
const alarmLogicalIds = Object.freeze([
  "StatusCheckFailedAlarm", "HighMemoryAlarm", "RootDiskHighAlarm", "DataDiskHighAlarm"
]);
const notificationDefinitions = Object.freeze([
  ["ACTUAL", 75], ["FORECASTED", 90], ["ACTUAL", 90],
  ["FORECASTED", 100], ["ACTUAL", 100]
]);
const instanceIdPattern = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const volumeIdPattern = /^vol-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const amiIdPattern = /^ami-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const resourceIdPatterns = Object.freeze({
  Vpc: /^vpc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  InternetGateway: /^igw-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  PublicSubnet: /^subnet-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  PublicRouteTable: /^rtb-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  PublicSubnetRouteTableAssociation: /^rtbassoc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  WebSecurityGroup: /^sg-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  Instance: instanceIdPattern,
  ElasticIp: /^eipalloc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  ElasticIpAssociation: /^eipassoc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/,
  DataVolume: volumeIdPattern
});
const ssmDocumentPattern = /^[A-Za-z0-9_.-]{3,128}$/;
const commandIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const instanceProfileNamePattern = /^[A-Za-z0-9+=,.@_-]{1,128}$/;
const networkInterfaceIdPattern = /^eni-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const safeNamePattern = /^[A-Za-z0-9/][A-Za-z0-9_.:/|@-]{0,511}$/;
const temporaryOpenFlags = fsConstants.O_WRONLY | fsConstants.O_CREAT
  | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
const directoryOpenFlags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object with exact keys`);
  }
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")
    || actual.length !== keys.length
    || !keys.every((key) => Object.hasOwn(value, key))) {
    throw new Error(`${label} must contain exact keys: ${keys.join(", ")}`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeArgument(value, label, pattern = safeNamePattern) {
  const stringValue = nonEmptyString(value, label);
  if (!pattern.test(stringValue)
    || stringValue.startsWith("-")
    || /(?:\r|\n|\0|\$\(|`|;|&&|\|\||[<>]|^#!)/.test(stringValue)) {
    throw new Error(`${label} is invalid or unsafe`);
  }
  return stringValue;
}

function canonicalBudgetAmount(value) {
  if (typeof value !== "string") {
    throw new Error("Budget amount must be a bounded plain decimal string");
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match || !/[1-9]/.test(`${match[1]}${match[2] ?? ""}`)) {
    throw new Error("Budget amount must be a positive bounded plain decimal string");
  }
  const fractional = (match[2] ?? "").replace(/0+$/, "");
  return fractional ? `${match[1]}.${fractional}` : match[1];
}

function noPagination(response, label, keys = ["NextToken", "nextToken", "PaginationToken"]) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error(`${label} response is malformed`);
  }
  for (const key of keys) {
    if (Object.hasOwn(response, key) && response[key] !== undefined && response[key] !== "") {
      throw new Error(`${label} response is paginated or truncated`);
    }
  }
}

function tagsToMap(rawTags, label) {
  if (!Array.isArray(rawTags)) throw new Error(`${label} tags must be an array`);
  const mapped = {};
  for (const rawTag of rawTags) {
    const key = rawTag?.Key;
    const value = rawTag?.Value;
    if (typeof key !== "string" || !key || typeof value !== "string") {
      throw new Error(`${label} tag is malformed`);
    }
    if (Object.hasOwn(mapped, key)) throw new Error(`${label} tag ${key} is duplicate`);
    mapped[key] = value;
  }
  return mapped;
}

function requireTags(rawTags, owner, label) {
  const mapped = tagsToMap(rawTags, label);
  const expected = { ...requiredTags, Owner: owner };
  for (const [key, value] of Object.entries(expected)) {
    if (mapped[key] !== value) throw new Error(`${label} required tag ${key} does not match`);
  }
  return true;
}

function requireTagMap(rawTags, owner, label) {
  if (!rawTags || typeof rawTags !== "object" || Array.isArray(rawTags)) {
    throw new Error(`${label} tags must be an object`);
  }
  return requireTags(Object.entries(rawTags).map(([Key, Value]) => ({ Key, Value })), owner, label);
}

function sortedUniqueDns(addresses, label) {
  if (!Array.isArray(addresses)
    || addresses.some((address) => typeof address !== "string" || !isIPv4(address))) {
    throw new Error(`${label} DNS A records are malformed`);
  }
  return [...new Set(addresses)].sort();
}

async function resolveDnsA(resolveDns, hostname) {
  try {
    return sortedUniqueDns(await resolveDns(hostname), "Post-verification");
  } catch (error) {
    if (error?.code === "ENODATA" || error?.code === "ENOTFOUND") return [];
    throw error;
  }
}

function requireFreshPreflight(preflight, config, runtimeArtifact, templateArtifact) {
  if (!preflight || typeof preflight !== "object" || !Object.isFrozen(preflight)) {
    throw new Error("AWS Staging acceptance requires a fresh immutable in-process preflight");
  }
  if (preflight.accountId !== config.accountId) throw new Error("Preflight account mismatch");
  if (preflight.region !== config.region) throw new Error("Preflight region mismatch");
  if (preflight.hostname !== config.hostname) throw new Error("Preflight hostname mismatch");
  if (preflight.runtimeSourceRevision !== runtimeArtifact.runtimeSourceRevision
    || preflight.runtimeManifestSha256 !== runtimeArtifact.runtimeManifestSha256
    || preflight.runtimeEntrypoint !== runtimeArtifact.runtimeEntrypoint) {
    throw new Error("Preflight runtime identity mismatch");
  }
  if (preflight.templateSha256 !== templateArtifact.templateSha256
    || preflight.sourceRevision !== templateArtifact.sourceRevision) {
    throw new Error("Preflight template identity mismatch");
  }
  if (preflight.callerKind !== "assumed-role"
    || preflight.templateValidation !== "VALID"
    || preflight.amiArchitecture !== "arm64") {
    throw new Error("Preflight did not pass every required safety gate");
  }
  if (!stableStackStates.has(preflight.stackState)) {
    throw new Error("Preflight stack state is not stable complete");
  }
  const dnsA = sortedUniqueDns(preflight.dnsA, "Preflight");
  if (!Object.isFrozen(preflight.dnsA)
    || JSON.stringify(dnsA) !== JSON.stringify(preflight.dnsA)) {
    throw new Error("Preflight DNS A records must be frozen, sorted, and unique");
  }
  return dnsA;
}

function requireResolvedConfig(config) {
  if (!config || typeof config !== "object" || !Object.isFrozen(config)) {
    throw new Error("AWS Staging acceptance config must be a frozen resolved config");
  }
  if (!/^\d{12}$/.test(String(config.accountId ?? ""))) throw new Error("AWS Staging config accountId is invalid");
  requireAwsStagingRegion(config.region);
  if (config.environment !== "staging") throw new Error("AWS Staging config environment is invalid");
  if (config.stackName !== "needo-staging-infrastructure") throw new Error("AWS Staging config stackName is unsafe");
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(String(config.owner ?? ""))) {
    throw new Error("AWS Staging config owner is invalid");
  }
  if (typeof config.profile !== "string" || !config.profile || config.profile === "default") {
    throw new Error("AWS Staging config profile is invalid");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(config.alertEmail ?? ""))) {
    throw new Error("AWS Staging config alert email is invalid");
  }
  if (!/^[A-Z]{3}$/.test(String(config.budgetUnit ?? ""))) {
    throw new Error("AWS Staging config budget is invalid");
  }
  try {
    canonicalBudgetAmount(config.budgetAmount);
  } catch {
    throw new Error("AWS Staging config budget is invalid");
  }
  if (typeof config.templatePath !== "string" || !path.isAbsolute(config.templatePath)) {
    throw new Error("AWS Staging config templatePath is invalid");
  }
}

function requireStack(response, config) {
  noPagination(response, "CloudFormation describe-stacks");
  if (!Array.isArray(response.Stacks) || response.Stacks.length !== 1) {
    throw new Error("Expected exactly one CloudFormation stack");
  }
  const [stack] = response.Stacks;
  if (stack?.StackName !== config.stackName) throw new Error("CloudFormation stack identity does not match");
  if (!stableStackStates.has(stack.StackStatus)) throw new Error("CloudFormation stack status is not stable complete");
  const stackId = requireAwsStagingStackId(stack.StackId, config);
  requireTags(stack.Tags, config.owner, "CloudFormation stack");
  return { stack, stackId };
}

function requireOutputs(stack, config) {
  if (!Array.isArray(stack.Outputs)) throw new Error("CloudFormation outputs must be an array");
  const mapped = {};
  for (const output of stack.Outputs) {
    const key = nonEmptyString(output?.OutputKey, "CloudFormation output key");
    const value = nonEmptyString(output?.OutputValue, `CloudFormation output ${key}`);
    if (Object.hasOwn(mapped, key)) throw new Error(`CloudFormation output ${key} is duplicate`);
    mapped[key] = value;
  }
  if (stack.Outputs.length !== outputKeys.length || !outputKeys.every((key) => Object.hasOwn(mapped, key))) {
    throw new Error("CloudFormation outputs must contain exactly the ten approved keys");
  }
  safeArgument(mapped.InstanceId, "InstanceId", instanceIdPattern);
  if (!isIPv4(mapped.ElasticIp)) throw new Error("ElasticIp is invalid");
  safeArgument(mapped.DataVolumeId, "DataVolumeId", volumeIdPattern);
  for (const key of ["ReleaseBucketName", "BackupBucketName"]) {
    safeArgument(mapped[key], key, /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);
  }
  const secretPattern = new RegExp(
    `^arn:aws:secretsmanager:${config.region}:${config.accountId}:secret:/needo/staging/application-[A-Za-z0-9]{6}$`
  );
  safeArgument(mapped.ApplicationSecretArn, "ApplicationSecretArn", secretPattern);
  safeArgument(mapped.HostBootstrapDocumentName, "HostBootstrapDocumentName", ssmDocumentPattern);
  safeArgument(mapped.HostVerificationDocumentName, "HostVerificationDocumentName", ssmDocumentPattern);
  if (mapped.HostBootstrapDocumentName === mapped.HostVerificationDocumentName) {
    throw new Error("Bootstrap and verification documents must be distinct");
  }
  if (mapped.CloudWatchAgentConfigParameterName !== "/needo/staging/cloudwatch-agent") {
    throw new Error("CloudWatch agent parameter output is invalid");
  }
  if (mapped.BudgetName !== `${config.stackName}-monthly-cost`) throw new Error("BudgetName output is invalid");
  return mapped;
}

function requireStackResources(response, outputs) {
  noPagination(response, "CloudFormation list-stack-resources");
  const summaries = response.StackResourceSummaries;
  if (!Array.isArray(summaries) || summaries.length !== expectedResources.length) {
    throw new Error("CloudFormation stack resource cardinality is not exact");
  }
  const mapped = {};
  for (const summary of summaries) {
    const logicalId = nonEmptyString(summary?.LogicalResourceId, "Stack logical resource ID");
    if (Object.hasOwn(mapped, logicalId)) throw new Error(`Stack resource ${logicalId} is duplicate`);
    const expectedType = expectedResources.find(([expected]) => expected === logicalId)?.[1];
    if (!expectedType) throw new Error(`Unexpected stack resource ${logicalId}`);
    if (summary.ResourceType !== expectedType) throw new Error(`Stack resource ${logicalId} type does not match`);
    if (!stableStackStates.has(summary.ResourceStatus)) throw new Error(`Stack resource ${logicalId} is not complete`);
    const physicalId = safeArgument(summary.PhysicalResourceId, `Stack resource ${logicalId} physical ID`);
    if (resourceIdPatterns[logicalId] && !resourceIdPatterns[logicalId].test(physicalId)) {
      throw new Error(`Stack resource ${logicalId} physical ID is invalid`);
    }
    mapped[logicalId] = { logicalId, resourceType: expectedType, physicalId };
  }
  if (!expectedResources.every(([logicalId]) => Object.hasOwn(mapped, logicalId))) {
    throw new Error("CloudFormation stack resource is missing");
  }
  const outputBindings = {
    Instance: outputs.InstanceId,
    ElasticIp: null,
    DataVolume: outputs.DataVolumeId,
    ReleaseBucket: outputs.ReleaseBucketName,
    ReleaseBucketPolicy: outputs.ReleaseBucketName,
    BackupBucket: outputs.BackupBucketName,
    BackupBucketPolicy: outputs.BackupBucketName,
    ApplicationSecret: outputs.ApplicationSecretArn,
    HostBootstrapDocument: outputs.HostBootstrapDocumentName,
    HostVerificationDocument: outputs.HostVerificationDocumentName,
    CloudWatchAgentConfigParameter: outputs.CloudWatchAgentConfigParameterName,
    MonthlyBudget: outputs.BudgetName
  };
  for (const [logicalId, expectedPhysical] of Object.entries(outputBindings)) {
    if (expectedPhysical !== null && mapped[logicalId].physicalId !== expectedPhysical) {
      throw new Error(`Stack resource ${logicalId} identity does not match its output`);
    }
  }
  return mapped;
}

function requireInstance(response, outputs, resources, config) {
  noPagination(response, "EC2 describe-instances");
  if (!Array.isArray(response.Reservations)) throw new Error("EC2 instance response is malformed");
  const instances = response.Reservations.flatMap((reservation) => (
    Array.isArray(reservation?.Instances) ? reservation.Instances : []
  ));
  if (instances.length !== 1) throw new Error("Expected exactly one EC2 instance");
  const [instance] = instances;
  if (instance.InstanceId !== outputs.InstanceId || instance.InstanceId !== resources.Instance.physicalId) {
    throw new Error("EC2 instance identity does not match stack output and resources");
  }
  if (instance.InstanceType !== "t4g.large") throw new Error("EC2 instance type must be t4g.large");
  if (instance.Architecture !== "arm64") throw new Error("EC2 instance architecture must be arm64");
  if (instance.State?.Name !== "running") throw new Error("EC2 instance must be running");
  safeArgument(instance.ImageId, "EC2 image ID", amiIdPattern);
  if (instance.RootDeviceName !== "/dev/xvda") throw new Error("EC2 root device must be /dev/xvda");
  if (instance.KeyName !== undefined && instance.KeyName !== null) throw new Error("EC2 SSH key name must be absent");
  if (instance.MetadataOptions?.HttpTokens !== "required"
    || instance.MetadataOptions?.HttpEndpoint !== "enabled"
    || instance.MetadataOptions?.HttpPutResponseHopLimit !== 1) {
    throw new Error("EC2 IMDSv2/HttpTokens settings are not exact");
  }
  if (instance.Monitoring?.State !== "enabled") throw new Error("EC2 detailed monitoring must be enabled");
  if (instance.VpcId !== resources.Vpc.physicalId) {
    throw new Error("EC2 instance VPC does not match the stack VPC");
  }
  if (instance.SubnetId !== resources.PublicSubnet.physicalId) {
    throw new Error("EC2 instance subnet does not match the stack public subnet");
  }
  const instanceProfileName = safeArgument(
    resources.InstanceProfile.physicalId,
    "EC2 instance profile physical name",
    instanceProfileNamePattern
  );
  const expectedInstanceProfileArn = `arn:aws:iam::${config.accountId}:instance-profile/${instanceProfileName}`;
  if (!instance.IamInstanceProfile || typeof instance.IamInstanceProfile !== "object"
    || Array.isArray(instance.IamInstanceProfile)
    || instance.IamInstanceProfile.Arn !== expectedInstanceProfileArn) {
    throw new Error("EC2 instance profile ARN does not match the stack instance profile");
  }
  if (instance.PublicIpAddress !== outputs.ElasticIp) {
    throw new Error("EC2 instance public IP does not match the stack Elastic IP output");
  }
  if (!Array.isArray(instance.SecurityGroups) || instance.SecurityGroups.length !== 1
    || instance.SecurityGroups[0]?.GroupId !== resources.WebSecurityGroup.physicalId) {
    throw new Error("EC2 security group identity does not match the stack");
  }
  if (!Array.isArray(instance.NetworkInterfaces) || instance.NetworkInterfaces.length !== 1) {
    throw new Error("EC2 instance must have exactly one primary network interface");
  }
  const [primaryNetworkInterface] = instance.NetworkInterfaces;
  const networkInterfaceId = safeArgument(
    primaryNetworkInterface?.NetworkInterfaceId,
    "EC2 primary network interface ID",
    networkInterfaceIdPattern
  );
  if (primaryNetworkInterface.VpcId !== resources.Vpc.physicalId
    || primaryNetworkInterface.SubnetId !== resources.PublicSubnet.physicalId) {
    throw new Error("EC2 primary network interface VPC or subnet does not match the stack");
  }
  if (primaryNetworkInterface.Attachment?.DeviceIndex !== 0) {
    throw new Error("EC2 network interface must be the exact primary DeviceIndex=0 attachment");
  }
  if (!Array.isArray(primaryNetworkInterface.Groups)
    || primaryNetworkInterface.Groups.length !== 1
    || primaryNetworkInterface.Groups[0]?.GroupId !== resources.WebSecurityGroup.physicalId) {
    throw new Error("EC2 primary network interface security group does not match the stack");
  }
  if (!primaryNetworkInterface.Association
    || typeof primaryNetworkInterface.Association !== "object"
    || Array.isArray(primaryNetworkInterface.Association)
    || primaryNetworkInterface.Association.PublicIp !== outputs.ElasticIp
    || primaryNetworkInterface.Association.IpOwnerId !== config.accountId) {
    throw new Error("EC2 primary network interface Elastic IP association does not match the stack");
  }
  if (!Array.isArray(instance.BlockDeviceMappings) || instance.BlockDeviceMappings.length !== 2) {
    throw new Error("EC2 block-device mapping cardinality is not exact");
  }
  const byDevice = Object.fromEntries(instance.BlockDeviceMappings.map((mapping) => [mapping.DeviceName, mapping.Ebs]));
  const rootVolumeId = byDevice["/dev/xvda"]?.VolumeId;
  if (!volumeIdPattern.test(String(rootVolumeId ?? "")) || byDevice["/dev/xvda"]?.DeleteOnTermination !== true) {
    throw new Error("EC2 root volume mapping is invalid");
  }
  if (byDevice["/dev/sdf"]?.VolumeId !== outputs.DataVolumeId
    || byDevice["/dev/sdf"]?.DeleteOnTermination !== false) {
    throw new Error("EC2 data volume mapping does not match");
  }
  requireTags(instance.Tags, config.owner, "EC2 instance");
  return { instance, rootVolumeId, networkInterfaceId };
}

function requireElasticAddress(response, outputs, resources, instanceId, networkInterfaceId) {
  noPagination(response, "EC2 describe-addresses");
  if (!Array.isArray(response.Addresses) || response.Addresses.length !== 1) {
    throw new Error("Expected exactly one EC2 Elastic IP address");
  }
  const [address] = response.Addresses;
  if (address.AllocationId !== resources.ElasticIp.physicalId
    || address.AssociationId !== resources.ElasticIpAssociation.physicalId
    || address.InstanceId !== instanceId
    || address.NetworkInterfaceId !== networkInterfaceId
    || address.PublicIp !== outputs.ElasticIp
    || address.Domain !== "vpc") {
    throw new Error("EC2 Elastic IP allocation and association do not match stack resources");
  }
}

function requireImage(response, imageId) {
  noPagination(response, "EC2 describe-images");
  if (!Array.isArray(response.Images) || response.Images.length !== 1) {
    throw new Error("Expected exactly one EC2 image");
  }
  const [image] = response.Images;
  if (image.ImageId !== imageId || image.Architecture !== "arm64"
    || image.State !== "available" || image.OwnerId !== "137112412989") {
    throw new Error("EC2 image identity, owner, state, or arm64 architecture does not match");
  }
}

function requireIngress(response, resources) {
  noPagination(response, "EC2 describe-security-groups");
  if (!Array.isArray(response.SecurityGroups) || response.SecurityGroups.length !== 1) {
    throw new Error("Expected exactly one EC2 security group");
  }
  const [group] = response.SecurityGroups;
  if (group.GroupId !== resources.WebSecurityGroup.physicalId || group.VpcId !== resources.Vpc.physicalId) {
    throw new Error("Security group identity or VPC does not match stack resources");
  }
  if (!Array.isArray(group.IpPermissions)) throw new Error("Security group ingress is malformed");
  const normalized = group.IpPermissions.map((permission) => {
    if (permission.IpProtocol !== "tcp"
      || !Array.isArray(permission.IpRanges) || permission.IpRanges.length !== 1
      || permission.IpRanges[0]?.CidrIp !== "0.0.0.0/0"
      || (permission.Ipv6Ranges?.length ?? 0) !== 0
      || (permission.PrefixListIds?.length ?? 0) !== 0
      || (permission.UserIdGroupPairs?.length ?? 0) !== 0
      || permission.FromPort !== permission.ToPort) {
      throw new Error("Security group ingress differs from the approved exact rules");
    }
    return {
      protocol: "tcp",
      fromPort: permission.FromPort,
      toPort: permission.ToPort,
      cidrIpv4: "0.0.0.0/0"
    };
  }).sort((left, right) => left.fromPort - right.fromPort);
  if (JSON.stringify(normalized) !== JSON.stringify([
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrIpv4: "0.0.0.0/0" },
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrIpv4: "0.0.0.0/0" }
  ])) throw new Error("Security group ingress differs from exact 80/tcp and 443/tcp");
  return normalized;
}

function requireVolumes(response, instanceId, rootVolumeId, dataVolumeId, owner) {
  noPagination(response, "EC2 describe-volumes");
  if (!Array.isArray(response.Volumes) || response.Volumes.length !== 2) {
    throw new Error("EC2 volume cardinality must be exactly two");
  }
  const mapped = {};
  for (const volume of response.Volumes) {
    const volumeId = safeArgument(volume?.VolumeId, "EC2 volume ID", volumeIdPattern);
    if (Object.hasOwn(mapped, volumeId)) throw new Error(`EC2 volume ${volumeId} is duplicate`);
    mapped[volumeId] = volume;
  }
  const expectations = [
    ["root", rootVolumeId, 30, "/dev/xvda", true],
    ["data", dataVolumeId, 70, "/dev/sdf", false]
  ];
  for (const [label, volumeId, size, device, deleteOnTermination] of expectations) {
    const volume = mapped[volumeId];
    if (!volume) throw new Error(`${label} volume identity is missing`);
    if (volume.Size !== size || volume.VolumeType !== "gp3" || volume.Encrypted !== true
      || volume.State !== "in-use") {
      throw new Error(`${label} volume must be encrypted gp3 with exact size ${size}`);
    }
    if (!Array.isArray(volume.Attachments) || volume.Attachments.length !== 1) {
      throw new Error(`${label} volume attachment cardinality is not exact`);
    }
    const [attachment] = volume.Attachments;
    if (attachment.InstanceId !== instanceId || attachment.Device !== device
      || attachment.State !== "attached" || attachment.DeleteOnTermination !== deleteOnTermination) {
      throw new Error(`${label} volume attachment does not match the stack instance`);
    }
    requireTags(volume.Tags, owner, `${label} volume`);
  }
  return {
    root: { id: rootVolumeId, sizeGiB: 30, type: "gp3", encrypted: true },
    data: { id: dataVolumeId, sizeGiB: 70, type: "gp3", encrypted: true }
  };
}

function requireEc2TagCoverage(response, resourceIds, owner) {
  noPagination(response, "EC2 describe-tags");
  if (!Array.isArray(response.Tags)) throw new Error("EC2 tag response is malformed");
  const allowed = new Set(resourceIds);
  const grouped = new Map(resourceIds.map((id) => [id, []]));
  for (const tag of response.Tags) {
    if (!allowed.has(tag?.ResourceId)) throw new Error("EC2 tag response contains a mismatched resource ID");
    grouped.get(tag.ResourceId).push({ Key: tag.Key, Value: tag.Value });
  }
  for (const [resourceId, rawTags] of grouped) requireTags(rawTags, owner, `EC2 resource ${resourceId}`);
}

function requireSsmOnline(response, instanceId) {
  noPagination(response, "SSM describe-instance-information");
  if (!Array.isArray(response.InstanceInformationList)
    || response.InstanceInformationList.length !== 1) {
    throw new Error("SSM managed instance cardinality must be exactly one");
  }
  const [registration] = response.InstanceInformationList;
  if (registration.InstanceId !== instanceId) throw new Error("SSM managed instance identity does not match");
  if (registration.PingStatus !== "Online") throw new Error("SSM managed instance must be Online");
}

function requirePublicBlock(response, label) {
  exactKeys(response.PublicAccessBlockConfiguration, [
    "BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"
  ], `${label} public access block`);
  if (!Object.values(response.PublicAccessBlockConfiguration).every((value) => value === true)) {
    throw new Error(`${label} public access must be fully blocked`);
  }
}

function requireEncryption(response, label) {
  const rules = response?.ServerSideEncryptionConfiguration?.Rules;
  if (!Array.isArray(rules) || rules.length !== 1
    || rules[0]?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm !== "AES256") {
    throw new Error(`${label} bucket encryption must be exactly AES256`);
  }
}

function requireLifecycle(response, kind) {
  if (!Array.isArray(response?.Rules)) throw new Error(`${kind} bucket lifecycle is malformed`);
  if (kind === "release") {
    const [rule] = response.Rules;
    if (response.Rules.length !== 1 || rule?.ID !== "AbortIncompleteMultipartUploads"
      || rule.Status !== "Enabled" || rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation !== 7) {
      throw new Error("release bucket lifecycle does not match");
    }
    return [{ id: rule.ID, status: "Enabled", abortIncompleteMultipartUploadDays: 7 }];
  }
  const expected = [
    ["DailyBackups30Days", "staging/daily/", 30],
    ["PreMigrationRecovery90Days", "staging/pre-migration/", 90]
  ];
  if (response.Rules.length !== expected.length) throw new Error("backup bucket lifecycle cardinality does not match");
  const byId = Object.fromEntries(response.Rules.map((rule) => [rule.ID, rule]));
  return expected.map(([id, prefix, days]) => {
    const rule = byId[id];
    if (!rule || rule.Status !== "Enabled" || rule.Prefix !== prefix
      || rule.Expiration?.Days !== days || rule.NoncurrentVersionExpiration?.NoncurrentDays !== days
      || rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation !== 7) {
      throw new Error(`backup bucket lifecycle rule ${id} does not match`);
    }
    return {
      id, status: "Enabled", prefix, expirationDays: days,
      noncurrentVersionExpirationDays: days, abortIncompleteMultipartUploadDays: 7
    };
  });
}

function expectedBucketTlsPolicy(name) {
  return {
    Version: "2012-10-17",
    Statement: [{
      Sid: "DenyInsecureTransport",
      Effect: "Deny",
      Principal: "*",
      Action: "s3:*",
      Resource: [`arn:aws:s3:::${name}`, `arn:aws:s3:::${name}/*`],
      Condition: { Bool: { "aws:SecureTransport": "false" } }
    }]
  };
}

function requireBucketTlsPolicy(response, name, kind) {
  exactKeys(response, ["Policy"], `${kind} bucket policy response`);
  if (typeof response.Policy !== "string" || !response.Policy) {
    throw new Error(`${kind} bucket policy must be a JSON string`);
  }
  let policy;
  try {
    policy = JSON.parse(response.Policy);
  } catch {
    throw new Error(`${kind} bucket policy must be valid JSON`);
  }
  exactKeys(policy, ["Version", "Statement"], `${kind} bucket policy`);
  if (policy.Version !== "2012-10-17"
    || !Array.isArray(policy.Statement)
    || policy.Statement.length !== 1) {
    throw new Error(`${kind} bucket policy must contain the exact TLS-only statement`);
  }
  const [statement] = policy.Statement;
  exactKeys(
    statement,
    ["Sid", "Effect", "Principal", "Action", "Resource", "Condition"],
    `${kind} bucket policy statement`
  );
  exactKeys(statement.Condition, ["Bool"], `${kind} bucket policy condition`);
  exactKeys(
    statement.Condition.Bool,
    ["aws:SecureTransport"],
    `${kind} bucket policy secure transport condition`
  );
  const expectedResources = [`arn:aws:s3:::${name}`, `arn:aws:s3:::${name}/*`];
  const actualResources = statement.Resource;
  if (statement.Sid !== "DenyInsecureTransport"
    || statement.Effect !== "Deny"
    || statement.Principal !== "*"
    || statement.Action !== "s3:*"
    || statement.Condition.Bool["aws:SecureTransport"] !== "false"
    || !Array.isArray(actualResources)
    || actualResources.length !== expectedResources.length
    || new Set(actualResources).size !== expectedResources.length
    || expectedResources.some((resource) => !actualResources.includes(resource))) {
    throw new Error(`${kind} bucket policy does not match the exact TLS-only deny policy`);
  }
  return {
    tlsOnly: true,
    policySha256: createHash("sha256")
      .update(JSON.stringify(expectedBucketTlsPolicy(name)), "utf8")
      .digest("hex")
  };
}

async function verifyBucket({ aws, name, kind, owner, accountId }) {
  const publicAccess = await aws.json(["s3api", "get-public-access-block", "--bucket", name]);
  requirePublicBlock(publicAccess, kind);
  const encryption = await aws.json(["s3api", "get-bucket-encryption", "--bucket", name]);
  requireEncryption(encryption, kind);
  const versioning = await aws.json(["s3api", "get-bucket-versioning", "--bucket", name]);
  if (versioning?.Status !== "Enabled") throw new Error(`${kind} bucket versioning must be Enabled`);
  const lifecycle = await aws.json(["s3api", "get-bucket-lifecycle-configuration", "--bucket", name]);
  const lifecycleRules = requireLifecycle(lifecycle, kind);
  const tagging = await aws.json(["s3api", "get-bucket-tagging", "--bucket", name]);
  requireTags(tagging?.TagSet, owner, `${kind} bucket`);
  const policy = await aws.json([
    "s3api", "get-bucket-policy", "--bucket", name,
    "--expected-bucket-owner", accountId
  ]);
  const policyAttestation = requireBucketTlsPolicy(policy, name, kind);
  return {
    name,
    encryption: "AES256",
    versioning: "Enabled",
    publicAccessBlocked: true,
    lifecycleRules,
    ...policyAttestation
  };
}

function requireLogGroups(response, resources, config) {
  noPagination(response, "CloudWatch Logs describe-log-groups");
  if (!Array.isArray(response.logGroups) || response.logGroups.length !== 2) {
    throw new Error("CloudWatch log group cardinality must be exactly two");
  }
  const expected = [
    ["SystemLogGroup", "/needo/staging/system"],
    ["DockerLogGroup", "/needo/staging/docker"]
  ];
  return expected.map(([logicalId, name]) => {
    const group = response.logGroups.find((candidate) => candidate?.logGroupName === name);
    if (!group || resources[logicalId].physicalId !== name || group.retentionInDays !== 30) {
      throw new Error(`CloudWatch log group ${name} does not match stack identity or retention`);
    }
    const logArnPattern = new RegExp(
      `^arn:aws:logs:${escapeRegExp(config.region)}:${config.accountId}:log-group:${escapeRegExp(name)}$`
    );
    const arn = safeArgument(
      group.logGroupArn,
      `CloudWatch log group ${name} ARN`,
      logArnPattern
    );
    return { name, arn, retentionDays: 30 };
  });
}

function requireAlarms(response, resources, instanceId, topicArn, accountId, region) {
  noPagination(response, "CloudWatch describe-alarms");
  if (!Array.isArray(response.MetricAlarms) || response.MetricAlarms.length !== 4
    || !Array.isArray(response.CompositeAlarms) || response.CompositeAlarms.length !== 0) {
    throw new Error("CloudWatch alarm cardinality must be exactly four metric alarms");
  }
  const definitions = [
    ["StatusCheckFailedAlarm", "AWS/EC2", "StatusCheckFailed", "Maximum", 1, "missing", [{ Name: "InstanceId", Value: instanceId }]],
    ["HighMemoryAlarm", "Needo/Staging", "mem_used_percent", "Average", 85, "breaching", [{ Name: "InstanceId", Value: instanceId }]],
    ["RootDiskHighAlarm", "Needo/Staging", "disk_used_percent", "Average", 80, "breaching", [
      { Name: "InstanceId", Value: instanceId }, { Name: "path", Value: "/" }, { Name: "fstype", Value: "xfs" }
    ]],
    ["DataDiskHighAlarm", "Needo/Staging", "disk_used_percent", "Average", 80, "breaching", [
      { Name: "InstanceId", Value: instanceId }, { Name: "path", Value: "/srv/needo" }, { Name: "fstype", Value: "xfs" }
    ]]
  ];
  return definitions.map(([logicalId, namespace, metricName, statistic, threshold, missing, dimensions]) => {
    const name = resources[logicalId].physicalId;
    const alarm = response.MetricAlarms.find((candidate) => candidate?.AlarmName === name);
    const arnPattern = new RegExp(`^arn:aws:cloudwatch:${region}:${accountId}:alarm:[A-Za-z0-9_.-]+$`);
    const checks = [
      [Boolean(alarm), "identity"],
      [arnPattern.test(String(alarm?.AlarmArn ?? "")), "ARN"],
      [alarm?.Namespace === namespace, "namespace"],
      [alarm?.MetricName === metricName, "metric"],
      [alarm?.Statistic === statistic, "statistic"],
      [alarm?.ComparisonOperator === "GreaterThanOrEqualToThreshold", "comparison"],
      [alarm?.Threshold === threshold, "threshold"],
      [alarm?.EvaluationPeriods === 2, "evaluation periods"],
      [alarm?.DatapointsToAlarm === 2, "datapoints"],
      [alarm?.Period === 300, "period"],
      [alarm?.TreatMissingData === missing, "missing-data policy"],
      [JSON.stringify(alarm?.Dimensions) === JSON.stringify(dimensions), "dimensions"],
      [alarm?.ActionsEnabled === true, "actions enabled"],
      [JSON.stringify(alarm?.AlarmActions) === JSON.stringify([topicArn]), "actions"]
    ];
    const failed = checks.find(([passed]) => !passed);
    if (failed) throw new Error(`CloudWatch alarm ${logicalId} ${failed[1]} does not match`);
    return {
      logicalId,
      name,
      arn: alarm.AlarmArn,
      namespace,
      metricName,
      threshold,
      actionsEnabled: true
    };
  });
}

function requireBudget(response, config, budgetName) {
  noPagination(response, "Budgets describe-budget");
  const budget = response.Budget;
  if (!budget || budget.BudgetName !== budgetName) throw new Error("Budget identity does not match");
  let returnedAmount;
  try {
    returnedAmount = canonicalBudgetAmount(budget.BudgetLimit?.Amount);
  } catch {
    throw new Error("Budget amount does not match configured amount");
  }
  if (returnedAmount !== canonicalBudgetAmount(config.budgetAmount)) {
    throw new Error("Budget amount does not match configured amount");
  }
  if (budget.BudgetLimit?.Unit !== config.budgetUnit) throw new Error("Budget unit does not match configured unit");
  if (budget.TimeUnit !== "MONTHLY" || budget.BudgetType !== "COST") {
    throw new Error("Budget type or time unit does not match");
  }
}

function requireNotifications(response) {
  noPagination(response, "Budgets notifications");
  if (!Array.isArray(response.Notifications) || response.Notifications.length !== notificationDefinitions.length) {
    throw new Error("Budget notification cardinality does not match");
  }
  const normalized = response.Notifications.map((notification) => {
    if (notification?.ComparisonOperator !== "GREATER_THAN"
      || notification?.ThresholdType !== "PERCENTAGE"
      || !notificationDefinitions.some(([type, threshold]) => (
        notification.NotificationType === type && notification.Threshold === threshold
      ))) throw new Error("Budget notification definition does not match");
    return {
      notificationType: notification.NotificationType,
      threshold: notification.Threshold,
      comparisonOperator: "GREATER_THAN",
      thresholdType: "PERCENTAGE"
    };
  });
  const canonical = (items) => items.map((item) => `${item.notificationType}:${item.threshold}`).sort();
  if (JSON.stringify(canonical(normalized)) !== JSON.stringify(
    notificationDefinitions.map(([notificationType, threshold]) => ({ notificationType, threshold })).map((item) => `${item.notificationType}:${item.threshold}`).sort()
  )) throw new Error("Budget notifications are duplicate or missing");
  return normalized.sort((left, right) => left.threshold - right.threshold
    || left.notificationType.localeCompare(right.notificationType));
}

function requireSubscriber(response, config) {
  noPagination(response, "Budgets subscribers");
  if (!Array.isArray(response.Subscribers) || response.Subscribers.length !== 1
    || response.Subscribers[0]?.SubscriptionType !== "EMAIL"
    || response.Subscribers[0]?.Address !== config.alertEmail) {
    throw new Error("Budget subscriber does not match the configured alert email");
  }
}

function requireConfirmedSnsSubscription(response, resources, config) {
  noPagination(response, "SNS list-subscriptions-by-topic");
  if (!Array.isArray(response.Subscriptions) || response.Subscriptions.length !== 1) {
    throw new Error("SNS email subscription cardinality must be exactly one");
  }
  const topicArn = resources.AlertTopic.physicalId;
  const topicPattern = new RegExp(
    `^arn:aws:sns:${escapeRegExp(config.region)}:${config.accountId}:[A-Za-z0-9_-]{1,256}$`
  );
  if (!topicPattern.test(topicArn)) throw new Error("SNS alert topic identity is invalid");
  const [subscription] = response.Subscriptions;
  const subscriptionArnPattern = new RegExp(
    `^${escapeRegExp(topicArn)}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
  );
  if (subscription.TopicArn !== topicArn
    || subscription.Protocol !== "email"
    || subscription.Endpoint !== config.alertEmail
    || subscription.Owner !== config.accountId
    || !subscriptionArnPattern.test(String(subscription.SubscriptionArn ?? ""))
    || resources.AlertSubscription.physicalId !== subscription.SubscriptionArn) {
    throw new Error("SNS email subscription is not confirmed or does not match the stack");
  }
  return true;
}

function notificationArgument(notification) {
  return [
    `NotificationType=${notification.notificationType}`,
    `ComparisonOperator=${notification.comparisonOperator}`,
    `Threshold=${notification.threshold}`,
    `ThresholdType=${notification.thresholdType}`
  ].join(",");
}

function resourceArns({ config, resources, rootVolumeId, logs, alarms, outputs }) {
  const ec2Arn = (type, id) => `arn:aws:ec2:${config.region}:${config.accountId}:${type}/${id}`;
  const mappings = new Map([
    [ec2Arn("vpc", resources.Vpc.physicalId), "Vpc"],
    [ec2Arn("internet-gateway", resources.InternetGateway.physicalId), "InternetGateway"],
    [ec2Arn("subnet", resources.PublicSubnet.physicalId), "PublicSubnet"],
    [ec2Arn("route-table", resources.PublicRouteTable.physicalId), "PublicRouteTable"],
    [ec2Arn("security-group", resources.WebSecurityGroup.physicalId), "WebSecurityGroup"],
    [ec2Arn("instance", outputs.InstanceId), "Instance"],
    [ec2Arn("elastic-ip", resources.ElasticIp.physicalId), "ElasticIp"],
    [ec2Arn("volume", outputs.DataVolumeId), "DataVolume"],
    [ec2Arn("volume", rootVolumeId), "InstanceRootVolume"],
    [`arn:aws:s3:::${outputs.ReleaseBucketName}`, "ReleaseBucket"],
    [`arn:aws:s3:::${outputs.BackupBucketName}`, "BackupBucket"],
    [outputs.ApplicationSecretArn, "ApplicationSecret"],
    ...logs.map((log) => [log.arn, log.name.endsWith("system") ? "SystemLogGroup" : "DockerLogGroup"]),
    [resources.AlertTopic.physicalId, "AlertTopic"],
    ...alarms.map((alarm) => [alarm.arn, alarm.logicalId])
  ]);
  return mappings;
}

function requireResourceGroupTags(response, arnMappings, owner) {
  noPagination(response, "Resource Groups Tagging API");
  if (!Array.isArray(response.ResourceTagMappingList)
    || response.ResourceTagMappingList.length !== arnMappings.size) {
    throw new Error("Resource Groups Tagging result cardinality does not match relevant stack resources");
  }
  const observed = new Set();
  for (const mapping of response.ResourceTagMappingList) {
    const arn = nonEmptyString(mapping?.ResourceARN, "Resource Groups resource ARN");
    if (!arnMappings.has(arn)) throw new Error("Resource Groups Tagging result contains a mismatched resource ID");
    if (observed.has(arn)) throw new Error("Resource Groups Tagging result contains a duplicate resource ARN");
    observed.add(arn);
    requireTags(mapping.Tags, owner, `Resource Groups resource ${arnMappings.get(arn)}`);
  }
  if (observed.size !== arnMappings.size) throw new Error("Resource Groups Tagging result is missing a relevant resource");
  return new Set([...observed].map((arn) => arnMappings.get(arn)));
}

function requireCommandId(response) {
  const commandId = response?.Command?.CommandId;
  if (typeof commandId !== "string" || !commandIdPattern.test(commandId) || commandId.startsWith("-")) {
    throw new Error("SSM verification CommandId is invalid");
  }
  return commandId;
}

function requireHostInvocation(invocation, { commandId, instanceId, documentName }) {
  if (!invocation || typeof invocation !== "object" || Array.isArray(invocation)) {
    throw new Error("SSM command invocation is malformed");
  }
  if (typeof invocation.CommandId !== "string" || !commandIdPattern.test(invocation.CommandId)) {
    throw new Error("SSM command invocation CommandId is invalid");
  }
  if (invocation.CommandId !== commandId) {
    throw new Error("SSM command invocation CommandId does not match the sent command");
  }
  if (typeof invocation.InstanceId !== "string" || !instanceIdPattern.test(invocation.InstanceId)) {
    throw new Error("SSM command invocation InstanceId is invalid");
  }
  if (invocation.InstanceId !== instanceId) {
    throw new Error("SSM command invocation InstanceId does not match the stack instance");
  }
  if (typeof invocation.DocumentName !== "string" || !ssmDocumentPattern.test(invocation.DocumentName)) {
    throw new Error("SSM command invocation DocumentName is invalid");
  }
  if (invocation.DocumentName !== documentName) {
    throw new Error("SSM command invocation DocumentName does not match the verification document");
  }
  if (invocation.Status !== "Success") throw new Error("SSM command invocation must have Status=Success");
  if (typeof invocation.ResponseCode !== "number" || !Number.isFinite(invocation.ResponseCode)
    || invocation.ResponseCode !== 0) throw new Error("SSM command invocation response code must be numeric zero");
  if (typeof invocation.StandardErrorContent !== "string"
    || invocation.StandardErrorContent.trim() !== "") throw new Error("SSM verification stderr must be empty");
  const stdout = invocation.StandardOutputContent;
  if (typeof stdout !== "string" || !/^[^\r\n]+(?:\r?\n)?$/.test(stdout)) {
    throw new Error("SSM verification output must contain exactly one line");
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error("SSM verification output must be fixed JSON");
  }
  exactKeys(parsed, hostKeys, "SSM host verification output");
  const expected = {
    mount: true,
    filesystem: "xfs",
    directories: true,
    services: true,
    runningContainers: 0,
    activeRelease: false
  };
  for (const [key, value] of Object.entries(expected)) {
    if (parsed[key] !== value) throw new Error(`SSM host verification ${key} does not match`);
  }
  return expected;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function isoTimestamp(now) {
  if (typeof now !== "function") throw new Error("AWS Staging acceptance requires an injected clock function");
  const milliseconds = now();
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds)) {
    throw new Error("AWS Staging acceptance clock must return finite milliseconds");
  }
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error("AWS Staging acceptance timestamp is invalid");
  return date.toISOString();
}

export async function verifyAwsStagingEnvironment({
  aws,
  config,
  resolveDns = resolve4,
  runPreflight,
  runtimeArtifact,
  templateArtifact,
  now = Date.now
}) {
  if (!aws || typeof aws.json !== "function" || typeof aws.text !== "function") {
    throw new Error("The guarded AWS CLI adapter is required");
  }
  requireResolvedConfig(config);
  const hostname = requireAwsStagingHostname(config.hostname);
  if (typeof resolveDns !== "function" || typeof runPreflight !== "function") {
    throw new Error("AWS Staging acceptance requires DNS and in-process preflight boundaries");
  }

  const approvedRuntime = requireAwsStagingRuntimeArtifact(runtimeArtifact);
  const approvedTemplate = requireAwsStagingTemplateArtifact(
    templateArtifact,
    approvedRuntime.runtimeSourceRevision
  );
  const preflight = await runPreflight({
    aws,
    config,
    resolveDns,
    runtimeArtifact: approvedRuntime,
    templateArtifact: approvedTemplate
  });
  const preflightDns = requireFreshPreflight(
    preflight,
    config,
    approvedRuntime,
    approvedTemplate
  );

  const describedStack = await aws.json([
    "cloudformation", "describe-stacks", "--stack-name", config.stackName
  ]);
  const { stack, stackId } = requireStack(describedStack, config);
  const outputs = requireOutputs(stack, config);
  const listedResources = await aws.json([
    "cloudformation", "list-stack-resources", "--stack-name", stackId
  ]);
  const resources = requireStackResources(listedResources, outputs);

  const describedInstances = await aws.json([
    "ec2", "describe-instances", "--instance-ids", outputs.InstanceId
  ]);
  const { instance, rootVolumeId, networkInterfaceId } = requireInstance(
    describedInstances, outputs, resources, config
  );
  const describedAddresses = await aws.json([
    "ec2", "describe-addresses", "--allocation-ids", resources.ElasticIp.physicalId
  ]);
  requireElasticAddress(
    describedAddresses, outputs, resources, outputs.InstanceId, networkInterfaceId
  );
  const describedImages = await aws.json([
    "ec2", "describe-images", "--image-ids", instance.ImageId
  ]);
  requireImage(describedImages, instance.ImageId);

  const describedSecurityGroups = await aws.json([
    "ec2", "describe-security-groups", "--group-ids", resources.WebSecurityGroup.physicalId
  ]);
  const ingress = requireIngress(describedSecurityGroups, resources);
  const describedVolumes = await aws.json([
    "ec2", "describe-volumes", "--volume-ids", rootVolumeId, outputs.DataVolumeId
  ]);
  const volumes = requireVolumes(
    describedVolumes, outputs.InstanceId, rootVolumeId, outputs.DataVolumeId, config.owner
  );

  const ec2TaggedIds = [
    resources.Vpc.physicalId, resources.InternetGateway.physicalId,
    resources.PublicSubnet.physicalId, resources.PublicRouteTable.physicalId,
    resources.WebSecurityGroup.physicalId, outputs.InstanceId,
    resources.ElasticIp.physicalId, rootVolumeId, outputs.DataVolumeId
  ];
  const describedEc2Tags = await aws.json([
    "ec2", "describe-tags", "--filters", `Name=resource-id,Values=${ec2TaggedIds.join(",")}`
  ]);
  requireEc2TagCoverage(describedEc2Tags, ec2TaggedIds, config.owner);

  const describedSsm = await aws.json([
    "ssm", "describe-instance-information", "--filters", `Key=InstanceIds,Values=${outputs.InstanceId}`
  ]);
  requireSsmOnline(describedSsm, outputs.InstanceId);

  const describedVerificationDocument = await aws.json([
    "ssm", "get-document",
    "--name", outputs.HostVerificationDocumentName,
    "--document-version", "$LATEST",
    "--document-format", "JSON"
  ]);
  const verificationDocumentAttestation = attestAwsStagingDocument(
    describedVerificationDocument,
    {
      expectedName: outputs.HostVerificationDocumentName,
      expectedContent: AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT,
      label: "Host verification"
    }
  );
  const describedAgentParameter = await aws.json([
    "ssm", "get-parameter", "--name", outputs.CloudWatchAgentConfigParameterName
  ]);
  const agentParameterAttestation = attestAwsStagingCloudWatchParameter(
    describedAgentParameter,
    {
      config,
      expectedName: outputs.CloudWatchAgentConfigParameterName,
      expectedContent: AWS_STAGING_CLOUDWATCH_AGENT_CONFIG
    }
  );

  for (const [resourceType, resourceId, logicalId] of [
    ["Parameter", outputs.CloudWatchAgentConfigParameterName, "CloudWatchAgentConfigParameter"],
    ["Document", outputs.HostBootstrapDocumentName, "HostBootstrapDocument"],
    ["Document", outputs.HostVerificationDocumentName, "HostVerificationDocument"]
  ]) {
    const response = await aws.json([
      "ssm", "list-tags-for-resource", "--resource-type", resourceType, "--resource-id", resourceId
    ]);
    noPagination(response, `SSM ${logicalId} tags`);
    requireTags(response.TagList, config.owner, `SSM ${logicalId}`);
  }

  const releaseBucket = await verifyBucket({
    aws, name: outputs.ReleaseBucketName, kind: "release",
    owner: config.owner, accountId: config.accountId
  });
  const backupBucket = await verifyBucket({
    aws, name: outputs.BackupBucketName, kind: "backup",
    owner: config.owner, accountId: config.accountId
  });

  const roleTags = await aws.json([
    "iam", "list-role-tags", "--role-name", resources.InstanceRole.physicalId
  ]);
  noPagination(roleTags, "IAM role tags", ["Marker"]);
  if (roleTags.IsTruncated !== false) throw new Error("IAM role tag result is truncated");
  requireTags(roleTags.Tags, config.owner, "IAM instance role");

  const describedSecret = await aws.json([
    "secretsmanager", "describe-secret", "--secret-id", outputs.ApplicationSecretArn
  ]);
  if (describedSecret?.ARN !== outputs.ApplicationSecretArn
    || describedSecret?.Name !== "/needo/staging/application") {
    throw new Error("Secrets Manager secret identity does not match stack output");
  }
  requireTags(describedSecret.Tags, config.owner, "Secrets Manager application secret");
  const listedVersions = await aws.json([
    "secretsmanager", "list-secret-version-ids", "--secret-id", outputs.ApplicationSecretArn
  ]);
  noPagination(listedVersions, "Secrets Manager versions");
  if (!Array.isArray(listedVersions.Versions) || listedVersions.Versions.length !== 0) {
    throw new Error("Secrets Manager secret version count must be zero");
  }

  const describedLogGroups = await aws.json([
    "logs", "describe-log-groups", "--log-group-name-prefix", "/needo/staging/"
  ]);
  const logs = requireLogGroups(describedLogGroups, resources, config);
  for (const log of logs) {
    const response = await aws.json([
      "logs", "list-tags-for-resource", "--resource-arn", log.arn
    ]);
    requireTagMap(response?.tags, config.owner, `CloudWatch log group ${log.name}`);
  }

  const alarmNames = alarmLogicalIds.map((logicalId) => resources[logicalId].physicalId);
  const describedAlarms = await aws.json([
    "cloudwatch", "describe-alarms", "--alarm-names", ...alarmNames
  ]);
  const alarms = requireAlarms(
    describedAlarms, resources, outputs.InstanceId, resources.AlertTopic.physicalId,
    config.accountId, config.region
  );
  for (const alarm of alarms) {
    const response = await aws.json([
      "cloudwatch", "list-tags-for-resource", "--resource-arn", alarm.arn
    ]);
    requireTags(response?.Tags, config.owner, `CloudWatch alarm ${alarm.name}`);
  }

  const topicTags = await aws.json([
    "sns", "list-tags-for-resource", "--resource-arn", resources.AlertTopic.physicalId
  ]);
  requireTags(topicTags?.Tags, config.owner, "SNS alert topic");
  const listedTopicSubscriptions = await aws.json([
    "sns", "list-subscriptions-by-topic", "--topic-arn", resources.AlertTopic.physicalId
  ]);
  const snsSubscriptionConfirmed = requireConfirmedSnsSubscription(
    listedTopicSubscriptions, resources, config
  );

  const describedBudget = await aws.json([
    "budgets", "describe-budget", "--account-id", config.accountId,
    "--budget-name", outputs.BudgetName
  ]);
  requireBudget(describedBudget, config, outputs.BudgetName);
  const describedNotifications = await aws.json([
    "budgets", "describe-notifications-for-budget", "--account-id", config.accountId,
    "--budget-name", outputs.BudgetName
  ]);
  const notifications = requireNotifications(describedNotifications);
  for (const notification of notifications) {
    const subscribers = await aws.json([
      "budgets", "describe-subscribers-for-notification", "--account-id", config.accountId,
      "--budget-name", outputs.BudgetName, "--notification", notificationArgument(notification)
    ]);
    requireSubscriber(subscribers, config);
  }
  const budgetResourceArn = `arn:aws:budgets::${config.accountId}:budget/${outputs.BudgetName}`;
  const budgetTags = await aws.json([
    "budgets", "list-tags-for-resource", "--resource-arn", budgetResourceArn
  ]);
  requireTags(budgetTags?.ResourceTags, config.owner, "AWS Budget");

  const arnMappings = resourceArns({ config, resources, rootVolumeId, logs, alarms, outputs });
  const resourceGroupTags = await aws.json([
    "resourcegroupstaggingapi", "get-resources", "--tag-filters",
    "Key=Project,Values=needo", "Key=Environment,Values=staging",
    `Key=Owner,Values=${config.owner}`, "Key=ManagedBy,Values=cloudformation"
  ]);
  const resourceGroupLogicalIds = requireResourceGroupTags(
    resourceGroupTags, arnMappings, config.owner
  );

  await approvedRuntime.assertCurrentState();
  const commandResponse = await aws.json([
    "ssm", "send-command", "--document-name", outputs.HostVerificationDocumentName,
    "--document-version", verificationDocumentAttestation.version,
    "--instance-ids", outputs.InstanceId,
    "--comment", "NeeDo Staging environment-only acceptance verification"
  ]);
  const commandId = requireCommandId(commandResponse);
  await aws.text([
    "ssm", "wait", "command-executed", "--command-id", commandId,
    "--instance-id", outputs.InstanceId
  ]);
  const invocation = await aws.json([
    "ssm", "get-command-invocation", "--command-id", commandId,
    "--instance-id", outputs.InstanceId
  ]);
  const host = requireHostInvocation(invocation, {
    commandId,
    instanceId: outputs.InstanceId,
    documentName: outputs.HostVerificationDocumentName
  });

  const postVerificationDns = await resolveDnsA(resolveDns, hostname);
  if (JSON.stringify(preflightDns) !== JSON.stringify(postVerificationDns)) {
    throw new Error("DNS A records changed during AWS Staging acceptance verification");
  }

  const serviceTagLogicalIds = new Set(taggableLogicalIds);
  const tagCoverage = taggableLogicalIds.map((logicalId) => ({
    logicalId,
    serviceTags: serviceTagLogicalIds.has(logicalId),
    resourceGroupsTags: resourceGroupLogicalIds.has(logicalId)
  })).sort((left, right) => left.logicalId.localeCompare(right.logicalId));

  return deepFreeze({
    timestamp: isoTimestamp(now),
    accountId: config.accountId,
    region: config.region,
    hostname,
    runtimeSourceRevision: approvedRuntime.runtimeSourceRevision,
    runtimeManifestSha256: approvedRuntime.runtimeManifestSha256,
    runtimeEntrypoint: approvedRuntime.runtimeEntrypoint,
    stack: { id: stackId, name: config.stackName, status: stack.StackStatus },
    resourceIds: {
      instanceId: outputs.InstanceId,
      rootVolumeId,
      dataVolumeId: outputs.DataVolumeId,
      securityGroupId: resources.WebSecurityGroup.physicalId,
      vpcId: resources.Vpc.physicalId,
      subnetId: resources.PublicSubnet.physicalId,
      elasticIpAllocationId: resources.ElasticIp.physicalId,
      releaseBucketName: outputs.ReleaseBucketName,
      backupBucketName: outputs.BackupBucketName,
      applicationSecretArn: "REDACTED",
      hostVerificationDocumentName: outputs.HostVerificationDocumentName,
      cloudWatchAgentParameterName: outputs.CloudWatchAgentConfigParameterName,
      budgetName: outputs.BudgetName
    },
    elasticIp: outputs.ElasticIp,
    tagCoverage: {
      requiredTags: { ...requiredTags, Owner: config.owner },
      resources: tagCoverage,
      resourceGroupsResultCount: resourceGroupLogicalIds.size
    },
    ec2: {
      instanceType: "t4g.large",
      architecture: "arm64",
      imageId: instance.ImageId,
      keyNamePresent: false,
      imdsV2Required: true,
      detailedMonitoring: true
    },
    ingress,
    volumes,
    ssm: {
      online: true,
      documentVersion: verificationDocumentAttestation.version,
      documentSha256: verificationDocumentAttestation.sha256,
      commandId,
      commandStatus: "Success",
      responseCode: 0
    },
    host,
    buckets: { release: releaseBucket, backup: backupBucket },
    secretVersionCount: 0,
    monitoring: {
      logGroups: logs.map(({ name, arn, retentionDays }) => ({ name, arn, retentionDays })),
      alarms: alarms.map(({ name, namespace, metricName, threshold, actionsEnabled }) => ({
        name, namespace, metricName, threshold, actionsEnabled
      })),
      agentParameterName: outputs.CloudWatchAgentConfigParameterName,
      agentParameterVersion: agentParameterAttestation.version,
      agentParameterSha256: agentParameterAttestation.sha256,
      topicTagged: true,
      snsSubscriptionConfirmed
    },
    budget: {
      name: outputs.BudgetName,
      amount: config.budgetAmount,
      unit: config.budgetUnit,
      timeUnit: "MONTHLY",
      budgetType: "COST",
      notifications,
      maskedSubscriber: maskEmail(config.alertEmail)
    },
    dns: { preflightA: preflightDns, postVerificationA: postVerificationDns },
    applicationDeployed: false,
    migrationRun: false,
    seedRun: false,
    dnsModified: false,
    businessDataMutation: false,
    waivedBaselineFailures: [...waivedBaselineFailures]
  });
}

function requireBoolean(value, expected, label) {
  if (value !== expected) throw new Error(`${label} must be ${expected}`);
  return value;
}

function reconstructAcceptanceEvidence(evidence) {
  exactKeys(evidence, topLevelEvidenceKeys, "AWS Staging acceptance evidence");
  const timestamp = nonEmptyString(evidence.timestamp, "Acceptance timestamp");
  if (new Date(timestamp).toISOString() !== timestamp) throw new Error("Acceptance timestamp is invalid");
  const accountId = nonEmptyString(evidence.accountId, "Acceptance accountId");
  if (!/^\d{12}$/.test(accountId)) throw new Error("Acceptance accountId is invalid");
  const region = requireAwsStagingRegion(evidence.region);
  const hostname = requireAwsStagingHostname(evidence.hostname);
  const runtimeSourceRevision = nonEmptyString(
    evidence.runtimeSourceRevision,
    "Acceptance runtimeSourceRevision"
  );
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(runtimeSourceRevision)) {
    throw new Error("Acceptance runtimeSourceRevision is invalid");
  }
  const runtimeManifestSha256 = nonEmptyString(
    evidence.runtimeManifestSha256,
    "Acceptance runtimeManifestSha256"
  );
  if (!/^[0-9a-f]{64}$/.test(runtimeManifestSha256)) {
    throw new Error("Acceptance runtimeManifestSha256 is invalid");
  }
  if (evidence.runtimeEntrypoint !== "scripts/aws-staging-verify.mjs") {
    throw new Error("Acceptance runtimeEntrypoint is invalid");
  }

  exactKeys(evidence.stack, ["id", "name", "status"], "Acceptance stack");
  if (evidence.stack.name !== "needo-staging-infrastructure"
    || !stableStackStates.has(evidence.stack.status)) throw new Error("Acceptance stack identity or status is invalid");
  const stackId = requireAwsStagingStackId(evidence.stack.id, {
    accountId,
    region,
    stackName: "needo-staging-infrastructure"
  }, "Acceptance StackId");

  const resourceIdKeys = [
    "instanceId", "rootVolumeId", "dataVolumeId", "securityGroupId", "vpcId", "subnetId",
    "elasticIpAllocationId", "releaseBucketName", "backupBucketName", "applicationSecretArn",
    "hostVerificationDocumentName", "cloudWatchAgentParameterName", "budgetName"
  ];
  exactKeys(evidence.resourceIds, resourceIdKeys, "Acceptance resourceIds");
  safeArgument(evidence.resourceIds.instanceId, "Acceptance instanceId", instanceIdPattern);
  safeArgument(evidence.resourceIds.rootVolumeId, "Acceptance rootVolumeId", volumeIdPattern);
  safeArgument(evidence.resourceIds.dataVolumeId, "Acceptance dataVolumeId", volumeIdPattern);
  safeArgument(evidence.resourceIds.securityGroupId, "Acceptance securityGroupId", resourceIdPatterns.WebSecurityGroup);
  safeArgument(evidence.resourceIds.vpcId, "Acceptance vpcId", resourceIdPatterns.Vpc);
  safeArgument(evidence.resourceIds.subnetId, "Acceptance subnetId", resourceIdPatterns.PublicSubnet);
  safeArgument(evidence.resourceIds.elasticIpAllocationId, "Acceptance EIP allocation", resourceIdPatterns.ElasticIp);
  for (const key of ["releaseBucketName", "backupBucketName"]) {
    safeArgument(evidence.resourceIds[key], `Acceptance ${key}`, /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);
  }
  if (evidence.resourceIds.applicationSecretArn !== "REDACTED") {
    throw new Error("Acceptance secret ARN must be REDACTED");
  }
  safeArgument(evidence.resourceIds.hostVerificationDocumentName, "Acceptance verification document", ssmDocumentPattern);
  if (evidence.resourceIds.cloudWatchAgentParameterName !== "/needo/staging/cloudwatch-agent") {
    throw new Error("Acceptance agent parameter is invalid");
  }
  if (evidence.resourceIds.budgetName !== "needo-staging-infrastructure-monthly-cost") {
    throw new Error("Acceptance budget name is invalid");
  }
  if (!isIPv4(evidence.elasticIp)) throw new Error("Acceptance Elastic IP is invalid");

  exactKeys(evidence.tagCoverage, ["requiredTags", "resources", "resourceGroupsResultCount"], "Acceptance tagCoverage");
  exactKeys(evidence.tagCoverage.requiredTags, ["Project", "Environment", "ManagedBy", "Owner"], "Acceptance requiredTags");
  if (evidence.tagCoverage.requiredTags.Project !== "needo"
    || evidence.tagCoverage.requiredTags.Environment !== "staging"
    || evidence.tagCoverage.requiredTags.ManagedBy !== "cloudformation"
    || !/^[a-z0-9][a-z0-9-]{1,31}$/.test(evidence.tagCoverage.requiredTags.Owner)) {
    throw new Error("Acceptance required tags are invalid");
  }
  if (!Array.isArray(evidence.tagCoverage.resources)
    || evidence.tagCoverage.resources.length !== taggableLogicalIds.length) {
    throw new Error("Acceptance tag coverage cardinality is invalid");
  }
  const expectedLogicalIds = [...taggableLogicalIds].sort();
  const actualLogicalIds = evidence.tagCoverage.resources.map((coverage) => {
    exactKeys(coverage, ["logicalId", "serviceTags", "resourceGroupsTags"], "Acceptance resource tag coverage");
    requireBoolean(coverage.serviceTags, true, "Acceptance service tag coverage");
    requireBoolean(
      coverage.resourceGroupsTags,
      resourceGroupsLogicalIdSet.has(coverage.logicalId),
      `Acceptance Resource Groups tag coverage for ${String(coverage.logicalId)}`
    );
    return coverage.logicalId;
  });
  if (JSON.stringify(actualLogicalIds) !== JSON.stringify(expectedLogicalIds)) {
    throw new Error("Acceptance tag coverage logical IDs are invalid");
  }
  const rgCount = evidence.tagCoverage.resources.filter((item) => item.resourceGroupsTags).length;
  if (evidence.tagCoverage.resourceGroupsResultCount !== rgCount
    || rgCount !== resourceGroupsLogicalIds.length) {
    throw new Error("Acceptance Resource Groups tag result count is invalid");
  }

  exactKeys(evidence.ec2, [
    "instanceType", "architecture", "imageId", "keyNamePresent", "imdsV2Required", "detailedMonitoring"
  ], "Acceptance ec2");
  if (evidence.ec2.instanceType !== "t4g.large" || evidence.ec2.architecture !== "arm64"
    || !amiIdPattern.test(evidence.ec2.imageId)) throw new Error("Acceptance EC2 identity is invalid");
  requireBoolean(evidence.ec2.keyNamePresent, false, "Acceptance keyNamePresent");
  requireBoolean(evidence.ec2.imdsV2Required, true, "Acceptance imdsV2Required");
  requireBoolean(evidence.ec2.detailedMonitoring, true, "Acceptance detailedMonitoring");

  if (!Array.isArray(evidence.ingress) || JSON.stringify(evidence.ingress) !== JSON.stringify([
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrIpv4: "0.0.0.0/0" },
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrIpv4: "0.0.0.0/0" }
  ])) throw new Error("Acceptance ingress is invalid");

  exactKeys(evidence.volumes, ["root", "data"], "Acceptance volumes");
  for (const [label, id, size] of [
    ["root", evidence.resourceIds.rootVolumeId, 30],
    ["data", evidence.resourceIds.dataVolumeId, 70]
  ]) {
    exactKeys(evidence.volumes[label], ["id", "sizeGiB", "type", "encrypted"], `Acceptance ${label} volume`);
    if (evidence.volumes[label].id !== id || evidence.volumes[label].sizeGiB !== size
      || evidence.volumes[label].type !== "gp3" || evidence.volumes[label].encrypted !== true) {
      throw new Error(`Acceptance ${label} volume is invalid`);
    }
  }

  exactKeys(evidence.ssm, [
    "online", "documentVersion", "documentSha256", "commandId", "commandStatus", "responseCode"
  ], "Acceptance ssm");
  requireBoolean(evidence.ssm.online, true, "Acceptance SSM online");
  if (!/^[1-9][0-9]*$/.test(evidence.ssm.documentVersion)
    || !/^[0-9a-f]{64}$/.test(evidence.ssm.documentSha256)) {
    throw new Error("Acceptance SSM document attestation is invalid");
  }
  safeArgument(evidence.ssm.commandId, "Acceptance SSM commandId", commandIdPattern);
  if (evidence.ssm.commandStatus !== "Success" || evidence.ssm.responseCode !== 0) {
    throw new Error("Acceptance SSM command result is invalid");
  }
  exactKeys(evidence.host, hostKeys, "Acceptance host");
  const expectedHost = { mount: true, filesystem: "xfs", directories: true, services: true, runningContainers: 0, activeRelease: false };
  if (hostKeys.some((key) => evidence.host[key] !== expectedHost[key])) throw new Error("Acceptance host result is invalid");

  exactKeys(evidence.buckets, ["release", "backup"], "Acceptance buckets");
  for (const [kind, expectedName, lifecycleCount] of [
    ["release", evidence.resourceIds.releaseBucketName, 1],
    ["backup", evidence.resourceIds.backupBucketName, 2]
  ]) {
    const bucket = evidence.buckets[kind];
    exactKeys(bucket, [
      "name", "encryption", "versioning", "publicAccessBlocked", "lifecycleRules",
      "tlsOnly", "policySha256"
    ], `Acceptance ${kind} bucket`);
    if (bucket.name !== expectedName || bucket.encryption !== "AES256" || bucket.versioning !== "Enabled"
      || bucket.publicAccessBlocked !== true || !Array.isArray(bucket.lifecycleRules)
      || bucket.lifecycleRules.length !== lifecycleCount || bucket.tlsOnly !== true
      || bucket.policySha256 !== createHash("sha256")
        .update(JSON.stringify(expectedBucketTlsPolicy(expectedName)), "utf8")
        .digest("hex")) throw new Error(`Acceptance ${kind} bucket is invalid`);
    if (kind === "release") {
      const [rule] = bucket.lifecycleRules;
      exactKeys(rule, ["id", "status", "abortIncompleteMultipartUploadDays"], "Acceptance release lifecycle rule");
      if (rule.id !== "AbortIncompleteMultipartUploads" || rule.status !== "Enabled"
        || rule.abortIncompleteMultipartUploadDays !== 7) {
        throw new Error("Acceptance release lifecycle rule is invalid");
      }
    } else {
      const expectedRules = [
        ["DailyBackups30Days", "staging/daily/", 30],
        ["PreMigrationRecovery90Days", "staging/pre-migration/", 90]
      ];
      for (const [index, [id, prefix, days]] of expectedRules.entries()) {
        const rule = bucket.lifecycleRules[index];
        exactKeys(rule, [
          "id", "status", "prefix", "expirationDays",
          "noncurrentVersionExpirationDays", "abortIncompleteMultipartUploadDays"
        ], "Acceptance backup lifecycle rule");
        if (rule.id !== id || rule.status !== "Enabled" || rule.prefix !== prefix
          || rule.expirationDays !== days || rule.noncurrentVersionExpirationDays !== days
          || rule.abortIncompleteMultipartUploadDays !== 7) {
          throw new Error("Acceptance backup lifecycle rule is invalid");
        }
      }
    }
  }
  if (evidence.secretVersionCount !== 0) throw new Error("Acceptance secret version count must be zero");

  exactKeys(evidence.monitoring, [
    "logGroups", "alarms", "agentParameterName", "agentParameterVersion",
    "agentParameterSha256", "topicTagged", "snsSubscriptionConfirmed"
  ], "Acceptance monitoring");
  if (!Array.isArray(evidence.monitoring.logGroups) || evidence.monitoring.logGroups.length !== 2) {
    throw new Error("Acceptance log groups are invalid");
  }
  const logGroupNames = evidence.monitoring.logGroups.map((group) => {
    exactKeys(group, ["name", "arn", "retentionDays"], "Acceptance log group");
    if (group.retentionDays !== 30) throw new Error("Acceptance log group retention is invalid");
    const logArnPattern = new RegExp(
      `^arn:aws:logs:${escapeRegExp(region)}:${accountId}:log-group:${escapeRegExp(String(group.name))}$`
    );
    safeArgument(group.arn, `Acceptance log group ${String(group.name)} ARN`, logArnPattern);
    return group.name;
  }).sort();
  if (JSON.stringify(logGroupNames) !== JSON.stringify([
    "/needo/staging/docker", "/needo/staging/system"
  ])) throw new Error("Acceptance log groups are invalid or duplicate");
  if (!Array.isArray(evidence.monitoring.alarms) || evidence.monitoring.alarms.length !== 4) {
    throw new Error("Acceptance alarms are invalid");
  }
  const alarmSummaries = [];
  for (const alarm of evidence.monitoring.alarms) {
    exactKeys(
      alarm,
      ["name", "namespace", "metricName", "threshold", "actionsEnabled"],
      "Acceptance alarm"
    );
    safeArgument(alarm.name, "Acceptance alarm name", /^[A-Za-z0-9_.-]+$/);
    if (alarm.actionsEnabled !== true) {
      throw new Error("Acceptance alarm ActionsEnabled must be true");
    }
    alarmSummaries.push(`${alarm.namespace}:${alarm.metricName}:${alarm.threshold}`);
  }
  const expectedAlarmSummaries = [
    "AWS/EC2:StatusCheckFailed:1",
    "Needo/Staging:mem_used_percent:85",
    "Needo/Staging:disk_used_percent:80",
    "Needo/Staging:disk_used_percent:80"
  ].sort();
  if (JSON.stringify(alarmSummaries.sort()) !== JSON.stringify(expectedAlarmSummaries)) {
    throw new Error("Acceptance alarm summaries are invalid");
  }
  if (evidence.monitoring.agentParameterName !== evidence.resourceIds.cloudWatchAgentParameterName
    || !Number.isSafeInteger(evidence.monitoring.agentParameterVersion)
    || evidence.monitoring.agentParameterVersion < 1
    || !/^[0-9a-f]{64}$/.test(evidence.monitoring.agentParameterSha256)
    || evidence.monitoring.topicTagged !== true
    || evidence.monitoring.snsSubscriptionConfirmed !== true) {
    throw new Error("Acceptance monitoring parameter, topic, or SNS subscription is invalid");
  }

  exactKeys(evidence.budget, [
    "name", "amount", "unit", "timeUnit", "budgetType", "notifications", "maskedSubscriber"
  ], "Acceptance budget");
  if (evidence.budget.name !== evidence.resourceIds.budgetName
    || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(evidence.budget.amount)
    || Number(evidence.budget.amount) <= 0 || !/^[A-Z]{3}$/.test(evidence.budget.unit)
    || evidence.budget.timeUnit !== "MONTHLY" || evidence.budget.budgetType !== "COST") {
    throw new Error("Acceptance budget is invalid");
  }
  if (!Array.isArray(evidence.budget.notifications)
    || evidence.budget.notifications.length !== notificationDefinitions.length) {
    throw new Error("Acceptance budget notifications are invalid");
  }
  const expectedNotifications = notificationDefinitions.map(([notificationType, threshold]) => `${notificationType}:${threshold}`).sort();
  const actualNotifications = evidence.budget.notifications.map((notification) => {
    exactKeys(notification, ["notificationType", "threshold", "comparisonOperator", "thresholdType"], "Acceptance notification");
    if (notification.comparisonOperator !== "GREATER_THAN" || notification.thresholdType !== "PERCENTAGE") {
      throw new Error("Acceptance notification is invalid");
    }
    return `${notification.notificationType}:${notification.threshold}`;
  }).sort();
  if (JSON.stringify(actualNotifications) !== JSON.stringify(expectedNotifications)) {
    throw new Error("Acceptance budget notifications differ from the approved set");
  }
  if (!/^[^@*]\*{3}@[a-z0-9.-]+\.[a-z]{2,63}$/.test(evidence.budget.maskedSubscriber)
    || /^[^@]+@/.test(evidence.budget.maskedSubscriber.replace("***", "")) === false) {
    throw new Error("Acceptance masked email is invalid");
  }

  exactKeys(evidence.dns, ["preflightA", "postVerificationA"], "Acceptance DNS");
  const preflightA = sortedUniqueDns(evidence.dns.preflightA, "Acceptance preflight");
  const postVerificationA = sortedUniqueDns(evidence.dns.postVerificationA, "Acceptance post-verification");
  if (JSON.stringify(preflightA) !== JSON.stringify(evidence.dns.preflightA)
    || JSON.stringify(postVerificationA) !== JSON.stringify(evidence.dns.postVerificationA)
    || JSON.stringify(preflightA) !== JSON.stringify(postVerificationA)) {
    throw new Error("Acceptance DNS records are invalid or changed");
  }
  for (const flag of [
    "applicationDeployed", "migrationRun", "seedRun", "dnsModified", "businessDataMutation"
  ]) requireBoolean(evidence[flag], false, `Acceptance ${flag}`);
  if (!Array.isArray(evidence.waivedBaselineFailures)
    || JSON.stringify(evidence.waivedBaselineFailures) !== JSON.stringify(waivedBaselineFailures)) {
    throw new Error("Acceptance waived baseline failures differ from the approved exact set");
  }

  const reconstructed = {
    timestamp,
    accountId,
    region,
    hostname,
    runtimeSourceRevision,
    runtimeManifestSha256,
    runtimeEntrypoint: "scripts/aws-staging-verify.mjs",
    stack: { id: stackId, name: "needo-staging-infrastructure", status: evidence.stack.status },
    resourceIds: { ...evidence.resourceIds },
    elasticIp: evidence.elasticIp,
    tagCoverage: {
      requiredTags: { ...evidence.tagCoverage.requiredTags },
      resources: evidence.tagCoverage.resources.map((item) => ({ ...item })),
      resourceGroupsResultCount: evidence.tagCoverage.resourceGroupsResultCount
    },
    ec2: { ...evidence.ec2 },
    ingress: evidence.ingress.map((rule) => ({ ...rule })),
    volumes: { root: { ...evidence.volumes.root }, data: { ...evidence.volumes.data } },
    ssm: { ...evidence.ssm },
    host: { ...evidence.host },
    buckets: {
      release: { ...evidence.buckets.release, lifecycleRules: evidence.buckets.release.lifecycleRules.map((rule) => ({ ...rule })) },
      backup: { ...evidence.buckets.backup, lifecycleRules: evidence.buckets.backup.lifecycleRules.map((rule) => ({ ...rule })) }
    },
    secretVersionCount: 0,
    monitoring: {
      logGroups: evidence.monitoring.logGroups.map((group) => ({ ...group })),
      alarms: evidence.monitoring.alarms.map((alarm) => ({ ...alarm })),
      agentParameterName: evidence.monitoring.agentParameterName,
      agentParameterVersion: evidence.monitoring.agentParameterVersion,
      agentParameterSha256: evidence.monitoring.agentParameterSha256,
      topicTagged: true,
      snsSubscriptionConfirmed: true
    },
    budget: {
      ...evidence.budget,
      notifications: evidence.budget.notifications.map((notification) => ({ ...notification }))
    },
    dns: { preflightA: [...preflightA], postVerificationA: [...postVerificationA] },
    applicationDeployed: false,
    migrationRun: false,
    seedRun: false,
    dnsModified: false,
    businessDataMutation: false,
    waivedBaselineFailures: [...waivedBaselineFailures]
  };
  const serialized = JSON.stringify(reconstructed);
  if (/(?:AKIA|ASIA)[A-Z0-9]{16}|FwoGZXIvYXdz|secret.?access.?key|session.?token|credential|caller.?arn|standard.?output|standard.?error|cloudformation.?parameters|parameter.?overrides|user.?data/i.test(serialized)
    || /(?:\/Users\/[^/]+|\/home\/[^/]+)/.test(serialized)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)) {
    throw new Error("Acceptance evidence contains an unsafe credential, email, output, parameter, or home path");
  }
  return deepFreeze(reconstructed);
}

function requireAbsoluteDescendant(trustedRoot, outputDirectory) {
  if (!path.isAbsolute(trustedRoot) || !path.isAbsolute(outputDirectory)) {
    throw new Error("AWS Staging evidence outputDirectory must be an absolute descendant of trustedRoot");
  }
  const normalizedRoot = path.resolve(trustedRoot);
  const normalizedOutput = path.resolve(outputDirectory);
  const relative = path.relative(normalizedRoot, normalizedOutput);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("AWS Staging evidence outputDirectory must be an absolute descendant of trustedRoot");
  }
  return { normalizedRoot, normalizedOutput, components: relative.split(path.sep) };
}

function isMissing(error) {
  return error?.code === "ENOENT";
}

async function requireRealDirectory(fileSystem, directoryPath) {
  const stats = await fileSystem.lstat(directoryPath);
  if (stats.isSymbolicLink()) throw new Error(`AWS Staging evidence path component must not be a symlink: ${directoryPath}`);
  if (!stats.isDirectory()) throw new Error(`AWS Staging evidence path component must be a real directory: ${directoryPath}`);
  return stats;
}

async function verifyDirectoryIdentities(fileSystem, identities) {
  for (const identity of identities) {
    let stats;
    let realPath;
    try {
      stats = await requireRealDirectory(fileSystem, identity.path);
      realPath = await fileSystem.realpath(identity.path);
    } catch (error) {
      throw new Error(`AWS Staging evidence directory identity changed: ${identity.path}`, { cause: error });
    }
    if (stats.dev !== identity.dev || stats.ino !== identity.ino || realPath !== identity.realPath) {
      throw new Error(`AWS Staging evidence directory identity changed: ${identity.path}`);
    }
  }
}

async function captureDirectoryIdentity(fileSystem, directoryPath) {
  const stats = await requireRealDirectory(fileSystem, directoryPath);
  const identity = Object.freeze({
    path: directoryPath,
    realPath: await fileSystem.realpath(directoryPath),
    dev: stats.dev,
    ino: stats.ino
  });
  await verifyDirectoryIdentities(fileSystem, [identity]);
  return identity;
}

async function prepareDirectoryPath(fileSystem, boundary) {
  const identities = [await captureDirectoryIdentity(fileSystem, boundary.normalizedRoot)];
  let currentPath = boundary.normalizedRoot;
  for (const component of boundary.components) {
    currentPath = path.join(currentPath, component);
    await verifyDirectoryIdentities(fileSystem, identities);
    try {
      await requireRealDirectory(fileSystem, currentPath);
    } catch (error) {
      if (!isMissing(error)) throw error;
      await verifyDirectoryIdentities(fileSystem, identities);
      try {
        await fileSystem.mkdir(currentPath, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      await verifyDirectoryIdentities(fileSystem, identities);
    }
    const identity = await captureDirectoryIdentity(fileSystem, currentPath);
    await verifyDirectoryIdentities(fileSystem, identities);
    identities.push(identity);
    await verifyDirectoryIdentities(fileSystem, identities);
  }
  return Object.freeze(identities);
}

function requireSameDirectory(stats, identity) {
  if (!stats.isDirectory() || stats.dev !== identity.dev || stats.ino !== identity.ino) {
    throw new Error(`AWS Staging evidence directory handle identity changed: ${identity.path}`);
  }
}

async function enforcePrivateDirectory(fileSystem, identities) {
  const finalIdentity = identities.at(-1);
  await verifyDirectoryIdentities(fileSystem, identities);
  const handle = await fileSystem.open(finalIdentity.path, directoryOpenFlags);
  try {
    requireSameDirectory(await handle.stat(), finalIdentity);
    await handle.chmod(0o700);
    const stats = await handle.stat();
    requireSameDirectory(stats, finalIdentity);
    if ((stats.mode & 0o777) !== 0o700) throw new Error("AWS Staging evidence directory mode must be 0700");
  } finally {
    await handle.close();
  }
  await verifyDirectoryIdentities(fileSystem, identities);
}

function requireSameRegularFile(stats, identity, label) {
  if (!stats.isFile() || stats.isSymbolicLink() || stats.dev !== identity.dev || stats.ino !== identity.ino) {
    throw new Error(`AWS Staging evidence ${label} identity changed`);
  }
}

async function removeTemporaryFile(fileSystem, temporaryPath) {
  try {
    await fileSystem.unlink(temporaryPath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

export async function writeAwsStagingAcceptanceEvidence({
  evidence,
  outputDirectory = defaultOutputDirectory,
  trustedRoot = defaultTrustedRoot,
  fileSystem = fs
}) {
  const reconstructed = reconstructAcceptanceEvidence(evidence);
  const contents = `${JSON.stringify(reconstructed, null, 2)}\n`;
  const boundary = requireAbsoluteDescendant(trustedRoot, outputDirectory);
  const identities = await prepareDirectoryPath(fileSystem, boundary);
  await enforcePrivateDirectory(fileSystem, identities);
  const finalPath = path.join(boundary.normalizedOutput, evidenceFileName);
  const temporaryPath = path.join(
    boundary.normalizedOutput,
    `.${evidenceFileName}.${process.pid}.${randomUUID()}.tmp`
  );
  let handle;
  let temporaryCreated = false;
  try {
    await verifyDirectoryIdentities(fileSystem, identities);
    handle = await fileSystem.open(temporaryPath, temporaryOpenFlags, 0o600);
    temporaryCreated = true;
    await verifyDirectoryIdentities(fileSystem, identities);
    await handle.chmod(0o600);
    const openedStats = await handle.stat();
    if (!openedStats.isFile()) throw new Error("AWS Staging evidence temporary path is not a regular file");
    const temporaryIdentity = { dev: openedStats.dev, ino: openedStats.ino };
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await verifyDirectoryIdentities(fileSystem, identities);
    requireSameRegularFile(await fileSystem.lstat(temporaryPath), temporaryIdentity, "temporary file");
    await fileSystem.rename(temporaryPath, finalPath);
    temporaryCreated = false;
    await verifyDirectoryIdentities(fileSystem, identities);
    const finalStats = await fileSystem.lstat(finalPath);
    requireSameRegularFile(finalStats, temporaryIdentity, "final file");
    if ((finalStats.mode & 0o777) !== 0o600) throw new Error("AWS Staging evidence final file mode must be 0600");
    return finalPath;
  } catch (error) {
    const cleanupErrors = [];
    if (handle) {
      try { await handle.close(); } catch (closeError) { cleanupErrors.push(closeError); }
      handle = undefined;
    }
    if (temporaryCreated) {
      try { await removeTemporaryFile(fileSystem, temporaryPath); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], "AWS Staging evidence write failed and cleanup also failed");
    }
    throw error;
  }
}
