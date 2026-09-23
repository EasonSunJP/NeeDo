import { applicationEkycPolicy } from "./helpers/application-ekyc-policy";
import type { IdentityApplicationStatus } from "../src/services/identity-application-policy.service";
import {
  IdentityApplicationService,
  type IdentityApplicationRecord,
  type IdentityApplicationRepositoryPort,
  type MerchantApplicationDetailRecord,
  type TechnicianApplicationDetailRecord
} from "../src/services/identity-application.service";

const technicianDetail = (
  overrides: Partial<TechnicianApplicationDetailRecord> = {}
): TechnicianApplicationDetailRecord => ({
  targetShopId: 7,
  applicantName: "山本太郎",
  phone: null,
  city: null,
  serviceAreas: [],
  skills: [],
  yearsExperience: null,
  bio: null,
  gender: null,
  birthDate: null,
  ...overrides
});

const merchantDetail = (
  overrides: Partial<MerchantApplicationDetailRecord> = {}
): MerchantApplicationDetailRecord => ({
  applicantKind: "corporate",
  corporateLegalName: "株式会社NeeDo",
  corporateLegalNameKana: "カブシキガイシャニード",
  representativeName: "山本太郎",
  representativeNameKana: "ヤマモトタロウ",
  shopName: "NeeDo 银座店",
  businessAddress: "東京都中央区銀座1-1-1",
  contactPhone: "09000000000",
  responsiblePersonName: "山本太郎",
  showcaseDraft: { headline: "安心服务" },
  serviceCategoryIds: [1],
  businessKeywordIds: [10],
  bankAccountId: 19,
  contractAcceptanceId: 23,
  mediaPurposes: ["corporate_registration", "representative_identity"],
  bankVerificationStatus: "verified",
  eKycVerified: false,
  ...overrides
});

const application = (
  overrides: Partial<IdentityApplicationRecord> = {}
): IdentityApplicationRecord => ({
  id: 11,
  userId: 3,
  type: "technician",
  status: "draft",
  version: 1,
  activeKey: "3:technician",
  submittedSnapshotHash: null,
  submittedAt: null,
  closedAt: null,
  purgeAt: null,
  rejectionReason: null,
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  updatedAt: new Date("2026-08-26T00:00:00.000Z"),
  technicianDetail: technicianDetail(),
  merchantDetail: null,
  ...overrides
});

const createRepository = (): jest.Mocked<IdentityApplicationRepositoryPort> => ({
  findInvitableUserByNeedoId: jest.fn().mockResolvedValue({ id: 3, username: "山本太郎" }),
  listMine: jest.fn().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 }),
  searchEligibleShops: jest.fn().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 }),
  findActiveByUserAndType: jest.fn().mockResolvedValue(null),
  hasActiveIdentity: jest.fn().mockResolvedValue(false),
  hasTechnicianShopAffiliation: jest.fn().mockResolvedValue(false),
  isShopEligibleForTechnicianApplications: jest.fn().mockResolvedValue(true),
  assertMerchantTaxonomySelection: jest.fn().mockResolvedValue(undefined),
  createTechnicianDraft: jest.fn(async (input) =>
    application({
      userId: input.userId,
      activeKey: input.activeKey,
      technicianDetail: input.detail
    })
  ),
  createTechnicianInvitation: jest.fn(async (input) =>
    application({ userId: input.userId, activeKey: input.activeKey, technicianDetail: input.detail })
  ),
  createMerchantDraft: jest.fn(async (input) =>
    application({
      userId: input.userId,
      type: "merchant",
      activeKey: input.activeKey,
      technicianDetail: null,
      merchantDetail: input.detail
    })
  ),
  findById: jest.fn().mockResolvedValue(application()),
  updateTechnicianDraft: jest.fn(async (input) =>
    application({
      version: input.expectedVersion + 1,
      status: input.nextStatus,
      activeKey: input.activeKey,
      technicianDetail: input.detail
    })
  ),
  updateMerchantDraft: jest.fn(async (input) =>
    application({
      type: "merchant",
      version: input.expectedVersion + 1,
      status: input.nextStatus,
      activeKey: input.activeKey,
      technicianDetail: null,
      merchantDetail: input.detail
    })
  ),
  submit: jest.fn(async (input) =>
    application({
      status: "submitted",
      version: input.expectedVersion + 1,
      submittedSnapshotHash: input.submittedSnapshotHash,
      submittedAt: input.submittedAt
    })
  ),
  close: jest.fn(async (input) =>
    application({
      status: input.status,
      version: input.expectedVersion + 1,
      activeKey: null,
      closedAt: input.closedAt,
      purgeAt: input.purgeAt
    })
  )
});

