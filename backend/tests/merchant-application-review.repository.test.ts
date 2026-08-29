import type { PrismaClient } from "@prisma/client";
import { MerchantApplicationReviewRepository } from "../src/repositories/merchant-application-review.repository";
import { BankAccountHolderService } from "../src/services/bank-account-holder.service";
import { SensitiveFieldCipherService } from "../src/services/sensitive-field-cipher.service";

const key = "merchant-review-test-key-at-least-32-characters";
const cipher = new SensitiveFieldCipherService(key);
const holder = new BankAccountHolderService();
const reviewedAt = new Date("2026-08-16T15:00:00.000Z");

describe("MerchantApplicationReviewRepository", () => {
  it("returns masked bank fields, match evidence, and gates sensitive documents", async () => {
    const normalized = holder.normalizeForMatch("corporate", "カブシキガイシャニード");
    const identityApplication = {
      findFirst: jest.fn().mockResolvedValue({
        id: 41,
        userId: 7,
        status: "submitted",
        version: 3,
        submittedSnapshotHash: "a".repeat(64),
        submittedAt: reviewedAt,
        createdAt: reviewedAt,
        merchantDetail: {
          applicantKind: "corporate",
          corporateLegalName: "株式会社ニード",
          corporateLegalNameKana: "カブシキガイシャニード",
          representativeName: "山本太郎",
          representativeNameKana: "ヤマモトタロウ",
          shopName: "NeeDo 银座店",
          businessAddress: "東京都中央区銀座3-4-12",
          contactPhone: "03-1234-5678",
          responsiblePersonName: "山本太郎",
          showcaseDraft: { city: "東京都中央区" },
          bankAccount: {
            id: 81,
            bankCode: "0001",
            bankName: "みずほ銀行",
            branchCode: "001",
            branchName: "銀座支店",
            accountType: "ordinary",
            accountNumberEncrypted: cipher.seal("1234567"),
            accountHolderEncrypted: cipher.seal("カ）ニード"),
            holderMatchHash: cipher.matchHash(normalized),
            verificationSource: "corporate_registration",
            verificationStatus: "verified",
            verifiedAt: reviewedAt,
            deletedAt: null
          },
          contractAcceptance: {
            id: 91,
            contractType: "merchant",
            contractVersion: "merchant-ja-2026-08",
            contentHash: "b".repeat(64),
            acceptedAt: reviewedAt,
            language: "ja",
            receiptId: "receipt-91",
            deletedAt: null
          }
        },
        applicant: { ekycVerifications: [] },
        media: [
          {
            purpose: "corporate_registration",
            mediaAsset: { id: 101, url: "/media/101", mimeType: "image/png" }
          }
        ]
      })
    };
    const repository = new MerchantApplicationReviewRepository(
      { identityApplication } as unknown as PrismaClient,
      cipher,
      () => reviewedAt
    );

    await expect(repository.findById(41, true)).resolves.toMatchObject({
      applicationId: 41,
      bankAccount: {
        accountNumberMasked: "•••4567",
        accountHolderMasked: "カ•••ド",
        holderMatched: true
      },
      media: [
        {
          id: 101,
          purpose: "corporate_registration",
          url: "/api/v1/identity-applications/41/media/101"
        }
      ]
    });
    expect(identityApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 41, type: "merchant", deletedAt: null } })
    );
  });

  it("creates merchant, shop, membership, identity, billing periods, notification, and audits atomically", async () => {
    const tx = {
      identityApplication: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      protectedBankAccount: { findFirst: jest.fn().mockResolvedValue({ id: 81 }) },
      contractAcceptance: { findFirst: jest.fn().mockResolvedValue({ id: 91 }) },
      merchantAccount: { create: jest.fn().mockResolvedValue({ id: 51 }) },
      shop: { create: jest.fn().mockResolvedValue({ id: 61 }) },
      merchantShopMembership: { create: jest.fn().mockResolvedValue({ id: 71 }) },
      saasBillingProfile: { create: jest.fn().mockResolvedValue({ id: 81 }) },
      saasFreePeriod: { create: jest.fn().mockResolvedValue({ id: 82 }) },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 6, code: "merchant_owner" }) },
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue({ id: 109 }),
        create: jest.fn().mockResolvedValue({
          id: 91,
          userId: 7,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 61
        })
      },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 101 })
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 111 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 121 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new MerchantApplicationReviewRepository(client, cipher, () => reviewedAt);

    await expect(
      repository.approveInTransaction({
        applicationId: 41,
        applicantUserId: 7,
        reviewerUserId: 9,
        expectedVersion: 3,
        displayName: "山本太郎",
        merchantAccountName: "株式会社ニード",
        shopName: "NeeDo 银座店",
        businessAddress: "東京都中央区銀座3-4-12",
        contactPhone: "03-1234-5678",
        showcaseDraft: { city: "東京都中央区", description: "リラクゼーション" },
        bankAccountId: 81,
        contractAcceptanceId: 91,
        reviewedAt,
        purgeAt: new Date("2026-09-15T15:00:00.000Z"),
        trialStartsAt: reviewedAt,
        trialEndsAt: new Date("2026-10-31T15:00:00.000Z"),
        automaticBonusDays: 0,
        freePeriods: [
          {
            periodType: "initial_trial",
            startsAt: reviewedAt,
            endsAt: new Date("2026-10-31T15:00:00.000Z")
          }
        ]
      })
    ).resolves.toMatchObject({
      status: "approved",
      merchantAccountId: 51,
      shopId: 61,
      identityId: 91,
      billingProfileId: 81
    });

    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: 41,
        userId: 7,
        version: 3,
        status: { in: ["submitted", "under_review"] },
        deletedAt: null,
        merchantDetail: { bankAccountId: 81, contractAcceptanceId: 91 }
      },
      data: {
        status: "approved",
        activeKey: null,
        version: { increment: 1 },
        reviewedAt,
        reviewerUserId: 9,
        rejectionReason: null,
        closedAt: reviewedAt,
        purgeAt: new Date("2026-09-15T15:00:00.000Z")
      }
    });
    expect(tx.merchantAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: "NEEDO-APP-41",
        ownerUserId: 7,
        name: "株式会社ニード",
        status: "active",
        settlementBankAccountId: 81
      })
    });
    expect(tx.shop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerUserId: 7, name: "NeeDo 银座店", status: "published" })
    });
    expect(tx.saasBillingProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subjectType: "merchant_account",
        merchantAccountId: 51,
        trialStatus: "active",
        trialEndsAt: new Date("2026-10-31T15:00:00.000Z")
      })
    });
    expect(tx.saasFreePeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingProfileId: 81,
        periodType: "initial_trial",
        idempotencyKey: "merchant-application:41:initial_trial"
      })
    });
    expect(tx.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeKey: "identity-activation:7:merchant_owner:application:41",
        scopeId: 61
      })
    });
    const merchantAudit = tx.auditLog.create.mock.calls.find(
      ([call]) => call.data.action === "identity_application.merchant.approved"
    )?.[0];
    expect(merchantAudit).toEqual({
      data: expect.objectContaining({
        actorId: 9,
        targetId: 41,
        ip: null,
        metadata: expect.not.objectContaining({
          accountNumber: expect.anything(),
          accountHolderName: expect.anything()
        })
      })
    });
  });

  it("rejects optimistically, notifies the applicant, and leaves no activated records", async () => {
    const tx = {
      identityApplication: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      userIdentity: { findFirst: jest.fn().mockResolvedValue({ id: 107 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 111 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 121 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new MerchantApplicationReviewRepository(client, cipher, () => reviewedAt);

    await repository.rejectInTransaction({
      applicationId: 41,
      applicantUserId: 7,
      reviewerUserId: 9,
      expectedVersion: 3,
      rejectionReason: "法人登记文件无法确认",
      reviewedAt,
      purgeAt: new Date("2026-09-15T15:00:00.000Z")
    });

    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected", activeKey: null })
      })
    );
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 7,
        recipientIdentityId: 107,
        actorIdentityId: 107,
        type: "SYSTEM",
        payload: { applicationId: 41, rejectionReason: "法人登记文件无法确认" }
      })
    });
  });
});
