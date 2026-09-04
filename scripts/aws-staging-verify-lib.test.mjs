import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  verifyAwsStagingEnvironment as verifyAwsStagingEnvironmentImpl,
  writeAwsStagingAcceptanceEvidence
} from "./aws-staging-verify-lib.mjs";
import { runAwsStagingPreflight } from "./aws-staging-preflight-lib.mjs";
import {
  AWS_STAGING_CLOUDWATCH_AGENT_CONFIG,
  AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT
} from "./aws-staging-attestation.mjs";

const config = Object.freeze({
  accountId: "123456789012",
  alertEmail: "ops@example.com",
  budgetAmount: "20000",
  budgetUnit: "JPY",
  environment: "staging",
  hostname: "staging.needo.life",
  owner: "needo",
  profile: "needo-staging-deployer",
  region: "ap-northeast-1",
  stackName: "needo-staging-infrastructure",
  templatePath: "/repo/deploy/aws-staging/cloudformation.yml"
});
const runtimeSourceRevision = "0123456789abcdef0123456789abcdef01234567";
const runtimeManifestSha256 = "d".repeat(64);
const runtimeArtifact = Object.freeze({
  runtimeSourceRevision,
  runtimeManifestSha256,
  runtimeEntrypoint: "scripts/aws-staging-verify.mjs",
  assertCurrentState: vi.fn(async () => undefined)
});
const templateBody = "AWSTemplateFormatVersion: '2010-09-09'\nResources: {}\n";
const templateSha256 = createHash("sha256").update(templateBody, "utf8").digest("hex");
const templateArtifact = Object.freeze({
  body: templateBody,
  templateSha256,
  sourceRevision: runtimeSourceRevision,
  assertCurrentState: vi.fn(async () => undefined)
});
const expectedVerificationDocumentSha256 =
  "ccf0ceb4c22628f1ef7ddc698f36cf3074043804894f3540cd624119be51b0ae";
const expectedAgentParameterSha256 =
  "e5bbe5b2ce3d775a521c8c830260b65e2c1e0675f4ace0f68582e1257196cd98";

async function captureTrustedRootIdentity(root) {
  const stats = await fs.lstat(root);
  return Object.freeze({
    realPath: await fs.realpath(root),
    device: String(stats.dev),
    inode: String(stats.ino),
    owner: String(stats.uid),
    group: String(stats.gid),
    mode: stats.mode & 0o777
  });
}

function verifyAwsStagingEnvironment(input) {
  return verifyAwsStagingEnvironmentImpl({ runtimeArtifact, templateArtifact, ...input });
}

const requiredTags = Object.freeze({
  Project: "needo",
  Environment: "staging",
  Owner: "needo",
  ManagedBy: "cloudformation"
});
const tags = () => Object.entries(requiredTags).map(([Key, Value]) => ({ Key, Value }));

const ids = Object.freeze({
  stackId: `arn:aws:cloudformation:${config.region}:${config.accountId}:stack/${config.stackName}/12345678-1234-1234-1234-1234567890ab`,
  vpc: "vpc-0123456789abcdef0",
  internetGateway: "igw-0123456789abcdef0",
  subnet: "subnet-0123456789abcdef0",
  routeTable: "rtb-0123456789abcdef0",
  routeAssociation: "rtbassoc-0123456789abcdef0",
  securityGroup: "sg-0123456789abcdef0",
  instance: "i-0123456789abcdef0",
  elasticAllocation: "eipalloc-0123456789abcdef0",
  elasticAssociation: "eipassoc-0123456789abcdef0",
  rootVolume: "vol-0aaaaaaaaaaaaaaaa",
  dataVolume: "vol-0123456789abcdef0",
  elasticIp: "203.0.113.10",
  releaseBucket: "needo-release-example",
  backupBucket: "needo-backup-example",
  secretArn: `arn:aws:secretsmanager:${config.region}:${config.accountId}:secret:/needo/staging/application-AbCdEf`,
  systemLogArn: `arn:aws:logs:${config.region}:${config.accountId}:log-group:/needo/staging/system`,
  dockerLogArn: `arn:aws:logs:${config.region}:${config.accountId}:log-group:/needo/staging/docker`,
  roleName: "needo-staging-instance-role",
  roleArn: `arn:aws:iam::${config.accountId}:role/needo-staging-instance-role`,
  instanceProfileName: "needo-staging-instance-profile",
  instanceProfileArn: `arn:aws:iam::${config.accountId}:instance-profile/needo-staging-instance-profile`,
  networkInterface: "eni-0123456789abcdef0",
  topicArn: `arn:aws:sns:${config.region}:${config.accountId}:needo-staging-alerts`,
  subscriptionArn: `arn:aws:sns:${config.region}:${config.accountId}:needo-staging-alerts:12345678-1234-1234-1234-1234567890ab`,
  agentParameter: "/needo/staging/cloudwatch-agent",
  bootstrapDocument: "needo-staging-host-bootstrap",
  verificationDocument: "needo-staging-host-verification",
  budgetName: "needo-staging-infrastructure-monthly-cost",
  commandId: "12345678-1234-4abc-8def-1234567890ab",
  imageId: "ami-0123456789abcdef0"
});

const alarmDefinitions = Object.freeze([
  ["needo-staging-status", "AWS/EC2", "StatusCheckFailed", "Maximum", 1, "missing", [{ Name: "InstanceId", Value: ids.instance }]],
  ["needo-staging-memory", "Needo/Staging", "mem_used_percent", "Average", 85, "breaching", [{ Name: "InstanceId", Value: ids.instance }]],
  ["needo-staging-root-disk", "Needo/Staging", "disk_used_percent", "Average", 80, "breaching", [
    { Name: "InstanceId", Value: ids.instance }, { Name: "path", Value: "/" }, { Name: "fstype", Value: "xfs" }
  ]],
  ["needo-staging-data-disk", "Needo/Staging", "disk_used_percent", "Average", 80, "breaching", [
    { Name: "InstanceId", Value: ids.instance }, { Name: "path", Value: "/srv/needo" }, { Name: "fstype", Value: "xfs" }
  ]]
]);

const alarmArn = (name) => `arn:aws:cloudwatch:${config.region}:${config.accountId}:alarm:${name}`;
const budgetArn = `arn:aws:budgets::${config.accountId}:budget/${ids.budgetName}`;
const parameterArn = `arn:aws:ssm:${config.region}:${config.accountId}:parameter${ids.agentParameter}`;
const documentArn = (name) => `arn:aws:ssm:${config.region}:${config.accountId}:document/${name}`;
const ec2Arn = (type, id) => `arn:aws:ec2:${config.region}:${config.accountId}:${type}/${id}`;

const outputs = Object.freeze({
  InstanceId: ids.instance,
  ElasticIp: ids.elasticIp,
  DataVolumeId: ids.dataVolume,
  ReleaseBucketName: ids.releaseBucket,
  BackupBucketName: ids.backupBucket,
  ApplicationSecretArn: ids.secretArn,
  HostBootstrapDocumentName: ids.bootstrapDocument,
  HostVerificationDocumentName: ids.verificationDocument,
  CloudWatchAgentConfigParameterName: ids.agentParameter,
  BudgetName: ids.budgetName
});

const resources = Object.freeze([
  ["Vpc", "AWS::EC2::VPC", ids.vpc],
  ["InternetGateway", "AWS::EC2::InternetGateway", ids.internetGateway],
  ["InternetGatewayAttachment", "AWS::EC2::VPCGatewayAttachment", `${ids.vpc}|${ids.internetGateway}`],
  ["PublicSubnet", "AWS::EC2::Subnet", ids.subnet],
  ["PublicRouteTable", "AWS::EC2::RouteTable", ids.routeTable],
  ["DefaultPublicRoute", "AWS::EC2::Route", `${ids.routeTable}|0.0.0.0/0`],
  ["PublicSubnetRouteTableAssociation", "AWS::EC2::SubnetRouteTableAssociation", ids.routeAssociation],
  ["WebSecurityGroup", "AWS::EC2::SecurityGroup", ids.securityGroup],
  ["ReleaseBucket", "AWS::S3::Bucket", ids.releaseBucket],
  ["ReleaseBucketPolicy", "AWS::S3::BucketPolicy", ids.releaseBucket],
  ["BackupBucket", "AWS::S3::Bucket", ids.backupBucket],
  ["BackupBucketPolicy", "AWS::S3::BucketPolicy", ids.backupBucket],
  ["ApplicationSecret", "AWS::SecretsManager::Secret", ids.secretArn],
  ["SystemLogGroup", "AWS::Logs::LogGroup", "/needo/staging/system"],
  ["DockerLogGroup", "AWS::Logs::LogGroup", "/needo/staging/docker"],
  ["InstanceRole", "AWS::IAM::Role", ids.roleName],
  ["InstanceProfile", "AWS::IAM::InstanceProfile", ids.instanceProfileName],
  ["Instance", "AWS::EC2::Instance", ids.instance],
  ["ElasticIp", "AWS::EC2::EIP", ids.elasticAllocation],
  ["ElasticIpAssociation", "AWS::EC2::EIPAssociation", ids.elasticAssociation],
  ["DataVolume", "AWS::EC2::Volume", ids.dataVolume],
  ["DataVolumeAttachment", "AWS::EC2::VolumeAttachment", `${ids.instance}|${ids.dataVolume}`],
  ["AlertTopic", "AWS::SNS::Topic", ids.topicArn],
  ["AlertSubscription", "AWS::SNS::Subscription", ids.subscriptionArn],
  ["CloudWatchAgentConfigParameter", "AWS::SSM::Parameter", ids.agentParameter],
  ["StatusCheckFailedAlarm", "AWS::CloudWatch::Alarm", alarmDefinitions[0][0]],
  ["HighMemoryAlarm", "AWS::CloudWatch::Alarm", alarmDefinitions[1][0]],
  ["RootDiskHighAlarm", "AWS::CloudWatch::Alarm", alarmDefinitions[2][0]],
  ["DataDiskHighAlarm", "AWS::CloudWatch::Alarm", alarmDefinitions[3][0]],
  ["MonthlyBudget", "AWS::Budgets::Budget", ids.budgetName],
  ["HostBootstrapDocument", "AWS::SSM::Document", ids.bootstrapDocument],
  ["HostVerificationDocument", "AWS::SSM::Document", ids.verificationDocument]
]);

const taggableLogicalIds = Object.freeze([
  "Vpc", "InternetGateway", "PublicSubnet", "PublicRouteTable", "WebSecurityGroup",
  "ReleaseBucket", "BackupBucket", "ApplicationSecret", "SystemLogGroup", "DockerLogGroup",
  "InstanceRole", "Instance", "ElasticIp", "DataVolume", "AlertTopic",
  "CloudWatchAgentConfigParameter", "StatusCheckFailedAlarm", "HighMemoryAlarm",
  "RootDiskHighAlarm", "DataDiskHighAlarm", "MonthlyBudget",
  "HostBootstrapDocument", "HostVerificationDocument", "InstanceRootVolume"
]);

