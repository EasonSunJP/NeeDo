/* eslint-disable @typescript-eslint/no-explicit-any -- stateful Prisma transaction harness */
import { BookingRepository } from "../src/repositories/booking.repository";

const decimal = (value: number) => ({
  toString: () => String(value),
  toFixed: (places = 0) => value.toFixed(places)
});

const createHarness = (failure?: "tag" | "summary" | "shopSummary" | "audit") => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  const order: any = {
    id: 41, orderNo: "ND41", orderType: "BOOKING", status: "COMPLETED",
    paymentMethod: "NDP", paymentStatus: "CONFIRMED", paymentAmountJpy: 8_800,
    paymentConfirmedById: 101, paymentConfirmedAt: now, paymentReference: "checkout:9:ledger:91", paymentNote: null,
    paymentRefundedById: null, paymentRefundedAt: null, paymentRefundReference: null, paymentRefundReason: null,
    customerUserId: 101, serviceId: 11, technicianServiceId: null, shopId: 12,
    technicianProfileId: 702, scheduleSlotId: 13, fulfillmentMode: "store",
    serviceNameSnapshot: "Service", pricingModeSnapshot: "merchant", serviceOwnerType: "shop", serviceOwnerId: 11,
    servicePriceSnapshot: decimal(8_800), serviceDurationSnapshot: 60, serviceSnapshotJson: {},
    service: { name: "Service" }, technicianService: null, shop: { name: "Shop", ownerUserId: 303 },
    technicianProfile: { id: 702, userId: 202, displayName: "Tech", deletedAt: null },
    priceAmount: decimal(8_800), currency: "JPY", startsAt: new Date("2026-09-01T09:00:00.000Z"), endsAt: new Date("2026-09-01T10:00:00.000Z"),
    note: null, cancelReason: null, createdAt: now, updatedAt: now,
    serviceSession: { id: 5, startedAt: now, expectedEndsAt: now, endedAt: now, addOns: [] },
    statusHistory: [], affiliateAttributions: [], deletedAt: null
  };
  const checkout: any = {
    id: 9, bookingOrderId: 41, paymentMethod: "NDP", ledgerTransactionId: 91,
    receiptConfirmedAt: null, receiptConfirmedById: null, receiptConfirmationReason: null,
    deletedAt: null
  };
  const customerProfile: any = { id: 501, userId: 101, deletedAt: null };
  let nextReviewId = 1;
  const reviews: any[] = [];
  const tags: any[] = [];
  const summaries: any[] = [];
  const audits: any[] = [];
  const locks: string[] = [];
  const collate = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-US");
  const withTags = (review: any) => ({ ...review, tags: tags.filter((tag) => tag.orderReviewId === review.id && !tag.deletedAt) });
  const tx: any = {
    $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      locks.push(String(parts[0]).includes("technician_profiles") ? "technician" : String(parts[0]).includes("customer_profiles") ? "customer" : String(parts[0]).includes("shops") ? "shop" : "order");
      return [{ id: 1 }];
    }),
    bookingOrder: { findFirst: jest.fn(async ({ where }: any) => where.id === order.id && !order.deletedAt ? order : null) },
    technicianProfile: { findFirst: jest.fn(async ({ where }: any) => where.id === order.technicianProfile.id && !order.technicianProfile.deletedAt ? { id: 702, userId: order.technicianProfile.userId } : null) },
    customerProfile: { findFirst: jest.fn(async ({ where }: any) => ((where.id === undefined || where.id === customerProfile.id) && where.userId === customerProfile.userId && !customerProfile.deletedAt) ? customerProfile : null) },
    orderCheckout: { findUnique: jest.fn(async ({ where }: any) => where.bookingOrderId === checkout.bookingOrderId ? checkout : null) },
    orderServiceEvent: { findFirst: jest.fn(async () => null) },
    orderReview: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        let found = null;
        if (where.id) found = reviews.find((review) => review.id === where.id) ?? null;
        if (where.idempotencyKey) found = reviews.find((review) => collate(review.idempotencyKey) === collate(where.idempotencyKey)) ?? null;
        if (where.bookingOrderId_reviewerUserId_targetType) {
          const key = where.bookingOrderId_reviewerUserId_targetType;
          found = reviews.find((review) => review.bookingOrderId === key.bookingOrderId && review.reviewerUserId === key.reviewerUserId && review.targetType === key.targetType) ?? null;
        }
        return found && include ? withTags(found) : found;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const found = reviews.find((review) => review.bookingOrderId === where.bookingOrderId && review.reviewerUserId === where.reviewerUserId && review.targetType === where.targetType && !review.deletedAt);
        return found ? withTags(found) : null;
      }),
      findMany: jest.fn(async ({ where }: any) => reviews.filter((review) =>
        review.targetType === where.targetType &&
        !review.deletedAt &&
        (where.bookingOrder
          ? review.bookingOrderId === order.id && order.shopId === where.bookingOrder.shopId && !order.deletedAt
          : where.technicianProfileId
            ? review.technicianProfileId === where.technicianProfileId
            : review.customerProfileId === where.customerProfileId)
      ).map(withTags)),
      create: jest.fn(async ({ data }: any) => {
        if (reviews.some((review) => collate(review.idempotencyKey) === collate(data.idempotencyKey))) throw Object.assign(new Error("unique"), { code: "P2002" });
        const review = { id: nextReviewId++, deletedAt: null, ...data };
        reviews.push(review);
        return review;
      })
    },
    orderReviewTag: { create: jest.fn(async ({ data }: any) => { if (failure === "tag") throw new Error("tag failed"); const tag = { id: tags.length + 1, deletedAt: null, ...data }; tags.push(tag); return tag; }) },
    reviewSummary: { upsert: jest.fn(async ({ where, create, update }: any) => { if (failure === "summary") throw new Error("summary failed"); if (failure === "shopSummary" && create.targetType === "shop") throw new Error("shop summary failed"); const found = summaries.find((summary) => summary.targetType === where.targetType_targetId.targetType && summary.targetId === where.targetType_targetId.targetId); if (found) Object.assign(found, update); else summaries.push({ id: summaries.length + 1, ...create }); return found ?? summaries.at(-1); }) },
    auditLog: { create: jest.fn(async ({ data }: any) => { if (failure === "audit") throw new Error("audit failed"); audits.push({ id: audits.length + 1, ...data }); return data; }) }
  };
  const client: any = {
    bookingOrder: tx.bookingOrder,
    customerProfile: tx.customerProfile,
    orderReview: tx.orderReview,
    $transaction: jest.fn(async (handler: (transaction: any) => Promise<unknown>) => {
      const snapshot = { reviews: reviews.map((item) => ({ ...item })), tags: tags.map((item) => ({ ...item })), summaries: summaries.map((item) => ({ ...item })), audits: audits.map((item) => ({ ...item })), nextReviewId };
      try { return await handler(tx); } catch (error) {
        reviews.splice(0, reviews.length, ...snapshot.reviews); tags.splice(0, tags.length, ...snapshot.tags); summaries.splice(0, summaries.length, ...snapshot.summaries); audits.splice(0, audits.length, ...snapshot.audits); nextReviewId = snapshot.nextReviewId;
        throw error;
      }
    })
  };
  const input = (overrides: Record<string, unknown> = {}) => ({
    orderId: 41, actorUserId: 101, actor: "customer" as const, technicianProfileId: null,
    targetType: "technician" as const, rating: 5, tags: ["服务精神", "魅力值"], comment: "很好",
    idempotencyKey: "review-command-key-0001", requestFingerprint: "a".repeat(64),
    audit: { actorId: 101, action: "order.review.create", targetType: "BookingOrder", targetId: 41 },
    ...overrides
  });
  return { repository: new BookingRepository(client), order, checkout, customerProfile, reviews, tags, summaries, audits, locks, input };
};

