import {
  assertSafeUnifiedIdentifierBackfillApply,
  buildUnifiedIdentifierBackfillPlan,
  parseUnifiedIdentifierBackfillArgs,
  runUnifiedIdentifierBackfill,
  type UnifiedIdentifierBackfillBatch,
  type UnifiedIdentifierBackfillOperation,
  type UnifiedIdentifierBackfillRuntime
} from "../scripts/backfill-unified-identifiers";
import { checkUnifiedIdentifierCutover } from "../scripts/check-unified-identifier-cutover";

const ordinaryNumberByUserId = new Map<number, string>([
  [1, "5831047296"],
  [2, "3141592653"],
  [3, "2718281828"],
  [4, "6029384751"],
  [5, "4901726385"],
  [6, "9182736450"]
]);

const fixture = (): UnifiedIdentifierBackfillBatch => ({
  users: [
    {
      id: 1,
      needoId: "n0000000237",
      accountNo: null,
      primaryIdentityType: null,
      identities: [
        {
          id: 11,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 101,
          isDefault: true,
          isActive: true,
          publicIdentifier: null
        }
      ],
      roleAssignments: [{ code: "customer", scopeType: "customer_profile", scopeId: 101 }],
      hasActiveTechnicianProfile: false,
      ownedMerchantAccountIds: []
    },
    {
      id: 2,
      needoId: "n0000000002",
      accountNo: null,
      primaryIdentityType: null,
      identities: [
        {
          id: 21,
          type: "platform",
          scopeType: "global",
          scopeId: null,
          isDefault: true,
          isActive: true,
          publicIdentifier: null
        }
      ],
      roleAssignments: [{ code: "operator", scopeType: "global", scopeId: null }],
      hasActiveTechnicianProfile: false,
      ownedMerchantAccountIds: []
    },
    {
      id: 3,
      needoId: "n0000000003",
      accountNo: null,
      primaryIdentityType: null,
      identities: [
        {
          id: 31,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 103,
          isDefault: true,
          isActive: true,
          publicIdentifier: null
        },
        {
          id: 32,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 203,
          isDefault: false,
          isActive: true,
          publicIdentifier: null
        }
      ],
      roleAssignments: [
        { code: "customer", scopeType: "customer_profile", scopeId: 103 },
        { code: "technician", scopeType: "technician_profile", scopeId: 203 }
      ],
      hasActiveTechnicianProfile: true,
      ownedMerchantAccountIds: []
    },
    {
      id: 4,
      needoId: "n0000000004",
      accountNo: null,
      primaryIdentityType: null,
      identities: [
        {
          id: 41,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 104,
          isDefault: true,
          isActive: true,
          publicIdentifier: null
        },
        {
          id: 42,
          type: "merchant_staff",
          scopeType: "shop",
          scopeId: 801,
          isDefault: false,
          isActive: true,
          publicIdentifier: null
        }
      ],
      roleAssignments: [
        { code: "customer", scopeType: "customer_profile", scopeId: 104 },
        { code: "merchant_staff", scopeType: "shop", scopeId: 801 }
      ],
      hasActiveTechnicianProfile: false,
      ownedMerchantAccountIds: []
    },
    {
      id: 5,
      needoId: "n0000000005",
      accountNo: null,
      primaryIdentityType: null,
      identities: [
        {
          id: 51,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 105,
          isDefault: true,
          isActive: true,
          publicIdentifier: null
        },
        {
          id: 52,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 801,
          isDefault: false,
          isActive: true,
          publicIdentifier: null
        }
      ],
      roleAssignments: [
        { code: "customer", scopeType: "customer_profile", scopeId: 105 },
        { code: "merchant_owner", scopeType: "shop", scopeId: 801 }
      ],
      hasActiveTechnicianProfile: false,
      ownedMerchantAccountIds: [701]
    }
  ],
  shops: [
    {
      id: 801,
      shopNo: null,
      publicIdentifier: null,
      customerSupportAccount: null
    }
  ],
  merchantAccounts: [
    {
      id: 701,
      ownerNo: null,
      publicIdentifier: null
    }
  ]
});

