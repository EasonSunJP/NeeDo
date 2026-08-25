import {
  AffiliateWithdrawalEligibilityService,
  type AffiliateWithdrawalEligibilityRepositoryPort
} from "../src/services/affiliate-withdrawal-eligibility.service";

const matchedHash = "a".repeat(64);
const now = new Date("2026-08-26T05:00:00.000Z");

const createRepository = (): jest.Mocked<AffiliateWithdrawalEligibilityRepositoryPort> => ({
  findEligibility: jest.fn(async (userId, requestedAt) => {
    void userId;
    void requestedAt;
    return {
      affiliateIdentityActive: true,
      eKyc: {
        id: 11,
        status: "verified",
        nameMatchHash: matchedHash,
        verifiedAt: new Date("2026-08-25T05:00:00.000Z"),
        expiresAt: null
      },
      bankAccount: {
        id: 21,
        verificationStatus: "verified",
        holderMatchHash: matchedHash,
        verifiedAt: new Date("2026-08-25T06:00:00.000Z")
      }
    };
  })
});

describe("AffiliateWithdrawalEligibilityService", () => {
  it("does not participate in affiliate earnings accrual", () => {
    const repository = createRepository();
    new AffiliateWithdrawalEligibilityService(repository);
    expect(repository.findEligibility).not.toHaveBeenCalled();
  });

  it("blocks withdrawal without a usable eKYC verification", async () => {
    const repository = createRepository();
    repository.findEligibility.mockResolvedValue({
      affiliateIdentityActive: true,
      eKyc: null,
      bankAccount: null
    });
    await expect(
      new AffiliateWithdrawalEligibilityService(repository).assertEligible(7, now)
    ).rejects.toMatchObject({
      message: "error.affiliate_withdrawal.ekyc_required",
      statusCode: 409
    });
  });

  it("blocks withdrawal without a verified personal bank account", async () => {
    const repository = createRepository();
    const eligible = await repository.findEligibility(7, now);
    repository.findEligibility.mockResolvedValue({ ...eligible!, bankAccount: null });
    await expect(
      new AffiliateWithdrawalEligibilityService(repository).assertEligible(7, now)
    ).rejects.toMatchObject({
      message: "error.affiliate_withdrawal.bank_account_required",
      statusCode: 409
    });
  });

  it("blocks a normalized holder-name mismatch without a bypass", async () => {
    const repository = createRepository();
    const eligible = await repository.findEligibility(7, now);
    repository.findEligibility.mockResolvedValue({
      ...eligible!,
      bankAccount: { ...eligible!.bankAccount!, holderMatchHash: "b".repeat(64) }
    });
    await expect(
      new AffiliateWithdrawalEligibilityService(repository).assertEligible(7, now)
    ).rejects.toMatchObject({
      message: "error.affiliate_withdrawal.holder_name_mismatch",
      statusCode: 409
    });
  });

  it("accepts only an active affiliate with exact normalized eKYC/bank hashes", async () => {
    const repository = createRepository();
    await expect(
      new AffiliateWithdrawalEligibilityService(repository).assertEligible(7, now)
    ).resolves.toEqual({ eKycVerificationId: 11, bankAccountId: 21 });
    expect(repository.findEligibility).toHaveBeenCalledWith(7, now);
  });
});
