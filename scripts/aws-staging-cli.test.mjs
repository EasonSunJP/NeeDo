import { describe, expect, it, vi } from "vitest";
import { createAwsCli } from "./aws-staging-cli.mjs";

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

  it.each([
    ["--secret-string", "value"],
    ["--secret-binary", "value"]
  ])("rejects %s before invoking the process runner", (flag, value) => {
    const execFileImpl = vi.fn();
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    expect(() => aws.text(["cloudformation", "deploy", flag, value])).toThrow("forbidden");
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
