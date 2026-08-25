import type { ContractCatalogPort } from "../src/services/contract-acceptance.service";
import {
  AffiliateIdentityActivationService,
  type AffiliateIdentityActivationRepositoryPort
} from "../src/services/affiliate-identity-activation.service";

const current = {
  type: "affiliate" as const,
  version: "affiliate-2026-08-26-v1",
  effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
  language: "zh-CN",
  text: "NeeDo 联盟营销规则及合同完整文本",
  contentHash: "a".repeat(64)
};

const createCatalog = (): jest.Mocked<ContractCatalogPort> => ({
  getCurrent: jest.fn(async (type, language) => {
    void type;
    void language;
    return current;
  })
});

const createRepository = (): jest.Mocked<AffiliateIdentityActivationRepositoryPort> => ({
  activateWithContractInTransaction: jest.fn(async (input) => ({
    contractAcceptance: {
      id: 91,
      contractType: "affiliate" as const,
      contractVersion: input.contract.version,
      contentHash: input.contract.contentHash,
      acceptedAt: input.acceptedAt,
      receiptId: "receipt-91"
    },
    identity: {
      identityId: 81,
      userId: input.userId,
      identityType: "scout",
      roleCode: "scout",
      scopeType: "global",
      scopeId: null
    }
  }))
});

const validInput = {
  userId: 7,
  contractVersion: current.version,
  contentHash: current.contentHash,
  language: "zh-CN",
  sessionId: "access-jti-7",
  hasRead: true,
  hasAgreed: true,
  acceptedAt: new Date("2026-08-26T05:00:00.000Z")
};

describe("AffiliateIdentityActivationService", () => {
  it("returns the requested-language current contract", async () => {
    const catalog = createCatalog();
    const service = new AffiliateIdentityActivationService(catalog, createRepository());
    await expect(service.getCurrentContract("zh-CN")).resolves.toEqual(current);
    expect(catalog.getCurrent).toHaveBeenCalledWith("affiliate", "zh-CN");
  });

  it("requires separate read and agree acknowledgements", async () => {
    const repository = createRepository();
    const service = new AffiliateIdentityActivationService(createCatalog(), repository);
    await expect(service.activate({ ...validInput, hasRead: false })).rejects.toMatchObject({
      message: "error.contract.acknowledgements_required",
      statusCode: 400
    });
    await expect(service.activate({ ...validInput, hasAgreed: false })).rejects.toMatchObject({
      message: "error.contract.acknowledgements_required",
      statusCode: 400
    });
    expect(repository.activateWithContractInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a stale version or content hash", async () => {
    const repository = createRepository();
    const service = new AffiliateIdentityActivationService(createCatalog(), repository);
    await expect(
      service.activate({ ...validInput, contractVersion: "affiliate-old" })
    ).rejects.toMatchObject({ message: "error.contract.version_conflict", statusCode: 409 });
    await expect(service.activate({ ...validInput, contentHash: "b".repeat(64) })).rejects.toMatchObject(
      { message: "error.contract.version_conflict", statusCode: 409 }
    );
  });

  it("passes the immutable contract snapshot into one atomic activation and no IP", async () => {
    const repository = createRepository();
    const service = new AffiliateIdentityActivationService(createCatalog(), repository);
    await expect(service.activate(validInput)).resolves.toMatchObject({
      identity: { identityType: "scout", roleCode: "scout" },
      contractAcceptance: { contractVersion: current.version }
    });
    const atomicInput = repository.activateWithContractInTransaction.mock.calls[0]?.[0];
    expect(atomicInput).toMatchObject({
      userId: 7,
      sessionId: "access-jti-7",
      acceptedAt: validInput.acceptedAt,
      contract: current
    });
    expect(atomicInput).not.toHaveProperty("ip");
    expect(atomicInput).not.toHaveProperty("ipAddress");
  });
});
