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

function successfulAws({
  credentialSource = "sso_session    needo-staging",
  identity = { Account: config.accountId, Arn: callerArn },
  image = {
    ImageId: "ami-0123",
    Architecture: "arm64",
    State: "available",
    OwnerId: "137112412989"
  },
  stack = absentStackError
} = {}) {
  const stackResult = stack instanceof Error
    ? vi.fn().mockRejectedValueOnce(stack)
    : vi.fn().mockResolvedValueOnce(stack);
  return {
    text: vi.fn().mockResolvedValue(credentialSource),
    json: vi.fn()
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce({ Parameter: { Value: "ami-0123" } })
      .mockResolvedValueOnce({ Images: [image] })
      .mockResolvedValueOnce({ Parameters: [] })
      .mockImplementationOnce(stackResult)
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

  it.each([
    "sso_session    needo-staging",
    "sso_start_url  https://example.awsapps.com/start",
    "access_key ****************ABCD sso",
    "credential_process /redacted/provider",
    "access_key ****************ABCD assume-role"
  ])("accepts the temporary credential source marker %s", async (credentialSource) => {
    const aws = successfulAws({ credentialSource });

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: async () => []
    })).resolves.toMatchObject({ callerKind: "assumed-role" });

    expect(aws.text).toHaveBeenCalledWith(["configure", "list"]);
  });

  it("accepts a matching assumed role, Amazon ARM64 AL2023 AMI, absent stack, and DNS baseline", async () => {
    const aws = successfulAws();
    const resolveDns = vi.fn().mockResolvedValue(["203.0.113.8", "203.0.113.2"]);

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
  });

  it.each([
    ["access_key ****************ABCD shared-credentials-file", "shared-credentials"],
    ["access_key ****************ABCD env", "temporary"],
    ["profile needo-staging-deployer manual", "temporary"],
    ["profile my_sso_session manual", "temporary"],
    ["sso_session needo\naccess_key ****************ABCD shared-credentials-file", "shared-credentials"]
  ])("rejects unsafe credential sourcing: %s", async (credentialSource, expected) => {
    const aws = successfulAws({ credentialSource });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(expected);
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

  it.each([
    [{ Architecture: "x86_64", State: "available", OwnerId: "137112412989" }, "arm64"],
    [{ Architecture: "arm64", State: "pending", OwnerId: "137112412989" }, "available"],
    [{ Architecture: "arm64", State: "available", OwnerId: "123456789012" }, "Amazon owner"]
  ])("rejects an unsafe AMI %#", async (imageOverrides, expected) => {
    const aws = successfulAws({
      image: { ImageId: "ami-0123", ...imageOverrides }
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(expected);
    expect(aws.json).toHaveBeenCalledTimes(3);
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
    new Error("AWS CLI failed (255): connection timed out")
  ])("propagates a describe-stacks error that is not the exact absence signal", async (stackError) => {
    const aws = successfulAws({ stack: stackError });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toBe(stackError);
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
