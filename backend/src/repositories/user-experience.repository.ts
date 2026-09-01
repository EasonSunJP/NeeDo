import {
  PlatformMembershipTierCode,
  Prisma,
  UserExperienceEventType,
  type PrismaClient
} from "@prisma/client";
import type {
  UserExperienceAccountSnapshot,
  UserExperienceCalculatedEvent,
  UserExperienceEntrySnapshot,
  UserExperienceEventTypeValue,
  UserExperienceMutationResult,
  UserExperienceRepositoryPort
} from "../domain/user-experience";
import type { PlatformMembershipTierCodeValue } from "../domain/platform-membership";
import { resolveLevel } from "../domain/user-experience-levels";
import { prisma } from "../prisma/client";
import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginatedResponse,
  type PaginationInput
} from "../utils/pagination";

const eventTypeToDb: Readonly<
  Record<UserExperienceEventTypeValue, UserExperienceEventType>
> = {
  member_sign_in: UserExperienceEventType.MEMBER_SIGN_IN,
  service_completed: UserExperienceEventType.SERVICE_COMPLETED,
  social_post_liked: UserExperienceEventType.SOCIAL_POST_LIKED,
  ndp_consumed: UserExperienceEventType.NDP_CONSUMED,
  membership_renewed: UserExperienceEventType.MEMBERSHIP_RENEWED,
  adjustment: UserExperienceEventType.ADJUSTMENT,
  reversal: UserExperienceEventType.REVERSAL
};

const eventTypeFromDb: Readonly<
  Record<UserExperienceEventType, UserExperienceEventTypeValue>
> = {
  [UserExperienceEventType.MEMBER_SIGN_IN]: "member_sign_in",
  [UserExperienceEventType.SERVICE_COMPLETED]: "service_completed",
  [UserExperienceEventType.SOCIAL_POST_LIKED]: "social_post_liked",
  [UserExperienceEventType.NDP_CONSUMED]: "ndp_consumed",
  [UserExperienceEventType.MEMBERSHIP_RENEWED]: "membership_renewed",
  [UserExperienceEventType.ADJUSTMENT]: "adjustment",
  [UserExperienceEventType.REVERSAL]: "reversal"
};

const tierCodeToDb: Readonly<
  Record<PlatformMembershipTierCodeValue, PlatformMembershipTierCode>
> = {
  free: PlatformMembershipTierCode.FREE,
  silver: PlatformMembershipTierCode.SILVER,
  gold: PlatformMembershipTierCode.GOLD,
  black_diamond: PlatformMembershipTierCode.BLACK_DIAMOND
};

const tierCodeFromDb: Readonly<
  Record<PlatformMembershipTierCode, PlatformMembershipTierCodeValue>
> = {
  [PlatformMembershipTierCode.FREE]: "free",
  [PlatformMembershipTierCode.SILVER]: "silver",
  [PlatformMembershipTierCode.GOLD]: "gold",
  [PlatformMembershipTierCode.BLACK_DIAMOND]: "black_diamond"
};

const accountSelect = Prisma.validator<Prisma.UserExperienceAccountSelect>()({
  publicId: true,
  userId: true,
  totalExpUnits: true,
  currentLevel: true,
  lockVersion: true
});

const entrySelect = Prisma.validator<Prisma.UserExperienceEntrySelect>()({
  publicId: true,
  userId: true,
  eventType: true,
  sourceType: true,
  sourcePublicId: true,
  idempotencyKey: true,
  baseUnits: true,
  campaignFactorBps: true,
  membershipMultiplierBps: true,
  extraUnits: true,
  finalUnits: true,
  membershipTierCode: true,
  membershipTierVersionId: true,
  policyVersionId: true,
  campaignVersionId: true,
  occurredAt: true,
  reversalOfEntryId: true
});

type AccountRecord = Prisma.UserExperienceAccountGetPayload<{
  select: typeof accountSelect;
}>;
type EntryRecord = Prisma.UserExperienceEntryGetPayload<{ select: typeof entrySelect }>;

class UserExperienceOptimisticConflict extends Error {}

const mapAccount = (record: AccountRecord): UserExperienceAccountSnapshot => ({
  publicId: record.publicId,
  userId: record.userId,
  totalUnits: record.totalExpUnits,
  currentLevel: record.currentLevel,
  lockVersion: record.lockVersion
});

const mapEntry = (record: EntryRecord): UserExperienceEntrySnapshot => ({
  publicId: record.publicId,
  userId: record.userId,
  eventType: eventTypeFromDb[record.eventType],
  sourceType: record.sourceType,
  sourcePublicId: record.sourcePublicId,
  idempotencyKey: record.idempotencyKey,
  baseUnits: record.baseUnits,
  campaignFactorBps: record.campaignFactorBps,
  membershipMultiplierBps: record.membershipMultiplierBps,
  extraUnits: record.extraUnits,
  finalUnits: record.finalUnits,
  membershipTierCode: record.membershipTierCode
    ? tierCodeFromDb[record.membershipTierCode]
    : null,
  membershipTierVersionId: record.membershipTierVersionId,
  policyVersionId: record.policyVersionId,
  campaignVersionId: record.campaignVersionId,
  occurredAt: record.occurredAt,
  reversalOfEntryId: record.reversalOfEntryId
});

