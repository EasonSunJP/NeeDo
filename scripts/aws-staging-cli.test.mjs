import { describe, expect, it, vi } from "vitest";
import {
  createAwsCli,
  createFrozenAwsCli
} from "./aws-staging-cli.mjs";

const STAGING_AWS_SERVICE_OPERATIONS = Object.freeze([
  ["sts", "get-caller-identity"],
  ["ssm", "get-parameter"],
  ["ssm", "get-document"],
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
  ["cloudformation", "create-stack"],
  ["cloudformation", "wait"],
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
  it("neutralizes inherited credential, profile, config, and endpoint overrides", async () => {
    let observedEnvironment;
    const execFileImpl = vi.fn((_file, _args, options, callback) => {
      observedEnvironment = options.env;
      callback(null, "profile p\n", "");
    });
    const environment = {
      PATH: "/usr/bin",
      AWS_ACCESS_KEY_ID: "inherited-access",
      AWS_SECRET_ACCESS_KEY: "inherited-secret",
      AWS_SESSION_TOKEN: "inherited-token",
      AWS_PROFILE: "foreign-profile",
      AWS_DEFAULT_PROFILE: "foreign-default-profile",
      AWS_CONFIG_FILE: "/tmp/foreign-config",
      AWS_SHARED_CREDENTIALS_FILE: "/tmp/foreign-credentials",
      AWS_WEB_IDENTITY_TOKEN_FILE: "/tmp/foreign-token",
      AWS_ROLE_ARN: "arn:aws:iam::999999999999:role/foreign",
      AWS_ENDPOINT_URL: "https://example.invalid",
      AWS_ENDPOINT_URL_STS: "https://sts.example.invalid"
    };
    const aws = createAwsCli({
      profile: "p",
      region: "ap-northeast-1",
      execFileImpl,
      environment
    });

    await aws.text(["configure", "list"]);

    expect(observedEnvironment.PATH).toBe("/usr/bin");
    expect(observedEnvironment.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS).toBe("true");
    expect(observedEnvironment.AWS_EC2_METADATA_DISABLED).toBe("true");
    expect(Object.keys(observedEnvironment).some((key) => (
      key.startsWith("AWS_ENDPOINT_URL")
      || [
        "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
        "AWS_PROFILE", "AWS_DEFAULT_PROFILE", "AWS_CONFIG_FILE",
        "AWS_SHARED_CREDENTIALS_FILE", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN"
      ].includes(key)
    ))).toBe(false);
  });

  it("freezes one exported temporary credential tuple for every operation", async () => {
    const temporaryCredentials = {
      Version: 1,
      AccessKeyId: ["AS", "IA", "A".repeat(16)].join(""),
      SecretAccessKey: "s".repeat(40),
      SessionToken: "t".repeat(80),
      Expiration: "2030-01-01T00:00:00.000Z"
    };
    const operationEnvironments = [];
    const execFileImpl = vi.fn((_file, args, options, callback) => {
      if (args[0] === "configure" && args[1] === "list") {
        callback(null, [
          "NAME       : VALUE                    : TYPE             : LOCATION",
          "access_key : ****************ABCD     : login            :",
          "secret_key : ****************WXYZ     : login            :"
        ].join("\n"), "");
        return;
      }
      if (args[0] === "configure" && args[1] === "export-credentials") {
        callback(null, JSON.stringify(temporaryCredentials), "");
        return;
      }
      operationEnvironments.push(options.env);
      callback(null, "{}", "");
    });
    const aws = await createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: {
        PATH: "/usr/bin",
        AWS_ENDPOINT_URL_STS: "https://sts.example.invalid",
        AWS_PROFILE: "foreign"
      },
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });

    await expect(aws.text(["configure", "list"])).resolves.toContain("login");
    await aws.json(["sts", "get-caller-identity"]);
    await aws.json(["ec2", "describe-images"]);

    expect(execFileImpl).toHaveBeenCalledTimes(4);
    expect(operationEnvironments).toHaveLength(2);
    expect(operationEnvironments.every((value) => (
      Boolean(value.AWS_ACCESS_KEY_ID)
      && Boolean(value.AWS_SECRET_ACCESS_KEY)
      && Boolean(value.AWS_SESSION_TOKEN)
      && value.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS === "true"
      && !Object.hasOwn(value, "AWS_PROFILE")
      && !Object.hasOwn(value, "AWS_ENDPOINT_URL_STS")
    ))).toBe(true);
    const fingerprints = operationEnvironments.map((value) => [
      value.AWS_ACCESS_KEY_ID,
      value.AWS_SECRET_ACCESS_KEY,
      value.AWS_SESSION_TOKEN
    ].join("\0"));
    expect(new Set(fingerprints).size).toBe(1);
    expect(Reflect.ownKeys(aws).sort()).toEqual(["json", "text"]);
    expect(execFileImpl.mock.calls.slice(2).every(([, args]) => !args.includes("--profile")))
      .toBe(true);
  });

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
    ["create-or-update deployment", ["cloudformation", "deploy"]],
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
