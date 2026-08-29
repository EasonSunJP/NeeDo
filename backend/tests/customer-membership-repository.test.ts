import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("BackofficeRepository customer membership grants", () => {
  it("persists the level, validity, and granting operations identity", async () => {
    const startsAt = new Date("2026-08-29T00:00:00.000Z");
    const expiresAt = new Date("2026-11-29T00:00:00.000Z");
    const findFirst = jest.fn(async () => ({ id: 44 }));
    const update = jest.fn(async (input: { data: Record<string, unknown> }) => ({
      membershipLevel: input.data.membershipLevel,
      membershipDurationValue: input.data.membershipDurationValue,
      membershipStartsAt: input.data.membershipStartsAt,
      membershipExpiresAt: input.data.membershipExpiresAt,
      membershipGrantedBy: { needoId: "o0000000001", username: "NeeDo Admin" }
    }));
    const repository = new BackofficeRepository({
      customerProfile: { findFirst, update }
    } as never);

    await expect(repository.assignCustomerMembership({
      customerProfileId: 44,
      membershipLevel: "gold",
      durationUnit: "month",
      durationValue: 3,
      startsAt,
      expiresAt,
      grantedById: 7
    })).resolves.toEqual({
      membershipLevel: "gold",
      membershipGrantMode: "operator_complimentary",
      membershipDurationUnit: "month",
      membershipDurationValue: 3,
      membershipStartsAt: startsAt.toISOString(),
      membershipExpiresAt: expiresAt.toISOString(),
      membershipGrantedBy: { needoId: "o0000000001", username: "NeeDo Admin" }
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 44 },
      data: expect.objectContaining({
        membershipLevel: "gold",
        membershipGrantMode: "OPERATOR_COMPLIMENTARY",
        membershipDurationUnit: "MONTH",
        membershipDurationValue: 3,
        membershipStartsAt: startsAt,
        membershipExpiresAt: expiresAt,
        membershipGrantedById: 7
      })
    }));
  });

  it("returns null without writing when the user profile is missing", async () => {
    const update = jest.fn();
    const repository = new BackofficeRepository({
      customerProfile: { findFirst: jest.fn(async () => null), update }
    } as never);

    await expect(repository.assignCustomerMembership({
      customerProfileId: 999,
      membershipLevel: "gold",
      durationUnit: "forever",
      durationValue: null,
      startsAt: new Date("2026-08-29T00:00:00.000Z"),
      expiresAt: null,
      grantedById: 7
    })).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