export class UserExperienceRepository implements UserExperienceRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findActiveAccount(
    userId: number
  ): Promise<UserExperienceAccountSnapshot | null> {
    const account = await this.client.userExperienceAccount.findFirst({
      where: {
        userId,
        deletedAt: null,
        user: { customerProfile: { is: { deletedAt: null } }, deletedAt: null }
      },
      select: accountSelect
    });
    return account ? mapAccount(account) : null;
  }

  public async listEntries(
    userId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<UserExperienceEntrySnapshot>> {
    const pagination = toPrismaPagination(input);
    const where = { userId, deletedAt: null } as const;
    const [records, total] = await Promise.all([
      this.client.userExperienceEntry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: entrySelect
      }),
      this.client.userExperienceEntry.count({ where })
    ]);
    return buildPaginatedResponse(records.map(mapEntry), total, pagination);
  }

  public async recordCalculatedEvent(
    event: UserExperienceCalculatedEvent,
    options: { transactionClient?: unknown } = {}
  ): Promise<UserExperienceMutationResult> {
    if (options.transactionClient) {
      return this.recordOnceWithClient(
        event,
        options.transactionClient as Prisma.TransactionClient
      );
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.recordOnce(event);
      } catch (error) {
        if (this.isUniqueConflict(error)) {
          const duplicate = await this.findDuplicate(event.idempotencyKey);
          if (duplicate) return duplicate;
        }
        if (error instanceof UserExperienceOptimisticConflict && attempt < 2) continue;
        throw error;
      }
    }
    throw new UserExperienceOptimisticConflict("experience account update conflicted");
  }

  private recordOnce(event: UserExperienceCalculatedEvent) {
    return this.client.$transaction((transaction) =>
      this.recordOnceWithClient(event, transaction)
    );
  }

  private async recordOnceWithClient(
    event: UserExperienceCalculatedEvent,
    transaction: Prisma.TransactionClient
  ): Promise<UserExperienceMutationResult> {
      const existing = await transaction.userExperienceEntry.findUnique({
        where: { idempotencyKey: event.idempotencyKey },
        select: entrySelect
      });
      if (existing) {
        const account = await transaction.userExperienceAccount.findFirst({
          where: { userId: event.userId, deletedAt: null },
          select: accountSelect
        });
        return account
          ? { status: "duplicate" as const, account: mapAccount(account), entry: mapEntry(existing) }
          : { status: "ineligible" as const, account: null };
      }

      const account = await transaction.userExperienceAccount.findFirst({
        where: {
          userId: event.userId,
          deletedAt: null,
          user: { customerProfile: { is: { deletedAt: null } }, deletedAt: null }
        },
        select: { id: true, ...accountSelect }
      });
      if (!account) return { status: "ineligible" as const, account: null };

      const entry = await transaction.userExperienceEntry.create({
        data: {
          accountId: account.id,
          userId: event.userId,
          eventType: eventTypeToDb[event.eventType],
          sourceType: event.sourceType,
          sourcePublicId: event.sourcePublicId,
          idempotencyKey: event.idempotencyKey,
          baseUnits: event.baseUnits,
          campaignFactorBps: event.campaignFactorBps,
          membershipMultiplierBps: event.membershipMultiplierBps,
          extraUnits: event.extraUnits,
          finalUnits: event.finalUnits,
          membershipTierCode: tierCodeToDb[event.membershipTierCode],
          membershipTierVersionId: event.membershipTierVersionId,
          policyVersionId: event.policyVersionId,
          campaignVersionId: event.campaignVersionId,
          occurredAt: event.occurredAt,
          reversalOfEntryId: event.reversalOfEntryId
        },
        select: entrySelect
      });
      const totalUnits = account.totalExpUnits + event.finalUnits;
      if (totalUnits < 0n) throw new RangeError("experience total cannot be negative");
      const updated = await transaction.userExperienceAccount.updateMany({
        where: { id: account.id, lockVersion: account.lockVersion, deletedAt: null },
        data: {
          totalExpUnits: totalUnits,
          currentLevel: resolveLevel(totalUnits),
          lockVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) throw new UserExperienceOptimisticConflict();
      return {
        status: "awarded" as const,
        account: {
          publicId: account.publicId,
          userId: account.userId,
          totalUnits,
          currentLevel: resolveLevel(totalUnits),
          lockVersion: account.lockVersion + 1
        },
        entry: mapEntry(entry)
      };
  }

  private async findDuplicate(
    idempotencyKey: string
  ): Promise<UserExperienceMutationResult | null> {
    const entry = await this.client.userExperienceEntry.findUnique({
      where: { idempotencyKey },
      select: entrySelect
    });
    if (!entry) return null;
    const account = await this.client.userExperienceAccount.findFirst({
      where: { userId: entry.userId, deletedAt: null },
      select: accountSelect
    });
    return account
      ? { status: "duplicate", account: mapAccount(account), entry: mapEntry(entry) }
      : { status: "ineligible", account: null };
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    );
  }
}
