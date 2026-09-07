import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.literal("production"),
  DEPLOY_ENV: z.literal("staging"),
  ALLOW_STAGING_LEGAL_CONTRACT_PROVISIONING: z.literal("true"),
  DATABASE_URL: z.string().trim().min(1),
  ADMIN_DEFAULT_EMAIL: z.string().trim().email()
});

export interface StagingLegalContractProvisioningConfig {
  databaseHost: "mysql";
  databaseName: "needo_staging";
  actorEmail: string;
}

export const parseStagingLegalContractProvisioningConfig = (
  env: NodeJS.ProcessEnv
): StagingLegalContractProvisioningConfig => {
  const parsed = configSchema.parse(env);
  const databaseUrl = new URL(parsed.DATABASE_URL);
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "");
  if (
    databaseUrl.protocol !== "mysql:" ||
    databaseUrl.hostname !== "mysql" ||
    databaseName !== "needo_staging"
  ) {
    throw new Error("STAGING_LEGAL_CONTRACT_DATABASE_BOUNDARY_REJECTED");
  }
  return {
    databaseHost: "mysql",
    databaseName: "needo_staging",
    actorEmail: parsed.ADMIN_DEFAULT_EMAIL.toLowerCase()
  };
};