const rgArns = Object.freeze([
  ec2Arn("vpc", ids.vpc),
  ec2Arn("internet-gateway", ids.internetGateway),
  ec2Arn("subnet", ids.subnet),
  ec2Arn("route-table", ids.routeTable),
  ec2Arn("security-group", ids.securityGroup),
  ec2Arn("instance", ids.instance),
  ec2Arn("elastic-ip", ids.elasticAllocation),
  ec2Arn("volume", ids.dataVolume),
  ec2Arn("volume", ids.rootVolume),
  `arn:aws:s3:::${ids.releaseBucket}`,
  `arn:aws:s3:::${ids.backupBucket}`,
  ids.secretArn,
  ids.systemLogArn,
  ids.dockerLogArn,
  ids.topicArn,
  ...alarmDefinitions.map(([name]) => alarmArn(name))
]);

const notificationDefinitions = Object.freeze([
  ["ACTUAL", 75], ["FORECASTED", 90], ["ACTUAL", 90],
  ["FORECASTED", 100], ["ACTUAL", 100]
]);

function stackResponse() {
  return {
    Stacks: [{
      StackId: ids.stackId,
      StackName: config.stackName,
      StackStatus: "CREATE_COMPLETE",
      Tags: tags(),
      Outputs: Object.entries(outputs).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
    }]
  };
}

function listStackResourcesResponse() {
  return {
    StackResourceSummaries: resources.map(([LogicalResourceId, ResourceType, PhysicalResourceId]) => ({
      LogicalResourceId,
      ResourceType,
      PhysicalResourceId,
      ResourceStatus: "CREATE_COMPLETE"
    }))
  };
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

function policySha256(name) {
  return createHash("sha256")
    .update(JSON.stringify(expectedBucketTlsPolicy(name)), "utf8")
    .digest("hex");
}

function bucketFixture(kind) {
  const isBackup = kind === "backup";
  const name = isBackup ? ids.backupBucket : ids.releaseBucket;
  return {
    publicAccess: {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      }
    },
    encryption: {
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }]
      }
    },
    versioning: { Status: "Enabled" },
    lifecycle: {
      Rules: isBackup ? [
        {
          ID: "DailyBackups30Days", Status: "Enabled", Prefix: "staging/daily/",
          Expiration: { Days: 30 }, NoncurrentVersionExpiration: { NoncurrentDays: 30 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 }
        },
        {
          ID: "PreMigrationRecovery90Days", Status: "Enabled", Prefix: "staging/pre-migration/",
          Expiration: { Days: 90 }, NoncurrentVersionExpiration: { NoncurrentDays: 90 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 }
        }
      ] : [{
        ID: "AbortIncompleteMultipartUploads", Status: "Enabled",
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 }
      }]
    },
    tagging: { TagSet: tags() },
    policy: { Policy: JSON.stringify(expectedBucketTlsPolicy(name)) }
  };
}

function passingFixture() {
  const alarmObjects = alarmDefinitions.map(([
    AlarmName, Namespace, MetricName, Statistic, Threshold, TreatMissingData, Dimensions
  ]) => ({
    AlarmName,
    AlarmArn: alarmArn(AlarmName),
    Namespace,
    MetricName,
    Statistic,
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    Threshold,
    EvaluationPeriods: 2,
    DatapointsToAlarm: 2,
    Period: 300,
    TreatMissingData,
    Dimensions: structuredClone(Dimensions),
    ActionsEnabled: true,
    AlarmActions: [ids.topicArn]
  }));
  const ec2TaggedIds = [
    ids.vpc, ids.internetGateway, ids.subnet, ids.routeTable, ids.securityGroup,
    ids.instance, ids.elasticAllocation, ids.rootVolume, ids.dataVolume
  ];
  return {
    stack: stackResponse(),
    stackResources: listStackResourcesResponse(),
    instance: {
      Reservations: [{ Instances: [{
        InstanceId: ids.instance,
        InstanceType: "t4g.small",
        ImageId: ids.imageId,
        Architecture: "arm64",
        State: { Name: "running" },
        RootDeviceName: "/dev/xvda",
        KeyName: undefined,
        Monitoring: { State: "enabled" },
        MetadataOptions: { HttpTokens: "required", HttpEndpoint: "enabled", HttpPutResponseHopLimit: 1 },
        VpcId: ids.vpc,
        SubnetId: ids.subnet,
        IamInstanceProfile: { Arn: ids.instanceProfileArn, Id: "AIPATESTINSTANCEPROFILE" },
        PublicIpAddress: ids.elasticIp,
        SecurityGroups: [{ GroupId: ids.securityGroup, GroupName: "needo-staging-web" }],
        NetworkInterfaces: [{
          NetworkInterfaceId: ids.networkInterface,
          VpcId: ids.vpc,
          SubnetId: ids.subnet,
          Groups: [{ GroupId: ids.securityGroup, GroupName: "needo-staging-web" }],
          Attachment: { AttachmentId: "eni-attach-0123456789abcdef0", DeviceIndex: 0, Status: "attached" },
          Association: { IpOwnerId: config.accountId, PublicIp: ids.elasticIp }
        }],
        BlockDeviceMappings: [
          { DeviceName: "/dev/xvda", Ebs: { VolumeId: ids.rootVolume, DeleteOnTermination: true } },
          { DeviceName: "/dev/sdf", Ebs: { VolumeId: ids.dataVolume, DeleteOnTermination: false } }
        ],
        Tags: tags()
      }] }]
    },
    address: {
      Addresses: [{
        AllocationId: ids.elasticAllocation,
        AssociationId: ids.elasticAssociation,
        Domain: "vpc",
        InstanceId: ids.instance,
        NetworkInterfaceId: ids.networkInterface,
        PublicIp: ids.elasticIp
      }]
    },
    image: { Images: [{ ImageId: ids.imageId, Architecture: "arm64", State: "available", OwnerId: "137112412989" }] },
    securityGroup: {
      SecurityGroups: [{
        GroupId: ids.securityGroup,
        VpcId: ids.vpc,
        IpPermissions: [
          { IpProtocol: "tcp", FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: "0.0.0.0/0" }], Ipv6Ranges: [], PrefixListIds: [], UserIdGroupPairs: [] },
          { IpProtocol: "tcp", FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: "0.0.0.0/0" }], Ipv6Ranges: [], PrefixListIds: [], UserIdGroupPairs: [] }
        ]
      }]
    },
    volumes: {
      Volumes: [
        { VolumeId: ids.rootVolume, Size: 30, VolumeType: "gp3", Encrypted: true, State: "in-use", Attachments: [{ InstanceId: ids.instance, Device: "/dev/xvda", State: "attached", DeleteOnTermination: true }], Tags: tags() },
        { VolumeId: ids.dataVolume, Size: 70, VolumeType: "gp3", Encrypted: true, State: "in-use", Attachments: [{ InstanceId: ids.instance, Device: "/dev/sdf", State: "attached", DeleteOnTermination: false }], Tags: tags() }
      ]
    },
    ec2Tags: { Tags: ec2TaggedIds.flatMap((ResourceId) => tags().map(({ Key, Value }) => ({ ResourceId, Key, Value }))) },
    ssmInstance: { InstanceInformationList: [{ InstanceId: ids.instance, PingStatus: "Online" }] },
    verificationDocument: {
      Name: ids.verificationDocument,
      DocumentVersion: "9",
      Status: "Active",
      Content: JSON.stringify(AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT),
      DocumentType: "Command",
      DocumentFormat: "JSON"
    },
    agentParameter: {
      Parameter: {
        Name: ids.agentParameter,
        Type: "String",
        Value: JSON.stringify(AWS_STAGING_CLOUDWATCH_AGENT_CONFIG),
        Version: 11,
        ARN: parameterArn,
        DataType: "text"
      }
    },
    ssmTags: Object.fromEntries([
      ids.agentParameter, ids.bootstrapDocument, ids.verificationDocument
    ].map((name) => [name, { TagList: tags() }])),
    releaseBucket: bucketFixture("release"),
    backupBucket: bucketFixture("backup"),
    iamTags: { Tags: tags(), IsTruncated: false },
    secret: { ARN: ids.secretArn, Name: "/needo/staging/application", Tags: tags() },
    secretVersions: { Versions: [] },
    logGroups: {
      logGroups: [
        { logGroupName: "/needo/staging/system", logGroupArn: ids.systemLogArn, retentionInDays: 30 },
        { logGroupName: "/needo/staging/docker", logGroupArn: ids.dockerLogArn, retentionInDays: 30 }
      ]
    },
    logTags: {
      [ids.systemLogArn]: { tags: { ...requiredTags } },
      [ids.dockerLogArn]: { tags: { ...requiredTags } }
    },
    alarms: { MetricAlarms: alarmObjects, CompositeAlarms: [] },
    alarmTags: Object.fromEntries(alarmObjects.map((alarm) => [alarm.AlarmArn, { Tags: tags() }])),
    topicTags: { Tags: tags() },
    topicSubscriptions: {
      Subscriptions: [{
        SubscriptionArn: ids.subscriptionArn,
        Owner: config.accountId,
        Protocol: "email",
        Endpoint: config.alertEmail,
        TopicArn: ids.topicArn
      }]
    },
    budget: {
      Budget: {
        BudgetName: ids.budgetName,
        BudgetLimit: { Amount: config.budgetAmount, Unit: config.budgetUnit },
        TimeUnit: "MONTHLY",
        BudgetType: "COST"
      }
    },
    notifications: {
      Notifications: notificationDefinitions.map(([NotificationType, Threshold]) => ({
        NotificationType,
        ComparisonOperator: "GREATER_THAN",
        Threshold,
        ThresholdType: "PERCENTAGE"
      }))
    },
    subscribers: { Subscribers: [{ SubscriptionType: "EMAIL", Address: config.alertEmail }] },
    budgetTags: { ResourceTags: tags() },
    resourceGroups: {
      ResourceTagMappingList: rgArns.map((ResourceARN) => ({ ResourceARN, Tags: tags() })),
      PaginationToken: ""
    },
    sendCommand: { Command: { CommandId: ids.commandId } },
    invocation: {
      CommandId: ids.commandId,
      InstanceId: ids.instance,
      DocumentName: ids.verificationDocument,
      Status: "Success",
      ResponseCode: 0,
      StandardOutputContent: "{\"mount\":true,\"filesystem\":\"xfs\",\"directories\":true,\"services\":true,\"runningContainers\":0,\"activeRelease\":false}\n",
      StandardErrorContent: ""
    }
  };
}

function fixtureForRegion(region) {
  return JSON.parse(
    JSON.stringify(passingFixture()).replaceAll(config.region, region)
  );
}

function argument(args, flag) {
  return args[args.indexOf(flag) + 1];
}

