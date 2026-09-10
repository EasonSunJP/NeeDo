import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { DashboardRepository } from "../src/repositories/dashboard.repository";
import {
  DashboardMembershipRepository,
  type DashboardMembershipReader
} from "../src/repositories/dashboard-membership.repository";

type SqlQuery = { sql?: string; strings?: readonly string[]; values?: unknown[] };
const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ") ?? "";
const evaluatedAt = new Date("2026-08-31T14:59:59.000Z");
const window = resolveDashboardWindow(
  { period: "last7days" },
  new Date("2026-08-31T03:00:00.000Z")
);
const input = {
  scope: { kind: "shop", shopId: 91 } as const,
  city: null,
  window,
  evaluatedAt
};

const createReader = (rows: unknown[]) => {
  const queryRaw = jest.fn(async (query: SqlQuery) => {
    void query;
    return rows;
  });
  const client = { $queryRaw: queryRaw } as unknown as PrismaClient;
  return { reader: new DashboardMembershipRepository(client), queryRaw };
};

type PaymentEvidenceFixture = {
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  paymentConfirmedById: number | null;
  paymentConfirmedAt: Date | null;
  paymentAmountJpy: number;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentRefundedAt: Date | null;
  paymentRefundedById: number | null;
  paymentRefundReference: string | null;
  paymentRefundReason: string | null;
  checkout: {
    id: number;
    baseAmountJpy: number;
    addOnAmountJpy: number;
    discountAmountJpy: number;
    checkoutAmountJpy: number;
    payableNdp: number;
    paymentMethod: string;
    paymentSelectedAt: Date | null;
    otherMethodCode: string | null;
    otherMethodLabel: string | null;
    ledgerTransactionId: number | null;
    receiptConfirmedById: number | null;
    receiptConfirmedAt: Date | null;
    receiptConfirmationReason: string | null;
  };
  ledger: null | {
    id: number;
    status: string;
    type: string;
    currency: string | null;
    referenceType: string;
    referenceId: number;
    amount: number;
    actorUserId: number | null;
    createdAt: Date;
    deletedAt: Date | null;
  };
};

const selectedAt = new Date("2026-08-30T01:00:00.000Z");
const paidAt = new Date("2026-08-30T01:02:00.000Z");
const coherentNdp = (): PaymentEvidenceFixture => ({
  status: "completed",
  paymentStatus: "confirmed",
  paymentMethod: "ndp",
  paymentConfirmedById: 7,
  paymentConfirmedAt: paidAt,
  paymentAmountJpy: 1_000,
  paymentReference: "checkout:41:ledger:51",
  paymentNote: null,
  paymentRefundedAt: null,
  paymentRefundedById: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  checkout: {
    id: 41,
    baseAmountJpy: 900,
    addOnAmountJpy: 200,
    discountAmountJpy: 100,
    checkoutAmountJpy: 1_000,
    payableNdp: 1_000,
    paymentMethod: "ndp",
    paymentSelectedAt: selectedAt,
    otherMethodCode: null,
    otherMethodLabel: null,
    ledgerTransactionId: 51,
    receiptConfirmedById: null,
    receiptConfirmedAt: null,
    receiptConfirmationReason: null
  },
  ledger: {
    id: 51,
    status: "applied",
    type: "booking_complete_settlement",
    currency: "NDP",
    referenceType: "order_checkout_payment",
    referenceId: 41,
    amount: 1_000,
    actorUserId: 7,
    createdAt: new Date("2026-08-30T01:01:00.000Z"),
    deletedAt: null
  }
});

const coherentReceipt = (
  method: "cash" | "other",
  referenceSuffix: "technician-receipt" | "operations-receipt" = "technician-receipt"
): PaymentEvidenceFixture => {
  const evidence = coherentNdp();
  evidence.paymentMethod = method;
  evidence.paymentReference = `checkout:41:${referenceSuffix}`;
  evidence.paymentNote = "received";
  evidence.checkout.paymentMethod = method;
  evidence.checkout.ledgerTransactionId = null;
  evidence.checkout.receiptConfirmedById = 7;
  evidence.checkout.receiptConfirmedAt = new Date("2026-08-30T01:01:00.000Z");
  evidence.checkout.receiptConfirmationReason = "received";
  evidence.checkout.otherMethodCode = method === "other" ? "card" : null;
  evidence.checkout.otherMethodLabel = method === "other" ? "Card" : null;
  evidence.ledger = null;
  return evidence;
};

