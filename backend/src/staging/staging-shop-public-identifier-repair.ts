import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { provisionShopPublicIdentifier } from "../repositories/shop-public-identifier-provisioning";

const configSchema = z.object({
  NODE_ENV: z.literal("production"),
  DEPLOY_ENV: z.literal("staging"),
  ALLOW_STAGING_SHOP_PUBLIC_IDENTIFIER_REPAIR: z.literal("true"),
  DATABASE_URL: z.string().trim().min(1),
  ADMIN_DEFAULT_EMAIL: z.string().trim().email(),
  STAGING_REPAIR_SHOP_ID: z.coerce.number().int().positive()
});

export interface StagingShopPublicIdentifierRepairConfig {
  databaseHost: "mysql";
  databaseName: "needo_staging";
  actorEmail: string;
  shopId: number;
}

export interface StagingShopPublicIdentifierRepairResult {
  changed: boolean;
  applicationId: number;
  shopId: number;
  shopNo: string;
  shopPublicId: string;
}

export const parseStagingShopPublicIdentifierRepairConfig = (
  env: NodeJS.ProcessEnv
): StagingShopPublicIdentifierRepairConfig => {
  const parsed = configSchema.parse(env);
  const databaseUrl = new URL(parsed.DATABASE_URL);
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "");
  if (
    databaseUrl.protocol !== "mysql:" ||
    databaseUrl.hostname !== "mysql" ||
    databaseName !== "needo_staging"
  ) {
    throw new Error("STAGING_SHOP_PUBLIC_IDENTIFIER_DATABASE_BOUNDARY_REJECTED");
  }
  return {
    databaseHost: "mysql",
    databaseName: "needo_staging",
    actorEmail: parsed.ADMIN_DEFAULT_EMAIL.toLowerCase(),
    shopId: parsed.STAGING_REPAIR_SHOP_ID
  };
};

const applicationIdFromMerchantCode = (code: string): number | null => {
  const match = /^NEEDO-APP-([1-9]\d*)$/.exec(code);
  return match ? Number(match[1]) : null;
};

export const repairStagingShopPublicIdentifier = async (
  client: PrismaClient,
  config: StagingShopPublicIdentifierRepairConfig,
  nextCandidate?: () => string
): Promise<StagingShopPublicIdentifierRepairResult> => {
  let lastConflict: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await client.$transaction(
        async (tx) => {
          const actor = await tx.user.findFirst({
            where: {
              email: config.actorEmail,
              isActive: true,
              deletedAt: null,
              userRoles: {
                some: {
                  scopeType: "global",
                  scopeId: null,
                  deletedAt: null,
                  role: { code: "admin", deletedAt: null }
                }
              }
            },
            select: { id: true }
          });
          if (!actor) throw new Error("STAGING_SHOP_PUBLIC_IDENTIFIER_ACTOR_NOT_FOUND");

          const shop = await tx.shop.findFirst({
            where: { id: config.shopId, status: { in: ["active", "published"] }, deletedAt: null },
            select: {
              id: true,
              ownerUserId: true,
              name: true,
              shopNo: true,
              publicIdentifier: {
                select: {
                  publicId: true,
                  numberPart: true,
                  kind: true,
                  status: true,
                  deletedAt: true
                }
              },
              customerSupportAccount: {
                select: {
                  id: true,
                  type: true,
                  isActive: true,
                  deletedAt: true,
                  publicIdentifier: {
                    select: {
                      publicId: true,
                      numberPart: true,
                      kind: true,
                      status: true,
                      deletedAt: true
                    }
                  }
                }
              }
            }
          });
          if (!shop?.ownerUserId) throw new Error("STAGING_SHOP_PUBLIC_IDENTIFIER_SHOP_NOT_FOUND");
          const ownerUserId = shop.ownerUserId;

          const memberships = await tx.merchantShopMembership.findMany({
            where: {
              shopId: shop.id,
              activeKey: { not: null },
              endsAt: null,
              deletedAt: null,
              merchantAccount: { ownerUserId, status: "active", deletedAt: null }
            },
            select: { merchantAccount: { select: { code: true, ownerUserId: true } } },
            take: 2
          });
          const applicationIds = [
            ...new Set(
              memberships.flatMap(({ merchantAccount }) => {
                const applicationId = applicationIdFromMerchantCode(merchantAccount.code);
                return applicationId === null ? [] : [applicationId];
              })
            )
          ];
          if (applicationIds.length > 1) {
            throw new Error("STAGING_SHOP_PUBLIC_IDENTIFIER_APPROVAL_EVIDENCE_AMBIGUOUS");
          }
          const applicationId = applicationIds[0];
          if (!applicationId) {
            throw new Error("STAGING_SHOP_PUBLIC_IDENTIFIER_APPROVAL_EVIDENCE_NOT_FOUND");
          }
          const [approvedApplication, merchantIdentity] = await Promise.all([
            tx.identityApplication.findFirst({
              where: {
                id: applicationId,
                userId: ownerUserId,
                type: "merchant",
                status: "approved",
                deletedAt: null
              },
              select: { id: true }
            }),
            tx.userIdentity.findFirst({
              where: {
                userId: ownerUserId,
                type: "merchant_owner",
                scopeType: "shop",
                scopeId: shop.id,
                isActive: true,
                deletedAt: null
              },
              select: { id: true }
            })
          ]);
          if (!approvedApplication || !merchantIdentity) {
            throw new Error("STAGING_SHOP_PUBLIC_IDENTIFIER_APPROVAL_EVIDENCE_NOT_FOUND");
          }

          const publicIdentifier = shop.publicIdentifier;
          const support = shop.customerSupportAccount;
          const supportIdentifier = support?.publicIdentifier ?? null;
          const complete =
            shop.shopNo !== null &&
            publicIdentifier?.kind === "SHOP" &&
            publicIdentifier.status === "ACTIVE" &&
            publicIdentifier.deletedAt === null &&
            publicIdentifier.numberPart === shop.shopNo &&
            support?.type === "SHOP" &&
            support.isActive &&
            support.deletedAt === null &&
            supportIdentifier?.kind === "CUSTOMER_SUPPORT" &&
            supportIdentifier.status === "ACTIVE" &&
            supportIdentifier.deletedAt === null &&
            supportIdentifier.numberPart === shop.shopNo;
          if (complete && shop.shopNo !== null && publicIdentifier !== null) {
            return {
              changed: false,
              applicationId: approvedApplication.id,
              shopId: shop.id,
              shopNo: shop.shopNo,
              shopPublicId: publicIdentifier.publicId
            };
          }
          if (shop.shopNo !== null || publicIdentifier !== null || support !== null) {
            throw new Error("STAGING_SHOP_PUBLIC_IDENTIFIER_PARTIAL_STATE");
          }

          const provisioned = await provisionShopPublicIdentifier(tx, {
            shopId: shop.id,
            shopName: shop.name,
            nextCandidate
          });
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: "staging.shop_public_identifier.repair",
              targetType: "Shop",
              targetId: shop.id,
              metadata: {
                applicationId: approvedApplication.id,
                shopNo: provisioned.numberPart,
                shopPublicId: provisioned.publicId,
                customerSupportPublicId: provisioned.customerSupportPublicId
              }
            }
          });
          return {
            changed: true,
            applicationId: approvedApplication.id,
            shopId: shop.id,
            shopNo: provisioned.numberPart,
            shopPublicId: provisioned.publicId
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 120_000
        }
      );
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "P2034" ||
        attempt === 2
      ) {
        throw error;
      }
      lastConflict = error;
    }
  }
  throw lastConflict;
};
