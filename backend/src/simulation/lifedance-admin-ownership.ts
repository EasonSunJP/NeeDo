import { ShopPricingMode, TechnicianEmploymentType, type Prisma } from "@prisma/client";

import {
  LIFEDANCE_ADMIN_EMAIL,
  LIFEDANCE_LEGACY_OWNER_EMAIL,
  LIFEDANCE_SHOP_NAME,
  SIMULATION_AS_OF_AT,
  SIMULATION_NAMESPACE
} from "./three-month-simulation-plan";

const LIFEDANCE_ADMIN_DISPLAY_NAME = "LifeDance 管理员";
const LIFEDANCE_SHOP_ADDRESS = "東京都渋谷区道玄坂1-12-1";
const LIFEDANCE_SHOP_DESCRIPTION =
  "渋谷のボディケア、ヘッドケア、訪問リラクゼーションを提供するウェルネス店舗です。";
const LIFEDANCE_SHOP_PHONE = "050-9101-1001";
const MIGRATED_AT = new Date(SIMULATION_AS_OF_AT);

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const activeIdentityKey = (
  userId: number,
  type: string,
  scopeType: string,
  scopeId: number | null
): string => ["lifedance-identity", userId, type, scopeType, scopeId ?? "global"].join(":");

export interface LifeDanceAdminOwnershipResult {
  adminUserId: number;
  customerProfileId: number;
  technicianProfileId: number;
  shopId: number;
  previousOwnerUserId: number | null;
}

