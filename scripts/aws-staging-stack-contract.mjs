import { createHash } from "node:crypto";
import { isIPv4 } from "node:net";

export const AWS_STAGING_OUTPUT_KEYS = Object.freeze([
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

export const AWS_STAGING_EXPECTED_RESOURCES = Object.freeze([
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

const INSTANCE_ID_PATTERN = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const VOLUME_ID_PATTERN = /^vol-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9_.-]{3,128}$/;
const REQUIRED_TAGS = Object.freeze({
  Project: "needo",
  Environment: "staging",
  ManagedBy: "cloudformation"
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value
    || /[\r\n\0]/.test(value)) {
    throw new Error(`${label} must be a non-empty safe string`);
  }
  return value;
}

function noPagination(response, label) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error(`${label} response is malformed`);
  }
  for (const key of ["NextToken", "nextToken", "PaginationToken"]) {
    if (response[key] !== undefined && response[key] !== "") {
      throw new Error(`${label} response is paginated or truncated`);
    }
  }
}

function tagsToExactObject(tags, config, label) {
  if (!Array.isArray(tags)) throw new Error(`${label} tags must be an array`);
  const mapped = {};
  for (const tag of tags) {
    const key = nonEmptyString(tag?.Key, `${label} tag key`);
    const value = nonEmptyString(tag?.Value, `${label} tag ${key}`);
    if (Object.hasOwn(mapped, key)) throw new Error(`${label} tag ${key} is duplicate`);
    mapped[key] = value;
  }
  const expected = { ...REQUIRED_TAGS, Owner: config.owner };
  if (Reflect.ownKeys(mapped).length !== Reflect.ownKeys(expected).length
    || Object.entries(expected).some(([key, value]) => mapped[key] !== value)) {
    throw new Error(`${label} tags do not match the exact AWS Staging tag set`);
  }
  return Object.freeze(expected);
}

export function requireAwsStagingStackId(value, config, label = "CloudFormation StackId") {
  const stackId = nonEmptyString(value, label);
  const match = /^arn:aws:cloudformation:([^:]+):(\d{12}):stack\/([^/]+)\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/.exec(stackId);
  if (!match) throw new Error(`${label} is invalid`);
  const [, region, accountId, stackName] = match;
  if (accountId !== config.accountId) throw new Error(`${label} account does not match`);
  if (region !== config.region) throw new Error(`${label} region does not match`);
  if (stackName !== config.stackName) throw new Error(`${label} name does not match`);
  return stackId;
}

export function requireAwsStagingStack(response, config, {
  expectedStackId,
  allowedStatuses
} = {}) {
  noPagination(response, "CloudFormation describe-stacks");
  if (!Array.isArray(response.Stacks) || response.Stacks.length !== 1) {
    throw new Error(`Expected exactly one CloudFormation stack named ${config.stackName}`);
  }
  const [stack] = response.Stacks;
  if (stack?.StackName !== config.stackName) {
    throw new Error(`CloudFormation StackName identity must exactly match ${config.stackName}`);
  }
  const stackId = requireAwsStagingStackId(stack.StackId, config);
  if (expectedStackId !== undefined && stackId !== expectedStackId) {
    throw new Error("CloudFormation described StackId does not match the created StackId");
  }
  const statuses = allowedStatuses ?? new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
  if (!(statuses instanceof Set) || !statuses.has(stack.StackStatus)) {
    throw new Error(`CloudFormation stack ${config.stackName} is not safely complete: ${stack.StackStatus || "UNKNOWN"}`);
  }
  const stackTags = tagsToExactObject(stack.Tags, config, "CloudFormation stack");
  return Object.freeze({ stack, stackId, stackStatus: stack.StackStatus, stackTags });
}

export function requireAwsStagingOutputs(stack, config) {
  if (!Array.isArray(stack?.Outputs)) throw new Error("CloudFormation outputs must be an array");
  const outputs = {};
  for (const output of stack.Outputs) {
    const key = nonEmptyString(output?.OutputKey, "CloudFormation output key");
    const value = nonEmptyString(output?.OutputValue, `CloudFormation output ${key}`);
    if (Object.hasOwn(outputs, key)) throw new Error(`CloudFormation output key is duplicate: ${key}`);
    outputs[key] = value;
  }
  if (stack.Outputs.length !== AWS_STAGING_OUTPUT_KEYS.length
    || AWS_STAGING_OUTPUT_KEYS.some((key) => !Object.hasOwn(outputs, key))) {
    throw new Error(`CloudFormation must return exactly ${AWS_STAGING_OUTPUT_KEYS.length} approved outputs`);
  }
  if (!INSTANCE_ID_PATTERN.test(outputs.InstanceId)) throw new Error("CloudFormation output InstanceId is invalid");
  if (!isIPv4(outputs.ElasticIp)) throw new Error("CloudFormation output ElasticIp is invalid");
  if (!VOLUME_ID_PATTERN.test(outputs.DataVolumeId)) throw new Error("CloudFormation output DataVolumeId is invalid");
  for (const key of ["ReleaseBucketName", "BackupBucketName"]) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(outputs[key])) {
      throw new Error(`CloudFormation output ${key} is invalid`);
    }
  }
  if (outputs.ReleaseBucketName === outputs.BackupBucketName) {
    throw new Error("CloudFormation bucket outputs must be distinct");
  }
  const secretPattern = new RegExp(
    `^arn:aws:secretsmanager:${escapeRegExp(config.region)}:${config.accountId}:secret:/needo/staging/application-[A-Za-z0-9]{6}$`
  );
  if (!secretPattern.test(outputs.ApplicationSecretArn)) {
    throw new Error("CloudFormation output ApplicationSecretArn account or region is invalid");
  }
  for (const key of ["HostBootstrapDocumentName", "HostVerificationDocumentName"]) {
    if (!DOCUMENT_NAME_PATTERN.test(outputs[key])) throw new Error(`CloudFormation output ${key} is invalid`);
  }
  if (outputs.HostBootstrapDocumentName === outputs.HostVerificationDocumentName) {
    throw new Error("CloudFormation document outputs must be distinct");
  }
  if (outputs.CloudWatchAgentConfigParameterName !== "/needo/staging/cloudwatch-agent") {
    throw new Error("CloudFormation output CloudWatchAgentConfigParameterName is invalid");
  }
  if (outputs.BudgetName !== `${config.stackName}-monthly-cost`) {
    throw new Error("CloudFormation output BudgetName is invalid");
  }
  return Object.freeze(outputs);
}

