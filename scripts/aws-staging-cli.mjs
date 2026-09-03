import { execFile } from "node:child_process";

const MAX_BUFFER = 4 * 1024 * 1024;
const REMOVED_AWS_ENVIRONMENT_KEYS = new Set([
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN",
  "AWS_CREDENTIAL_EXPIRATION",
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN",
  "AWS_ROLE_SESSION_NAME",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  "AWS_LOGIN_CACHE_DIRECTORY",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_SDK_LOAD_CONFIG"
]);
const FORBIDDEN_ARGUMENTS = new Set([
  "getsecretvalue",
  "awssecretaccesskey",
  "awssessiontoken",
  "secretstring",
  "secretbinary",
  "withdecryption",
  "password"
]);
const ALLOWED_SERVICE_OPERATIONS = new Set([
  "configure list",
  "sts get-caller-identity",
  "ssm get-parameter",
  "ssm describe-instance-information",
  "ssm send-command",
  "ssm get-command-invocation",
  "ssm list-tags-for-resource",
  "ssm wait",
  "ec2 describe-images",
  "ec2 describe-instances",
  "ec2 describe-addresses",
  "ec2 describe-security-groups",
  "ec2 describe-volumes",
  "ec2 describe-tags",
  "ec2 wait",
  "cloudformation validate-template",
  "cloudformation describe-stacks",
  "cloudformation create-stack",
  "cloudformation wait",
  "cloudformation list-stack-resources",
  "s3api get-public-access-block",
  "s3api get-bucket-encryption",
  "s3api get-bucket-versioning",
  "s3api get-bucket-lifecycle-configuration",
  "s3api get-bucket-tagging",
  "iam list-role-tags",
  "secretsmanager describe-secret",
  "secretsmanager list-secret-version-ids",
  "logs describe-log-groups",
  "logs list-tags-for-resource",
  "cloudwatch describe-alarms",
  "cloudwatch list-tags-for-resource",
  "sns list-tags-for-resource",
  "sns list-subscriptions-by-topic",
  "budgets describe-budget",
  "budgets describe-notifications-for-budget",
  "budgets describe-subscribers-for-notification",
  "budgets list-tags-for-resource",
  "resourcegroupstaggingapi get-resources"
]);
const CALLER_SUPPLIED_GLOBAL_OPTIONS = new Set([
  "--debug",
  "--endpoint-url",
  "--no-verify-ssl",
  "--no-paginate",
  "--output",
  "--query",
  "--profile",
  "--region",
  "--version",
  "--color",
  "--no-sign-request",
  "--ca-bundle",
  "--cli-read-timeout",
  "--cli-connect-timeout",
  "--cli-binary-format",
  "--no-cli-pager",
  "--cli-auto-prompt",
  "--no-cli-auto-prompt"
]);

function assertSafeArguments(args) {
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    throw new TypeError("AWS CLI arguments must be an array of strings");
  }

  const canonicalArguments = args.map((argument) => argument.toLowerCase().replace(/[-_]/g, ""));
  const isAllowedConfigureList = args.length === 2
    && args[0] === "configure"
    && args[1] === "list";
  if (canonicalArguments.some((argument) => [...FORBIDDEN_ARGUMENTS].some((forbidden) => argument.includes(forbidden)))
    || (canonicalArguments.some((argument) => argument.startsWith("configure")) && !isAllowedConfigureList)) {
    throw new Error("forbidden AWS CLI credential or secret surface");
  }
}

function assertAllowedOperation(args) {
  const operation = `${args[0] ?? ""} ${args[1] ?? ""}`;
  if (!ALLOWED_SERVICE_OPERATIONS.has(operation)) {
    throw new Error("AWS CLI service operation is not allowed");
  }
  if (args.some((argument) => {
    const normalized = argument.toLowerCase();
    return [...CALLER_SUPPLIED_GLOBAL_OPTIONS].some((option) => (
      normalized === option || normalized.startsWith(`${option}=`)
    ));
  })) {
    throw new Error("caller-supplied AWS CLI global flags are not allowed");
  }
}

function finalStderrLine(stderr) {
  const lines = String(stderr ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) ?? "unknown error").slice(0, 500);
}

function sanitizedEnvironment(environment) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("AWS CLI environment must be an object");
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(environment)) {
    const upperKey = key.toUpperCase();
    if (value === undefined
      || REMOVED_AWS_ENVIRONMENT_KEYS.has(upperKey)
      || upperKey.startsWith("AWS_ENDPOINT_URL")) {
      continue;
    }
    sanitized[key] = value;
  }
  sanitized.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = "true";
  sanitized.AWS_EC2_METADATA_DISABLED = "true";
  return sanitized;
}

