import {
  filterSimulationContactsByIdentityPair,
  simulationContactIdentityPairKey
} from "../src/simulation/three-month-simulation-contact-check";

describe("three-month simulation contact verification", () => {
  it("does not count a second legitimate identity relationship between the same users", () => {
    const expectedIdentityPairs = new Set([
      simulationContactIdentityPairKey(1001, 2001)
    ]);
    const contacts = [
      {
        id: 1,
        ownerUserId: 10,
        contactUserId: 20,
        ownerIdentityId: 101,
        contactIdentityId: 201,
        source: "friend_request"
      },
      {
        id: 2,
        ownerUserId: 10,
        contactUserId: 20,
        ownerIdentityId: 1001,
        contactIdentityId: 2001,
        source: "lifedance_staff_seed"
      }
    ];

    expect(
      filterSimulationContactsByIdentityPair(contacts, expectedIdentityPairs)
    ).toEqual([contacts[1]]);
  });
});
