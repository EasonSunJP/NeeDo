import type { AppDependencies } from "../app";
import { PlatformMembershipRepository } from "../repositories/platform-membership.repository";
import { NdpExperienceCampaignRepository } from "../repositories/ndp-experience-campaign.repository";
import { UserGlobalPolicyRepository } from "../repositories/user-global-policy.repository";
import { NdpExperienceCampaignService } from "../services/ndp-experience-campaign.service";
import { PlatformMembershipService } from "../services/platform-membership.service";
import { UserGlobalPolicyService } from "../services/user-global-policy.service";
import { UserExperienceService } from "../services/user-experience.service";

export const createUserExperienceServiceForRoutes = (
  dependencies: AppDependencies
):
  | Pick<
      UserExperienceService,
      | "recordEvent"
      | "recordNdpConsumption"
      | "recordNdpReversal"
      | "recordMembershipRenewal"
      | "getSummary"
      | "listEntries"
    >
  | undefined => {
  if (dependencies.userExperienceService) return dependencies.userExperienceService;
  if (!dependencies.userExperienceRepository) return undefined;

  const membershipResolver =
    dependencies.platformMembershipResolverService ??
    new PlatformMembershipService(
      dependencies.platformMembershipRepository ?? new PlatformMembershipRepository()
    );

  return new UserExperienceService(
    dependencies.userExperienceRepository,
    membershipResolver,
    new UserGlobalPolicyService(
      dependencies.userGlobalPolicyRepository ?? new UserGlobalPolicyRepository()
    ),
    new NdpExperienceCampaignService(
      dependencies.ndpExperienceCampaignRepository ?? new NdpExperienceCampaignRepository()
    )
  );
};
