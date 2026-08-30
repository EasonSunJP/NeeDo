import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const LIFEDANCE_EMPTY_ADMIN_TEST_NDP = 100_000;

export const LIFEDANCE_EMPTY_ADMIN_PLANS = [
  {
    email: "adminb@lifedance.com",
    needoId: "needo0000000003",
    numberPart: "0000000003",
    displayName: "LifeDance 管理员 B"
  },
  {
    email: "adminc@lifedance.com",
    needoId: "needo0000000004",
    numberPart: "0000000004",
    displayName: "LifeDance 管理员 C"
  },
  {
    email: "admind@lifedance.com",
    needoId: "needo0000000005",
    numberPart: "0000000005",
    displayName: "LifeDance 管理员 D"
  }
] as const;

export const OPERATOR_U_IDENTIFIER_REPAIR = {
  email: "operator@example.com",
  numberPart: "7073340315",
  previousPublicId: "needo7073340315",
  publicId: "u7073340315"
} as const;

export type LifeDanceEmptyAdminPlan = (typeof LIFEDANCE_EMPTY_ADMIN_PLANS)[number];

export interface EmptyAdminAccountCandidate {
  id: number;
  email: string;
  needoId: string;
  accountNo: string | null;
}

export interface EmptyAdminProvisioningResult {
  accounts: Array<{
    userId: number;
    email: string;
    needoId: string;
    availableBalance: number;
  }>;
  operator: {
    userId: number;
    previousPublicId: string;
    publicId: string;
    repaired: boolean;
  };
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

export const resolveSharedTestAccountPassword = (env: {
  NODE_ENV?: string;
  DEPLOY_ENV?: string;
  TEST_USER_DEFAULT_PASSWORD?: string;
  ADMIN_DEFAULT_PASSWORD?: string;
}): string => {
  const testPassword = env.TEST_USER_DEFAULT_PASSWORD?.trim();
  if (testPassword) return testPassword;
  const localAdminPassword = env.ADMIN_DEFAULT_PASSWORD?.trim();
  const isLocalLike =
    env.NODE_ENV !== "production" && ["local", "test"].includes(env.DEPLOY_ENV ?? "local");
  if (localAdminPassword && isLocalLike) return localAdminPassword;
  assert(
    !localAdminPassword,
    "TEST_USER_DEFAULT_PASSWORD is required outside local/test environments."
  );
  throw new Error(
    "TEST_USER_DEFAULT_PASSWORD or local ADMIN_DEFAULT_PASSWORD is required for real test accounts."
  );
};

export const getEmptyAdminWalletTopUpAmount = (availableBalance: number): number =>
  Math.max(LIFEDANCE_EMPTY_ADMIN_TEST_NDP - availableBalance, 0);

export const assertLocalEmptyAdminProvisioningTarget = (env: {
  NODE_ENV?: string;
  DEPLOY_ENV?: string;
  DATABASE_URL?: string;
}): void => {
  const fail = (): never => {
    throw new Error("LifeDance empty-admin provisioning is allowed only for local needo_dev MySQL.");
  };

  if (env.NODE_ENV === "production" || env.DEPLOY_ENV === "prod") fail();
  const databaseUrlValue = env.DATABASE_URL;
  if (!databaseUrlValue) return fail();

  let databaseUrl: URL | null = null;
  try {
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    fail();
  }
  if (
    !databaseUrl ||
    databaseUrl.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname) ||
    databaseUrl.pathname.replace(/^\//, "") !== "needo_dev"
  ) {
    fail();
  }
};

export const selectEmptyAdminAccountCandidate = (
  plan: LifeDanceEmptyAdminPlan,
  candidates: readonly EmptyAdminAccountCandidate[]
): EmptyAdminAccountCandidate | null => {
  const uniqueCandidates = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  assert(
    uniqueCandidates.size <= 1,
    `LifeDance empty-admin ${plan.email} email and identifier belong to different users.`
  );
  const candidate = [...uniqueCandidates.values()][0] ?? null;
  if (candidate) {
    assert(
      candidate.email === plan.email &&
        candidate.needoId === plan.needoId &&
        candidate.accountNo === plan.numberPart,
      `LifeDance empty-admin ${plan.email} belongs to a different fixed account.`
    );
  }
  return candidate;
};

const ensureAdminRole = async (
  tx: Prisma.TransactionClient,
  userId: number
): Promise<void> => {
  const role = await tx.role.findFirst({
    where: { code: "admin", deletedAt: null },
    select: { id: true }
  });
  assert(role, "LifeDance empty-admin provisioning requires the active admin role.");
  const existing = await tx.userRole.findFirst({
    where: { userId, roleId: role.id, scopeType: "global", scopeId: null }
  });
  if (existing) {
    await tx.userRole.update({ where: { id: existing.id }, data: { deletedAt: null } });
    return;
  }
  await tx.userRole.create({
    data: { userId, roleId: role.id, scopeType: "global", scopeId: null }
  });
};

const ensurePlatformIdentity = async (
  tx: Prisma.TransactionClient,
  input: { userId: number; displayName: string; publicId: string; numberPart: string }
): Promise<number> => {
  const identities = await tx.userIdentity.findMany({
    where: { userId: input.userId, type: "platform", deletedAt: null },
    include: { publicIdentifier: true }
  });
  assert(identities.length <= 1, `User ${input.userId} has duplicate platform identities.`);
  const identity = identities[0]
    ? await tx.userIdentity.update({
        where: { id: identities[0].id },
        data: {
          scopeType: "global",
          scopeId: null,
          displayName: input.displayName,
          isDefault: true,
          isActive: true,
          deletedAt: null
        },
        include: { publicIdentifier: true }
      })
    : await tx.userIdentity.create({
        data: {
          userId: input.userId,
          type: "platform",
          activeKey: `lifedance-empty-admin:${input.userId}:platform:global`,
          scopeType: "global",
          displayName: input.displayName,
          isDefault: true,
          isActive: true
        },
        include: { publicIdentifier: true }
      });

  const identifierCandidates = await tx.publicIdentifier.findMany({
    where: {
      OR: [
        { publicId: input.publicId },
        { kind: "NEEDO", numberPart: input.numberPart },
        { userIdentityId: identity.id }
      ]
    }
  });
  const uniqueIdentifiers = new Map(
    identifierCandidates.map((identifier) => [identifier.id, identifier])
  );
  assert(
    uniqueIdentifiers.size <= 1,
    `LifeDance empty-admin identifier ${input.publicId} conflicts with another identifier.`
  );
  const identifier = [...uniqueIdentifiers.values()][0];
  if (identifier) {
    assert(
      identifier.userIdentityId === identity.id &&
        identifier.publicId === input.publicId &&
        identifier.numberPart === input.numberPart &&
        identifier.kind === "NEEDO",
      `LifeDance empty-admin identifier ${input.publicId} belongs to another identity.`
    );
    await tx.publicIdentifier.update({
      where: { id: identifier.id },
      data: {
        loginAllowed: true,
        searchable: true,
        status: "ACTIVE",
        deletedAt: null
      }
    });
  } else {
    await tx.publicIdentifier.create({
      data: {
        publicId: input.publicId,
        numberPart: input.numberPart,
        kind: "NEEDO",
        userIdentityId: identity.id,
        loginAllowed: true,
        searchable: true
      }
    });
  }
  return identity.id;
};

const createLedgerTransactionNo = (idempotencyKey: string, amount: number): string => {
  const digest = createHash("sha1").update(idempotencyKey).digest("hex").slice(0, 12).toUpperCase();
  return `LTEMPTY${digest}${Math.abs(amount)}`.slice(0, 40);
};

const ensureTestNdp = async (
  tx: Prisma.TransactionClient,
  input: { userId: number; actorUserId: number }
): Promise<number> => {
  const wallet = await tx.wallet.upsert({
    where: {
      ownerType_ownerId_currency: {
        ownerType: "USER",
        ownerId: input.userId,
        currency: "NDP"
      }
    },
    create: { ownerType: "USER", ownerId: input.userId, currency: "NDP" },
    update: { deletedAt: null }
  });
  const amount = getEmptyAdminWalletTopUpAmount(wallet.availableBalance);
  if (amount <= 0) return wallet.availableBalance;

  const idempotencyKey = [
    "lifedance",
    "empty-admin",
    input.userId,
    "test-ndp",
    wallet.availableBalance,
    wallet.frozenBalance,
    amount,
    wallet.updatedAt.getTime()
  ].join(":");
  const transaction = await tx.ledgerTransaction.create({
    data: {
      transactionNo: createLedgerTransactionNo(idempotencyKey, amount),
      idempotencyKey,
      type: "SEED_CREDIT",
      referenceType: "lifedance_empty_admin_seed",
      referenceId: wallet.id,
      actorUserId: input.actorUserId,
      amount,
      currency: "NDP",
      metadata: { ownerType: "USER", ownerId: input.userId, targetAvailableBalance: 100_000 }
    }
  });
  const updatedWallet = await tx.wallet.update({
    where: { id: wallet.id },
    data: { availableBalance: { increment: amount } }
  });
  await tx.walletLedger.create({
    data: {
      walletId: wallet.id,
      transactionId: transaction.id,
      direction: "AVAILABLE_CREDIT",
      amount,
      availableDelta: amount,
      frozenDelta: 0,
      availableBalanceAfter: updatedWallet.availableBalance,
      frozenBalanceAfter: updatedWallet.frozenBalance,
      reason: "lifedance_empty_admin_test_ndp"
    }
  });
  await tx.financeReconciliation.create({
    data: {
      transactionId: transaction.id,
      referenceType: "lifedance_empty_admin_seed",
      referenceId: wallet.id,
      currency: "NDP",
      expectedAmount: amount,
      actualAmount: amount,
      differenceAmount: 0
    }
  });
  await tx.auditLog.create({
    data: {
      actorId: input.actorUserId,
      action: "ledger.empty_admin_test_ndp.credit",
      targetType: "ledger_transaction",
      targetId: transaction.id,
      metadata: { walletId: wallet.id, amount, currency: "NDP" }
    }
  });
  return updatedWallet.availableBalance;
};

const provisionEmptyAdmin = async (
  tx: Prisma.TransactionClient,
  input: { plan: LifeDanceEmptyAdminPlan; passwordHash: string; actorUserId: number }
) => {
  const candidates = await tx.user.findMany({
    where: {
      OR: [
        { email: input.plan.email },
        { needoId: input.plan.needoId },
        { accountNo: input.plan.numberPart }
      ]
    },
    select: { id: true, email: true, needoId: true, accountNo: true }
  });
  const candidate = selectEmptyAdminAccountCandidate(input.plan, candidates);
  const user = candidate
    ? await tx.user.update({
        where: { id: candidate.id },
        data: {
          emailVerifiedAt: new Date(),
          passwordHash: input.passwordHash,
          username: input.plan.displayName,
          isActive: true,
          deletedAt: null,
          sessionGeneration: { increment: 1 }
        }
      })
    : await tx.user.create({
        data: {
          needoId: input.plan.needoId,
          accountNo: input.plan.numberPart,
          primaryIdentityType: "NEEDO",
          email: input.plan.email,
          emailVerifiedAt: new Date(),
          passwordHash: input.passwordHash,
          username: input.plan.displayName,
          isActive: true
        }
      });

  await ensurePlatformIdentity(tx, {
    userId: user.id,
    displayName: input.plan.displayName,
    publicId: input.plan.needoId,
    numberPart: input.plan.numberPart
  });
  await tx.user.update({
    where: { id: user.id },
    data: {
      needoId: input.plan.needoId,
      accountNo: input.plan.numberPart,
      primaryIdentityType: "NEEDO"
    }
  });
  await ensureAdminRole(tx, user.id);
  const availableBalance = await ensureTestNdp(tx, {
    userId: user.id,
    actorUserId: input.actorUserId
  });
  await tx.auditLog.create({
    data: {
      actorId: input.actorUserId,
      action: candidate ? "user.empty_admin_test_account.refresh" : "user.empty_admin_test_account.create",
      targetType: "user",
      targetId: user.id,
      metadata: {
        email: input.plan.email,
        needoId: input.plan.needoId,
        emptyBusinessAccount: true,
        targetAvailableBalance: LIFEDANCE_EMPTY_ADMIN_TEST_NDP
      }
    }
  });
  return { userId: user.id, email: user.email, needoId: user.needoId, availableBalance };
};

const repairOperatorIdentifier = async (
  tx: Prisma.TransactionClient,
  actorUserId: number
): Promise<EmptyAdminProvisioningResult["operator"]> => {
  const user = await tx.user.findUnique({
    where: { email: OPERATOR_U_IDENTIFIER_REPAIR.email },
    include: {
      identities: {
        where: { deletedAt: null, isActive: true },
        include: { publicIdentifier: true }
      }
    }
  });
  assert(user && user.deletedAt === null, "operator@example.com is missing or deleted.");
  assert(
    user.accountNo === OPERATOR_U_IDENTIFIER_REPAIR.numberPart,
    "operator@example.com account number does not match the planned U identifier repair."
  );
  const platformIdentity = user.identities.find((identity) => identity.type === "platform");
  const customerIdentity = user.identities.find((identity) =>
    ["customer", "user", "u"].includes(identity.type)
  );
  assert(platformIdentity, "operator@example.com platform identity is missing.");
  assert(customerIdentity, "operator@example.com customer identity is missing.");
  const currentU = customerIdentity.publicIdentifier;
  if (
    user.needoId === OPERATOR_U_IDENTIFIER_REPAIR.publicId &&
    user.primaryIdentityType === "U" &&
    currentU?.publicId === OPERATOR_U_IDENTIFIER_REPAIR.publicId &&
    currentU.kind === "U"
  ) {
    return {
      userId: user.id,
      previousPublicId: OPERATOR_U_IDENTIFIER_REPAIR.previousPublicId,
      publicId: OPERATOR_U_IDENTIFIER_REPAIR.publicId,
      repaired: false
    };
  }

  assert(
    user.needoId === OPERATOR_U_IDENTIFIER_REPAIR.previousPublicId &&
      user.primaryIdentityType === "NEEDO",
    "operator@example.com is not in the expected NEEDO state for U identifier repair."
  );
  const oldIdentifier = platformIdentity.publicIdentifier;
  assert(
    oldIdentifier?.publicId === OPERATOR_U_IDENTIFIER_REPAIR.previousPublicId &&
      oldIdentifier.numberPart === OPERATOR_U_IDENTIFIER_REPAIR.numberPart &&
      oldIdentifier.kind === "NEEDO",
    "operator@example.com platform identifier is not the expected NEEDO identifier."
  );
  assert(!customerIdentity.publicIdentifier, "operator@example.com customer identity already has another identifier.");
  const conflictingU = await tx.publicIdentifier.findUnique({
    where: { publicId: OPERATOR_U_IDENTIFIER_REPAIR.publicId }
  });
  assert(!conflictingU, `${OPERATOR_U_IDENTIFIER_REPAIR.publicId} already belongs to another identity.`);

  await tx.publicIdentifier.update({
    where: { id: oldIdentifier.id },
    data: {
      publicId: OPERATOR_U_IDENTIFIER_REPAIR.publicId,
      kind: "U",
      userIdentityId: customerIdentity.id,
      loginAllowed: true,
      searchable: true,
      status: "ACTIVE",
      deletedAt: null
    }
  });
  await tx.userIdentity.update({
    where: { id: platformIdentity.id },
    data: { isDefault: false }
  });
  await tx.userIdentity.update({
    where: { id: customerIdentity.id },
    data: { isDefault: true }
  });
  await tx.user.update({
    where: { id: user.id },
    data: {
      needoId: OPERATOR_U_IDENTIFIER_REPAIR.publicId,
      primaryIdentityType: "U",
      sessionGeneration: { increment: 1 }
    }
  });
  await tx.auditLog.create({
    data: {
      actorId: actorUserId,
      action: "user.primary_identifier.needo_to_u",
      targetType: "user",
      targetId: user.id,
      metadata: {
        email: user.email,
        previousPublicId: OPERATOR_U_IDENTIFIER_REPAIR.previousPublicId,
        publicId: OPERATOR_U_IDENTIFIER_REPAIR.publicId,
        numberPart: OPERATOR_U_IDENTIFIER_REPAIR.numberPart
      }
    }
  });
  return {
    userId: user.id,
    previousPublicId: OPERATOR_U_IDENTIFIER_REPAIR.previousPublicId,
    publicId: OPERATOR_U_IDENTIFIER_REPAIR.publicId,
    repaired: true
  };
};

export const provisionLifeDanceEmptyAdmins = async (
  tx: Prisma.TransactionClient,
  input: { passwordHash: string; actorUserId: number }
): Promise<EmptyAdminProvisioningResult> => {
  const accounts = [] as EmptyAdminProvisioningResult["accounts"];
  for (const plan of LIFEDANCE_EMPTY_ADMIN_PLANS) {
    accounts.push(
      await provisionEmptyAdmin(tx, {
        plan,
        passwordHash: input.passwordHash,
        actorUserId: input.actorUserId
      })
    );
  }
  const operator = await repairOperatorIdentifier(tx, input.actorUserId);
  return { accounts, operator };
};
