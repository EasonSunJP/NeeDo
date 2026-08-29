export interface CustomerMembershipState {
  membershipLevel: string;
  membershipGrantMode: string;
  membershipStartsAt: Date | null;
  membershipExpiresAt: Date | null;
}

export const resolveEffectiveCustomerMembershipLevel = (
  membership: CustomerMembershipState,
  now = new Date()
): string => {
  if (membership.membershipGrantMode !== "OPERATOR_COMPLIMENTARY") {
    return membership.membershipLevel;
  }
  if (!membership.membershipStartsAt || membership.membershipStartsAt.getTime() > now.getTime()) {
    return "standard";
  }
  if (membership.membershipExpiresAt && membership.membershipExpiresAt.getTime() <= now.getTime()) {
    return "standard";
  }
  return membership.membershipLevel;
};
