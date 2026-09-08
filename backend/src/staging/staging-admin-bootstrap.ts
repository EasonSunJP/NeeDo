import { createHmac } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";

const bootstrapEnvSchema = z.object({
  NODE_ENV: z.literal("production"),
  DEPLOY_ENV: z.literal("staging"),
  ALLOW_STAGING_ADMIN_BOOTSTRAP: z.literal("true"),
  DATABASE_URL: z.string().trim().min(1),
  ADMIN_DEFAULT_EMAIL: z.string().trim().email(),
  ADMIN_DEFAULT_USERNAME: z.string().trim().min(1).max(100),
  ADMIN_DEFAULT_PASSWORD: z.string().min(16).max(200),
  AUTH_VERIFICATION_SECRET: z.string().min(32)
});

export interface StagingAdminBootstrapConfig {
  databaseHost: "mysql";
  databaseName: "needo_staging";
  email: string;
  username: string;
  password: string;
  verificationSecret: string;
}

export interface StagingAdminBootstrapWriteInput {
  email: string;
  username: string;
  passwordHash: string;
  credentialFingerprint: string;
}

export interface StagingAdminBootstrapResult {
  status: "created" | "already-complete";
  administratorCount: number;
  platformIdentityCount: number;
  forbiddenBusinessRowCount: number;
}

export interface StagingAdminBootstrapRepositoryPort {
  bootstrap(input: StagingAdminBootstrapWriteInput): Promise<StagingAdminBootstrapResult>;
}

const getDatabaseBoundary = (databaseUrl: string) => {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\/+/, "");

  if (
    parsed.protocol !== "mysql:" ||
    parsed.hostname !== "mysql" ||
    databaseName !== "needo_staging" ||
    !parsed.username ||
    !parsed.password
  ) {
    throw new Error("STAGING_ADMIN_BOOTSTRAP_DATABASE_BOUNDARY_REJECTED");
  }

  return { databaseHost: "mysql" as const, databaseName: "needo_staging" as const };
};

export const parseStagingAdminBootstrapConfig = (
  env: NodeJS.ProcessEnv
): StagingAdminBootstrapConfig => {
  const parsed = bootstrapEnvSchema.parse(env);

  return {
    ...getDatabaseBoundary(parsed.DATABASE_URL),
    email: parsed.ADMIN_DEFAULT_EMAIL.toLowerCase(),
    username: parsed.ADMIN_DEFAULT_USERNAME,
    password: parsed.ADMIN_DEFAULT_PASSWORD,
    verificationSecret: parsed.AUTH_VERIFICATION_SECRET
  };
};

const createCredentialFingerprint = (config: StagingAdminBootstrapConfig): string =>
  createHmac("sha256", config.verificationSecret)
    .update(`${config.email}\u0000${config.username}\u0000${config.password}`, "utf8")
    .digest("hex");

const assertPostcondition = (
  result: StagingAdminBootstrapResult
): StagingAdminBootstrapResult => {
  if (
    result.administratorCount !== 1 ||
    result.platformIdentityCount !== 1 ||
    result.forbiddenBusinessRowCount !== 0
  ) {
    throw new Error("STAGING_ADMIN_BOOTSTRAP_POSTCONDITION_FAILED");
  }

  return result;
};

export class StagingAdminBootstrapService {
  public constructor(private readonly repository: StagingAdminBootstrapRepositoryPort) {}

  public async bootstrap(
    config: StagingAdminBootstrapConfig
  ): Promise<StagingAdminBootstrapResult> {
    const passwordHash = await hash(config.password, 12);
    const result = await this.repository.bootstrap({
      email: config.email,
      username: config.username,
      passwordHash,
      credentialFingerprint: createCredentialFingerprint(config)
    });

    return assertPostcondition(result);
  }
}