const applyOperationsToFixture = (
  batch: UnifiedIdentifierBackfillBatch,
  operations: readonly UnifiedIdentifierBackfillOperation[]
): number => {
  let nextIdentityId = 10_000;
  let mutatedRows = 0;

  for (const operation of operations) {
    if (operation.type === "ASSIGN_PRIMARY") {
      const user = batch.users.find((candidate) => candidate.id === operation.userId);
      if (!user) throw new Error("fixture user missing");
      const numberPart = operation.existingNumberPart ?? ordinaryNumberByUserId.get(user.id);
      if (!numberPart) throw new Error("fixture number missing");
      user.accountNo = numberPart;
      user.primaryIdentityType = operation.primaryKind;
      let identity = user.identities.find((candidate) => candidate.id === operation.identityId);
      if (!identity && operation.identityId === null && operation.createIdentity) {
        identity = {
          id: nextIdentityId,
          type: operation.createIdentity.type,
          scopeType: operation.createIdentity.type === "customer" ? "customer_profile" : "global",
          scopeId: operation.createIdentity.type === "customer" ? nextIdentityId : null,
          isDefault: false,
          isActive: true,
          publicIdentifier: null
        };
        nextIdentityId += 1;
        user.identities.push(identity);
        mutatedRows += operation.createIdentity.type === "customer" ? 3 : 1;
      }
      if (!identity) throw new Error("fixture primary identity missing");
      user.identities.forEach((candidate) => {
        candidate.isDefault = candidate.id === identity?.id;
      });
      identity.publicIdentifier = {
        kind: operation.primaryKind,
        numberPart,
        publicId: `${operation.primaryKind === "U" ? "u" : "needo"}${numberPart}`
      };
      mutatedRows += 2;
      continue;
    }

    if (operation.type === "ASSIGN_ALIAS") {
      const user = batch.users.find((candidate) => candidate.id === operation.userId);
      if (!user?.accountNo) throw new Error("fixture alias account missing");
      let identity = user.identities.find((candidate) => candidate.id === operation.identityId);
      if (!identity && operation.createIdentity) {
        identity = {
          id: nextIdentityId,
          type: operation.createIdentity.type,
          scopeType: operation.createIdentity.scopeType,
          scopeId: operation.createIdentity.scopeId,
          isDefault: false,
          isActive: true,
          publicIdentifier: null
        };
        nextIdentityId += 1;
        user.identities.push(identity);
        mutatedRows += 1;
      }
      if (!identity) throw new Error("fixture alias identity missing");
      identity.publicIdentifier = {
        kind: operation.aliasKind,
        numberPart: user.accountNo,
        publicId: `${operation.aliasKind.toLowerCase()}${user.accountNo}`
      };
      mutatedRows += 1;
      continue;
    }

    if (operation.type === "ASSIGN_MERCHANT") {
      const merchant = batch.merchantAccounts.find(
        (candidate) => candidate.id === operation.merchantAccountId
      );
      if (!merchant) throw new Error("fixture merchant missing");
      const numberPart = operation.existingNumberPart ?? "8514072936";
      merchant.ownerNo = numberPart;
      merchant.publicIdentifier = {
        kind: "OWNER",
        numberPart,
        publicId: `owner${numberPart}`
      };
      mutatedRows += 2;
      continue;
    }

    const shop = batch.shops.find((candidate) => candidate.id === operation.shopId);
    if (!shop) throw new Error("fixture shop missing");
    const numberPart = operation.existingNumberPart ?? "7304826159";
    shop.shopNo = numberPart;
    shop.publicIdentifier = { kind: "SHOP", numberPart, publicId: `shop${numberPart}` };
    shop.customerSupportAccount = {
      id: shop.customerSupportAccount?.id ?? 9_000 + shop.id,
      type: "SHOP",
      isActive: true,
      deletedAt: null,
      publicIdentifier: {
        kind: "CUSTOMER_SUPPORT",
        numberPart,
        publicId: `cs${numberPart}`
      }
    };
    mutatedRows += 4;
  }

  return mutatedRows;
};

