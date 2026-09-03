import { describe, expect, it, vi } from "vitest";
import {
  createAwsStagingPreflightSummary,
  runAwsStagingPreflight
} from "./aws-staging-preflight-lib.mjs";

const config = Object.freeze({
  accountId: "123456789012",
  profile: "needo-staging-deployer",
  region: "ap-northeast-1",
  stackName: "needo-staging-infrastructure",
  templatePath: "/repo/deploy/aws-staging/cloudformation.yml"
});

const callerArn = "arn:aws:sts::123456789012:assumed-role/NeedoDeployer/session";
const absentStackError = new Error(
  "AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"
);

function configureList({
  accessType = "sso",
  secretType = accessType,
  profile = config.profile
} = {}) {
  return [
    "      Name                    Value             Type    Location",
    "      ----                    -----             ----    --------",
    `   profile                ${profile}           manual    --profile`,
    `access_key     ****************ABCD              ${accessType}`,
    `secret_key     ****************EFGH              ${secretType}`,
    "    region           ap-northeast-1      config-file    ~/.aws/config"
  ].join("\n");
}

function successfulAws({
  configureOutput = configureList(),
  identity = { Account: config.accountId, Arn: callerArn },
  parameterResult = { Parameter: { Value: "ami-0123" } },
  imageResult = {
    Images: [{
      ImageId: "ami-0123",
      Architecture: "arm64",
      State: "available",
      OwnerId: "137112412989"
    }]
  },
  validationResult = { Parameters: [] },
  stack = absentStackError,
  trace = []
} = {}) {
  const jsonResults = [identity, parameterResult, imageResult, validationResult, stack];
  return {
    text: vi.fn(async (args) => {
      trace.push(`aws.text:${args.join(" ")}`);
      return configureOutput;
    }),
    json: vi.fn(async (args) => {
      trace.push(`aws.json:${args[0]} ${args[1]}`);
      const result = jsonResults.shift();
      if (result instanceof Error) throw result;
      return result;
    })
  };
}

