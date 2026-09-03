import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  deployAwsStagingInfrastructure
} from "./aws-staging-deploy-lib.mjs";
import {
  runAwsStagingDeployCli,
  writeAwsStagingEnvironmentEvidence
} from "./aws-staging-deploy.mjs";

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

const outputValues = Object.freeze({
  InstanceId: "i-0123456789abcdef0",
  ElasticIp: "203.0.113.10",
  DataVolumeId: "vol-0123456789abcdef0",
  ReleaseBucketName: "needo-release-example",
  BackupBucketName: "needo-backup-example",
  ApplicationSecretArn: "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:/needo/staging/application-AbCdEf",
  HostBootstrapDocumentName: "needo-staging-host-bootstrap",
  HostVerificationDocumentName: "needo-staging-host-verification",
  CloudWatchAgentConfigParameterName: "/needo/staging/cloudwatch-agent",
  BudgetName: "needo-staging-infrastructure-monthly-cost"
});
const stackId = "arn:aws:cloudformation:ap-northeast-1:123456789012:stack/needo-staging-infrastructure/00000000-0000-4000-8000-000000000000";
const templateBody = "AWSTemplateFormatVersion: \"2010-09-09\"\n";
const templateSha256 = createHash("sha256").update(templateBody, "utf8").digest("hex");
const templateRevision = "0123456789abcdef0123456789abcdef01234567";
const stackTags = Object.freeze([
  { Key: "Project", Value: "needo" },
  { Key: "Environment", Value: "staging" },
  { Key: "Owner", Value: "needo" },
  { Key: "ManagedBy", Value: "cloudformation" }
]);
const expectedResources = Object.freeze([
  ["Vpc", "AWS::EC2::VPC", "vpc-0123456789abcdef0"],
  ["InternetGateway", "AWS::EC2::InternetGateway", "igw-0123456789abcdef0"],
  ["InternetGatewayAttachment", "AWS::EC2::VPCGatewayAttachment", "attachment"],
  ["PublicSubnet", "AWS::EC2::Subnet", "subnet-0123456789abcdef0"],
  ["PublicRouteTable", "AWS::EC2::RouteTable", "rtb-0123456789abcdef0"],
  ["DefaultPublicRoute", "AWS::EC2::Route", "route"],
  ["PublicSubnetRouteTableAssociation", "AWS::EC2::SubnetRouteTableAssociation", "rtbassoc-0123456789abcdef0"],
  ["WebSecurityGroup", "AWS::EC2::SecurityGroup", "sg-0123456789abcdef0"],
  ["ReleaseBucket", "AWS::S3::Bucket", outputValues.ReleaseBucketName],
  ["ReleaseBucketPolicy", "AWS::S3::BucketPolicy", outputValues.ReleaseBucketName],
  ["BackupBucket", "AWS::S3::Bucket", outputValues.BackupBucketName],
  ["BackupBucketPolicy", "AWS::S3::BucketPolicy", outputValues.BackupBucketName],
  ["ApplicationSecret", "AWS::SecretsManager::Secret", outputValues.ApplicationSecretArn],
  ["SystemLogGroup", "AWS::Logs::LogGroup", "/needo/staging/system"],
  ["DockerLogGroup", "AWS::Logs::LogGroup", "/needo/staging/docker"],
  ["InstanceRole", "AWS::IAM::Role", "needo-staging-instance-role"],
  ["InstanceProfile", "AWS::IAM::InstanceProfile", "needo-staging-instance-profile"],
  ["Instance", "AWS::EC2::Instance", outputValues.InstanceId],
  ["ElasticIp", "AWS::EC2::EIP", "eipalloc-0123456789abcdef0"],
  ["ElasticIpAssociation", "AWS::EC2::EIPAssociation", "eipassoc-0123456789abcdef0"],
  ["DataVolume", "AWS::EC2::Volume", outputValues.DataVolumeId],
  ["DataVolumeAttachment", "AWS::EC2::VolumeAttachment", "volume-attachment"],
  ["AlertTopic", "AWS::SNS::Topic", "arn:aws:sns:ap-northeast-1:123456789012:needo-staging-alert"],
  ["AlertSubscription", "AWS::SNS::Subscription", "arn:aws:sns:ap-northeast-1:123456789012:needo-staging-alert:00000000-0000-4000-8000-000000000000"],
  ["CloudWatchAgentConfigParameter", "AWS::SSM::Parameter", outputValues.CloudWatchAgentConfigParameterName],
  ["StatusCheckFailedAlarm", "AWS::CloudWatch::Alarm", "needo-staging-status"],
  ["HighMemoryAlarm", "AWS::CloudWatch::Alarm", "needo-staging-memory"],
  ["RootDiskHighAlarm", "AWS::CloudWatch::Alarm", "needo-staging-root-disk"],
  ["DataDiskHighAlarm", "AWS::CloudWatch::Alarm", "needo-staging-data-disk"],
  ["MonthlyBudget", "AWS::Budgets::Budget", outputValues.BudgetName],
  ["HostBootstrapDocument", "AWS::SSM::Document", outputValues.HostBootstrapDocumentName],
  ["HostVerificationDocument", "AWS::SSM::Document", outputValues.HostVerificationDocumentName]
]);

function evidenceFixture(overrides = {}) {
  return {
    scope: "environment-only",
    timestamp: "2026-09-04T00:00:00.000Z",
    accountId: config.accountId,
    region: config.region,
    hostname: config.hostname,
    stackId,
    stackName: config.stackName,
    stackStatus: "CREATE_COMPLETE",
    templateSha256: "a".repeat(64),
    sourceRevision: templateRevision,
    resourceIdentitySha256: "b".repeat(64),
    resourceCount: expectedResources.length,
    stackTags: Object.fromEntries(stackTags.map(({ Key, Value }) => [Key, Value])),
    outputs: {
      ...outputValues,
      ApplicationSecretArn: "REDACTED"
    },
    instance: {
      instanceId: outputValues.InstanceId,
      instanceType: "t4g.large",
      state: "running"
    },
    applicationDeployed: false,
    migrationRun: false,
    seedRun: false,
    dnsModified: false,
    ...overrides
  };
}