describe("formal completed-order review repository", () => {
  it("applies one customer service review to both the technician and shop summaries in one transaction", async () => {
    const h = createHarness();
    await expect(h.repository.createOrderReview(h.input())).resolves.toMatchObject({ outcome: "ok", applied: true, review: { targetType: "technician", rating: 5, tags: ["服务精神", "魅力值"] } });
    expect(h.reviews).toHaveLength(1);
    expect(h.summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetType: "technician", targetId: 702, reviewCount: 1 }),
      expect.objectContaining({ targetType: "shop", targetId: 12, shopId: 12, reviewCount: 1 })
    ]));
    expect(h.locks).toEqual(expect.arrayContaining(["order", "technician", "shop"]));
    expect(h.audits).toHaveLength(1);
  });

  it("keeps the technician-to-customer direction independent from shop scoring", async () => {
    const h = createHarness();
    await expect(h.repository.createOrderReview(h.input({ actorUserId: 202, actor: "technician", technicianProfileId: 702, targetType: "customer", rating: 4, tags: ["准时到达"], idempotencyKey: "review-command-key-0002", requestFingerprint: "b".repeat(64), audit: { actorId: 202, action: "order.review.create", targetType: "BookingOrder", targetId: 41 } }))).resolves.toMatchObject({ outcome: "ok", applied: true, review: { targetType: "customer" } });
    expect(h.reviews).toHaveLength(1);
    expect(h.summaries).toEqual([expect.objectContaining({ targetType: "customer", targetId: 501, reviewCount: 1 })]);
    expect(h.locks).toEqual(expect.arrayContaining(["order", "customer"]));
    expect(h.audits).toHaveLength(1);
  });

  it.each(["PENDING", "CONFIRMED", "IN_SERVICE", "AWAITING_CHECKOUT", "AWAITING_PAYMENT_CONFIRMATION", "CANCELLED"])("rejects ineligible state %s with zero writes", async (status) => {
    const h = createHarness(); h.order.status = status;
    await expect(h.repository.createOrderReview(h.input())).resolves.toEqual({ outcome: "invalid_state" });
    expect([h.reviews, h.tags, h.summaries, h.audits].map((items) => items.length)).toEqual([0, 0, 0, 0]);
  });

  it("rejects malformed completed evidence, outsiders, deleted targets and self-review", async () => {
    const evidence = createHarness(); evidence.checkout.ledgerTransactionId = null;
    await expect(evidence.repository.createOrderReview(evidence.input())).resolves.toEqual({ outcome: "invalid_evidence" });
    const outsider = createHarness();
    await expect(outsider.repository.createOrderReview(outsider.input({ actorUserId: 999 }))).resolves.toEqual({ outcome: "not_found" });
    const forgedActor = createHarness();
    await expect(forgedActor.repository.createOrderReview(forgedActor.input({ actor: "operations", actorUserId: 202, technicianProfileId: 702, targetType: "customer" } as any))).resolves.toEqual({ outcome: "not_found" });
    const deleted = createHarness(); deleted.order.technicianProfile.deletedAt = new Date();
    await expect(deleted.repository.createOrderReview(deleted.input())).resolves.toEqual({ outcome: "not_found" });
    const self = createHarness(); self.order.technicianProfile.userId = 101;
    await expect(self.repository.createOrderReview(self.input())).resolves.toEqual({ outcome: "not_found" });
  });

  it("rejects forged audit identity before any write", async () => {
    const h = createHarness();
    await expect(h.repository.createOrderReview(h.input({ audit: { actorId: 999, action: "order.review.create", targetType: "BookingOrder", targetId: 41 } }))).resolves.toEqual({ outcome: "conflict" });
    expect([h.reviews, h.tags, h.summaries, h.audits].map((items) => items.length)).toEqual([0, 0, 0, 0]);
  });

  it("replays only byte-exact equivalent input and rejects semantic, case and Unicode lookalikes", async () => {
    const h = createHarness();
    await h.repository.createOrderReview(h.input());
    await expect(h.repository.createOrderReview(h.input())).resolves.toMatchObject({ outcome: "ok", applied: false });
    await expect(h.repository.createOrderReview(h.input({ requestFingerprint: "b".repeat(64) }))).resolves.toEqual({ outcome: "conflict" });
    await expect(h.repository.createOrderReview(h.input({ idempotencyKey: "REVIEW-command-key-0001" }))).resolves.toEqual({ outcome: "conflict" });
    await expect(h.repository.createOrderReview(h.input({ idempotencyKey: "ｒｅｖｉｅｗ-command-key-0001" }))).resolves.toEqual({ outcome: "conflict" });
    expect(h.reviews).toHaveLength(1); expect(h.tags).toHaveLength(2); expect(h.audits).toHaveLength(1);
  });

  it("returns already_submitted for the natural direction under a different key", async () => {
    const h = createHarness(); await h.repository.createOrderReview(h.input());
    await expect(h.repository.createOrderReview(h.input({ idempotencyKey: "review-command-key-9999", requestFingerprint: "c".repeat(64) }))).resolves.toEqual({ outcome: "already_submitted" });
  });

  it.each(["tag", "summary", "shopSummary", "audit"] as const)("rolls back review, tags, both summaries and audit when %s persistence fails", async (failure) => {
    const h = createHarness(failure);
    await expect(h.repository.createOrderReview(h.input())).rejects.toThrow(failure === "shopSummary" ? "shop summary failed" : `${failure} failed`);
    expect([h.reviews, h.tags, h.summaries, h.audits].map((items) => items.length)).toEqual([0, 0, 0, 0]);
  });

  it("GET mine returns only the actor's safe direction and excludes deleted rows", async () => {
    const h = createHarness(); await h.repository.createOrderReview(h.input());
    await expect(h.repository.findOwnOrderReview({ orderId: 41, actorUserId: 101, actor: "customer", technicianProfileId: null, targetType: "technician" })).resolves.toMatchObject({ outcome: "ok", review: { targetType: "technician", rating: 5 } });
    h.reviews[0].deletedAt = new Date();
    await expect(h.repository.findOwnOrderReview({ orderId: 41, actorUserId: 101, actor: "customer", technicianProfileId: null, targetType: "technician" })).resolves.toEqual({ outcome: "ok", review: null });
  });
});
