import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
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
  BudgetName: "needo-staging-infrastructure-monthly-cost"
});

function evidenceFixture(overrides = {}) {
  return {
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
    dnsModified: false,
    ...overrides
  };
}

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
