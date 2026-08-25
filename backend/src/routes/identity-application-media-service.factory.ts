import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { IdentityApplicationMediaRepository } from "../repositories/identity-application-media.repository";
import { IdentityApplicationMediaFileStorage } from "../services/identity-application-media.storage";
import { IdentityApplicationMediaService } from "../services/identity-application-media.service";

export const createIdentityApplicationMediaServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): IdentityApplicationMediaService =>
  dependencies.identityApplicationMediaService ??
  new IdentityApplicationMediaService(
    dependencies.identityApplicationMediaRepository ?? new IdentityApplicationMediaRepository(),
    dependencies.identityApplicationMediaStorage ??
      new IdentityApplicationMediaFileStorage(config.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR)
  );
