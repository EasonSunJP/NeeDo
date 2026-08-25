import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { ContractType } from "./contract-acceptance.service";

export interface ContractReceiptRecord {
  receiptId: string;
  identityApplicationId: number | null;
  contractType: ContractType;
  contractVersion: string;
  effectiveAt: Date;
  acceptedTextSnapshot: string;
  contentHash: string;
  acceptedAt: Date;
  language: string;
}

export interface ContractReceiptRepositoryPort {
  findOwned: (userId: number, receiptId: string) => Promise<ContractReceiptRecord | null>;
}

export class ContractReceiptService {
  public constructor(private readonly repository: ContractReceiptRepositoryPort) {}

  public async getOwned(input: {
    userId: number;
    receiptId: string;
  }): Promise<ContractReceiptRecord> {
    const receipt = await this.repository.findOwned(input.userId, input.receiptId);
    if (!receipt) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.contract.receipt_not_found",
        statusCode: 404
      });
    }
    return receipt;
  }
}
