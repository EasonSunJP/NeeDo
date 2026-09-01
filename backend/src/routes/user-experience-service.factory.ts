import type { AppDependencies } from "../app";
import { PlatformMembershipRepository } from "../repositories/platform-membership.repository";
import { PlatformMembershipService } from "../services/platform-membership.service";
import { UserExperienceService } from "../services/user-experience.service";

export const createUserExperienceServiceForRoutes = (
  dependencies: AppDependencies
): Pick<UserExperienceService, "recordEvent" | "getSummary" | "listEntries"> | undefined => {
  if (dependencies.userExperienceService) return dependencies.userExperienceService;
  if (!dependencies.userExperienceRepository) return undefined;

  const membershipResolver =
    dependencies.platformMembershipResolverService ??
    new PlatformMembershipService(
      dependencies.platformMembershipRepository ?? new PlatformMembershipRepository()
    );

  return new UserExperienceService(
    dependencies.userExperienceRepository,
    membershipResolver
  );
};
