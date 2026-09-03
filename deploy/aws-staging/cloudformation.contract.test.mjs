import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "cloudformation.yml"), "utf8");

function topLevelSection(name) {
  const match = new RegExp(`^${name}:\\n`, "m").exec(source);
  if (!match) throw new Error(`Missing top-level ${name} section`);
  const rest = source.slice(match.index + match[0].length);
  const next = rest.search(/^\S[^\n]*:\n/m);
  return next < 0 ? rest : rest.slice(0, next);
}

function mappingEntry(section, name, indent = 2) {
  const marker = `${" ".repeat(indent)}${name}:\n`;
  const start = section.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name} mapping entry`);
  const rest = section.slice(start + marker.length);
  const next = rest.search(new RegExp(`^ {${indent}}[A-Za-z][A-Za-z0-9]*:\\n`, "m"));
  return next < 0 ? rest : rest.slice(0, next);
}

function between(block, startMarker, endMarker) {
  const start = block.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing block marker ${startMarker.trim()}`);
  const rest = block.slice(start + startMarker.length);
  const end = rest.indexOf(endMarker);
  if (end < 0) throw new Error(`Missing block marker ${endMarker.trim()}`);
  return rest.slice(0, end);
}

function compactLines(block) {
  return block.split("\n").map((line) => line.trim()).filter(Boolean);
}

function after(block, marker) {
  const start = block.indexOf(marker);
  if (start < 0) throw new Error(`Missing block marker ${marker.trim()}`);
  return block.slice(start + marker.length);
}

const resources = topLevelSection("Resources");
const resourceBlock = (name) => mappingEntry(resources, name);

function policyStatement(role, sid) {
  const marker = `              - Sid: ${sid}\n`;
  const start = role.indexOf(marker);
  if (start < 0) throw new Error(`Missing IAM statement ${sid}`);
  const rest = role.slice(start + marker.length);
  const next = rest.search(/^              - Sid:/m);
  const tags = rest.indexOf("\n      Tags:\n");
  const ends = [next, tags].filter((index) => index >= 0);
  return ends.length === 0 ? rest : rest.slice(0, Math.min(...ends));
}

function literalProperty(block, name, indent = 6) {
  const marker = `${" ".repeat(indent)}${name}: |\n`;
  const start = block.indexOf(marker);
  if (start < 0) throw new Error(`Missing literal property ${name}`);
  const rest = block.slice(start + marker.length);
  const next = rest.search(new RegExp(`^ {${indent}}[A-Za-z][A-Za-z0-9]*:`, "m"));
  const literal = next < 0 ? rest : rest.slice(0, next);
  return literal.split("\n").map((line) => line.slice(indent + 2)).join("\n");
}

const listTags = `      Tags:
        - Key: Project
          Value: needo
        - Key: Environment
          Value: staging
        - Key: Owner
          Value: !Ref Owner
        - Key: ManagedBy
          Value: cloudformation`;