function createAws(fixture, trace = []) {
  return {
    text: vi.fn(async (args) => {
      trace.push(`text:${args.join(" ")}`);
      if (args[0] === "ssm" && args[1] === "wait") return "";
      throw new Error(`Unexpected AWS text call: ${args.join(" ")}`);
    }),
    json: vi.fn(async (args) => {
      trace.push(`json:${args.join(" ")}`);
      const operation = `${args[0]} ${args[1]}`;
      switch (operation) {
        case "cloudformation describe-stacks": return fixture.stack;
        case "cloudformation list-stack-resources": return fixture.stackResources;
        case "ec2 describe-instances": return fixture.instance;
        case "ec2 describe-addresses": return fixture.address;
        case "ec2 describe-images": return fixture.image;
        case "ec2 describe-security-groups": return fixture.securityGroup;
        case "ec2 describe-volumes": return fixture.volumes;
        case "ec2 describe-tags": return fixture.ec2Tags;
        case "ssm describe-instance-information": return fixture.ssmInstance;
        case "ssm get-document": return fixture.verificationDocument;
        case "ssm get-parameter": return fixture.agentParameter;
        case "ssm list-tags-for-resource": return fixture.ssmTags[argument(args, "--resource-id")];
        case "s3api get-public-access-block": return fixture[argument(args, "--bucket") === ids.releaseBucket ? "releaseBucket" : "backupBucket"].publicAccess;
        case "s3api get-bucket-encryption": return fixture[argument(args, "--bucket") === ids.releaseBucket ? "releaseBucket" : "backupBucket"].encryption;
        case "s3api get-bucket-versioning": return fixture[argument(args, "--bucket") === ids.releaseBucket ? "releaseBucket" : "backupBucket"].versioning;
        case "s3api get-bucket-lifecycle-configuration": return fixture[argument(args, "--bucket") === ids.releaseBucket ? "releaseBucket" : "backupBucket"].lifecycle;
        case "s3api get-bucket-tagging": return fixture[argument(args, "--bucket") === ids.releaseBucket ? "releaseBucket" : "backupBucket"].tagging;
        case "s3api get-bucket-policy": return fixture[argument(args, "--bucket") === ids.releaseBucket ? "releaseBucket" : "backupBucket"].policy;
        case "iam list-role-tags": return fixture.iamTags;
        case "secretsmanager describe-secret": return fixture.secret;
        case "secretsmanager list-secret-version-ids": return fixture.secretVersions;
        case "logs describe-log-groups": return fixture.logGroups;
        case "logs list-tags-for-resource": return fixture.logTags[argument(args, "--resource-arn")];
        case "cloudwatch describe-alarms": return fixture.alarms;
        case "cloudwatch list-tags-for-resource": return fixture.alarmTags[argument(args, "--resource-arn")];
        case "sns list-tags-for-resource": return fixture.topicTags;
        case "sns list-subscriptions-by-topic": return fixture.topicSubscriptions;
        case "budgets describe-budget": return fixture.budget;
        case "budgets describe-notifications-for-budget": return fixture.notifications;
        case "budgets describe-subscribers-for-notification": return fixture.subscribers;
        case "budgets list-tags-for-resource": return fixture.budgetTags;
        case "resourcegroupstaggingapi get-resources": return fixture.resourceGroups;
        case "ssm send-command": return fixture.sendCommand;
        case "ssm get-command-invocation": return fixture.invocation;
        default: throw new Error(`Unexpected AWS JSON call: ${args.join(" ")}`);
      }
    })
  };
}

function createPreflight(resolveDns, trace = [], overrides = {}, expectedConfig = config) {
  return vi.fn(async (input) => {
    trace.push("preflight");
    expect(input.aws).toBeDefined();
    expect(input.config).toBe(expectedConfig);
    expect(input.resolveDns).toBe(resolveDns);
    const dnsA = Object.freeze([...(await resolveDns(expectedConfig.hostname))].sort());
    return Object.freeze({
      accountId: expectedConfig.accountId,
      callerArn: `arn:aws:sts::${expectedConfig.accountId}:assumed-role/NeedoDeployer/session`,
      callerKind: "assumed-role",
      region: expectedConfig.region,
      hostname: expectedConfig.hostname,
      amiId: ids.imageId,
      amiArchitecture: "arm64",
      templateSha256,
      sourceRevision: runtimeSourceRevision,
      templateValidation: "VALID",
      runtimeSourceRevision,
      runtimeManifestSha256,
      runtimeEntrypoint: "scripts/aws-staging-verify.mjs",
      stackState: "CREATE_COMPLETE",
      dnsA,
      ...overrides
    });
  });
}

async function verify({ fixture = passingFixture(), resolvedConfig = config, preflightOverrides = {}, now } = {}) {
  const trace = [];
  const aws = createAws(fixture, trace);
  const dnsResults = [["203.0.113.2"], ["203.0.113.2"]];
  const resolveDns = vi.fn(async (hostname) => {
    trace.push(`dns:${hostname}`);
    return dnsResults.shift();
  });
  const runPreflight = createPreflight(resolveDns, trace, preflightOverrides);
  const evidence = await verifyAwsStagingEnvironment({
    aws,
    config: resolvedConfig,
    resolveDns,
    runPreflight,
    runtimeArtifact,
    now: now ?? (() => Date.parse("2026-09-03T04:05:06.000Z"))
  });
  return { evidence, aws, resolveDns, runPreflight, trace };
}