export function requireAwsStagingResources(response, outputs, config, {
  allowedStatuses
} = {}) {
  noPagination(response, "CloudFormation list-stack-resources");
  const summaries = response.StackResourceSummaries;
  if (!Array.isArray(summaries)
    || summaries.length !== AWS_STAGING_EXPECTED_RESOURCES.length) {
    throw new Error("CloudFormation stack resource cardinality is not exact");
  }
  const expectedTypes = new Map(AWS_STAGING_EXPECTED_RESOURCES);
  const statuses = allowedStatuses ?? new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
  const resources = {};
  for (const summary of summaries) {
    const logicalId = nonEmptyString(summary?.LogicalResourceId, "Stack logical resource ID");
    if (Object.hasOwn(resources, logicalId)) throw new Error(`Stack resource ${logicalId} is duplicate`);
    const expectedType = expectedTypes.get(logicalId);
    if (!expectedType) throw new Error(`Unexpected stack resource ${logicalId}`);
    if (summary.ResourceType !== expectedType) throw new Error(`Stack resource ${logicalId} type does not match`);
    if (!statuses.has(summary.ResourceStatus)) throw new Error(`Stack resource ${logicalId} is not complete`);
    resources[logicalId] = Object.freeze({
      logicalId,
      resourceType: expectedType,
      physicalId: nonEmptyString(summary.PhysicalResourceId, `Stack resource ${logicalId} physical ID`)
    });
  }
  if (AWS_STAGING_EXPECTED_RESOURCES.some(([logicalId]) => !resources[logicalId])) {
    throw new Error("CloudFormation stack resource is missing");
  }
  const bindings = {
    Instance: outputs.InstanceId,
    ElasticIp: outputs.ElasticIp,
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
  for (const [logicalId, physicalId] of Object.entries(bindings)) {
    if (resources[logicalId].physicalId !== physicalId) {
      throw new Error(`Stack resource ${logicalId} identity does not match its output`);
    }
  }
  const topicPattern = new RegExp(
    `^arn:aws:sns:${escapeRegExp(config.region)}:${config.accountId}:[A-Za-z0-9_-]{1,256}$`
  );
  if (!topicPattern.test(resources.AlertTopic.physicalId)
    || !resources.AlertSubscription.physicalId.startsWith(`${resources.AlertTopic.physicalId}:`)) {
    throw new Error("Stack SNS resource account or region identity is invalid");
  }
  return Object.freeze(resources);
}

export function awsStagingResourceIdentitySha256(resources) {
  const canonical = Object.values(resources)
    .map(({ logicalId, resourceType, physicalId }) => ({ logicalId, resourceType, physicalId }))
    .sort((left, right) => left.logicalId.localeCompare(right.logicalId));
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}
