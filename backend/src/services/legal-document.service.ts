import {
  LEGAL_DOCUMENT_LOCALES,
  type LegalDocumentCatalogRecord,
  type LegalDocumentLocale
} from "../domain/legal-document";
import type {
  LegalDocumentMutationResult,
  LegalDocumentRepositoryPort
} from "../repositories/legal-document.repository";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { buildPaginatedResponse, toPrismaPagination, type PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export { buildLegalDocumentContentHash } from "../domain/legal-document";

export interface CreateLegalDocumentInput {
  slug: string;
  name: string;
  internalPath: string;
  displayLocations: string[];
  isEnabled: boolean;
}

export interface UpdateLegalDocumentMetadataInput extends Omit<CreateLegalDocumentInput, "slug"> {
  expectedLockVersion: number;
}

export interface SaveLegalDocumentDraftInput {
  expectedLockVersion: number | null;
  title: string;
  body: string;
}

export interface PublishLegalDocumentInput {
  expectedDraftLockVersion: number;
  publishedAt: Date;
  setEnabled?: boolean;
}

export class LegalDocumentService {
  public constructor(
    private readonly repository: LegalDocumentRepositoryPort,
    private readonly auditInputFactory: Pick<AuditLogService, "createInput">
  ) {}

  public async list(actor: AuthenticatedAccessContext, pagination: PaginationInput) {
    this.assertOperationsIdentity(actor);
    const normalized = toPrismaPagination(pagination);
    const result = await this.repository.list(normalized);
    return buildPaginatedResponse(
      result.list.map((document) => this.catalogView(document)),
      result.total,
      normalized
    );
  }

  public async create(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: CreateLegalDocumentInput
  ) {
    this.assertOperationsIdentity(actor);
    const normalized = this.normalizeDocumentInput(input);
    return this.catalogView(this.unwrap(
      await this.repository.createWithAudit({
        actorUserId: actor.userId,
        document: normalized,
        audit: this.auditInputFactory.createInput({
          actor,
          context,
          action: "backoffice.legal_document.created",
          targetType: "LegalDocument",
          metadata: {
            slug: normalized.slug,
            internalPath: normalized.internalPath,
            displayLocations: normalized.displayLocations,
            isEnabled: normalized.isEnabled
          }
        })
      })
    ));
  }

  public async updateMetadata(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: UpdateLegalDocumentMetadataInput
  ) {
    this.assertOperationsIdentity(actor);
    this.assertVersion(input.expectedLockVersion);
    const normalized = this.normalizeDocumentInput({ slug: "valid", ...input });
    return this.catalogView(this.unwrap(
      await this.repository.updateMetadataWithAudit({
        publicId,
        expectedLockVersion: input.expectedLockVersion,
        actorUserId: actor.userId,
        changes: {
          name: normalized.name,
          internalPath: normalized.internalPath,
          displayLocations: normalized.displayLocations,
          isEnabled: normalized.isEnabled
        },
        audit: this.auditInputFactory.createInput({
          actor,
          context,
          action: "backoffice.legal_document.metadata_updated",
          targetType: "LegalDocument",
          metadata: {
            publicId,
            expectedLockVersion: input.expectedLockVersion,
            changedFields: ["name", "internalPath", "displayLocations", "isEnabled"]
          }
        })
      })
    ));
  }

  public async getLocale(
    actor: AuthenticatedAccessContext,
    publicId: string,
    localeValue: string
  ) {
    this.assertOperationsIdentity(actor);
    const locale = this.locale(localeValue);
    const document = await this.requireDocument(publicId);
    const value = await this.repository.getLocale(document.id, locale);
    return { publicId, locale, ...value };
  }

  public async saveDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    localeValue: string,
    input: SaveLegalDocumentDraftInput
  ) {
    this.assertOperationsIdentity(actor);
    const locale = this.locale(localeValue);
    this.assertDraft(input);
    return this.unwrap(
      await this.repository.saveDraftWithAudit({
        publicId,
        locale,
        expectedLockVersion: input.expectedLockVersion,
        actorUserId: actor.userId,
        title: input.title.trim(),
        body: input.body,
        audit: this.auditInputFactory.createInput({
          actor,
          context,
          action: "backoffice.legal_document.draft_saved",
          targetType: "LegalDocument",
          metadata: { publicId, locale, expectedLockVersion: input.expectedLockVersion }
        })
      })
    );
  }

  public async publish(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    localeValue: string,
    input: PublishLegalDocumentInput
  ) {
    this.assertOperationsIdentity(actor);
    const locale = this.locale(localeValue);
    this.assertVersion(input.expectedDraftLockVersion);
    if (!(input.publishedAt instanceof Date) || Number.isNaN(input.publishedAt.getTime())) {
      throw this.validationError("error.validation");
    }
    return this.unwrap(
      await this.repository.publishWithAudit({
        publicId,
        locale,
        expectedDraftLockVersion: input.expectedDraftLockVersion,
        actorUserId: actor.userId,
        publishedAt: input.publishedAt,
        ...(input.setEnabled === undefined ? {} : { setEnabled: input.setEnabled }),
        audit: this.auditInputFactory.createInput({
          actor,
          context,
          action: "backoffice.legal_document.published",
          targetType: "LegalDocument",
          metadata: {
            publicId,
            locale,
            expectedDraftLockVersion: input.expectedDraftLockVersion,
            publishedAt: input.publishedAt.toISOString(),
            ...(input.setEnabled === undefined ? {} : { setEnabled: input.setEnabled })
          }
        })
      })
    );
  }

  public async listReleases(
    actor: AuthenticatedAccessContext,
    publicId: string,
    localeValue: string,
    pagination: PaginationInput
  ) {
    this.assertOperationsIdentity(actor);
    const locale = this.locale(localeValue);
    const document = await this.requireDocument(publicId);
    const normalized = toPrismaPagination(pagination);
    const result = await this.repository.listReleases({
      documentId: document.id,
      locale,
      skip: normalized.skip,
      take: normalized.take
    });
    return buildPaginatedResponse(result.list, result.total, normalized);
  }

  public async getPublicCurrent(slugValue: string, localeValue: string) {
    const slug = this.normalizeSlug(slugValue);
    const locale = this.locale(localeValue);
    const current = await this.repository.getCurrentBySlug(slug, locale);
    if (!current) {
      throw new AppError({
        code: ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
        message: "error.legal_document.unavailable",
        statusCode: 404
      });
    }
    return {
      publicId: current.publicId,
      slug: current.slug,
      internalPath: current.internalPath,
      displayLocations: current.displayLocations,
      locale: current.locale,
      version: current.version,
      title: current.title,
      body: current.body,
      contentHash: current.contentHash,
      publishedAt: current.publishedAt
    };
  }

  private async requireDocument(publicId: string) {
    const document = await this.repository.getByPublicId(publicId);
    if (document) return document;
    throw new AppError({
      code: ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
      message: "error.legal_document.not_found",
      statusCode: 404
    });
  }

  private catalogView(document: LegalDocumentCatalogRecord) {
    return {
      publicId: document.publicId,
      slug: document.slug,
      name: document.name,
      internalPath: document.internalPath,
      displayLocations: document.displayLocations,
      isEnabled: document.isEnabled,
      lockVersion: document.lockVersion,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt
    };
  }

  private unwrap<T>(result: LegalDocumentMutationResult<T>): T {
    if (result.kind === "ok") return result.value;
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
        message: "error.legal_document.not_found",
        statusCode: 404
      });
    }
    throw new AppError({
      code: ERROR_CODES.LEGAL_DOCUMENT_VERSION_CONFLICT,
      message:
        result.kind === "slug_conflict"
          ? "error.legal_document.slug_conflict"
          : "error.legal_document.version_conflict",
      statusCode: 409
    });
  }

  private normalizeDocumentInput(input: CreateLegalDocumentInput): CreateLegalDocumentInput {
    const slug = this.normalizeSlug(input.slug);
    const name = input.name.trim();
    if (!name || name.length > 160) throw this.validationError("error.validation");
    const internalPath = input.internalPath.trim();
    if (
      !/^\/(?!\/)[A-Za-z0-9/_?=&.-]*$/u.test(internalPath) ||
      internalPath.includes("..") ||
      internalPath.includes("\\")
    ) {
      throw this.validationError("error.legal_document.internal_path_invalid");
    }
    const displayLocations = [...new Set(input.displayLocations.map((value) => value.trim()))];
    if (
      displayLocations.length > 30 ||
      displayLocations.some((value) => !/^[a-z][a-z0-9_-]{0,63}$/u.test(value))
    ) {
      throw this.validationError("error.validation");
    }
    return { slug, name, internalPath, displayLocations, isEnabled: input.isEnabled };
  }

  private normalizeSlug(value: string): string {
    const slug = value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 120) {
      throw this.validationError("error.validation");
    }
    return slug;
  }

  private assertDraft(input: SaveLegalDocumentDraftInput): void {
    if (input.expectedLockVersion !== null) this.assertVersion(input.expectedLockVersion);
    if (!input.title.trim() || input.title.trim().length > 240 || !input.body.trim()) {
      throw this.validationError("error.validation");
    }
  }

  private locale(value: string): LegalDocumentLocale {
    if ((LEGAL_DOCUMENT_LOCALES as readonly string[]).includes(value)) {
      return value as LegalDocumentLocale;
    }
    throw this.validationError("error.legal_document.locale_not_supported");
  }

  private assertVersion(value: number): void {
    if (!Number.isInteger(value) || value < 1) throw this.validationError("error.validation");
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform") return;
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private validationError(message: string): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode: 400 });
  }
}