describe("AWS Staging environment-only acceptance", () => {
  it("wires the same immutable template artifact into the real preflight", async () => {
    let describeStackCalls = 0;
    const fixture = passingFixture();
    const aws = {
      text: vi.fn(async (args) => {
        if (args.join(" ") !== "configure list") {
          throw new Error(`Unexpected AWS text call: ${args.join(" ")}`);
        }
        return [
          "access_key                ****************ABCD      login",
          "secret_key                ****************EFGH      login"
        ].join("\n");
      }),
      json: vi.fn(async (args) => {
        const operation = args.slice(0, 2).join(" ");
        if (operation === "sts get-caller-identity") {
          return {
            Account: config.accountId,
            Arn: `arn:aws:sts::${config.accountId}:assumed-role/NeedoDeployer/session`
          };
        }
        if (operation === "ssm get-parameter") {
          return { Parameter: { Value: ids.imageId } };
        }
        if (operation === "ec2 describe-images") return fixture.image;
        if (operation === "cloudformation validate-template") return {};
        if (operation === "cloudformation describe-stacks") {
          describeStackCalls += 1;
          if (describeStackCalls === 1) return fixture.stack;
          throw new Error("post-preflight verify sentinel");
        }
        throw new Error(`Unexpected AWS JSON call: ${args.join(" ")}`);
      })
    };
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);

    await expect(verifyAwsStagingEnvironmentImpl({
      aws,
      config,
      resolveDns,
      runPreflight: runAwsStagingPreflight,
      runtimeArtifact,
      templateArtifact,
      now: () => 0
    })).rejects.toThrow("post-preflight verify sentinel");
    expect(aws.json).toHaveBeenCalledWith([
      "cloudformation", "validate-template", "--template-body", templateBody
    ]);
    expect(aws.json.mock.calls.some(([args]) => args[1] === "send-command")).toBe(false);
  });

  it("re-attests runtime identity immediately before the SSM verification mutation", async () => {
    const trace = [];
    const aws = createAws(passingFixture(), trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    const driftedRuntime = Object.freeze({
      ...runtimeArtifact,
      assertCurrentState: vi.fn(async () => {
        throw new Error("AWS Staging runtime identity changed after approval");
      })
    });

    await expect(verifyAwsStagingEnvironment({
      aws,
      config,
      resolveDns,
      runPreflight: createPreflight(resolveDns),
      runtimeArtifact: driftedRuntime,
      now: () => Date.parse("2026-09-03T04:05:06.000Z")
    })).rejects.toThrow(/runtime identity changed/i);
    expect(trace.some((line) => line.includes("ssm get-document"))).toBe(true);
    expect(trace.some((line) => line.includes("ssm send-command"))).toBe(false);
  });

  it("requires the shared exact StackId UUID contract before resource or SSM reads", async () => {
    const fixture = passingFixture();
    fixture.stack.Stacks[0].StackId = [
      `arn:aws:cloudformation:${config.region}:${config.accountId}:stack/${config.stackName}`,
      "-".repeat(36)
    ].join("/");
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);

    await expect(verifyAwsStagingEnvironment({
      aws,
      config,
      resolveDns,
      runPreflight: createPreflight(resolveDns, trace),
      now: () => 0
    })).rejects.toThrow(/StackId|stack ID.*invalid/i);
    expect(aws.json.mock.calls.some(([args]) => args[1] === "list-stack-resources")).toBe(false);
    expect(aws.json.mock.calls.some(([args]) => args[0] === "ssm")).toBe(false);
  });

  it("captures StackId once and uses that immutable value for every later CloudFormation field", async () => {
    const fixture = passingFixture();
    const capturedStackId = fixture.stack.Stacks[0].StackId;
    const replacementStackId = capturedStackId.replace(
      "00000000-0000-4000-8000-000000000000",
      "11111111-1111-4111-8111-111111111111"
    );
    const trace = [];
    const baseAws = createAws(fixture, trace);
    const baseJson = baseAws.json;
    baseAws.json = vi.fn(async (args) => {
      if (args[0] === "cloudformation" && args[1] === "list-stack-resources") {
        fixture.stack.Stacks[0].StackId = replacementStackId;
      }
      return baseJson(args);
    });
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);

    const evidence = await verifyAwsStagingEnvironment({
      aws: baseAws,
      config,
      resolveDns,
      runPreflight: createPreflight(resolveDns, trace),
      now: () => 0
    });

    expect(baseAws.json.mock.calls.filter(([args]) => args[0] === "cloudformation"))
      .toEqual([
        [["cloudformation", "describe-stacks", "--stack-name", config.stackName]],
        [["cloudformation", "list-stack-resources", "--stack-name", capturedStackId]]
      ]);
    expect(evidence.stack.id).toBe(capturedStackId);
  });

  it("rejects a same-name stack replacement before any SSM operation", async () => {
    const fixture = passingFixture();
    const swappedResources = structuredClone(fixture.stackResources);
    swappedResources.StackResourceSummaries[0].ResourceStatus = "DELETE_COMPLETE";
    const trace = [];
    const baseAws = createAws(fixture, trace);
    const baseJson = baseAws.json;
    baseAws.json = vi.fn(async (args) => {
      if (args[0] === "cloudformation" && args[1] === "list-stack-resources") {
        return argument(args, "--stack-name") === ids.stackId
          ? swappedResources
          : fixture.stackResources;
      }
      return baseJson(args);
    });
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);

    await expect(verifyAwsStagingEnvironment({
      aws: baseAws,
      config,
      resolveDns,
      runPreflight: createPreflight(resolveDns, trace),
      now: () => 0
    })).rejects.toThrow(/stack resource.*complete/i);
    expect(baseAws.json.mock.calls.some(([args]) => args[0] === "ssm")).toBe(false);
  });

  it("accepts the complete fixture and returns only frozen allowlisted evidence", async () => {
    const fixture = passingFixture();
    fixture.invocation.InternalRawMarker = "must-never-enter-evidence";
    const { evidence, aws, trace } = await verify({ fixture });

    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.stack)).toBe(true);
    expect(Object.isFrozen(evidence.tagCoverage.resources)).toBe(true);
    expect(Reflect.ownKeys(evidence)).toEqual([
      "timestamp", "accountId", "region", "hostname", "runtimeSourceRevision",
      "runtimeManifestSha256", "runtimeEntrypoint", "stack", "resourceIds", "elasticIp",
      "tagCoverage", "ec2", "ingress", "volumes", "ssm", "host", "buckets",
      "secretVersionCount", "monitoring", "budget", "dns", "applicationDeployed",
      "migrationRun", "seedRun", "dnsModified", "businessDataMutation", "waivedBaselineFailures"
    ]);
    expect(evidence).toMatchObject({
      timestamp: "2026-09-03T04:05:06.000Z",
      accountId: config.accountId,
      region: config.region,
      hostname: config.hostname,
      stack: { id: ids.stackId, name: config.stackName, status: "CREATE_COMPLETE" },
      resourceIds: {
        instanceId: ids.instance,
        rootVolumeId: ids.rootVolume,
        dataVolumeId: ids.dataVolume,
        securityGroupId: ids.securityGroup,
        vpcId: ids.vpc,
        subnetId: ids.subnet,
        elasticIpAllocationId: ids.elasticAllocation,
        releaseBucketName: ids.releaseBucket,
        backupBucketName: ids.backupBucket,
        applicationSecretArn: "REDACTED",
        hostVerificationDocumentName: ids.verificationDocument,
        cloudWatchAgentParameterName: ids.agentParameter,
        budgetName: ids.budgetName
      },
      elasticIp: ids.elasticIp,
      ec2: {
        instanceType: "t4g.small", architecture: "arm64", imageId: ids.imageId,
        keyNamePresent: false, imdsV2Required: true, detailedMonitoring: true
      },
      ingress: [
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrIpv4: "0.0.0.0/0" },
        { protocol: "tcp", fromPort: 443, toPort: 443, cidrIpv4: "0.0.0.0/0" }
      ],
      ssm: {
        online: true,
        documentVersion: "9",
        documentSha256: expectedVerificationDocumentSha256,
        commandId: ids.commandId,
        commandStatus: "Success",
        responseCode: 0
      },
      host: { mount: true, filesystem: "xfs", directories: true, services: true, runningContainers: 0, activeRelease: false },
      secretVersionCount: 0,
      monitoring: {
        agentParameterSha256: expectedAgentParameterSha256,
        snsSubscriptionConfirmed: true
      },
      dns: { preflightA: ["203.0.113.2"], postVerificationA: ["203.0.113.2"] },
      applicationDeployed: false,
      migrationRun: false,
      seedRun: false,
      dnsModified: false,
      businessDataMutation: false
    });
    expect(evidence.tagCoverage.resources.map(({ logicalId }) => logicalId)).toEqual([...taggableLogicalIds].sort());
    expect(evidence.waivedBaselineFailures).toEqual([
      "ProfileDetailPage routing behavior > keeps /profiles/technician/17 on the social profile without loading the explicit card API",
      "ProfileDetailPage routing behavior > keeps /profiles/technician/17?view=social on the social profile without loading the explicit card API",
      "shop membership card adjustment API > strictly rejects client scope and creates a safe pending request > remainingSeconds assertion"
    ]);
    expect(evidence.budget.maskedSubscriber).toBe("o***@example.com");
    expect(evidence.monitoring.alarms).toHaveLength(4);
    expect(evidence.monitoring.alarms.every((alarm) => alarm.actionsEnabled === true)).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain(config.alertEmail);
    expect(JSON.stringify(evidence)).not.toContain(ids.secretArn);
    expect(JSON.stringify(evidence)).not.toContain("must-never-enter-evidence");

    const sendCalls = aws.json.mock.calls.filter(([args]) => args[0] === "ssm" && args[1] === "send-command");
    expect(sendCalls).toEqual([[([
      "ssm", "send-command",
      "--document-name", ids.verificationDocument,
      "--document-version", "9",
      "--instance-ids", ids.instance,
      "--comment", "NeeDo Staging environment-only acceptance verification"
    ])]]);
    expect(sendCalls[0][0]).not.toContain("--parameters");
    expect(aws.text.mock.calls).toEqual([[([
      "ssm", "wait", "command-executed", "--command-id", ids.commandId,
      "--instance-id", ids.instance
    ])]]);
    expect(aws.json.mock.calls.find(([args]) => (
      args[0] === "ssm" && args[1] === "get-command-invocation"
    ))).toEqual([[
      "ssm", "get-command-invocation", "--command-id", ids.commandId,
      "--instance-id", ids.instance
    ]]);
    expect(trace[0]).toBe("preflight");
    expect(trace[1]).toBe(`dns:${config.hostname}`);
    expect(trace.at(-1)).toBe(`dns:${config.hostname}`);
  });

  it("rejects verification document content drift before SSM command execution", async () => {
    const fixture = passingFixture();
    fixture.verificationDocument.Content = JSON.stringify({
      ...AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT,
      description: "foreign verification document"
    });
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);

    await expect(verifyAwsStagingEnvironment({
      aws,
      config,
      resolveDns,
      runPreflight: createPreflight(resolveDns, trace),
      now: () => 0
    })).rejects.toThrow(/document.*content|drift/i);

    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it("rejects CloudWatch Agent parameter content or version drift before SSM command execution", async () => {
    for (const mutate of [
      (fixture) => { fixture.agentParameter.Parameter.Value = JSON.stringify({ unexpected: true }); },
      (fixture) => { fixture.agentParameter.Parameter.Version = 0; }
    ]) {
      const fixture = passingFixture();
      mutate(fixture);
      const trace = [];
      const aws = createAws(fixture, trace);
      const resolveDns = vi.fn(async () => ["203.0.113.2"]);

      await expect(verifyAwsStagingEnvironment({
        aws,
        config,
        resolveDns,
        runPreflight: createPreflight(resolveDns, trace),
        now: () => 0
      })).rejects.toThrow(/parameter.*(?:content|version)|drift/i);

      expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
    }
  });

  it("accepts Sydney only when every regional ARN matches Sydney", async () => {
    const sydneyConfig = Object.freeze({ ...config, region: "ap-southeast-2" });
    const fixture = fixtureForRegion(sydneyConfig.region);
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);

    const evidence = await verifyAwsStagingEnvironment({
      aws,
      config: sydneyConfig,
      resolveDns,
      runPreflight: createPreflight(
        resolveDns,
        trace,
        { region: sydneyConfig.region },
        sydneyConfig
      ),
      now: () => 0
    });

    expect(evidence.region).toBe("ap-southeast-2");
    expect(evidence.stack.id).toContain(":ap-southeast-2:");
    expect(evidence.monitoring.logGroups.every(
      ({ arn }) => arn.includes(":ap-southeast-2:")
    )).toBe(true);
  });

  it("rejects a Tokyo log ARN during a Sydney run", async () => {
    const sydneyConfig = Object.freeze({ ...config, region: "ap-southeast-2" });
    const fixture = fixtureForRegion(sydneyConfig.region);
    fixture.logGroups.logGroups[0].logGroupArn =
      "arn:aws:logs:ap-northeast-1:123456789012:log-group:/needo/staging/system";
    const trace = [];
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);

    await expect(verifyAwsStagingEnvironment({
      aws: createAws(fixture, trace),
      config: sydneyConfig,
      resolveDns,
      runPreflight: createPreflight(
        resolveDns,
        trace,
        { region: sydneyConfig.region },
        sydneyConfig
      ),
      now: () => 0
    })).rejects.toThrow(/log group|ARN/i);
  });

  it.each([
    ["equivalent trailing decimal zeros", "20000.00", true],
    ["a genuinely different amount", "20000.01", false]
  ])("compares %s without floating-point coercion", async (_label, amount, accepted) => {
    const fixture = passingFixture();
    fixture.budget.Budget.BudgetLimit.Amount = amount;

    if (accepted) {
      await expect(verify({ fixture })).resolves.toMatchObject({
        evidence: { budget: { amount: config.budgetAmount } }
      });
    } else {
      await expect(verify({ fixture })).rejects.toThrow(/budget.*amount/i);
    }
  });

  const matrix = [
    ["unstable stack", (f) => { f.stack.Stacks[0].StackStatus = "UPDATE_FAILED"; }, /stack.*status|stable/i],
    ["missing stack tag", (f) => { f.stack.Stacks[0].Tags.pop(); }, /tag/i],
    ["wrong instance type", (f) => { f.instance.Reservations[0].Instances[0].InstanceType = "t3.large"; }, /t4g.small/i],
    ["wrong architecture", (f) => { f.instance.Reservations[0].Instances[0].Architecture = "x86_64"; }, /arm64/i],
    ["SSH key", (f) => { f.instance.Reservations[0].Instances[0].KeyName = "unsafe"; }, /key/i],
    ["optional IMDSv2", (f) => { f.instance.Reservations[0].Instances[0].MetadataOptions.HttpTokens = "optional"; }, /IMDS|HttpTokens/i],
    ["disabled monitoring", (f) => { f.instance.Reservations[0].Instances[0].Monitoring.State = "disabled"; }, /monitor/i],
    ["extra ingress", (f) => { f.securityGroup.SecurityGroups[0].IpPermissions.push({ IpProtocol: "tcp", FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: "0.0.0.0/0" }], Ipv6Ranges: [], PrefixListIds: [], UserIdGroupPairs: [] }); }, /ingress/i],
    ["wrong root size", (f) => { f.volumes.Volumes[0].Size = 31; }, /root.*30|volume/i],
    ["unencrypted data", (f) => { f.volumes.Volumes[1].Encrypted = false; }, /data.*encrypt|volume/i],
    ["offline SSM", (f) => { f.ssmInstance.InstanceInformationList[0].PingStatus = "ConnectionLost"; }, /Online/i],
    ["host not mounted", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.replace('"mount":true', '"mount":false'); }, /mount/i],
    ["wrong filesystem", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.replace('"xfs"', '"ext4"'); }, /filesystem|xfs/i],
    ["missing directories", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.replace('"directories":true', '"directories":false'); }, /directories/i],
    ["inactive services", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.replace('"services":true', '"services":false'); }, /services/i],
    ["running container", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.replace('"runningContainers":0', '"runningContainers":1'); }, /runningContainers/i],
    ["active release", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.replace('"activeRelease":false', '"activeRelease":true'); }, /activeRelease/i],
    ["bucket public", (f) => { f.releaseBucket.publicAccess.PublicAccessBlockConfiguration.BlockPublicAcls = false; }, /public/i],
    ["bucket unencrypted", (f) => { f.backupBucket.encryption.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm = "aws:kms"; }, /AES256|encryption/i],
    ["bucket versioning disabled", (f) => { f.releaseBucket.versioning.Status = "Suspended"; }, /version/i],
    ["missing lifecycle", (f) => { f.backupBucket.lifecycle.Rules.pop(); }, /lifecycle/i],
    ["secret version", (f) => { f.secretVersions.Versions.push({ VersionId: "unsafe-version" }); }, /secret.*version/i],
    ["missing log group", (f) => { f.logGroups.logGroups.pop(); }, /log group/i],
    ["missing alarm", (f) => { f.alarms.MetricAlarms.pop(); }, /alarm/i],
    ["wrong alarm threshold", (f) => { f.alarms.MetricAlarms[1].Threshold = 90; }, /alarm|threshold/i],
    ["wrong budget amount", (f) => { f.budget.Budget.BudgetLimit.Amount = "19999"; }, /budget.*amount/i],
    ["wrong budget unit", (f) => { f.budget.Budget.BudgetLimit.Unit = "USD"; }, /budget.*unit/i],
    ["missing budget notification", (f) => { f.notifications.Notifications.pop(); }, /notification/i],
    ["wrong subscriber", (f) => { f.subscribers.Subscribers[0].Address = "other@example.com"; }, /subscriber/i],
    ["pending SNS subscription", (f) => { f.topicSubscriptions.Subscriptions[0].SubscriptionArn = "PendingConfirmation"; }, /subscription|confirm/i],
    ["missing service tag", (f) => { f.iamTags.Tags.pop(); }, /tag/i],
    ["missing resource groups tag", (f) => { f.resourceGroups.ResourceTagMappingList[0].Tags.pop(); }, /tag/i]
  ];

  it.each(matrix)("rejects matrix invariant: %s", async (_name, mutate, expected) => {
    const fixture = passingFixture();
    mutate(fixture);
    await expect(verify({ fixture })).rejects.toThrow(expected);
  });

  it.each([
    ["false", (f) => { f.alarms.MetricAlarms[0].ActionsEnabled = false; }],
    ["missing", (f) => { delete f.alarms.MetricAlarms[1].ActionsEnabled; }],
    ["non-boolean", (f) => { f.alarms.MetricAlarms[2].ActionsEnabled = "true"; }]
  ])("rejects CloudWatch ActionsEnabled when %s before host execution", async (_label, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    const aws = createAws(fixture);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    await expect(verifyAwsStagingEnvironment({
      aws, config, resolveDns, runPreflight: createPreflight(resolveDns), now: () => 0
    })).rejects.toThrow(/CloudWatch alarm.*actions enabled|ActionsEnabled/i);
    expect(aws.json.mock.calls.some(([args]) => (
      args[0] === "ssm" && args[1] === "send-command"
    ))).toBe(false);
  });

  it.each([
    ["missing policy", (f) => { delete f.releaseBucket.policy.Policy; }],
    ["non-string policy", (f) => { f.releaseBucket.policy.Policy = expectedBucketTlsPolicy(ids.releaseBucket); }],
    ["weakened transport condition", (f) => {
      const policy = JSON.parse(f.releaseBucket.policy.Policy);
      policy.Statement[0].Condition.Bool["aws:SecureTransport"] = "true";
      f.releaseBucket.policy.Policy = JSON.stringify(policy);
    }],
    ["mismatched object ARN", (f) => {
      const policy = JSON.parse(f.backupBucket.policy.Policy);
      policy.Statement[0].Resource[1] = `arn:aws:s3:::${ids.releaseBucket}/*`;
      f.backupBucket.policy.Policy = JSON.stringify(policy);
    }],
    ["narrowed action", (f) => {
      const policy = JSON.parse(f.releaseBucket.policy.Policy);
      policy.Statement[0].Action = "s3:GetObject";
      f.releaseBucket.policy.Policy = JSON.stringify(policy);
    }],
    ["additional allow statement", (f) => {
      const policy = JSON.parse(f.backupBucket.policy.Policy);
      policy.Statement.push({ Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "*" });
      f.backupBucket.policy.Policy = JSON.stringify(policy);
    }]
  ])("rejects retained bucket policy drift before host execution: %s", async (_name, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    const aws = createAws(fixture);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    await expect(verifyAwsStagingEnvironment({
      aws, config, resolveDns, runPreflight: createPreflight(resolveDns), now: () => 0
    })).rejects.toThrow(/bucket policy|secure transport|Policy|TLS/i);
    expect(aws.json.mock.calls.some(([args]) => (
      args[0] === "ssm" && args[1] === "send-command"
    ))).toBe(false);
  });

  it("binds retained policy resources and reads each exact policy with the expected owner", async () => {
    const { aws, evidence } = await verify();
    expect(aws.json.mock.calls.filter(([args]) => (
      args[0] === "s3api" && args[1] === "get-bucket-policy"
    ))).toEqual([
      [[
        "s3api", "get-bucket-policy", "--bucket", ids.releaseBucket,
        "--expected-bucket-owner", config.accountId
      ]],
      [[
        "s3api", "get-bucket-policy", "--bucket", ids.backupBucket,
        "--expected-bucket-owner", config.accountId
      ]]
    ]);
    expect(evidence.buckets.release).toMatchObject({
      tlsOnly: true,
      policySha256: policySha256(ids.releaseBucket)
    });
    expect(evidence.buckets.backup).toMatchObject({
      tlsOnly: true,
      policySha256: policySha256(ids.backupBucket)
    });
  });

  it.each(["ReleaseBucketPolicy", "BackupBucketPolicy"])(
    "rejects a foreign %s physical identity before any SSM command",
    async (logicalId) => {
      const fixture = passingFixture();
      fixture.stackResources.StackResourceSummaries.find((resource) => (
        resource.LogicalResourceId === logicalId
      )).PhysicalResourceId = "foreign-retained-bucket";
      const aws = createAws(fixture);
      const resolveDns = vi.fn(async () => ["203.0.113.2"]);
      await expect(verifyAwsStagingEnvironment({
        aws, config, resolveDns, runPreflight: createPreflight(resolveDns), now: () => 0
      })).rejects.toThrow(new RegExp(`${logicalId}.*output`, "i"));
      expect(aws.json.mock.calls.some(([args]) => args[0] === "ssm")).toBe(false);
    }
  );

  it("runs a fresh in-process preflight with the same boundaries before any AWS description", async () => {
    const fixture = passingFixture();
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async (hostname) => {
      trace.push(`dns:${hostname}`);
      return ["203.0.113.2"];
    });
    const runPreflight = createPreflight(resolveDns, trace);

    await verifyAwsStagingEnvironment({ aws, config, resolveDns, runPreflight, now: () => 0 });
    expect(runPreflight).toHaveBeenCalledTimes(1);
    expect(runPreflight).toHaveBeenCalledWith({
      aws,
      config,
      resolveDns,
      runtimeArtifact,
      templateArtifact
    });
    expect(trace.slice(0, 3)).toEqual([
      "preflight", `dns:${config.hostname}`,
      `json:cloudformation describe-stacks --stack-name ${config.stackName}`
    ]);
  });

  it.each([
    [{ accountId: "999999999999" }, /account/i],
    [{ region: "us-east-1" }, /region/i],
    [{ hostname: "staging.other.life" }, /hostname/i],
    [{ templateSha256: "0".repeat(64) }, /template/i],
    [{ sourceRevision: "f".repeat(40) }, /template|revision/i],
    [{ stackState: "CREATE_IN_PROGRESS" }, /stack/i],
    [{ callerKind: "iam-user" }, /preflight/i]
  ])("rejects preflight binding mismatch %# before AWS descriptions", async (overrides, expected) => {
    const fixture = passingFixture();
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    await expect(verifyAwsStagingEnvironment({
      aws,
      config,
      resolveDns,
      runPreflight: createPreflight(resolveDns, trace, overrides),
      now: () => 0
    })).rejects.toThrow(expected);
    expect(aws.json).not.toHaveBeenCalled();
  });

  it.each([
    ["stack pagination", (f) => { f.stack.NextToken = "more"; }],
    ["resource pagination", (f) => { f.stackResources.NextToken = "more"; }],
    ["volume pagination", (f) => { f.volumes.NextToken = "more"; }],
    ["EC2 tag pagination", (f) => { f.ec2Tags.NextToken = "more"; }],
    ["SSM pagination", (f) => { f.ssmInstance.NextToken = "more"; }],
    ["secret pagination", (f) => { f.secretVersions.NextToken = "more"; }],
    ["logs pagination", (f) => { f.logGroups.nextToken = "more"; }],
    ["alarm pagination", (f) => { f.alarms.NextToken = "more"; }],
    ["notification pagination", (f) => { f.notifications.NextToken = "more"; }],
    ["subscriber pagination", (f) => { f.subscribers.NextToken = "more"; }],
    ["SNS subscription pagination", (f) => { f.topicSubscriptions.NextToken = "more"; }],
    ["resource groups pagination", (f) => { f.resourceGroups.PaginationToken = "more"; }]
  ])("fails closed on %s", async (_name, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    await expect(verify({ fixture })).rejects.toThrow(/paginat|truncat|token/i);
  });

  it.each([
    ["missing stack", (f) => { f.stack = {}; }],
    ["duplicate stack", (f) => { f.stack.Stacks.push(f.stack.Stacks[0]); }],
    ["missing resource", (f) => { f.stackResources.StackResourceSummaries.pop(); }],
    ["duplicate resource", (f) => { f.stackResources.StackResourceSummaries.push(f.stackResources.StackResourceSummaries[0]); }],
    ["duplicate output", (f) => { f.stack.Stacks[0].Outputs.push(f.stack.Stacks[0].Outputs[0]); }],
    ["missing output", (f) => { f.stack.Stacks[0].Outputs.pop(); }],
    ["extra output", (f) => { f.stack.Stacks[0].Outputs.push({ OutputKey: "Unexpected", OutputValue: "value" }); }],
    ["duplicate instance", (f) => { f.instance.Reservations[0].Instances.push(f.instance.Reservations[0].Instances[0]); }],
    ["malformed described EIP", (f) => { f.address = {}; }],
    ["duplicate image", (f) => { f.image.Images.push(f.image.Images[0]); }],
    ["duplicate security group", (f) => { f.securityGroup.SecurityGroups.push(f.securityGroup.SecurityGroups[0]); }],
    ["duplicate volume", (f) => { f.volumes.Volumes.push(f.volumes.Volumes[0]); }],
    ["duplicate SSM registration", (f) => { f.ssmInstance.InstanceInformationList.push(f.ssmInstance.InstanceInformationList[0]); }]
  ])("rejects malformed/cardinality response: %s", async (_name, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    await expect(verify({ fixture })).rejects.toThrow(/exact|duplicate|missing|one|cardinality/i);
  });

  it("cross-binds stack outputs, stack resources, instance, volumes, alarms, and log groups", async () => {
    const mutations = [
      (f) => { f.stackResources.StackResourceSummaries.find((r) => r.LogicalResourceId === "Instance").PhysicalResourceId = "i-0fedcba9876543210"; },
      (f) => { f.instance.Reservations[0].Instances[0].InstanceId = "i-0fedcba9876543210"; },
      (f) => { f.volumes.Volumes[1].VolumeId = "vol-0fedcba9876543210"; },
      (f) => { f.alarms.MetricAlarms[0].Dimensions[0].Value = "i-0fedcba9876543210"; },
      (f) => { f.logGroups.logGroups[0].logGroupName = "/wrong/name"; }
    ];
    for (const mutate of mutations) {
      const fixture = passingFixture();
      mutate(fixture);
      await expect(verify({ fixture })).rejects.toThrow(/match|identity|resource|volume|alarm|log group/i);
    }
  });

  it.each([
    ["missing instance VPC", (f) => { delete f.instance.Reservations[0].Instances[0].VpcId; }],
    ["mismatched instance VPC", (f) => { f.instance.Reservations[0].Instances[0].VpcId = "vpc-0fedcba9876543210"; }],
    ["missing instance subnet", (f) => { delete f.instance.Reservations[0].Instances[0].SubnetId; }],
    ["mismatched instance subnet", (f) => { f.instance.Reservations[0].Instances[0].SubnetId = "subnet-0fedcba9876543210"; }],
    ["missing instance profile", (f) => { delete f.instance.Reservations[0].Instances[0].IamInstanceProfile; }],
    ["mismatched instance profile account", (f) => { f.instance.Reservations[0].Instances[0].IamInstanceProfile.Arn = "arn:aws:iam::999999999999:instance-profile/needo-staging-instance-profile"; }],
    ["mismatched instance profile name", (f) => { f.instance.Reservations[0].Instances[0].IamInstanceProfile.Arn = `arn:aws:iam::${config.accountId}:instance-profile/other`; }],
    ["missing instance public IP", (f) => { delete f.instance.Reservations[0].Instances[0].PublicIpAddress; }],
    ["mismatched instance public IP", (f) => { f.instance.Reservations[0].Instances[0].PublicIpAddress = "203.0.113.99"; }],
    ["missing network interfaces", (f) => { delete f.instance.Reservations[0].Instances[0].NetworkInterfaces; }],
    ["multiple network interfaces", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces.push({ ...f.instance.Reservations[0].Instances[0].NetworkInterfaces[0] }); }],
    ["non-primary network interface", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].Attachment.DeviceIndex = 1; }],
    ["mismatched network VPC", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].VpcId = "vpc-0fedcba9876543210"; }],
    ["mismatched network subnet", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].SubnetId = "subnet-0fedcba9876543210"; }],
    ["missing network security group", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].Groups = []; }],
    ["multiple network security groups", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].Groups.push({ GroupId: "sg-0fedcba9876543210" }); }],
    ["mismatched network security group", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].Groups[0].GroupId = "sg-0fedcba9876543210"; }],
    ["missing network EIP association", (f) => { delete f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].Association; }],
    ["mismatched network EIP", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].Association.PublicIp = "203.0.113.99"; }],
    ["mismatched network EIP owner", (f) => { f.instance.Reservations[0].Instances[0].NetworkInterfaces[0].Association.IpOwnerId = "999999999999"; }],
    ["missing described EIP", (f) => { f.address.Addresses = []; }],
    ["multiple described EIPs", (f) => { f.address.Addresses.push({ ...f.address.Addresses[0] }); }],
    ["mismatched allocation", (f) => { f.address.Addresses[0].AllocationId = "eipalloc-0fedcba9876543210"; }],
    ["mismatched EIP association", (f) => { f.address.Addresses[0].AssociationId = "eipassoc-0fedcba9876543210"; }],
    ["mismatched EIP instance", (f) => { f.address.Addresses[0].InstanceId = "i-0fedcba9876543210"; }],
    ["mismatched EIP network interface", (f) => { f.address.Addresses[0].NetworkInterfaceId = "eni-0fedcba9876543210"; }],
    ["mismatched described public IP", (f) => { f.address.Addresses[0].PublicIp = "203.0.113.99"; }],
    ["non-VPC EIP domain", (f) => { f.address.Addresses[0].Domain = "standard"; }]
  ])("rejects EC2 placement/profile/EIP boundary before host verification: %s", async (_name, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    await expect(verifyAwsStagingEnvironment({
      aws, config, resolveDns, runPreflight: createPreflight(resolveDns, trace), now: () => 0
    })).rejects.toThrow(/EC2|instance|profile|VPC|subnet|network|security|Elastic|EIP|address|association|public|cardinality|exactly/i);
    expect(aws.json.mock.calls.some(([args]) => (
      args[0] === "ssm" && args[1] === "send-command"
    ))).toBe(false);
  });

  it("uses only approved read-only descriptions plus one parameter-free SSM command", async () => {
    const { aws } = await verify();
    const operations = aws.json.mock.calls.map(([args]) => `${args[0]} ${args[1]}`);
    const allowed = new Set([
      "cloudformation describe-stacks", "cloudformation list-stack-resources",
      "ec2 describe-instances", "ec2 describe-addresses", "ec2 describe-images", "ec2 describe-security-groups",
      "ec2 describe-volumes", "ec2 describe-tags", "ssm describe-instance-information",
      "ssm get-document", "ssm get-parameter", "ssm list-tags-for-resource",
      "s3api get-public-access-block", "s3api get-bucket-encryption",
      "s3api get-bucket-versioning", "s3api get-bucket-lifecycle-configuration", "s3api get-bucket-tagging",
      "s3api get-bucket-policy",
      "iam list-role-tags", "secretsmanager describe-secret", "secretsmanager list-secret-version-ids",
      "logs list-tags-for-resource", "logs describe-log-groups", "cloudwatch describe-alarms",
      "cloudwatch list-tags-for-resource", "sns list-tags-for-resource", "budgets describe-budget",
      "sns list-subscriptions-by-topic",
      "budgets describe-notifications-for-budget", "budgets describe-subscribers-for-notification",
      "budgets list-tags-for-resource", "resourcegroupstaggingapi get-resources",
      "ssm send-command", "ssm get-command-invocation"
    ]);
    expect(operations.every((operation) => allowed.has(operation))).toBe(true);
    expect(operations.filter((operation) => operation === "ssm send-command")).toHaveLength(1);
    expect(operations.filter((operation) => operation === "ssm get-command-invocation")).toHaveLength(1);
    expect(operations.filter((operation) => operation === "ssm get-document")).toHaveLength(1);
    expect(operations.filter((operation) => operation === "ssm get-parameter")).toHaveLength(1);
    expect(operations.filter((operation) => operation === "ssm list-tags-for-resource")).toHaveLength(3);
    expect(operations.filter((operation) => operation === "logs list-tags-for-resource")).toHaveLength(2);
    expect(operations.filter((operation) => operation === "cloudwatch list-tags-for-resource")).toHaveLength(4);
    expect(operations.filter((operation) => operation === "budgets describe-subscribers-for-notification")).toHaveLength(5);
    expect(operations.filter((operation) => operation === "resourcegroupstaggingapi get-resources")).toHaveLength(1);
    expect(operations.filter((operation) => operation === "sns list-subscriptions-by-topic")).toHaveLength(1);
    expect(operations.filter((operation) => operation === "ec2 describe-addresses")).toHaveLength(1);
    expect(aws.json.mock.calls.find(([args]) => (
      args[0] === "ec2" && args[1] === "describe-addresses"
    ))).toEqual([[
      "ec2", "describe-addresses", "--allocation-ids", ids.elasticAllocation
    ]]);
    expect(aws.json.mock.calls.find(([args]) => (
      args[0] === "sns" && args[1] === "list-subscriptions-by-topic"
    ))).toEqual([[
      "sns", "list-subscriptions-by-topic", "--topic-arn", ids.topicArn
    ]]);
    for (const operation of [
      "get-public-access-block", "get-bucket-encryption", "get-bucket-versioning",
      "get-bucket-lifecycle-configuration", "get-bucket-tagging", "get-bucket-policy"
    ]) expect(operations.filter((candidate) => candidate === `s3api ${operation}`)).toHaveLength(2);
    expect(operations).not.toContain("secretsmanager get-secret-value");
    const budgetCalls = aws.json.mock.calls.filter(([args]) => args[0] === "budgets");
    expect(budgetCalls.length).toBeGreaterThan(0);
    for (const [args] of budgetCalls) {
      if (args[1] === "list-tags-for-resource") {
        expect(args).not.toContain("--account-id");
        expect(argument(args, "--resource-arn")).toBe(budgetArn);
      } else {
        expect(args).toContain("--account-id");
        expect(argument(args, "--account-id")).toBe(config.accountId);
      }
    }
    expect(aws.json.mock.calls.find(([args]) => (
      args[0] === "budgets" && args[1] === "list-tags-for-resource"
    ))).toEqual([[
      "budgets", "list-tags-for-resource", "--resource-arn", budgetArn
    ]]);
  });

  it.each([
    ["duplicate Resource Groups ARN", (f) => { f.resourceGroups.ResourceTagMappingList[1].ResourceARN = f.resourceGroups.ResourceTagMappingList[0].ResourceARN; }],
    ["mismatched Resource Groups ARN", (f) => { f.resourceGroups.ResourceTagMappingList[0].ResourceARN = "arn:aws:ec2:ap-northeast-1:123456789012:vpc/vpc-0fedcba9876543210"; }],
    ["duplicate EC2 tag", (f) => { f.ec2Tags.Tags.push({ ...f.ec2Tags.Tags[0] }); }],
    ["truncated IAM tags", (f) => { f.iamTags.IsTruncated = true; }]
  ])("rejects tag result integrity failure: %s", async (_name, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    await expect(verify({ fixture })).rejects.toThrow(/tag|duplicate|mismatch|truncat|cardinality/i);
  });

  it.each([
    ["missing", (f) => { f.topicSubscriptions.Subscriptions = []; }],
    ["multiple", (f) => { f.topicSubscriptions.Subscriptions.push({ ...f.topicSubscriptions.Subscriptions[0] }); }],
    ["wrong topic", (f) => { f.topicSubscriptions.Subscriptions[0].TopicArn = `${ids.topicArn}-other`; }],
    ["wrong endpoint", (f) => { f.topicSubscriptions.Subscriptions[0].Endpoint = "other@example.com"; }],
    ["wrong protocol", (f) => { f.topicSubscriptions.Subscriptions[0].Protocol = "http"; }],
    ["wrong owner", (f) => { f.topicSubscriptions.Subscriptions[0].Owner = "999999999999"; }],
    ["deleted", (f) => { f.topicSubscriptions.Subscriptions[0].SubscriptionArn = "Deleted"; }],
    ["mismatched ARN", (f) => { f.topicSubscriptions.Subscriptions[0].SubscriptionArn = `arn:aws:sns:${config.region}:${config.accountId}:other-topic:12345678-1234-1234-1234-1234567890ab`; }],
    ["stack physical mismatch", (f) => { f.stackResources.StackResourceSummaries.find((r) => r.LogicalResourceId === "AlertSubscription").PhysicalResourceId = "PendingConfirmation"; }]
  ])("rejects %s SNS subscription before host verification", async (_name, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    await expect(verifyAwsStagingEnvironment({
      aws, config, resolveDns, runPreflight: createPreflight(resolveDns, trace), now: () => 0
    })).rejects.toThrow(/SNS|subscription|confirm|identity|cardinality|match/i);
    expect(aws.json.mock.calls.some(([args]) => (
      args[0] === "ssm" && args[1] === "send-command"
    ))).toBe(false);
  });

  it.each([
    ["unsafe instance ID", (f) => { f.stack.Stacks[0].Outputs.find((o) => o.OutputKey === "InstanceId").OutputValue = "--query"; }],
    ["unsafe document", (f) => { f.stack.Stacks[0].Outputs.find((o) => o.OutputKey === "HostVerificationDocumentName").OutputValue = "$(unsafe)"; }],
    ["wrong budget name", (f) => { f.stack.Stacks[0].Outputs.find((o) => o.OutputKey === "BudgetName").OutputValue = "another-budget"; }],
    ["unsafe physical ID", (f) => { f.stackResources.StackResourceSummaries[0].PhysicalResourceId = "value\n--profile evil"; }]
  ])("rejects %s before using it in AWS arguments", async (_name, mutate) => {
    const fixture = passingFixture();
    mutate(fixture);
    const trace = [];
    const aws = createAws(fixture, trace);
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    await expect(verifyAwsStagingEnvironment({
      aws, config, resolveDns, runPreflight: createPreflight(resolveDns, trace), now: () => 0
    })).rejects.toThrow(/invalid|unsafe|match/i);
    expect(aws.json.mock.calls.some(([args]) => args.includes("--query") || args.includes("$(unsafe)"))).toBe(false);
  });

  it("rejects an unsafe resolved stack name before preflight, AWS, or DNS", async () => {
    const aws = createAws(passingFixture());
    const resolveDns = vi.fn();
    const runPreflight = vi.fn();
    await expect(verifyAwsStagingEnvironment({
      aws,
      config: { ...config, stackName: "--query" },
      resolveDns,
      runPreflight,
      now: () => 0
    })).rejects.toThrow(/stackName|config|unsafe/i);
    expect(runPreflight).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it.each([
    ["missing command ID", (f) => { f.sendCommand = {}; }, /CommandId/i],
    ["unsafe command ID", (f) => { f.sendCommand.Command.CommandId = "--query"; }, /CommandId/i],
    ["non-UUID command ID", (f) => { f.sendCommand.Command.CommandId = "command-0001"; }, /CommandId/i],
    ["uppercase command ID", (f) => { f.sendCommand.Command.CommandId = ids.commandId.toUpperCase(); }, /CommandId/i],
    ["missing invocation command ID", (f) => { delete f.invocation.CommandId; }, /CommandId/i],
    ["mismatched invocation command ID", (f) => { f.invocation.CommandId = "87654321-4321-4cba-8fed-ba0987654321"; }, /CommandId|match/i],
    ["unsafe invocation command ID", (f) => { f.invocation.CommandId = "--query"; }, /CommandId|invalid|unsafe/i],
    ["missing invocation instance ID", (f) => { delete f.invocation.InstanceId; }, /InstanceId/i],
    ["mismatched invocation instance ID", (f) => { f.invocation.InstanceId = "i-0fedcba9876543210"; }, /InstanceId|match/i],
    ["unsafe invocation instance ID", (f) => { f.invocation.InstanceId = "$(unsafe)"; }, /InstanceId|invalid|unsafe/i],
    ["missing invocation document name", (f) => { delete f.invocation.DocumentName; }, /DocumentName/i],
    ["mismatched invocation document name", (f) => { f.invocation.DocumentName = "other-document"; }, /DocumentName|match/i],
    ["unsafe invocation document name", (f) => { f.invocation.DocumentName = "$(unsafe)"; }, /DocumentName|invalid|unsafe/i],
    ["failed status", (f) => { f.invocation.Status = "Failed"; }, /Success/i],
    ["nonzero response", (f) => { f.invocation.ResponseCode = 1; }, /response/i],
    ["unsafe stderr", (f) => { f.invocation.StandardErrorContent = "warning"; }, /stderr/i],
    ["multiple output lines", (f) => { f.invocation.StandardOutputContent += "{}\n"; }, /one-line|output/i],
    ["extra host key", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.trim().replace("}", ',"extra":true}') + "\n"; }, /exact keys/i],
    ["nested host value", (f) => { f.invocation.StandardOutputContent = f.invocation.StandardOutputContent.replace('"mount":true', '"mount":{}'); }, /mount|scalar/i]
  ])("rejects unsafe SSM verification result: %s", async (_name, mutate, expected) => {
    const fixture = passingFixture();
    mutate(fixture);
    await expect(verify({ fixture })).rejects.toThrow(expected);
  });

  it.each(["ENODATA", "ENOTFOUND"])("normalizes post-verification DNS %s to []", async (code) => {
    const fixture = passingFixture();
    const aws = createAws(fixture);
    const calls = [];
    const resolveDns = vi.fn(async () => {
      if (calls.length === 0) {
        calls.push("first");
        return [];
      }
      throw Object.assign(new Error(code), { code });
    });
    const evidence = await verifyAwsStagingEnvironment({
      aws, config, resolveDns, runPreflight: createPreflight(resolveDns), now: () => 0
    });
    expect(evidence.dns).toEqual({ preflightA: [], postVerificationA: [] });
  });

  it("rejects DNS drift after every other verification and propagates other DNS failures", async () => {
    for (const postResult of [
      ["203.0.113.99"],
      Object.assign(new Error("timeout"), { code: "ETIMEOUT" })
    ]) {
      const fixture = passingFixture();
      const aws = createAws(fixture);
      let call = 0;
      const resolveDns = vi.fn(async () => {
        call += 1;
        if (call === 1) return ["203.0.113.2"];
        if (postResult instanceof Error) throw postResult;
        return postResult;
      });
      await expect(verifyAwsStagingEnvironment({
        aws, config, resolveDns, runPreflight: createPreflight(resolveDns), now: () => 0
      })).rejects.toThrow(/DNS|timeout/i);
      expect(aws.json.mock.calls.some(([args]) => args[1] === "get-command-invocation")).toBe(true);
    }
  });
});

