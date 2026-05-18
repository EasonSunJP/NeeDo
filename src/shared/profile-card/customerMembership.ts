export type SocialProfileMiniMembershipKind = "gold" | "diamond" | "black";
export type ResolvedCustomerMembership = {
  label: string;
  kind?: SocialProfileMiniMembershipKind;
};
export type CustomerMembershipIconDefinition = {
  alt: string;
  src: string;
};

export const customerMembershipIcons: Record<SocialProfileMiniMembershipKind, CustomerMembershipIconDefinition> = {
  gold: {
    alt: "Gold membership",
    src: "/icons/membership/needo-gold-membership-folder-icon-512.png"
  },
  diamond: {
    alt: "Diamond membership",
    src: "/icons/membership/needo-diamond-membership-folder-icon-512.png"
  },
  black: {
    alt: "Black card membership",
    src: "/icons/membership/needo-black-diamond-membership-folder-icon-512.png"
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function resolveCustomerMembership(memberLevel?: string): ResolvedCustomerMembership {
  const normalized = (memberLevel ?? "").toLowerCase();

  if (normalized.includes("black") || normalized.includes("黑卡") || normalized.includes("黑钻") || normalized.includes("黑鑽")) {
    return { label: "黑卡会员", kind: "black" };
  }

  if (normalized.includes("platinum") || normalized.includes("diamond") || normalized.includes("钻石") || normalized.includes("鑽石") || normalized.includes("白金")) {
    return { label: "钻石会员", kind: "diamond" };
  }

  if (
    normalized.includes("gold") ||
    normalized.includes("silver") ||
    normalized.includes("黄金") ||
    normalized.includes("金卡") ||
    normalized.includes("银卡") ||
    normalized.includes("銀卡")
  ) {
    return { label: "黄金会员", kind: "gold" };
  }

  return { label: "免费会员" };
}

export function getCustomerLevelLabel(activeScore?: number) {
  const normalizedScore = typeof activeScore === "number" && Number.isFinite(activeScore) ? activeScore : 1;
  return `Lv.${clamp(Math.round(normalizedScore), 1, 100)}`;
}

export function formatCustomerMembershipLevel(memberLevel: string | undefined, levelLabel: string) {
  const membership = resolveCustomerMembership(memberLevel);
  return memberLevel ? `${membership.label} · ${levelLabel}` : levelLabel;
}

export function getCustomerMembershipIcon(memberLevel?: string) {
  const membership = resolveCustomerMembership(memberLevel);
  return membership.kind ? customerMembershipIcons[membership.kind] : undefined;
}
