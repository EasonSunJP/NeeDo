import { createApplicationEkycPolicy } from "./application-ekyc-policy.factory";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { RealtimeRepository } from "../repositories/realtime.repository";
import { TechnicianApplicationReviewRepository } from "../repositories/technician-application-review.repository";
import { TechnicianResumeRepository } from "../repositories/technician-resume.repository";
import { TechnicianApplicationReviewService } from "../services/technician-application-review.service";
import { TechnicianResumeExportService } from "../services/technician-resume-export.service";

export const createTechnicianApplicationReviewServiceForRoutes = (
  dependencies: AppDependencies
): TechnicianApplicationReviewService =>
  dependencies.technicianApplicationReviewService ??
  new TechnicianApplicationReviewService(
    dependencies.technicianApplicationReviewRepository ??
      new TechnicianApplicationReviewRepository(),
    dependencies.realtimeRepository ?? new RealtimeRepository(),
    createApplicationEkycPolicy(dependencies)
  );

export const createTechnicianResumeExportServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): TechnicianResumeExportService => {
  if (dependencies.technicianResumeExportService) {
    return dependencies.technicianResumeExportService;
  }
  const repository =
    dependencies.technicianResumeRepository ??
    new TechnicianResumeRepository(config.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR);
  return new TechnicianResumeExportService(repository, repository, repository);
};
