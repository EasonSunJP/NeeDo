import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAwsCli as createAwsCliAdapter,
  createFrozenAwsCli
} from "./aws-staging-cli.mjs";

const TEST_AWS_EXECUTABLE = "/trusted/aws-cli-v2/aws";
const VALID_LOGIN_CACHE_FILE = `${"a".repeat(64)}.json`;
const fixtureRoots = [];

function createAwsCli(options) {
  return createAwsCliAdapter({ executablePath: TEST_AWS_EXECUTABLE, ...options });
}

async function createLoginFixture({ configText } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "needo-aws-cli-test-"));
  fixtureRoots.push(root);
  const sourceHome = path.join(root, "source-home");
  const loginCache = path.join(sourceHome, ".aws", "login", "cache");
  const binDirectory = path.join(root, "bin");
  const executablePath = path.join(sourceHome, ".local", "share", "aws-cli", "aws");
  const pathExecutablePath = path.join(binDirectory, "aws");
  await fs.mkdir(loginCache, { recursive: true });
  await fs.mkdir(binDirectory, { recursive: true });
  await fs.mkdir(path.dirname(executablePath), { recursive: true });
  await fs.writeFile(path.join(sourceHome, ".aws", "config"), configText ?? [
    "[profile needo-staging-deployer]",
    "login_session = arn:aws:sts::123456789012:assumed-role/AccountFullAccessRole/eason-session",
    "region = ap-northeast-1",
    ""
  ].join("\n"), { mode: 0o600 });
  await fs.writeFile(executablePath, "#!/bin/sh\n", { mode: 0o700 });
  await fs.writeFile(pathExecutablePath, "#!/bin/sh\n", { mode: 0o700 });
  return {
    root,
    sourceHome,
    loginCache,
    executablePath,
    pathExecutablePath,
    environment: { PATH: binDirectory },
    temporaryRoot: root,
    userInfoImpl: () => ({ homedir: sourceHome, uid: process.getuid() })
  };
}

