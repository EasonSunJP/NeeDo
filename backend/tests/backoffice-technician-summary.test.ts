import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("platform technician summary", () => {
  it("counts active technician identities, pending applicants, and Tokyo-day availability separately", async () => {
    const technicianCount = jest.fn().mockResolvedValueOnce(137).mockResolvedValueOnce(9);
    const applicantCount = jest.fn(async () => 4);
    const repository = new BackofficeRepository({
      technicianProfile: { count: technicianCount },
      user: { count: applicantCount }
    } as never);

    const result = await repository.getPlatformTechnicianSummary(new Date("2026-09-23T02:00:00.000Z"));

    expect(result).toEqual({ total: 137, pendingReview: 4, activeToday: 9, date: "2026-09-23", timeZone: "Asia/Tokyo" });
    expect(technicianCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }));
    expect(applicantCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      identities: { none: expect.objectContaining({ type: "technician", isActive: true }) },
      identityApplications: { some: expect.objectContaining({ status: { in: ["submitted", "under_review"] } }) }
    }) }));
    expect(technicianCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [
      { workStates: { some: { status: "on_duty", deletedAt: null } } },
      { workEvents: { some: { deletedAt: null, at: { gte: new Date("2026-09-22T15:00:00.000Z"), lt: new Date("2026-09-23T15:00:00.000Z"), lte: new Date("2026-09-23T02:00:00.000Z") }, OR: [{ toStatus: "on_duty" }, { fromStatus: "on_duty" }] } } },
      { availabilities: { some: { sourceType: "TECHNICIAN", visibility: "TECHNICIAN_SHOPS", isActive: true, deletedAt: null, startsAt: { lt: new Date("2026-09-23T15:00:00.000Z") }, endsAt: { gt: new Date("2026-09-22T15:00:00.000Z") } } } }
    ] }) }));
  });
});
