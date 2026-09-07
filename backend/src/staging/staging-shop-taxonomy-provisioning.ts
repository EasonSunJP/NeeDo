import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.literal("production"),
  DEPLOY_ENV: z.literal("staging"),
  ALLOW_STAGING_SHOP_TAXONOMY_PROVISIONING: z.literal("true"),
  DATABASE_URL: z.string().trim().min(1),
  ADMIN_DEFAULT_EMAIL: z.string().trim().email()
});

export interface StagingShopTaxonomyProvisioningConfig {
  databaseHost: "mysql";
  databaseName: "needo_staging";
  actorEmail: string;
}

export const parseStagingShopTaxonomyProvisioningConfig = (
  env: NodeJS.ProcessEnv
): StagingShopTaxonomyProvisioningConfig => {
  const parsed = configSchema.parse(env);
  const databaseUrl = new URL(parsed.DATABASE_URL);
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "");
  if (
    databaseUrl.protocol !== "mysql:" ||
    databaseUrl.hostname !== "mysql" ||
    databaseName !== "needo_staging"
  ) {
    throw new Error("STAGING_SHOP_TAXONOMY_DATABASE_BOUNDARY_REJECTED");
  }
  return {
    databaseHost: "mysql",
    databaseName: "needo_staging",
    actorEmail: parsed.ADMIN_DEFAULT_EMAIL.toLowerCase()
  };
};
