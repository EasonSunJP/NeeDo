import type { PrismaClient } from "@prisma/client";
import {
  parseStagingShopPublicIdentifierRepairConfig,
  repairStagingShopPublicIdentifier
} from "../src/staging/staging-shop-public-identifier-repair";

interface ShopRecord {
  id: number;
  ownerUserId: number;
  name: string;
  shopNo: string | null;
  publicIdentifier: {
    publicId: string;
    numberPart: string;
    kind: string;
    status: string;
    deletedAt: Date | null;
  } | null;
  customerSupportAccount: {
    id: number;
    type: string;
    isActive: boolean;
    deletedAt: Date | null;
    publicIdentifier: {
      publicId: string;
      numberPart: string;
      kind: string;
      status: string;
      deletedAt: Date | null;
    } | null;
  } | null;
}

describe("staging shop public identifier repair", () => {
  const validEnv = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_SHOP_PUBLIC_IDENTIFIER_REPAIR: "true",
    DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_staging",
    ADMIN_DEFAULT_EMAIL: "admin@lifedance.com",
    STAGING_REPAIR_SHOP_ID: "32"
  } as NodeJS.ProcessEnv;
  const config = {
    databaseHost: "mysql" as const,
    databaseName: "needo_staging" as const,
    actorEmail: "admin@lifedance.com",
    shopId: 32
  };
  const completeShop: ShopRecord = {
    id: 32,
    ownerUserId: 77,
    name: "申请店铺",
    shopNo: "8274936150",
    publicIdentifier: {
      publicId: "shop8274936150",
      numberPart: "8274936150",
      kind: "SHOP",
      status: "ACTIVE",
      deletedAt: null
    },
    customerSupportAccount: {
      id: 62,
      type: "SHOP",
      isActive: true,
      deletedAt: null,
      publicIdentifier: {
        publicId: "cs8274936150",
        numberPart: "8274936150",
        kind: "CUSTOMER_SUPPORT",
        status: "ACTIVE",
        deletedAt: null
      }
    }
  };

  const buildDatabase = (shop: ShopRecord) => {
    const tx = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
      shop: {
        findFirst: jest.fn().mockResolvedValue(shop),
        update: jest.fn().mockResolvedValue({ id: shop.id })
      },
      merchantShopMembership: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ merchantAccount: { code: "NEEDO-APP-41", ownerUserId: 77 } }])
      },
      identityApplication: { findFirst: jest.fn().mockResolvedValue({ id: 41 }) },
      userIdentity: { findFirst: jest.fn().mockResolvedValue({ id: 109 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 501 }) },
      customerSupportAccount: { create: jest.fn().mockResolvedValue({ id: 62 }) },
      vanityNumberReservation: { findFirst: jest.fn().mockResolvedValue(null) },
      publicIdentifier: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 301,
          status: "ACTIVE",
          deletedAt: null,
          userIdentityId: null,
          shopId: null,
          merchantAccountId: null,
          customerSupportAccountId: null,
          ...data
        }))
      }
    };
    const transaction = jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx));
    const client = { $transaction: transaction } as unknown as PrismaClient;
    return { client, transaction, tx };
  };

  const emptyShop = (): ShopRecord => ({
    ...completeShop,
    shopNo: null,
    publicIdentifier: null,
    customerSupportAccount: null
  });

  it("accepts only an explicit staging database and positive shop id", () => {
    expect(parseStagingShopPublicIdentifierRepairConfig(validEnv)).toEqual(config);

    for (const override of [
      { NODE_ENV: "development" },
      { DEPLOY_ENV: "production" },
      { ALLOW_STAGING_SHOP_PUBLIC_IDENTIFIER_REPAIR: "false" },
      { DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_prod" },
      { DATABASE_URL: "mysql://needo:secret@127.0.0.1:3306/needo_staging" },
      { ADMIN_DEFAULT_EMAIL: undefined },
      { STAGING_REPAIR_SHOP_ID: "0" },
      { STAGING_REPAIR_SHOP_ID: "shop32" }
    ]) {
      expect(() =>
        parseStagingShopPublicIdentifierRepairConfig({ ...validEnv, ...override })
      ).toThrow();
    }
  });

  it("returns an idempotent no-op only for a complete approved shop graph", async () => {
    const { client, tx } = buildDatabase(completeShop);

    await expect(repairStagingShopPublicIdentifier(client, config)).resolves.toEqual({
      changed: false,
      applicationId: 41,
      shopId: 32,
      shopNo: "8274936150",
      shopPublicId: "shop8274936150"
    });

    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: "admin@lifedance.com",
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
    expect(tx.merchantShopMembership.findMany).toHaveBeenCalledWith({
      where: {
        shopId: 32,
        activeKey: { not: null },
        endsAt: null,
        deletedAt: null,
        merchantAccount: {
          ownerUserId: 77,
          status: "active",
          deletedAt: null
        }
      },
      select: { merchantAccount: { select: { code: true, ownerUserId: true } } },
      take: 2
    });
    expect(tx.identityApplication.findFirst).toHaveBeenCalledWith({
      where: { id: 41, userId: 77, type: "merchant", status: "approved", deletedAt: null },
      select: { id: true }
    });
    expect(tx.userIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 77,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: 32,
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });
    expect(tx.customerSupportAccount.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("repairs an empty identifier graph and audits the bound application", async () => {
    const { client, tx } = buildDatabase(emptyShop());

    await expect(
      repairStagingShopPublicIdentifier(client, config, () => "8274936150")
    ).resolves.toEqual({
      changed: true,
      applicationId: 41,
      shopId: 32,
      shopNo: "8274936150",
      shopPublicId: "shop8274936150"
    });

    expect(tx.publicIdentifier.create).toHaveBeenCalledTimes(2);
    expect(tx.shop.update).toHaveBeenCalledWith({
      where: { id: 32 },
      data: { shopNo: "8274936150" }
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 9,
        action: "staging.shop_public_identifier.repair",
        targetType: "Shop",
        targetId: 32,
        metadata: {
          applicationId: 41,
          shopNo: "8274936150",
          shopPublicId: "shop8274936150",
          customerSupportPublicId: "cs8274936150"
        }
      }
    });
  });

  it.each([
    { shopNo: "8274936150" },
    { publicIdentifier: completeShop.publicIdentifier },
    { customerSupportAccount: completeShop.customerSupportAccount }
  ])("fails closed for a partial identifier graph: %o", async (partial) => {
    const { client, tx } = buildDatabase({ ...emptyShop(), ...partial });

    await expect(repairStagingShopPublicIdentifier(client, config)).rejects.toThrow(
      "STAGING_SHOP_PUBLIC_IDENTIFIER_PARTIAL_STATE"
    );
    expect(tx.customerSupportAccount.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "membership",
      (tx: ReturnType<typeof buildDatabase>["tx"]) =>
        tx.merchantShopMembership.findMany.mockResolvedValue([])
    ],
    [
      "application",
      (tx: ReturnType<typeof buildDatabase>["tx"]) =>
        tx.identityApplication.findFirst.mockResolvedValue(null)
    ],
    [
      "identity",
      (tx: ReturnType<typeof buildDatabase>["tx"]) =>
        tx.userIdentity.findFirst.mockResolvedValue(null)
    ]
  ])("refuses repair without bound approval %s evidence", async (_label, removeEvidence) => {
    const { client, tx } = buildDatabase(emptyShop());
    removeEvidence(tx);

    await expect(repairStagingShopPublicIdentifier(client, config)).rejects.toThrow(
      "STAGING_SHOP_PUBLIC_IDENTIFIER_APPROVAL_EVIDENCE_NOT_FOUND"
    );
    expect(tx.customerSupportAccount.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects ambiguous membership-to-application bindings", async () => {
    const { client, tx } = buildDatabase(emptyShop());
    tx.merchantShopMembership.findMany.mockResolvedValue([
      { merchantAccount: { code: "NEEDO-APP-41", ownerUserId: 77 } },
      { merchantAccount: { code: "NEEDO-APP-42", ownerUserId: 77 } }
    ]);

    await expect(repairStagingShopPublicIdentifier(client, config)).rejects.toThrow(
      "STAGING_SHOP_PUBLIC_IDENTIFIER_APPROVAL_EVIDENCE_AMBIGUOUS"
    );
    expect(tx.customerSupportAccount.create).not.toHaveBeenCalled();
  });

  it("keeps provisioning and audit inside one database transaction", async () => {
    const { client, transaction, tx } = buildDatabase(emptyShop());
    tx.auditLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      repairStagingShopPublicIdentifier(client, config, () => "8274936150")
    ).rejects.toThrow("audit unavailable");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.publicIdentifier.create).toHaveBeenCalledTimes(2);
  });

  it("retries a serializable transaction conflict and then observes the completed graph", async () => {
    const { client, transaction } = buildDatabase(completeShop);
    transaction.mockRejectedValueOnce(
      Object.assign(new Error("write conflict"), { code: "P2034" })
    );

    await expect(repairStagingShopPublicIdentifier(client, config)).resolves.toMatchObject({
      changed: false,
      applicationId: 41,
      shopId: 32,
      shopNo: "8274936150"
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