describe("AWS Staging CloudFormation contract", () => {
  it("locks stack creation to ap-northeast-1 with a CloudFormation rule", () => {
    const rule = mappingEntry(topLevelSection("Rules"), "RequireTokyoRegion");
    expect(compactLines(rule)).toEqual([
      "Assertions:",
      "- Assert:",
      "Fn::Equals:",
      "- !Ref AWS::Region",
      "- ap-northeast-1",
      "AssertDescription: NeeDo Staging must be deployed in ap-northeast-1",
    ]);
  });

  it("pins the ARM environment and propagates tags to the root volume", () => {
    const instance = resourceBlock("Instance");
    const dataVolume = resourceBlock("DataVolume");
    expect(source).toContain("al2023-ami-kernel-default-arm64");
    expect(instance).toContain("      InstanceType: t4g.large");
    expect(instance).toContain("            VolumeSize: 30");
    expect(instance).toContain("      PropagateTagsToVolumeOnCreation: true");
    expect(dataVolume).toContain("      Size: 70");
    expect(instance).toContain("            Encrypted: true");
    expect(dataVolume).toContain("      Encrypted: true");
    expect(instance).toContain("        HttpTokens: required");
  });

  it("has no SSH key and exposes only HTTP and HTTPS", () => {
    const instance = resourceBlock("Instance");
    const securityGroup = resourceBlock("WebSecurityGroup");
    expect(instance).not.toMatch(/KeyName:|UserData:/);
    const ingress = between(securityGroup, "      SecurityGroupIngress:\n", "      SecurityGroupEgress:\n");
    expect(compactLines(ingress)).toEqual([
      "- IpProtocol: tcp", "FromPort: 80", "ToPort: 80", "CidrIp: 0.0.0.0/0",
      "Description: Lets Encrypt HTTP-01 and redirect readiness",
      "- IpProtocol: tcp", "FromPort: 443", "ToPort: 443", "CidrIp: 0.0.0.0/0",
      "Description: Public HTTPS",
    ]);
    expect(securityGroup).not.toMatch(/FromPort: (22|3000|3306|6379)/);
  });

  it("keeps data and object storage encrypted and recoverable", () => {
    expect(resourceBlock("DataVolume")).toContain("  DeletionPolicy: Snapshot");
    expect(resourceBlock("DataVolume")).toContain("  UpdateReplacePolicy: Snapshot");
    for (const name of ["ReleaseBucket", "BackupBucket"]) {
      const bucket = resourceBlock(name);
      expect(bucket).toContain("  DeletionPolicy: Retain");
      expect(bucket).toContain("  UpdateReplacePolicy: Retain");
      expect(bucket).toContain("        BlockPublicAcls: true");
      expect(bucket).toContain("              SSEAlgorithm: AES256");
      expect(bucket).toContain("        Status: Enabled");
    }
  });

  it("creates an empty secret and never embeds a value", () => {
    const secret = resourceBlock("ApplicationSecret");
    expect(secret).toContain("    Type: AWS::SecretsManager::Secret");
    expect(secret).not.toMatch(/SecretString:|GenerateSecretString:/);
    expect(source).not.toMatch(/JWT_|DATABASE_URL|REDIS_PASSWORD|password/i);
  });

  it("gives every taggable resource the exact four mandatory tags", () => {
    const listTagResources = [
      "Vpc", "InternetGateway", "PublicSubnet", "PublicRouteTable", "WebSecurityGroup",
      "ReleaseBucket", "BackupBucket", "ApplicationSecret", "SystemLogGroup", "DockerLogGroup",
      "InstanceRole", "Instance", "ElasticIp", "DataVolume", "AlertTopic",
      "StatusCheckFailedAlarm", "HighMemoryAlarm", "RootDiskHighAlarm", "DataDiskHighAlarm",
      "HostBootstrapDocument", "HostVerificationDocument",
    ];
    for (const name of listTagResources) {
      const block = resourceBlock(name);
      expect(block, name).toContain(listTags);
      expect(block.match(/(?:^|\n)      Tags:/g), name).toHaveLength(1);
      expect(compactLines(after(block, "      Tags:\n")), name).toEqual([
        "- Key: Project", "Value: needo", "- Key: Environment", "Value: staging",
        "- Key: Owner", "Value: !Ref Owner", "- Key: ManagedBy", "Value: cloudformation",
      ]);
    }
    const parameter = resourceBlock("CloudWatchAgentConfigParameter");
    expect(parameter).toContain(`      Tags:
        Project: needo
        Environment: staging
        Owner: !Ref Owner
        ManagedBy: cloudformation`);
    expect(compactLines(after(parameter, "      Tags:\n"))).toEqual([
      "Project: needo", "Environment: staging", "Owner: !Ref Owner", "ManagedBy: cloudformation",
    ]);
    const budget = resourceBlock("MonthlyBudget");
    expect(budget).toContain(`      ResourceTags:
        - Key: Project
          Value: needo
        - Key: Environment
          Value: staging
        - Key: Owner
          Value: !Ref Owner
        - Key: ManagedBy
          Value: cloudformation`);
    expect(compactLines(after(budget, "      ResourceTags:\n"))).toEqual([
      "- Key: Project", "Value: needo", "- Key: Environment", "Value: staging",
      "- Key: Owner", "Value: !Ref Owner", "- Key: ManagedBy", "Value: cloudformation",
    ]);
  });

  it("keeps the instance role on the exact least-privilege contract", () => {
    const role = resourceBlock("InstanceRole");
    expect(compactLines(between(role, "      ManagedPolicyArns:\n", "      Policies:\n"))).toEqual([
      "- arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    ]);
    expect([...role.matchAll(/^              - Sid: ([A-Za-z0-9]+)$/gm)].map((match) => match[1])).toEqual([
      "ReadOnlyApplicationSecret", "ReadReleaseObjects", "ListReleasePrefix",
      "ReadWriteBackupPrefixes", "ListBackupPrefixes", "PublishHostMetrics",
      "ReadCloudWatchAgentConfig", "WriteHostLogs",
    ]);
    const expectedStatements = {
      ReadOnlyApplicationSecret: ["Effect: Allow", "Action: secretsmanager:GetSecretValue", "Resource: !Ref ApplicationSecret"],
      ReadReleaseObjects: ["Effect: Allow", "Action: s3:GetObject", "Resource: !Sub ${ReleaseBucket.Arn}/releases/*"],
      ListReleasePrefix: ["Effect: Allow", "Action: s3:ListBucket", "Resource: !GetAtt ReleaseBucket.Arn", "Condition:", "StringLike:", "s3:prefix: releases/*"],
      ReadWriteBackupPrefixes: ["Effect: Allow", "Action:", "- s3:GetObject", "- s3:PutObject", "- s3:AbortMultipartUpload", "Resource:", "- !Sub ${BackupBucket.Arn}/staging/daily/*", "- !Sub ${BackupBucket.Arn}/staging/pre-migration/*"],
      ListBackupPrefixes: ["Effect: Allow", "Action: s3:ListBucket", "Resource: !GetAtt BackupBucket.Arn", "Condition:", "StringLike:", "s3:prefix:", "- staging/daily/*", "- staging/pre-migration/*"],
      PublishHostMetrics: ["Effect: Allow", "Action: cloudwatch:PutMetricData", 'Resource: "*"', "Condition:", "StringEquals:", "cloudwatch:namespace: Needo/Staging"],
      ReadCloudWatchAgentConfig: ["Effect: Allow", "Action: ssm:GetParameter", "Resource: !Sub arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/needo/staging/cloudwatch-agent"],
    };
    for (const [sid, expected] of Object.entries(expectedStatements)) {
      expect(compactLines(policyStatement(role, sid)), sid).toEqual(expected);
    }
    expect(compactLines(policyStatement(role, "WriteHostLogs"))).toEqual([
      "Effect: Allow", "Action:", "- logs:CreateLogStream", "- logs:DescribeLogStreams",
      "- logs:PutLogEvents", "Resource:", "- !GetAtt SystemLogGroup.Arn", "- !GetAtt DockerLogGroup.Arn",
    ]);
    expect(role).not.toMatch(/secretsmanager:ListSecrets|Action: s3:\*|(?:Action:\s+|- )(?:iam|ec2|cloudformation|route53|kms):/i);
  });

  it("uses journald for AL2023 system logs without fabricated file sources", () => {
    const config = JSON.parse(literalProperty(resourceBlock("CloudWatchAgentConfigParameter"), "Value"));
    expect(config.logs.logs_collected).toEqual({
      journald: {
        collect_list: [{
          log_group_name: "/needo/staging/system",
          log_stream_name: "{instance_id}",
        }],
      },
    });
    expect(JSON.stringify(config)).not.toContain("retention_in_days");
    expect(source).not.toContain("/var/log/messages");
  });

  it("defines the exact alarm metrics, thresholds, dimensions, and SNS actions", () => {
    const alarms = {
      StatusCheckFailedAlarm: ["AWS/EC2", "StatusCheckFailed", "Maximum", "1", "missing", ["- Name: InstanceId", "Value: !Ref Instance"]],
      HighMemoryAlarm: ["Needo/Staging", "mem_used_percent", "Average", "85", "breaching", ["- Name: InstanceId", "Value: !Ref Instance"]],
      RootDiskHighAlarm: ["Needo/Staging", "disk_used_percent", "Average", "80", "breaching", ["- Name: InstanceId", "Value: !Ref Instance", "- Name: path", "Value: /", "- Name: fstype", "Value: xfs"]],
      DataDiskHighAlarm: ["Needo/Staging", "disk_used_percent", "Average", "80", "breaching", ["- Name: InstanceId", "Value: !Ref Instance", "- Name: path", "Value: /srv/needo", "- Name: fstype", "Value: xfs"]],
    };
    for (const [name, [namespace, metric, statistic, threshold, missing, dimensions]] of Object.entries(alarms)) {
      const alarm = resourceBlock(name);
      for (const line of [
        `Namespace: ${namespace}`, `MetricName: ${metric}`, `Statistic: ${statistic}`,
        "ComparisonOperator: GreaterThanOrEqualToThreshold", `Threshold: ${threshold}`,
        "EvaluationPeriods: 2", "DatapointsToAlarm: 2", "Period: 300", `TreatMissingData: ${missing}`,
      ]) expect(alarm, `${name} ${line}`).toContain(`      ${line}`);
      expect(compactLines(between(alarm, "      Dimensions:\n", "      AlarmActions:\n"))).toEqual(dimensions);
      expect(compactLines(between(alarm, "      AlarmActions:\n", "      Tags:\n"))).toEqual(["- !Ref AlertTopic"]);
    }
  });

  it("creates the exact five percentage budget notifications", () => {
    const budget = resourceBlock("MonthlyBudget");
    expect(budget).toContain("          Amount: !Ref BudgetAmount");
    expect(budget).toContain("          Unit: !Ref BudgetUnit");
    const notificationSource = between(budget, "      NotificationsWithSubscribers:\n", "      ResourceTags:\n");
    const notifications = notificationSource.split("        - Notification:\n").slice(1).map(compactLines);
    expect(notifications).toEqual([
      ["ACTUAL", "75"], ["FORECASTED", "90"], ["ACTUAL", "90"],
      ["FORECASTED", "100"], ["ACTUAL", "100"],
    ].map(([type, threshold]) => [
      "ComparisonOperator: GREATER_THAN", `NotificationType: ${type}`, `Threshold: ${threshold}`,
      "ThresholdType: PERCENTAGE", "Subscribers:", "- Address: !Ref AlertEmail", "SubscriptionType: EMAIL",
    ]));
  });

  it("targets both SSM documents only at EC2 instances", () => {
    for (const name of ["HostBootstrapDocument", "HostVerificationDocument"]) {
      expect(resourceBlock(name).match(/^      TargetType: \/AWS::EC2::Instance$/gm) ?? [], name).toHaveLength(1);
    }
    expect(resourceBlock("HostVerificationDocument")).not.toContain("        parameters:");
  });

  it("contains host bootstrap only and excludes application deployment", () => {
    expect([...resources.matchAll(/^    Type: AWS::SSM::Document$/gm)]).toHaveLength(2);
    expect(resourceBlock("HostBootstrapDocument")).toContain("/srv/needo/media/customer-avatars");
    expect(resourceBlock("HostBootstrapDocument")).toContain("findmnt");
    expect(source).not.toMatch(/docker compose|prisma|seed|migrate deploy|certbot|nginx|Route53|AWS::Route53/i);
  });

  it("contains no forbidden infrastructure resource types", () => {
    const resourceTypes = [...resources.matchAll(/^    Type: (AWS::[^\n]+)$/gm)].map((match) => match[1]);
    for (const forbidden of [
      "AWS::EC2::NatGateway", "AWS::EC2::KeyPair", "AWS::RDS::", "AWS::ElastiCache::",
      "AWS::ECS::", "AWS::ElasticLoadBalancing", "AWS::Route53::", "AWS::CertificateManager::",
    ]) expect(resourceTypes.some((type) => type.startsWith(forbidden)), forbidden).toBe(false);
  });

  it("exports exactly the ten approved non-secret outputs", () => {
    const outputs = topLevelSection("Outputs");
    const expected = {
      InstanceId: "!Ref Instance", ElasticIp: "!Ref ElasticIp", DataVolumeId: "!Ref DataVolume",
      ReleaseBucketName: "!Ref ReleaseBucket", BackupBucketName: "!Ref BackupBucket",
      ApplicationSecretArn: "!Ref ApplicationSecret", HostBootstrapDocumentName: "!Ref HostBootstrapDocument",
      HostVerificationDocumentName: "!Ref HostVerificationDocument",
      CloudWatchAgentConfigParameterName: "!Ref CloudWatchAgentConfigParameter", BudgetName: "!Ref MonthlyBudget",
    };
    expect([...outputs.matchAll(/^  ([A-Za-z][A-Za-z0-9]*):$/gm)].map((match) => match[1])).toEqual(Object.keys(expected));
    for (const [name, value] of Object.entries(expected)) {
      expect(compactLines(mappingEntry(outputs, name))).toEqual([`Value: ${value}`]);
    }
  });
});
