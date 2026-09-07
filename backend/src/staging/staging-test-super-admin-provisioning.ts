import { hash } from "bcryptjs";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { PublicIdentifierRepository } from "../repositories/public-identifier.repository";
import { IdentifierAllocator } from "../services/public-identifier.service";
import { UserBootstrapKeyAllocator } from "../services/user-bootstrap-key.service";

export const STAGING_TEST_SUPER_ADMIN_EMAILS = [
  "adminb@lifedance.com",
  "adminc@lifedance.com",
  "admind@lifedance.com",
  "akiratest@lifedance.com",
  "collintest@lifedance.com"
] as const;

const DEFAULT_DISPLAY_NAMES: Readonly<Record<(typeof STAGING_TEST_SUPER_ADMIN_EMAILS)[number], string>> = {
  "adminb@lifedance.com": "LifeDance 管理员 B",
  "adminc@lifedance.com": "LifeDance 管理员 C",
  "admind@lifedance.com": "LifeDance 管理员 D",
  "akiratest@lifedance.com": "akira",
  "collintest@lifedance.com": "collin"
};

const configSchema = z.object({
  NODE_ENV: z.literal("production"),
  DEPLOY_ENV: z.literal("staging"),
  ALLOW_STAGING_TEST_SUPER_ADMIN_PROVISIONING: z.literal("true"),
  DATABASE_URL: z.string().trim().min(1),
  ADMIN_DEFAULT_EMAIL: z.string().trim().email(),
  TEST_USER_DEFAULT_PASSWORD: z.string().min(16).max(200),
  STAGING_TEST_SUPER_ADMIN_SHOP_NO: z.string().regex(/^\d{10}$/)
});

export interface StagingTestSuperAdminProvisioningConfig {
  databaseHost: "mysql";
  databaseName: "needo_staging";
  actorEmail: string;
  password: string;
  shopNo: string;
}

export const parseStagingTestSuperAdminProvisioningConfig = (
  env: NodeJS.ProcessEnv
): StagingTestSuperAdminProvisioningConfig => {
  const parsed = configSchema.parse(env);
  const databaseUrl = new URL(parsed.DATABASE_URL);
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "");
  if (databaseUrl.protocol !== "mysql:" || databaseUrl.hostname !== "mysql" || databaseName !== "needo_staging") {
    throw new Error("STAGING_TEST_SUPER_ADMIN_DATABASE_BOUNDARY_REJECTED");
  }
  return {
    databaseHost: "mysql",
    databaseName: "needo_staging",
    actorEmail: parsed.ADMIN_DEFAULT_EMAIL.toLowerCase(),
    password: parsed.TEST_USER_DEFAULT_PASSWORD,
    shopNo: parsed.STAGING_TEST_SUPER_ADMIN_SHOP_NO
  };
};

export interface StagingTestSuperAdminPortalPlanInput {
  userId: number;
  displayName: string;
  customerProfileId: number;
  technicianProfileId: number;
  shopId: number;
}

export const buildStagingTestSuperAdminPortalPlan = (
  input: StagingTestSuperAdminPortalPlanInput
) => ({
  identities: [
    {
      type: "platform",
      scopeType: "global",
      scopeId: null,
      displayName: input.displayName,
      isDefault: true,
      identifierKind: "NEEDO" as const
    },
    {
      type: "customer",
      scopeType: "customer_profile",
      scopeId: input.customerProfileId,
      displayName: input.displayName,
      isDefault: false,
      identifierKind: null
    },
    {
      type: "technician",
      scopeType: "technician_profile",
      scopeId: input.technicianProfileId,
      displayName: input.displayName,
      isDefault: false,
      identifierKind: "S" as const
    },
    {
      type: "merchant_staff",
      scopeType: "shop",
      scopeId: input.shopId,
      displayName: input.displayName,
      isDefault: false,
      identifierKind: "B" as const
    }
  ],
  roles: [
    { code: "admin", scopeType: "global", scopeId: null },
    { code: "customer", scopeType: "customer_profile", scopeId: input.customerProfileId },
    { code: "technician", scopeType: "technician_profile", scopeId: input.technicianProfileId },
    { code: "merchant_staff", scopeType: "shop", scopeId: input.shopId }
  ]
});

