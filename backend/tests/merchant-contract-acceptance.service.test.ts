import type { ContractCatalogPort } from "../src/services/contract-acceptance.service";
import {
  MerchantContractAcceptanceService,
  type MerchantContractAcceptanceRepositoryPort
} from "../src/services/merchant-contract-acceptance.service";

const contract = {
  type: "merchant" as const,
  version: "merchant-2026-08-26-v1",
  effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
  language: "zh-CN",
  text: "NeeDo 商户服务规则及合同完整文本",
  contentHash: "a".repeat(64)
};
const now = new Date("2026-08-26T05:00:00.000Z");

const createCatalog = (): jest.Mocked<ContractCatalogPort> => ({
  getCurrent: jest.fn(async (type, language) => {
    void type;
    void language;
    return contract;
  })
});

const createRepository = (): jest.Mocked<MerchantContractAcceptanceRepositoryPort> => ({
  acceptAndBindInTransaction: jest.fn(async (input) => ({
    id: 91,
    applicationId: input.applicationId,
    applicationVersion: input.expectedVersion + 1,
    contractType: "merchant" as const,
    contractVersion: input.contract.version,
    contentHash: input.contract.contentHash,
    acceptedAt: input.acceptedAt,
    receiptId: input.receiptId
  }))
});

const validInput = {
  userId: 7,
  applicationId: 41,
  expectedVersion: 3,
  contractVersion: contract.version,
  contentHash: contract.contentHash,
  language: "zh-CN",
  sessionId: "access-jti-7",
  hasRead: true,
  hasAgreed: true,
  acceptedAt: now
};

describe("MerchantContractAcceptanceService", () => {
  it("requires acknowledgements and the current immutable version/hash", async () => {
    const repository = createRepository();
    const service = new MerchantContractAcceptanceService(createCatalog(), repository);
    await expect(service.accept({ ...validInput, hasRead: false })).rejects.toMatchObject({
      message: "error.contract.acknowledgements_required"
    });
    await expect(service.accept({ ...validInput, contractVersion: "old" })).rejects.toMatchObject({
      message: "error.contract.version_conflict"
    });
    expect(repository.acceptAndBindInTransaction).not.toHaveBeenCalled();
  });

  it("binds the exact contract snapshot to the editable merchant application", async () => {
    const repository = createRepository();
    const service = new MerchantContractAcceptanceService(
      createCatalog(),
      repository,
      () => "receipt-91"
    );
    await expect(service.accept(validInput)).resolves.toMatchObject({
      id: 91,
      applicationId: 41,
      applicationVersion: 4,
      contractVersion: contract.version
    });
    expect(repository.acceptAndBindInTransaction).toHaveBeenCalledWith({
      userId: 7,
      applicationId: 41,
      expectedVersion: 3,
      sessionId: "access-jti-7",
      acceptedAt: now,
      receiptId: "receipt-91",
      contract
    });
  });
});
