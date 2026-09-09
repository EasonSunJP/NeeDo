import { describe, expect, it } from "vitest";
import serviceEntrySource from "../../components/mobile/ServiceCard.tsx?raw";
import baseEntrySource from "../info-card/BaseInfoCard.tsx?raw";
import shopEntrySource from "../info-card/ShopInfoCard.tsx?raw";
import technicianEntrySource from "../info-card/TechnicianInfoCard.tsx?raw";
import membershipEntrySource from "../profile-card/PlatformMembershipSimpleCard.tsx?raw";
import socialEntrySource from "../profile-card/SocialProfileMiniCard.tsx?raw";
import showcaseEntrySource from "../profile-card/TechnicianShowcaseCard.tsx?raw";
import simpleEntrySource from "../profile-card/UnifiedSimpleProfileCard.tsx?raw";

describe("simplified information-card entry points", () => {
  it("routes simple information cards and chat business cards through the unified card system", () => {
    expect(serviceEntrySource).toContain("SocialProfileMiniCard");
    expect(baseEntrySource).toContain("SocialProfileMiniCard");
    expect(shopEntrySource).toContain("UnifiedSimpleProfileCard");
    expect(technicianEntrySource).toContain("UnifiedSimpleProfileCard");
    expect(simpleEntrySource).toContain("SocialProfileMiniCard");
    expect(socialEntrySource).toContain("UnifiedEntityInfoCard");
    expect(socialEntrySource).toContain("UnifiedServiceInfoCard");
    expect(showcaseEntrySource).not.toContain("UnifiedEntityInfoCard");
    expect(showcaseEntrySource).toContain("aspect-[3/4]");
    expect(membershipEntrySource).toContain("UnifiedEntityInfoCard");
  });

  it("keeps retired standalone visual skeletons out of compatibility entries", () => {
    const compatibilitySources = [
      baseEntrySource,
      membershipEntrySource,
    ].join("\n");
    expect(compatibilitySources).not.toContain("aspect-[3/4]");
    expect(compatibilitySources).not.toContain("renderCompactCard");
    expect(compatibilitySources).not.toContain("renderNearListCard");
    expect(compatibilitySources).not.toContain("simpleTopColor ??");
    expect(compatibilitySources).not.toContain("simpleBottomColor ??");
  });
});