interface ProvisionedAccount {
  userId: number;
  email: string;
  sessionGeneration: number;
  identityTypes: string[];
  roleCodes: string[];
}

export interface StagingTestSuperAdminProvisioningResult {
  shopId: number;
  shopNo: string;
  accounts: ProvisionedAccount[];
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const activeIdentityKey = (
  userId: number,
  type: string,
  scopeType: string,
  scopeId: number | null
) => `staging-test-super-admin:${userId}:${type}:${scopeType}:${scopeId ?? "global"}`;

const ensureIdentity = async (
  tx: Prisma.TransactionClient,
  input: {
    userId: number;
    type: string;
    scopeType: string;
    scopeId: number | null;
    displayName: string;
    isDefault: boolean;
  }
) => {
  const existing = await tx.userIdentity.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    },
    include: { publicIdentifier: true }
  });
  const data = {
    displayName: input.displayName,
    isDefault: input.isDefault,
    isActive: true,
    activeKey: activeIdentityKey(input.userId, input.type, input.scopeType, input.scopeId),
    deletedAt: null
  };
  return existing
    ? tx.userIdentity.update({ where: { id: existing.id }, data, include: { publicIdentifier: true } })
    : tx.userIdentity.create({
        data: {
          userId: input.userId,
          type: input.type,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          ...data
        },
        include: { publicIdentifier: true }
      });
};

const ensureRole = async (
  tx: Prisma.TransactionClient,
  input: { userId: number; roleId: number; scopeType: string; scopeId: number | null }
) => {
  const existing = await tx.userRole.findFirst({ where: input });
  if (existing) {
    await tx.userRole.update({ where: { id: existing.id }, data: { deletedAt: null } });
    return;
  }
  await tx.userRole.create({ data: input });
};

