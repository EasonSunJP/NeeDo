import {
  MerchantApplicationReviewService,
  type MerchantApplicationReviewRecord,
  type MerchantApplicationReviewRepositoryPort
} from "../src/services/merchant-application-review.service";

const exactFifteenDays = new Date("2026-08-16T15:00:00.000Z");

const corporateApplication = (
  overrides: Partial<MerchantApplicationReviewRecord> = {}
): MerchantApplicationReviewRecord => ({
  applicationId: 41,
  applicantUserId: 7,
  status: "submitted",
  version: 3,
  submittedSnapshotHash: "a".repeat(64),
  submittedAt: new Date("2026-08-15T03:00:00.000Z"),
  createdAt: new Date("2026-08-14T03:00:00.000Z"),
  applicantKind: "corporate",
  corporateLegalName: "株式会社ニード",
  corporateLegalNameKana: "カブシキガイシャニード",
  representativeName: "山本太郎",
  representativeNameKana: "ヤマモトタロウ",
  shopName: "NeeDo 银座店",
  businessAddress: "東京都中央区銀座3-4-12",
  contactPhone: "03-1234-5678",
  responsiblePersonName: "山本太郎",
  showcaseDraft: { city: "東京都中央区", description: "リラクゼーション" },
  bankAccount: {
    id: 81,
    bankCode: "0001",
    bankName: "みずほ銀行",
    branchCode: "001",
    branchName: "銀座支店",
    accountType: "ordinary",
    accountNumberMasked: "***4567",
    accountHolderMasked: "カ*********ド",
    verificationSource: "corporate_registration",
    verificationStatus: "verified",
    holderMatched: true,
    verifiedAt: new Date("2026-08-15T02:00:00.000Z")
  },
  eKycVerified: false,
  contractAcceptance: {
    id: 91,
    contractType: "merchant",
    contractVersion: "merchant-ja-2026-08",
    contentHash: "b".repeat(64),
    acceptedAt: new Date("2026-08-15T02:30:00.000Z"),
    language: "ja",
    receiptId: "receipt-91"
  },
  media: [
    { id: 101, purpose: "corporate_registration", url: "/media/101", mimeType: "image/png" },
    { id: 102, purpose: "representative_identity", url: "/media/102", mimeType: "image/png" }
  ],
  ...overrides
});

const createRepository = (): jest.Mocked<MerchantApplicationReviewRepositoryPort> => ({
  list: jest.fn(async (query, includeSensitiveDocuments) => {
    void query;
    void includeSensitiveDocuments;
    return {
      list: [corporateApplication()],
      total: 1,
      page: 1,
      page_size: 20
    };
  }),
  findById: jest.fn(
    async (applicationId: number, includeSensitiveDocuments: boolean) => {
      void applicationId;
      void includeSensitiveDocuments;
      return corporateApplication();
    }
  ),
  approveInTransaction: jest.fn(async (input) => ({
    applicationId: input.applicationId,
    status: "approved" as const,
    version: input.expectedVersion + 1,
    merchantAccountId: 51,
    shopId: 61,
    identityId: 71,
    billingProfileId: 81,
    reviewedAt: input.reviewedAt
  })),
  rejectInTransaction: jest.fn(async (input) => ({
    applicationId: input.applicationId,
    status: "rejected" as const,
    version: input.expectedVersion + 1,
    rejectionReason: input.rejectionReason,
    reviewedAt: input.reviewedAt
  }))
});