describe("IdentityApplicationService", () => {
  it("prepares an existing user's technician application for their own submission without activating an identity", async () => {
    const repository = createRepository();
    const service = new IdentityApplicationService(repository, applicationEkycPolicy());

    const result = await service.inviteTechnicianApplicant({ actorUserId: 9, userNeedoId: " user0000000003 ", targetShopId: 7 });

    expect(result).toMatchObject({ type: "technician", status: "draft", userId: 3 });
    expect(repository.createTechnicianInvitation).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 9,
      userId: 3,
      activeKey: "3:technician",
      detail: expect.objectContaining({ targetShopId: 7, applicantName: "山本太郎" })
    }));
    expect(repository.createTechnicianDraft).not.toHaveBeenCalled();
    expect(repository.findInvitableUserByNeedoId).toHaveBeenCalledWith("user0000000003");
  });

  it("does not invite an unknown user or an existing technician", async () => {
    const repository = createRepository();
    const service = new IdentityApplicationService(repository, applicationEkycPolicy());
    repository.findInvitableUserByNeedoId.mockResolvedValueOnce(null);
    await expect(service.inviteTechnicianApplicant({ actorUserId: 9, userNeedoId: "missing", targetShopId: 7 })).rejects.toMatchObject({ statusCode: 404 });
    repository.hasActiveIdentity.mockResolvedValueOnce(true);
    await expect(service.inviteTechnicianApplicant({ actorUserId: 9, userNeedoId: "user0000000003", targetShopId: 7 })).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.createTechnicianInvitation).not.toHaveBeenCalled();
  });

  it("creates one technician draft for an eligible target shop", async () => {
    const repository = createRepository();
    const service = new IdentityApplicationService(repository, applicationEkycPolicy());

    const result = await service.createTechnicianDraft({
      userId: 3,
      targetShopId: 7,
      applicantName: " 山本太郎 "
    });

    expect(result.type).toBe("technician");
    expect(repository.createTechnicianDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        activeKey: "3:technician",
        detail: expect.objectContaining({ applicantName: "山本太郎", targetShopId: 7 })
      })
    );
  });

  it("rejects a duplicate active application", async () => {
    const duplicateRepository = createRepository();
    duplicateRepository.findActiveByUserAndType.mockResolvedValue(application());
    await expect(
      new IdentityApplicationService(duplicateRepository, applicationEkycPolicy()).createTechnicianDraft({
        userId: 3,
        targetShopId: 7,
        applicantName: "山本太郎"
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.conflict",
      statusCode: 409
    });
  });

  it("allows an active technician to apply to another shop but rejects an existing affiliation", async () => {
    const additionalShopRepository = createRepository();
    additionalShopRepository.hasActiveIdentity.mockResolvedValue(true);
    const service = new IdentityApplicationService(additionalShopRepository, applicationEkycPolicy());

    await expect(
      service.createTechnicianDraft({
        userId: 3,
        targetShopId: 8,
        applicantName: "山本太郎"
      })
    ).resolves.toMatchObject({ type: "technician" });
    expect(additionalShopRepository.hasTechnicianShopAffiliation).toHaveBeenCalledWith(3, 8);

    additionalShopRepository.hasTechnicianShopAffiliation.mockResolvedValue(true);
    await expect(
      service.createTechnicianDraft({
        userId: 3,
        targetShopId: 7,
        applicantName: "山本太郎"
      })
    ).rejects.toMatchObject({
      message: "error.technician_affiliation.already_exists",
      statusCode: 409
    });

    additionalShopRepository.findById.mockResolvedValue(application({ userId: 3 }));
    await expect(
      service.updateTechnicianDraft({
        userId: 3,
        applicationId: 1,
        expectedVersion: 1,
        detail: technicianDetail({ targetShopId: 7 })
      })
    ).rejects.toMatchObject({
      message: "error.technician_affiliation.already_exists",
      statusCode: 409
    });
  });

  it("still rejects an already active merchant identity", async () => {
    const repository = createRepository();
    repository.hasActiveIdentity.mockResolvedValue(true);
    await expect(
      new IdentityApplicationService(repository, applicationEkycPolicy()).createMerchantDraft({
        userId: 3,
        detail: merchantDetail()
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.identity_already_active",
      statusCode: 409
    });
  });

  it("rejects unavailable technician target shops", async () => {
    const repository = createRepository();
    repository.isShopEligibleForTechnicianApplications.mockResolvedValue(false);

    await expect(
      new IdentityApplicationService(repository, applicationEkycPolicy()).createTechnicianDraft({
        userId: 3,
        targetShopId: 999,
        applicantName: "山本太郎"
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.target_shop_not_found",
      statusCode: 404
    });
  });

  it("requires one to five service categories and validates keyword membership before creating a merchant draft", async () => {
    const missingCategory = createRepository();
    await expect(
      new IdentityApplicationService(missingCategory, applicationEkycPolicy()).createMerchantDraft({
        userId: 3,
        detail: merchantDetail({ serviceCategoryIds: [], businessKeywordIds: [] })
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.service_category_limit",
      statusCode: 400
    });
    expect(missingCategory.createMerchantDraft).not.toHaveBeenCalled();

    const repository = createRepository();
    await new IdentityApplicationService(repository, applicationEkycPolicy()).createMerchantDraft({
      userId: 3,
      detail: merchantDetail()
    });
    expect(repository.assertMerchantTaxonomySelection).toHaveBeenCalledWith({
      serviceCategoryIds: [1],
      businessKeywordIds: [10]
    });
    expect(repository.createMerchantDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ serviceCategoryIds: [1], businessKeywordIds: [10] })
      })
    );
  });

  it("updates only the owner's editable draft at the expected version", async () => {
    const repository = createRepository();
    const service = new IdentityApplicationService(repository, applicationEkycPolicy());

    await service.updateTechnicianDraft({
      userId: 3,
      applicationId: 11,
      expectedVersion: 1,
      detail: technicianDetail({ city: "东京" })
    });

    expect(repository.updateTechnicianDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 11,
        expectedVersion: 1,
        nextStatus: "draft",
        activeKey: "3:technician",
        detail: expect.objectContaining({ city: "东京" })
      })
    );
  });

  it("rejects another user's application, stale versions, and submitted edits", async () => {
    const wrongOwner = createRepository();
    wrongOwner.findById.mockResolvedValue(application({ userId: 8 }));
    await expect(
      new IdentityApplicationService(wrongOwner, applicationEkycPolicy()).updateTechnicianDraft({
        userId: 3,
        applicationId: 11,
        expectedVersion: 1,
        detail: technicianDetail()
      })
    ).rejects.toMatchObject({ message: "error.identity_application.not_found", statusCode: 404 });

    const stale = createRepository();
    stale.findById.mockResolvedValue(application({ version: 2 }));
    await expect(
      new IdentityApplicationService(stale, applicationEkycPolicy()).updateTechnicianDraft({
        userId: 3,
        applicationId: 11,
        expectedVersion: 1,
        detail: technicianDetail()
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.version_conflict",
      statusCode: 409
    });

    const submitted = createRepository();
    submitted.findById.mockResolvedValue(application({ status: "submitted" }));
    await expect(
      new IdentityApplicationService(submitted, applicationEkycPolicy()).updateTechnicianDraft({
        userId: 3,
        applicationId: 11,
        expectedVersion: 1,
        detail: technicianDetail()
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.submitted_snapshot_locked",
      statusCode: 409
    });
  });

  it("submits a technician snapshot only when the required name is present", async () => {
    const missingName = createRepository();
    missingName.findById.mockResolvedValue(
      application({ technicianDetail: technicianDetail({ applicantName: "  " }) })
    );
    await expect(
      new IdentityApplicationService(missingName, applicationEkycPolicy()).submit({
        userId: 3,
        applicationId: 11,
        expectedVersion: 1,
        now: new Date("2026-08-26T05:00:00.000Z")
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.technician_name_required",
      statusCode: 400
    });

    const repository = createRepository();
    await new IdentityApplicationService(repository, applicationEkycPolicy()).submit({
      userId: 3,
      applicationId: 11,
      expectedVersion: 1,
      now: new Date("2026-08-26T05:00:00.000Z")
    });
    expect(repository.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 11,
        expectedVersion: 1,
        submittedSnapshot: expect.objectContaining({
          type: "technician",
          detail: expect.objectContaining({ applicantName: "山本太郎" })
        }),
        submittedSnapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
  });

  it.each(["individual", "corporate"] as const)("submits %s merchant evidence without a representative photo", async (applicantKind) => {
    const repository = createRepository();
    repository.findById.mockResolvedValue(application({
      type: "merchant", technicianDetail: null,
      merchantDetail: merchantDetail({ applicantKind, eKycVerified: true,
        mediaPurposes: applicantKind === "corporate" ? ["corporate_registration"] : [] })
    }));
    await new IdentityApplicationService(repository, applicationEkycPolicy()).submit({
      userId: 3, applicationId: 11, expectedVersion: 1, now: new Date("2026-08-26T05:00:00.000Z")
    });
    expect(repository.submit).toHaveBeenCalled();
  });

  it("submits an eKYC-verified individual merchant with a declared bank account", async () => {
    const repository = createRepository();
    repository.findById.mockResolvedValue(application({
      type: "merchant",
      technicianDetail: null,
      merchantDetail: merchantDetail({
        applicantKind: "individual",
        corporateLegalName: null,
        corporateLegalNameKana: null,
        bankVerificationStatus: "declared",
        eKycVerified: true,
        mediaPurposes: []
      })
    }));

    await new IdentityApplicationService(
      repository,
      applicationEkycPolicy(true, true)
    ).submit({
      userId: 3,
      applicationId: 11,
      expectedVersion: 1,
      now: new Date("2026-08-26T05:00:00.000Z")
    });

    expect(repository.submit).toHaveBeenCalled();
  });

  it("enforces corporate and individual merchant submission evidence", async () => {
    const corporate = createRepository();
    corporate.findById.mockResolvedValue(
      application({
        type: "merchant",
        technicianDetail: null,
        merchantDetail: merchantDetail({ mediaPurposes: ["representative_identity"] })
      })
    );
    await expect(
      new IdentityApplicationService(corporate, applicationEkycPolicy()).submit({
        userId: 3,
        applicationId: 11,
        expectedVersion: 1,
        now: new Date("2026-08-26T05:00:00.000Z")
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.corporate_registration_required",
      statusCode: 400
    });

    const individual = createRepository();
    individual.findById.mockResolvedValue(
      application({
        type: "merchant",
        technicianDetail: null,
        merchantDetail: merchantDetail({
          applicantKind: "individual",
          corporateLegalName: null,
          corporateLegalNameKana: null,
          eKycVerified: false,
          mediaPurposes: ["representative_identity"]
        })
      })
    );
    await expect(
      new IdentityApplicationService(individual, applicationEkycPolicy(true, false)).submit({
        userId: 3,
        applicationId: 11,
        expectedVersion: 1,
        now: new Date("2026-08-26T05:00:00.000Z")
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.ekyc_required",
      statusCode: 409
    });
  });

  it("withdraws a pending application and starts the thirty-day purge clock", async () => {
    const repository = createRepository();
    repository.findById.mockResolvedValue(application({ status: "submitted" }));
    const now = new Date("2026-08-26T05:00:00.000Z");

    await new IdentityApplicationService(repository, applicationEkycPolicy()).withdraw({
      userId: 3,
      applicationId: 11,
      expectedVersion: 1,
      now
    });

    expect(repository.close).toHaveBeenCalledWith({
      applicationId: 11,
      expectedVersion: 1,
      status: "withdrawn",
      closedAt: now,
      purgeAt: new Date("2026-09-25T05:00:00.000Z")
    });
  });

  it.each<IdentityApplicationStatus>(["approved", "rejected", "withdrawn"])(
    "does not withdraw a closed %s application",
    async (status) => {
      const repository = createRepository();
      repository.findById.mockResolvedValue(application({ status }));

      await expect(
        new IdentityApplicationService(repository, applicationEkycPolicy()).withdraw({
          userId: 3,
          applicationId: 11,
          expectedVersion: 1,
          now: new Date("2026-08-26T05:00:00.000Z")
        })
      ).rejects.toMatchObject({
        message: "error.identity_application.invalid_transition",
        statusCode: 409
      });
    }
  );
});