const isCoherentEvidence = (item: PaymentEvidenceFixture): boolean => {
  const checkout = item.checkout;
  if (
    item.status !== "completed" ||
    item.paymentStatus !== "confirmed" ||
    !item.paymentConfirmedById ||
    !item.paymentConfirmedAt ||
    item.paymentRefundedAt ||
    item.paymentRefundedById ||
    item.paymentRefundReference ||
    item.paymentRefundReason ||
    item.paymentAmountJpy !== checkout.checkoutAmountJpy ||
    [
      checkout.baseAmountJpy,
      checkout.addOnAmountJpy,
      checkout.discountAmountJpy,
      checkout.checkoutAmountJpy,
      checkout.payableNdp
    ].some((value) => value < 0) ||
    checkout.baseAmountJpy + checkout.addOnAmountJpy - checkout.discountAmountJpy !==
      checkout.checkoutAmountJpy ||
    item.paymentMethod !== checkout.paymentMethod ||
    !checkout.paymentSelectedAt ||
    checkout.paymentSelectedAt > item.paymentConfirmedAt
  )
    return false;
  if (item.paymentMethod === "ndp") {
    const ledger = item.ledger;
    return Boolean(
      checkout.ledgerTransactionId &&
      ledger &&
      ledger.id === checkout.ledgerTransactionId &&
      ledger.status === "applied" &&
      ledger.type === "booking_complete_settlement" &&
      ledger.currency === "NDP" &&
      ledger.referenceType === "order_checkout_payment" &&
      ledger.referenceId === checkout.id &&
      ledger.amount === checkout.payableNdp &&
      ledger.actorUserId === item.paymentConfirmedById &&
      !ledger.deletedAt &&
      checkout.paymentSelectedAt <= ledger.createdAt &&
      ledger.createdAt <= item.paymentConfirmedAt &&
      item.paymentReference === `checkout:${checkout.id}:ledger:${ledger.id}` &&
      item.paymentNote === null &&
      checkout.receiptConfirmedById === null &&
      checkout.receiptConfirmedAt === null &&
      checkout.receiptConfirmationReason === null
    );
  }
  if (item.paymentMethod !== "cash" && item.paymentMethod !== "other") return false;
  if (
    checkout.ledgerTransactionId !== null ||
    item.ledger !== null ||
    !checkout.receiptConfirmedById ||
    !checkout.receiptConfirmedAt ||
    !checkout.receiptConfirmationReason?.trim() ||
    checkout.receiptConfirmedById !== item.paymentConfirmedById ||
    checkout.receiptConfirmedAt < checkout.paymentSelectedAt ||
    checkout.receiptConfirmedAt > item.paymentConfirmedAt ||
    item.paymentNote !== checkout.receiptConfirmationReason ||
    ![
      `checkout:${checkout.id}:technician-receipt`,
      `checkout:${checkout.id}:operations-receipt`
    ].includes(item.paymentReference ?? "")
  )
    return false;
  return item.paymentMethod === "cash"
    ? checkout.otherMethodCode === null && checkout.otherMethodLabel === null
    : Boolean(checkout.otherMethodCode?.trim() && checkout.otherMethodLabel?.trim());
};

type MemberFixture = {
  userId: number;
  shopId: number;
  userActive: boolean;
  userTest: boolean;
  userDeleted: boolean;
  customerDeleted: boolean;
  shopDeleted: boolean;
  membershipDeleted: boolean;
  membershipStatus: string;
  startedAt: Date;
  endedAt: Date | null;
  cardDeleted: boolean;
  cardStatus: string;
  issuedAt: Date;
  expiresAt: Date | null;
};

const coherentMember = (userId = 1): MemberFixture => ({
  userId,
  shopId: 91,
  userActive: true,
  userTest: false,
  userDeleted: false,
  customerDeleted: false,
  shopDeleted: false,
  membershipDeleted: false,
  membershipStatus: "active",
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  endedAt: null,
  cardDeleted: false,
  cardStatus: "active",
  issuedAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: null
});

