export interface LifeDanceAdmin2OutboundContact {
  contactUserId: number;
}

export interface LifeDanceAdmin2InboundContact {
  ownerUserId: number;
}

export interface LifeDanceAdmin2ContactCohortInspection {
  missingOutboundUserIds: number[];
  missingInboundUserIds: number[];
}

export const inspectLifeDanceAdmin2ContactCohort = (
  requiredContactUserIds: readonly number[],
  outboundContacts: readonly LifeDanceAdmin2OutboundContact[],
  inboundContacts: readonly LifeDanceAdmin2InboundContact[]
): LifeDanceAdmin2ContactCohortInspection => {
  const outboundUserIds = new Set(outboundContacts.map((contact) => contact.contactUserId));
  const inboundUserIds = new Set(inboundContacts.map((contact) => contact.ownerUserId));
  const requiredUserIds = [...new Set(requiredContactUserIds)].sort((left, right) => left - right);

  return {
    missingOutboundUserIds: requiredUserIds.filter((userId) => !outboundUserIds.has(userId)),
    missingInboundUserIds: requiredUserIds.filter((userId) => !inboundUserIds.has(userId))
  };
};
