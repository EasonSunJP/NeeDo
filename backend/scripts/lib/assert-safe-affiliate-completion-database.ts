const BLOCKED_ENVIRONMENTS = new Set(["staging", "prod", "production"]);

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const normalizeEnvironment = (value: string | undefined): string =>
  value?.trim().toLowerCase() ?? "";

export const assertSafeAffiliateCompletionDatabase = (
  environment: NodeJS.ProcessEnv = process.env
): string => {
  assert(
    !BLOCKED_ENVIRONMENTS.has(normalizeEnvironment(environment.NODE_ENV)),
    "completion check rejects staging and production node environments"
  );
  assert(
    !BLOCKED_ENVIRONMENTS.has(normalizeEnvironment(environment.DEPLOY_ENV)),
    "completion check rejects staging and production deploy environments"
  );

  const databaseUrl = new URL(environment.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "completion check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName),
    "completion check rejects production-looking database names"
  );

  return databaseName;
};
