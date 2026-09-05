import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  UserPolicyAccountFacts,
  UserPolicyEnforcementRepositoryPort
} from "../domain/user-policy-enforcement";
import { prisma } from "../prisma/client";

export class UserPolicyEnforcementRepository implements UserPolicyEnforcementRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findAccountFactsAt(
    userId: number,
    occurredAt: Date
  ): Promise<UserPolicyAccountFacts | null> {
    const user = await this.client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        phone: true,
        emailVerifiedAt: true,
        ekycVerifications: {
          where: {
            status: "verified",
            verifiedAt: { not: null, lte: occurredAt },
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: occurredAt } }]
          },
          orderBy: [{ verifiedAt: Prisma.SortOrder.desc }, { id: Prisma.SortOrder.desc }],
          take: 1,
          select: { id: true }
        }
      }
    });
    if (!user) return null;
    return {
      phoneBound: Boolean(user.phone?.trim()),
      emailVerified: user.emailVerifiedAt !== null,
      ekycVerified: user.ekycVerifications.length > 0
    };
  }
}
