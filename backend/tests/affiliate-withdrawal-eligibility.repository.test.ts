import type { PrismaClient } from "@prisma/client";
import { AffiliateWithdrawalEligibilityRepository } from "../src/repositories/affiliate-withdrawal-eligibility.repository";

const now = new Date("2026-08-26T05:00:00.000Z");

describe("AffiliateWithdrawalEligibilityRepository", () => {
  it("loads only an active affiliate identity, usable eKYC, and verified personal withdrawal bank", async () => {
    const user = {
      findFirst: jest.fn().mockResolvedValue({
        identities: [{ id: 31 }],
        ekycVerifications: [
          {
            id: 11,
            status: "verified",
            nameMatchHash: "a".repeat(64),
            verifiedAt: new Date("2026-08-25T05:00:00.000Z"),
            expiresAt: null
          }
        ],
        protectedBankAccounts: [
          {
            id: 21,
            verificationStatus: "verified",
            holderMatchHash: "a".repeat(64),
            verifiedAt: new Date("2026-08-25T06:00:00.000Z")
          }
        ]
      })
    };
    const repository = new AffiliateWithdrawalEligibilityRepository({ user } as unknown as PrismaClient);

    await expect(repository.findEligibility(7, now)).resolves.toEqual({
      affiliateIdentityActive: true,
      eKyc: {
        id: 11,
        status: "verified",
        nameMatchHash: "a".repeat(64),
        verifiedAt: new Date("2026-08-25T05:00:00.000Z"),
        expiresAt: null
      },
      bankAccount: {
        id: 21,
        verificationStatus: "verified",
        holderMatchHash: "a".repeat(64),
        verifiedAt: new Date("2026-08-25T06:00:00.000Z")
      }
    });
    expect(user.findFirst).toHaveBeenCalledWith({
      where: { id: 7, isActive: true, deletedAt: null },
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
  });
});
