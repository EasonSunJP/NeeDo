import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliateWithdrawalEligibilityRecord,
  AffiliateWithdrawalEligibilityRepositoryPort
} from "../services/affiliate-withdrawal-eligibility.service";

export class AffiliateWithdrawalEligibilityRepository implements AffiliateWithdrawalEligibilityRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findEligibility(
    userId: number,
    now: Date
  ): Promise<AffiliateWithdrawalEligibilityRecord | null> {
    const user = await this.client.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        identities: {
          where: { type: "scout", isActive: true, deletedAt: null },
          take: 1,
          select: { id: true }
        },
        ekycVerifications: {
          where: {
            status: "verified",
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
          },
          orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            status: true,
            nameMatchHash: true,
            verifiedAt: true,
            expiresAt: true
          }
        },
        protectedBankAccounts: {
          where: {
            purpose: "affiliate_withdrawal",
            verificationStatus: "verified",
            deletedAt: null
          },
          orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            verificationStatus: true,
            holderMatchHash: true,
            verifiedAt: true
          }
        }
      }
    });
    if (!user) {
      return null;
    }

    return {
      affiliateIdentityActive: user.identities.length > 0,
      eKyc: user.ekycVerifications[0] ?? null,
      bankAccount: user.protectedBankAccounts[0] ?? null
    };
  }
}
