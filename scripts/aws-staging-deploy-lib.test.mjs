import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  deployAwsStagingInfrastructure
} from "./aws-staging-deploy-lib.mjs";
import { writeAwsStagingEnvironmentEvidence } from "./aws-staging-deploy.mjs";

const config = Object.freeze({
  accountId: "123456789012",
  alertEmail: "ops@example.com",
  budgetAmount: "20000",
  budgetUnit: "JPY",
  environment: "staging",
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
  BudgetName: "needo-staging-monthly"
});

function stackResult({ status = "CREATE_COMPLETE", outputs = outputValues } = {}) {
  return {
    Stacks: [{
      StackName: config.stackName,
      StackStatus: status,
      Outputs: Object.entries(outputs).map(([OutputKey, OutputValue]) => ({
        OutputKey,
        OutputValue
      }))
    }]
  };
}

function preflight(overrides = {}) {
  return Object.freeze({
    accountId: config.accountId,
    callerArn: "arn:aws:sts::123456789012:assumed-role/NeedoDeployer/session",
    callerKind: "assumed-role",
    region: config.region,
    amiId: "ami-0123",
    amiArchitecture: "arm64",
    templateValidation: "VALID",
    stackState: "ABSENT",
    dnsA: Object.freeze(["203.0.113.2", "203.0.113.8"]),
    ...overrides
  });
}

function successfulAws({ describedStack = stackResult(), describedInstances, trace = [] } = {}) {
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
      if (args[0] === "cloudformation") return describedStack;
      if (args[0] === "ec2") return instanceResult;
      throw new Error(`Unexpected AWS call: ${args.join(" ")}`);
    })
  };
}

async function deploy({
  aws = successfulAws(),
  preflightResult = preflight(),
  resolveDns,
  resolvedConfig = config
} = {}) {
  return deployAwsStagingInfrastructure({
    aws,
    config: resolvedConfig,
    resolveDns: resolveDns ?? vi.fn(async () => ["203.0.113.8", "203.0.113.2"]),
    runPreflight: vi.fn(async () => preflightResult)
  });
}

describe("AWS Staging CloudFormation deployment", () => {
  it("runs preflight in-process and invokes only the exact approved deployment boundary", async () => {
    const trace = [];
    const aws = successfulAws({ trace });
    const resolveDns = vi.fn(async (hostname) => {
      trace.push(`dns:${hostname}`);
      return ["203.0.113.8", "203.0.113.2", "203.0.113.8"];
    });
    const runPreflight = vi.fn(async (input) => {
      trace.push("preflight");
      expect(input).toEqual({ aws, config, resolveDns });
      return preflight();
    });

    const evidence = await deployAwsStagingInfrastructure({
      aws,
      config,
      resolveDns,
      runPreflight
    });

    expect(aws.text).toHaveBeenCalledWith([
      "cloudformation", "deploy",
      "--stack-name", "needo-staging-infrastructure",
      "--template-file", config.templatePath,
      "--parameter-overrides",
      "AlertEmail=ops@example.com",
      "BudgetAmount=20000",
      "BudgetUnit=JPY",
      "Owner=needo",
      "--capabilities", "CAPABILITY_NAMED_IAM",
      "--no-fail-on-empty-changeset",
      "--tags",
      "Project=needo",
      "Environment=staging",
      "Owner=needo",
      "ManagedBy=cloudformation"
    ]);
    expect(aws.json.mock.calls).toEqual([
      [["cloudformation", "describe-stacks", "--stack-name", config.stackName]],
      [["ec2", "describe-instances", "--instance-ids", outputValues.InstanceId]]
    ]);
    expect(trace).toEqual([
      "preflight",
      "dns:staging.needo.dackou.com",
      "aws.text:cloudformation deploy",
      "aws.json:cloudformation describe-stacks",
      "aws.json:ec2 describe-instances"
    ]);
    expect(evidence).toEqual({
      scope: "environment-only",
      accountId: config.accountId,
      region: config.region,
      stackName: config.stackName,
      stackStatus: "CREATE_COMPLETE",
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

  it.each([
    [{ accountId: "999999999999" }, "account"],
    [{ region: "us-east-1" }, "region"]
  ])("refuses a preflight configuration mismatch %#", async (overrides, expected) => {
    const aws = successfulAws();
    await expect(deploy({ aws, preflightResult: preflight(overrides) }))
      .rejects.toThrow(expected);
    expect(aws.text).not.toHaveBeenCalled();
  });

  it.each([
    "CREATE_IN_PROGRESS",
    "UPDATE_FAILED",
    "UPDATE_ROLLBACK_COMPLETE",
    "DELETE_COMPLETE"
  ])("refuses unsafe preflight stack state %s", async (stackState) => {
    const aws = successfulAws();
    await expect(deploy({ aws, preflightResult: preflight({ stackState }) }))
      .rejects.toThrow(stackState);
    expect(aws.text).not.toHaveBeenCalled();
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
      expect(aws.json).toHaveBeenCalledTimes(1);
    }
  );

  it("accepts UPDATE_COMPLETE as the other stable final state", async () => {
    const aws = successfulAws({ describedStack: stackResult({ status: "UPDATE_COMPLETE" }) });
    await expect(deploy({ aws })).resolves.toMatchObject({ stackStatus: "UPDATE_COMPLETE" });
  });

  it("refuses any missing required Task 2 output", async () => {
    const { HostVerificationDocumentName: _missing, ...incompleteOutputs } = outputValues;
    const aws = successfulAws({ describedStack: stackResult({ outputs: incompleteOutputs }) });

    await expect(deploy({ aws })).rejects.toThrow("HostVerificationDocumentName");
    expect(aws.json).toHaveBeenCalledTimes(1);
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
      expect(aws.json).toHaveBeenCalledTimes(1);
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
  it("uses a private directory, atomic rename, and a private final file", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-"));
    const outputDirectory = path.join(temporaryRoot, "outputs", "aws-staging");
    const evidence = {
      scope: "environment-only",
      applicationDeployed: false,
      migrationRun: false,
      seedRun: false,
      dnsModified: false
    };

    try {
      const resultPath = await writeAwsStagingEnvironmentEvidence({
        evidence,
        outputDirectory
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

  it("refuses an output-directory symlink instead of writing outside the evidence path", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-staging-link-"));
    const outsideDirectory = path.join(temporaryRoot, "outside");
    const outputDirectory = path.join(temporaryRoot, "aws-staging");
    await fs.mkdir(outsideDirectory);
    await fs.symlink(outsideDirectory, outputDirectory);

    try {
      await expect(writeAwsStagingEnvironmentEvidence({
        evidence: {
          scope: "environment-only",
          applicationDeployed: false,
          migrationRun: false,
          seedRun: false,
          dnsModified: false
        },
        outputDirectory
      })).rejects.toThrow("real directory");
      await expect(fs.readdir(outsideDirectory)).resolves.toEqual([]);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
