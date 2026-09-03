import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { bootstrapAwsStagingHost } from "./aws-staging-bootstrap-host-lib.mjs";
import { runAwsStagingPreflight } from "./aws-staging-preflight-lib.mjs";
import { AWS_STAGING_EXPECTED_RESOURCES } from "./aws-staging-stack-contract.mjs";

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
const runtimeSourceRevision = "0123456789abcdef0123456789abcdef01234567";
const runtimeManifestSha256 = "d".repeat(64);
const runtimeArtifact = Object.freeze({
  runtimeSourceRevision,
  runtimeManifestSha256,
  runtimeEntrypoint: "scripts/aws-staging-bootstrap-host.mjs",
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
const stackTags = Object.freeze([
  { Key: "Project", Value: "needo" },
  { Key: "Environment", Value: "staging" },
  { Key: "Owner", Value: "needo" },
  { Key: "ManagedBy", Value: "cloudformation" }
]);
const bootstrapDocumentContent = Object.freeze({
  schemaVersion: "2.2",
  description: "test bootstrap contract",
  parameters: {},
  mainSteps: []
});
const verificationDocumentContent = Object.freeze({
  schemaVersion: "2.2",
  description: "test verification contract",
  mainSteps: []
});
const cloudWatchAgentConfig = Object.freeze({
  agent: { metrics_collection_interval: 60 },
  metrics: { namespace: "Needo/Staging" }
});
const attestationContracts = Object.freeze({
  bootstrapDocumentContent,
  verificationDocumentContent,
  cloudWatchAgentConfig
});

function preflight(overrides = {}) {
  return Object.freeze({
    accountId: config.accountId,
    callerArn: "arn:aws:sts::123456789012:assumed-role/NeedoDeployer/session",
    callerKind: "assumed-role",
    hostname: "staging.needo.life",
    region: config.region,
    amiId: "ami-0123456789abcdef0",
    amiArchitecture: "arm64",
    templateSha256,
    sourceRevision: runtimeSourceRevision,
    templateValidation: "VALID",
    runtimeSourceRevision,
    runtimeManifestSha256,
    runtimeEntrypoint: "scripts/aws-staging-bootstrap-host.mjs",
    stackState: "CREATE_COMPLETE",
    dnsA: Object.freeze([]),
    ...overrides
  });
}

function stackResources(overrides = {}) {
  const boundPhysicalIds = {
    Instance: outputValues.InstanceId,
    DataVolume: outputValues.DataVolumeId,
    ReleaseBucket: outputValues.ReleaseBucketName,
    ReleaseBucketPolicy: outputValues.ReleaseBucketName,
    BackupBucket: outputValues.BackupBucketName,
    BackupBucketPolicy: outputValues.BackupBucketName,
    ApplicationSecret: outputValues.ApplicationSecretArn,
    HostBootstrapDocument: outputValues.HostBootstrapDocumentName,
    HostVerificationDocument: outputValues.HostVerificationDocumentName,
    CloudWatchAgentConfigParameter: outputValues.CloudWatchAgentConfigParameterName,
    MonthlyBudget: outputValues.BudgetName,
    AlertTopic: "arn:aws:sns:ap-northeast-1:123456789012:needo-staging-alert",
    AlertSubscription: "arn:aws:sns:ap-northeast-1:123456789012:needo-staging-alert:00000000-0000-4000-8000-000000000000"
  };
  return {
    StackResourceSummaries: AWS_STAGING_EXPECTED_RESOURCES.map(([LogicalResourceId, ResourceType]) => ({
      LogicalResourceId,
      ResourceType,
      PhysicalResourceId: boundPhysicalIds[LogicalResourceId] ?? `${LogicalResourceId}-physical-id`,
      ResourceStatus: "CREATE_COMPLETE",
      ...overrides[LogicalResourceId]
    }))
  };
}

function stackResult({ status = "CREATE_COMPLETE", entries } = {}) {
  const outputEntries = entries ?? Object.entries(outputValues);
  return {
    Stacks: [{
      StackId: stackId,
      StackName: config.stackName,
      StackStatus: status,
      Tags: stackTags,
      Outputs: outputEntries.map(([OutputKey, OutputValue]) => ({
        OutputKey,
        OutputValue
      }))
    }]
  };
}

function onlineRegistration(overrides = {}) {
  return {
    InstanceInformationList: [{
      InstanceId: outputValues.InstanceId,
      PingStatus: "Online",
      PlatformType: "Linux",
      ...overrides
    }]
  };
}

function documentResult({
  content = bootstrapDocumentContent,
  name = outputValues.HostBootstrapDocumentName,
  version = "7"
} = {}) {
  return {
    Name: name,
    DocumentVersion: version,
    Status: "Active",
    Content: JSON.stringify(content),
    DocumentType: "Command",
    DocumentFormat: "JSON"
  };
}

function parameterResult({ value = cloudWatchAgentConfig, version = 11 } = {}) {
  return {
    Parameter: {
      Name: outputValues.CloudWatchAgentConfigParameterName,
      Type: "String",
      Value: JSON.stringify(value),
      Version: version,
      ARN: "arn:aws:ssm:ap-northeast-1:123456789012:parameter/needo/staging/cloudwatch-agent",
      DataType: "text"
    }
  };
}

function describedInstance() {
  return {
    Reservations: [{
      Instances: [{
        InstanceId: outputValues.InstanceId,
        InstanceType: "t4g.large",
        State: { Name: "running" }
      }]
    }]
  };
}

function describedDataVolume(overrides = {}) {
  return {
    Volumes: [{
      VolumeId: outputValues.DataVolumeId,
      State: "in-use",
      Attachments: [{
        InstanceId: outputValues.InstanceId,
        Device: "/dev/sdf",
        State: "attached"
      }],
      ...overrides
    }]
  };
}

function createClock() {
  let current = Date.parse("2026-09-03T01:00:00.000Z");
  return {
    now: vi.fn(() => current),
    advance(milliseconds) {
      current += milliseconds;
    },
    sleep: vi.fn(async (milliseconds) => {
      current += milliseconds;
    })
  };
}

function successfulAws({
  describedStack = stackResult(),
  listedResources = stackResources(),
  instance = describedInstance(),
  dataVolume = describedDataVolume(),
  document = documentResult(),
  parameter = parameterResult(),
  registrations = [onlineRegistration()],
  commandIds = ["command-0001"],
  invocation = {
    Status: "Success",
    ResponseCode: 0,
    StandardOutputContent: "must-not-be-returned",
    StandardErrorContent: "must-not-be-returned"
  },
  trace = []
} = {}) {
  const registrationQueue = [...registrations];
  const commandQueue = [...commandIds];
  return {
    json: vi.fn(async (args) => {
      trace.push(`json:${args.join(" ")}`);
      if (args[0] === "cloudformation" && args[1] === "describe-stacks") return describedStack;
      if (args[0] === "cloudformation" && args[1] === "list-stack-resources") return listedResources;
      if (args[0] === "ec2" && args[1] === "describe-instances") return instance;
      if (args[0] === "ec2" && args[1] === "describe-volumes") return dataVolume;
      if (args[0] === "ssm" && args[1] === "get-document") return document;
      if (args[0] === "ssm" && args[1] === "get-parameter") return parameter;
      if (args[0] === "ssm" && args[1] === "describe-instance-information") {
        return registrationQueue.length > 1
          ? registrationQueue.shift()
          : registrationQueue[0];
      }
      if (args[0] === "ssm" && args[1] === "send-command") {
        return { Command: { CommandId: commandQueue.shift() } };
      }
      if (args[0] === "ssm" && args[1] === "get-command-invocation") {
        return invocation;
      }
      throw new Error(`Unexpected AWS JSON call: ${args.join(" ")}`);
    }),
    text: vi.fn(async (args) => {
      trace.push(`text:${args.join(" ")}`);
      return "";
    })
  };
}

async function bootstrap({
  aws = successfulAws(),
  resolvedConfig = config,
  clock = createClock(),
  preflightResult = preflight(),
  loadContracts = vi.fn(async () => attestationContracts),
  approvedRuntime = runtimeArtifact,
  approvedTemplate = templateArtifact
} = {}) {
  return bootstrapAwsStagingHost({
    aws,
    config: resolvedConfig,
    now: clock.now,
    sleep: clock.sleep,
    runPreflight: vi.fn(async () => preflightResult),
    runtimeArtifact: approvedRuntime,
    templateArtifact: approvedTemplate,
    loadAttestationContracts: loadContracts
  });
}

describe("AWS Staging SSM host bootstrap", () => {
  it("wires the same immutable template artifact into the real preflight", async () => {
    let describeStackCalls = 0;
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
          return { Parameter: { Value: "ami-0123456789abcdef0" } };
        }
        if (operation === "ec2 describe-images") {
          return { Images: [{
            ImageId: "ami-0123456789abcdef0",
            Architecture: "arm64",
            State: "available",
            OwnerId: "137112412989"
          }] };
        }
        if (operation === "cloudformation validate-template") return {};
        if (operation === "cloudformation describe-stacks") {
          describeStackCalls += 1;
          if (describeStackCalls === 1) return stackResult();
          throw new Error("post-preflight bootstrap sentinel");
        }
        throw new Error(`Unexpected AWS JSON call: ${args.join(" ")}`);
      })
    };

    await expect(bootstrapAwsStagingHost({
      aws,
      config,
      runPreflight: runAwsStagingPreflight,
      runtimeArtifact,
      templateArtifact,
      resolveDns: vi.fn(async () => []),
      loadAttestationContracts: vi.fn(async () => attestationContracts)
    })).rejects.toThrow("post-preflight bootstrap sentinel");
    expect(aws.json).toHaveBeenCalledWith([
      "cloudformation", "validate-template", "--template-body", templateBody
    ]);
    expect(aws.json.mock.calls.some(([args]) => args[1] === "send-command")).toBe(false);
  });

  it("re-attests runtime identity immediately before the SSM bootstrap mutation", async () => {
    const aws = successfulAws();
    const driftedRuntime = Object.freeze({
      ...runtimeArtifact,
      assertCurrentState: vi.fn(async () => {
        throw new Error("AWS Staging runtime identity changed after approval");
      })
    });

    await expect(bootstrap({ aws, approvedRuntime: driftedRuntime }))
      .rejects.toThrow(/runtime identity changed/i);
    expect(aws.json.mock.calls.some(([args]) => args[1] === "get-document")).toBe(true);
    expect(aws.json.mock.calls.some(([args]) => args[1] === "send-command")).toBe(false);
  });

  it("uses only a fresh complete stack response and the exact approved AWS call sequence", async () => {
    const trace = [];
    const aws = successfulAws({ trace });
    const clock = createClock();

    const summary = await bootstrap({ aws, clock });

    expect(trace).toEqual([
      `json:cloudformation describe-stacks --stack-name ${config.stackName}`,
      `json:cloudformation list-stack-resources --stack-name ${stackId}`,
      `json:ec2 describe-instances --instance-ids ${outputValues.InstanceId}`,
      `json:ec2 describe-volumes --volume-ids ${outputValues.DataVolumeId}`,
      `json:ssm get-document --name ${outputValues.HostBootstrapDocumentName} --document-version $LATEST --document-format JSON`,
      `json:ssm get-parameter --name ${outputValues.CloudWatchAgentConfigParameterName}`,
      `text:ec2 wait instance-status-ok --instance-ids ${outputValues.InstanceId}`,
      `json:ssm describe-instance-information --filters Key=InstanceIds,Values=${outputValues.InstanceId}`,
      [
        "json:ssm send-command",
        `--document-name ${outputValues.HostBootstrapDocumentName}`,
        "--document-version 7",
        `--instance-ids ${outputValues.InstanceId}`,
        "--parameters",
        `DataVolumeId=${outputValues.DataVolumeId},CloudWatchAgentConfigParameter=${outputValues.CloudWatchAgentConfigParameterName},CloudWatchAgentConfigParameterVersion=11`,
        "--comment NeeDo Staging environment-only host bootstrap"
      ].join(" "),
      "text:ssm wait command-executed --command-id command-0001 "
        + `--instance-id ${outputValues.InstanceId}`,
      "json:ssm get-command-invocation --command-id command-0001 "
        + `--instance-id ${outputValues.InstanceId}`
    ]);
    expect(summary).toEqual({
      gate: "aws-staging-host-bootstrap",
      stackStatus: "CREATE_COMPLETE",
      instanceId: outputValues.InstanceId,
      commandId: "command-0001",
      status: "Success",
      responseCode: 0,
      documentVersion: "7",
      documentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      agentParameterVersion: 11,
      agentParameterSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      runtimeSourceRevision,
      runtimeManifestSha256,
      runtimeEntrypoint: "scripts/aws-staging-bootstrap-host.mjs",
      startedAt: "2026-09-03T01:00:00.000Z",
      completedAt: "2026-09-03T01:00:00.000Z"
    });
    expect(Object.isFrozen(summary)).toBe(true);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("runs a second full invocation as an idempotency proof with one command per invocation", async () => {
    const clock = createClock();
    const aws = successfulAws({
      describedStack: stackResult({ status: "UPDATE_COMPLETE" }),
      commandIds: ["command-0001", "command-0002"]
    });

    await expect(bootstrap({ aws, clock })).resolves.toMatchObject({
      stackStatus: "UPDATE_COMPLETE",
      commandId: "command-0001"
    });
    await expect(bootstrap({ aws, clock })).resolves.toMatchObject({
      stackStatus: "UPDATE_COMPLETE",
      commandId: "command-0002"
    });

    const callsFor = (service, operation) => aws.json.mock.calls
      .filter(([args]) => args[0] === service && args[1] === operation);
    expect(callsFor("cloudformation", "describe-stacks")).toHaveLength(2);
    expect(callsFor("cloudformation", "list-stack-resources")).toHaveLength(2);
    expect(callsFor("ssm", "get-document")).toHaveLength(2);
    expect(callsFor("ssm", "get-parameter")).toHaveLength(2);
    expect(callsFor("ssm", "send-command")).toHaveLength(2);
    expect(callsFor("ssm", "get-command-invocation")).toHaveLength(2);
    expect(aws.text.mock.calls.filter(([args]) => args[0] === "ec2")).toHaveLength(2);
    expect(aws.text.mock.calls.filter(([args]) => args[1] === "wait")).toHaveLength(4);
  });

  it.each([
    [{ accountId: "999999999999" }, /account/i],
    [{ region: "ap-southeast-2" }, /region/i],
    [{ templateSha256: "0".repeat(64) }, /template/i],
    [{ sourceRevision: "f".repeat(40) }, /template|revision/i]
  ])("requires a fresh preflight identity before any waiter or command %#", async (overrides, expected) => {
    const aws = successfulAws();

    await expect(bootstrap({ aws, preflightResult: preflight(overrides) })).rejects.toThrow(expected);

    expect(aws.json).not.toHaveBeenCalled();
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("requires the exact approved hostname in the resolved bootstrap configuration", async () => {
    const aws = successfulAws();
    const { hostname: _hostname, ...withoutHostname } = config;

    await expect(bootstrap({
      aws,
      resolvedConfig: Object.freeze(withoutHostname)
    })).rejects.toThrow(/hostname/i);

    expect(aws.json).not.toHaveBeenCalled();
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("rejects a cross-account StackId before any waiter or command", async () => {
    const describedStack = stackResult();
    describedStack.Stacks[0].StackId = stackId.replace(config.accountId, "999999999999");
    const aws = successfulAws({ describedStack });

    await expect(bootstrap({ aws })).rejects.toThrow(/StackId|account/i);

    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it("rejects a foreign stack resource binding before any waiter or command", async () => {
    const listedResources = stackResources({
      DataVolume: { PhysicalResourceId: "vol-0fedcba9876543210" }
    });
    const aws = successfulAws({ listedResources });

    await expect(bootstrap({ aws })).rejects.toThrow(/DataVolume.*output|identity/i);

    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it("rejects a data-volume attachment to a foreign instance before any waiter or command", async () => {
    const aws = successfulAws({
      dataVolume: describedDataVolume({
        Attachments: [{
          InstanceId: "i-0fedcba9876543210",
          Device: "/dev/sdf",
          State: "attached"
        }]
      })
    });

    await expect(bootstrap({ aws })).rejects.toThrow(/volume.*attachment|instance/i);

    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it("rejects SSM document content or version drift with zero command execution", async () => {
    for (const document of [
      documentResult({ content: { ...bootstrapDocumentContent, description: "foreign" } }),
      documentResult({ version: "$LATEST" })
    ]) {
      const aws = successfulAws({ document });

      await expect(bootstrap({ aws })).rejects.toThrow(/document.*(?:content|version)|drift/i);

      expect(aws.text).not.toHaveBeenCalled();
      expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
    }
  });

  it("rejects CloudWatch parameter content and version drift with zero command execution", async () => {
    for (const parameter of [
      parameterResult({ value: { ...cloudWatchAgentConfig, unexpected: true } }),
      parameterResult({ version: 0 })
    ]) {
      const aws = successfulAws({ parameter });

      await expect(bootstrap({ aws })).rejects.toThrow(/parameter.*(?:content|version)|drift/i);

      expect(aws.text).not.toHaveBeenCalled();
      expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
    }
  });

  it.each([
    ["missing response", null],
    ["missing Stacks", {}],
    ["zero stacks", { Stacks: [] }],
    ["multiple stacks", { Stacks: [{}, {}] }]
  ])("rejects %s before issuing a waiter or command", async (_label, describedStack) => {
    const aws = successfulAws({ describedStack });

    await expect(bootstrap({ aws })).rejects.toThrow(/exactly one|malformed/);
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).toHaveBeenCalledTimes(1);
  });

  it.each([
    "CREATE_IN_PROGRESS",
    "UPDATE_FAILED",
    "UPDATE_ROLLBACK_COMPLETE",
    "DELETE_COMPLETE",
    ""
  ])("rejects unstable stack status %s", async (status) => {
    const aws = successfulAws({ describedStack: stackResult({ status }) });

    await expect(bootstrap({ aws })).rejects.toThrow(/stable|safely complete|UNKNOWN/);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["wrong", "another-stack"],
    ["empty", ""],
    ["non-string", 123]
  ])("rejects a %s fresh stack identity before any waiter or command", async (_label, stackName) => {
    const describedStack = stackResult();
    describedStack.Stacks[0].StackName = stackName;
    const aws = successfulAws({ describedStack });

    await expect(bootstrap({ aws })).rejects.toThrow(/StackName|identity|named/i);
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing CloudFormation output", async () => {
    const entries = Object.entries(outputValues).filter(([key]) => key !== "DataVolumeId");
    const aws = successfulAws({ describedStack: stackResult({ entries }) });

    await expect(bootstrap({ aws })).rejects.toThrow(/missing.*DataVolumeId|exactly 10/i);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("rejects an extra CloudFormation output", async () => {
    const entries = [...Object.entries(outputValues), ["Unexpected", "value"]];
    const aws = successfulAws({ describedStack: stackResult({ entries }) });

    await expect(bootstrap({ aws })).rejects.toThrow(/exactly 10/i);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("rejects duplicate CloudFormation output keys", async () => {
    const entries = [...Object.entries(outputValues), ["InstanceId", "i-0fedcba9876543210"]];
    const aws = successfulAws({ describedStack: stackResult({ entries }) });

    await expect(bootstrap({ aws })).rejects.toThrow(/duplicate.*InstanceId/i);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it.each([
    ["missing Outputs", undefined],
    ["non-array Outputs", {}],
    ["empty output key", [["", "value"]]],
    ["empty output value", Object.entries({ ...outputValues, DataVolumeId: "" })],
    ["whitespace output value", Object.entries({ ...outputValues, DataVolumeId: "   " })]
  ])("rejects %s", async (_label, entries) => {
    const describedStack = stackResult();
    describedStack.Stacks[0].Outputs = entries === undefined
      ? undefined
      : Array.isArray(entries)
        ? entries.map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
        : entries;
    const aws = successfulAws({ describedStack });

    await expect(bootstrap({ aws })).rejects.toThrow(/outputs|non-empty/i);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("propagates an EC2 waiter failure without polling or sending a command", async () => {
    const waiterError = new Error("AWS CLI failed (255): waiter timed out");
    const aws = successfulAws();
    aws.text.mockRejectedValueOnce(waiterError);

    await expect(bootstrap({ aws })).rejects.toBe(waiterError);
    expect(aws.json).toHaveBeenCalledTimes(6);
    expect(aws.text).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["InstanceId", { InstanceId: "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:unsafe" }],
    ["DataVolumeId", { DataVolumeId: "vol-01234567;unsafe" }],
    ["HostBootstrapDocumentName", { HostBootstrapDocumentName: "$(unsafe)" }],
    ["CloudWatchAgentConfigParameterName", { CloudWatchAgentConfigParameterName: "/other/parameter" }]
  ])("rejects an unsafe consumed stack output: %s", async (label, overrides) => {
    const entries = Object.entries({ ...outputValues, ...overrides });
    const aws = successfulAws({ describedStack: stackResult({ entries }) });

    await expect(bootstrap({ aws })).rejects.toThrow(new RegExp(label, "i"));
    expect(aws.text).not.toHaveBeenCalled();
  });

  it("polls empty and offline SSM registration at the exact ten-second cadence", async () => {
    const clock = createClock();
    const aws = successfulAws({
      registrations: [
        { InstanceInformationList: [] },
        onlineRegistration({ PingStatus: "ConnectionLost" }),
        onlineRegistration()
      ]
    });

    await expect(bootstrap({ aws, clock })).resolves.toMatchObject({ status: "Success" });
    expect(clock.sleep.mock.calls).toEqual([[10_000], [10_000]]);
    expect(aws.json.mock.calls.filter(([args]) => (
      args[0] === "ssm" && args[1] === "describe-instance-information"
    ))).toHaveLength(3);
  });

  it("accepts Online on the ten-minute boundary without exceeding it", async () => {
    const clock = createClock();
    const registrations = Array.from(
      { length: 60 },
      () => ({ InstanceInformationList: [] })
    );
    registrations.push(onlineRegistration());
    const aws = successfulAws({ registrations });

    await expect(bootstrap({ aws, clock })).resolves.toMatchObject({ status: "Success" });
    expect(clock.sleep).toHaveBeenCalledTimes(60);
    expect(clock.sleep).toHaveBeenCalledWith(10_000);
  });

  it("fails closed after ten minutes without an extra registration call", async () => {
    const clock = createClock();
    const registrations = Array.from(
      { length: 61 },
      () => ({ InstanceInformationList: [] })
    );
    const aws = successfulAws({ registrations });

    await expect(bootstrap({ aws, clock })).rejects.toThrow(/ten minutes|timed out/i);
    expect(clock.sleep).toHaveBeenCalledTimes(60);
    expect(aws.json.mock.calls.filter(([args]) => (
      args[0] === "ssm" && args[1] === "describe-instance-information"
    ))).toHaveLength(61);
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it("rejects Online when the AWS polling call itself returns after the deadline", async () => {
    const clock = createClock();
    const aws = successfulAws();
    const originalJson = aws.json.getMockImplementation();
    aws.json.mockImplementation(async (args) => {
      if (args[0] === "ssm" && args[1] === "describe-instance-information") {
        clock.advance(600_001);
        return onlineRegistration();
      }
      return originalJson(args);
    });

    await expect(bootstrap({ aws, clock })).rejects.toThrow(/ten minutes|deadline|timed out/i);
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it("does not start another poll when sleep crosses the deadline", async () => {
    const clock = createClock();
    clock.sleep.mockImplementation(async () => {
      clock.advance(600_001);
    });
    const aws = successfulAws({
      registrations: [
        { InstanceInformationList: [] },
        onlineRegistration()
      ]
    });

    await expect(bootstrap({ aws, clock })).rejects.toThrow(/ten minutes|deadline|timed out/i);
    expect(aws.json.mock.calls.filter(([args]) => (
      args[0] === "ssm" && args[1] === "describe-instance-information"
    ))).toHaveLength(1);
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it.each([
    ["missing registration response", undefined],
    ["missing registration list", {}],
    ["non-array registration list", { InstanceInformationList: {} }],
    ["paginated registration result", {
      ...onlineRegistration(),
      NextToken: "more-results"
    }],
    ["multiple registered instances", {
      InstanceInformationList: [
        { InstanceId: outputValues.InstanceId, PingStatus: "Online" },
        { InstanceId: "i-0fedcba9876543210", PingStatus: "Online" }
      ]
    }],
    ["wrong registered instance", onlineRegistration({ InstanceId: "i-0fedcba9876543210" })],
    ["missing PingStatus", onlineRegistration({ PingStatus: undefined })],
    ["non-string PingStatus", onlineRegistration({ PingStatus: 1 })]
  ])("rejects malformed SSM state: %s", async (_label, registration) => {
    const aws = successfulAws({ registrations: [registration] });

    await expect(bootstrap({ aws })).rejects.toThrow(/instance information|registration|PingStatus/i);
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(0);
  });

  it.each([
    ["missing command response", undefined],
    ["missing Command", {}],
    ["missing CommandId", { Command: {} }],
    ["empty CommandId", { Command: { CommandId: "" } }],
    ["whitespace CommandId", { Command: { CommandId: "   " } }],
    ["non-string CommandId", { Command: { CommandId: 1 } }]
  ])("requires one non-empty command ID: %s", async (_label, commandResponse) => {
    const aws = successfulAws();
    const originalJson = aws.json.getMockImplementation();
    aws.json.mockImplementation(async (args) => (
      args[1] === "send-command" ? commandResponse : originalJson(args)
    ));

    await expect(bootstrap({ aws })).rejects.toThrow(/CommandId/i);
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command")).toHaveLength(1);
    expect(aws.text.mock.calls.filter(([args]) => args[0] === "ssm")).toHaveLength(0);
  });

  it("rejects a command ID that is not a safe fixed resource reference", async () => {
    const aws = successfulAws({ commandIds: ["ops@example.com"] });

    await expect(bootstrap({ aws })).rejects.toThrow(/CommandId/i);
    expect(aws.text.mock.calls.filter(([args]) => args[0] === "ssm")).toHaveLength(0);
  });

  it("propagates the SSM waiter failure without reading command output", async () => {
    const waiterError = new Error("AWS CLI failed (255): command waiter timed out");
    const aws = successfulAws();
    aws.text
      .mockResolvedValueOnce("")
      .mockRejectedValueOnce(waiterError);

    await expect(bootstrap({ aws })).rejects.toBe(waiterError);
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "get-command-invocation"))
      .toHaveLength(0);
  });

  it.each([
    ["missing invocation", null, /invocation/i],
    ["failed status", { Status: "Failed", ResponseCode: 1 }, /Success/i],
    ["pending status", { Status: "InProgress", ResponseCode: -1 }, /Success/i],
    ["string response code", { Status: "Success", ResponseCode: "0" }, /numeric/i],
    ["nonzero response code", { Status: "Success", ResponseCode: 1 }, /zero/i],
    ["missing response code", { Status: "Success" }, /numeric/i]
  ])("rejects unsafe final invocation: %s", async (_label, invocation, expected) => {
    const aws = successfulAws({ invocation });

    await expect(bootstrap({ aws })).rejects.toThrow(expected);
  });

  it("returns only the allowlisted summary even when AWS responses contain command output", async () => {
    const aws = successfulAws({
      invocation: {
        CommandId: "command-0001",
        InstanceId: outputValues.InstanceId,
        Status: "Success",
        ResponseCode: 0,
        StandardOutputContent: "application-secret-arn and credential output",
        StandardErrorContent: "password and caller ARN output",
        CloudWatchOutputConfig: { CloudWatchOutputEnabled: true }
      }
    });

    const summary = await bootstrap({ aws });
    expect(Reflect.ownKeys(summary)).toEqual([
      "gate",
      "stackStatus",
      "instanceId",
      "commandId",
      "status",
      "responseCode",
      "documentVersion",
      "documentSha256",
      "agentParameterVersion",
      "agentParameterSha256",
      "runtimeSourceRevision",
      "runtimeManifestSha256",
      "runtimeEntrypoint",
      "startedAt",
      "completedAt"
    ]);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/stdout|stderr|standardoutput|standarderror|secret|password|arn|credential/i);
    expect(serialized).not.toContain(outputValues.ApplicationSecretArn);
    expect(serialized).not.toContain(outputValues.ReleaseBucketName);
    expect(serialized).not.toContain(outputValues.BackupBucketName);
    expect(serialized).not.toContain(outputValues.DataVolumeId);
    expect(serialized).not.toContain(outputValues.CloudWatchAgentConfigParameterName);
  });

  it("never constructs a forbidden AWS, application, database, SSH, or DNS command", async () => {
    const aws = successfulAws();

    await bootstrap({ aws });

    const allArguments = [...aws.json.mock.calls, ...aws.text.mock.calls]
      .flatMap(([args]) => args)
      .join(" ");
    expect(allArguments).not.toMatch(
      /get-secret-value|docker(?:\s|-)?compose|prisma|migrat|seed|ssh|route53|change-resource-record-sets|s3(?:api)?\s+(?:cp|sync)|application artifact/i
    );
    expect(aws.json.mock.calls.filter(([args]) => args[1] === "send-command"))
      .toHaveLength(1);
  });

  it("keeps main injectable and prints only the successful allowlisted summary", async () => {
    const { main, runCli } = await import("./aws-staging-bootstrap-host.mjs");
    const parsedArgs = Object.freeze({ parsed: true, sourceRevision: runtimeSourceRevision });
    const aws = successfulAws();
    aws.dispose = vi.fn(async () => {});
    const summary = await bootstrap({ aws });
    const parseArgs = vi.fn(() => parsedArgs);
    const resolveConfig = vi.fn(() => config);
    const createAws = vi.fn(() => aws);
    const runBootstrap = vi.fn(async () => summary);
    const runPreflight = vi.fn();
    const trace = [];
    const guardedRuntimeArtifact = Object.freeze({
      ...runtimeArtifact,
      assertCurrentState: vi.fn(async () => trace.push("runtime:assert"))
    });
    const guardedTemplateArtifact = Object.freeze({
      ...templateArtifact,
      assertCurrentState: vi.fn(async () => trace.push("template:assert"))
    });

    await expect(main(["--injected"], {
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
        return createAws();
      }),
      bootstrapAwsStagingHostImpl: runBootstrap,
      runPreflightImpl: runPreflight
    })).resolves.toBe(summary);
    expect(parseArgs).toHaveBeenCalledWith(["--injected"]);
    expect(resolveConfig).toHaveBeenCalledWith(parsedArgs);
    expect(runBootstrap).toHaveBeenCalledWith({
      aws,
      config,
      runPreflight,
      runtimeArtifact: guardedRuntimeArtifact,
      templateArtifact: guardedTemplateArtifact
    });
    expect(trace).toEqual([
      "runtime:capture",
      "template:capture",
      "runtime:assert",
      "template:assert",
      "credentials"
    ]);
    expect(aws.dispose).toHaveBeenCalledTimes(1);

    const stdout = [];
    const stderr = [];
    const exitCodes = [];
    await expect(runCli({
      argv: ["--injected"],
      execute: vi.fn(async () => summary),
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line),
      setExitCode: (code) => exitCodes.push(code)
    })).resolves.toEqual({ ok: true, summary });
    expect(stdout).toEqual([JSON.stringify(summary)]);
    expect(stderr).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("refuses runtime attestation failure before bootstrap creates an AWS adapter", async () => {
    const { main } = await import("./aws-staging-bootstrap-host.mjs");
    const createAwsCliImpl = vi.fn();
    await expect(main(["--source-revision", runtimeSourceRevision], {
      captureRuntimeArtifactImpl: vi.fn(async () => {
        throw new Error("AWS Staging approved runtime closure became dirty");
      }),
      createAwsCliImpl
    })).rejects.toThrow(/runtime closure.*dirty/i);
    expect(createAwsCliImpl).not.toHaveBeenCalled();
  });

  it("refuses template capture failure before bootstrap creates an AWS adapter", async () => {
    const { main } = await import("./aws-staging-bootstrap-host.mjs");
    const createAwsCliImpl = vi.fn(async () => ({ dispose: vi.fn(async () => undefined) }));
    await expect(main(["--source-revision", runtimeSourceRevision], {
      captureRuntimeArtifactImpl: vi.fn(async () => runtimeArtifact),
      parseAwsStagingBoundArgsImpl: vi.fn(() => ({ sourceRevision: runtimeSourceRevision })),
      resolveAwsStagingConfigImpl: vi.fn(() => config),
      captureTemplateArtifactImpl: vi.fn(async () => {
        throw new Error("AWS Staging tracked template became dirty");
      }),
      createAwsCliImpl,
      bootstrapAwsStagingHostImpl: vi.fn(async () => Object.freeze({ gate: "unexpected" }))
    })).rejects.toThrow(/template.*dirty/i);
    expect(createAwsCliImpl).not.toHaveBeenCalled();
  });

  it("redacts every thrown failure field at the injectable CLI runner boundary", async () => {
    const { runCli } = await import("./aws-staging-bootstrap-host.mjs");
    const sensitiveMarkers = [
      "arn:aws:sts::123456789012:assumed-role/Unsafe/session",
      "ops@example.com",
      "AKIAIOSFODNN7EXAMPLE",
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "FwoGZXIvYXdzEBYaDHVtbXktc3R5bGUtdG9rZW4",
      "AWS-stdout-marker",
      "AWS-stderr-marker",
      "--custom-parameter=unsafe-marker"
    ];
    const unsafeError = Object.assign(
      new Error(sensitiveMarkers.join(" ")),
      {
        stdout: sensitiveMarkers[5],
        stderr: sensitiveMarkers[6],
        args: [sensitiveMarkers[7]]
      }
    );
    const stdout = [];
    const stderr = [];
    const exitCodes = [];

    const result = await runCli({
      argv: [sensitiveMarkers[7]],
      execute: vi.fn(async () => {
        throw unsafeError;
      }),
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line),
      setExitCode: (code) => exitCodes.push(code)
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        gate: "aws-staging-host-bootstrap",
        status: "failed"
      }
    });
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "{\"gate\":\"aws-staging-host-bootstrap\",\"status\":\"failed\"}"
    ]);
    expect(exitCodes).toEqual([1]);
    const emitted = [...stdout, ...stderr].join("\n");
    for (const marker of sensitiveMarkers) {
      expect(emitted).not.toContain(marker);
    }
    expect(emitted).not.toMatch(/stdout|stderr|arn:|@|AKIA|credential|parameter/i);
  });

  it("redacts direct-execution failures and exits nonzero without process.exit", () => {
    const cliUrl = new URL("./aws-staging-bootstrap-host.mjs", import.meta.url);
    const sensitiveMarkers = [
      "arn:aws:iam::123456789012:role/Unsafe",
      "ops@example.com",
      "AKIAIOSFODNN7EXAMPLE",
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "FwoGZXIvYXdzEBYaDHVtbXktc3R5bGUtdG9rZW4",
      "stdout-marker",
      "stderr-marker",
      "custom-parameter-marker"
    ];
    const execution = spawnSync(
      process.execPath,
      [fileURLToPath(cliUrl), "--unsafe-marker", sensitiveMarkers.join(" ")],
      { encoding: "utf8", shell: false }
    );

    expect(execution.status).toBe(1);
    expect(execution.signal).toBeNull();
    expect(execution.stdout).toBe("");
    expect(execution.stderr).toBe(
      "{\"gate\":\"aws-staging-host-bootstrap\",\"status\":\"failed\"}\n"
    );
    const emitted = `${execution.stdout}${execution.stderr}`;
    for (const marker of sensitiveMarkers) {
      expect(emitted).not.toContain(marker);
    }
  });

  it("does not execute the CLI when its module is imported", () => {
    const cliUrl = new URL("./aws-staging-bootstrap-host.mjs", import.meta.url);
    const imported = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", `await import(${JSON.stringify(cliUrl.href)})`],
      { encoding: "utf8", shell: false }
    );

    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toBe("");
  });
});
