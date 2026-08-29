import { resolveCustomerMembershipGrant } from "../src/services/backoffice.service";

describe("customer membership grant period", () => {
  it("keeps a complimentary forever grant open ended", () => {
    expect(resolveCustomerMembershipGrant({
      durationUnit: "forever",
      durationValue: null,
      startsAt: "2026-08-29T00:00:00.000Z"
    })).toEqual({
      durationValue: null,
      startsAt: new Date("2026-08-29T00:00:00.000Z"),
      expiresAt: null
    });
  });

  it("calculates a day grant from the authoritative start time", () => {
    expect(resolveCustomerMembershipGrant({
      durationUnit: "day",
      durationValue: 7,
      startsAt: "2026-08-29T09:30:00.000Z"
    }).expiresAt?.toISOString()).toBe("2026-09-05T09:30:00.000Z");
  });

  it("clamps a month grant to the last valid day", () => {
    expect(resolveCustomerMembershipGrant({
      durationUnit: "month",
      durationValue: 1,
      startsAt: "2027-01-31T09:30:00.000Z"
    }).expiresAt?.toISOString()).toBe("2027-02-28T09:30:00.000Z");
  });
});