const isCurrentMember = (item: MemberFixture): boolean =>
  item.shopId === 91 &&
  item.userActive &&
  !item.userTest &&
  !item.userDeleted &&
  !item.customerDeleted &&
  !item.shopDeleted &&
  !item.membershipDeleted &&
  item.membershipStatus === "active" &&
  item.startedAt <= evaluatedAt &&
  (item.endedAt === null || item.endedAt > evaluatedAt) &&
  !item.cardDeleted &&
  item.cardStatus === "active" &&
  item.issuedAt <= evaluatedAt &&
  (item.expiresAt === null || item.expiresAt > evaluatedAt);

type UtilizerFixture = {
  userId: number;
  shopId: number;
  userActive: boolean;
  userTest: boolean;
  userDeleted: boolean;
  bookingDeleted: boolean;
  shopDeleted: boolean;
  checkoutDeleted: boolean;
  evidence: PaymentEvidenceFixture;
};

const coherentUtilizer = (userId = 1): UtilizerFixture => ({
  userId,
  shopId: 91,
  userActive: true,
  userTest: false,
  userDeleted: false,
  bookingDeleted: false,
  shopDeleted: false,
  checkoutDeleted: false,
  evidence: coherentNdp()
});

const isEligibleUtilizer = (item: UtilizerFixture): boolean =>
  item.shopId === 91 &&
  item.userActive &&
  !item.userTest &&
  !item.userDeleted &&
  !item.bookingDeleted &&
  !item.shopDeleted &&
  !item.checkoutDeleted &&
  item.evidence.paymentConfirmedAt !== null &&
  item.evidence.paymentConfirmedAt >= window.fromInclusive &&
  item.evidence.paymentConfirmedAt < window.toExclusive &&
  isCoherentEvidence(item.evidence);

