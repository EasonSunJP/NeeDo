import {
  EkycApplicationService,
  type EkycApplicationRepositoryPort,
  type EkycApplicationRecord
} from "../src/services/ekyc-application.service";
import { SensitiveFieldCipherService } from "../src/services/sensitive-field-cipher.service";
import { BankAccountHolderService } from "../src/services/bank-account-holder.service";
const cipher = new SensitiveFieldCipherService("test-sensitive-key-for-manual-ekyc-123456");
const profile = {
  familyName: "山本",
  givenName: "太郎",
  familyNameKana: "ヤマモト",
  givenNameKana: "タロウ",
  birthYear: "1990",
  birthMonth: "2",
  birthDay: "28",
  sex: "male",
  postalCode: "1000001",
  city: "東京都",
  street: "千代田1",
  building: "",
  occupation: "employee",
  otherOccupation: ""
};
const row = (): EkycApplicationRecord => ({
  id: 7,
  userId: 2,
  status: "submitted",
  version: 1,
  profileEncrypted: cipher.seal(JSON.stringify(profile)),
  createdAt: new Date(),
  updatedAt: new Date(),
  reviewedAt: null,
  reviewerUserId: null,
  reviewNote: null,
  rejectionReason: null,
  deletedAt: null
});
const setup = () => {
  const record = row();
  const repo: EkycApplicationRepositoryPort = {
    find: jest.fn(async () => record),
    list: jest.fn(async () => ({ list: [record], total: 1, page: 1, page_size: 20 })),
    create: jest.fn(async () => record),
    decide: jest.fn(async () => ({ ...record, status: "approved", version: 2 }))
  };
  return { record, repo, service: new EkycApplicationService(repo, cipher) };
};
describe("manual eKYC service", () => {
  it("does not create on list and never includes encrypted or clear profile in list", async () => {
    const { repo, service } = setup();
    const result = await service.list(2, { page: 1, page_size: 20 });
    expect(repo.create).not.toHaveBeenCalled();
    expect(result.list[0]).not.toHaveProperty("profile");
    expect(result.list[0]).not.toHaveProperty("profileEncrypted");
  });
  it("isolates owner details", async () => {
    const { service } = setup();
    await expect(service.detail(7, 3)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.detail(7, 2)).profile.familyName).toBe("山本");
  });
  it("encrypts submission and does not verify it", async () => {
    const { repo, service } = setup();
    await service.create(2, { profile });
    expect(repo.decide).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, profileEncrypted: expect.any(String) })
    );
    const input = (repo.create as jest.Mock).mock.calls[0][0];
    expect(JSON.parse(cipher.open(input.profileEncrypted))).toEqual(profile);
  });
  it.each(["approved", "rejected"] as const)("blocks self review %s", async (status) => {
    const { service } = setup();
    await expect(
      service.decide(
        7,
        2,
        status,
        status === "approved"
          ? {
              expectedVersion: 1,
              reviewNote: "Checked external identity evidence",
              identityConfirmed: true
            }
          : { expectedVersion: 1, rejectionReason: "Unclear" }
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects stale and terminal decisions", async () => {
    const { service, record } = setup();
    await expect(
      service.decide(7, 3, "approved", {
        expectedVersion: 2,
        reviewNote: "Checked evidence",
        identityConfirmed: true
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    record.status = "withdrawn";
    await expect(
      service.decide(7, 3, "approved", {
        expectedVersion: 1,
        reviewNote: "Checked evidence",
        identityConfirmed: true
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("produces real verified identity fields using compatible holder hash and reviewer actor", async () => {
    const { service, repo } = setup();
    await service.decide(7, 3, "approved", {
      expectedVersion: 1,
      reviewNote: "Checked external identity evidence",
      identityConfirmed: true
    });
    const input = (repo.decide as jest.Mock).mock.calls[0][0];
    expect(input.actorId).toBe(3);
    expect(input.verification).toMatchObject({
      provider: "operations_manual",
      providerReference: "manual-application-7",
      status: "verified",
      expiresAt: null
    });
    expect(cipher.open(input.verification.verifiedNameEncrypted)).toBe("山本 太郎");
    expect(input.verification.nameMatchHash).toBe(
      cipher.matchHash(
        new BankAccountHolderService().normalizeForMatch("individual", "ヤマモト タロウ")
      )
    );
    expect(input.verification.verifiedAt).toBeInstanceOf(Date);
  });
  it("allows owner withdrawal but not another user", async () => {
    const { service } = setup();
    await expect(service.decide(7, 3, "withdrawn", { expectedVersion: 1 })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(service.decide(7, 2, "withdrawn", { expectedVersion: 1 })).resolves.toBeDefined();
  });
});