describe("MerchantApplicationReviewService", () => {
  it("paginates applications and forwards sensitive-document authorization", async () => {
    const repository = createRepository();
    const service = new MerchantApplicationReviewService(repository);

    await expect(
      service.list({ page: 1, pageSize: 20, status: "submitted" }, false)
    ).resolves.toMatchObject({ total: 1, page: 1, page_size: 20 });
    expect(repository.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, status: "submitted" },
      false
    );
  });

  it.each([
    ["corporate registration", { media: corporateApplication().media.slice(1) }],
    ["representative identity", { media: corporateApplication().media.slice(0, 1) }],
    ["verified corporate bank", { bankAccount: null }],
    [
      "corporate verification source",
      {
        bankAccount: {
          ...corporateApplication().bankAccount!,
          verificationSource: "ekyc" as const
        }
      }
    ],
    ["merchant contract", { contractAcceptance: null }],
    ["submitted snapshot hash", { submittedSnapshotHash: null }]
  ] as const)("rejects a corporate approval missing %s", async (_label, overrides) => {
    const repository = createRepository();
    repository.findById.mockResolvedValue(corporateApplication(overrides));

    await expect(
      new MerchantApplicationReviewService(repository).approve({
        applicationId: 41,
        reviewerUserId: 9,
        expectedVersion: 3,
        now: exactFifteenDays
      })
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });
    expect(repository.approveInTransaction).not.toHaveBeenCalled();
  });

  it("requires individual eKYC and an eKYC-matched bank account", async () => {
    const repository = createRepository();
    repository.findById.mockResolvedValue(
      corporateApplication({
        applicantKind: "individual",
        corporateLegalName: null,
        corporateLegalNameKana: null,
        eKycVerified: false,
        bankAccount: {
          ...corporateApplication().bankAccount!,
          verificationSource: "ekyc"
        },
        media: corporateApplication().media.filter(
          (item) => item.purpose === "representative_identity"
        )
      })
    );

    await expect(
      new MerchantApplicationReviewService(repository).approve({
        applicationId: 41,
        reviewerUserId: 9,
        expectedVersion: 3,
        now: exactFifteenDays
      })
    ).rejects.toMatchObject({ message: "error.identity_application.ekyc_required" });
  });

  it.each([
    ["16 remaining days", new Date("2026-08-15T15:00:00.000Z"), 0, "2026-10-31T15:00:00.000Z"],
    ["exactly 15 remaining days", exactFifteenDays, 0, "2026-10-31T15:00:00.000Z"],
    ["14 remaining days", new Date("2026-08-17T15:00:00.000Z"), 14, "2026-11-30T15:00:00.000Z"]
  ])("approves atomically with the %s trial boundary", async (_label, now, bonus, endsAt) => {
    const repository = createRepository();
    const service = new MerchantApplicationReviewService(repository);

    await expect(
      service.approve({
        applicationId: 41,
        reviewerUserId: 9,
        expectedVersion: 3,
        now
      })
    ).resolves.toMatchObject({ status: "approved", shopId: 61 });
    expect(repository.approveInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 41,
        applicantUserId: 7,
        reviewerUserId: 9,
        expectedVersion: 3,
        bankAccountId: 81,
        contractAcceptanceId: 91,
        automaticBonusDays: bonus,
        trialEndsAt: new Date(endsAt)
      })
    );
  });

  it("is idempotent after approval and rejects only with a non-empty reason", async () => {
    const approvedRepository = createRepository();
    approvedRepository.findById.mockResolvedValue(corporateApplication({ status: "approved" }));
    const approvedService = new MerchantApplicationReviewService(approvedRepository);
    await expect(
      approvedService.approve({
        applicationId: 41,
        reviewerUserId: 9,
        expectedVersion: 3,
        now: exactFifteenDays
      })
    ).resolves.toMatchObject({ status: "approved", version: 3 });
    expect(approvedRepository.approveInTransaction).not.toHaveBeenCalled();

    const repository = createRepository();
    const service = new MerchantApplicationReviewService(repository);
    await expect(
      service.reject({
        applicationId: 41,
        reviewerUserId: 9,
        expectedVersion: 3,
        rejectionReason: "  ",
        now: exactFifteenDays
      })
    ).rejects.toMatchObject({ message: "error.identity_application.rejection_reason_required" });
    await expect(
      service.reject({
        applicationId: 41,
        reviewerUserId: 9,
        expectedVersion: 3,
        rejectionReason: "法人登记文件无法确认",
        now: exactFifteenDays
      })
    ).resolves.toMatchObject({ status: "rejected", version: 4 });
  });
});
