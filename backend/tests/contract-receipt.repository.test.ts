import type { PrismaClient } from "@prisma/client";
import { ContractReceiptRepository } from "../src/repositories/contract-receipt.repository";

describe("ContractReceiptRepository", () => {
  it("queries by receipt and authenticated owner without exposing session evidence or IP", async () => {
    const contractAcceptance = {
      findFirst: jest.fn().mockResolvedValue({
        receiptId: "receipt-91",
        identityApplicationId: null,
        contractType: "affiliate",
        contractVersion: "affiliate-2026-08-26-v1",
        effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
        acceptedTextSnapshot: "contract",
        contentHash: "a".repeat(64),
        acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
        language: "zh-CN"
      })
    };
    const repository = new ContractReceiptRepository({
      contractAcceptance
    } as unknown as PrismaClient);

    await expect(repository.findOwned(7, "receipt-91")).resolves.toMatchObject({
      receiptId: "receipt-91",
      contractType: "affiliate"
    });
    expect(contractAcceptance.findFirst).toHaveBeenCalledWith({
      where: { receiptId: "receipt-91", acceptedByUserId: 7, deletedAt: null },
      select: {
        receiptId: true,
        identityApplicationId: true,
        contractType: true,
        contractVersion: true,
        effectiveAt: true,
        acceptedTextSnapshot: true,
        contentHash: true,
        acceptedAt: true,
        language: true
      }
    });
  });
});
