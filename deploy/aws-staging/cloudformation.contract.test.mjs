import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AWS_STAGING_BOOTSTRAP_DOCUMENT_CONTENT,
  AWS_STAGING_CLOUDWATCH_AGENT_CONFIG,
  AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT
} from "../../scripts/aws-staging-attestation.mjs";

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

function documentRunCommand(block) {
  const marker = "                - |\n";
  const start = block.indexOf(marker);
  if (start < 0) throw new Error("Missing document runCommand literal");
  const rest = block.slice(start + marker.length);
  const end = rest.indexOf("      Tags:\n");
  if (end < 0) throw new Error("Missing document Tags boundary");
  return rest.slice(0, end).split("\n").map((line) => line.slice(18)).join("\n");
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
  it("locks stack creation to the explicit approved region", () => {
    const parameters = topLevelSection("Parameters");
    const expectedRegion = mappingEntry(parameters, "ExpectedRegion");
    expect(compactLines(expectedRegion)).toEqual([
      "Type: String",
      "AllowedValues:",
      "- ap-northeast-1",
      "- ap-southeast-2"
    ]);

    const rule = mappingEntry(topLevelSection("Rules"), "RequireExpectedRegion");
    expect(compactLines(rule)).toEqual([
      "Assertions:",
      "- Assert:",
      "Fn::Equals:",
      "- !Ref AWS::Region",
      "- !Ref ExpectedRegion",
      "AssertDescription: NeeDo Staging region must match ExpectedRegion"
    ]);
  });

  it("locks stack creation to the explicit expected account", () => {
    const parameters = topLevelSection("Parameters");
    const expectedAccountId = mappingEntry(parameters, "ExpectedAccountId");
    expect(compactLines(expectedAccountId)).toEqual([
      "Type: String",
      "AllowedPattern: \"^[0-9]{12}$\""
    ]);

    const rule = mappingEntry(topLevelSection("Rules"), "RequireExpectedAccountId");
    expect(compactLines(rule)).toEqual([
      "Assertions:",
      "- Assert:",
      "Fn::Equals:",
      "- !Ref AWS::AccountId",
      "- !Ref ExpectedAccountId",
      "AssertDescription: NeeDo Staging account must match ExpectedAccountId"
    ]);
  });

  it("pins the free-plan ARM staging environment and propagates tags to the root volume", () => {
    const instance = resourceBlock("Instance");
    const dataVolume = resourceBlock("DataVolume");
    expect(source).toContain("al2023-ami-kernel-default-arm64");
    expect(instance).toContain("      InstanceType: t4g.small");
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
    for (const name of ["ReleaseBucketPolicy", "BackupBucketPolicy"]) {
      const policy = resourceBlock(name);
      expect(policy).toContain("  DeletionPolicy: Retain");
      expect(policy).toContain("  UpdateReplacePolicy: Retain");
      expect(policy).toContain('          aws:SecureTransport: "false"');
      expect(policy).toContain("        Effect: Deny");
      expect(policy).toContain('        Principal: "*"');
    }
  });

  it("keeps every CloudWatch alarm action explicitly enabled", () => {
    for (const name of [
      "StatusCheckFailedAlarm", "HighMemoryAlarm", "RootDiskHighAlarm", "DataDiskHighAlarm"
    ]) {
      expect(resourceBlock(name), name).toContain("      ActionsEnabled: true");
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
      "ReadAccountSyncObjects", "ReadWriteBackupPrefixes", "ListBackupPrefixes", "PublishHostMetrics",
      "ReadCloudWatchAgentConfig", "WriteHostLogs",
    ]);
    const expectedStatements = {
      ReadOnlyApplicationSecret: ["Effect: Allow", "Action: secretsmanager:GetSecretValue", "Resource: !Ref ApplicationSecret"],
      ReadReleaseObjects: ["Effect: Allow", "Action: s3:GetObject", "Resource: !Sub ${ReleaseBucket.Arn}/staging/releases/*"],
      ListReleasePrefix: ["Effect: Allow", "Action: s3:ListBucket", "Resource: !GetAtt ReleaseBucket.Arn", "Condition:", "StringLike:", "s3:prefix: staging/releases/*"],
      ReadAccountSyncObjects: ["Effect: Allow", "Action:", "- s3:GetObjectVersion", "- s3:DeleteObjectVersion", "Resource: !Sub ${ReleaseBucket.Arn}/staging/account-sync/*"],
      ReadWriteBackupPrefixes: ["Effect: Allow", "Action:", "- s3:GetObject", "- s3:GetObjectVersion", "- s3:PutObject", "- s3:AbortMultipartUpload", "Resource:", "- !Sub ${BackupBucket.Arn}/staging/daily/*", "- !Sub ${BackupBucket.Arn}/staging/pre-migration/*", "- !Sub ${BackupBucket.Arn}/staging/pre-account-sync/*"],
      ListBackupPrefixes: ["Effect: Allow", "Action: s3:ListBucket", "Resource: !GetAtt BackupBucket.Arn", "Condition:", "StringLike:", "s3:prefix:", "- staging/daily/*", "- staging/pre-migration/*", "- staging/pre-account-sync/*"],
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
    expect(config).toEqual(AWS_STAGING_CLOUDWATCH_AGENT_CONFIG);
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

  it("upgrades old ARM64 CloudWatch Agent packages through the signed AWS distribution", () => {
    const bootstrap = resourceBlock("HostBootstrapDocument");
    const verification = resourceBlock("HostVerificationDocument");
    const minimumVersion = "1.300070.0";
    const fingerprint = "937616F3450B7D806CBD9725D58167303B789C72";
    const distribution = "https://amazoncloudwatch-agent-ap-southeast-2.s3.ap-southeast-2.amazonaws.com/amazon_linux/arm64/latest";

    expect(bootstrap).toContain(`cloudwatch_agent_minimum_version=${minimumVersion}`);
    expect(bootstrap).toContain(`cloudwatch_agent_distribution=${distribution}`);
    expect(bootstrap).toContain('"$cloudwatch_agent_distribution/amazon-cloudwatch-agent.rpm"');
    expect(bootstrap).toContain('"$cloudwatch_agent_distribution/amazon-cloudwatch-agent.rpm.sig"');
    expect(bootstrap).toContain("https://amazoncloudwatch-agent.s3.amazonaws.com/assets/amazon-cloudwatch-agent.gpg");
    expect(bootstrap).toContain(`test \"$cloudwatch_agent_fingerprint\" = \"${fingerprint}\"`);
    expect(bootstrap).toContain('gpg --homedir "$cloudwatch_agent_gnupg_home" --batch --no-autostart --import');
    expect(bootstrap).toContain('gpg --homedir "$cloudwatch_agent_gnupg_home" --batch --no-autostart --verify');
    expect(bootstrap).toContain("dnf install -y docker amazon-cloudwatch-agent curl-minimal gnupg2-minimal");
    expect(bootstrap).not.toContain("dnf install -y docker amazon-cloudwatch-agent curl gnupg2");
    expect(bootstrap).toContain('dnf remove -y amazon-cloudwatch-agent');
    expect(verification).toContain(`cloudwatch_agent_minimum_version=${minimumVersion}`);
    expect(verification).toContain("sort -V");
  });

  it("installs the pinned ARM64 Docker Compose plugin with its release digest", () => {
    const bootstrap = resourceBlock("HostBootstrapDocument");
    const verification = resourceBlock("HostVerificationDocument");
    const composeVersion = "5.5.1";
    const composeSha256 = "732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7";
    const composeUrl = `https://github.com/docker/compose/releases/download/v${composeVersion}/docker-compose-linux-aarch64`;

    expect(bootstrap).toContain(`compose_version=${composeVersion}`);
    expect(bootstrap).toContain(`compose_sha256=${composeSha256}`);
    expect(bootstrap).toContain(`compose_url=${composeUrl}`);
    expect(bootstrap).toContain("compose_plugin=/usr/local/lib/docker/cli-plugins/docker-compose");
    expect(bootstrap).toContain("sha256sum -c -");
    expect(bootstrap).toContain('install -m 0755 "$compose_tmp" "$compose_plugin"');
    expect(bootstrap).toContain('test "$(docker compose version --short)" = "$compose_version"');
    expect(bootstrap).not.toMatch(/docker\/compose\/releases\/latest/);
    expect(verification).toContain(`compose_version=${composeVersion}`);
    expect(verification).toContain('test "$(docker compose version --short)" = "$compose_version"');
  });

  it("installs the pinned ARM64 Docker Buildx plugin with its release digest", () => {
    const bootstrap = resourceBlock("HostBootstrapDocument");
    const verification = resourceBlock("HostVerificationDocument");
    const buildxVersion = "0.37.0";
    const buildxSha256 = "d263ce31bd2c9e9210aaa2c7537c67802bccabcd342e4c9fe4907085ddb41aa5";
    const buildxUrl = `https://github.com/docker/buildx/releases/download/v${buildxVersion}/buildx-v${buildxVersion}.linux-arm64`;

    expect(bootstrap).toContain(`buildx_version=${buildxVersion}`);
    expect(bootstrap).toContain(`buildx_sha256=${buildxSha256}`);
    expect(bootstrap).toContain(`buildx_url=${buildxUrl}`);
    expect(bootstrap).toContain("buildx_plugin=/usr/local/lib/docker/cli-plugins/docker-buildx");
    expect(bootstrap).toContain('install -m 0755 "$buildx_tmp" "$buildx_plugin"');
    expect(bootstrap).toContain('test "$(docker buildx version | awk \'{print $2}\' | sed \'s/^v//\')" = "$buildx_version"');
    expect(bootstrap).not.toMatch(/docker\/buildx\/releases\/latest/);
    expect(verification).toContain(`buildx_version=${buildxVersion}`);
    expect(verification).toContain('test "$(docker buildx version | awk \'{print $2}\' | sed \'s/^v//\')" = "$buildx_version"');
  });

  it("provisions a fixed two GiB persistent swap file without sparse allocation", () => {
    const bootstrap = resourceBlock("HostBootstrapDocument");
    const verification = resourceBlock("HostVerificationDocument");

    expect(bootstrap).toContain("swapfile=/var/lib/needo/swapfile");
    expect(bootstrap).toContain("swap_size_mib=2048");
    expect(bootstrap).toContain('dd if=/dev/zero of="$swapfile" bs=1M count="$swap_size_mib" status=none');
    expect(bootstrap).toContain('chmod 0600 "$swapfile"');
    expect(bootstrap).toContain('mkswap "$swapfile"');
    expect(bootstrap).toContain('swapon "$swapfile"');
    expect(bootstrap).toContain("/var/lib/needo/swapfile none swap defaults,nofail 0 0");
    expect(bootstrap).not.toContain("fallocate");
    expect(verification).toContain("swapfile=/var/lib/needo/swapfile");
    expect(verification).toContain('swapon --show=NAME --noheadings --raw');
  });

  it("gives the backend exact write ownership on every persistent media directory", () => {
    const bootstrap = resourceBlock("HostBootstrapDocument");
    const verification = resourceBlock("HostVerificationDocument");
    const mediaPaths = [
      "media/customer-avatars",
      "media/identity-applications",
      "media/im-media",
      "media/content-media"
    ];

    expect(bootstrap).toContain("install -d -m 0750 -o 1000 -g 1000 \\");
    for (const mediaPath of mediaPaths) {
      expect(bootstrap).toContain(`\"$mountpoint/${mediaPath}\"`);
      expect(verification).toContain(`test \"$(stat -c '%u:%g %a' /srv/needo/${mediaPath})\" = \"1000:1000 750\"`);
    }
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
      expect(resourceBlock(name).match(/^      UpdateMethod: NewVersion$/gm) ?? [], name).toHaveLength(1);
    }
    expect(resourceBlock("HostVerificationDocument")).not.toContain("        parameters:");
  });

  it("keeps the executable SSM content synchronized with the attestation contract", () => {
    const bootstrap = resourceBlock("HostBootstrapDocument");
    const verification = resourceBlock("HostVerificationDocument");
    expect(documentRunCommand(bootstrap)).toBe(
      AWS_STAGING_BOOTSTRAP_DOCUMENT_CONTENT.mainSteps[0].inputs.runCommand[0]
    );
    expect(documentRunCommand(verification)).toBe(
      AWS_STAGING_VERIFICATION_DOCUMENT_CONTENT.mainSteps[0].inputs.runCommand[0]
    );
    expect(bootstrap).toContain("          CloudWatchAgentConfigParameterVersion:");
    expect(bootstrap).toContain('            allowedPattern: "^[1-9][0-9]*$"');
    expect(bootstrap).toContain("cloudwatch_parameter_version='{{ CloudWatchAgentConfigParameterVersion }}'");
    expect(bootstrap).toContain('-c "ssm:$cloudwatch_parameter:$cloudwatch_parameter_version"');
  });

  it("contains host bootstrap only and excludes application deployment", () => {
    expect([...resources.matchAll(/^    Type: AWS::SSM::Document$/gm)]).toHaveLength(2);
    expect(resourceBlock("HostBootstrapDocument")).toContain("/srv/needo/media/customer-avatars");
    expect(resourceBlock("HostBootstrapDocument")).toContain("findmnt");
    expect(source).not.toMatch(/docker compose (?:build|run|up|down)|prisma|seed|migrate deploy|certbot|nginx|Route53|AWS::Route53/i);
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
