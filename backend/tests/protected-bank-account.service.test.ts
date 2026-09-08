import { applicationEkycPolicy } from "./helpers/application-ekyc-policy";
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
    currentBankAccountId: null
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
  it.each(["corporate", "individual"] as const)(
    "records an unrelated holder name for a %s merchant application without comparing names",
    async (applicantKind) => {
      const repository = createRepository();
      repository.findMerchantBindingContext.mockResolvedValue({
        applicationId: 11,
        userId: 7,
        status: "draft",
        version: 1,
        applicantKind,
        currentBankAccountId: null
      });
      const service = new ProtectedBankAccountService(
        repository,
        cipher,
        applicationEkycPolicy(true, true)
      );

      const result = await service.bindMerchantAccount({
        ...input,
        accountHolderName: "サトウ ハナコ"
      });

      expect(result).not.toHaveProperty("holderMatched");
      expect(repository.bindVerifiedMerchantAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationSource: "applicant_declaration",
          verificationStatus: "declared",
          verifiedAt: null
        })
      );
    }
  );

  it.each(["ordinary", "current", "savings", "other"] as const)("records a %s corporate account as an applicant declaration", async (accountType) => {
    const repository = createRepository();
    const service = new ProtectedBankAccountService(repository, cipher, applicationEkycPolicy());

    await expect(service.bindMerchantAccount({ ...input, accountType })).resolves.toMatchObject({
      accountType,
      accountNumberMasked: "•••4567",
      applicationVersion: 2
    });
    const stored = repository.bindVerifiedMerchantAccount.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      accountType,
      verificationSource: "applicant_declaration",
      verificationStatus: "declared",
      verifiedAt: null,
      auditMetadata: {
        applicationId: 11,
        applicantKind: "corporate",
        verificationStatus: "declared",
        verificationSource: "applicant_declaration"
      }
    });
    expect(stored?.accountNumberEncrypted).not.toContain("1234567");
    expect(stored?.accountHolderEncrypted).not.toContain("カ）ニード");
    expect(stored?.holderMatchHash).toBe(cipher.matchHash("カ)ニード"));
    expect(JSON.stringify(stored?.auditMetadata)).not.toContain("1234567");
    expect(JSON.stringify(stored?.auditMetadata)).not.toContain("ニード");
  });

  it.each([false, true])("keeps individual bank declarations distinct from eKYC when required=%s", async (required) => {
    const repository = createRepository();
    repository.findMerchantBindingContext.mockResolvedValue({ applicationId: 11, userId: 7, status: "draft", version: 1, applicantKind: "individual", currentBankAccountId: null });
    const service = new ProtectedBankAccountService(repository, cipher, applicationEkycPolicy(required, false));
    const result = service.bindMerchantAccount({ ...input, accountHolderName: "ヤマダ タロウ" });
    if (required) { await expect(result).rejects.toMatchObject({ statusCode: 409 }); expect(repository.bindVerifiedMerchantAccount).not.toHaveBeenCalled(); }
    else { await result; expect(repository.bindVerifiedMerchantAccount).toHaveBeenCalledWith(expect.objectContaining({ verificationSource: "applicant_declaration", verificationStatus: "declared", verifiedAt: null })); }
  });
  it("records an unrelated declared account when eKYC is disabled", async () => {
    const repository = createRepository();
    repository.findMerchantBindingContext.mockResolvedValue({ applicationId: 11, userId: 7, status: "draft", version: 1, applicantKind: "individual", currentBankAccountId: null });
    await expect(new ProtectedBankAccountService(repository, cipher, applicationEkycPolicy(false, false)).bindMerchantAccount({ ...input, accountHolderName: "サトウ ハナコ" })).resolves.toMatchObject({ applicationVersion: 2 });
  });

  it("records a representative's personal account for a corporate application", async () => {
    const repository = createRepository();
    const service = new ProtectedBankAccountService(repository, cipher, applicationEkycPolicy());

    await expect(
      service.bindMerchantAccount({ ...input, accountHolderName: "ヤマモト タロウ" })
    ).resolves.toMatchObject({ applicationVersion: 2 });
    expect(repository.bindVerifiedMerchantAccount).toHaveBeenCalled();
  });

  it("records an individual account independently from the verified eKYC kana", async () => {
    const repository = createRepository();
    repository.findMerchantBindingContext.mockResolvedValue({
      applicationId: 11,
      userId: 7,
      status: "draft",
      version: 1,
      applicantKind: "individual",
      currentBankAccountId: null
    });
    const service = new ProtectedBankAccountService(repository, cipher, applicationEkycPolicy());

    await service.bindMerchantAccount({ ...input, accountHolderName: "ﾔﾏﾓﾄ ﾀﾛｳ" });
    expect(repository.bindVerifiedMerchantAccount).toHaveBeenCalledWith(
      expect.objectContaining({ verificationSource: "applicant_declaration", verificationStatus: "declared" })
    );
  });

  it("blocks missing eKYC, another owner, locked states, and stale versions", async () => {
    const repository = createRepository();
    const service = new ProtectedBankAccountService(repository, cipher, applicationEkycPolicy(true, false));

    repository.findMerchantBindingContext.mockResolvedValueOnce({
      applicationId: 11,
      userId: 7,
      status: "draft",
      version: 1,
      applicantKind: "individual",
      currentBankAccountId: null
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
      currentBankAccountId: null
    });
    await expect(service.bindMerchantAccount(input)).rejects.toMatchObject({ statusCode: 404 });

    repository.findMerchantBindingContext.mockResolvedValueOnce({
      applicationId: 11,
      userId: 7,
      status: "submitted",
      version: 1,
      applicantKind: "corporate",
      currentBankAccountId: null
    });
    await expect(service.bindMerchantAccount(input)).rejects.toMatchObject({ statusCode: 409 });

    repository.findMerchantBindingContext.mockResolvedValueOnce({
      applicationId: 11,
      userId: 7,
      status: "draft",
      version: 2,
      applicantKind: "corporate",
      currentBankAccountId: null
    });
    await expect(service.bindMerchantAccount(input)).rejects.toMatchObject({
      message: "error.identity_application.version_conflict",
      statusCode: 409
    });
  });
});
