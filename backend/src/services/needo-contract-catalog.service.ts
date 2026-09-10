import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type { LegalDocumentLocale } from "../domain/legal-document";
import {
  LegalDocumentRepository,
  type LegalDocumentRepositoryPort
} from "../repositories/legal-document.repository";
import { AppError } from "../utils/app-error";
import type {
  ContractCatalogPort,
  ContractDefinition,
  ContractType
} from "./contract-acceptance.service";

const contractSlug: Record<ContractType, string> = {
  merchant: "merchant-agreement",
  affiliate: "affiliate-agreement"
};

export class NeedoContractCatalogService implements ContractCatalogPort {
  public constructor(
    private readonly repository: Pick<LegalDocumentRepositoryPort, "getCurrentBySlug"> =
      new LegalDocumentRepository()
  ) {}

  public async getCurrent(type: ContractType, language: string): Promise<ContractDefinition> {
    if (language !== "zh-CN" && language !== "ja" && language !== "en") {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.contract.language_not_supported",
        statusCode: 400
      });
    }
    const current = await this.repository.getCurrentBySlug(
      contractSlug[type],
      language as LegalDocumentLocale
    );
    if (!current) {
      throw new AppError({
        code: ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
        message: "error.contract.unavailable",
        statusCode: 404
      });
    }
    const date = current.publishedAt.toISOString().slice(0, 10);
    return {
      type,
      version: `${type}-${date}-v${current.version}`,
      effectiveAt: current.publishedAt,
      language,
      text: current.body,
      contentHash: createHash("sha256").update(current.body, "utf8").digest("hex")
    };
  }
}