function invoke(execFileImpl, profile, region, args, output, {
  environment,
  includeProfile = true,
  credentialExpiresAt,
  now = Date.now
}) {
  assertSafeArguments(args);
  assertAllowedOperation(args);
  if (credentialExpiresAt !== undefined && now() >= credentialExpiresAt) {
    throw new Error("The frozen AWS CLI credential session has expired");
  }
  const fullArgs = [
    ...args,
    ...(includeProfile ? ["--profile", profile] : []),
    "--region", region,
    "--output", output,
    "--no-cli-pager"
  ];

  return new Promise((resolve, reject) => {
    execFileImpl(
      "aws",
      fullArgs,
      { shell: false, maxBuffer: MAX_BUFFER, env: environment },
      (error, stdout, stderr) => {
        if (error) {
          const code = error.code ?? "unknown";
          reject(new Error(`AWS CLI failed (${code}): ${finalStderrLine(stderr)}`));
          return;
        }
        resolve({ stdout: String(stdout ?? "") });
      }
    );
  });
}

function requireExportedTemporaryCredentials(rawCredentials, now) {
  let parsed;
  try {
    parsed = JSON.parse(rawCredentials);
  } catch {
    throw new Error("AWS CLI temporary credential export was malformed");
  }
  const accessKeyId = parsed?.AccessKeyId;
  const secretAccessKey = parsed?.SecretAccessKey;
  const sessionToken = parsed?.SessionToken;
  const expiration = parsed?.Expiration;
  const expiresAt = Date.parse(expiration);
  if (parsed?.Version !== 1
    || typeof accessKeyId !== "string" || !/^[A-Z0-9]{16,128}$/.test(accessKeyId)
    || typeof secretAccessKey !== "string" || !/^[\x21-\x7e]{20,256}$/.test(secretAccessKey)
    || typeof sessionToken !== "string" || !/^[\x21-\x7e]{20,8192}$/.test(sessionToken)
    || typeof expiration !== "string" || !Number.isFinite(expiresAt)
    || expiresAt <= now()) {
    throw new Error("AWS CLI must export one unexpired temporary credential session");
  }
  return Object.freeze({ accessKeyId, secretAccessKey, sessionToken, expiresAt });
}

function invokeCredentialResolver(execFileImpl, args, environment) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      "aws",
      args,
      { shell: false, maxBuffer: MAX_BUFFER, env: environment },
      (error, stdout, stderr) => {
        if (error) {
          const code = error.code ?? "unknown";
          reject(new Error(`AWS CLI credential resolution failed (${code}): ${finalStderrLine(stderr)}`));
          return;
        }
        resolve(String(stdout ?? ""));
      }
    );
  });
}

function createAwsCliInternal({
  profile,
  region,
  execFileImpl,
  environment,
  includeProfile,
  configureListOutput,
  credentialExpiresAt,
  now
}) {
  return Object.freeze({
    json(args) {
      return invoke(execFileImpl, profile, region, args, "json", {
        environment,
        includeProfile,
        credentialExpiresAt,
        now
      }).then(({ stdout }) => JSON.parse(stdout));
    },
    text(args) {
      assertSafeArguments(args);
      assertAllowedOperation(args);
      if (configureListOutput !== undefined
        && args.length === 2
        && args[0] === "configure"
        && args[1] === "list") {
        return Promise.resolve(configureListOutput.trim());
      }
      return invoke(execFileImpl, profile, region, args, "text", {
        environment,
        includeProfile,
        credentialExpiresAt,
        now
      }).then(({ stdout }) => stdout.trim());
    }
  });
}

export function createAwsCli({
  profile,
  region,
  execFileImpl = execFile,
  environment = process.env
}) {
  return createAwsCliInternal({
    profile,
    region,
    execFileImpl,
    environment: sanitizedEnvironment(environment),
    includeProfile: true
  });
}

export async function createFrozenAwsCli({
  profile,
  region,
  execFileImpl = execFile,
  environment = process.env,
  now = Date.now
}) {
  const resolverEnvironment = sanitizedEnvironment(environment);
  const configureListOutput = await invokeCredentialResolver(execFileImpl, [
    "configure", "list",
    "--profile", profile,
    "--region", region,
    "--output", "text",
    "--no-cli-pager"
  ], resolverEnvironment);
  const exported = await invokeCredentialResolver(execFileImpl, [
    "configure", "export-credentials",
    "--profile", profile,
    "--format", "process",
    "--no-cli-pager"
  ], resolverEnvironment);
  const credentials = requireExportedTemporaryCredentials(exported, now);
  const lockedEnvironment = {
    ...resolverEnvironment,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken
  };
  return createAwsCliInternal({
    profile,
    region,
    execFileImpl,
    environment: lockedEnvironment,
    includeProfile: false,
    configureListOutput,
    credentialExpiresAt: credentials.expiresAt,
    now
  });
}
