import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import {
  assertExplicitAffiliateAllianceFoundationEnvFile,
  assertSafeAffiliateAllianceFoundationEnvironment
} from "./support/affiliate-alliance-foundation-safety";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const requireSafeEnvironment = (): { databaseName: string; envFile: string } => {
  const envFile = assertExplicitAffiliateAllianceFoundationEnvFile(
    process.env.ENV_FILE,
    existsSync
  );
  loadDotenv({ path: envFile, override: true });
  return assertSafeAffiliateAllianceFoundationEnvironment({
    envFile,
    envFileExists: existsSync(envFile),
    nodeEnv: process.env.NODE_ENV,
    deployEnv: process.env.DEPLOY_ENV,
    databaseUrl: process.env.DATABASE_URL
  });
};

const main = async (): Promise<void> => {
  const { databaseName, envFile } = requireSafeEnvironment();
  process.env.ENV_FILE = envFile;
  const [
    { AffiliateAllianceRepository },
    { AuditLogRepository },
    { AffiliateIdentityActivationRepository },
    { AffiliateAllianceService },
    { AuditLogService },
    { AffiliateIdentityActivationService },
    { NeedoContractCatalogService },
    { createFormalTestUser },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-alliance.repository"),
    import("../src/repositories/audit-log.repository"),
    import("../src/repositories/affiliate-identity-activation.repository"),
    import("../src/services/affiliate-alliance.service"),
    import("../src/services/audit-log.service"),
    import("../src/services/affiliate-identity-activation.service"),
    import("../src/services/needo-contract-catalog.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);

  const marker = `affiliate-alliance-foundation-${Date.now()}-${process.pid}`;
  const markerEmail = `${marker}@needo.test`;
  let userId: number | null = null;

  try {
    const passwordHash = await hash("AffiliateAllianceFoundation.2026!", 12);
    const user = await createFormalTestUser(prisma, {
      email: markerEmail,
      passwordHash,
      username: `${marker} owner`
    });
    userId = user.id;

    const customerIdentity = user.identities.find((identity) => identity.type === "customer");
    assert(customerIdentity, "marker account customer identity is missing");
    let nonActivatedFailure: unknown;
    try {
      await new AffiliateAllianceService(
        new AffiliateAllianceRepository(prisma),
        new AuditLogService(new AuditLogRepository(prisma))
      ).getMine({
        userId,
        email: user.email,
        accessTokenJti: marker,
        accessTokenExpiresAt: Date.now() + 60_000,
        currentIdentityId: customerIdentity.id,
        currentPublicId: user.needoId,
        currentIdentityType: "customer",
        currentIdentityScopeType: customerIdentity.scopeType,
        currentIdentityScopeId: customerIdentity.scopeId,
        roles: ["customer"],
        permissions: []
      });
    } catch (error) {
      nonActivatedFailure = error;
    }
    const nonActivatedError = nonActivatedFailure as {
      statusCode?: number;
      message?: string;
    };
    assert(
      nonActivatedError.statusCode === 403 &&
        nonActivatedError.message === "error.affiliate_alliance.identity_required",
      "non-activated account did not receive the stable 403"
    );

    const catalog = new NeedoContractCatalogService();
    const contract = await catalog.getCurrent("affiliate", "en");
    const activationService = new AffiliateIdentityActivationService(
      catalog,
      new AffiliateIdentityActivationRepository(prisma)
    );
    await activationService.activate({
      userId,
      contractVersion: contract.version,
      contentHash: contract.contentHash,
      language: contract.language,
      sessionId: marker,
      hasRead: true,
      hasAgreed: true,
      acceptedAt: new Date()
    });

    const affiliateIdentity = await prisma.userIdentity.findFirstOrThrow({
      where: { userId, type: "scout", isActive: true, deletedAt: null },
      select: { id: true, userId: true }
    });
    const affiliateProfile = await prisma.affiliateProfile.findUniqueOrThrow({
      where: { userId },
      select: { id: true, status: true }
    });
    assert(affiliateIdentity.userId === userId, "Affiliate identity did not retain the user id");
    assert(affiliateProfile.status === "ACTIVE", "Affiliate profile was not activated");

    const [ekycBefore, bankBefore] = await Promise.all([
      prisma.ekycVerification.count({ where: { userId } }),
      prisma.protectedBankAccount.count({ where: { ownerUserId: userId } })
    ]);
    assert(ekycBefore === 0 && bankBefore === 0, "marker account unexpectedly has eKYC or bank data");

    const actor = {
      userId,
      email: user.email,
      accessTokenJti: marker,
      accessTokenExpiresAt: Date.now() + 60_000,
      currentIdentityId: affiliateIdentity.id,
      currentPublicId: user.needoId,
      currentIdentityType: "scout",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null,
      roles: ["scout"],
      permissions: ["page:affiliate-alliance", "button:affiliate-alliance-create"]
    };
    const context = { ip: "127.0.0.1", userAgent: marker };
    const createService = () =>
      new AffiliateAllianceService(
        new AffiliateAllianceRepository(prisma),
        new AuditLogService(new AuditLogRepository(prisma))
      );
    const createInput = {
      name: `${marker} alliance`,
      description: "Formal local concurrency and persistence acceptance",
      defaultPromoterShareBps: 8_000
    };

    const concurrentResults = await Promise.allSettled([
      createService().createMine(actor, context, createInput),
      createService().createMine(actor, context, createInput)
    ]);
    const successes = concurrentResults.filter((result) => result.status === "fulfilled");
    const failures = concurrentResults.filter((result) => result.status === "rejected");
    assert(successes.length === 1, "exactly one concurrent alliance creation must succeed");
    assert(failures.length === 1, "exactly one concurrent alliance creation must conflict");
    const conflictReason = failures[0]?.reason as { statusCode?: number; message?: string };
    assert(
      conflictReason.statusCode === 409 &&
        conflictReason.message === "error.affiliate_alliance.already_joined",
      "the losing concurrent alliance creation did not return the stable conflict"
    );

    const created = successes[0]?.value.alliance;
    assert(created, "successful alliance creation returned no alliance");
    const [alliances, members, permissions, wallets, audits, ekycAfter, bankAfter] =
      await Promise.all([
        prisma.affiliateAlliance.findMany({ where: { ownerUserId: userId } }),
        prisma.affiliateAllianceMember.findMany({ where: { userId } }),
        prisma.affiliateAlliancePermission.findMany({
          where: { member: { userId } }
        }),
        prisma.wallet.findMany({
          where: { ownerType: "ALLIANCE", ownerId: created.allianceId, currency: "NDP" }
        }),
        prisma.auditLog.findMany({
          where: {
            actorId: userId,
            action: "affiliate_alliance.created",
            targetType: "AffiliateAlliance",
            targetId: created.allianceId
          }
        }),
        prisma.ekycVerification.count({ where: { userId } }),
        prisma.protectedBankAccount.count({ where: { ownerUserId: userId } })
      ]);

    assert(alliances.length === 1, "concurrent creation persisted multiple alliances");
    assert(
      members.length === 1 &&
        members[0]?.role === "OWNER" &&
        members[0]?.activeKey === `user:${userId}` &&
        members[0]?.parentMemberId === null,
      "owner membership contract was not persisted"
    );
    assert(
      permissions.length === 1 &&
        permissions[0]?.canClaimTasks &&
        permissions[0]?.canViewAllianceOverview &&
        permissions[0]?.canViewMemberDetails &&
        permissions[0]?.canManageOwnSubordinates &&
        permissions[0]?.canViewAllianceWallet,
      "owner permissions were not fully persisted"
    );
    assert(
      wallets.length === 1 &&
        wallets[0]?.ownerType === "ALLIANCE" &&
        wallets[0]?.availableBalance === 0 &&
        wallets[0]?.frozenBalance === 0,
      "separate zero-balance ALLIANCE wallet was not persisted"
    );
    assert(audits.length === 1, "alliance creation audit was missing or duplicated");
    assert(ekycAfter === 0 && bankAfter === 0, "eKYC or bank data was created");
    assert(created.owner.needoId === user.needoId, "alliance owner did not use canonical needoId");

    const freshService = createService();
    const reloaded = await freshService.getMine(actor);
    assert(
      reloaded.alliance?.allianceId === created.allianceId &&
        reloaded.alliance.membership.memberId === members[0]?.id &&
        reloaded.alliance.wallet.availableBalance === 0 &&
        reloaded.alliance.wallet.frozenBalance === 0,
      "fresh repository and service did not reload the persisted alliance"
    );

    console.log("PASS non-activated account was rejected before alliance repository access");
    console.log("PASS one concurrent create persisted one complete alliance foundation");
    console.log("PASS same needoId, no eKYC, no bank, zero alliance wallet, and audit verified");
    console.log("PASS fresh service reloaded the MySQL-backed alliance");
    console.log(
      JSON.stringify(
        {
          database: databaseName,
          marker,
          concurrency: { success: 1, conflict: 1 },
          identity: {
            nonActivatedRejected: true,
            canonicalNeedoId: true,
            ekycRequiredForCreation: false
          },
          foundation: {
            alliance: 1,
            ownerMembership: 1,
            ownerPermission: 1,
            allianceWallet: { availableBalance: 0, frozenBalance: 0 },
            audit: 1
          },
          persistence: "reloaded",
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    if (userId !== null) {
      const capturedUserId = userId;
      const [alliances, identities, customerProfiles, affiliateProfiles, userRoles, audits, notices, contracts] =
        await Promise.all([
          prisma.affiliateAlliance.findMany({
            where: { ownerUserId: capturedUserId },
            select: { id: true }
          }),
          prisma.userIdentity.findMany({
            where: { userId: capturedUserId },
            select: { id: true }
          }),
          prisma.customerProfile.findMany({
            where: { userId: capturedUserId },
            select: { id: true }
          }),
          prisma.affiliateProfile.findMany({
            where: { userId: capturedUserId },
            select: { id: true }
          }),
          prisma.userRole.findMany({
            where: { userId: capturedUserId },
            select: { id: true }
          }),
          prisma.auditLog.findMany({
            where: { actorId: capturedUserId },
            select: { id: true }
          }),
          prisma.notification.findMany({
            where: {
              OR: [{ recipientUserId: capturedUserId }, { actorUserId: capturedUserId }]
            },
            select: { id: true }
          }),
          prisma.contractAcceptance.findMany({
            where: { acceptedByUserId: capturedUserId },
            select: { id: true }
          })
        ]);
      const allianceIds = alliances.map(({ id }) => id);
      const identityIds = identities.map(({ id }) => id);
      const memberIds = (
        await prisma.affiliateAllianceMember.findMany({
          where: { allianceId: { in: allianceIds } },
          select: { id: true }
        })
      ).map(({ id }) => id);
      const permissionIds = (
        await prisma.affiliateAlliancePermission.findMany({
          where: { memberId: { in: memberIds } },
          select: { id: true }
        })
      ).map(({ id }) => id);
      const walletIds = (
        await prisma.wallet.findMany({
          where: { ownerType: "ALLIANCE", ownerId: { in: allianceIds } },
          select: { id: true }
        })
      ).map(({ id }) => id);
      const publicIdentifierIds = (
        await prisma.publicIdentifier.findMany({
          where: { userIdentityId: { in: identityIds } },
          select: { id: true }
        })
      ).map(({ id }) => id);

      await prisma.$transaction(async (transaction) => {
        await transaction.affiliateAlliancePermission.deleteMany({
          where: { id: { in: permissionIds } }
        });
        await transaction.wallet.deleteMany({ where: { id: { in: walletIds } } });
        await transaction.affiliateAllianceMember.deleteMany({ where: { id: { in: memberIds } } });
        await transaction.affiliateAlliance.deleteMany({ where: { id: { in: allianceIds } } });
        await transaction.auditLog.deleteMany({
          where: { id: { in: audits.map(({ id }) => id) } }
        });
        await transaction.notification.deleteMany({
          where: { id: { in: notices.map(({ id }) => id) } }
        });
        await transaction.contractAcceptance.deleteMany({
          where: { id: { in: contracts.map(({ id }) => id) } }
        });
        await transaction.publicIdentifier.deleteMany({
          where: { id: { in: publicIdentifierIds } }
        });
        await transaction.userRole.deleteMany({
          where: { id: { in: userRoles.map(({ id }) => id) } }
        });
        await transaction.affiliateProfile.deleteMany({
          where: { id: { in: affiliateProfiles.map(({ id }) => id) } }
        });
        await transaction.customerProfile.deleteMany({
          where: { id: { in: customerProfiles.map(({ id }) => id) } }
        });
        await transaction.userIdentity.deleteMany({ where: { id: { in: identityIds } } });
        await transaction.user.deleteMany({ where: { id: capturedUserId } });
      });
    }

    const cleanupCounts = await Promise.all([
      prisma.user.count({ where: { email: markerEmail } }),
      prisma.affiliateAlliance.count({ where: { name: { startsWith: marker } } }),
      prisma.auditLog.count({ where: { userAgent: marker } })
    ]);
    assert(
      cleanupCounts.every((count) => count === 0),
      "marker cleanup left affiliate alliance foundation rows behind"
    );
    console.log("PASS marker-owned alliance foundation rows were removed exactly");
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
