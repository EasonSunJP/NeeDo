import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import {
  assertCapturedAffiliateAllianceInvitationCleanupIds,
  assertExplicitAffiliateAllianceInvitationEnvFile,
  assertSafeAffiliateAllianceInvitationEnvironment
} from "./support/affiliate-alliance-invitation-safety";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const requireSafeEnvironment = () => {
  const envFile = assertExplicitAffiliateAllianceInvitationEnvFile(process.env.ENV_FILE, existsSync);
  loadDotenv({ path: envFile, override: true });
  return assertSafeAffiliateAllianceInvitationEnvironment({
    envFile,
    envFileExists: existsSync(envFile),
    nodeEnv: process.env.NODE_ENV,
    deployEnv: process.env.DEPLOY_ENV,
    databaseUrl: process.env.DATABASE_URL
  });
};

const main = async (): Promise<void> => {
  const target = requireSafeEnvironment();
  process.env.ENV_FILE = target.envFile;
  console.log(JSON.stringify({ databaseTarget: target.maskedDatabaseTarget, safety: "local-only" }));

  const [
    { AffiliateAllianceRepository },
    { AuditLogRepository },
    { AffiliateIdentityActivationRepository },
    { AffiliateAllianceService },
    { AuditLogService },
    { AffiliateIdentityActivationService },
    { NeedoContractCatalogService },
    { createFormalTestUser, deleteFormalTestUserFoundations },
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

  const marker = `affiliate-alliance-invitation-${Date.now()}-${process.pid}`;
  const context = { ip: "127.0.0.1", userAgent: marker };
  const captured = {
    userIds: [] as number[],
    allianceIds: [] as number[],
    invitationIds: [] as number[],
    walletIds: [] as number[],
    ledgerTransactionIds: [] as number[]
  };
  const passwordHash = await hash("AffiliateAllianceInvitation.2026!", 12);
  const roleNames = [
    "owner-one",
    "owner-two",
    "partner",
    "subordinate",
    "expiry",
    "race",
    "one-way",
    "blocked",
    "non-affiliate"
  ] as const;
  type RoleName = (typeof roleNames)[number];
  const users = new Map<RoleName, Awaited<ReturnType<typeof createFormalTestUser>>>();

  const createService = (now: Date) =>
    new AffiliateAllianceService(
      new AffiliateAllianceRepository(prisma),
      new AuditLogService(new AuditLogRepository(prisma)),
      () => now
    );
  const baseNow = new Date();
  const expiresAtBoundary = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

  try {
    for (const roleName of roleNames) {
      const user = await createFormalTestUser(prisma, {
        email: `${marker}-${roleName}@needo.test`,
        passwordHash,
        username: `${marker} ${roleName}`
      });
      users.set(roleName, user);
      captured.userIds.push(user.id);
    }

    const catalog = new NeedoContractCatalogService();
    const contract = await catalog.getCurrent("affiliate", "en");
    const activationService = new AffiliateIdentityActivationService(
      catalog,
      new AffiliateIdentityActivationRepository(prisma)
    );
    for (const roleName of roleNames.filter((name) => name !== "non-affiliate")) {
      const user = users.get(roleName);
      assert(user, `missing ${roleName} user`);
      await activationService.activate({
        userId: user.id,
        contractVersion: contract.version,
        contentHash: contract.contentHash,
        language: contract.language,
        sessionId: `${marker}-${roleName}`,
        hasRead: true,
        hasAgreed: true,
        acceptedAt: baseNow
      });
    }

    const affiliateIdentities = await prisma.userIdentity.findMany({
      where: { userId: { in: captured.userIds }, type: "scout", isActive: true, deletedAt: null },
      select: { id: true, userId: true }
    });
    const identityByUserId = new Map(affiliateIdentities.map((identity) => [identity.userId, identity]));
    const actorFor = (roleName: Exclude<RoleName, "non-affiliate">) => {
      const user = users.get(roleName);
      assert(user, `missing actor user ${roleName}`);
      const identity = identityByUserId.get(user.id);
      assert(identity, `missing Affiliate identity ${roleName}`);
      return {
        userId: user.id,
        email: user.email,
        accessTokenJti: `${marker}-${roleName}`,
        accessTokenExpiresAt: Date.now() + 60_000,
        currentIdentityId: identity.id,
        currentPublicId: user.needoId,
        currentIdentityType: "scout",
        currentIdentityScopeType: "global",
        currentIdentityScopeId: null,
        roles: ["scout"],
        permissions: []
      };
    };

    const ownerOne = actorFor("owner-one");
    const ownerTwo = actorFor("owner-two");
    const ownerOneAlliance = await createService(baseNow).createMine(ownerOne, context, {
      name: `${marker} owner one alliance`,
      description: "Invitation flow acceptance owner one",
      defaultPromoterShareBps: 8_000
    });
    const ownerTwoAlliance = await createService(baseNow).createMine(ownerTwo, context, {
      name: `${marker} owner two alliance`,
      description: "Invitation flow acceptance owner two",
      defaultPromoterShareBps: 8_000
    });
    captured.allianceIds.push(ownerOneAlliance.alliance.allianceId, ownerTwoAlliance.alliance.allianceId);

    const userId = (roleName: RoleName) => {
      const user = users.get(roleName);
      assert(user, `missing user ${roleName}`);
      return user.id;
    };
    const mutualWithOwnerOne: RoleName[] = [
      "owner-two",
      "partner",
      "subordinate",
      "expiry",
      "race",
      "blocked",
      "non-affiliate"
    ];
    const contacts = mutualWithOwnerOne.flatMap((roleName) => [
      { ownerUserId: ownerOne.userId, contactUserId: userId(roleName), source: marker },
      { ownerUserId: userId(roleName), contactUserId: ownerOne.userId, source: marker }
    ]);
    contacts.push({ ownerUserId: ownerOne.userId, contactUserId: userId("one-way"), source: marker });
    contacts.push(
      { ownerUserId: ownerTwo.userId, contactUserId: userId("race"), source: marker },
      { ownerUserId: userId("race"), contactUserId: ownerTwo.userId, source: marker }
    );
    await prisma.contact.createMany({ data: contacts });
    await prisma.contact.update({
      where: { ownerUserId_contactUserId: { ownerUserId: userId("blocked"), contactUserId: ownerOne.userId } },
      data: { blockedAt: baseNow }
    });

    const ownerService = createService(baseNow);
    const candidates = await ownerService.listEligibleContacts(ownerOne, { page: 1, pageSize: 100 });
    const candidateIds = new Set(candidates.list.map((person) => person.needoId));
    for (const included of ["partner", "subordinate", "expiry", "race"] as const) {
      assert(candidateIds.has(users.get(included)?.needoId ?? ""), `eligible ${included} was missing`);
    }
    for (const excluded of ["one-way", "blocked", "non-affiliate", "owner-two"] as const) {
      assert(!candidateIds.has(users.get(excluded)?.needoId ?? ""), `ineligible ${excluded} was included`);
    }
    console.log("PASS ineligible candidates were excluded");

    const createInvitation = async (
      service: InstanceType<typeof AffiliateAllianceService>,
      owner: ReturnType<typeof actorFor>,
      invitee: Exclude<RoleName, "non-affiliate">,
      role: "partner" | "subordinate",
      proposedParentMemberId: number | null
    ) => {
      const inviteeUser = users.get(invitee);
      assert(inviteeUser, `missing invitation user ${invitee}`);
      const created = await service.createInvitation(owner, context,
        role === "partner"
          ? { inviteeNeedoId: inviteeUser.needoId, role, proposedParentMemberId: null }
          : { inviteeNeedoId: inviteeUser.needoId, role, proposedParentMemberId: proposedParentMemberId as number }
      );
      captured.invitationIds.push(created.invitation.invitationId);
      return created.invitation;
    };

    const partnerInvitation = await createInvitation(ownerService, ownerOne, "partner", "partner", null);
    const subordinateInvitation = await createInvitation(
      ownerService,
      ownerOne,
      "subordinate",
      "subordinate",
      ownerOneAlliance.alliance.membership.memberId
    );
    assert(partnerInvitation.role === "partner" && subordinateInvitation.role === "subordinate",
      "partner and subordinate invitations were not persisted");
    console.log("PASS partner and subordinate invitations were persisted");

    let duplicateError: unknown;
    try {
      await ownerService.createInvitation(ownerOne, context, {
        inviteeNeedoId: users.get("subordinate")!.needoId,
        role: "subordinate",
        proposedParentMemberId: ownerOneAlliance.alliance.membership.memberId
      });
    } catch (error) {
      duplicateError = error;
    }
    assert(
      (duplicateError as { message?: string }).message === "error.affiliate_alliance.invitation_duplicate",
      "duplicate pending invitation was not rejected"
    );
    console.log("PASS duplicate pending invitation was rejected");

    await createService(baseNow).rejectInvitation(actorFor("subordinate"), context, subordinateInvitation.invitationId);
    assert(
      (await prisma.affiliateAllianceMember.count({ where: { userId: userId("subordinate"), activeKey: { not: null } } })) === 0,
      "rejection created a member"
    );
    console.log("PASS rejection created no member");

    const expiryInvitation = await createInvitation(ownerService, ownerOne, "expiry", "partner", null);
    const persistedExpiryTimes = await prisma.affiliateAllianceInvitation.findUniqueOrThrow({
      where: { id: expiryInvitation.invitationId },
      select: { createdAt: true, expiresAt: true }
    });
    assert(
      persistedExpiryTimes.expiresAt.getTime() - persistedExpiryTimes.createdAt.getTime() === 259_200_000,
      "persisted invitation creation and expiry were not exactly 72 hours apart"
    );
    let expiryError: unknown;
    try {
      await createService(expiresAtBoundary).acceptInvitation(actorFor("expiry"), context, expiryInvitation.invitationId);
    } catch (error) {
      expiryError = error;
    }
    const expiredRow = await prisma.affiliateAllianceInvitation.findUniqueOrThrow({
      where: { id: expiryInvitation.invitationId }
    });
    assert(
      (expiryError as { message?: string }).message === "error.affiliate_alliance.invitation_expired" &&
        expiredRow.status === "EXPIRED" && expiredRow.expiredAt !== null,
      "72-hour boundary expired before acceptance was not enforced"
    );
    console.log("PASS 72-hour boundary expired before acceptance");

    const accepted = await createService(baseNow).acceptInvitation(actorFor("partner"), context, partnerInvitation.invitationId);
    const acceptedPermission = await prisma.affiliateAlliancePermission.findUniqueOrThrow({
      where: { memberId: accepted.member.memberId }
    });
    const acceptedAuditCount = await prisma.auditLog.count({
      where: {
        action: "affiliate_alliance.invitation_accepted",
        targetType: "AffiliateAllianceInvitation",
        targetId: partnerInvitation.invitationId,
        userAgent: marker
      }
    });
    assert(
      !acceptedPermission.canClaimTasks &&
        !acceptedPermission.canViewAllianceOverview &&
        !acceptedPermission.canViewMemberDetails &&
        !acceptedPermission.canManageOwnSubordinates &&
        !acceptedPermission.canViewAllianceWallet &&
        acceptedAuditCount === 1,
      "least-privilege member and audit were not persisted"
    );
    console.log("PASS least-privilege member and audit were persisted");

    const raceOne = await createInvitation(ownerService, ownerOne, "race", "partner", null);
    const raceTwo = await createInvitation(createService(baseNow), ownerTwo, "race", "partner", null);
    const raceActor = actorFor("race");
    const concurrentResults = await Promise.allSettled([
      createService(baseNow).acceptInvitation(raceActor, context, raceOne.invitationId),
      createService(baseNow).acceptInvitation(raceActor, context, raceTwo.invitationId)
    ]);
    const fulfilledResults = concurrentResults.filter(
      (result) => result.status === "fulfilled"
    );
    const rejectedResults = concurrentResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    const rejectedReason = rejectedResults[0]?.reason as {
      message?: string;
      statusCode?: number;
    } | undefined;
    assert(
      fulfilledResults.length === 1 &&
        rejectedResults.length === 1 &&
        rejectedReason?.message === "error.affiliate_alliance.already_joined" &&
        rejectedReason.statusCode === 409 &&
        (await prisma.affiliateAllianceMember.count({
          where: { userId: raceActor.userId, activeKey: `user:${raceActor.userId}`, leftAt: null, deletedAt: null }
        })) === 1,
      "concurrent cross-alliance acceptance did not return one stable already-joined conflict"
    );
    console.log("PASS concurrent cross-alliance acceptance created one membership with a stable conflict");

    const freshService = createService(new Date());
    const freshPartner = await freshService.getMine(actorFor("partner"));
    const freshExpiryInvitations = await freshService.listReceivedInvitations(actorFor("expiry"), {
      page: 1,
      pageSize: 20,
      status: "expired"
    });
    assert(
      freshPartner.alliance?.allianceId === ownerOneAlliance.alliance.allianceId &&
        freshExpiryInvitations.list.some((invitation) => invitation.invitationId === expiryInvitation.invitationId),
      "fresh repository reloaded durable invitation state failed"
    );
    console.log("PASS fresh repository reloaded durable invitation state");

    console.log(JSON.stringify({
      assertions: 9,
      databaseTarget: target.maskedDatabaseTarget,
      invitations: captured.invitationIds.length,
      status: "ok"
    }, null, 2));
  } finally {
    if (captured.userIds.length > 0) {
      assertCapturedAffiliateAllianceInvitationCleanupIds(captured);

      const mergeCapturedIds = (target: number[], ids: number[]) => {
        target.splice(0, target.length, ...new Set([...target, ...ids]));
      };
      mergeCapturedIds(
        captured.allianceIds,
        (await prisma.affiliateAlliance.findMany({
          where: { ownerUserId: { in: captured.userIds } },
          select: { id: true }
        })).map((row) => row.id)
      );
      mergeCapturedIds(
        captured.invitationIds,
        (await prisma.affiliateAllianceInvitation.findMany({
          where: {
            OR: [
              { allianceId: { in: captured.allianceIds } },
              { inviteeUserId: { in: captured.userIds } },
              { inviterMember: { userId: { in: captured.userIds } } }
            ]
          },
          select: { id: true }
        })).map((row) => row.id)
      );

      const memberIds = (await prisma.affiliateAllianceMember.findMany({
        where: {
          OR: [
            { allianceId: { in: captured.allianceIds } },
            { userId: { in: captured.userIds } }
          ]
        },
        select: { id: true }
      })).map((row) => row.id);
      const identityIds = (await prisma.userIdentity.findMany({
        where: { userId: { in: captured.userIds } }, select: { id: true }
      })).map((row) => row.id);
      const walletIds = (await prisma.wallet.findMany({
        where: { ownerType: "ALLIANCE", ownerId: { in: captured.allianceIds } }, select: { id: true }
      })).map((row) => row.id);
      const ledgerTransactionIds = (await prisma.walletLedger.findMany({
        where: { walletId: { in: walletIds } }, select: { transactionId: true }
      })).map((row) => row.transactionId);
      mergeCapturedIds(captured.walletIds, walletIds);
      mergeCapturedIds(captured.ledgerTransactionIds, ledgerTransactionIds);

      await prisma.$transaction(async (transaction) => {
        await transaction.walletLedger.deleteMany({ where: { walletId: { in: walletIds } } });
        await transaction.ledgerTransaction.deleteMany({ where: { id: { in: ledgerTransactionIds } } });
        await transaction.affiliateAlliancePermission.deleteMany({ where: { memberId: { in: memberIds } } });
        await transaction.affiliateAllianceInvitation.deleteMany({ where: { id: { in: captured.invitationIds } } });
        await transaction.affiliateAllianceMember.deleteMany({ where: { id: { in: memberIds } } });
        await transaction.wallet.deleteMany({ where: { id: { in: walletIds } } });
        await transaction.affiliateAlliance.deleteMany({ where: { id: { in: captured.allianceIds } } });
        await transaction.contact.deleteMany({
          where: { OR: [{ ownerUserId: { in: captured.userIds } }, { contactUserId: { in: captured.userIds } }] }
        });
        await transaction.notification.deleteMany({
          where: { OR: [{ recipientUserId: { in: captured.userIds } }, { actorUserId: { in: captured.userIds } }] }
        });
        await transaction.auditLog.deleteMany({
          where: { OR: [{ actorId: { in: captured.userIds } }, { userAgent: marker }] }
        });
        await transaction.contractAcceptance.deleteMany({ where: { acceptedByUserId: { in: captured.userIds } } });
        await transaction.affiliateProfileChannel.deleteMany({
          where: { profile: { userId: { in: captured.userIds } } }
        });
        await transaction.affiliateProfile.deleteMany({ where: { userId: { in: captured.userIds } } });
        await transaction.publicIdentifier.deleteMany({ where: { userIdentityId: { in: identityIds } } });
        await deleteFormalTestUserFoundations(transaction, captured.userIds);
        await transaction.user.deleteMany({ where: { id: { in: captured.userIds } } });
      });
    }

    const cleanupCounts = await Promise.all([
      prisma.user.count({ where: { email: { startsWith: marker } } }),
      prisma.contact.count({ where: { source: marker } }),
      prisma.affiliateAlliance.count({ where: { name: { startsWith: marker } } }),
      prisma.affiliateAllianceMember.count({ where: { userId: { in: captured.userIds } } }),
      prisma.affiliateAlliancePermission.count({ where: { member: { userId: { in: captured.userIds } } } }),
      prisma.affiliateAllianceInvitation.count({
        where: {
          OR: [
            { id: { in: captured.invitationIds } },
            { alliance: { ownerUserId: { in: captured.userIds } } },
            { inviteeUserId: { in: captured.userIds } },
            { inviterMember: { userId: { in: captured.userIds } } }
          ]
        }
      }),
      prisma.wallet.count({ where: { ownerType: "ALLIANCE", ownerId: { in: captured.allianceIds } } }),
      prisma.walletLedger.count({ where: { walletId: { in: captured.walletIds } } }),
      prisma.ledgerTransaction.count({ where: { id: { in: captured.ledgerTransactionIds } } }),
      prisma.auditLog.count({ where: { userAgent: marker } })
    ]);
    assert(cleanupCounts.every((count) => count === 0),
      "marker cleanup left affiliate alliance invitation rows behind");
    console.log("PASS marker cleanup left no affiliate alliance invitation rows behind");
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