export const migrateLifeDanceAdminOwnership = async (
  tx: Prisma.TransactionClient
): Promise<LifeDanceAdminOwnershipResult> => {
  const admin = await tx.user.findUnique({
    where: { email: LIFEDANCE_ADMIN_EMAIL },
    select: { id: true, isActive: true, deletedAt: true }
  });
  assert(
    admin?.isActive && !admin.deletedAt,
    "Run the formal administrator migration before assigning the LifeDance shop."
  );

  const legacyOwner = await tx.user.findUnique({
    where: { email: LIFEDANCE_LEGACY_OWNER_EMAIL },
    select: { id: true }
  });
  let existingShop = legacyOwner
    ? await tx.shop.findFirst({ where: { ownerUserId: legacyOwner.id } })
    : null;
  if (!existingShop) {
    existingShop = await tx.shop.findFirst({
      where: {
        OR: [
          { name: LIFEDANCE_SHOP_NAME },
          { name: "渋谷リラクゼーション 凪", address: LIFEDANCE_SHOP_ADDRESS }
        ]
      },
      orderBy: { id: "asc" }
    });
  }
  const previousOwnerUserId =
    existingShop?.ownerUserId && existingShop.ownerUserId !== admin.id
      ? existingShop.ownerUserId
      : null;
  const shopData = {
    ownerUserId: admin.id,
    name: LIFEDANCE_SHOP_NAME,
    description: LIFEDANCE_SHOP_DESCRIPTION,
    city: "東京都",
    address: LIFEDANCE_SHOP_ADDRESS,
    phone: LIFEDANCE_SHOP_PHONE,
    status: "published",
    pricingMode: ShopPricingMode.MERCHANT,
    pricingModeUpdatedBy: admin.id,
    pricingModeUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
    deletedAt: null
  } as const;
  const shop = existingShop
    ? await tx.shop.update({ where: { id: existingShop.id }, data: shopData })
    : await tx.shop.create({
        data: {
          ...shopData,
          createdAt: new Date("2026-05-15T00:00:00.000Z")
        }
      });

  const customerProfile = await tx.customerProfile.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      displayName: LIFEDANCE_ADMIN_DISPLAY_NAME,
      bio: "LifeDance の運営管理と予約確認に使用する顧客プロフィールです。",
      city: "東京都",
      membershipLevel: "standard",
      isPublic: false
    },
    update: {
      displayName: LIFEDANCE_ADMIN_DISPLAY_NAME,
      bio: "LifeDance の運営管理と予約確認に使用する顧客プロフィールです。",
      city: "東京都",
      membershipLevel: "standard",
      isPublic: false,
      deletedAt: null
    }
  });
  const technicianProfile = await tx.technicianProfile.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      shopId: null,
      displayName: LIFEDANCE_ADMIN_DISPLAY_NAME,
      bio: "LifeDance の権限切替確認専用プロフィールです。予約受付には使用しません。",
      city: "東京都",
      serviceArea: null,
      yearsExperience: 0,
      employmentType: TechnicianEmploymentType.INDEPENDENT,
      employmentStartedAt: null,
      status: "private",
      verifiedAt: new Date("2026-05-25T00:00:00.000Z")
    },
    update: {
      shopId: null,
      displayName: LIFEDANCE_ADMIN_DISPLAY_NAME,
      bio: "LifeDance の権限切替確認専用プロフィールです。予約受付には使用しません。",
      city: "東京都",
      serviceArea: null,
      yearsExperience: 0,
      employmentType: TechnicianEmploymentType.INDEPENDENT,
      employmentStartedAt: null,
      status: "private",
      verifiedAt: new Date("2026-05-25T00:00:00.000Z"),
      deletedAt: null
    }
  });

  const roleRows = await tx.role.findMany({
    where: {
      code: { in: ["customer", "merchant_owner", "technician", "scout"] },
      deletedAt: null
    },
    select: { id: true, code: true }
  });
  const roleIds = new Map(roleRows.map((role) => [role.code, role.id]));
  assert(roleIds.size === 4, "LifeDance cross-portal roles are incomplete.");

  const ensureRole = async (
    roleCode: "customer" | "merchant_owner" | "technician" | "scout",
    scopeType: string,
    scopeId: number | null
  ): Promise<void> => {
    const roleId = roleIds.get(roleCode);
    assert(roleId, `LifeDance role is missing: ${roleCode}`);
    const existing = await tx.userRole.findFirst({
      where: { userId: admin.id, roleId, scopeType, scopeId }
    });
    if (existing) {
      await tx.userRole.update({ where: { id: existing.id }, data: { deletedAt: null } });
      return;
    }
    await tx.userRole.create({
      data: { userId: admin.id, roleId, scopeType, scopeId }
    });
  };
  const ensureIdentity = async (
    type: string,
    scopeType: string,
    scopeId: number | null,
    displayName: string,
    isDefault: boolean
  ): Promise<void> => {
    const activeKey = activeIdentityKey(admin.id, type, scopeType, scopeId);
    const existing = await tx.userIdentity.findFirst({
      where: { userId: admin.id, type, scopeType, scopeId }
    });
    if (existing) {
      await tx.userIdentity.update({
        where: { id: existing.id },
        data: { displayName, isDefault, isActive: true, activeKey, deletedAt: null }
      });
      return;
    }
    await tx.userIdentity.create({
      data: {
        userId: admin.id,
        type,
        scopeType,
        scopeId,
        displayName,
        isDefault,
        isActive: true,
        activeKey
      }
    });
  };

  await ensureIdentity("platform", "global", null, LIFEDANCE_ADMIN_DISPLAY_NAME, true);
  await ensureIdentity(
    "customer",
    "customer_profile",
    customerProfile.id,
    LIFEDANCE_ADMIN_DISPLAY_NAME,
    false
  );
  await ensureIdentity("merchant_owner", "shop", shop.id, shop.name, false);
  await ensureIdentity(
    "technician",
    "technician_profile",
    technicianProfile.id,
    LIFEDANCE_ADMIN_DISPLAY_NAME,
    false
  );
  await ensureIdentity("scout", "global", null, LIFEDANCE_ADMIN_DISPLAY_NAME, false);
  await ensureRole("customer", "customer_profile", customerProfile.id);
  await ensureRole("merchant_owner", "shop", shop.id);
  await ensureRole("technician", "technician_profile", technicianProfile.id);
  await ensureRole("scout", "global", null);

  const merchantAccount = await tx.merchantAccount.upsert({
    where: { code: "lifedance-real-ops" },
    create: {
      code: "lifedance-real-ops",
      ownerUserId: admin.id,
      name: LIFEDANCE_SHOP_NAME,
      status: "active",
      paymentResponsibility: "shop_individual"
    },
    update: {
      ownerUserId: admin.id,
      name: LIFEDANCE_SHOP_NAME,
      status: "active",
      paymentResponsibility: "shop_individual",
      deletedAt: null
    }
  });
  const merchantOrganizationIdentities = await tx.userIdentity.findMany({
    where: {
      userId: admin.id,
      type: "merchant_organization",
      deletedAt: null
    },
    orderBy: { id: "asc" }
  });
  assert(
    merchantOrganizationIdentities.length <= 1,
    "LifeDance administrator has duplicate merchant organization identities."
  );
  const merchantOrganizationIdentity = merchantOrganizationIdentities[0];
  if (merchantOrganizationIdentity) {
    await tx.userIdentity.update({
      where: { id: merchantOrganizationIdentity.id },
      data: {
        scopeType: "merchant_account",
        scopeId: merchantAccount.id,
        displayName: merchantAccount.name,
        isDefault: false,
        isActive: true,
        activeKey: activeIdentityKey(
          admin.id,
          "merchant_organization",
          "merchant_account",
          merchantAccount.id
        ),
        deletedAt: null
      }
    });
  } else {
    await ensureIdentity(
      "merchant_organization",
      "merchant_account",
      merchantAccount.id,
      merchantAccount.name,
      false
    );
  }
  const reconciledMerchantOrganizationIdentity = await tx.userIdentity.findFirst({
    where: {
      userId: admin.id,
      type: "merchant_organization",
      scopeType: "merchant_account",
      scopeId: merchantAccount.id,
      isActive: true,
      deletedAt: null
    },
    select: { id: true }
  });
  assert(
    reconciledMerchantOrganizationIdentity,
    "LifeDance administrator merchant organization identity reconciliation failed."
  );
  const existingMerchantOrganizationAudit = await tx.auditLog.findFirst({
    where: {
      actorId: admin.id,
      action: "seed.lifedance_admin.merchant_organization_scope_reconcile",
      targetType: "UserIdentity",
      targetId: reconciledMerchantOrganizationIdentity.id,
      deletedAt: null
    },
    select: { id: true }
  });
  if (!existingMerchantOrganizationAudit) {
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "seed.lifedance_admin.merchant_organization_scope_reconcile",
        targetType: "UserIdentity",
        targetId: reconciledMerchantOrganizationIdentity.id,
        metadata: {
          namespace: SIMULATION_NAMESPACE,
          merchantAccountId: merchantAccount.id,
          scopeType: "merchant_account"
        }
      }
    });
  }
  const membershipActiveKey = `merchant:${merchantAccount.id}:shop:${shop.id}`;
  const existingMembership = await tx.merchantShopMembership.findFirst({
    where: { merchantAccountId: merchantAccount.id, shopId: shop.id }
  });
  if (existingMembership && existingMembership.activeKey !== membershipActiveKey) {
    await tx.merchantShopMembership.update({
      where: { id: existingMembership.id },
      data: { activeKey: membershipActiveKey }
    });
  }
  await tx.merchantShopMembership.upsert({
    where: { activeKey: membershipActiveKey },
    create: {
      merchantAccountId: merchantAccount.id,
      shopId: shop.id,
      activeKey: membershipActiveKey,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      createdById: admin.id
    },
    update: {
      merchantAccountId: merchantAccount.id,
      shopId: shop.id,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      endsAt: null,
      removedReason: null,
      createdById: admin.id,
      removedById: null,
      deletedAt: null
    }
  });
  await tx.merchantShopMembership.updateMany({
    where: {
      shopId: shop.id,
      merchantAccountId: { not: merchantAccount.id },
      deletedAt: null
    },
    data: {
      activeKey: null,
      endsAt: MIGRATED_AT,
      removedReason: "lifedance_owner_migrated",
      removedById: admin.id,
      deletedAt: MIGRATED_AT
    }
  });

  if (previousOwnerUserId && previousOwnerUserId !== admin.id) {
    const merchantOwnerRoleId = roleIds.get("merchant_owner");
    assert(merchantOwnerRoleId, "LifeDance merchant owner role is missing.");
    await tx.userIdentity.updateMany({
      where: {
        userId: previousOwnerUserId,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: shop.id,
        isActive: true,
        deletedAt: null
      },
      data: { activeKey: null, isActive: false, deletedAt: MIGRATED_AT }
    });
    await tx.userRole.updateMany({
      where: {
        userId: previousOwnerUserId,
        roleId: merchantOwnerRoleId,
        scopeType: "shop",
        scopeId: shop.id,
        deletedAt: null
      },
      data: { deletedAt: MIGRATED_AT }
    });
    const previousOwnerProfile = await tx.technicianProfile.findUnique({
      where: { userId: previousOwnerUserId },
      include: {
        _count: {
          select: { technicianServices: true, availabilities: true, bookingOrders: true }
        }
      }
    });
    const seedCreatedProfile =
      previousOwnerProfile?.shopId === shop.id &&
      previousOwnerProfile.status === "private" &&
      previousOwnerProfile.yearsExperience === 0 &&
      previousOwnerProfile.bio === `${SIMULATION_NAMESPACE} の店舗運営者用技師プロフィールです。` &&
      previousOwnerProfile._count.technicianServices === 0 &&
      previousOwnerProfile._count.availabilities === 0 &&
      previousOwnerProfile._count.bookingOrders === 0;
    if (seedCreatedProfile && previousOwnerProfile) {
      await tx.technicianProfile.update({
        where: { id: previousOwnerProfile.id },
        data: {
          shopId: null,
          employmentType: TechnicianEmploymentType.INDEPENDENT,
          employmentStartedAt: null,
          status: "private"
        }
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "seed.lifedance_shop.owner_migrate",
        targetType: "Shop",
        targetId: shop.id,
        metadata: {
          namespace: SIMULATION_NAMESPACE,
          previousOwnerUserId,
          newOwnerUserId: admin.id
        }
      }
    });
  }

  return {
    adminUserId: admin.id,
    customerProfileId: customerProfile.id,
    technicianProfileId: technicianProfile.id,
    shopId: shop.id,
    previousOwnerUserId
  };
};
