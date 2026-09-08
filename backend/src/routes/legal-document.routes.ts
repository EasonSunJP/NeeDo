import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { LEGAL_DOCUMENT_PERMISSIONS } from "../constants/permissions.constants";
import { LegalDocumentController } from "../controllers/legal-document.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { LegalDocumentRepository } from "../repositories/legal-document.repository";
import { AuditLogService } from "../services/audit-log.service";
import { LegalDocumentService } from "../services/legal-document.service";
import {
  legalDocumentCreateBodySchema,
  legalDocumentDraftBodySchema,
  legalDocumentListQuerySchema,
  legalDocumentLocaleParamSchema,
  legalDocumentMetadataBodySchema,
  legalDocumentPublicIdParamSchema,
  legalDocumentPublishBodySchema,
  publicLegalDocumentParamSchema,
  publicLegalDocumentQuerySchema
} from "../validators/legal-document.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createLegalDocumentRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const repository = dependencies.legalDocumentRepository ?? new LegalDocumentRepository();
  const service =
    dependencies.legalDocumentService ??
    new LegalDocumentService(
      repository,
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const controller = new LegalDocumentController(service);
  const read = [authenticate(), createAuthorizeMiddleware(LEGAL_DOCUMENT_PERMISSIONS.read)];
  const write = [authenticate(), createAuthorizeMiddleware(LEGAL_DOCUMENT_PERMISSIONS.write)];
  const publish = [authenticate(), createAuthorizeMiddleware(LEGAL_DOCUMENT_PERMISSIONS.publish)];

  router.get(
    "/legal-documents/:slug/current",
    validateRequest({ params: publicLegalDocumentParamSchema, query: publicLegalDocumentQuerySchema }),
    controller.getPublicCurrent
  );
  router.get(
    "/backoffice/legal-documents",
    ...read,
    validateRequest({ query: legalDocumentListQuerySchema }),
    controller.list
  );
  router.post(
    "/backoffice/legal-documents",
    ...write,
    validateRequest({ body: legalDocumentCreateBodySchema }),
    controller.create
  );
  router.patch(
    "/backoffice/legal-documents/:publicId",
    ...write,
    validateRequest({ params: legalDocumentPublicIdParamSchema, body: legalDocumentMetadataBodySchema }),
    controller.updateMetadata
  );
  router.get(
    "/backoffice/legal-documents/:publicId/locales/:locale",
    ...read,
    validateRequest({ params: legalDocumentLocaleParamSchema }),
    controller.getLocale
  );
  router.put(
    "/backoffice/legal-documents/:publicId/locales/:locale/draft",
    ...write,
    validateRequest({ params: legalDocumentLocaleParamSchema, body: legalDocumentDraftBodySchema }),
    controller.saveDraft
  );
  router.post(
    "/backoffice/legal-documents/:publicId/locales/:locale/publish",
    ...publish,
    validateRequest({ params: legalDocumentLocaleParamSchema, body: legalDocumentPublishBodySchema }),
    controller.publish
  );
  router.get(
    "/backoffice/legal-documents/:publicId/locales/:locale/releases",
    ...read,
    validateRequest({ params: legalDocumentLocaleParamSchema, query: legalDocumentListQuerySchema }),
    controller.listReleases
  );
  return router;
};