function stackResult({ status = "CREATE_COMPLETE", outputs = outputValues, stackOverrides = {} } = {}) {
  return {
    Stacks: [{
      StackId: stackId,
      StackName: config.stackName,
      StackStatus: status,
      Tags: stackTags,
      Outputs: Object.entries(outputs).map(([OutputKey, OutputValue]) => ({
        OutputKey,
        OutputValue
      })),
      ...stackOverrides
    }]
  };
}

function stackResources(overrides = {}) {
  return {
    StackResourceSummaries: expectedResources.map(([LogicalResourceId, ResourceType, PhysicalResourceId]) => ({
      LogicalResourceId,
      ResourceType,
      PhysicalResourceId,
      ResourceStatus: "CREATE_COMPLETE",
      ...overrides[LogicalResourceId]
    }))
  };
}

function preflight(overrides = {}) {
  return Object.freeze({
    accountId: config.accountId,
    callerArn: "arn:aws:sts::123456789012:assumed-role/NeedoDeployer/session",
    callerKind: "assumed-role",
    hostname: config.hostname,
    region: config.region,
    amiId: "ami-0123",
    amiArchitecture: "arm64",
    templateSha256,
    sourceRevision: templateRevision,
    templateValidation: "VALID",
    stackState: "ABSENT",
    dnsA: Object.freeze(["203.0.113.2", "203.0.113.8"]),
    ...overrides
  });
}

function successfulAws({
  createdStack = { StackId: stackId },
  describedStack = stackResult(),
  listedResources = stackResources(),
  describedAddresses,
  describedInstances,
  trace = []
} = {}) {
  const addressResult = describedAddresses ?? {
    Addresses: [{
      AllocationId: "eipalloc-0123456789abcdef0",
      AssociationId: "eipassoc-0123456789abcdef0",
      Domain: "vpc",
      InstanceId: outputValues.InstanceId,
      PublicIp: outputValues.ElasticIp
    }]
  };
  const instanceResult = describedInstances ?? {
    Reservations: [{
      Instances: [{
        InstanceId: outputValues.InstanceId,
        InstanceType: "t4g.large",
        State: { Name: "running" },
        UserData: "must-not-be-recorded"
      }]
    }]
  };
  return {
    text: vi.fn(async (args) => {
      trace.push(`aws.text:${args[0]} ${args[1]}`);
      return "deployment complete";
    }),
    json: vi.fn(async (args) => {
      trace.push(`aws.json:${args[0]} ${args[1]}`);
      if (args[0] === "cloudformation" && args[1] === "create-stack") return createdStack;
      if (args[0] === "cloudformation" && args[1] === "describe-stacks") return describedStack;
      if (args[0] === "cloudformation" && args[1] === "list-stack-resources") return listedResources;
      if (args[0] === "ec2" && args[1] === "describe-addresses") return addressResult;
      if (args[0] === "ec2" && args[1] === "describe-instances") return instanceResult;
      throw new Error(`Unexpected AWS call: ${args.join(" ")}`);
    })
  };
}

async function deploy({
  aws = successfulAws(),
  preflightResult = preflight(),
  resolveDns,
  resolvedConfig = config,
  templateArtifact = Object.freeze({
    body: templateBody,
    templateSha256,
    sourceRevision: templateRevision,
    assertCurrentState: vi.fn(async () => undefined)
  }),
  readTemplate = vi.fn(async () => templateBody),
  now = () => Date.parse("2026-09-04T00:00:00.000Z")
} = {}) {
  return deployAwsStagingInfrastructure({
    aws,
    config: resolvedConfig,
    resolveDns: resolveDns ?? vi.fn(async () => ["203.0.113.8", "203.0.113.2"]),
    runPreflight: vi.fn(async () => preflightResult),
    templateArtifact,
    readTemplate,
    now
  });
}

