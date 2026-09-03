import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..");
const requiredFlags = new Map([
  ["--profile", "profile"],
  ["--account-id", "accountId"],
  ["--alert-email", "alertEmail"],
  ["--budget-amount", "budgetAmount"],
  ["--budget-unit", "budgetUnit"]
]);

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
  return { ...parsed, region: "ap-northeast-1", owner: "needo" };
}

export function resolveAwsStagingConfig(input) {
  const profile = String(input.profile || "").trim();
  const accountId = String(input.accountId || "").trim();
  const region = String(input.region || "").trim();
  const owner = String(input.owner || "").trim();
  const alertEmail = String(input.alertEmail || "").trim().toLowerCase();
  const budgetAmount = String(input.budgetAmount || "").trim();
  const budgetUnitInput = String(input.budgetUnit || "").trim();
  const budgetUnit = budgetUnitInput.toUpperCase();

  if (!profile || profile === "default") throw new Error("A named temporary AWS profile is required");
  if (!/^\d{12}$/.test(accountId)) throw new Error("A 12-digit AWS account ID is required");
  if (region !== "ap-northeast-1") throw new Error("Region must be ap-northeast-1");
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