class FixtureRuntime implements UnifiedIdentifierBackfillRuntime {
  public applyCalls = 0;

  public constructor(public readonly batch: UnifiedIdentifierBackfillBatch) {}

  public async *scan(): AsyncGenerator<UnifiedIdentifierBackfillBatch> {
    yield this.batch;
  }

  public async applyOperations(
    operations: readonly UnifiedIdentifierBackfillOperation[]
  ): Promise<number> {
    this.applyCalls += 1;
    return applyOperationsToFixture(this.batch, operations);
  }
}

describe("unified identifier backfill", () => {
  it("creates a distinct customer primary identity when a legacy user only has a technician identity", () => {
    const batch = fixture();
    batch.users = [
      {
        id: 6,
        needoId: "n0000000006",
        accountNo: null,
        primaryIdentityType: null,
        identities: [
          {
            id: 61,
            type: "technician",
            scopeType: "technician_profile",
            scopeId: 206,
            isDefault: true,
            isActive: true,
            publicIdentifier: null
          }
        ],
        roleAssignments: [
          { code: "technician", scopeType: "technician_profile", scopeId: 206 }
        ],
        hasActiveTechnicianProfile: true,
        ownedMerchantAccountIds: []
      }
    ];
    batch.shops = [];
    batch.merchantAccounts = [];

    const plan = buildUnifiedIdentifierBackfillPlan(batch);

    expect(plan.issues).toEqual([]);
    expect(plan.operations).toContainEqual(
      expect.objectContaining({
        type: "ASSIGN_PRIMARY",
        userId: 6,
        identityId: null,
        primaryKind: "U",
        createIdentity: { type: "customer" }
      })
    );
    expect(plan.operations).toContainEqual(
      expect.objectContaining({
        type: "ASSIGN_ALIAS",
        userId: 6,
        identityId: 61,
        aliasKind: "S"
      })
    );
  });

  it("applies the missing customer identity repair atomically and remains idempotent", async () => {
    const batch = fixture();
    batch.users = [
      {
        id: 6,
        needoId: "n0000000006",
        accountNo: null,
        primaryIdentityType: null,
        identities: [
          {
            id: 61,
            type: "technician",
            scopeType: "technician_profile",
            scopeId: 206,
            isDefault: true,
            isActive: true,
            publicIdentifier: null
          }
        ],
        roleAssignments: [
          { code: "technician", scopeType: "technician_profile", scopeId: 206 }
        ],
        hasActiveTechnicianProfile: true,
        ownedMerchantAccountIds: []
      }
    ];
    batch.shops = [];
    batch.merchantAccounts = [];
    const runtime = new FixtureRuntime(batch);

    const first = await runUnifiedIdentifierBackfill(runtime, {
      mode: "apply",
      batchSize: 20
    });
    const second = await runUnifiedIdentifierBackfill(runtime, {
      mode: "apply",
      batchSize: 20
    });
    const customerIdentity = batch.users[0]?.identities.find(
      (identity) => identity.type === "customer"
    );
    const technicianIdentity = batch.users[0]?.identities.find(
      (identity) => identity.type === "technician"
    );

    expect(first.mutatedRows).toBeGreaterThan(0);
    expect(customerIdentity?.publicIdentifier?.kind).toBe("U");
    expect(customerIdentity?.isDefault).toBe(true);
    expect(technicianIdentity?.publicIdentifier?.kind).toBe("S");
    expect(customerIdentity?.id).not.toBe(technicianIdentity?.id);
    expect(second).toMatchObject({ plannedOperations: 0, mutatedRows: 0 });
  });

  it("plans fresh U/NEEDO numbers, shared S/B/O aliases, and independent entities", () => {
    const batch = fixture();
    const plan = buildUnifiedIdentifierBackfillPlan(batch);

    expect(plan.issues).toEqual([]);
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ASSIGN_PRIMARY", userId: 1, primaryKind: "U" }),
        expect.objectContaining({ type: "ASSIGN_PRIMARY", userId: 2, primaryKind: "NEEDO" }),
        expect.objectContaining({ type: "ASSIGN_ALIAS", userId: 3, aliasKind: "S" }),
        expect.objectContaining({ type: "ASSIGN_ALIAS", userId: 4, aliasKind: "B" }),
        expect.objectContaining({ type: "ASSIGN_ALIAS", userId: 5, aliasKind: "O" }),
        expect.objectContaining({ type: "ASSIGN_MERCHANT", merchantAccountId: 701 }),
        expect.objectContaining({ type: "ASSIGN_SHOP_SUPPORT", shopId: 801 })
      ])
    );
    expect(
      plan.operations.find(
        (operation) => operation.type === "ASSIGN_PRIMARY" && operation.userId === 1
      )
    ).not.toMatchObject({ existingNumberPart: "0000000237" });
  });

  it("dry-run reports planned work without invoking a database writer", async () => {
    const runtime = new FixtureRuntime(fixture());

    const report = await runUnifiedIdentifierBackfill(runtime, {
      mode: "dry-run",
      batchSize: 25
    });

    expect(report.mode).toBe("dry-run");
    expect(report.mutatedRows).toBe(0);
    expect(report.plannedOperations).toBeGreaterThan(0);
    expect(runtime.applyCalls).toBe(0);
  });

  it("is idempotent after a completed apply", async () => {
    const runtime = new FixtureRuntime(fixture());

    const first = await runUnifiedIdentifierBackfill(runtime, {
      mode: "apply",
      batchSize: 2
    });
    const second = await runUnifiedIdentifierBackfill(runtime, {
      mode: "apply",
      batchSize: 2
    });

    expect(first.mutatedRows).toBeGreaterThan(0);
    expect(second).toMatchObject({ plannedOperations: 0, mutatedRows: 0 });
    expect(runtime.batch.users[0]?.accountNo).not.toBe("0000000237");
  });

  it("blocks ambiguous ownership and returns a structured exception report", async () => {
    const batch = fixture();
    batch.users[0]?.identities.push({
      id: 12,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 102,
      isDefault: true,
      isActive: true,
      publicIdentifier: null
    });
    const runtime = new FixtureRuntime(batch);

    await expect(
      runUnifiedIdentifierBackfill(runtime, { mode: "apply", batchSize: 20 })
    ).rejects.toMatchObject({
      report: {
        issues: [
          expect.objectContaining({
            entity: "User",
            entityId: 1,
            code: "AMBIGUOUS_PRIMARY_IDENTITY"
          })
        ],
        mutatedRows: 0
      }
    });
    expect(runtime.applyCalls).toBe(0);
  });

  it("rejects conflicting explicit U classification for a platform-company account", () => {
    const batch = fixture();
    batch.users[1]!.primaryIdentityType = "U";

    expect(buildUnifiedIdentifierBackfillPlan(batch).issues).toContainEqual(
      expect.objectContaining({
        entity: "User",
        entityId: 2,
        code: "PRIMARY_KIND_CONFLICT"
      })
    );
  });

  it("creates O for an authorized merchant-level participant who is not ownerUserId", () => {
    const batch = fixture();
    batch.users[3]!.roleAssignments.push({
      code: "merchant_owner",
      scopeType: "merchant_account",
      scopeId: 701
    });
    batch.users[3]!.identities.push({
      id: 43,
      type: "merchant_owner",
      scopeType: "merchant_account",
      scopeId: 701,
      isDefault: false,
      isActive: true,
      publicIdentifier: null
    });

    expect(buildUnifiedIdentifierBackfillPlan(batch).operations).toContainEqual(
      expect.objectContaining({
        type: "ASSIGN_ALIAS",
        userId: 4,
        identityId: 43,
        aliasKind: "O"
      })
    );
  });

  it("blocks a tombstoned public identifier instead of reusing its number", () => {
    const batch = fixture();
    batch.users[0]!.identities[0]!.publicIdentifier = {
      publicId: "u5831047296",
      numberPart: "5831047296",
      kind: "U",
      status: "TOMBSTONED",
      deletedAt: null
    };

    expect(buildUnifiedIdentifierBackfillPlan(batch).issues).toContainEqual(
      expect.objectContaining({
        entity: "User",
        entityId: 1,
        code: "INACTIVE_PUBLIC_IDENTIFIER"
      })
    );
  });

  it("blocks a legacy or malformed persisted public identifier", () => {
    const batch = fixture();
    batch.users[0]!.identities[0]!.publicIdentifier = {
      publicId: "n5831047296",
      numberPart: "5831047296",
      kind: "U",
      status: "ACTIVE",
      deletedAt: null
    };

    expect(buildUnifiedIdentifierBackfillPlan(batch).issues).toContainEqual(
      expect.objectContaining({
        entity: "User",
        entityId: 1,
        code: "IDENTIFIER_FORMAT_CONFLICT"
      })
    );
  });

  it("blocks an inactive Shop support account instead of reviving it", () => {
    const batch = fixture();
    batch.shops[0]!.customerSupportAccount = {
      id: 901,
      type: "SHOP",
      isActive: false,
      deletedAt: null,
      publicIdentifier: null
    };

    expect(buildUnifiedIdentifierBackfillPlan(batch).issues).toContainEqual(
      expect.objectContaining({
        entity: "Shop",
        entityId: 801,
        code: "INACTIVE_SUPPORT_ACCOUNT"
      })
    );
  });

  it("requires explicit mode, confirmation, and exact target database protection", () => {
    expect(parseUnifiedIdentifierBackfillArgs(["--dry-run", "--batch-size=75"])).toEqual({
      mode: "dry-run",
      batchSize: 75,
      confirmation: null,
      expectedDatabase: null
    });
    expect(() => parseUnifiedIdentifierBackfillArgs(["--apply"])).toThrow(
      "--confirm=BACKFILL_UNIFIED_IDENTIFIERS"
    );
    expect(() =>
      assertSafeUnifiedIdentifierBackfillApply(
        {
          NODE_ENV: "development",
          DEPLOY_ENV: "local",
          DATABASE_URL: "mysql://needo:secret@127.0.0.1:3306/needo_dev"
        },
        { expectedDatabase: "another_database" }
      )
    ).toThrow("target database mismatch");
    expect(() =>
      assertSafeUnifiedIdentifierBackfillApply(
        {
          NODE_ENV: "production",
          DEPLOY_ENV: "prod",
          DATABASE_URL: "mysql://needo:secret@db.internal:3306/needo_prod"
        },
        { expectedDatabase: "needo_prod" }
      )
    ).toThrow("production apply is forbidden");
  });

  it("checks cutover readiness without mutating the fixture", async () => {
    const runtime = new FixtureRuntime(fixture());

    const before = await checkUnifiedIdentifierCutover(runtime, 25);
    expect(before.ready).toBe(false);
    expect(before.report.after.pendingOperations).toBeGreaterThan(0);
    expect(runtime.applyCalls).toBe(0);

    await runUnifiedIdentifierBackfill(runtime, { mode: "apply", batchSize: 25 });
    const applyCalls = runtime.applyCalls;
    const after = await checkUnifiedIdentifierCutover(runtime, 25);
    expect(after.ready).toBe(true);
    expect(after.report.after.pendingOperations).toBe(0);
    expect(runtime.applyCalls).toBe(applyCalls);
  });
});
