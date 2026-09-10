import { inspectLifeDanceAdmin2ContactCohort } from "../src/simulation/lifedance-admin2-contact-check";

describe("LifeDance admin2 contact checker", () => {
  it("accepts unrelated contacts when every required contact exists in both directions", () => {
    expect(
      inspectLifeDanceAdmin2ContactCohort(
        [1, 2, 3],
        [
          { contactUserId: 1 },
          { contactUserId: 2 },
          { contactUserId: 3 },
          { contactUserId: 999 }
        ],
        [
          { ownerUserId: 1 },
          { ownerUserId: 2 },
          { ownerUserId: 3 },
          { ownerUserId: 998 }
        ]
      )
    ).toEqual({ missingOutboundUserIds: [], missingInboundUserIds: [] });
  });

  it("reports each missing required direction without counting unrelated contacts", () => {
    expect(
      inspectLifeDanceAdmin2ContactCohort(
        [1, 2, 3],
        [{ contactUserId: 1 }, { contactUserId: 3 }, { contactUserId: 999 }],
        [{ ownerUserId: 1 }, { ownerUserId: 2 }, { ownerUserId: 998 }]
      )
    ).toEqual({ missingOutboundUserIds: [2], missingInboundUserIds: [3] });
  });
});
