import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";

const ACTIVE_KEY = "active";
const DAY_SECONDS = 86_400;
const DEFAULT_MESSAGE_RETENTION_SECONDS = 30 * DAY_SECONDS;

const imPolicySelect = Prisma.validator<Prisma.ImPolicySelect>()({
  id: true,
  version: true,
  textRetentionSeconds: true,
  imageRetentionSeconds: true,
  videoRetentionSeconds: true,
  recallWindowSeconds: true,
  tracelessRecallMembershipLevels: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true
});

type StoredImPolicy = Prisma.ImPolicyGetPayload<{ select: typeof imPolicySelect }>;

export interface ImPolicyRecord {
  id: number;
  version: number;
  messageDays: number;
  mediaDays: number;
  textRetentionSeconds: number;
  imageRetentionSeconds: number;
  videoRetentionSeconds: number;
  recallWindowSeconds: number;
  tracelessRecallMembershipLevels: unknown;
  updatedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ImPolicyMutationResult =
  | { kind: "updated"; value: ImPolicyRecord }
  | { kind: "version_conflict" };

export interface ReplaceImPolicyInput {
  expectedVersion: number;
  actorUserId: number;
  messageRetentionSeconds: number;
  mediaRetentionSeconds: number;
  audit: AuditLogCreateInput;
}

export interface ImPolicyRepositoryPort {
  getActive(): Promise<ImPolicyRecord | null>;
  replaceWithAudit(input: ReplaceImPolicyInput): Promise<ImPolicyMutationResult>;
}

class ImPolicyConflict extends Error {}

export class ImPolicyRepository implements ImPolicyRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async getActive(): Promise<ImPolicyRecord | null> {
    const row = await this.client.imPolicy.findFirst({
      where: { activeKey: ACTIVE_KEY, deletedAt: null },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: imPolicySelect
    });
    return row ? this.map(row) : null;
  }

  public async replaceWithAudit(input: ReplaceImPolicyInput): Promise<ImPolicyMutationResult> {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.replace(transaction, input), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        })
      );
    } catch (error) {
      if (
        error instanceof ImPolicyConflict ||
        isRetryableTransactionConflict(error) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  private async replace(
    transaction: Prisma.TransactionClient,
    input: ReplaceImPolicyInput
  ): Promise<ImPolicyMutationResult> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM im_policies WHERE active_key = ${ACTIVE_KEY} AND deleted_at IS NULL FOR UPDATE`
    );
    const current = await transaction.imPolicy.findFirst({
      where: { activeKey: ACTIVE_KEY, deletedAt: null },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: imPolicySelect
    });
    if (!current || current.version !== input.expectedVersion) {
      return { kind: "version_conflict" };
    }

    const closed = await transaction.imPolicy.updateMany({
      where: {
        id: current.id,
        version: input.expectedVersion,
        activeKey: ACTIVE_KEY,
        deletedAt: null
      },
      data: { activeKey: null }
    });
    if (closed.count !== 1) throw new ImPolicyConflict();

    const created = await transaction.imPolicy.create({
      data: {
        activeKey: ACTIVE_KEY,
        version: current.version + 1,
        textRetentionSeconds: input.messageRetentionSeconds,
        imageRetentionSeconds: input.mediaRetentionSeconds,
        videoRetentionSeconds: input.mediaRetentionSeconds,
        recallWindowSeconds: current.recallWindowSeconds,
        tracelessRecallMembershipLevels: current.tracelessRecallMembershipLevels as Prisma.InputJsonValue,
        updatedByUserId: input.actorUserId
      },
      select: imPolicySelect
    });
    const metadata =
      input.audit.metadata && typeof input.audit.metadata === "object" ? input.audit.metadata : {};
    await transaction.auditLog.create({
      data: toAuditLogCreateData({
        ...input.audit,
        targetId: created.id,
        metadata: {
          ...metadata,
          previousVersion: current.version,
          nextVersion: created.version
        }
      })
    });
    return { kind: "updated", value: this.map(created) };
  }

  private map(row: StoredImPolicy): ImPolicyRecord {
    const textRetentionSeconds = row.textRetentionSeconds ?? DEFAULT_MESSAGE_RETENTION_SECONDS;
    const mediaRetentionSeconds = Math.max(
      row.imageRetentionSeconds,
      row.videoRetentionSeconds
    );
    return {
      ...row,
      textRetentionSeconds,
      messageDays: Math.ceil(textRetentionSeconds / DAY_SECONDS),
      mediaDays: Math.ceil(mediaRetentionSeconds / DAY_SECONDS)
    };
  }
}
