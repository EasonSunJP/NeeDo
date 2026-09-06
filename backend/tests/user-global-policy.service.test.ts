import type { UserGlobalPolicyRepositoryPort } from "../src/domain/user-global-policy";
import { UserGlobalPolicyService } from "../src/services/user-global-policy.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const actor: AuthenticatedAccessContext = {
  userId: 7,
  email: "operator@needo.local",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 1,
  currentIdentityScopeType: "platform",
  roles: ["operator"],
  permissions: []
};

const context = { ip: "127.0.0.1", userAgent: "jest" };
const defaults = {
  requirePhone: false,
  requireEmail: false,
  requireHomeServiceEkyc: false,
  requireStoreServiceEkyc: false,
  requireMerchantApplicationEkyc: false,
  requireTechnicianApplicationEkyc: false,
  ndpPerBaseExp: 100,
  baseExpUnitsPerThreshold: 10_000
};

const makeRepository = () =>
  ({
    resolvePolicyAt: jest.fn(async () => ({
      versionPublicId: "policy-v1",
      version: 1,
      status: "published" as const,
      lockVersion: 1,
      ...defaults,
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
      publishedAt: new Date("2026-01-01T00:00:00Z")
    })),
    getCurrentAndDraft: jest.fn(async () => ({
      current: null,
      draft: {
        versionPublicId: "policy-v2",
        version: 2,
        status: "draft" as const,
        lockVersion: 1,
        ...defaults,
        effectiveFrom: new Date("2026-09-02T00:00:00Z"),
        effectiveTo: null,
        publishedAt: null
      }
    })),
    saveDraftWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const })),
    publishDraftWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const }))
  }) as unknown as jest.Mocked<UserGlobalPolicyRepositoryPort>;

describe("UserGlobalPolicyService", () => {
  it("publishes a saved draft immediately using server time after its intended time has elapsed", async () => {
    const repository = makeRepository();
    const now = new Date("2026-09-03T00:00:00Z");
    const snapshot = await repository.getCurrentAndDraft(now);
    repository.publishDraftWithAudit.mockResolvedValue({ kind: "published", value: { ...snapshot.draft!, status: "published", effectiveFrom: now, publishedAt: now } });
    const auditFactory = { createInput: jest.fn(input => input) };
    const service = new UserGlobalPolicyService(repository, auditFactory as never, () => now);
    await expect(service.publishDraft(actor, context, { expectedVersion: 2, expectedLockVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.publishDraft(actor, context, { expectedVersion: 2, expectedLockVersion: 1, effectiveImmediately: true })).resolves.toMatchObject({ effectiveFrom: now });
    expect(repository.publishDraftWithAudit).toHaveBeenCalledWith(expect.objectContaining({ publishedAt: now, effectiveImmediately: true }));
    expect(auditFactory.createInput).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ effectiveFrom: now.toISOString(), effectiveImmediately: true }) }));
  });

  it("resolves the published V1 default policy at an arbitrary timestamp", async () => {
    const repository = makeRepository();
    const service = new UserGlobalPolicyService(repository);
    const occurredAt = new Date("2026-09-01T00:00:00Z");

    await expect(service.resolvePolicyAt(occurredAt)).resolves.toMatchObject(defaults);
    expect(repository.resolvePolicyAt).toHaveBeenCalledWith(occurredAt);
  });

  it("returns the future scheduled policy only after its effective instant", async () => {
    const repository = makeRepository();
    repository.resolvePolicyAt.mockResolvedValueOnce({
      versionPublicId: "policy-v2",
      version: 2,
      status: "published",
      lockVersion: 2,
      ...defaults,
      requirePhone: true,
      effectiveFrom: new Date("2026-12-01T00:00:00Z"),
      effectiveTo: null,
      publishedAt: new Date("2026-11-01T00:00:00Z")
    });
    const service = new UserGlobalPolicyService(repository);

    await expect(service.resolvePolicyAt(new Date("2026-12-01T00:00:00Z"))).resolves.toMatchObject({
      version: 2,
      requirePhone: true
    });
  });

  it("maps a stale draft publication to HTTP 409", async () => {
    const service = new UserGlobalPolicyService(
      makeRepository(),
      {
        createInput: jest.fn((input) => input)
      } as never,
      () => new Date("2026-09-01T00:00:00Z")
    );

    await expect(
      service.publishDraft(actor, context, {
        expectedVersion: 2,
        expectedLockVersion: 1
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("publishes only future-effective drafts and keeps audit metadata free of contact data", async () => {
    const repository = makeRepository();
    repository.publishDraftWithAudit.mockResolvedValueOnce({
      kind: "published",
      value: {
        versionPublicId: "policy-v2",
        version: 2,
        status: "published",
        lockVersion: 2,
        ...defaults,
        requireEmail: true,
        effectiveFrom: new Date("2026-09-02T00:00:00Z"),
        effectiveTo: null,
        publishedAt: new Date("2026-09-01T00:00:00Z")
      }
    });
    const auditFactory = { createInput: jest.fn((input) => input) };
    const service = new UserGlobalPolicyService(
      repository,
      auditFactory as never,
      () => new Date("2026-09-01T00:00:00Z")
    );

    await service.publishDraft(actor, context, { expectedVersion: 2, expectedLockVersion: 1 });

    const auditInput = auditFactory.createInput.mock.calls[0]?.[0];
    expect(JSON.stringify(auditInput?.metadata)).not.toContain(actor.email);
    expect(JSON.stringify(auditInput?.metadata)).not.toContain("email");
  });
});