describe("AWS Staging CloudFormation deployment", () => {
  it("attests approved template bytes before creating credentials in the deployment CLI", async () => {
    const trace = [];
    const artifact = Object.freeze({
      body: templateBody,
      templateSha256,
      sourceRevision: templateRevision,
      assertCurrentState: vi.fn(async () => undefined)
    });
    const aws = { dispose: vi.fn(async () => trace.push("dispose")) };
    const evidence = evidenceFixture({ templateSha256, sourceRevision: templateRevision });

    const summary = await runAwsStagingDeployCli(["approved"], {
      parseAwsStagingDeployArgsImpl: vi.fn(() => ({
        templateSha256,
        sourceRevision: templateRevision
      })),
      resolveAwsStagingConfigImpl: vi.fn(() => config),
      captureTemplateArtifactImpl: vi.fn(async (input) => {
        trace.push("capture");
        expect(input).toMatchObject({
          templatePath: config.templatePath,
          approvedSha256: templateSha256,
          approvedRevision: templateRevision
        });
        return artifact;
      }),
      createAwsCliImpl: vi.fn(async () => {
        trace.push("credentials");
        return aws;
      }),
      deployInfrastructureImpl: vi.fn(async (input) => {
        trace.push("deploy");
        expect(input).toMatchObject({ aws, config, templateArtifact: artifact });
        return evidence;
      }),
      writeEvidenceImpl: vi.fn(async () => {
        trace.push("evidence");
        return "/repo/outputs/aws-staging/environment-stack.json";
      })
    });

    expect(trace).toEqual(["capture", "credentials", "deploy", "evidence", "dispose"]);
    expect(summary).toMatchObject({ templateSha256, sourceRevision: templateRevision });
  });

  it("does not create credentials when deployment template attestation fails", async () => {
    const createAwsCliImpl = vi.fn();
    await expect(runAwsStagingDeployCli(["approved"], {
      parseAwsStagingDeployArgsImpl: vi.fn(() => ({
        templateSha256,
        sourceRevision: templateRevision
      })),
      resolveAwsStagingConfigImpl: vi.fn(() => config),
      captureTemplateArtifactImpl: vi.fn(async () => {
        throw new Error("AWS Staging tracked template must be clean before approval");
      }),
      createAwsCliImpl
    })).rejects.toThrow(/template must be clean/i);
    expect(createAwsCliImpl).not.toHaveBeenCalled();
  });

  it("keeps the deploy CLI import-safe and redacts injectable and direct failures", () => {
    const cliUrl = new URL("./aws-staging-deploy.mjs", import.meta.url);
    const cliPath = fileURLToPath(cliUrl);
    const sensitive = "AKIAIOSFODNN7EXAMPLE provider-stdout provider-stderr --unsafe-secret";
    const evaluateRunner = [
      `const { runCli } = await import(${JSON.stringify(cliUrl.href)});`,
      "const stdout = []; const stderr = []; const exitCodes = [];",
      `const sensitive = ${JSON.stringify(sensitive)};`,
      "const result = await runCli({",
      "  argv: [sensitive],",
      "  execute: async () => { throw Object.assign(new Error(sensitive), { stdout: sensitive, stderr: sensitive }); },",
      "  writeStdout: (line) => stdout.push(line),",
      "  writeStderr: (line) => stderr.push(line),",
      "  setExitCode: (code) => exitCodes.push(code)",
      "});",
      "process.stdout.write(JSON.stringify({ result, stdout, stderr, exitCodes }));"
    ].join("\n");
    const environment = { PATH: "/path-with-no-aws", LANG: "C", LC_ALL: "C" };

    const imported = spawnSync(process.execPath, [
      "--input-type=module", "--eval", evaluateRunner
    ], { encoding: "utf8", shell: false, env: environment });
    expect(imported.status).toBe(0);
    expect(imported.stderr).toBe("");
    const result = JSON.parse(imported.stdout);
    expect(result).toEqual({
      result: {
        ok: false,
        failure: { gate: "aws-staging-deploy", status: "failed" }
      },
      stdout: [],
      stderr: ["{\"gate\":\"aws-staging-deploy\",\"status\":\"failed\"}"],
      exitCodes: [1]
    });
    expect(imported.stdout).not.toContain(sensitive);

    const direct = spawnSync(process.execPath, [cliPath, "--unsafe", sensitive], {
      encoding: "utf8",
      shell: false,
      env: environment
    });
    expect(direct.status).toBe(1);
    expect(direct.stdout).toBe("");
    expect(direct.stderr).toBe("{\"gate\":\"aws-staging-deploy\",\"status\":\"failed\"}\n");
    expect(`${direct.stdout}${direct.stderr}`).not.toContain(sensitive);
  });

  it("runs preflight in-process and invokes only the exact approved deployment boundary", async () => {
    const trace = [];
    const aws = successfulAws({ trace });
    const resolveDns = vi.fn(async (hostname) => {
      trace.push(`dns:${hostname}`);
      return ["203.0.113.8", "203.0.113.2", "203.0.113.8"];
    });
    const templateArtifact = Object.freeze({
      body: templateBody,
      templateSha256,
      sourceRevision: templateRevision,
      assertCurrentState: vi.fn(async () => undefined)
    });
    const runPreflight = vi.fn(async (input) => {
      trace.push("preflight");
      expect(input).toEqual({ aws, config, resolveDns, templateArtifact });
      return preflight();
    });

    const evidence = await deployAwsStagingInfrastructure({
      aws,
      config,
      resolveDns,
      runPreflight,
      templateArtifact,
      readTemplate: vi.fn(async () => templateBody),
      now: () => Date.parse("2026-09-04T00:00:00.000Z")
    });

    expect(aws.json).toHaveBeenCalledWith([
      "cloudformation", "create-stack",
      "--stack-name", "needo-staging-infrastructure",
      "--template-body", templateBody,
      "--parameters",
      "ParameterKey=ExpectedRegion,ParameterValue=ap-northeast-1",
      "ParameterKey=ExpectedAccountId,ParameterValue=123456789012",
      "ParameterKey=AlertEmail,ParameterValue=ops@example.com",
      "ParameterKey=BudgetAmount,ParameterValue=20000",
      "ParameterKey=BudgetUnit,ParameterValue=JPY",
      "ParameterKey=Owner,ParameterValue=needo",
      "--capabilities", "CAPABILITY_NAMED_IAM",
      "--tags",
      "Key=Project,Value=needo",
      "Key=Environment,Value=staging",
      "Key=Owner,Value=needo",
      "Key=ManagedBy,Value=cloudformation",
      "--on-failure", "DO_NOTHING"
    ]);
    expect(aws.text).toHaveBeenCalledWith([
      "cloudformation", "wait", "stack-create-complete", "--stack-name", stackId
    ]);
    expect(aws.json.mock.calls.slice(1)).toEqual([
      [["cloudformation", "describe-stacks", "--stack-name", stackId]],
      [["cloudformation", "list-stack-resources", "--stack-name", stackId]],
      [["ec2", "describe-addresses", "--allocation-ids", "eipalloc-0123456789abcdef0"]],
      [["ec2", "describe-instances", "--instance-ids", outputValues.InstanceId]]
    ]);
    expect(trace).toEqual([
      "preflight",
      "dns:staging.needo.life",
      "aws.json:cloudformation create-stack",
      "aws.text:cloudformation wait",
      "aws.json:cloudformation describe-stacks",
      "aws.json:cloudformation list-stack-resources",
      "aws.json:ec2 describe-addresses",
      "aws.json:ec2 describe-instances"
    ]);
    expect(evidence).toEqual({
      scope: "environment-only",
      timestamp: "2026-09-04T00:00:00.000Z",
      accountId: config.accountId,
      region: config.region,
      hostname: config.hostname,
      stackId,
      stackName: config.stackName,
      stackStatus: "CREATE_COMPLETE",
      templateSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      sourceRevision: templateRevision,
      resourceIdentitySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      resourceCount: expectedResources.length,
      stackTags: {
        Project: "needo",
        Environment: "staging",
        Owner: "needo",
        ManagedBy: "cloudformation"
      },
      outputs: {
        ...outputValues,
        ApplicationSecretArn: "REDACTED"
      },
      instance: {
        instanceId: outputValues.InstanceId,
        instanceType: "t4g.large",
        state: "running"
      },
      applicationDeployed: false,
      migrationRun: false,
      seedRun: false,
      dnsModified: false
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(config.alertEmail);
    expect(serialized).not.toContain(outputValues.ApplicationSecretArn);
    expect(serialized).not.toContain("callerArn");
    expect(serialized).not.toContain("parameter-overrides");
    expect(serialized).not.toContain("UserData");
  });

  it("fails atomically on AlreadyExists without any wait, describe, or update", async () => {
    const alreadyExists = new Error(
      "AWS CLI failed (254): AlreadyExistsException: Stack already exists"
    );
    const aws = successfulAws();
    aws.json.mockImplementationOnce(async () => {
      throw alreadyExists;
    });

    await expect(deploy({ aws })).rejects.toThrow("AlreadyExistsException");

    expect(aws.json).toHaveBeenCalledTimes(1);
    expect(aws.json).toHaveBeenCalledWith(expect.arrayContaining([
      "cloudformation", "create-stack"
    ]));
    expect(aws.text).not.toHaveBeenCalled();
    const serializedCalls = JSON.stringify([aws.json.mock.calls, aws.text.mock.calls]);
    expect(serializedCalls).not.toContain("deploy");
    expect(serializedCalls).not.toContain("update-stack");
  });

  it.each([
    ["arn:aws:cloudformation:ap-northeast-1:999999999999:stack/needo-staging-infrastructure/00000000-0000-4000-8000-000000000000", "account"],
    ["arn:aws:cloudformation:ap-southeast-2:123456789012:stack/needo-staging-infrastructure/00000000-0000-4000-8000-000000000000", "region"],
    ["arn:aws:cloudformation:ap-northeast-1:123456789012:stack/foreign/00000000-0000-4000-8000-000000000000", "name"]
  ])("rejects a returned StackId with a mismatched %s", async (returnedStackId, expected) => {
    const aws = successfulAws({ createdStack: { StackId: returnedStackId } });

    await expect(deploy({ aws })).rejects.toThrow(new RegExp(`StackId.*${expected}`, "i"));

    expect(aws.json).toHaveBeenCalledTimes(1);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("rejects a described StackId that differs from the exact created StackId", async () => {
    const foreignId = stackId.replace(
      "00000000-0000-4000-8000-000000000000",
      "11111111-1111-4111-8111-111111111111"
    );
    const aws = successfulAws({
      describedStack: stackResult({ stackOverrides: { StackId: foreignId } })
    });

    await expect(deploy({ aws })).rejects.toThrow(/described StackId.*created StackId/i);

    expect(aws.json.mock.calls.some(([args]) => args[1] === "list-stack-resources")).toBe(false);
  });

  it.each([
    ["cross-account", outputValues.ApplicationSecretArn.replace(config.accountId, "999999999999")],
    ["cross-region", outputValues.ApplicationSecretArn.replace(config.region, "ap-southeast-2")]
  ])("rejects a %s secret output before persisting evidence", async (_label, secretArn) => {
    const aws = successfulAws({
      describedStack: stackResult({
        outputs: { ...outputValues, ApplicationSecretArn: secretArn }
      })
    });

    await expect(deploy({ aws })).rejects.toThrow(/ApplicationSecretArn.*account|region/i);

    expect(aws.json.mock.calls.some(([args]) => args[1] === "list-stack-resources")).toBe(false);
  });

  it("rejects a foreign physical resource that contradicts its stack output", async () => {
    const aws = successfulAws({
      listedResources: stackResources({
        ReleaseBucket: { PhysicalResourceId: "foreign-release-bucket" }
      })
    });

    await expect(deploy({ aws })).rejects.toThrow(/ReleaseBucket.*output/i);

    expect(aws.json.mock.calls.some(([args]) => args[0] === "ec2")).toBe(false);
  });

  it("rejects a valid but foreign Elastic IP output before recording evidence", async () => {
    const aws = successfulAws({
      describedStack: stackResult({
        outputs: { ...outputValues, ElasticIp: "198.51.100.88" }
      })
    });

    await expect(deploy({ aws })).rejects.toThrow(/Elastic IP.*stack|address.*identity/i);
  });

  it.each([
    ["allocation", { AllocationId: "eipalloc-0fedcba9876543210" }],
    ["association", { AssociationId: "eipassoc-0fedcba9876543210" }],
    ["instance", { InstanceId: "i-0fedcba9876543210" }],
    ["public IP", { PublicIp: "198.51.100.88" }],
    ["domain", { Domain: "standard" }]
  ])("rejects an Elastic IP with a foreign %s binding", async (_label, override) => {
    const aws = successfulAws({
      describedAddresses: {
        Addresses: [{
          AllocationId: "eipalloc-0123456789abcdef0",
          AssociationId: "eipassoc-0123456789abcdef0",
          Domain: "vpc",
          InstanceId: outputValues.InstanceId,
          PublicIp: outputValues.ElasticIp,
          ...override
        }]
      }
    });

    await expect(deploy({ aws })).rejects.toThrow(/Elastic IP.*stack|address.*identity/i);
    expect(aws.json.mock.calls.some(([args]) => (
      args[0] === "ec2" && args[1] === "describe-instances"
    ))).toBe(false);
  });

  it("submits the exact immutable template bytes validated by preflight", async () => {
    const readTemplate = vi.fn(async () => "Description: swapped path bytes\n");
    const assertCurrentState = vi.fn(async () => undefined);
    const templateArtifact = Object.freeze({
      body: templateBody,
      templateSha256,
      sourceRevision: templateRevision,
      assertCurrentState
    });
    const aws = successfulAws();

    const evidence = await deploy({ aws, readTemplate, templateArtifact });

    expect(assertCurrentState).toHaveBeenCalledOnce();
    expect(readTemplate).not.toHaveBeenCalled();
    expect(evidence.templateSha256).toBe(templateSha256);
    expect(evidence.sourceRevision).toBe(templateRevision);
    expect(aws.json.mock.calls[0][0]).toContain(templateBody);
    expect(aws.json.mock.calls[0][0]).not.toContain("swapped path bytes");
  });

  it("refuses a template path replacement between validation and create-stack", async () => {
    const readTemplate = vi.fn(async () => "Description: swapped path bytes\n");
    const assertCurrentState = vi.fn(async () => {
      throw new Error("AWS Staging template path identity changed after validation");
    });
    const templateArtifact = Object.freeze({
      body: templateBody,
      templateSha256,
      sourceRevision: templateRevision,
      assertCurrentState
    });
    const aws = successfulAws();

    await expect(deploy({ aws, readTemplate, templateArtifact }))
      .rejects.toThrow(/template path identity changed/i);

    expect(assertCurrentState).toHaveBeenCalledOnce();
    expect(readTemplate).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
  });

  it.each([
    [{ accountId: "999999999999" }, "account"],
    [{ region: "us-east-1" }, "region"]
  ])("refuses a preflight configuration mismatch %#", async (overrides, expected) => {
    const aws = successfulAws();
    await expect(deploy({ aws, preflightResult: preflight(overrides) }))
      .rejects.toThrow(expected);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("refuses a hostname mismatch before CloudFormation mutation", async () => {
    const aws = successfulAws();
    const resolveDns = vi.fn();

    await expect(deploy({
      aws,
      preflightResult: preflight({ hostname: "staging.example.com" }),
      resolveDns
    })).rejects.toThrow("hostname");
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it("rejects an unsafe configured hostname before preflight, AWS, or DNS calls", async () => {
    const aws = successfulAws();
    const resolveDns = vi.fn();
    const runPreflight = vi.fn();

    await expect(deployAwsStagingInfrastructure({
      aws,
      config: { ...config, hostname: "Staging.needo.life" },
      resolveDns,
      runPreflight
    })).rejects.toThrow("hostname");
    expect(runPreflight).not.toHaveBeenCalled();
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it.each([
    "CREATE_COMPLETE",
    "UPDATE_COMPLETE",
    "CREATE_IN_PROGRESS",
    "UPDATE_FAILED",
    "UPDATE_ROLLBACK_COMPLETE",
    "DELETE_COMPLETE"
  ])("refuses every non-ABSENT preflight stack state before AWS mutation: %s", async (stackState) => {
    const aws = successfulAws();
    await expect(deploy({ aws, preflightResult: preflight({ stackState }) }))
      .rejects.toThrow(stackState);
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
  });

  it("refuses a DNS change before the first mutation", async () => {
    const trace = [];
    const aws = successfulAws({ trace });
    const resolveDns = vi.fn(async () => {
      trace.push("dns");
      return ["203.0.113.99"];
    });

    await expect(deploy({ aws, resolveDns })).rejects.toThrow("DNS");
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
    expect(trace).toEqual(["dns"]);
  });

  it.each(["CREATE_FAILED", "UPDATE_ROLLBACK_COMPLETE", "DELETE_COMPLETE"])(
    "refuses final CloudFormation state %s",
    async (status) => {
      const aws = successfulAws({ describedStack: stackResult({ status }) });
      await expect(deploy({ aws })).rejects.toThrow(status);
      expect(aws.text).toHaveBeenCalledTimes(1);
      expect(aws.json).toHaveBeenCalledTimes(2);
    }
  );

  it("refuses UPDATE_COMPLETE because this path is create-only", async () => {
    const aws = successfulAws({ describedStack: stackResult({ status: "UPDATE_COMPLETE" }) });
    await expect(deploy({ aws })).rejects.toThrow("UPDATE_COMPLETE");
    expect(JSON.stringify(aws.json.mock.calls)).not.toContain("list-stack-resources");
  });

  it("refuses any missing required Task 2 output", async () => {
    const { HostVerificationDocumentName: _missing, ...incompleteOutputs } = outputValues;
    const aws = successfulAws({ describedStack: stackResult({ outputs: incompleteOutputs }) });

    await expect(deploy({ aws })).rejects.toThrow(/exactly 10|HostVerificationDocumentName/);
    expect(aws.json).toHaveBeenCalledTimes(2);
  });

  it("refuses extra, duplicate, or empty CloudFormation outputs", async () => {
    const invalidStacks = [
      stackResult({ outputs: { ...outputValues, UnexpectedOutput: "value" } }),
      {
        Stacks: [{
          StackStatus: "CREATE_COMPLETE",
          Outputs: [
            ...Object.entries(outputValues).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue })),
            { OutputKey: "InstanceId", OutputValue: outputValues.InstanceId }
          ]
        }]
      },
      stackResult({ outputs: { ...outputValues, BudgetName: "" } })
    ];

    for (const describedStack of invalidStacks) {
      const aws = successfulAws({ describedStack });
      await expect(deploy({ aws })).rejects.toThrow(/exactly|duplicate|non-empty/);
      expect(aws.json).toHaveBeenCalledTimes(2);
    }
  });

  it("refuses malformed instance descriptions and never requests user data", async () => {
    const aws = successfulAws({ describedInstances: { Reservations: [] } });

    await expect(deploy({ aws })).rejects.toThrow("exactly one EC2 instance");
    expect(aws.json).toHaveBeenLastCalledWith([
      "ec2", "describe-instances", "--instance-ids", outputValues.InstanceId
    ]);
  });

  it("requires the in-process preflight runner and does not accept a caller-supplied record", async () => {
    const aws = successfulAws();
    await expect(deployAwsStagingInfrastructure({
      aws,
      config,
      resolveDns: async () => []
    })).rejects.toThrow("preflight runner");
    expect(aws.text).not.toHaveBeenCalled();
  });
});

describe("AWS Staging evidence writer", () => {
  it.each([
    ["cross-account StackId", {
      stackId: stackId.replace(config.accountId, "999999999999")
    }],
    ["cross-region StackId", {
      stackId: stackId.replace(config.region, "ap-southeast-2")
    }],
    ["alternate hostname", { hostname: "staging.example.com" }],
    ["foreign tag set", {
      stackTags: { ...evidenceFixture().stackTags, Owner: "foreign" }
    }],
    ["wrong resource count", { resourceCount: expectedResources.length - 1 }],
    ["malformed template digest", { templateSha256: "a".repeat(63) }],
    ["malformed resource digest", { resourceIdentitySha256: "B".repeat(64) }]
  ])("rejects %s deployment evidence before filesystem mutation", async (_label, overrides) => {
    await expect(writeAwsStagingEnvironmentEvidence({
      evidence: evidenceFixture(overrides),
      outputDirectory: "/must/not/be/reached",
      trustedRoot: "/must"
    })).rejects.toThrow(/stackId|hostname|stackTags|resourceCount|SHA-256/i);
  });

  it("preserves the approved Sydney region in reconstructed evidence", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-sydney-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    try {
      const evidence = evidenceFixture({
        region: "ap-southeast-2",
        stackId: stackId.replace("ap-northeast-1", "ap-southeast-2")
      });
      const resultPath = await writeAwsStagingEnvironmentEvidence({
        evidence,
        trustedRoot: temporaryRoot,
        outputDirectory
      });
      const persisted = JSON.parse(await fs.readFile(resultPath, "utf8"));
      expect(persisted.region).toBe("ap-southeast-2");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("uses a private directory, atomic rename, and a private final file", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const evidence = evidenceFixture();

    try {
      const resultPath = await writeAwsStagingEnvironmentEvidence({
        evidence,
        outputDirectory,
        trustedRoot: temporaryRoot
      });
      const [directoryStat, fileStat, fileNames, contents] = await Promise.all([
        fs.stat(outputDirectory),
        fs.stat(resultPath),
        fs.readdir(outputDirectory),
        fs.readFile(resultPath, "utf8")
      ]);

      expect(directoryStat.mode & 0o777).toBe(0o700);
      expect(fileStat.mode & 0o777).toBe(0o600);
      expect(fileNames).toEqual(["environment-stack.json"]);
      expect(JSON.parse(contents)).toEqual(evidence);
      expect(contents.endsWith("\n")).toBe(true);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["accessKeyId", { accessKeyId: "AKIA0000000000000000" }],
    ["secretAccessKey", { secretAccessKey: "secret" }],
    ["sessionToken", { sessionToken: "token" }],
    ["parameterOverrides", { parameterOverrides: { Owner: "needo" } }],
    ["cloudFormationParameters", { cloudFormationParameters: [] }],
    ["callerArn", { callerArn: "REDACTED" }],
    ["email", { email: "redacted" }],
    ["userData", { userData: "redacted" }]
  ])("rejects unexpected sensitive top-level field %s", async (_label, unexpected) => {
    await expect(writeAwsStagingEnvironmentEvidence({
      evidence: evidenceFixture(unexpected),
      outputDirectory: "/must/not/be/reached",
      trustedRoot: "/must"
    })).rejects.toThrow("exact keys");
  });

  it.each([
    ["top-level", { unexpected: true }],
    ["outputs", { outputs: { ...evidenceFixture().outputs, unexpected: "value" } }],
    ["instance", { instance: { ...evidenceFixture().instance, unexpected: "value" } }]
  ])("rejects an unexpected %s key", async (_label, overrides) => {
    await expect(writeAwsStagingEnvironmentEvidence({
      evidence: evidenceFixture(overrides),
      outputDirectory: "/must/not/be/reached",
      trustedRoot: "/must"
    })).rejects.toThrow("exact keys");
  });

  it.each([
    ["scope", { scope: "application" }],
    ["accountId", { accountId: "123" }],
    ["accountId", { accountId: 123456789012 }],
    ["region", { region: "us-east-1" }],
    ["stackName", { stackName: "another-stack" }],
    ["stackStatus", { stackStatus: "CREATE_IN_PROGRESS" }],
    ["applicationDeployed", { applicationDeployed: true }],
    ["migrationRun", { migrationRun: true }],
    ["seedRun", { seedRun: true }],
    ["dnsModified", { dnsModified: true }],
    ["output value", { outputs: { ...evidenceFixture().outputs, BudgetName: "" } }],
    ["instance value", { instance: { ...evidenceFixture().instance, state: "" } }]
  ])("rejects invalid required schema field %s", async (label, overrides) => {
    await expect(writeAwsStagingEnvironmentEvidence({
      evidence: evidenceFixture(overrides),
      outputDirectory: "/must/not/be/reached",
      trustedRoot: "/must"
    })).rejects.toThrow(new RegExp(label.split(" ")[0], "i"));
  });

  it.each([
    ["full ARN", { outputs: { ...evidenceFixture().outputs, BudgetName: "arn:aws:budgets::123456789012:budget/name" } }],
    ["email", { outputs: { ...evidenceFixture().outputs, BudgetName: "ops@example.com" } }],
    ["unredacted secret ARN", { outputs: { ...evidenceFixture().outputs, ApplicationSecretArn: outputValues.ApplicationSecretArn } }]
  ])("rejects a serialized %s in an otherwise approved field", async (_label, overrides) => {
    await expect(writeAwsStagingEnvironmentEvidence({
      evidence: evidenceFixture(overrides),
      outputDirectory: "/must/not/be/reached",
      trustedRoot: "/must"
    })).rejects.toThrow(/forbidden|REDACTED/);
  });

  it.each([
    ["AKIA access key", "AKIAIOSFODNN7EXAMPLE"],
    ["ASIA access key", "ASIAIOSFODNN7EXAMPLE"],
    ["secret access key", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"],
    ["session token", "FwoGZXIvYXdzEBYaDHVtbXktc3R5bGUtdG9rZW4"],
    ["parameter assignment", "Owner=needo"],
    ["shell payload", "$(touch /tmp/needo-pwned)"],
    ["user-data payload", "#!/bin/bash\ncurl https://example.invalid"]
  ])("rejects %s injected into an allowlisted string field", async (_label, unsafeValue) => {
    await expect(writeAwsStagingEnvironmentEvidence({
      evidence: evidenceFixture({
        outputs: {
          ...evidenceFixture().outputs,
          HostBootstrapDocumentName: unsafeValue
        }
      }),
      outputDirectory: "/must/not/be/reached",
      trustedRoot: "/must"
    })).rejects.toThrow(/invalid|forbidden|unsafe/i);
  });

  it.each([
    ["InstanceId", { outputs: { ...evidenceFixture().outputs, InstanceId: "instance-1" } }],
    ["ElasticIp", { outputs: { ...evidenceFixture().outputs, ElasticIp: "999.1.1.1" } }],
    ["DataVolumeId", { outputs: { ...evidenceFixture().outputs, DataVolumeId: "disk-1" } }],
    ["bucket", { outputs: { ...evidenceFixture().outputs, ReleaseBucketName: "INVALID_BUCKET" } }],
    ["bucket", { outputs: { ...evidenceFixture().outputs, ReleaseBucketName: "bad.-bucket" } }],
    ["document", { outputs: { ...evidenceFixture().outputs, HostVerificationDocumentName: "/bad/document" } }],
    ["parameter", { outputs: { ...evidenceFixture().outputs, CloudWatchAgentConfigParameterName: "/other/path" } }],
    ["budget", { outputs: { ...evidenceFixture().outputs, BudgetName: "another-budget" } }],
    ["instanceType", { instance: { ...evidenceFixture().instance, instanceType: "t3.large" } }],
    ["state", { instance: { ...evidenceFixture().instance, state: "stopped" } }],
    ["instance identity", { instance: { ...evidenceFixture().instance, instanceId: "i-0fedcba9876543210" } }]
  ])("rejects an invalid domain-specific %s value", async (label, overrides) => {
    await expect(writeAwsStagingEnvironmentEvidence({
      evidence: evidenceFixture(overrides),
      outputDirectory: "/must/not/be/reached",
      trustedRoot: "/must"
    })).rejects.toThrow(new RegExp(label.split(" ")[0], "i"));
  });

  it("rejects relative and out-of-root output directories before filesystem mutation", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-root-"));
    const noMutationFileSystem = {
      ...fs,
      mkdir: vi.fn(async () => {
        throw new Error("filesystem mutation reached");
      })
    };
    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory: "outputs/aws-staging",
        trustedRoot: temporaryRoot,
        fileSystem: noMutationFileSystem
      })).rejects.toThrow("absolute descendant");
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory: path.join(temporaryRoot, "..", "outside"),
        trustedRoot: temporaryRoot,
        fileSystem: noMutationFileSystem
      })).rejects.toThrow("absolute descendant");
      expect(noMutationFileSystem.mkdir).not.toHaveBeenCalled();
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("refuses an output-directory symlink instead of writing outside the evidence path", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-link-"));
    const outsideDirectory = path.join(temporaryRoot, "outside");
    const outputDirectory = path.join(temporaryRoot, "aws-staging");
    await fs.mkdir(outsideDirectory);
    await fs.symlink(outsideDirectory, outputDirectory);

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot: temporaryRoot
      })).rejects.toThrow("symlink");
      await expect(fs.readdir(outsideDirectory)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlink in a parent component without writing through it", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-parent-link-"));
    const trustedRoot = path.join(temporaryRoot, "trusted");
    const outsideDirectory = path.join(temporaryRoot, "outside");
    const linkedParent = path.join(trustedRoot, "outputs");
    const outputDirectory = path.join(linkedParent, "aws-staging");
    await fs.mkdir(trustedRoot);
    await fs.mkdir(outsideDirectory);
    await fs.symlink(outsideDirectory, linkedParent);

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot
      })).rejects.toThrow("symlink");
      await expect(fs.readdir(outsideDirectory)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a trusted-root swap during preparation before creating a descendant", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-root-swap-"));
    const trustedRoot = path.join(temporaryRoot, "trusted");
    const displacedRoot = path.join(temporaryRoot, "displaced-root");
    const outsideRoot = path.join(temporaryRoot, "outside-root");
    const outsideMarker = path.join(outsideRoot, "outside-marker.txt");
    const outputDirectory = path.join(trustedRoot, "outputs", "aws-staging");
    await fs.mkdir(trustedRoot, { mode: 0o700 });
    await fs.mkdir(outsideRoot, { mode: 0o700 });
    await fs.writeFile(outsideMarker, "outside-unchanged", { mode: 0o640 });
    const outsideIdentity = await fs.stat(outsideRoot);
    let swapped = false;
    const fileSystem = {
      ...fs,
      async lstat(targetPath) {
        if (!swapped && targetPath === path.join(trustedRoot, "outputs")) {
          swapped = true;
          await fs.rename(trustedRoot, displacedRoot);
          await fs.rename(outsideRoot, trustedRoot);
        }
        return fs.lstat(targetPath);
      }
    };

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot,
        fileSystem
      })).rejects.toThrow("identity changed");
      const [replacementIdentity, replacementEntries, markerContents] = await Promise.all([
        fs.stat(trustedRoot),
        fs.readdir(trustedRoot),
        fs.readFile(path.join(trustedRoot, "outside-marker.txt"), "utf8")
      ]);
      expect({ dev: replacementIdentity.dev, ino: replacementIdentity.ino }).toEqual({
        dev: outsideIdentity.dev,
        ino: outsideIdentity.ino
      });
      expect(replacementEntries).toEqual(["outside-marker.txt"]);
      expect(markerContents).toBe("outside-unchanged");
      await expect(fs.readdir(displacedRoot)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects an ancestor-component swap during preparation before creating its child", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-component-swap-"));
    const trustedRoot = path.join(temporaryRoot, "trusted");
    const outputsDirectory = path.join(trustedRoot, "outputs");
    const displacedOutputs = path.join(temporaryRoot, "displaced-outputs");
    const outsideOutputs = path.join(temporaryRoot, "outside-outputs");
    const outputDirectory = path.join(outputsDirectory, "aws-staging");
    await fs.mkdir(outputsDirectory, { recursive: true, mode: 0o700 });
    await fs.mkdir(outsideOutputs, { mode: 0o700 });
    await fs.writeFile(path.join(outsideOutputs, "outside-marker.txt"), "outside-unchanged");
    const outsideIdentity = await fs.stat(outsideOutputs);
    let swapped = false;
    const fileSystem = {
      ...fs,
      async lstat(targetPath) {
        if (!swapped && targetPath === outputDirectory) {
          swapped = true;
          await fs.rename(outputsDirectory, displacedOutputs);
          await fs.rename(outsideOutputs, outputsDirectory);
        }
        return fs.lstat(targetPath);
      }
    };

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot,
        fileSystem
      })).rejects.toThrow("identity changed");
      const [replacementIdentity, replacementEntries, markerContents] = await Promise.all([
        fs.stat(outputsDirectory),
        fs.readdir(outputsDirectory),
        fs.readFile(path.join(outputsDirectory, "outside-marker.txt"), "utf8")
      ]);
      expect({ dev: replacementIdentity.dev, ino: replacementIdentity.ino }).toEqual({
        dev: outsideIdentity.dev,
        ino: outsideIdentity.ino
      });
      expect(replacementEntries).toEqual(["outside-marker.txt"]);
      expect(markerContents).toBe("outside-unchanged");
      await expect(fs.readdir(displacedOutputs)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("detects an injected final-directory identity swap before writing or renaming", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-swap-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const displacedDirectory = path.join(temporaryRoot, "displaced");
    let swapped = false;
    const fileSystem = {
      ...fs,
      async open(filePath, flags, mode) {
        if (!swapped) {
          swapped = true;
          await fs.rename(outputDirectory, displacedDirectory);
          await fs.mkdir(outputDirectory, { mode: 0o700 });
        }
        return fs.open(filePath, flags, mode);
      }
    };

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot: temporaryRoot,
        fileSystem
      })).rejects.toThrow("identity changed");
      await expect(fs.readdir(outputDirectory)).resolves.toEqual([]);
      await expect(fs.readdir(displacedDirectory)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("opens the temporary evidence file with exclusive no-follow numeric flags", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-flags-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    let observedFlags;
    const fileSystem = {
      ...fs,
      open(filePath, flags, mode) {
        observedFlags = flags;
        return fs.open(filePath, flags, mode);
      }
    };

    try {
      await writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot: temporaryRoot,
        fileSystem
      });
      expect(typeof observedFlags).toBe("number");
      expect(observedFlags & fsConstants.O_WRONLY).toBe(fsConstants.O_WRONLY);
      expect(observedFlags & fsConstants.O_CREAT).toBe(fsConstants.O_CREAT);
      expect(observedFlags & fsConstants.O_EXCL).toBe(fsConstants.O_EXCL);
      expect(observedFlags & fsConstants.O_NOFOLLOW).toBe(fsConstants.O_NOFOLLOW);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("applies 0700 through a no-follow directory handle without path chmod", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-dir-handle-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const openCalls = [];
    const fileSystem = {
      ...fs,
      chmod: vi.fn(async () => {
        throw new Error("path chmod is forbidden");
      }),
      open(filePath, flags, mode) {
        openCalls.push({ filePath, flags, mode });
        return fs.open(filePath, flags, mode);
      }
    };

    try {
      await writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot: temporaryRoot,
        fileSystem
      });
      const directoryOpen = openCalls.find((call) => call.filePath === outputDirectory);
      expect(directoryOpen).toBeDefined();
      expect(typeof directoryOpen.flags).toBe("number");
      expect(directoryOpen.flags & fsConstants.O_DIRECTORY).toBe(fsConstants.O_DIRECTORY);
      expect(directoryOpen.flags & fsConstants.O_NOFOLLOW).toBe(fsConstants.O_NOFOLLOW);
      expect(fileSystem.chmod).not.toHaveBeenCalled();
      expect((await fs.stat(outputDirectory)).mode & 0o777).toBe(0o700);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("does not path-chmod an outside file after a post-rename directory swap", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-post-rename-swap-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const displacedDirectory = path.join(temporaryRoot, "displaced");
    const outsideDirectory = path.join(temporaryRoot, "outside");
    const outsideFinalPath = path.join(outsideDirectory, "environment-stack.json");
    await fs.mkdir(outsideDirectory, { mode: 0o700 });
    await fs.writeFile(outsideFinalPath, "outside-unchanged", { mode: 0o640 });
    const outsideFileBefore = await fs.stat(outsideFinalPath);
    const fileSystem = {
      ...fs,
      async rename(sourcePath, destinationPath) {
        await fs.rename(sourcePath, destinationPath);
        await fs.rename(outputDirectory, displacedDirectory);
        await fs.rename(outsideDirectory, outputDirectory);
      }
    };

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot: temporaryRoot,
        fileSystem
      })).rejects.toThrow("identity changed");
      const outsidePathAfterSwap = path.join(outputDirectory, "environment-stack.json");
      const [outsideFileAfter, outsideContents, displacedEntries] = await Promise.all([
        fs.stat(outsidePathAfterSwap),
        fs.readFile(outsidePathAfterSwap, "utf8"),
        fs.readdir(displacedDirectory)
      ]);
      expect({
        dev: outsideFileAfter.dev,
        ino: outsideFileAfter.ino,
        mode: outsideFileAfter.mode & 0o777
      }).toEqual({
        dev: outsideFileBefore.dev,
        ino: outsideFileBefore.ino,
        mode: outsideFileBefore.mode & 0o777
      });
      expect(outsideContents).toBe("outside-unchanged");
      expect(displacedEntries).toEqual(["environment-stack.json"]);
      expect(displacedEntries.some((entry) => entry.endsWith(".tmp"))).toBe(false);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("removes the temporary file when atomic rename fails", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-cleanup-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const fileSystem = {
      ...fs,
      rename: vi.fn(async () => {
        throw new Error("injected rename failure");
      })
    };

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: evidenceFixture(),
        outputDirectory,
        trustedRoot: temporaryRoot,
        fileSystem
      })).rejects.toThrow("injected rename failure");
      await expect(fs.readdir(outputDirectory)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
