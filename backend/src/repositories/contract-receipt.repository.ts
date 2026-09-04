import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ContractReceiptRecord,
  ContractReceiptRepositoryPort
} from "../services/contract-receipt.service";

export class ContractReceiptRepository implements ContractReceiptRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findOwned(userId: number, receiptId: string): Promise<ContractReceiptRecord | null> {
    const receipt = await this.client.contractAcceptance.findFirst({
      where: { receiptId, acceptedByUserId: userId, deletedAt: null },
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
    if (!receipt || (receipt.contractType !== "merchant" && receipt.contractType !== "affiliate")) {
      return null;
    }
    return {
      ...receipt,
      contractType: receipt.contractType
    };
  }
}
