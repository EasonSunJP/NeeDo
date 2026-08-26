import {
  AffiliateBankAccountService,
  type AffiliateBankAccountRepositoryPort
} from "../src/services/affiliate-bank-account.service";
import { SensitiveFieldCipherService } from "../src/services/sensitive-field-cipher.service";

const cipher = new SensitiveFieldCipherService("affiliate-bank-test-key-at-least-32-characters");
const now = new Date("2026-08-26T05:00:00.000Z");

const createRepository = (): jest.Mocked<AffiliateBankAccountRepositoryPort> => ({
  findBindingContext: jest.fn(async (userId, requestedAt) => {
    void userId;
    void requestedAt;
    return {
      userId: 7,
      affiliateIdentityActive: true,
      verifiedEkycNameKanaEncrypted: cipher.seal("ヤマモト タロウ"),
      previousBankAccountId: null
    };
  }),
  bindVerifiedAccount: jest.fn(async (input) => ({
    id: 21,
    bankCode: input.bankCode,
    bankName: input.bankName,
    branchCode: input.branchCode,
    branchName: input.branchName,
    accountType: input.accountType,
    verifiedAt: input.verifiedAt
  }))
});

const input = {
  userId: 7,
  bankCode: "0001",
  bankName: "みずほ銀行",
  branchCode: "001",
  branchName: "銀座支店",
  accountType: "ordinary" as const,
  accountNumber: "1234567",
  accountHolderName: "ﾔﾏﾓﾄ ﾀﾛｳ",
  now
};

describe("AffiliateBankAccountService", () => {
  it("encrypts and binds an eKYC-matched personal account with only a masked projection", async () => {
    const repository = createRepository();
    await expect(
      new AffiliateBankAccountService(repository, cipher).bind(input)
    ).resolves.toMatchObject({
      id: 21,
      accountNumberMasked: "•••4567",
      holderMatched: true
    });
    const stored = repository.bindVerifiedAccount.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      userId: 7,
      purpose: "affiliate_withdrawal",
      verificationSource: "ekyc",
      verificationStatus: "verified"
    });
    expect(stored?.holderMatchHash).toBe(cipher.matchHash("ヤマモトタロウ"));
    expect(JSON.stringify(stored?.auditMetadata)).not.toContain("1234567");
    expect(JSON.stringify(stored?.auditMetadata)).not.toContain("ヤマモト");
  });

  it("blocks missing eKYC and holder mismatch without a manual override", async () => {
    const missing = createRepository();
    missing.findBindingContext.mockResolvedValue({
      userId: 7,
      affiliateIdentityActive: true,
      verifiedEkycNameKanaEncrypted: null,
      previousBankAccountId: null
    });
    await expect(
      new AffiliateBankAccountService(missing, cipher).bind(input)
    ).rejects.toMatchObject({ message: "error.affiliate_withdrawal.ekyc_required" });

    const mismatch = createRepository();
    await expect(
      new AffiliateBankAccountService(mismatch, cipher).bind({
        ...input,
        accountHolderName: "ヤマモト ジロウ"
      })
    ).rejects.toMatchObject({ message: "error.affiliate_withdrawal.holder_name_mismatch" });
    expect(mismatch.bindVerifiedAccount).not.toHaveBeenCalled();
  });
});
