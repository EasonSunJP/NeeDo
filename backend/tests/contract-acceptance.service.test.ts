import {
  ContractAcceptanceService,
  type ContractAcceptanceRecord,
  type ContractAcceptanceRepositoryPort,
  type ContractCatalogPort
} from "../src/services/contract-acceptance.service";

const definition = {
  type: "affiliate" as const,
  version: "affiliate-2026-08-26-v1",
  effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
  language: "zh",
  text: "NeeDo联盟营销规则及合同全文",
  contentHash: "a".repeat(64)
};

const record = (): ContractAcceptanceRecord => ({
  id: 10,
  acceptedByUserId: 3,
  identityApplicationId: null,
  contractType: "affiliate",
  contractVersion: definition.version,
  effectiveAt: definition.effectiveAt,
  acceptedTextSnapshot: definition.text,
  contentHash: definition.contentHash,
  acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
  language: "zh",
  sessionId: "session-3",
  receiptId: "receipt-10",
  acceptanceKey: `3:affiliate:${definition.version}`
});

const createCatalog = (): jest.Mocked<ContractCatalogPort> => ({
  getCurrent: jest.fn().mockResolvedValue(definition)
});

const createRepository = (): jest.Mocked<ContractAcceptanceRepositoryPort> => ({
  findByAcceptanceKey: jest.fn().mockResolvedValue(null),
  create: jest.fn(async (input: Parameters<ContractAcceptanceRepositoryPort["create"]>[0]) => ({
    ...record(),
    ...input
  }))
});

describe("ContractAcceptanceService", () => {
  it("returns the server-owned current contract definition", async () => {
    const service = new ContractAcceptanceService(createCatalog(), createRepository());

    await expect(service.getCurrent("affiliate", "zh")).resolves.toEqual(definition);
  });

  it("requires explicit read and agreement acknowledgements", async () => {
    const service = new ContractAcceptanceService(createCatalog(), createRepository());
    const base = {
      userId: 3,
      contractType: "affiliate" as const,
      contractVersion: definition.version,
      contentHash: definition.contentHash,
      language: "zh",
      sessionId: "session-3",
      acceptedAt: new Date("2026-08-26T05:00:00.000Z")
    };

    await expect(service.accept({ ...base, hasRead: false, hasAgreed: true })).rejects.toMatchObject({
      message: "error.contract.acknowledgements_required",
      statusCode: 400
    });
    await expect(service.accept({ ...base, hasRead: true, hasAgreed: false })).rejects.toMatchObject({
      message: "error.contract.acknowledgements_required",
      statusCode: 400
    });
  });

  it("rejects stale contract versions and hashes", async () => {
    const service = new ContractAcceptanceService(createCatalog(), createRepository());
    const base = {
      userId: 3,
      contractType: "affiliate" as const,
      language: "zh",
      sessionId: "session-3",
      acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
      hasRead: true,
      hasAgreed: true
    };

    await expect(
      service.accept({ ...base, contractVersion: "old", contentHash: definition.contentHash })
    ).rejects.toMatchObject({ message: "error.contract.version_conflict", statusCode: 409 });
    await expect(
      service.accept({ ...base, contractVersion: definition.version, contentHash: "b".repeat(64) })
    ).rejects.toMatchObject({ message: "error.contract.version_conflict", statusCode: 409 });
  });

  it("stores the exact server snapshot and authenticated session without IP", async () => {
    const repository = createRepository();
    const service = new ContractAcceptanceService(createCatalog(), repository, () => "receipt-10");

    await service.accept({
      userId: 3,
      identityApplicationId: null,
      contractType: "affiliate",
      contractVersion: definition.version,
      contentHash: definition.contentHash,
      language: "zh",
      sessionId: "session-3",
      acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
      hasRead: true,
      hasAgreed: true
    });

    const saved = repository.create.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      acceptedByUserId: 3,
      acceptedTextSnapshot: definition.text,
      contentHash: definition.contentHash,
      receiptId: "receipt-10",
      sessionId: "session-3"
    });
    expect(saved).not.toHaveProperty("ip");
    expect(saved).not.toHaveProperty("ipAddress");
  });

  it("returns the existing immutable acceptance for a repeated submit", async () => {
    const repository = createRepository();
    repository.findByAcceptanceKey.mockResolvedValue(record());
    const service = new ContractAcceptanceService(createCatalog(), repository);

    await expect(
      service.accept({
        userId: 3,
        contractType: "affiliate",
        contractVersion: definition.version,
        contentHash: definition.contentHash,
        language: "zh",
        sessionId: "session-3",
        acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
        hasRead: true,
        hasAgreed: true
      })
    ).resolves.toEqual(record());
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("scopes merchant acceptances to the application", async () => {
    const merchantDefinition = { ...definition, type: "merchant" as const };
    const catalog = createCatalog();
    catalog.getCurrent.mockResolvedValue(merchantDefinition);
    const repository = createRepository();
    const service = new ContractAcceptanceService(catalog, repository, () => "receipt-11");

    await service.accept({
      userId: 3,
      identityApplicationId: 44,
      contractType: "merchant",
      contractVersion: definition.version,
      contentHash: definition.contentHash,
      language: "zh",
      sessionId: "session-3",
      acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
      hasRead: true,
      hasAgreed: true
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ acceptanceKey: `3:merchant:${definition.version}:application:44` })
    );
  });
});
