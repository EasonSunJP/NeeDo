import { SensitiveFieldCipherService } from "../src/services/sensitive-field-cipher.service";
import {
  ProtectedBankAccountService,
  type ProtectedBankAccountRepositoryPort
} from "../src/services/protected-bank-account.service";

const cipher = new SensitiveFieldCipherService("test-sensitive-data-key-with-at-least-32-chars");

const createRepository = (): jest.Mocked<ProtectedBankAccountRepositoryPort> => ({
  findMerchantBindingContext: jest.fn().mockResolvedValue({
    applicationId: 11,
    userId: 7,
    status: "draft",
    version: 1,
    applicantKind: "corporate",
    corporateLegalNameKana: "カブシキガイシャ ニード",
    currentBankAccountId: null,
    verifiedEkycNameKanaEncrypted: null
  }),
  bindVerifiedMerchantAccount: jest.fn(async (input) => ({
    id: 44,
    bankCode: input.bankCode,
    bankName: input.bankName,
    branchCode: input.branchCode,
    branchName: input.branchName,
    accountType: input.accountType,
    verifiedAt: input.verifiedAt,
    applicationVersion: input.expectedVersion + 1
  }))
});

const input = {
  userId: 7,
  applicationId: 11,
  expectedVersion: 1,
  bankCode: "0005",
  bankName: "三菱UFJ银行",
  branchCode: "001",
  branchName: "本店",
  accountType: "ordinary" as const,
  accountNumber: "1234567",
  accountHolderName: "カ）ニード",
  now: new Date("2026-08-26T05:00:00.000Z")
};

describe("ProtectedBankAccountService", () => {
  it("binds a corporate account only when the holder matches the legal entity name", async () => {
    const repository = createRepository();
    const service = new ProtectedBankAccountService(repository, cipher);

    await expect(service.bindMerchantAccount(input)).resolves.toMatchObject({
      accountNumberMasked: "•••4567",
      holderMatched: true,
      applicationVersion: 2
    });
    const stored = repository.bindVerifiedMerchantAccount.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      verificationSource: "corporate_registration",
      verificationStatus: "verified",
      auditMetadata: {
        applicationId: 11,
        applicantKind: "corporate",
        verificationStatus: "verified"
      }
    });
    expect(stored?.accountNumberEncrypted).not.toContain("1234567");
    expect(stored?.accountHolderEncrypted).not.toContain("カ）ニード");
    expect(JSON.stringify(stored?.auditMetadata)).not.toContain("1234567");
    expect(JSON.stringify(stored?.auditMetadata)).not.toContain("ニード");
  });

  it("rejects a representative's personal account for a corporate application", async () => {
    const repository = createRepository();
    const service = new ProtectedBankAccountService(repository, cipher);

    await expect(
      service.bindMerchantAccount({ ...input, accountHolderName: "ヤマモト タロウ" })
    ).rejects.toMatchObject({
      message: "error.bank_account.holder_name_mismatch",
      statusCode: 409
    });
    expect(repository.bindVerifiedMerchantAccount).not.toHaveBeenCalled();
  });

  it("matches an individual account only to the verified eKYC kana", async () => {
    const repository = createRepository();
    repository.findMerchantBindingContext.mockResolvedValue({
      applicationId: 11,
      userId: 7,
      status: "draft",
      version: 1,
      applicantKind: "individual",
      corporateLegalNameKana: null,
      currentBankAccountId: null,
      verifiedEkycNameKanaEncrypted: cipher.seal("ヤマモト タロウ")
    });
    const service = new ProtectedBankAccountService(repository, cipher);

    await service.bindMerchantAccount({ ...input, accountHolderName: "ﾔﾏﾓﾄ ﾀﾛｳ" });
    expect(repository.bindVerifiedMerchantAccount).toHaveBeenCalledWith(
      expect.objectContaining({ verificationSource: "ekyc" })
    );
  });

  it("blocks missing eKYC, another owner, locked states, and stale versions", async () => {
    const repository = createRepository();
    const service = new ProtectedBankAccountService(repository, cipher);

    repository.findMerchantBindingContext.mockResolvedValueOnce({
      applicationId: 11,
      userId: 7,
      status: "draft",
      version: 1,
      applicantKind: "individual",
      corporateLegalNameKana: null,
      currentBankAccountId: null,
      verifiedEkycNameKanaEncrypted: null
    });
    await expect(service.bindMerchantAccount(input)).rejects.toMatchObject({
      message: "error.identity_application.ekyc_required",
      statusCode: 409
    });

    repository.findMerchantBindingContext.mockResolvedValueOnce({
      applicationId: 11,
      userId: 99,
      status: "draft",
      version: 1,
      applicantKind: "corporate",
      corporateLegalNameKana: "カブシキガイシャ ニード",
      currentBankAccountId: null,
      verifiedEkycNameKanaEncrypted: null
    });
    await expect(service.bindMerchantAccount(input)).rejects.toMatchObject({ statusCode: 404 });

    repository.findMerchantBindingContext.mockResolvedValueOnce({
      applicationId: 11,
      userId: 7,
      status: "submitted",
      version: 1,
      applicantKind: "corporate",
      corporateLegalNameKana: "カブシキガイシャ ニード",
      currentBankAccountId: null,
      verifiedEkycNameKanaEncrypted: null
    });
    await expect(service.bindMerchantAccount(input)).rejects.toMatchObject({ statusCode: 409 });

    repository.findMerchantBindingContext.mockResolvedValueOnce({
      applicationId: 11,
      userId: 7,
      status: "draft",
      version: 2,
      applicantKind: "corporate",
      corporateLegalNameKana: "カブシキガイシャ ニード",
      currentBankAccountId: null,
      verifiedEkycNameKanaEncrypted: null
    });
    await expect(service.bindMerchantAccount(input)).rejects.toMatchObject({
      message: "error.identity_application.version_conflict",
      statusCode: 409
    });
  });
});