describe("AWS Staging acceptance evidence writer and CLI", () => {
  it("rejects replacement of the attested trusted root at writer entry", async () => {
    const { evidence } = await verify();
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-writer-root-entry-"));
    const trustedRoot = path.join(temporaryRoot, "trusted");
    const displacedRoot = path.join(temporaryRoot, "displaced");
    const replacementRoot = path.join(temporaryRoot, "replacement");
    const outputDirectory = path.join(trustedRoot, "outputs", "aws-staging");
    await fs.mkdir(trustedRoot, { mode: 0o700 });
    await fs.mkdir(replacementRoot, { mode: 0o700 });
    const trustedRootIdentity = await captureTrustedRootIdentity(trustedRoot);
    let swapped = false;
    const fileSystem = {
      ...fs,
      async lstat(targetPath) {
        if (!swapped && targetPath === trustedRoot) {
          swapped = true;
          await fs.rename(trustedRoot, displacedRoot);
          await fs.rename(replacementRoot, trustedRoot);
        }
        return fs.lstat(targetPath);
      }
    };

    try {
      await expect(writeAwsStagingAcceptanceEvidence({
        evidence,
        trustedRoot,
        trustedRootIdentity,
        outputDirectory,
        fileSystem
      })).rejects.toThrow(/trusted root.*identity changed/i);
      await expect(fs.readdir(trustedRoot)).resolves.toEqual([]);
      await expect(fs.readdir(displacedRoot)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a pre-existing group/world-writable evidence ancestor", async () => {
    const { evidence } = await verify();
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-writer-mode-"));
    const outputsDirectory = path.join(temporaryRoot, "outputs");
    const outputDirectory = path.join(outputsDirectory, "aws-staging");
    await fs.mkdir(outputsDirectory, { mode: 0o777 });
    await fs.chmod(outputsDirectory, 0o777);

    try {
      await expect(writeAwsStagingAcceptanceEvidence({
        evidence,
        trustedRoot: temporaryRoot,
        trustedRootIdentity: await captureTrustedRootIdentity(temporaryRoot),
        outputDirectory
      })).rejects.toThrow(/group- or world-writable/i);
      await expect(fs.readdir(outputsDirectory)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a permissive hyphen-only StackId before writing evidence", async () => {
    const { evidence } = await verify();
    const contaminated = structuredClone(evidence);
    contaminated.stack.id = [
      `arn:aws:cloudformation:${config.region}:${config.accountId}:stack/${config.stackName}`,
      "-".repeat(36)
    ].join("/");
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-stack-id-"));
    try {
      await expect(writeAwsStagingAcceptanceEvidence({
        evidence: contaminated,
        trustedRoot: temporaryRoot,
        outputDirectory: path.join(temporaryRoot, "outputs", "aws-staging")
      })).rejects.toThrow(/StackId|stack ID.*invalid/i);
      expect(await fs.readdir(temporaryRoot)).toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("writes reconstructed evidence atomically with private modes", async () => {
    const { evidence } = await verify();
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    try {
      const resultPath = await writeAwsStagingAcceptanceEvidence({ evidence, trustedRoot: temporaryRoot, outputDirectory });
      const [directoryStat, fileStat, files, contents] = await Promise.all([
        fs.stat(outputDirectory), fs.stat(resultPath), fs.readdir(outputDirectory), fs.readFile(resultPath, "utf8")
      ]);
      expect(directoryStat.mode & 0o777).toBe(0o700);
      expect(fileStat.mode & 0o777).toBe(0o600);
      expect(files).toEqual(["environment-acceptance.json"]);
      expect(JSON.parse(contents)).toEqual(evidence);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("preserves Sydney in reconstructed acceptance evidence", async () => {
    const sydneyConfig = Object.freeze({ ...config, region: "ap-southeast-2" });
    const fixture = fixtureForRegion(sydneyConfig.region);
    const trace = [];
    const resolveDns = vi.fn(async () => ["203.0.113.2"]);
    const evidence = await verifyAwsStagingEnvironment({
      aws: createAws(fixture, trace),
      config: sydneyConfig,
      resolveDns,
      runPreflight: createPreflight(
        resolveDns,
        trace,
        { region: sydneyConfig.region },
        sydneyConfig
      ),
      now: () => 0
    });
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-sydney-"));
    try {
      const resultPath = await writeAwsStagingAcceptanceEvidence({
        evidence,
        trustedRoot: temporaryRoot,
        outputDirectory: path.join(temporaryRoot, "outputs", "aws-staging")
      });
      expect(JSON.parse(await fs.readFile(resultPath, "utf8")).region)
        .toBe("ap-southeast-2");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["unexpected top-level", (e) => { e.unexpected = true; }],
    ["unexpected nested", (e) => { e.stack.callerArn = "unsafe"; }],
    ["raw email", (e) => { e.budget.maskedSubscriber = config.alertEmail; }],
    ["secret ARN", (e) => { e.resourceIds.applicationSecretArn = ids.secretArn; }],
    ["credential", (e) => { e.resourceIds.budgetName = "AKIAIOSFODNN7EXAMPLE"; }],
    ["home path", (e) => { e.resourceIds.budgetName = "/Users/eason/secret"; }],
    ["raw output", (e) => { e.ssm.stdout = "unsafe"; }],
    ["wrong verification document hash", (e) => { e.ssm.documentSha256 = "0".repeat(64); }],
    ["unexpected lifecycle key", (e) => { e.buckets.release.lifecycleRules[0].unexpected = true; }],
    ["weakened retained policy flag", (e) => { e.buckets.release.tlsOnly = false; }],
    ["mismatched retained policy hash", (e) => { e.buckets.backup.policySha256 = "0".repeat(64); }],
    ["wrong alarm summary", (e) => { e.monitoring.alarms[0].threshold = 999; }],
    ["disabled alarm actions", (e) => { e.monitoring.alarms[0].actionsEnabled = false; }],
    ["duplicate log summary", (e) => { e.monitoring.logGroups[1] = { ...e.monitoring.logGroups[0] }; }],
    ["swapped log group ARNs", (e) => {
      const [system, docker] = e.monitoring.logGroups;
      [system.arn, docker.arn] = [docker.arn, system.arn];
    }],
    ["duplicate Docker ARN under the system name", (e) => {
      e.monitoring.logGroups[0].arn = e.monitoring.logGroups[1].arn;
    }],
    ["unconfirmed SNS", (e) => { e.monitoring.snsSubscriptionConfirmed = false; }],
    ["wrong agent parameter hash", (e) => {
      e.monitoring.agentParameterSha256 = "0".repeat(64);
    }],
    ["wrong Resource Groups set", (e) => {
      e.tagCoverage.resources.find((item) => item.logicalId === "Vpc").resourceGroupsTags = false;
      e.tagCoverage.resources.find((item) => item.logicalId === "InstanceRole").resourceGroupsTags = true;
    }],
    ["business mutation", (e) => { e.businessDataMutation = true; }],
    ["waiver expansion", (e) => { e.waivedBaselineFailures.push("another failure"); }]
  ])("rejects evidence contamination: %s", async (_name, mutate) => {
    const { evidence } = await verify();
    const contaminated = structuredClone(evidence);
    mutate(contaminated);
    await expect(writeAwsStagingAcceptanceEvidence({
      evidence: contaminated,
      trustedRoot: "/must",
      outputDirectory: "/must/not-be-reached"
    })).rejects.toThrow(/exact|email|secret|credential|home|unsafe|false|true|waived|invalid/i);
  });

  it("rejects relative, out-of-root, and ancestor symlink paths without leakage", async () => {
    const { evidence } = await verify();
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-link-"));
    const trustedRoot = path.join(temporaryRoot, "trusted");
    const outside = path.join(temporaryRoot, "outside");
    await fs.mkdir(trustedRoot);
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(trustedRoot, "outputs"));
    try {
      await expect(writeAwsStagingAcceptanceEvidence({ evidence, trustedRoot, outputDirectory: "relative" })).rejects.toThrow("absolute descendant");
      await expect(writeAwsStagingAcceptanceEvidence({ evidence, trustedRoot, outputDirectory: path.join(temporaryRoot, "outside-write") })).rejects.toThrow("absolute descendant");
      await expect(writeAwsStagingAcceptanceEvidence({ evidence, trustedRoot, outputDirectory: path.join(trustedRoot, "outputs", "aws-staging") })).rejects.toThrow("symlink");
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("uses no-follow handles, rejects directory identity swaps, and cleans temp files", async () => {
    const { evidence } = await verify();
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-race-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const displaced = path.join(temporaryRoot, "displaced");
    let swapped = false;
    const openCalls = [];
    const fileSystem = {
      ...fs,
      async open(filePath, flags, mode) {
        openCalls.push({ filePath, flags, mode });
        if (!swapped && filePath.includes(".environment-acceptance.json.")) {
          swapped = true;
          await fs.rename(outputDirectory, displaced);
          await fs.mkdir(outputDirectory, { mode: 0o700 });
        }
        return fs.open(filePath, flags, mode);
      }
    };
    try {
      await expect(writeAwsStagingAcceptanceEvidence({ evidence, trustedRoot: temporaryRoot, outputDirectory, fileSystem })).rejects.toThrow("identity changed");
      expect(await fs.readdir(outputDirectory)).toEqual([]);
      expect(await fs.readdir(displaced)).toEqual([]);
      const temporaryOpen = openCalls.find(({ filePath }) => filePath.includes(".environment-acceptance.json."));
      const directoryOpen = openCalls.find(({ filePath }) => filePath === outputDirectory);
      expect(directoryOpen.flags & fsConstants.O_DIRECTORY).toBe(fsConstants.O_DIRECTORY);
      expect(directoryOpen.flags & fsConstants.O_NOFOLLOW).toBe(fsConstants.O_NOFOLLOW);
      expect(temporaryOpen.flags & fsConstants.O_EXCL).toBe(fsConstants.O_EXCL);
      expect(temporaryOpen.flags & fsConstants.O_NOFOLLOW).toBe(fsConstants.O_NOFOLLOW);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects an ancestor identity swap before creating a descendant", async () => {
    const { evidence } = await verify();
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-ancestor-race-"));
    const trustedRoot = path.join(temporaryRoot, "trusted");
    const displaced = path.join(temporaryRoot, "displaced");
    const replacement = path.join(temporaryRoot, "replacement");
    const outputDirectory = path.join(trustedRoot, "outputs", "aws-staging");
    await fs.mkdir(trustedRoot, { mode: 0o700 });
    await fs.mkdir(replacement, { mode: 0o700 });
    await fs.writeFile(path.join(replacement, "outside-marker"), "unchanged");
    let swapped = false;
    const fileSystem = {
      ...fs,
      async lstat(targetPath) {
        if (!swapped && targetPath === path.join(trustedRoot, "outputs")) {
          swapped = true;
          await fs.rename(trustedRoot, displaced);
          await fs.rename(replacement, trustedRoot);
        }
        return fs.lstat(targetPath);
      }
    };
    try {
      await expect(writeAwsStagingAcceptanceEvidence({ evidence, trustedRoot, outputDirectory, fileSystem })).rejects.toThrow("identity changed");
      expect(await fs.readdir(trustedRoot)).toEqual(["outside-marker"]);
      expect(await fs.readFile(path.join(trustedRoot, "outside-marker"), "utf8")).toBe("unchanged");
      expect(await fs.readdir(displaced)).toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("removes its exclusive temporary file when rename fails", async () => {
    const { evidence } = await verify();
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-verify-cleanup-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const fileSystem = { ...fs, rename: vi.fn(async () => { throw new Error("rename failure"); }) };
    try {
      await expect(writeAwsStagingAcceptanceEvidence({ evidence, trustedRoot: temporaryRoot, outputDirectory, fileSystem })).rejects.toThrow("rename failure");
      expect(await fs.readdir(outputDirectory)).toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("keeps CLI import-safe and emits only fixed redacted failure JSON", async () => {
    const { runCli } = await import("./aws-staging-verify.mjs");
    const stdout = [];
    const stderr = [];
    const exitCodes = [];
    const sensitive = "arn:aws:sts::123456789012:assumed-role/x/y ops@example.com AKIAIOSFODNN7EXAMPLE AWS-stdout AWS-stderr";
    const result = await runCli({
      argv: [sensitive],
      execute: vi.fn(async () => { throw Object.assign(new Error(sensitive), { stdout: sensitive, stderr: sensitive }); }),
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line),
      setExitCode: (code) => exitCodes.push(code)
    });
    expect(result).toEqual({ ok: false, failure: { gate: "aws-staging-environment-acceptance", status: "failed" } });
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["{\"gate\":\"aws-staging-environment-acceptance\",\"status\":\"failed\"}"]);
    expect(exitCodes).toEqual([1]);
    expect(`${stdout}${stderr}`).not.toContain(sensitive);

    const cliUrl = new URL("./aws-staging-verify.mjs", import.meta.url);
    const imported = spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(cliUrl.href)})`], { encoding: "utf8", shell: false });
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toBe("");

    const direct = spawnSync(process.execPath, [fileURLToPath(cliUrl), "--unsafe", sensitive], { encoding: "utf8", shell: false });
    expect(direct.status).toBe(1);
    expect(direct.stdout).toBe("");
    expect(direct.stderr).toBe("{\"gate\":\"aws-staging-environment-acceptance\",\"status\":\"failed\"}\n");
    expect(`${direct.stdout}${direct.stderr}`).not.toContain(sensitive);
  });

  it("keeps the successful CLI path fully injectable and writes only the acceptance evidence", async () => {
    const { main } = await import("./aws-staging-verify.mjs");
    const { evidence } = await verify();
    const parsed = Object.freeze({ parsed: true, sourceRevision: runtimeSourceRevision });
    const aws = createAws(passingFixture());
    aws.dispose = vi.fn(async () => {});
    const parseArgs = vi.fn(() => parsed);
    const resolveConfig = vi.fn(() => config);
    const createAwsCliFake = vi.fn(() => aws);
    const preflight = vi.fn();
    const verifyEnvironment = vi.fn(async () => evidence);
    const testRepoRoot = "/approved/source-root";
    const writeEvidence = vi.fn(async () => path.join(
      testRepoRoot, "outputs", "aws-staging", "environment-acceptance.json"
    ));
    const trace = [];
    const guardedRuntimeArtifact = Object.freeze({
      ...runtimeArtifact,
      evidenceOutputDirectory: path.join(testRepoRoot, "outputs", "aws-staging"),
      evidenceTrustedRoot: testRepoRoot,
      evidenceTrustedRootIdentity: Object.freeze({
        realPath: testRepoRoot,
        device: "1",
        inode: "2",
        owner: "501",
        group: "20",
        mode: 0o755
      }),
      assertCurrentState: vi.fn(async () => trace.push("runtime:assert"))
    });
    const guardedTemplateArtifact = Object.freeze({
      ...templateArtifact,
      assertCurrentState: vi.fn(async () => trace.push("template:assert"))
    });

    const summary = await main(["--injected"], {
      captureRuntimeArtifactImpl: vi.fn(async () => {
        trace.push("runtime:capture");
        return guardedRuntimeArtifact;
      }),
      parseAwsStagingBoundArgsImpl: parseArgs,
      resolveAwsStagingConfigImpl: resolveConfig,
      captureTemplateArtifactImpl: vi.fn(async (input) => {
        trace.push("template:capture");
        expect(input).toEqual({
          templatePath: config.templatePath,
          approvedRevision: runtimeSourceRevision
        });
        return guardedTemplateArtifact;
      }),
      createAwsCliImpl: vi.fn(async (input) => {
        trace.push("credentials");
        expect(input.assertRuntimeCurrent).toBe(guardedRuntimeArtifact.assertCurrentState);
        return createAwsCliFake();
      }),
      runAwsStagingPreflightImpl: preflight,
      verifyAwsStagingEnvironmentImpl: verifyEnvironment,
      writeAwsStagingAcceptanceEvidenceImpl: writeEvidence
    });
    expect(parseArgs).toHaveBeenCalledWith(["--injected"]);
    expect(resolveConfig).toHaveBeenCalledWith(parsed);
    expect(verifyEnvironment).toHaveBeenCalledWith({
      aws,
      config,
      runPreflight: preflight,
      runtimeArtifact: guardedRuntimeArtifact,
      templateArtifact: guardedTemplateArtifact
    });
    expect(trace).toEqual([
      "runtime:capture",
      "template:capture",
      "runtime:assert",
      "template:assert",
      "credentials",
      "runtime:assert"
    ]);
    expect(writeEvidence).toHaveBeenCalledWith({
      evidence,
      outputDirectory: path.join(testRepoRoot, "outputs", "aws-staging"),
      trustedRoot: testRepoRoot,
      trustedRootIdentity: guardedRuntimeArtifact.evidenceTrustedRootIdentity
    });
    expect(aws.dispose).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({
      gate: "aws-staging-environment-acceptance",
      status: "passed",
      evidenceFile: "outputs/aws-staging/environment-acceptance.json",
      applicationDeployed: false,
      migrationRun: false,
      seedRun: false,
      dnsModified: false,
      businessDataMutation: false
    });
  });

  it("refuses runtime attestation failure before acceptance creates an AWS adapter", async () => {
    const { main } = await import("./aws-staging-verify.mjs");
    const createAwsCliImpl = vi.fn();
    await expect(main(["--source-revision", runtimeSourceRevision], {
      captureRuntimeArtifactImpl: vi.fn(async () => {
        throw new Error("AWS Staging approved runtime closure became dirty");
      }),
      createAwsCliImpl
    })).rejects.toThrow(/runtime closure.*dirty/i);
    expect(createAwsCliImpl).not.toHaveBeenCalled();
  });

  it("refuses template capture failure before acceptance creates an AWS adapter", async () => {
    const { main } = await import("./aws-staging-verify.mjs");
    const createAwsCliImpl = vi.fn(async () => ({ dispose: vi.fn(async () => undefined) }));
    await expect(main(["--source-revision", runtimeSourceRevision], {
      captureRuntimeArtifactImpl: vi.fn(async () => runtimeArtifact),
      parseAwsStagingBoundArgsImpl: vi.fn(() => ({ sourceRevision: runtimeSourceRevision })),
      resolveAwsStagingConfigImpl: vi.fn(() => config),
      captureTemplateArtifactImpl: vi.fn(async () => {
        throw new Error("AWS Staging tracked template became dirty");
      }),
      createAwsCliImpl,
      verifyAwsStagingEnvironmentImpl: vi.fn(async () => Object.freeze({ gate: "unexpected" }))
    })).rejects.toThrow(/template.*dirty/i);
    expect(createAwsCliImpl).not.toHaveBeenCalled();
  });
});
