import {
  ContractReceiptService,
  type ContractReceiptRepositoryPort
} from "../src/services/contract-receipt.service";

describe("ContractReceiptService", () => {
  it("returns only the authenticated owner's immutable receipt", async () => {
    const receipt = {
      receiptId: "receipt-91",
      identityApplicationId: null,
      contractType: "affiliate" as const,
      contractVersion: "affiliate-2026-08-26-v1",
      effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
      acceptedTextSnapshot: "NeeDo 联盟营销规则及合同完整文本",
      contentHash: "a".repeat(64),
      acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
      language: "zh-CN"
    };
    const repository: jest.Mocked<ContractReceiptRepositoryPort> = {
      findOwned: jest.fn().mockResolvedValue(receipt)
    };

    await expect(
      new ContractReceiptService(repository).getOwned({ userId: 7, receiptId: "receipt-91" })
    ).resolves.toEqual(receipt);
    expect(repository.findOwned).toHaveBeenCalledWith(7, "receipt-91");
  });

  it("does not reveal whether another user's receipt exists", async () => {
    const repository: jest.Mocked<ContractReceiptRepositoryPort> = {
      findOwned: jest.fn().mockResolvedValue(null)
    };

    await expect(
      new ContractReceiptService(repository).getOwned({ userId: 7, receiptId: "receipt-foreign" })
    ).rejects.toMatchObject({ statusCode: 404, message: "error.contract.receipt_not_found" });
  });
});