export class StagingTestSuperAdminProvisioningRepository {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly bootstrapKeyAllocator = new UserBootstrapKeyAllocator()
  ) {}

  public async provision(input: {
    actorEmail: string;
    shopNo: string;
    passwordHash: string;
  }): Promise<StagingTestSuperAdminProvisioningResult> {
    const existingCount = await this.client.user.count({
      where: { email: { in: [...STAGING_TEST_SUPER_ADMIN_EMAILS] } }
    });
    assert(
      STAGING_TEST_SUPER_ADMIN_EMAILS.length - existingCount <= 1,
      "STAGING_TEST_SUPER_ADMIN_UNEXPECTED_MISSING_ACCOUNT_COUNT"
    );

    return this.bootstrapKeyAllocator.withNewKey((bootstrapKey) =>
      this.client.$transaction(
        async (tx) => {
          const actor = await tx.user.findFirst({
            where: {
              email: input.actorEmail,
              isActive: true,
              deletedAt: null,
              userRoles: { some: { role: { code: "admin", deletedAt: null }, deletedAt: null } }
            },
            select: { id: true }
          });
          assert(actor, "STAGING_TEST_SUPER_ADMIN_ACTOR_NOT_FOUND");

          const shop = await tx.shop.findFirst({
            where: { shopNo: input.shopNo, status: "published", deletedAt: null },
            select: { id: true, shopNo: true, name: true, city: true }
          });
          assert(shop?.shopNo, "STAGING_TEST_SUPER_ADMIN_SHOP_NOT_FOUND");

          const roles = await tx.role.findMany({
            where: {
              code: { in: ["admin", "customer", "technician", "merchant_staff"] },
              deletedAt: null
            },
            select: { id: true, code: true }
          });
          const roleByCode = new Map(roles.map((role) => [role.code, role.id]));
          assert(roleByCode.size === 4, "STAGING_TEST_SUPER_ADMIN_ROLE_SET_INCOMPLETE");

          const accounts: ProvisionedAccount[] = [];
          let bootstrapKeyUsed = false;
          for (const email of STAGING_TEST_SUPER_ADMIN_EMAILS) {
            const existing = await tx.user.findUnique({ where: { email } });
            const displayName = existing?.username.trim() || DEFAULT_DISPLAY_NAMES[email];
            const user = existing
              ? await tx.user.update({
                  where: { id: existing.id },
                  data: {
                    emailVerifiedAt: new Date(),
                    passwordHash: input.passwordHash,
                    username: displayName,
                    isActive: true,
                    isTestAccount: true,
                    deletedAt: null,
                    sessionGeneration: { increment: 1 }
                  }
                })
              : await tx.user.create({
                  data: {
                    needoId: bootstrapKey,
                    email,
                    emailVerifiedAt: new Date(),
                    passwordHash: input.passwordHash,
                    username: displayName,
                    isActive: true,
                    isTestAccount: true
                  }
                });
            if (!existing) {
              assert(!bootstrapKeyUsed, "STAGING_TEST_SUPER_ADMIN_BOOTSTRAP_KEY_REUSED");
              bootstrapKeyUsed = true;
            }

            const customerProfile = await tx.customerProfile.upsert({
              where: { userId: user.id },
              create: { userId: user.id, displayName },
              update: { displayName, deletedAt: null }
            });
            await tx.userExperienceAccount.upsert({
              where: { userId: user.id },
              create: { userId: user.id, currentLevel: 1, totalExpUnits: 0n },
              update: { deletedAt: null }
            });
            const technicianProfile = await tx.technicianProfile.upsert({
              where: { userId: user.id },
              create: {
                userId: user.id,
                shopId: shop.id,
                displayName,
                city: shop.city,
                status: "published",
                verifiedAt: new Date()
              },
              update: {
                shopId: shop.id,
                displayName,
                city: shop.city,
                status: "published",
                verifiedAt: new Date(),
                deletedAt: null
              }
            });
            const affiliation = await tx.technicianShopAffiliation.upsert({
              where: { activeKey: `staging-test-super-admin:${user.id}:shop:${shop.id}:technician` },
              create: {
                technicianProfileId: technicianProfile.id,
                shopId: shop.id,
                relationshipType: "PARTNER",
                workStatus: "ACTIVE",
                activeKey: `staging-test-super-admin:${user.id}:shop:${shop.id}:technician`,
                createdById: actor.id,
                updatedById: actor.id
              },
              update: {
                relationshipType: "PARTNER",
                workStatus: "ACTIVE",
                endsAt: null,
                updatedById: actor.id,
                deletedAt: null
              }
            });
            await tx.shopEmployee.upsert({
              where: { activeKey: `staging-test-super-admin:${user.id}:shop:${shop.id}:employee` },
              create: {
                shopId: shop.id,
                userId: user.id,
                status: "ACTIVE",
                technicianShopAffiliationId: affiliation.id,
                activeKey: `staging-test-super-admin:${user.id}:shop:${shop.id}:employee`,
                createdById: actor.id,
                updatedById: actor.id
              },
              update: {
                status: "ACTIVE",
                endsAt: null,
                technicianShopAffiliationId: affiliation.id,
                updatedById: actor.id,
                deletedAt: null
              }
            });

            await tx.userIdentity.updateMany({
              where: { userId: user.id },
              data: { isDefault: false }
            });
            const portalPlan = buildStagingTestSuperAdminPortalPlan({
              userId: user.id,
              displayName,
              customerProfileId: customerProfile.id,
              technicianProfileId: technicianProfile.id,
              shopId: shop.id
            });
            const identities = [] as Awaited<ReturnType<typeof ensureIdentity>>[];
            for (const identityPlan of portalPlan.identities) {
              identities.push(
                await ensureIdentity(tx, {
                  userId: user.id,
                  type: identityPlan.type,
                  scopeType: identityPlan.scopeType,
                  scopeId: identityPlan.scopeId,
                  displayName: identityPlan.displayName,
                  isDefault: identityPlan.isDefault
                })
              );
            }

            const allocator = new IdentifierAllocator(new PublicIdentifierRepository(tx));
            const platformIdentity = identities.find((identity) => identity.type === "platform");
            assert(platformIdentity, `STAGING_TEST_SUPER_ADMIN_PLATFORM_IDENTITY_MISSING:${email}`);
            const primaryIdentifier: { kind: string; publicId: string; numberPart: string } =
              platformIdentity.publicIdentifier ??
              (await allocator.allocate({
                kind: "NEEDO",
                userIdentityId: platformIdentity.id
              }));
            assert(primaryIdentifier.kind === "NEEDO", `STAGING_TEST_SUPER_ADMIN_PLATFORM_ID_INVALID:${email}`);
            await tx.user.update({
              where: { id: user.id },
              data: {
                needoId: primaryIdentifier.publicId,
                accountNo: primaryIdentifier.numberPart,
                primaryIdentityType: "NEEDO"
              }
            });

            for (const identity of identities) {
              if (identity.publicIdentifier || identity.type === "customer" || identity.type === "platform") continue;
              await allocator.registerPersonAlias({
                kind: identity.type === "technician" ? "S" : "B",
                userIdentityId: identity.id
              });
            }
            const merchantIdentity = identities.find((identity) => identity.type === "merchant_staff");
            assert(merchantIdentity, `STAGING_TEST_SUPER_ADMIN_MERCHANT_IDENTITY_MISSING:${email}`);
            await tx.merchantIdentityProfile.upsert({
              where: { identityId: merchantIdentity.id },
              create: {
                userId: user.id,
                identityId: merchantIdentity.id,
                displayName,
                languages: []
              },
              update: { displayName, deletedAt: null }
            });

            for (const rolePlan of portalPlan.roles) {
              const roleId = roleByCode.get(rolePlan.code);
              assert(roleId, `STAGING_TEST_SUPER_ADMIN_ROLE_MISSING:${rolePlan.code}`);
              await ensureRole(tx, {
                userId: user.id,
                roleId,
                scopeType: rolePlan.scopeType,
                scopeId: rolePlan.scopeId
              });
            }
            await tx.auditLog.create({
              data: {
                actorId: actor.id,
                action: "staging.test_super_admin.provision",
                targetType: "User",
                targetId: user.id,
                metadata: {
                  email,
                  shopId: shop.id,
                  shopNo: shop.shopNo,
                  identityTypes: portalPlan.identities.map((identity) => identity.type),
                  roleCodes: portalPlan.roles.map((role) => role.code),
                  sharedTestPasswordApplied: true
                }
              }
            });
            accounts.push({
              userId: user.id,
              email,
              sessionGeneration: user.sessionGeneration,
              identityTypes: portalPlan.identities.map((identity) => identity.type),
              roleCodes: portalPlan.roles.map((role) => role.code)
            });
          }
          return { shopId: shop.id, shopNo: shop.shopNo, accounts };
        },
        { maxWait: 20_000, timeout: 120_000 }
      )
    );
  }
}

export class StagingTestSuperAdminProvisioningService {
  public constructor(
    private readonly repository: StagingTestSuperAdminProvisioningRepository
  ) {}

  public async provision(
    config: StagingTestSuperAdminProvisioningConfig
  ): Promise<StagingTestSuperAdminProvisioningResult> {
    const result = await this.repository.provision({
      actorEmail: config.actorEmail,
      shopNo: config.shopNo,
      passwordHash: await hash(config.password, 12)
    });
    assert(result.accounts.length === STAGING_TEST_SUPER_ADMIN_EMAILS.length, "STAGING_TEST_SUPER_ADMIN_POSTCONDITION_FAILED");
    for (const account of result.accounts) {
      assert(
        ["platform", "customer", "technician", "merchant_staff"].every((type) =>
          account.identityTypes.includes(type)
        ) &&
          ["admin", "customer", "technician", "merchant_staff"].every((code) =>
            account.roleCodes.includes(code)
          ),
        `STAGING_TEST_SUPER_ADMIN_POSTCONDITION_FAILED:${account.email}`
      );
    }
    return result;
  }
}