describe("DashboardMembershipRepository", () => {
  it("returns the two formal distinct-user facts from one bounded query", async () => {
    const fixture = createReader([{ memberCount: 4n, completedCustomerCount: "3" }]);

    await expect(fixture.reader.getMembershipFacts(input)).resolves.toEqual({
      memberCount: 4,
      completedCustomerCount: 3
    });
    expect(fixture.queryRaw).toHaveBeenCalledTimes(1);

    const query = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("dashboard_membership_facts");
    expect(sql).toContain("COUNT(DISTINCT customer.user_id)");
    expect(sql).toContain("COUNT(DISTINCT booking.customer_user_id)");
    expect(sql).toContain("shop_customer_memberships");
    expect(sql).toContain("shop_membership_cards");
    expect(sql).toContain("membership.started_at <=");
    expect(sql).toContain("membership.ended_at >");
    expect(sql).toContain("card.issued_at <=");
    expect(sql).toContain("card.expires_at >");
    expect(sql).toContain("user.is_active =");
    expect(sql).toContain("user.is_test_account =");
    expect(sql).toContain("booking.payment_confirmed_at >=");
    expect(sql).toContain("booking.payment_confirmed_at <");
    expect(sql).not.toContain("booking.starts_at >=");
    expect(sql).not.toContain("dashboard_completed_customers");
    expect(query.values).toEqual(expect.arrayContaining([91, evaluatedAt, "NDP"]));
  });

  it("binds every formal completion exclusion and exact production evidence value", async () => {
    const fixture = createReader([{ memberCount: 0, completedCustomerCount: 0 }]);
    await fixture.reader.getMembershipFacts(input);
    const query = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const sql = queryText(query);

    for (const fragment of [
      "booking.deleted_at IS NULL",
      "shop.deleted_at IS NULL",
      "checkout.deleted_at IS NULL",
      "booking.payment_confirmed_by_id IS NOT NULL",
      "booking.payment_refunded_at IS NULL",
      "booking.payment_refunded_by_id IS NULL",
      "booking.payment_refund_reference IS NULL",
      "booking.payment_refund_reason IS NULL",
      "booking.payment_amount_jpy = checkout.checkout_amount_jpy",
      "checkout.base_amount_jpy >= 0",
      "checkout.add_on_amount_jpy >= 0",
      "checkout.discount_amount_jpy >= 0",
      "checkout.payable_ndp >= 0",
      "checkout.payment_method = booking.payment_method",
      "checkout.payment_selected_at <= booking.payment_confirmed_at",
      "ledger.status =",
      "ledger.type =",
      "ledger.currency =",
      "ledger.reference_type =",
      "ledger.reference_id = checkout.id",
      "ledger.amount = checkout.payable_ndp",
      "ledger.actor_user_id = booking.payment_confirmed_by_id",
      "checkout.payment_selected_at <= ledger.created_at",
      "ledger.created_at <= booking.payment_confirmed_at",
      "booking.payment_reference = CONCAT(",
      "booking.payment_note IS NULL",
      "checkout.receipt_confirmed_by_id IS NULL",
      "checkout.receipt_confirmed_at IS NULL",
      "checkout.receipt_confirmation_reason IS NULL",
      "checkout.ledger_transaction_id IS NULL",
      "checkout.receipt_confirmed_by_id IS NOT NULL",
      "checkout.receipt_confirmed_at IS NOT NULL",
      "checkout.payment_selected_at <= checkout.receipt_confirmed_at",
      "checkout.receipt_confirmed_at <= booking.payment_confirmed_at",
      "TRIM(checkout.receipt_confirmation_reason) <>",
      "booking.payment_confirmed_by_id = checkout.receipt_confirmed_by_id",
      "booking.payment_note = checkout.receipt_confirmation_reason",
      "checkout.other_method_code IS NULL",
      "checkout.other_method_label IS NULL",
      "TRIM(checkout.other_method_code) <>",
      "TRIM(checkout.other_method_label) <>"
    ])
      expect(sql).toContain(fragment);

    expect(query.values).toEqual(
      expect.arrayContaining([
        "completed",
        "confirmed",
        "ndp",
        "cash",
        "other",
        "applied",
        "booking_complete_settlement",
        "order_checkout_payment",
        "NDP",
        "checkout:",
        ":ledger:",
        ":technician-receipt",
        ":operations-receipt"
      ])
    );
    expect(query.values).not.toEqual(
      expect.arrayContaining(["TEST_NDP", "ONSITE", "BANK_TRANSFER"])
    );
  });

  it.each([
    [
      "inactive user",
      (item: MemberFixture) => {
        item.userActive = false;
      }
    ],
    [
      "test user",
      (item: MemberFixture) => {
        item.userTest = true;
      }
    ],
    [
      "deleted user",
      (item: MemberFixture) => {
        item.userDeleted = true;
      }
    ],
    [
      "deleted customer",
      (item: MemberFixture) => {
        item.customerDeleted = true;
      }
    ],
    [
      "deleted shop",
      (item: MemberFixture) => {
        item.shopDeleted = true;
      }
    ],
    [
      "deleted membership",
      (item: MemberFixture) => {
        item.membershipDeleted = true;
      }
    ],
    [
      "ended membership",
      (item: MemberFixture) => {
        item.endedAt = evaluatedAt;
      }
    ],
    [
      "future membership",
      (item: MemberFixture) => {
        item.startedAt = new Date(evaluatedAt.getTime() + 1);
      }
    ],
    [
      "deleted card",
      (item: MemberFixture) => {
        item.cardDeleted = true;
      }
    ],
    [
      "expired card",
      (item: MemberFixture) => {
        item.expiresAt = evaluatedAt;
      }
    ],
    [
      "future card",
      (item: MemberFixture) => {
        item.issuedAt = new Date(evaluatedAt.getTime() + 1);
      }
    ],
    [
      "frozen card",
      (item: MemberFixture) => {
        item.cardStatus = "frozen";
      }
    ],
    [
      "void card",
      (item: MemberFixture) => {
        item.cardStatus = "void";
      }
    ]
  ])(
    "excludes a one-field invalid member while retaining the active control: %s",
    (_label, mutate) => {
      const control = coherentMember();
      const malformed = coherentMember(2);
      mutate(malformed);
      expect([control, malformed].filter(isCurrentMember).map((item) => item.userId)).toEqual([1]);
    }
  );

  it("uses inclusive starts/issuance, exclusive ends/expiry, and distinct users across duplicate cards", () => {
    const inclusive = coherentMember(1);
    inclusive.startedAt = evaluatedAt;
    inclusive.issuedAt = evaluatedAt;
    const duplicateCard = { ...inclusive };
    const futureEnd = coherentMember(2);
    futureEnd.endedAt = new Date(evaluatedAt.getTime() + 1);
    futureEnd.expiresAt = new Date(evaluatedAt.getTime() + 1);
    const members = new Set(
      [inclusive, duplicateCard, futureEnd].filter(isCurrentMember).map((item) => item.userId)
    );
    expect([...members]).toEqual([1, 2]);
  });

  it.each([
    [
      "inactive user",
      (item: UtilizerFixture) => {
        item.userActive = false;
      }
    ],
    [
      "test user",
      (item: UtilizerFixture) => {
        item.userTest = true;
      }
    ],
    [
      "deleted user",
      (item: UtilizerFixture) => {
        item.userDeleted = true;
      }
    ],
    [
      "deleted booking",
      (item: UtilizerFixture) => {
        item.bookingDeleted = true;
      }
    ],
    [
      "deleted shop",
      (item: UtilizerFixture) => {
        item.shopDeleted = true;
      }
    ],
    [
      "deleted checkout",
      (item: UtilizerFixture) => {
        item.checkoutDeleted = true;
      }
    ],
    [
      "wrong shop",
      (item: UtilizerFixture) => {
        item.shopId = 92;
      }
    ],
    [
      "cancelled",
      (item: UtilizerFixture) => {
        item.evidence.status = "cancelled";
      }
    ],
    [
      "incomplete",
      (item: UtilizerFixture) => {
        item.evidence.status = "in_service";
      }
    ],
    [
      "refund pending",
      (item: UtilizerFixture) => {
        item.evidence.paymentStatus = "refund_pending";
      }
    ],
    [
      "refunded",
      (item: UtilizerFixture) => {
        item.evidence.paymentStatus = "refunded";
      }
    ],
    [
      "before window",
      (item: UtilizerFixture) => {
        item.evidence.paymentConfirmedAt = new Date(window.fromInclusive.getTime() - 1);
      }
    ],
    [
      "at exclusive end",
      (item: UtilizerFixture) => {
        item.evidence.paymentConfirmedAt = window.toExclusive;
      }
    ]
  ])(
    "excludes invalid utilizer context while retaining the coherent control: %s",
    (_label, mutate) => {
      const control = coherentUtilizer();
      const malformed = coherentUtilizer(2);
      mutate(malformed);
      expect([control, malformed].filter(isEligibleUtilizer).map((item) => item.userId)).toEqual([
        1
      ]);
    }
  );

  it("includes the payment-confirmed lower boundary and de-duplicates repeated formal orders", () => {
    const first = coherentUtilizer(1);
    first.evidence.paymentConfirmedAt = window.fromInclusive;
    first.evidence.checkout.paymentSelectedAt = window.fromInclusive;
    first.evidence.ledger!.createdAt = window.fromInclusive;
    const repeated = structuredClone(first);
    const cash = coherentUtilizer(2);
    cash.evidence = coherentReceipt("cash");
    const other = coherentUtilizer(3);
    other.evidence = coherentReceipt("other", "operations-receipt");
    const users = new Set(
      [first, repeated, cash, other].filter(isEligibleUtilizer).map((item) => item.userId)
    );
    expect([...users]).toEqual([1, 2, 3]);
  });

  it("uses a valid zero row and fails closed for absent, duplicate, or malformed scalars", async () => {
    await expect(
      createReader([{ memberCount: 0, completedCustomerCount: 0 }]).reader.getMembershipFacts(input)
    ).resolves.toEqual({ memberCount: 0, completedCustomerCount: 0 });

    for (const rows of [
      [],
      [
        { memberCount: 1, completedCustomerCount: 1 },
        { memberCount: 1, completedCustomerCount: 1 }
      ],
      [{ memberCount: -1, completedCustomerCount: 1 }],
      [{ memberCount: 1.5, completedCustomerCount: 1 }],
      [{ memberCount: Number.MAX_SAFE_INTEGER + 1, completedCustomerCount: 1 }],
      [{ memberCount: "01", completedCustomerCount: 1 }],
      [{ memberCount: 1, completedCustomerCount: undefined }]
    ]) {
      await expect(createReader(rows).reader.getMembershipFacts(input)).rejects.toThrow(
        "Dashboard membership aggregate must be a non-negative safe integer"
      );
    }
  });

  it.each([
    [
      "refund timestamp",
      (item: PaymentEvidenceFixture) => {
        item.paymentRefundedAt = paidAt;
      }
    ],
    [
      "refund actor",
      (item: PaymentEvidenceFixture) => {
        item.paymentRefundedById = 8;
      }
    ],
    [
      "refund reference",
      (item: PaymentEvidenceFixture) => {
        item.paymentRefundReference = "refund";
      }
    ],
    [
      "refund reason",
      (item: PaymentEvidenceFixture) => {
        item.paymentRefundReason = "refund";
      }
    ],
    [
      "booking amount",
      (item: PaymentEvidenceFixture) => {
        item.paymentAmountJpy = 999;
      }
    ],
    [
      "checkout calculation",
      (item: PaymentEvidenceFixture) => {
        item.checkout.baseAmountJpy = 899;
      }
    ],
    [
      "negative checkout",
      (item: PaymentEvidenceFixture) => {
        item.checkout.discountAmountJpy = -1;
      }
    ],
    [
      "payment method mismatch",
      (item: PaymentEvidenceFixture) => {
        item.checkout.paymentMethod = "cash";
      }
    ],
    [
      "selection missing",
      (item: PaymentEvidenceFixture) => {
        item.checkout.paymentSelectedAt = null;
      }
    ],
    [
      "selection after confirmation",
      (item: PaymentEvidenceFixture) => {
        item.checkout.paymentSelectedAt = new Date("2026-08-30T01:03:00.000Z");
      }
    ],
    [
      "ledger status",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.status = "reversed";
      }
    ],
    [
      "ledger type",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.type = "seed_credit";
      }
    ],
    [
      "test currency",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.currency = "TEST_NDP";
      }
    ],
    [
      "missing currency",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.currency = null;
      }
    ],
    [
      "ledger reference type",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.referenceType = "booking";
      }
    ],
    [
      "ledger reference id",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.referenceId = 42;
      }
    ],
    [
      "ledger amount",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.amount = 999;
      }
    ],
    [
      "ledger actor",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.actorUserId = 8;
      }
    ],
    [
      "ledger deleted",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.deletedAt = paidAt;
      }
    ],
    [
      "ledger before selection",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.createdAt = new Date("2026-08-30T00:59:59.000Z");
      }
    ],
    [
      "ledger after confirmation",
      (item: PaymentEvidenceFixture) => {
        item.ledger!.createdAt = new Date("2026-08-30T01:03:00.000Z");
      }
    ],
    [
      "ledger reference string",
      (item: PaymentEvidenceFixture) => {
        item.paymentReference = "checkout:41:ledger:52";
      }
    ],
    [
      "NDP booking note",
      (item: PaymentEvidenceFixture) => {
        item.paymentNote = "received";
      }
    ],
    [
      "NDP receipt actor",
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmedById = 7;
      }
    ],
    [
      "NDP receipt time",
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmedAt = paidAt;
      }
    ],
    [
      "NDP receipt reason",
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmationReason = "received";
      }
    ],
    [
      "legacy onsite",
      (item: PaymentEvidenceFixture) => {
        item.paymentMethod = "ONSITE";
        item.checkout.paymentMethod = "ONSITE";
      }
    ],
    [
      "legacy bank transfer",
      (item: PaymentEvidenceFixture) => {
        item.paymentMethod = "BANK_TRANSFER";
        item.checkout.paymentMethod = "BANK_TRANSFER";
      }
    ]
  ])(
    "excludes a one-field malformed NDP order while retaining its coherent control: %s",
    (_label, mutate) => {
      const control = coherentNdp();
      const malformed = coherentNdp();
      mutate(malformed);
      expect([control, malformed].filter(isCoherentEvidence)).toEqual([control]);
    }
  );

  it.each([
    [
      "cash ledger id",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.ledgerTransactionId = 51;
      }
    ],
    [
      "cash ledger row",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.ledger = coherentNdp().ledger;
      }
    ],
    [
      "receipt actor missing",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmedById = null;
      }
    ],
    [
      "receipt actor mismatch",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmedById = 8;
      }
    ],
    [
      "receipt time missing",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmedAt = null;
      }
    ],
    [
      "receipt before selection",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmedAt = new Date("2026-08-30T00:59:59.000Z");
      }
    ],
    [
      "receipt after confirmation",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmedAt = new Date("2026-08-30T01:03:00.000Z");
      }
    ],
    [
      "receipt reason missing",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmationReason = null;
      }
    ],
    [
      "receipt reason blank",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.receiptConfirmationReason = " ";
        item.paymentNote = " ";
      }
    ],
    [
      "booking note mismatch",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.paymentNote = "different";
      }
    ],
    [
      "technician reference malformed",
      coherentReceipt("cash", "technician-receipt"),
      (item: PaymentEvidenceFixture) => {
        item.paymentReference = "checkout:41:technician";
      }
    ],
    [
      "operations reference malformed",
      coherentReceipt("cash", "operations-receipt"),
      (item: PaymentEvidenceFixture) => {
        item.paymentReference = "checkout:41:operations";
      }
    ],
    [
      "cash code empty",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.otherMethodCode = "";
      }
    ],
    [
      "cash label empty",
      coherentReceipt("cash"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.otherMethodLabel = "";
      }
    ],
    [
      "other code missing",
      coherentReceipt("other"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.otherMethodCode = null;
      }
    ],
    [
      "other code blank",
      coherentReceipt("other"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.otherMethodCode = " ";
      }
    ],
    [
      "other label missing",
      coherentReceipt("other"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.otherMethodLabel = null;
      }
    ],
    [
      "other label blank",
      coherentReceipt("other"),
      (item: PaymentEvidenceFixture) => {
        item.checkout.otherMethodLabel = " ";
      }
    ]
  ])(
    "excludes one malformed manual-receipt order while retaining its coherent control: %s",
    (_label, control, mutate) => {
      const malformed = structuredClone(control);
      mutate(malformed);
      expect([control, malformed].filter(isCoherentEvidence)).toEqual([control]);
    }
  );

  it("delegates only for shop scope and propagates reader failures", async () => {
    const membershipReader = {
      getMembershipFacts: jest.fn(async () => ({ memberCount: 2, completedCustomerCount: 1 }))
    } satisfies DashboardMembershipReader;
    const common = [
      {} as PrismaClient,
      {
        getFinanceFacts: jest.fn(async () => ({
          platformNetRevenue: { ndp: 0, testNdp: 0 },
          frozen: { ndp: 0, testNdp: 0 },
          userReward: { ndp: 0, testNdp: 0 },
          walletStock: null,
          withdrawn: null,
          shopNdpCost: null,
          bucketPlatformNetRevenueNdp: new Map(),
          bucketFrozenNdp: new Map(),
          bucketShopEstimatedGrossProfitJpy: new Map()
        }))
      },
      { getMerchantFacts: jest.fn(async () => null) },
      { getOperationsFinance: jest.fn() },
      { getCommissionFacts: jest.fn() },
      { getGrowthFacts: jest.fn() },
      membershipReader
    ] as const;
    const repository = new DashboardRepository(...common);
    jest.spyOn(repository, "getActivityFacts").mockResolvedValue({
      current: {
        availableScheduleSlots: 0,
        activeTechnicians: 0,
        registeredTechnicians: 0,
        shopCount: null,
        newCustomers: null,
        pendingOrders: 0,
        serviceGmvJpy: 0,
        completedCustomerCount: 99
      },
      previous: {
        availableScheduleSlots: 0,
        activeTechnicians: 0,
        registeredTechnicians: 0,
        shopCount: null,
        newCustomers: null,
        serviceGmvJpy: 0,
        completedCustomerCount: 88
      },
      buckets: []
    });
    jest.spyOn(repository as never, "getAvailableCities" as never).mockResolvedValue([] as never);

    await expect(repository.getDashboard(input)).resolves.toEqual(
      expect.objectContaining({
        membership: { memberCount: 2, completedCustomerCount: 1 }
      })
    );
    expect(membershipReader.getMembershipFacts).toHaveBeenCalledWith(input);

    const platformInput = { ...input, scope: { kind: "platform" } as const };
    await expect(repository.getDashboard(platformInput)).resolves.toEqual(
      expect.objectContaining({ membership: null })
    );
    expect(membershipReader.getMembershipFacts).toHaveBeenCalledTimes(1);

    membershipReader.getMembershipFacts.mockRejectedValueOnce(new Error("membership unavailable"));
    await expect(repository.getDashboard(input)).rejects.toThrow("membership unavailable");
  });
});
