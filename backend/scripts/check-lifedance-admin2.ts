import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const provisioning = await import("../src/simulation/lifedance-admin2-provisioning");
  provisioning.assertLocalAdmin2ProvisioningTarget(process.env);
  const expectedPassword = provisioning.resolveLifeDanceAdmin2Password(process.env);
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const user = await prisma.user.findUnique({
      where: { email: provisioning.LIFEDANCE_ADMIN2_PLAN.email },
      include: {
        customerProfile: true,
        technicianProfile: { include: { technicianShopAffiliations: true } },
        affiliateProfile: true,
        identities: { where: { isActive: true, deletedAt: null }, include: { publicIdentifier: true } },
        userRoles: { where: { deletedAt: null }, include: { role: true } },
        ownedShops: { where: { deletedAt: null }, include: { publicIdentifier: true } },
        ownedMerchantAccounts: {
          where: { deletedAt: null },
          include: { publicIdentifier: true, memberships: { where: { deletedAt: null, endsAt: null } } }
        },
        ownedContacts: { where: { deletedAt: null } }
      }
    });
    assert(user?.isActive && !user.deletedAt, "LifeDance admin2 is not active.");
    assert(user.passwordHash, "LifeDance admin2 password hash is missing.");
    assert(await compare(expectedPassword, user.passwordHash), "LifeDance admin2 password is not the test password.");
    assert(
      user.needoId === provisioning.LIFEDANCE_ADMIN2_PLAN.needoId &&
        user.accountNo === provisioning.LIFEDANCE_ADMIN2_PLAN.numberPart,
      "LifeDance admin2 fixed NeeDo ID is invalid."
    );
    assert(user.customerProfile, "LifeDance admin2 customer profile is missing.");
    assert(user.technicianProfile?.shopId, "LifeDance admin2 technician profile is not attached to its shop.");
    assert(user.affiliateProfile?.status === "ACTIVE", "LifeDance admin2 affiliate profile is not active.");
    assert(user.ownedShops.length === 1, "LifeDance admin2 must own exactly one active shop.");
    assert(
      user.ownedShops[0]?.name === provisioning.LIFEDANCE_ADMIN2_PLAN.shopName &&
        user.ownedShops[0].status === "published" &&
        user.ownedShops[0].publicIdentifier?.kind === "SHOP",
      "LifeDance admin2 shop is incomplete."
    );
    assert(
      user.ownedMerchantAccounts.length === 1 &&
        user.ownedMerchantAccounts[0]?.memberships.length === 1 &&
        user.ownedMerchantAccounts[0].publicIdentifier?.kind === "OWNER",
      "LifeDance admin2 merchant organization is incomplete."
    );
    const identityTypes = new Set(user.identities.map((identity) => identity.type));
    assert(
      provisioning.LIFEDANCE_ADMIN2_PLAN.identityTypes.every((type) => identityTypes.has(type)),
      "LifeDance admin2 identities are incomplete."
    );
    const roleCodes = new Set(user.userRoles.map((userRole) => userRole.role.code));
    assert(
      provisioning.LIFEDANCE_ADMIN2_PLAN.roleCodes.every((code) => roleCodes.has(code)),
      "LifeDance admin2 roles are incomplete."
    );
    const identifiers = new Set(
      user.identities.flatMap((identity) =>
        identity.publicIdentifier ? [identity.publicIdentifier.publicId] : []
      )
    );
    assert(
      ["needo", "s", "b", "o"].every((prefix) =>
        identifiers.has(`${prefix}${provisioning.LIFEDANCE_ADMIN2_PLAN.numberPart}`)
      ),
      "LifeDance admin2 person identifiers are incomplete."
    );
    assert(user.ownedContacts.length === 21, "LifeDance admin2 must have admin plus 20 formal test friends.");
    const reciprocalCount = await prisma.contact.count({
      where: {
        ownerUserId: { in: user.ownedContacts.map((contact) => contact.contactUserId) },
        contactUserId: user.id,
        deletedAt: null,
        blockedAt: null
      }
    });
    assert(reciprocalCount === 21, "LifeDance admin2 reciprocal contacts are incomplete.");

    console.log(
      JSON.stringify({
        status: "ok",
        email: user.email,
        needoId: user.needoId,
        shopName: user.ownedShops[0]?.name,
        identities: [...identityTypes].sort(),
        roles: [...roleCodes].sort(),
        friendCount: user.ownedContacts.length
      })
    );
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