function successfulLoginResolver() {
  const temporaryCredentials = {
    Version: 1,
    AccessKeyId: ["AS", "IA", "A".repeat(16)].join(""),
    SecretAccessKey: "s".repeat(40),
    SessionToken: "t".repeat(80),
    Expiration: "2030-01-01T00:00:00.000Z"
  };
  return vi.fn((_file, args, _options, callback) => {
    if (args[0] === "--version") {
      callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
      return;
    }
    if (args[0] === "configure" && args[1] === "list") {
      callback(null, "access_key : ****************ABCD : login :\nsecret_key : ****************WXYZ : login :\n", "");
      return;
    }
    callback(null, JSON.stringify(temporaryCredentials), "");
  });
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => (
    fs.rm(root, { recursive: true, force: true })
  )));
});

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
  ["s3api", "get-bucket-policy"],
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
  it("accepts the STS assumed-role login_session emitted by AWS CLI login", async () => {
    const fixture = await createLoginFixture({
      configText: [
        "[profile needo-staging-deployer]",
        "login_session = arn:aws:sts::123456789012:assumed-role/AccountFullAccessRole/eason-session",
        "region = ap-northeast-1",
        ""
      ].join("\n")
    });
    const temporaryCredentials = {
      Version: 1,
      AccessKeyId: ["AS", "IA", "A".repeat(16)].join(""),
      SecretAccessKey: "s".repeat(40),
      SessionToken: "t".repeat(80),
      Expiration: "2030-01-01T00:00:00.000Z"
    };
    const execFileImpl = vi.fn((_file, args, _options, callback) => {
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      if (args[0] === "configure" && args[1] === "list") {
        callback(null, "access_key : ****************ABCD : login :\nsecret_key : ****************WXYZ : login :\n", "");
        return;
      }
      callback(null, JSON.stringify(temporaryCredentials), "");
    });

    const aws = await createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });

    expect(execFileImpl.mock.calls.some(([, args]) => (
      args[0] === "configure" && args[1] === "export-credentials"
    ))).toBe(true);
    await aws.dispose();
  });

  it("ignores a self-reported AWS CLI v2 executable placed only on caller PATH", async () => {
    const fixture = await createLoginFixture();
    const invokedFiles = [];
    const temporaryCredentials = {
      Version: 1,
      AccessKeyId: ["AS", "IA", "A".repeat(16)].join(""),
      SecretAccessKey: "s".repeat(40),
      SessionToken: "t".repeat(80),
      Expiration: "2030-01-01T00:00:00.000Z"
    };
    const execFileImpl = vi.fn((file, args, _options, callback) => {
      invokedFiles.push(file);
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      if (args[0] === "configure" && args[1] === "list") {
        callback(null, "access_key : ****************ABCD : login :\nsecret_key : ****************WXYZ : login :\n", "");
        return;
      }
      callback(null, JSON.stringify(temporaryCredentials), "");
    });

    const aws = await createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });

    expect(new Set(invokedFiles)).toEqual(new Set([await fs.realpath(fixture.executablePath)]));
    expect(invokedFiles).not.toContain(await fs.realpath(fixture.pathExecutablePath));
    await aws.dispose();
  });

  it("rejects a group-readable source config before credential resolution", async () => {
    const fixture = await createLoginFixture();
    await fs.chmod(path.join(fixture.sourceHome, ".aws", "config"), 0o640);
    const execFileImpl = successfulLoginResolver();

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    })).rejects.toThrow(/source config.*0600/i);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it("rejects a writable canonical source HOME even with an independent system CLI", async () => {
    const fixture = await createLoginFixture();
    await fs.chmod(fixture.sourceHome, 0o770);
    const execFileImpl = successfulLoginResolver();

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      approvedExecutableCandidates: [{
        candidate: "/bin/sh",
        trustRoot: "/",
        expectedUid: process.getuid(),
        systemOwned: true
      }],
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    })).rejects.toThrow(/source HOME.*group\/world-writable|source HOME.*trust/i);
    expect(execFileImpl).not.toHaveBeenCalled();
    expect((await fs.readdir(fixture.root)).filter((entry) => (
      entry.startsWith("needo-aws-cli-")
    ))).toEqual([]);
  });

  it("re-attests source identities after CLI attestation and before the first resolver", async () => {
    const fixture = await createLoginFixture();
    const configPath = path.join(fixture.sourceHome, ".aws", "config");
    const displacedPath = `${configPath}.old`;
    const configText = await fs.readFile(configPath, "utf8");
    const execFileImpl = successfulLoginResolver();
    execFileImpl.mockImplementation((_file, args, _options, callback) => {
      if (args[0] === "--version") {
        void (async () => {
          await fs.rename(configPath, displacedPath);
          await fs.writeFile(configPath, configText, { mode: 0o600 });
          callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        })();
        return;
      }
      callback(null, "unexpected resolver invocation", "");
    });

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    })).rejects.toThrow(/source.*changed after attestation/i);
    expect(execFileImpl).toHaveBeenCalledTimes(1);
    expect((await fs.readdir(fixture.root)).filter((entry) => (
      entry.startsWith("needo-aws-cli-")
    ))).toEqual([]);
  });

  it("re-attests login-cache identities immediately before the second resolver", async () => {
    const fixture = await createLoginFixture();
    const cachePath = path.join(fixture.loginCache, VALID_LOGIN_CACHE_FILE);
    const displacedPath = `${cachePath}.old`;
    await fs.writeFile(cachePath, "{}", { mode: 0o600 });
    const execFileImpl = successfulLoginResolver();
    execFileImpl.mockImplementation((_file, args, _options, callback) => {
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      if (args[0] === "configure" && args[1] === "list") {
        void (async () => {
          await fs.rename(cachePath, displacedPath);
          await fs.writeFile(cachePath, "{}", { mode: 0o600 });
          callback(null, "access_key : ****************ABCD : login :\nsecret_key : ****************WXYZ : login :\n", "");
        })();
        return;
      }
      callback(null, "unexpected resolver invocation", "");
    });

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    })).rejects.toThrow(/source.*changed after attestation/i);
    expect(execFileImpl).toHaveBeenCalledTimes(2);
  });

  it("accepts owner-only 0600 credential entries in the owner-controlled login cache", async () => {
    const fixture = await createLoginFixture();
    await fs.writeFile(
      path.join(fixture.loginCache, VALID_LOGIN_CACHE_FILE),
      "{}",
      { mode: 0o600 }
    );
    const execFileImpl = successfulLoginResolver();

    const aws = await createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });

    expect(execFileImpl).toHaveBeenCalledTimes(3);
    await aws.dispose();
  });

  it("rejects a 0640 login cache entry with an otherwise valid name", async () => {
    const fixture = await createLoginFixture();
    await fs.writeFile(
      path.join(fixture.loginCache, VALID_LOGIN_CACHE_FILE),
      "{}",
      { mode: 0o640 }
    );
    const execFileImpl = successfulLoginResolver();

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    })).rejects.toThrow(/login cache entry.*0600/i);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid login cache entry name even when its mode is 0600", async () => {
    const fixture = await createLoginFixture();
    await fs.writeFile(path.join(fixture.loginCache, "session.json"), "{}", { mode: 0o600 });
    const execFileImpl = successfulLoginResolver();

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl
    })).rejects.toThrow(/login cache entry.*0600/i);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it.each(["directory", "symlink"])(
    "rejects a validly named login cache %s entry",
    async (entryType) => {
      const fixture = await createLoginFixture();
      const entry = path.join(fixture.loginCache, VALID_LOGIN_CACHE_FILE);
      if (entryType === "directory") {
        await fs.mkdir(entry, { mode: 0o700 });
      } else {
        await fs.symlink(path.join(fixture.sourceHome, ".aws", "config"), entry);
      }
      const execFileImpl = successfulLoginResolver();

      await expect(createFrozenAwsCli({
        profile: "needo-staging-deployer",
        region: "ap-northeast-1",
        execFileImpl,
        environment: fixture.environment,
        temporaryRoot: fixture.temporaryRoot,
        userInfoImpl: fixture.userInfoImpl
      })).rejects.toThrow(/login cache entry.*0600/i);
      expect(execFileImpl).not.toHaveBeenCalled();
    }
  );

  it("rejects a group-writable login cache directory before credential resolution", async () => {
    const fixture = await createLoginFixture();
    await fs.chmod(fixture.loginCache, 0o775);
    const execFileImpl = successfulLoginResolver();

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl
    })).rejects.toThrow(/login cache.*not group\/world-writable/i);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it("revalidates the pinned executable trust chain before credential resolution", async () => {
    const fixture = await createLoginFixture();
    const execFileImpl = successfulLoginResolver();
    execFileImpl.mockImplementation((_file, args, _options, callback) => {
      if (args[0] === "--version") {
        fs.chmod(path.dirname(fixture.executablePath), 0o770).then(() => {
          callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        });
        return;
      }
      callback(null, "unexpected resolver invocation", "");
    });

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    })).rejects.toThrow("Trusted AWS CLI executable changed after attestation");
    expect(execFileImpl).toHaveBeenCalledTimes(1);
  });

  it("re-hashes the exact pinned executable before a frozen operation", async () => {
    const fixture = await createLoginFixture();
    const execFileImpl = successfulLoginResolver();
    const aws = await createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });
    await fs.writeFile(fixture.executablePath, "#!/bin/zsh\n", { mode: 0o700 });

    await expect(aws.json(["sts", "get-caller-identity"]))
      .rejects.toThrow("Trusted AWS CLI executable changed after attestation");
    expect(execFileImpl).toHaveBeenCalledTimes(3);
    await aws.dispose();
  });

  it("pins one absolute attested AWS CLI v2 executable before resolving credentials", async () => {
    const fixture = await createLoginFixture();
    const invokedFiles = [];
    const invokedArguments = [];
    const temporaryCredentials = {
      Version: 1,
      AccessKeyId: ["AS", "IA", "A".repeat(16)].join(""),
      SecretAccessKey: "s".repeat(40),
      SessionToken: "t".repeat(80),
      Expiration: "2030-01-01T00:00:00.000Z"
    };
    const execFileImpl = vi.fn((file, args, _options, callback) => {
      invokedFiles.push(file);
      invokedArguments.push(args);
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      if (args[0] === "configure" && args[1] === "list") {
        callback(null, "access_key : ****************ABCD : login :\nsecret_key : ****************WXYZ : login :\n", "");
        return;
      }
      if (args[0] === "configure" && args[1] === "export-credentials") {
        callback(null, JSON.stringify(temporaryCredentials), "");
        return;
      }
      callback(null, "{}", "");
    });

    const aws = await createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });
    fixture.environment.PATH = path.join(fixture.root, "hostile-bin");
    await aws.json(["sts", "get-caller-identity"]);

    const pinnedExecutablePath = await fs.realpath(fixture.executablePath);
    expect(invokedFiles).toEqual(Array(invokedFiles.length).fill(pinnedExecutablePath));
    expect(path.isAbsolute(invokedFiles[0])).toBe(true);
    expect(invokedArguments[0]).toEqual(["--version"]);
    expect(invokedArguments.findIndex((args) => args[0] === "configure")).toBeGreaterThan(0);
  });

  it("rejects an AWS CLI older than the login-capable v2 boundary before credential resolution", async () => {
    const fixture = await createLoginFixture();
    const execFileImpl = vi.fn((_file, args, _options, callback) => {
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.31.99 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      callback(null, "unexpected credential resolver output", "");
    });

    await expect(createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: fixture.environment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl
    })).rejects.toThrow(/AWS CLI v2\.32 or newer is required/);
    expect(execFileImpl).toHaveBeenCalledTimes(1);
  });

  it("isolates hostile models, HOME config, trust, proxies, and history in both CLI phases", async () => {
    const loginSession = "arn:aws:sts::123456789012:assumed-role/AccountFullAccessRole/eason-session";
    const fixture = await createLoginFixture({
      configText: [
        "[default]",
        "cli_history = enabled",
        "ca_bundle = /hostile/default-ca.pem",
        "endpoint_url = https://default-endpoint.example.invalid",
        "credential_process = /hostile/default-provider --emit-credentials",
        "",
        "[profile needo-staging-deployer]",
        `login_session = ${loginSession}`,
        "region = us-east-1",
        "cli_history = enabled",
        "ca_bundle = /hostile/profile-ca.pem",
        "endpoint_url = https://profile-endpoint.example.invalid",
        "credential_process = /hostile/profile-provider --emit-credentials",
        ""
      ].join("\n")
    });
    const hostileHome = path.join(fixture.root, "hostile-home");
    await fs.mkdir(path.join(hostileHome, ".aws", "models"), { recursive: true });
    await fs.mkdir(path.join(fixture.sourceHome, ".aws", "models"), { recursive: true });
    const hostileEnvironment = {
      ...fixture.environment,
      HOME: hostileHome,
      AWS_DATA_PATH: "/hostile/aws-data",
      AWS_CONFIG_FILE: "/hostile/config",
      AWS_SHARED_CREDENTIALS_FILE: "/hostile/credentials",
      AWS_CLI_HISTORY_FILE: "/hostile/history.db",
      AWS_CA_BUNDLE: "/hostile/aws-ca.pem",
      REQUESTS_CA_BUNDLE: "/hostile/requests-ca.pem",
      CURL_CA_BUNDLE: "/hostile/curl-ca.pem",
      SSL_CERT_FILE: "/hostile/ssl-cert.pem",
      SSL_CERT_DIR: "/hostile/ssl-certs",
      HTTP_PROXY: "http://upper-http.example.invalid",
      http_proxy: "http://lower-http.example.invalid",
      HtTp_PrOxY: "http://mixed-http.example.invalid",
      HTTPS_PROXY: "http://upper-https.example.invalid",
      https_proxy: "http://lower-https.example.invalid",
      HtTpS_PrOxY: "http://mixed-https.example.invalid",
      ALL_PROXY: "socks5://upper-all.example.invalid",
      all_proxy: "socks5://lower-all.example.invalid",
      AlL_PrOxY: "socks5://mixed-all.example.invalid",
      NO_PROXY: "169.254.169.254",
      no_proxy: "localhost",
      No_PrOxY: "example.invalid",
      AWS_ACCESS_KEY_ID: "INHERITEDACCESSKEY",
      AWS_SECRET_ACCESS_KEY: "inherited-secret-value",
      AWS_SESSION_TOKEN: "inherited-session-token"
    };
    const temporaryCredentials = {
      Version: 1,
      AccessKeyId: ["AS", "IA", "A".repeat(16)].join(""),
      SecretAccessKey: "s".repeat(40),
      SessionToken: "t".repeat(80),
      Expiration: "2030-01-01T00:00:00.000Z"
    };
    const calls = [];
    const execFileImpl = vi.fn((file, args, options, callback) => {
      calls.push({ file, args: [...args], environment: { ...options.env } });
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      if (args[0] === "configure" && args[1] === "list") {
        callback(null, "access_key : ****************ABCD : login :\nsecret_key : ****************WXYZ : login :\n", "");
        return;
      }
      if (args[0] === "configure" && args[1] === "export-credentials") {
        callback(null, JSON.stringify(temporaryCredentials), "");
        return;
      }
      callback(null, "{}", "");
    });

    const aws = await createFrozenAwsCli({
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      execFileImpl,
      environment: hostileEnvironment,
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });
    await aws.json(["sts", "get-caller-identity"]);

    const resolverCalls = calls.filter(({ args }) => args[0] === "configure");
    const frozenCall = calls.find(({ args }) => args[0] === "sts");
    const resolverAllowedKeys = [
      "AWS_CLI_AUTO_PROMPT", "AWS_CLI_HISTORY_FILE", "AWS_CONFIG_FILE", "AWS_DATA_PATH",
      "AWS_EC2_METADATA_DISABLED", "AWS_IGNORE_CONFIGURED_ENDPOINT_URLS",
      "AWS_LOGIN_CACHE_DIRECTORY", "AWS_PAGER", "AWS_SHARED_CREDENTIALS_FILE",
      "HOME", "LANG", "LC_ALL"
    ].sort();
    const frozenAllowedKeys = [
      "AWS_ACCESS_KEY_ID", "AWS_CLI_AUTO_PROMPT", "AWS_CLI_HISTORY_FILE", "AWS_CONFIG_FILE",
      "AWS_DATA_PATH", "AWS_EC2_METADATA_DISABLED", "AWS_IGNORE_CONFIGURED_ENDPOINT_URLS",
      "AWS_PAGER", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
      "AWS_SHARED_CREDENTIALS_FILE", "HOME", "LANG", "LC_ALL"
    ].sort();
    expect(resolverCalls).toHaveLength(2);
    for (const { environment: observed } of resolverCalls) {
      expect(Object.keys(observed).sort()).toEqual(resolverAllowedKeys);
      expect(observed.AWS_LOGIN_CACHE_DIRECTORY).toBe(await fs.realpath(fixture.loginCache));
    }
    expect(Object.keys(frozenCall.environment).sort()).toEqual(frozenAllowedKeys);
    expect(frozenCall.environment).not.toHaveProperty("AWS_LOGIN_CACHE_DIRECTORY");
    const hostileValues = new Set(Object.values(hostileEnvironment));
    for (const { environment: observed } of calls) {
      for (const value of Object.values(observed)) expect(hostileValues.has(value)).toBe(false);
    }

    const resolverConfig = await fs.readFile(resolverCalls[0].environment.AWS_CONFIG_FILE, "utf8");
    const frozenConfig = await fs.readFile(frozenCall.environment.AWS_CONFIG_FILE, "utf8");
    expect(resolverConfig).toBe([
      "[profile needo-staging-deployer]",
      `login_session = ${loginSession}`,
      "region = ap-northeast-1",
      "cli_history = disabled",
      ""
    ].join("\n"));
    expect(frozenConfig).toBe([
      "[default]",
      "region = ap-northeast-1",
      "cli_history = disabled",
      ""
    ].join("\n"));
    expect(`${resolverConfig}\n${frozenConfig}`).not.toMatch(
      /enabled|ca_bundle|endpoint_url|credential_process|hostile/i
    );
    expect(await fs.readFile(frozenCall.environment.AWS_SHARED_CREDENTIALS_FILE, "utf8")).toBe("");
    expect(await fs.readdir(frozenCall.environment.AWS_DATA_PATH)).toEqual([]);
    expect(await fs.stat(frozenCall.environment.HOME).then((value) => value.mode & 0o777)).toBe(0o700);
    expect(await fs.stat(frozenCall.environment.AWS_CONFIG_FILE).then((value) => value.mode & 0o777)).toBe(0o600);
    expect(await fs.stat(frozenCall.environment.AWS_SHARED_CREDENTIALS_FILE).then((value) => value.mode & 0o777)).toBe(0o600);

    const privateRoot = path.dirname(frozenCall.environment.HOME);
    await aws.dispose();
    await aws.dispose();
    await expect(fs.stat(privateRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(Promise.resolve().then(() => aws.json(["sts", "get-caller-identity"])))
      .rejects.toThrow(/disposed/);
  });

  it("returns one fixed credential-resolver failure without provider output", async () => {
    const fixture = await createLoginFixture();
    const sensitive = [
      "AKIAIOSFODNN7EXAMPLE",
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "FwoGZXIvYXdzEBYaDHVtbXktc3R5bGUtdG9rZW4",
      "provider-stdout-marker",
      "provider-stderr-marker"
    ];
    const execFileImpl = vi.fn((_file, args, _options, callback) => {
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      const error = Object.assign(new Error(sensitive.join(" ")), {
        code: 254,
        stdout: sensitive[3],
        stderr: sensitive[4]
      });
      callback(error, sensitive[3], sensitive.join(" "));
    });

    let failure;
    try {
      await createFrozenAwsCli({
        profile: "needo-staging-deployer",
        region: "ap-northeast-1",
        execFileImpl,
        environment: fixture.environment,
        temporaryRoot: fixture.temporaryRoot,
        userInfoImpl: fixture.userInfoImpl
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "AWS_CLI_CREDENTIAL_RESOLUTION_FAILED",
      message: "AWS CLI credential resolution failed"
    });
    const serialized = JSON.stringify({
      code: failure?.code,
      message: failure?.message,
      stack: failure?.stack,
      stdout: failure?.stdout,
      stderr: failure?.stderr
    });
    for (const marker of sensitive) expect(serialized).not.toContain(marker);
    expect((await fs.readdir(fixture.root)).sort()).toEqual(["bin", "source-home"]);
  });

  it("redacts a synchronous credential-resolver throw and removes private state", async () => {
    const fixture = await createLoginFixture();
    const sensitive = "AKIAIOSFODNN7EXAMPLE sync-provider-secret-marker";
    const execFileImpl = vi.fn((_file, args, _options, callback) => {
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
      throw Object.assign(new Error(sensitive), {
        stdout: sensitive,
        stderr: sensitive
      });
    });

    let failure;
    try {
      await createFrozenAwsCli({
        profile: "needo-staging-deployer",
        region: "ap-northeast-1",
        execFileImpl,
        environment: fixture.environment,
        temporaryRoot: fixture.temporaryRoot,
        userInfoImpl: fixture.userInfoImpl
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "AWS_CLI_CREDENTIAL_RESOLUTION_FAILED",
      message: "AWS CLI credential resolution failed"
    });
    expect(JSON.stringify(failure, Object.getOwnPropertyNames(failure))).not.toContain(sensitive);
    expect((await fs.readdir(fixture.root)).sort()).toEqual(["bin", "source-home"]);
  });

  it("uses an explicit uncredentialed environment allowlist instead of inheriting process state", async () => {
    let observedEnvironment;
    const execFileImpl = vi.fn((_file, _args, options, callback) => {
      observedEnvironment = options.env;
      callback(null, "profile p\n", "");
    });
    const environment = {
      PATH: "/usr/bin",
      HOME: "/tmp/hostile-home",
      AWS_DATA_PATH: "/tmp/hostile-models",
      AWS_CLI_HISTORY_FILE: "/tmp/hostile-history.db",
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
      AWS_ENDPOINT_URL_STS: "https://sts.example.invalid",
      AWS_USE_FIPS_ENDPOINT: "true",
      AWS_USE_DUALSTACK_ENDPOINT: "true",
      AWS_STS_REGIONAL_ENDPOINTS: "legacy",
      AWS_ACCOUNT_ID_ENDPOINT_MODE: "required",
      AWS_METADATA_SERVICE_ENDPOINT: "http://127.0.0.1:9999",
      AWS_CA_BUNDLE: "/tmp/foreign-ca.pem",
      REQUESTS_CA_BUNDLE: "/tmp/requests-ca.pem",
      CURL_CA_BUNDLE: "/tmp/curl-ca.pem",
      SSL_CERT_FILE: "/tmp/ssl-cert.pem",
      SSL_CERT_DIR: "/tmp/ssl-certs",
      HTTP_PROXY: "http://proxy.example.invalid",
      http_proxy: "http://lower-proxy.example.invalid",
      HTTPS_PROXY: "http://secure-proxy.example.invalid",
      https_proxy: "http://lower-secure-proxy.example.invalid",
      ALL_PROXY: "socks5://proxy.example.invalid",
      all_proxy: "socks5://lower-proxy.example.invalid",
      NO_PROXY: "169.254.169.254",
      no_proxy: "localhost",
      aws_ignore_configured_endpoint_urls: "false"
    };
    const aws = createAwsCli({
      profile: "p",
      region: "ap-northeast-1",
      execFileImpl,
      environment
    });

    await aws.text(["configure", "list"]);

    expect(observedEnvironment).toEqual({
      AWS_CLI_AUTO_PROMPT: "off",
      AWS_CLI_HISTORY_FILE: "/dev/null",
      AWS_CONFIG_FILE: "/dev/null",
      AWS_DATA_PATH: "/nonexistent/needo-aws-cli-models",
      AWS_EC2_METADATA_DISABLED: "true",
      AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true",
      AWS_PAGER: "",
      AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
      HOME: "/nonexistent/needo-aws-cli-home",
      LANG: "C",
      LC_ALL: "C"
    });
  });

  it("freezes one exported temporary credential tuple for every operation", async () => {
    const fixture = await createLoginFixture();
    const temporaryCredentials = {
      Version: 1,
      AccessKeyId: ["AS", "IA", "A".repeat(16)].join(""),
      SecretAccessKey: "s".repeat(40),
      SessionToken: "t".repeat(80),
      Expiration: "2030-01-01T00:00:00.000Z"
    };
    const operationEnvironments = [];
    const execFileImpl = vi.fn((_file, args, options, callback) => {
      if (args[0] === "--version") {
        callback(null, "aws-cli/2.36.38 Python/3.13 Darwin/25 exe/arm64\n", "");
        return;
      }
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
        ...fixture.environment,
        AWS_ENDPOINT_URL_STS: "https://sts.example.invalid",
        AWS_PROFILE: "foreign"
      },
      temporaryRoot: fixture.temporaryRoot,
      userInfoImpl: fixture.userInfoImpl,
      now: () => Date.parse("2029-01-01T00:00:00.000Z")
    });

    await expect(aws.text(["configure", "list"])).resolves.toContain("login");
    await aws.json(["sts", "get-caller-identity"]);
    await aws.json(["ec2", "describe-images"]);

    expect(execFileImpl).toHaveBeenCalledTimes(5);
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
    expect(Reflect.ownKeys(aws).sort()).toEqual(["dispose", "json", "text"]);
    expect(execFileImpl.mock.calls.slice(3).every(([, args]) => !args.includes("--profile")))
      .toBe(true);
    await aws.dispose();
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
      TEST_AWS_EXECUTABLE,
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

  it("treats an inline template as opaque only for the two approved CloudFormation operations", async () => {
    const templateBody = await fs.readFile(
      new URL("../deploy/aws-staging/cloudformation.yml", import.meta.url),
      "utf8"
    );
    const execFileImpl = vi.fn((_file, _args, _options, callback) => {
      callback(null, "{}\n", "");
    });
    const aws = createAwsCli({
      profile: "p",
      region: "ap-northeast-1",
      execFileImpl
    });

    await expect(aws.json([
      "cloudformation", "validate-template", "--template-body", templateBody
    ])).resolves.toEqual({});
    await expect(aws.json([
      "cloudformation", "create-stack", "--stack-name", "needo-staging-infrastructure",
      "--template-body", templateBody
    ])).resolves.toEqual({});
    expect(() => aws.json(["secretsmanager", "get-secret-value"]))
      .toThrow("forbidden");
    expect(execFileImpl).toHaveBeenCalledTimes(2);
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
      TEST_AWS_EXECUTABLE,
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
      const args = service === "cloudformation"
        && (operation === "validate-template" || operation === "create-stack")
        ? [service, operation, "--template-body", "{}"]
        : service === "s3api" && operation === "get-bucket-policy"
          ? [service, operation, "--bucket", "needo-release-example", "--expected-bucket-owner", "123456789012"]
        : [service, operation];

      await expect(aws.json(args)).resolves.toEqual({});
      expect(execFileImpl).toHaveBeenCalledTimes(1);
      expect(execFileImpl.mock.calls[0][1].slice(0, 2)).toEqual([service, operation]);
    }
  );

  it.each([
    ["missing all required arguments", ["s3api", "get-bucket-policy"]],
    ["missing expected owner", ["s3api", "get-bucket-policy", "--bucket", "needo-release-example"]],
    ["wrong owner flag", ["s3api", "get-bucket-policy", "--bucket", "needo-release-example", "--owner", "123456789012"]],
    ["non-account owner", ["s3api", "get-bucket-policy", "--bucket", "needo-release-example", "--expected-bucket-owner", "123"]],
    ["extra argument", ["s3api", "get-bucket-policy", "--bucket", "needo-release-example", "--expected-bucket-owner", "123456789012", "--no-paginate"]]
  ])("rejects get-bucket-policy shape with %s", (_label, args) => {
    const execFileImpl = vi.fn();
    const aws = createAwsCli({ profile: "p", region: "ap-northeast-1", execFileImpl });
    expect(() => aws.json(args)).toThrow(/shape|not allowed/i);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

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
      TEST_AWS_EXECUTABLE,
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
