import { ServicePrepaymentController } from "../src/controllers/service-prepayment.controller";

const result = {
  id: 1,
  subject: { type: "booking" as const, id: 71 },
  baseAmountJpy: 10_000,
  percent: 30,
  amountJpy: 3_000,
  confirmedAmountJpy: 3_000,
  paymentMethod: "ndp" as const,
  status: "confirmed" as const,
  walletHoldId: 9,
  externalReference: null,
  idempotencyKey: "booking:71:prepayment",
  requestFingerprint: "a".repeat(64),
  createdByIdentityId: 5,
  confirmedAt: new Date("2026-09-20T00:00:00.000Z"),
  capturedAt: null,
  releasedAt: null,
  refundPendingAt: null,
  refundedAt: null,
  createdAt: new Date("2026-09-20T00:00:00.000Z"),
  updatedAt: new Date("2026-09-20T00:00:00.000Z")
};

describe("ServicePrepaymentController", () => {
  it("accepts only a percentage, derives a server fingerprint, and retries Booking automation", async () => {
    const service = { confirmForSubject: jest.fn(async () => result) };
    const automation = { processBooking: jest.fn(async () => undefined), processRequest: jest.fn(async () => undefined) };
    const controller = new ServicePrepaymentController(service as never, automation as never);
    const json = jest.fn();
    const response = {
      locals: { auth: { userId: 4, currentIdentityId: 5 } },
      status: jest.fn(() => ({ json }))
    };
    const next = jest.fn();
    await controller.createBooking({
      params: { id: "71" },
      body: { percent: 30 },
      get: jest.fn(() => "booking:71:prepayment")
    } as never, response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(service.confirmForSubject).toHaveBeenCalledWith(expect.objectContaining({
      subject: { type: "booking", id: 71 },
      percent: 30,
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(automation.processBooking).toHaveBeenCalledWith(71);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("requestFingerprint");
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("idempotencyKey");
  });
});
