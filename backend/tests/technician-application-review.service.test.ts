import { applicationEkycPolicy } from "./helpers/application-ekyc-policy";
import {
  TechnicianApplicationReviewService,
  type TechnicianApplicationContactPort,
  type TechnicianApplicationReviewRecord,
  type TechnicianApplicationReviewRepositoryPort
} from "../src/services/technician-application-review.service";

const reviewRecord = (
  overrides: Partial<TechnicianApplicationReviewRecord> = {}
): TechnicianApplicationReviewRecord => ({
  applicationId: 11,
  applicantUserId: 7,
  targetShopId: 21,
  targetShopServiceUserId: 30,
  status: "submitted",
  version: 2,
  applicantName: "山本太郎",
  city: "东京",
  bio: "四年经验",
  phone: null,
  serviceAreas: ["银座"],
  skills: ["按摩"],
  yearsExperience: 4,
  gender: "male",
  birthDate: new Date("1990-01-02T00:00:00.000Z"),
  submittedAt: new Date("2026-08-25T05:00:00.000Z"),
  createdAt: new Date("2026-08-24T05:00:00.000Z"),
  media: [],
  ...overrides
});

const createRepository = (): jest.Mocked<TechnicianApplicationReviewRepositoryPort> => ({
  listForShop: jest.fn().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 }),
  findForShop: jest.fn().mockResolvedValue(reviewRecord()),
  approveInTransaction: jest.fn(async (input) => ({
    applicationId: input.applicationId,
    status: "approved" as const,
    version: input.expectedVersion + 1,
    technicianProfileId: 51,
    identityId: 61,
    reviewedAt: input.reviewedAt
  })),
  rejectInTransaction: jest.fn(async (input) => ({
    applicationId: input.applicationId,
    status: "rejected" as const,
    version: input.expectedVersion + 1,
    rejectionReason: input.rejectionReason,
    reviewedAt: input.reviewedAt
  })),
  recordContactAudit: jest.fn(async (input) => {
    void input;
  })
});

const createContacts = (): jest.Mocked<TechnicianApplicationContactPort> => ({
  ensureDirectContactConversation: jest.fn().mockResolvedValue({ conversationId: 91 })
});

describe("TechnicianApplicationReviewService", () => {
  const now = new Date("2026-08-26T05:00:00.000Z");

  it("approves only a submitted application targeted to the current shop", async () => {
    const repository = createRepository();
    const service = new TechnicianApplicationReviewService(repository, createContacts(), applicationEkycPolicy());

    await expect(
      service.approve({
        applicationId: 11,
        reviewerUserId: 30,
        reviewerShopId: 21,
        expectedVersion: 2,
        now
      })
    ).resolves.toMatchObject({ status: "approved", technicianProfileId: 51, identityId: 61 });
    expect(repository.approveInTransaction).toHaveBeenCalledWith({
      applicationId: 11,
      applicantUserId: 7,
      targetShopId: 21,
      reviewerUserId: 30,
      expectedVersion: 2,
      applicantName: "山本太郎",
      ekycPolicy: { required: true, verified: true, policyVersionPublicId: "policy-test" },
      city: "东京",
      bio: "四年经验",
      reviewedAt: now,
      purgeAt: new Date("2026-09-25T05:00:00.000Z")
    });

    repository.findForShop.mockResolvedValueOnce(null);
    await expect(
      service.approve({
        applicationId: 11,
        reviewerUserId: 31,
        reviewerShopId: 99,
        expectedVersion: 2,
        now
      })
    ).rejects.toMatchObject({ message: "error.identity_application.not_found", statusCode: 404 });
  });

  it("requires an exact optimistic version and returns an already closed review idempotently", async () => {
    const repository = createRepository();
    const service = new TechnicianApplicationReviewService(repository, createContacts(), applicationEkycPolicy());

    await expect(
      service.approve({
        applicationId: 11,
        reviewerUserId: 30,
        reviewerShopId: 21,
        expectedVersion: 1,
        now
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.version_conflict",
      statusCode: 409
    });

    repository.findForShop.mockResolvedValueOnce(reviewRecord({ status: "approved", version: 3 }));
    await expect(
      service.approve({
        applicationId: 11,
        reviewerUserId: 30,
        reviewerShopId: 21,
        expectedVersion: 2,
        now
      })
    ).resolves.toMatchObject({ applicationId: 11, status: "approved", version: 3 });
    expect(repository.approveInTransaction).not.toHaveBeenCalled();
  });

  it("rejects with a required reason and starts the 30-day purge clock", async () => {
    const repository = createRepository();
    const service = new TechnicianApplicationReviewService(repository, createContacts(), applicationEkycPolicy());

    await expect(
      service.reject({
        applicationId: 11,
        reviewerUserId: 30,
        reviewerShopId: 21,
        expectedVersion: 2,
        rejectionReason: "  ",
        now
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.rejection_reason_required",
      statusCode: 400
    });

    await service.reject({
      applicationId: 11,
      reviewerUserId: 30,
      reviewerShopId: 21,
      expectedVersion: 2,
      rejectionReason: "照片无法确认",
      now
    });
    expect(repository.rejectInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: "照片无法确认",
        purgeAt: new Date("2026-09-25T05:00:00.000Z")
      })
    );
  });

  it("contacts without approving, creates bilateral contacts once, and reuses direct chat", async () => {
    const repository = createRepository();
    const contacts = createContacts();
    const service = new TechnicianApplicationReviewService(repository, contacts, applicationEkycPolicy());

    await expect(
      service.contact({
        applicationId: 11,
        reviewerUserId: 31,
        reviewerShopId: 21,
        now
      })
    ).resolves.toEqual({ conversationId: 91 });
    expect(contacts.ensureDirectContactConversation).toHaveBeenCalledWith({
      serviceUserId: 30,
      applicantUserId: 7,
      createdByUserId: 31
    });
    expect(repository.recordContactAudit).toHaveBeenCalledWith({
      applicationId: 11,
      reviewerUserId: 31,
      targetShopId: 21,
      conversationId: 91,
      contactedAt: now
    });
    expect(repository.approveInTransaction).not.toHaveBeenCalled();
    expect(repository.rejectInTransaction).not.toHaveBeenCalled();
  });
});