describe("AWS Staging preflight", () => {
  it("creates only the compact redacted CLI summary", () => {
    const summary = createAwsStagingPreflightSummary({
      accountId: config.accountId,
      alertEmail: "ops@example.com",
      callerArn,
      callerKind: "assumed-role",
      region: config.region,
      amiArchitecture: "arm64",
      amiId: "ami-0123",
      templateValidation: "VALID",
      stackState: "ABSENT",
      dnsA: []
    });

    expect(summary).toEqual({
      gate: "aws-staging-preflight",
      accountId: config.accountId,
      callerKind: "assumed-role",
      region: config.region,
      amiArchitecture: "arm64",
      stackState: "ABSENT",
      dnsA: []
    });
    expect(summary).not.toHaveProperty("callerArn");
    expect(summary).not.toHaveProperty("alertEmail");
    expect(Object.isFrozen(summary)).toBe(true);
  });

  it.each(["sso", "assume-role", "custom-process"])(
    "accepts real configure-list credential rows with TYPE %s",
    async (credentialType) => {
      const aws = successfulAws({
        configureOutput: configureList({ accessType: credentialType })
      });

      await expect(runAwsStagingPreflight({
        aws,
        config,
        resolveDns: async () => []
      })).resolves.toMatchObject({ callerKind: "assumed-role" });

      expect(aws.text).toHaveBeenCalledWith(["configure", "list"]);
    }
  );

  it("accepts a matching assumed role, Amazon ARM64 AL2023 AMI, absent stack, and DNS baseline", async () => {
    const trace = [];
    const aws = successfulAws({ trace });
    const resolveDns = vi.fn(async (hostname) => {
      trace.push(`dns:${hostname}`);
      return ["203.0.113.8", "203.0.113.2"];
    });

    const result = await runAwsStagingPreflight({ aws, config, resolveDns });

    expect(result).toEqual({
      accountId: config.accountId,
      callerArn,
      callerKind: "assumed-role",
      region: config.region,
      amiId: "ami-0123",
      amiArchitecture: "arm64",
      templateValidation: "VALID",
      stackState: "ABSENT",
      dnsA: ["203.0.113.2", "203.0.113.8"]
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.dnsA)).toBe(true);
    expect(aws.json.mock.calls).toEqual([
      [["sts", "get-caller-identity"]],
      [[
        "ssm", "get-parameter",
        "--name", "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
      ]],
      [["ec2", "describe-images", "--image-ids", "ami-0123"]],
      [[
        "cloudformation", "validate-template",
        "--template-body", "file:///repo/deploy/aws-staging/cloudformation.yml"
      ]],
      [["cloudformation", "describe-stacks", "--stack-name", config.stackName]]
    ]);
    expect(resolveDns).toHaveBeenCalledWith("staging.needo.dackou.com");
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter",
      "aws.json:ec2 describe-images",
      "aws.json:cloudformation validate-template",
      "aws.json:cloudformation describe-stacks",
      "dns:staging.needo.dackou.com"
    ]);
  });

  it("stops on the first mismatch before template, stack, or DNS work", async () => {
    const trace = [];
    const aws = successfulAws({
      trace,
      imageResult: {
        Images: [{
          ImageId: "ami-0123",
          Architecture: "x86_64",
          State: "available",
          OwnerId: "137112412989"
        }]
      }
    });
    const resolveDns = vi.fn(async (hostname) => {
      trace.push(`dns:${hostname}`);
      return [];
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns }))
      .rejects.toThrow("arm64");
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter",
      "aws.json:ec2 describe-images"
    ]);
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it.each([
    configureList({ accessType: "shared-credentials-file" }),
    configureList({ accessType: "env" }),
    configureList({ accessType: "sso-profile" }),
    configureList({ accessType: "manual", profile: "my-sso-assume-role-custom-process" }),
    configureList({ accessType: "sso", secretType: "shared-credentials-file" })
  ])("rejects unsafe credential TYPE columns", async (configureOutput) => {
    const aws = successfulAws({ configureOutput });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("credential TYPE");
    expect(aws.json).not.toHaveBeenCalled();
  });

  it.each([
    ["arn:aws:iam::123456789012:root", config.accountId, "root"],
    ["arn:aws:sts::999999999999:assumed-role/Other/session", "999999999999", "account"],
    ["arn:aws:iam::123456789012:user/long-lived", config.accountId, "temporary"],
    ["arn:aws:sts::123456789012:federated-user/not-a-role", config.accountId, "assumed-role"]
  ])("rejects unsafe caller %s", async (arn, accountId, expected) => {
    const aws = successfulAws({ identity: { Account: accountId, Arn: arn } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(expected);
    expect(aws.json).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty SSM AMI parameter before calling EC2", async () => {
    const trace = [];
    const aws = successfulAws({
      trace,
      parameterResult: { Parameter: { Value: "   " } }
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("no AMI ID");
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter"
    ]);
  });

  it.each([
    ["zero", []],
    ["multiple", [
      { ImageId: "ami-0123", Architecture: "arm64", State: "available", OwnerId: "137112412989" },
      { ImageId: "ami-0456", Architecture: "arm64", State: "available", OwnerId: "137112412989" }
    ]]
  ])("rejects %s EC2 image results", async (_label, images) => {
    const aws = successfulAws({ imageResult: { Images: images } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("exactly one image");
  });

  it.each([
    ["missing", { Architecture: "arm64", State: "available", OwnerId: "137112412989" }],
    ["mismatched", { ImageId: "ami-wrong", Architecture: "arm64", State: "available", OwnerId: "137112412989" }]
  ])("rejects a %s EC2 ImageId", async (_label, image) => {
    const aws = successfulAws({ imageResult: { Images: [image] } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("ImageId must match");
  });

  it.each([
    [{ Architecture: "x86_64", State: "available", OwnerId: "137112412989" }, "arm64"],
    [{ Architecture: "arm64", State: "pending", OwnerId: "137112412989" }, "available"],
    [{ Architecture: "arm64", State: "available", OwnerId: "123456789012" }, "Amazon owner"]
  ])("rejects an unsafe AMI %#", async (imageOverrides, expected) => {
    const aws = successfulAws({
      imageResult: { Images: [{ ImageId: "ami-0123", ...imageOverrides }] }
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(expected);
    expect(aws.json).toHaveBeenCalledTimes(3);
  });

  it("rejects a relative template path before template validation", async () => {
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config: { ...config, templatePath: "deploy/aws-staging/cloudformation.yml" },
      resolveDns: async () => []
    })).rejects.toThrow("absolute");
    expect(aws.json).toHaveBeenCalledTimes(3);
  });

  it("propagates validate-template failure before describing the stack or resolving DNS", async () => {
    const trace = [];
    const validationError = new Error("AWS CLI failed (254): Template format error");
    const aws = successfulAws({ trace, validationResult: validationError });
    const resolveDns = vi.fn();

    await expect(runAwsStagingPreflight({ aws, config, resolveDns }))
      .rejects.toBe(validationError);
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter",
      "aws.json:ec2 describe-images",
      "aws.json:cloudformation validate-template"
    ]);
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it.each(["CREATE_COMPLETE", "UPDATE_COMPLETE"])(
    "accepts stable existing stack state %s",
    async (stackState) => {
      const aws = successfulAws({ stack: { Stacks: [{ StackStatus: stackState }] } });

      await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
        .resolves.toMatchObject({ stackState });
    }
  );

  it.each([
    null,
    {},
    { Stacks: [] },
    { Stacks: [{ StackStatus: "CREATE_COMPLETE" }, { StackStatus: "UPDATE_COMPLETE" }] },
    { Stacks: [{}] }
  ])("rejects malformed describe-stacks response %#", async (stack) => {
    const aws = successfulAws({ stack });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(/exactly one|UNKNOWN/);
  });

  it.each([
    "CREATE_IN_PROGRESS",
    "UPDATE_FAILED",
    "UPDATE_ROLLBACK_COMPLETE",
    "DELETE_COMPLETE"
  ])("rejects unsafe stack state %s", async (stackState) => {
    const aws = successfulAws({ stack: { Stacks: [{ StackStatus: stackState }] } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(stackState);
  });

  it.each([
    new Error("AWS CLI failed (254): ValidationError"),
    new Error("AWS CLI failed (254): Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): AccessDenied"),
    new Error("AWS CLI failed (255): connection timed out"),
    new Error("AWS CLI failed (254): AccessDenied: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist; AccessDenied"),
    new Error("Wrapper: AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id another-stack does not exist")
  ])("propagates a describe-stacks error that is not the exact absence signal", async (stackError) => {
    const aws = successfulAws({ stack: stackError });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toBe(stackError);
  });

  it("matches an exact absent-stack error when the configured name contains regexp syntax", async () => {
    const escapedNameConfig = { ...config, stackName: "needo-staging-[draft]" };
    const aws = successfulAws({
      stack: new Error(
        "AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-[draft] does not exist"
      )
    });

    await expect(runAwsStagingPreflight({
      aws,
      config: escapedNameConfig,
      resolveDns: async () => []
    })).resolves.toMatchObject({ stackState: "ABSENT" });
  });

  it.each(["ENODATA", "ENOTFOUND"])("maps DNS %s to an empty baseline", async (code) => {
    const dnsError = Object.assign(new Error(code), { code });
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: vi.fn().mockRejectedValue(dnsError)
    })).resolves.toMatchObject({ dnsA: [] });
  });

  it.each([
    null,
    {},
    "203.0.113.10",
    ["203.0.113.10", 203]
  ])("rejects invalid DNS A-record result shape %#", async (dnsResult) => {
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: vi.fn().mockResolvedValue(dnsResult)
    })).rejects.toThrow("invalid result");
  });

  it("propagates every other DNS failure", async () => {
    const dnsError = Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" });
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: vi.fn().mockRejectedValue(dnsError)
    })).rejects.toBe(dnsError);
  });
});
