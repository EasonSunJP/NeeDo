import type { PlatformMembershipBenefitCodeValue } from "../domain/platform-membership";

export type MembershipBenefitDeliveryCapability = "available" | "unavailable";

export interface MembershipBenefitCapabilityAdapter {
  readonly capability: MembershipBenefitDeliveryCapability;
}

const available: MembershipBenefitCapabilityAdapter = { capability: "available" };
const unavailable: MembershipBenefitCapabilityAdapter = { capability: "unavailable" };

const productionCapabilities: Readonly<
  Record<PlatformMembershipBenefitCodeValue, MembershipBenefitCapabilityAdapter>
> = {
  ndp_experience: available,
  member_sign_in: available,
  priority_request: available,
  support_service: unavailable,
  exclusive_discount: unavailable,
  member_day: unavailable,
  birthday_gift: unavailable
};

export class MembershipBenefitCapabilityService {
  public constructor(
    private readonly adapters: Readonly<
      Partial<Record<PlatformMembershipBenefitCodeValue, MembershipBenefitCapabilityAdapter>>
    > = productionCapabilities
  ) {}

  public resolve(code: PlatformMembershipBenefitCodeValue): MembershipBenefitDeliveryCapability {
    return this.adapters[code]?.capability ?? "unavailable";
  }
}
