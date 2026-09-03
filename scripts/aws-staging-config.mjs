import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..");
const requiredFlags = new Map([
  ["--profile", "profile"],
  ["--account-id", "accountId"],
  ["--region", "region"],
  ["--hostname", "hostname"],
  ["--alert-email", "alertEmail"],
  ["--budget-amount", "budgetAmount"],
  ["--budget-unit", "budgetUnit"]
]);
const deploymentApprovalFlags = new Map([
  ["--template-sha256", "templateSha256"],
  ["--source-revision", "sourceRevision"]
]);

export const AWS_STAGING_REGIONS = Object.freeze([
  "ap-northeast-1",
  "ap-southeast-2"
]);

const awsStagingRegionSet = new Set(AWS_STAGING_REGIONS);
const APPROVED_AWS_STAGING_HOSTNAME = "staging.needo.life";

export function requireAwsStagingRegion(value) {
  if (typeof value !== "string" || !awsStagingRegionSet.has(value)) {
    throw new Error(
      `AWS Staging region must be one of: ${AWS_STAGING_REGIONS.join(", ")}`
    );
  }
  return value;
}

export function requireAwsStagingHostname(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("AWS Staging hostname must be a non-empty lower-case ASCII DNS name");
  }
  if (value.length > 253 || value !== value.toLowerCase() || !value.startsWith("staging.")) {
    throw new Error("AWS Staging hostname must be a lower-case ASCII DNS name starting with staging.");
  }

  const labels = value.split(".");
  const validLabels = labels.length >= 3 && labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
  const topLevelDomain = labels.at(-1) ?? "";
  if (!validLabels || !/^[a-z]{2,63}$/.test(topLevelDomain)) {
    throw new Error("AWS Staging hostname must have a registrable-looking DNS suffix");
  }
  if (value !== APPROVED_AWS_STAGING_HOSTNAME) {
    throw new Error(`AWS Staging hostname must be exactly ${APPROVED_AWS_STAGING_HOSTNAME}`);
  }

  return value;
}

function normalizeAlertEmail(value) {
  const rawValue = String(value || "");
  if (!rawValue || rawValue.trim() !== rawValue) {
    throw new Error("A valid exact alert email is required");
  }
  const atIndex = rawValue.indexOf("@");
  if (atIndex <= 0 || atIndex !== rawValue.lastIndexOf("@")) {
    throw new Error("A valid alert email is required");
  }
  const localPart = rawValue.slice(0, atIndex);
  const domain = rawValue.slice(atIndex + 1).toLowerCase();
  const normalized = `${localPart}@${domain}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid alert email is required");
  }
  return normalized;
}

export function parseAwsStagingArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = requiredFlags.get(flag);
    if (!key) throw new Error(`Unknown AWS Staging flag: ${flag || "<missing>"}`);
    if (parsed[key] !== undefined) throw new Error(`Duplicate AWS Staging flag: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    parsed[key] = value;
  }
  if (!parsed.accountId) throw new Error("--account-id is required");
  for (const [flag, key] of requiredFlags) {
    if (!parsed[key]) throw new Error(`${flag} is required`);
  }
  return { ...parsed, owner: "needo" };
}

export function parseAwsStagingDeployArgs(argv) {
  const baseArgs = [];
  const approvals = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const approvalKey = deploymentApprovalFlags.get(flag);
    if (!approvalKey) {
      baseArgs.push(flag, argv[index + 1]);
      continue;
    }
    if (approvals[approvalKey] !== undefined) {
      throw new Error(`Duplicate AWS Staging flag: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    approvals[approvalKey] = value;
  }

  const parsed = parseAwsStagingArgs(baseArgs);
  if (!approvals.templateSha256) throw new Error("--template-sha256 is required");
  if (!/^[0-9a-f]{64}$/.test(approvals.templateSha256)) {
    throw new Error("--template-sha256 must be a lower-case SHA-256 digest");
  }
  if (!approvals.sourceRevision) throw new Error("--source-revision is required");
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(approvals.sourceRevision)) {
    throw new Error("--source-revision must be a full lower-case Git revision");
  }

  return Object.freeze({ ...parsed, ...approvals });
}

export function resolveAwsStagingConfig(input) {
  const profile = String(input.profile || "").trim();
  const accountId = String(input.accountId || "").trim();
  const region = requireAwsStagingRegion(input.region);
  const owner = String(input.owner || "").trim();
  const hostname = requireAwsStagingHostname(input.hostname);
  const alertEmail = normalizeAlertEmail(input.alertEmail);
  const budgetAmount = String(input.budgetAmount || "").trim();
  const budgetUnitInput = String(input.budgetUnit || "").trim();
  const budgetUnit = budgetUnitInput.toUpperCase();

  if (!profile || profile === "default") throw new Error("A named temporary AWS profile is required");
  if (!/^\d{12}$/.test(accountId)) throw new Error("A 12-digit AWS account ID is required");
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(owner)) throw new Error("Invalid owner tag");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail)) throw new Error("A valid alert email is required");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(budgetAmount) || Number(budgetAmount) <= 0) {
    throw new Error("A positive decimal budget amount is required");
  }
  if (!/^[A-Z]{3}$/.test(budgetUnit) || budgetUnitInput !== budgetUnit) {
    throw new Error("A three-letter billing currency is required");
  }

  return Object.freeze({
    alertEmail,
    budgetAmount,
    budgetUnit,
    accountId,
    environment: "staging",
    hostname,
    owner,
    profile,
    region,
    stackName: "needo-staging-infrastructure",
    templatePath: path.join(repoRoot, "deploy/aws-staging/cloudformation.yml")
  });
}

export function maskEmail(value) {
  const [local, domain] = value.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
