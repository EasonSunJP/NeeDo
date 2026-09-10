import { Prisma, type PrismaClient } from "@prisma/client";
import { IdentifierAllocator } from "../services/public-identifier.service";
import { PublicIdentifierRepository } from "./public-identifier.repository";

/** Targeted maintenance: restores an alias only for a previously approved, already active identity. */
export const repairApprovedApplicationIdentifier = async (
  client: PrismaClient,
  applicationId: number
) => {
  if (!Number.isSafeInteger(applicationId) || applicationId < 1)
    throw new Error("An explicit application ID is required");
  return client.$transaction(
    async (transaction) => {
      const application = await transaction.identityApplication.findFirst({
        where: {
          id: applicationId,
          status: "approved",
          deletedAt: null,
          type: { in: ["merchant", "technician"] }
        }
      });
      if (
        !application ||
        application.status !== "approved" ||
        !["merchant", "technician"].includes(application.type)
      )
        throw new Error("An approved merchant or technician application is required");
      const identityType = application.type === "merchant" ? "merchant_owner" : "technician";
      const kind = application.type === "merchant" ? "B" : "S";
      const identity = await transaction.userIdentity.findUnique({
        where: {
          activeKey: `identity-activation:${application.userId}:${identityType}:application:${application.id}`
        },
        include: { publicIdentifier: true }
      });
      if (
        !identity ||
        !identity.isActive ||
        identity.deletedAt ||
        identity.userId !== application.userId ||
        identity.type !== identityType ||
        identity.scopeId === null ||
        identity.scopeType !== (kind === "B" ? "shop" : "technician_profile")
      )
        throw new Error("Matching active approved identity is required");
      const role = await transaction.userRole.findFirst({
        where: {
          userId: application.userId,
          scopeType: identity.scopeType,
          scopeId: identity.scopeId,
          deletedAt: null,
          role: { code: identityType, deletedAt: null }
        },
        select: { id: true }
      });
      if (!role) throw new Error("Existing scoped activation role is required");
      if (identity.publicIdentifier) {
        if (identity.publicIdentifier.status !== "ACTIVE" || identity.publicIdentifier.deletedAt)
          throw new Error("Disabled or deleted identifiers require separate review");
        return {
          status: "verified" as const,
          applicationId,
          identityId: identity.id,
          publicId: identity.publicIdentifier.publicId
        };
      }
      const identifier = await new IdentifierAllocator(
        new PublicIdentifierRepository(transaction)
      ).registerPersonAlias({ kind, userIdentityId: identity.id });
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: "system.identity_activation.identifier_repaired",
          targetType: "UserIdentity",
          targetId: identity.id,
          metadata: {
            applicationId,
            userId: application.userId,
            identityId: identity.id,
            kind,
            publicIdentifierId: identifier.id
          }
        }
      });
      return {
        status: "repaired" as const,
        applicationId,
        identityId: identity.id,
        publicId: identifier.publicId
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
};
