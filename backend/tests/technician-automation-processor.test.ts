import { TechnicianAutomationProcessor } from "../src/services/technician-automation-processor";
import { defaultTechnicianAutomationRules } from "../src/validators/technician-automation.validator";

const evaluationContext = {
  now: new Date("2026-09-09T00:00:00.000Z"),
  startsAt: new Date("2026-09-09T03:00:00.000Z"),
  endsAt: new Date("2026-09-09T04:00:00.000Z"),
  actualScheduleAvailable: true,
  hasBufferedConflict: false,
  hardBlockReasons: [] as string[],
  areaCode: "JP-13/minato",
  distanceKm: 2,
  grossAmountJpy: 12_000,
  netAmountJpy: 9_000,
  customerRating: 4.9,
  customerCompletedOrders: 9,
  customerHistoricalOrders: 10,
  customerCancellationRatePercent: 10,
  customerEkycVerified: true,
  customerIsContact: true,
  referralContactIdentityId: 44,
  completedOrdersWithTechnician: 2,
  partyType: "single" as const,
  serviceMode: "store" as const,
  paymentMethod: "onsite" as const,
  serviceId: 101,
  technicianOnline: true,
  tagsMatch: true
};

const bookingCandidate = {
  settingId: 1,
  technicianProfileId: 31,
  technicianUserId: 7,
  technicianIdentityId: 17,
  technicianPublicId: "s0000000031",
  ruleVersion: 3,
  rules: { ...defaultTechnicianAutomationRules("booking"), maxDistanceKm: null },
  context: evaluationContext
};

const makeRepository = () => ({
  loadBookingCandidate: jest.fn(async () => bookingCandidate),
  loadRequestCandidates: jest.fn(async () => [{
    ...bookingCandidate,
    rules: { ...defaultTechnicianAutomationRules("request"), maxDistanceKm: null, requireMatchingTags: false },
    scheduleSlotId: 81,
    quoteAmountJpy: 12_000,
    message: "NeeDo 自动应募"
  }]),
  reserveDecision: jest.fn(async () => true),
  completeDecision: jest.fn(async () => undefined),
  notifyAutomaticAction: jest.fn(async () => undefined)
});

describe("TechnicianAutomationProcessor", () => {
  it("reuses the Booking confirmation authority once and records execution", async () => {
    const repository = makeRepository();
    const confirmBooking = jest.fn(async () => undefined);
    const processor = new TechnicianAutomationProcessor(repository, { confirmBooking }, { applyRequest: jest.fn() });
    await processor.processBooking(501);
    expect(confirmBooking).toHaveBeenCalledTimes(1);
    expect(confirmBooking).toHaveBeenCalledWith(expect.objectContaining({ orderId: 501, technicianUserId: 7 }));
    expect(repository.completeDecision).toHaveBeenCalledWith(expect.objectContaining({ outcome: "executed" }));
  });

  it("leaves a non-matching Booking pending/manual and records reasons without calling confirm", async () => {
    const repository = makeRepository();
    repository.loadBookingCandidate.mockResolvedValueOnce({
      ...bookingCandidate,
      rules: { ...bookingCandidate.rules, minOrderAmountJpy: 20_000 }
    });
    const confirmBooking = jest.fn();
    const processor = new TechnicianAutomationProcessor(repository, { confirmBooking }, { applyRequest: jest.fn() });
    await processor.processBooking(502);
    expect(confirmBooking).not.toHaveBeenCalled();
    expect(repository.completeDecision).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "not_matched",
      failedReasons: expect.arrayContaining(["amount:gross_too_low"])
    }));
  });

  it("creates a real Request application with quick matching suppressed so the user still chooses", async () => {
    const repository = makeRepository();
    const applyRequest = jest.fn(async () => undefined);
    const processor = new TechnicianAutomationProcessor(repository, { confirmBooking: jest.fn() }, { applyRequest });
    await processor.processRequest(601);
    expect(applyRequest).toHaveBeenCalledWith(expect.objectContaining({
      postId: 601,
      scheduleSlotId: 81,
      suppressQuickMatching: true
    }));
    expect(repository.notifyAutomaticAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "request" }));
  });

  it("does not repeat an action when the decision idempotency key already exists", async () => {
    const repository = makeRepository();
    repository.reserveDecision.mockResolvedValueOnce(false);
    const confirmBooking = jest.fn();
    await new TechnicianAutomationProcessor(repository, { confirmBooking }, { applyRequest: jest.fn() }).processBooking(503);
    expect(confirmBooking).not.toHaveBeenCalled();
    expect(repository.completeDecision).not.toHaveBeenCalled();
  });

  it("records an action failure without reporting execution or sending a notification", async () => {
    const repository = makeRepository();
    const applyRequest = jest.fn(async () => {
      throw new Error("claim transaction rolled back");
    });
    const processor = new TechnicianAutomationProcessor(
      repository,
      { confirmBooking: jest.fn() },
      { applyRequest }
    );

    await processor.processRequest(602);

    expect(repository.completeDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "action_failed",
        failedReasons: ["action:claim transaction rolled back"],
        executedAt: null
      })
    );
    expect(repository.notifyAutomaticAction).not.toHaveBeenCalled();
  });

  it("keeps a completed request action successful when best-effort notification delivery fails", async () => {
    const repository = makeRepository();
    repository.notifyAutomaticAction.mockRejectedValueOnce(new Error("notification unavailable"));
    const applyRequest = jest.fn(async () => undefined);
    const processor = new TechnicianAutomationProcessor(
      repository,
      { confirmBooking: jest.fn() },
      { applyRequest }
    );

    await expect(processor.processRequest(603)).resolves.toBeUndefined();

    expect(repository.completeDecision).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "executed" })
    );
    expect(repository.completeDecision).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "action_failed" })
    );
  });
});
