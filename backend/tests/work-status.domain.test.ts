import {
  attendanceDelay,
  monthRangeJst,
  stateAtBoundary,
  workStatusScope
} from "../src/domain/work-status";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

describe("work status attendance boundaries", () => {
  const boundary = new Date("2026-09-06T15:00:00.000Z");
  it("uses zero grace and retains seconds", () => {
    expect(attendanceDelay(boundary, new Date(boundary.getTime() - 1000))).toBeNull();
    expect(attendanceDelay(boundary, boundary)).toBeNull();
    expect(attendanceDelay(boundary, new Date(boundary.getTime() + 1000))).toBe(1);
  });
  it("JST month is half open even at UTC previous-month date", () => {
    expect(monthRangeJst(new Date("2026-08-31T15:00:00Z"))).toEqual({
      from: new Date("2026-08-31T15:00:00Z"),
      to: new Date("2026-09-30T15:00:00Z")
    });
  });
  it("does not invent attendance, and off-duty supersedes earlier attendance", () => {
    expect(stateAtBoundary([], boundary)).toBe("unsynced");
    expect(
      stateAtBoundary(
        [
          { at: new Date("2026-09-06T14:00:00Z"), status: "on_duty" },
          { at: new Date("2026-09-06T14:30:00Z"), status: "off_duty" }
        ],
        boundary
      )
    ).toBe("off_duty");
  });
  it("rejects a different active identity even when technician role exists", () => {
    const actor = {
      userId: 1,
      currentIdentityType: "customer",
      currentIdentityScopeType: "global",
      roles: ["technician"]
    } as AuthenticatedAccessContext;
    expect(() => workStatusScope(actor, "technician")).toThrow();
  });
});

it("supports the canonical operations identity aliases without granting technician role-based access", () => {
  for (const type of ["platform", "platform_admin"])
    for (const scopeType of ["global", "platform"])
      expect(
        workStatusScope(
          {
            userId: 1,
            currentIdentityId: 1,
            currentIdentityType: type,
            currentIdentityScopeType: scopeType
          } as AuthenticatedAccessContext,
          "operations",
          7
        )
      ).toEqual({ technicianProfileId: 7 });
});
