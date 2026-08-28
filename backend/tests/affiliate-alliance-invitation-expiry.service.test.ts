import {
  AffiliateAllianceInvitationExpiryService,
  type AffiliateAllianceInvitationExpiryRepositoryPort
} from "../src/services/affiliate-alliance-invitation-expiry.service";

describe("AffiliateAllianceInvitationExpiryService", () => {
  it("expires a cursor-bounded batch and reports conditional race losses", async () => {
    const repository: jest.Mocked<AffiliateAllianceInvitationExpiryRepositoryPort> = {
      listExpiryCandidateInvitationIds: jest.fn().mockResolvedValue([11, 12, 13]),
      expireInvitation: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
    };
    const service = new AffiliateAllianceInvitationExpiryService(repository);
    const now = new Date("2026-08-31T12:00:00.000Z");

    await expect(service.expireDue({ now, batchSize: 3 })).resolves.toEqual({
      scanned: 3,
      expired: 2,
      skipped: 1,
      failed: 0
    });
    expect(repository.listExpiryCandidateInvitationIds).toHaveBeenCalledWith({
      now,
      batchSize: 3,
      afterInvitationId: 0
    });
    expect(repository.expireInvitation).toHaveBeenNthCalledWith(1, {
      invitationId: 11,
      now
    });
  });

  it("continues after one candidate failure and advances its cursor", async () => {
    const repository: jest.Mocked<AffiliateAllianceInvitationExpiryRepositoryPort> = {
      listExpiryCandidateInvitationIds: jest
        .fn()
        .mockResolvedValueOnce([21, 22])
        .mockResolvedValueOnce([]),
      expireInvitation: jest
        .fn()
        .mockRejectedValueOnce(new Error("database unavailable"))
        .mockResolvedValueOnce(true)
    };
    const service = new AffiliateAllianceInvitationExpiryService(repository);
    const now = new Date("2026-08-31T12:00:00.000Z");

    await expect(service.expireDue({ now, batchSize: 2 })).resolves.toEqual({
      scanned: 2,
      expired: 1,
      skipped: 0,
      failed: 1
    });
    await service.expireDue({ now, batchSize: 2 });
    expect(repository.listExpiryCandidateInvitationIds).toHaveBeenNthCalledWith(2, {
      now,
      batchSize: 2,
      afterInvitationId: 22
    });
  });

  it.each([
    { now: new Date("invalid"), batchSize: 1 },
    { now: new Date(), batchSize: 0 },
    { now: new Date(), batchSize: 501 }
  ])("rejects invalid batch input %#", async (input) => {
    const repository = {
      listExpiryCandidateInvitationIds: jest.fn(),
      expireInvitation: jest.fn()
    } as jest.Mocked<AffiliateAllianceInvitationExpiryRepositoryPort>;
    const service = new AffiliateAllianceInvitationExpiryService(repository);

    await expect(service.expireDue(input)).rejects.toThrow();
    expect(repository.listExpiryCandidateInvitationIds).not.toHaveBeenCalled();
  });
});
