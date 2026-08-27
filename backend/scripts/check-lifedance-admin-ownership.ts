import { TechnicianEmploymentType } from "@prisma/client";
import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

import {
  LIFEDANCE_ADMIN_EMAIL,
  LIFEDANCE_LEGACY_OWNER_EMAIL,
  LIFEDANCE_SHOP_NAME
} from "../src/simulation/three-month-simulation-plan";

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const expectedPassword = process.env.ADMIN_DEFAULT_PASSWORD?.trim();
  assert(expectedPassword, "ADMIN_DEFAULT_PASSWORD is required for administrator verification.");
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const [admin, legacyAdmin, shop, previousOwner] = await Promise.all([
      prisma.user.findUnique({
        where: { email: LIFEDANCE_ADMIN_EMAIL },
        select: {
          id: true,
          needoId: true,
          email: true,
          passwordHash: true,
          username: true,
          isActive: true,
          deletedAt: true,
          customerProfile: { select: { id: true } },
          technicianProfile: {
            select: { id: true, shopId: true, status: true, employmentType: true }
          },
          identities: {
            where: { isActive: true, deletedAt: null },
            select: {
              type: true,
              scopeType: true,
              scopeId: true,
              isDefault: true,
              activeKey: true
            }
          },
          userRoles: {
            where: { deletedAt: null },
            select: { role: { select: { code: true } } }
          }
        }
      }),
      prisma.user.findFirst({
        where: { email: "admin@example.com", isActive: true, deletedAt: null },
        select: { id: true }
      }),
      prisma.shop.findFirst({
        where: { name: LIFEDANCE_SHOP_NAME, deletedAt: null },
        select: { id: true, ownerUserId: true, status: true }
      }),
      prisma.user.findUnique({
        where: { email: LIFEDANCE_LEGACY_OWNER_EMAIL },
        select: {
          id: true,
          technicianProfile: { select: { shopId: true, status: true, employmentType: true } }
        }
      })
    ]);
    assert(admin?.isActive && !admin.deletedAt, "LifeDance administrator is not active.");
    assert(!legacyAdmin, "Legacy administrator email is still active.");
    assert(shop?.ownerUserId === admin.id && shop.status === "published", "LifeDance shop ownership is invalid.");
    assert(admin.passwordHash, "LifeDance administrator password hash is missing.");
    assert(
      await compare(expectedPassword, admin.passwordHash),
      "LifeDance administrator password does not match the configured value."
    );
    assert(admin.customerProfile, "LifeDance administrator customer profile is missing.");
    assert(admin.technicianProfile, "LifeDance administrator technician profile is missing.");
    assert(
      admin.technicianProfile.shopId === null &&
        admin.technicianProfile.status === "private" &&
        admin.technicianProfile.employmentType === TechnicianEmploymentType.INDEPENDENT,
      "LifeDance administrator technician profile must be private and independent."
    );

    const identityKey = (type: string, scopeType: string, scopeId: number | null): string =>
      `${type}:${scopeType}:${String(scopeId)}`;
    const actualIdentityKeys = new Set(
      admin.identities.map((identity) =>
        identityKey(identity.type, identity.scopeType, identity.scopeId)
      )
    );
    const expectedIdentityKeys = new Set([
      identityKey("platform", "global", null),
      identityKey("customer", "customer_profile", admin.customerProfile.id),
      identityKey("merchant_owner", "shop", shop.id),
      identityKey("technician", "technician_profile", admin.technicianProfile.id),
      identityKey("scout", "global", null)
    ]);
    assert(
      actualIdentityKeys.size === expectedIdentityKeys.size &&
        [...expectedIdentityKeys].every((key) => actualIdentityKeys.has(key)),
      "LifeDance administrator identity scopes are not exact."
    );
    assert(
      admin.identities.every((identity) => identity.activeKey),
      "LifeDance administrator has an identity without an active key."
    );
    assert(
      admin.identities.filter((identity) => identity.isDefault).length === 1 &&
        admin.identities.some((identity) => identity.type === "platform" && identity.isDefault),
      "Only the platform identity may be default."
    );
    const roleCodes = new Set(admin.userRoles.map((userRole) => userRole.role.code));
    assert(
      ["admin", "customer", "merchant_owner", "technician", "scout"].every((roleCode) =>
        roleCodes.has(roleCode)
      ),
      "LifeDance administrator cross-portal roles are incomplete."
    );

    const [merchantAccounts, services, availabilities, bookings] = await Promise.all([
      prisma.merchantAccount.findMany({
        where: {
          code: "lifedance-real-ops",
          ownerUserId: admin.id,
          status: "active",
          deletedAt: null
        },
        select: {
          id: true,
          memberships: {
            where: { shopId: shop.id, endsAt: null, deletedAt: null },
            select: { id: true }
          }
        }
      }),
      prisma.technicianService.count({
        where: { technicianId: admin.technicianProfile.id, deletedAt: null }
      }),
      prisma.availability.count({
        where: { technicianProfileId: admin.technicianProfile.id, deletedAt: null }
      }),
      prisma.bookingOrder.count({
        where: { technicianProfileId: admin.technicianProfile.id, deletedAt: null }
      })
    ]);
    assert(
      merchantAccounts.length === 1 && merchantAccounts[0]?.memberships.length === 1,
      "LifeDance merchant account membership is not exact."
    );
    assert(
      services === 0 && availabilities === 0 && bookings === 0,
      "LifeDance administrator private technician profile is bookable."
    );

    if (previousOwner) {
      const [merchantIdentities, merchantRoles] = await Promise.all([
        prisma.userIdentity.count({
          where: {
            userId: previousOwner.id,
            type: "merchant_owner",
            scopeType: "shop",
            scopeId: shop.id,
            isActive: true,
            deletedAt: null
          }
        }),
        prisma.userRole.count({
          where: {
            userId: previousOwner.id,
            role: { code: "merchant_owner" },
            scopeType: "shop",
            scopeId: shop.id,
            deletedAt: null
          }
        })
      ]);
      assert(
        merchantIdentities === 0 && merchantRoles === 0,
        "Previous owner still has the LifeDance merchant scope."
      );
      assert(
        !previousOwner.technicianProfile ||
          (previousOwner.technicianProfile.shopId !== shop.id &&
            previousOwner.technicianProfile.status === "private" &&
            previousOwner.technicianProfile.employmentType ===
              TechnicianEmploymentType.INDEPENDENT),
        "Previous owner technician profile was not safely detached."
      );
    }

    console.log(
      JSON.stringify({
        status: "ok",
        adminUserId: admin.id,
        needoId: admin.needoId,
        shopId: shop.id,
        technicianProfileId: admin.technicianProfile.id,
        identities: [...actualIdentityKeys].sort(),
        roles: [...roleCodes].sort()
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
