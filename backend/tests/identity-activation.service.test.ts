import {
  IdentityActivationService,
  type ActivatedIdentityRecord,
  type IdentityActivationRepositoryPort
} from "../src/services/identity-activation.service";

const activeIdentity = (overrides: Partial<ActivatedIdentityRecord> = {}): ActivatedIdentityRecord => ({
  identityId: 91,
  userId: 3,
  identityType: "technician",
  roleCode: "technician",
  scopeType: "technician_profile",
  scopeId: 21,
  ...overrides
});

const createRepository = (): jest.Mocked<IdentityActivationRepositoryPort> => ({
  findActiveIdentity: jest.fn().mockResolvedValue(null),
  activateInTransaction: jest.fn(async (input) =>
    activeIdentity({
      userId: input.userId,
      identityType: input.identityType,
      roleCode: input.roleCode,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    })
  )
});

describe("IdentityActivationService", () => {
  it.each([
    ["technician", "technician", "technician", "technician_profile", 21],
    ["merchant", "merchant_owner", "merchant_owner", "shop", 31],
    ["affiliate", "scout", "scout", "global", null]
  ] as const)(
    "maps %s activation to its formal identity, role, and scope",
    async (kind, identityType, roleCode, scopeType, scopeId) => {
      const repository = createRepository();
      const service = new IdentityActivationService(repository);

      await service.activate({
        kind,
        userId: 3,
        actorUserId: 8,
        displayName: "山本太郎",
        scopeId,
        applicationId: kind === "affiliate" ? null : 11,
        contractAcceptanceId: kind === "affiliate" ? 14 : null,
        activatedAt: new Date("2026-08-26T05:00:00.000Z")
      });

      expect(repository.activateInTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 3,
          actorUserId: 8,
          identityType,
          roleCode,
          scopeType,
          scopeId,
          notificationPayload: expect.objectContaining({ identityKind: kind }),
          auditMetadata: expect.objectContaining({
            applicationId: kind === "affiliate" ? null : 11,
            contractAcceptanceId: kind === "affiliate" ? 14 : null
          })
        })
      );
    }
  );

  it("returns an existing active identity without duplicate role or notification writes", async () => {
    const repository = createRepository();
    repository.findActiveIdentity.mockResolvedValue(activeIdentity());
    const service = new IdentityActivationService(repository);

    await expect(
      service.activate({
        kind: "technician",
        userId: 3,
        actorUserId: 8,
        displayName: "山本太郎",
        scopeId: 21,
        applicationId: 11,
        contractAcceptanceId: null,
        activatedAt: new Date("2026-08-26T05:00:00.000Z")
      })
    ).resolves.toEqual(activeIdentity());
    expect(repository.activateInTransaction).not.toHaveBeenCalled();
  });

  it.each(["technician", "merchant"] as const)("requires a scope for %s activation", async (kind) => {
    const service = new IdentityActivationService(createRepository());

    await expect(
      service.activate({
        kind,
        userId: 3,
        actorUserId: 8,
        displayName: "山本太郎",
        scopeId: null,
        applicationId: 11,
        contractAcceptanceId: null,
        activatedAt: new Date("2026-08-26T05:00:00.000Z")
      })
    ).rejects.toMatchObject({
      message: "error.identity_activation.scope_required",
      statusCode: 400
    });
  });
});
