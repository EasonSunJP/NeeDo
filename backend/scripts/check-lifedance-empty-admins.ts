import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import {
  LIFEDANCE_EMPTY_ADMIN_PLANS,
  LIFEDANCE_EMPTY_ADMIN_TEST_NDP,
  OPERATOR_U_IDENTIFIER_REPAIR,
  assertLocalEmptyAdminProvisioningTarget,
  resolveSharedTestAccountPassword
} from "../src/simulation/lifedance-empty-admin-provisioning";

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  loadDotenv({ path: envFile });
  assertLocalEmptyAdminProvisioningTarget(process.env);
  const password = resolveSharedTestAccountPassword(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  assert(databaseUrl, "DATABASE_URL is required.");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl), log: ["error"] });

  try {
    const accounts = [] as Array<{
      email: string;
      needoId: string;
      availableBalance: number;
      identityCount: number;
      roleCodes: string[];
    }>;
    for (const plan of LIFEDANCE_EMPTY_ADMIN_PLANS) {
      const user = await prisma.user.findUnique({
        where: { email: plan.email },
        include: {
          identities: {
            where: { isActive: true, deletedAt: null },
            include: { publicIdentifier: true }
          },
          userRoles: { where: { deletedAt: null }, include: { role: true } },
          customerProfile: true,
          technicianProfile: true,
          affiliateProfile: true,
          ownedShops: { where: { deletedAt: null } },
          ownedMerchantAccounts: { where: { deletedAt: null } },
          socialPosts: { where: { deletedAt: null } },
          bookingOrders: { where: { deletedAt: null } },
          ownedContacts: { where: { deletedAt: null } }
        }
      });
      assert(user?.isActive && !user.deletedAt, `${plan.email} is missing or inactive.`);
      assert(user.emailVerifiedAt, `${plan.email} is not verified.`);
      assert(user.passwordHash && (await compare(password, user.passwordHash)), `${plan.email} password mismatch.`);
      assert(
        user.needoId === plan.needoId &&
          user.accountNo === plan.numberPart &&
          user.primaryIdentityType === "NEEDO",
        `${plan.email} fixed NEEDO identity mismatch.`
      );
      assert(
        user.identities.length === 1 &&
          user.identities[0]?.type === "platform" &&
          user.identities[0].isDefault &&
          user.identities[0].publicIdentifier?.publicId === plan.needoId &&
          user.identities[0].publicIdentifier.kind === "NEEDO",
        `${plan.email} must have only the requested platform identity.`
      );
      const roleCodes = user.userRoles.map((item) => item.role.code).sort();
      assert(roleCodes.length === 1 && roleCodes[0] === "admin", `${plan.email} role mismatch.`);
      assert(
        !user.customerProfile &&
          !user.technicianProfile &&
          !user.affiliateProfile &&
          user.ownedShops.length === 0 &&
          user.ownedMerchantAccounts.length === 0 &&
          user.socialPosts.length === 0 &&
          user.bookingOrders.length === 0 &&
          user.ownedContacts.length === 0,
        `${plan.email} contains unexpected business fixture data.`
      );
      const wallet = await prisma.wallet.findUnique({
        where: {
          ownerType_ownerId_currency: {
            ownerType: "USER",
            ownerId: user.id,
            currency: "NDP"
          }
        }
      });
      assert(
        wallet?.availableBalance === LIFEDANCE_EMPTY_ADMIN_TEST_NDP && wallet.frozenBalance === 0,
        `${plan.email} TestNDP wallet mismatch.`
      );
      const ledgerCount = await prisma.walletLedger.count({
        where: { walletId: wallet.id, reason: "lifedance_empty_admin_test_ndp", deletedAt: null }
      });
      assert(ledgerCount >= 1, `${plan.email} TestNDP ledger entry is missing.`);
      accounts.push({
        email: user.email,
        needoId: user.needoId,
        availableBalance: wallet.availableBalance,
        identityCount: user.identities.length,
        roleCodes
      });
    }

    const operator = await prisma.user.findUnique({
      where: { email: OPERATOR_U_IDENTIFIER_REPAIR.email },
      include: {
        identities: {
          where: { isActive: true, deletedAt: null },
          include: { publicIdentifier: true }
        }
      }
    });
    assert(operator?.isActive && !operator.deletedAt, "operator@example.com is missing or inactive.");
    const customerIdentity = operator.identities.find((identity) =>
      ["customer", "user", "u"].includes(identity.type)
    );
    const platformIdentity = operator.identities.find((identity) => identity.type === "platform");
    assert(
      operator.needoId === OPERATOR_U_IDENTIFIER_REPAIR.publicId &&
        operator.accountNo === OPERATOR_U_IDENTIFIER_REPAIR.numberPart &&
        operator.primaryIdentityType === "U" &&
        customerIdentity?.isDefault &&
        customerIdentity.publicIdentifier?.publicId === OPERATOR_U_IDENTIFIER_REPAIR.publicId &&
        customerIdentity.publicIdentifier.kind === "U" &&
        platformIdentity &&
        !platformIdentity.isDefault &&
        !platformIdentity.publicIdentifier,
      "operator@example.com U identifier repair mismatch."
    );
    assert(operator.passwordHash && (await compare(password, operator.passwordHash)), "operator password mismatch.");
    console.log(
      JSON.stringify({
        status: "ok",
        accounts,
        operator: {
          email: operator.email,
          publicId: operator.needoId,
          primaryIdentityType: operator.primaryIdentityType
        }
      })
    );
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
