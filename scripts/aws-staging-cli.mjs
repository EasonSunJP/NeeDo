import { execFile } from "node:child_process";

const MAX_BUFFER = 4 * 1024 * 1024;
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
  "cloudformation deploy",
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

function invoke(execFileImpl, profile, region, args, output) {
  assertSafeArguments(args);
  assertAllowedOperation(args);
  const fullArgs = [
    ...args,
    "--profile", profile,
    "--region", region,
    "--output", output,
    "--no-cli-pager"
  ];

  return new Promise((resolve, reject) => {
    execFileImpl(
      "aws",
      fullArgs,
      { shell: false, maxBuffer: MAX_BUFFER },
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

export function createAwsCli({ profile, region, execFileImpl = execFile }) {
  return Object.freeze({
    json(args) {
      return invoke(execFileImpl, profile, region, args, "json").then(({ stdout }) => JSON.parse(stdout));
    },
    text(args) {
      return invoke(execFileImpl, profile, region, args, "text").then(({ stdout }) => stdout.trim());
    }
  });
}
