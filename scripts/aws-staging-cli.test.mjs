import { describe, expect, it, vi } from "vitest";
import { createAwsCli } from "./aws-staging-cli.mjs";

const STAGING_AWS_SERVICE_OPERATIONS = Object.freeze([
  ["sts", "get-caller-identity"],
  ["ssm", "get-parameter"],
  ["ssm", "describe-instance-information"],
  ["ssm", "send-command"],
  ["ssm", "get-command-invocation"],
  ["ssm", "list-tags-for-resource"],
  ["ssm", "wait"],
  ["ec2", "describe-images"],
  ["ec2", "describe-instances"],
  ["ec2", "describe-addresses"],
  ["ec2", "describe-security-groups"],
  ["ec2", "describe-volumes"],
  ["ec2", "describe-tags"],
  ["ec2", "wait"],
  ["cloudformation", "validate-template"],
  ["cloudformation", "describe-stacks"],
  ["cloudformation", "deploy"],
  ["cloudformation", "list-stack-resources"],
  ["s3api", "get-public-access-block"],
  ["s3api", "get-bucket-encryption"],
  ["s3api", "get-bucket-versioning"],
  ["s3api", "get-bucket-lifecycle-configuration"],
  ["s3api", "get-bucket-tagging"],
  ["iam", "list-role-tags"],
  ["secretsmanager", "describe-secret"],
  ["secretsmanager", "list-secret-version-ids"],
  ["logs", "describe-log-groups"],
  ["logs", "list-tags-for-resource"],
  ["cloudwatch", "describe-alarms"],
  ["cloudwatch", "list-tags-for-resource"],
  ["sns", "list-tags-for-resource"],
  ["sns", "list-subscriptions-by-topic"],
  ["budgets", "describe-budget"],
  ["budgets", "describe-notifications-for-budget"],
  ["budgets", "describe-subscribers-for-notification"],
  ["budgets", "list-tags-for-resource"],
  ["resourcegroupstaggingapi", "get-resources"]
]);

describe("AWS CLI adapter", () => {
  it("adds the named profile/region and parses JSON without a shell", async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) => {
      callback(null, '{"Account":"123456789012"}\n', "");
    });
    const aws = createAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl
    });
    await expect(aws.json(["sts", "get-caller-identity"])).resolves.toEqual({
      Account: "123456789012"
    });
    expect(execFileImpl).toHaveBeenCalledWith(
      "aws",
      [
        "sts", "get-caller-identity",
        "--profile", "needo-staging-deployer",
        "--region", "ap-northeast-1",
        "--output", "json",
        "--no-cli-pager"
      ],
      expect.objectContaining({ shell: false }),
      expect.any(Function)
    );
  });

  it("rejects credential and secret-value command surfaces", () => {
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1" });
    expect(() => aws.text(["secretsmanager", "get-secret-value"])).toThrow("forbidden");
    expect(() => aws.text(["configure", "set", "aws_secret_access_key", "x"])).toThrow("forbidden");
  });

  it("rejects configure wherever it appears before invoking the process runner", () => {
    const execFileImpl = vi.fn();
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    expect(() => aws.text(["--profile", "x", "configure", "set", "aws_access_key_id", "value"])).toThrow("forbidden");
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it("allows only configure list through the direct runner", async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) => {
      callback(null, "profile p\n", "");
    });
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    await expect(aws.text(["configure", "list"])).resolves.toBe("profile p");
    expect(execFileImpl).toHaveBeenCalledWith(
      "aws",
      ["configure", "list", "--profile", "p", "--region", "ap-northeast-1", "--output", "text", "--no-cli-pager"],
      expect.objectContaining({ shell: false }),
      expect.any(Function)
    );
  });

  it.each(STAGING_AWS_SERVICE_OPERATIONS)(
    "allows the staging flow operation %s %s",
    async (service, operation) => {
      const execFileImpl = vi.fn((_file, _args, _options, callback) => {
        callback(null, "{}", "");
      });
      const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });

      await expect(aws.json([service, operation])).resolves.toEqual({});
      expect(execFileImpl).toHaveBeenCalledTimes(1);
      expect(execFileImpl.mock.calls[0][1].slice(0, 2)).toEqual([service, operation]);
    }
  );

  it.each([
    ["STS credential minting", ["sts", "assume-role"]],
    ["STS session-token minting", ["sts", "get-session-token"]],
    ["SSO role credential retrieval", ["sso", "get-role-credentials"]],
    ["unknown service", ["lambda", "list-functions"]],
    ["unknown service operation", ["cloudformation", "delete-stack"]],
    ["global-option-prefixed staging operation", ["--profile", "other", "sts", "get-caller-identity"]]
  ])("rejects %s synchronously before invoking the process runner", (_label, args) => {
    const execFileImpl = vi.fn();
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });

    expect(() => aws.json(args)).toThrow("not allowed");
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["uppercase configure/list", ["CONFIGURE", "list"]],
    ["hyphenated configure", ["configure-list"]],
    ["underscored configure", ["configure_list"]],
    ["configure get", ["configure", "get"]],
    ["configure import", ["configure", "import"]],
    ["configure sso", ["configure", "sso"]],
    ["configure list with an extra argument", ["configure", "list", "extra"]],
    ["global-option-prefixed configure list", ["--profile", "x", "configure", "list"]]
  ])("rejects raw non-exact configure form: %s", (_name, args) => {
    const execFileImpl = vi.fn();
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    expect(() => aws.text(args)).toThrow("forbidden");
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["--secret-string", "value"],
    ["--secret-binary", "value"]
  ])("rejects %s before invoking the process runner", (flag, value) => {
    const execFileImpl = vi.fn();
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    expect(() => aws.text(["cloudformation", "deploy", flag, value])).toThrow("forbidden");
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["hyphenated flag", "--with-decryption"],
    ["hyphenated equals form", "--with-decryption=true"],
    ["uppercase underscored equals form", "--WITH_DECRYPTION=TRUE"]
  ])("rejects decrypted SSM parameter reads with %s before invoking the process runner", (_name, flag) => {
    const execFileImpl = vi.fn();
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });

    expect(() => aws.json(["ssm", "get-parameter", "--name", "/needo/staging/example", flag])).toThrow("forbidden");
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it("allows metadata-only Secrets Manager reads through the direct runner", async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) => {
      callback(null, "Secret metadata\n", "");
    });
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    await expect(aws.text(["secretsmanager", "describe-secret", "--secret-id", "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:staging"])).resolves.toBe("Secret metadata");
    expect(execFileImpl).toHaveBeenCalledWith(
      "aws",
      [
        "secretsmanager", "describe-secret", "--secret-id", "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:staging",
        "--profile", "p", "--region", "ap-northeast-1", "--output", "text", "--no-cli-pager"
      ],
      expect.objectContaining({ shell: false }),
      expect.any(Function)
    );
  });

  it("returns a sanitized failure without command stdout", async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) => {
      const error = Object.assign(new Error("process failed"), { code: 254 });
      callback(error, "possibly-sensitive-output", "AccessDenied");
    });
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    await expect(aws.json(["sts", "get-caller-identity"])).rejects.toThrow(
      "AWS CLI failed (254): AccessDenied"
    );
  });
});
