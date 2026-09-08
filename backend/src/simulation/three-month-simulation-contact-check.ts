export const simulationContactIdentityPairKey = (
  ownerIdentityId: number,
  contactIdentityId: number
): string => `${ownerIdentityId}:${contactIdentityId}`;

export const filterSimulationContactsByIdentityPair = <
  TContact extends { ownerIdentityId: number; contactIdentityId: number }
>(
  contacts: TContact[],
  expectedIdentityPairs: ReadonlySet<string>
): TContact[] =>
  contacts.filter((contact) =>
    expectedIdentityPairs.has(
      simulationContactIdentityPairKey(contact.ownerIdentityId, contact.contactIdentityId)
    )
  );
