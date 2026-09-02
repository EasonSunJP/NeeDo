import { BookingService } from "../src/services/booking.service";

const order = {
  id: 41,
  customerUserId: 101,
  technicianProfileId: 702,
  status: "completed"
};

const customer = {
  userId: 101,
  email: "customer@example.com",
  accessTokenJti: "review-customer-jti",
  accessTokenExpiresAt: 2_000_000_000,
  permissions: ["order:review:create"],
  roles: ["customer"],
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 501
};

const technician = {
  userId: 202,
  email: "technician@example.com",
  accessTokenJti: "review-technician-jti",
  accessTokenExpiresAt: 2_000_000_000,
  permissions: ["order:review:create"],
  roles: ["technician"],
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 702
};

const context = { ip: "127.0.0.1", userAgent: "jest" };

describe("formal completed-order review service", () => {
  it("persists participant timeline comments and emits a realtime refresh for the other identity", async () => {
    const updatedOrder = { ...order, orderNo: "ND202609030041" };
    const repository = {
      findOrderById: jest.fn(async () => updatedOrder),
      createOrderTimelineComment: jest.fn(async () => updatedOrder),
      findOrderRealtimeRecipients: jest.fn(async () => [
        { userId: 101, identityId: 1501 },
        { userId: 202, identityId: 1702 }
      ])
    };
    const realtime = {
      notifyOrderStatusChanged: jest.fn(),
      notifyOrderChanged: jest.fn()
    };
    const service = new BookingService(repository as never, undefined, realtime);

    await expect(
      service.createOrderTimelineComment(
        { ...customer, currentIdentityId: 1501 },
        41,
        "  请提前五分钟联系  "
      )
    ).resolves.toBe(updatedOrder);

    expect(repository.createOrderTimelineComment).toHaveBeenCalledWith({
      actorUserId: 101,
      body: "请提前五分钟联系",
      orderId: 41
    });
    expect(realtime.notifyOrderChanged).toHaveBeenCalledWith(expect.objectContaining({
      actorIdentityId: 1501,
      changeType: "timeline_comment",
      orderId: 41
    }));
  });

  it.each([
    [customer, "technician", null],
    [technician, "customer", 702]
  ] as const)("derives and persists the permitted direction", async (actor, targetType, profileId) => {
    const review = {
      targetType,
      rating: 5,
      tags: targetType === "technician" ? ["服务精神", "魅力值"] : ["准时到达"],
      comment: "很好",
      createdAt: new Date("2026-09-01T12:00:00.000Z")
    };
    const repository = {
      findOrderById: jest.fn(async () => order),
      createOrderReview: jest.fn(async () => ({ outcome: "ok", applied: true, review }))
    };
    const audit = {
      createInput: jest.fn((input) => ({ ...input, actorId: actor.userId }))
    };
    const service = new BookingService(repository as never, undefined, undefined, audit as never);

    await expect(
      service.createOrderReview(
        actor,
        41,
        {
          targetType,
          rating: 5,
          tags: [...review.tags].reverse(),
          comment: "  很好  ",
          idempotencyKey: "review-command-key-0001"
        },
        context
      )
    ).resolves.toEqual({ applied: true, review });

    expect(repository.createOrderReview).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 41,
        actorUserId: actor.userId,
        actor: targetType === "technician" ? "customer" : "technician",
        technicianProfileId: profileId,
        targetType,
        tags: expect.any(Array),
        comment: "很好",
        idempotencyKey: "review-command-key-0001",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        audit: expect.objectContaining({ action: "order.review.create" })
      })
    );
  });

  it("rejects an actor-selected direction mismatch without touching the mutation repository", async () => {
    const repository = {
      findOrderById: jest.fn(async () => order),
      createOrderReview: jest.fn()
    };
    const service = new BookingService(repository as never);
    await expect(
      service.createOrderReview(customer, 41, {
        targetType: "customer",
        rating: 5,
        tags: [],
        comment: null,
        idempotencyKey: "review-command-key-0002"
      }, context)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.createOrderReview).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "error.order.not_found"],
    ["invalid_state", 409, "error.order.review_requires_completion"],
    ["invalid_evidence", 409, "error.order.review_invalid_settlement"],
    ["conflict", 409, "error.idempotency.key_reused"],
    ["already_submitted", 409, "error.order.review_already_submitted"]
  ])("maps %s without exposing persistence internals", async (outcome, statusCode, message) => {
    const repository = {
      findOrderById: jest.fn(async () => order),
      createOrderReview: jest.fn(async () => ({ outcome }))
    };
    const audit = { createInput: jest.fn((input) => input) };
    const service = new BookingService(repository as never, undefined, undefined, audit as never);
    await expect(
      service.createOrderReview(customer, 41, {
        targetType: "technician",
        rating: 4,
        tags: [],
        comment: null,
        idempotencyKey: "review-command-key-0003"
      }, context)
    ).rejects.toMatchObject({ statusCode, message });
  });

  it("returns only the current participant's permitted direction", async () => {
    const review = { targetType: "technician", rating: 5, tags: ["元气"], comment: null, createdAt: new Date() };
    const repository = {
      findOrderById: jest.fn(async () => order),
      findOwnOrderReview: jest.fn(async () => ({ outcome: "ok", review }))
    };
    const service = new BookingService(repository as never);
    await expect(service.getOwnOrderReview(customer, 41)).resolves.toEqual({ review });
    expect(repository.findOwnOrderReview).toHaveBeenCalledWith({
      orderId: 41,
      actorUserId: 101,
      actor: "customer",
      technicianProfileId: null,
      targetType: "technician"
    });
  });
});
