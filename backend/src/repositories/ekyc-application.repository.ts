import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  ekycError,
  type EkycApplicationRepositoryPort,
  type EkycDecision,
  type EkycListQuery
} from "../services/ekyc-application.service";

const applicantInclude = {
  user: { select: { needoId: true } }
} satisfies Prisma.EkycApplicationInclude;

type EkycApplicationWithApplicant = Prisma.EkycApplicationGetPayload<{
  include: typeof applicantInclude;
}>;

const toApplicationRecord = ({ user, ...application }: EkycApplicationWithApplicant) => ({
  ...application,
  userPublicId: user.needoId
});

export class EkycApplicationRepository implements EkycApplicationRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}
  public async find(id: number) {
    const row = await this.client.ekycApplication.findFirst({
      where: { id, deletedAt: null },
      include: applicantInclude
    });
    return row ? toApplicationRecord(row) : null;
  }
  public async list(userId: number | undefined, query: EkycListQuery) {
    const where: Prisma.EkycApplicationWhereInput = {
      deletedAt: null,
      ...(userId === undefined ? {} : { userId }),
      ...(query.status ? { status: query.status } : {})
    };
    const [list, total] = await this.client.$transaction([
      this.client.ekycApplication.findMany({
        where,
        include: applicantInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size
      }),
      this.client.ekycApplication.count({ where })
    ]);
    return {
      list: list.map(toApplicationRecord),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }
  public async create(input: { userId: number; profileEncrypted: string; now: Date }) {
    return this.transaction(async (tx) => {
      // Serialize submissions with decisions for this applicant, including the no-active-row case.
      const locked = await tx.user.updateMany({
        where: { id: input.userId, deletedAt: null },
        data: { updatedAt: input.now }
      });
      if (locked.count !== 1) throw ekycError("not_found", 404);
      if (
        await tx.ekycApplication.findFirst({
          where: { userId: input.userId, status: "submitted", deletedAt: null }
        })
      )
        throw ekycError("active_application_exists");
      // A competing approval can commit while this submission waits for the user lock.
      const evaluatedAt = new Date();
      if (
        await tx.ekycVerification.findFirst({
          where: {
            userId: input.userId,
            status: "verified",
            deletedAt: null,
            verifiedAt: { lte: evaluatedAt },
            OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }]
          }
        })
      )
        throw ekycError("already_verified");
      const row = await tx.ekycApplication.create({
        data: {
          userId: input.userId,
          activeUserId: input.userId,
          profileEncrypted: input.profileEncrypted,
          status: "submitted",
          version: 1
        },
        include: applicantInclude
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "ekyc_application.submitted",
          targetType: "EkycApplication",
          targetId: row.id,
          metadata: { applicationId: row.id, userId: input.userId, status: "submitted" }
        }
      });
      return toApplicationRecord(row);
    });
  }
  public async decide(input: EkycDecision) {
    if (input.status !== "withdrawn" && input.actorId === input.userId)
      throw ekycError("self_review_forbidden", 403);
    if (input.status === "withdrawn" && input.actorId !== input.userId)
      throw ekycError("not_found", 404);
    if (input.status === "approved" && (!input.verification || !input.reviewNote?.trim()))
      throw ekycError("version_conflict");
    return this.transaction(async (tx) => {
      const locked = await tx.user.updateMany({
        where: { id: input.userId, deletedAt: null },
        data: { updatedAt: input.now }
      });
      if (locked.count !== 1) throw ekycError("not_found", 404);
      const changed = await tx.ekycApplication.updateMany({
        where: {
          id: input.id,
          userId: input.userId,
          version: input.expectedVersion,
          status: "submitted",
          deletedAt: null
        },
        data: {
          status: input.status,
          version: { increment: 1 },
          activeUserId: null,
          ...(input.status === "withdrawn"
            ? {}
            : { reviewerUserId: input.actorId, reviewedAt: input.now }),
          reviewNote: input.reviewNote ?? null,
          rejectionReason: input.rejectionReason ?? null
        }
      });
      if (changed.count !== 1) throw ekycError("version_conflict");
      if (input.status === "approved" && input.verification)
        await tx.ekycVerification.create({ data: input.verification });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: `ekyc_application.${input.status}`,
          targetType: "EkycApplication",
          targetId: input.id,
          metadata: {
            applicationId: input.id,
            userId: input.userId,
            fromStatus: "submitted",
            status: input.status,
            version: input.expectedVersion + 1
          }
        }
      });
      return tx.ekycApplication
        .findUniqueOrThrow({ where: { id: input.id }, include: applicantInclude })
        .then(toApplicationRecord);
    });
  }
  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.client.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code)
      )
        throw ekycError("version_conflict");
      throw error;
    }
  }
}
