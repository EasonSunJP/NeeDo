import { buildAdminStaffingPlan, selectContactTargets } from "../src/simulation/admin-six-month-plan";

describe("admin identity contact plan", () => {
  it("keeps each target's real identity type and excludes inactive, non-test and self accounts", () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, userId: i + 10, type: "customer", isTestAccount: true, isActive: true }));
    const targets = selectContactTargets([...candidates, { id: 100, userId: 1, type: "customer", isTestAccount: true, isActive: true }, { id: 101, userId: 200, type: "customer", isTestAccount: false, isActive: true }], 1, "customer", 20);
    expect(targets).toHaveLength(20);
    expect(targets.every(t => t.userId !== 1 && t.isTestAccount && t.type === "customer")).toBe(true);
    expect(new Set(targets.map(t => t.userId)).size).toBe(20);
  });
  it("fails instead of inventing contacts when the approved cohort is insufficient", () => {
    expect(() => selectContactTargets([], 1, "technician", 21)).toThrow(/insufficient/);
  });
});

describe("six-month continuous shop staffing", () => {
  const staff = Array.from({ length: 50 }, (_, i) => i + 1);
  it("covers every hour for 181 days with ten distinct staff and no double shifts", () => {
    const shifts = buildAdminStaffingPlan(staff, "2026-09-06", "2027-03-06", []);
    expect(shifts).toHaveLength(181 * 3 * 10);
    const daily = new Map<string, Set<number>>();
    const periods = new Map<string, Set<number>>();
    const previousEnd = new Map<number, number>();
    for (const shift of shifts) {
      expect(new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()).toBe(8 * 3600000);
      const key = shift.startsAt;
      const people = periods.get(key) ?? new Set<number>();
      people.add(shift.technicianProfileId); periods.set(key, people);
      const day = shift.date;
      const peopleToday = daily.get(day) ?? new Set<number>();
      expect(peopleToday.has(shift.technicianProfileId)).toBe(false);
      peopleToday.add(shift.technicianProfileId); daily.set(day, peopleToday);
      const last = previousEnd.get(shift.technicianProfileId);
      if (last !== undefined) expect(new Date(shift.startsAt).getTime() - last).toBeGreaterThanOrEqual(16 * 3600000);
      previousEnd.set(shift.technicianProfileId, new Date(shift.endsAt).getTime());
    }
    expect(periods.size).toBe(181 * 3);
    expect([...periods.values()].every(p => p.size === 10)).toBe(true);
  });
  it("uses resting reserves when a preferred technician has a confirmed booking", () => {
    const conflict = { technicianProfileId: 1, startsAt: "2026-09-05T15:00:00.000Z", endsAt: "2026-09-05T16:00:00.000Z" };
    const shifts = buildAdminStaffingPlan(staff, "2026-09-06", "2026-09-07", [conflict]);
    expect(shifts).toHaveLength(30);
    expect(shifts.filter(s => s.startsAt === conflict.startsAt).some(s => s.technicianProfileId === 1)).toBe(false);
  });
  it("fails closed when staffing cannot satisfy hard bookings", () => {
    expect(() => buildAdminStaffingPlan(staff, "2026-09-06", "2026-09-07", staff.map(technicianProfileId => ({ technicianProfileId, startsAt: "2026-09-05T15:00:00Z", endsAt: "2026-09-06T15:00:00Z" })))).toThrow(/coverage/);
  });
  it("reserves scarce night-shift candidates instead of consuming them on the morning shift", () => {
    const conflicts = staff.filter(id => id > 10).map(technicianProfileId => ({ technicianProfileId, startsAt: "2026-09-06T07:00:00Z", endsAt: "2026-09-06T15:00:00Z" }));
    const shifts = buildAdminStaffingPlan(staff, "2026-09-06", "2026-09-07", conflicts);
    expect(shifts).toHaveLength(30);
    expect(shifts.filter(s => s.startsAt === "2026-09-06T07:00:00.000Z").every(s => s.technicianProfileId <= 10)).toBe(true);
  });
});
