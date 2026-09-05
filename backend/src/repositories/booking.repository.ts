import {
  BookingOrderStatus as DatabaseBookingOrderStatus,
  OrderPerformanceOutcome,
  OrderPerformanceRevisionAction,
  OrderPerformanceTreatment,
  OrderServiceEventType as DatabaseOrderServiceEventType,
  Prisma,
  ServicePaymentMethod as DatabaseServicePaymentMethod,
  type PrismaClient
} from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { prisma } from "../prisma/client";
import type { LedgerTransactionClient } from "../services/ledger.service";
import { resolveEffectiveCustomerMembershipLevel } from "../services/customer-membership.service";
import type { JapaneseRouteAddress } from "../services/route-distance.provider";
import { hashRouteAddress, normalizeJapaneseRouteAddress } from "../services/route-estimate.service";
import type { AuditLogCreateInput } from "./audit-log.repository";
import { toAuditLogCreateData } from "./audit-log.repository";
import type {
  AffiliateCheckoutPrepared,
  AffiliateCheckoutSummary
} from "../services/affiliate-checkout.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";
import {
  calculateOrderCheckoutSnapshot,
  OrderCheckoutSnapshotError
} from "./order-checkout-calculation";
import {
  classifyAdverseOutcomeInTransaction,
  recalculateTechnicianSummaryInTransaction
} from "./order-performance.repository";

const SERVICE_CODE_DOMAIN = "needo:order-service:verification-code:v1\u0000";
const SERVICE_HASH_DOMAIN = "needo:order-service:verification-hash:v1\u0000";

class FulfillmentTransactionAbort extends Error {}
class CheckoutTransactionAbort extends Error {
  public constructor(public readonly outcome: CheckoutMutationFailure) {
    super(outcome);
  }
}
class ReviewTransactionAbort extends Error {
  public constructor(public readonly outcome: OrderReviewMutationFailure) {
    super(outcome);
  }
}
class BookingTravelEstimateAbort extends Error {
  public constructor(public readonly reason: BookingTravelEstimateFailure) {
    super(reason);
  }
}

export const deriveOrderServiceVerificationCode = (orderId: number): string => {
  const digest = createHmac("sha256", env.AUTH_VERIFICATION_SECRET)
    .update(SERVICE_CODE_DOMAIN)
    .update(String(orderId))
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
};

const hashOrderServiceVerificationCode = (orderId: number, code: string): string =>
  createHmac("sha256", env.AUTH_VERIFICATION_SECRET)
    .update(SERVICE_HASH_DOMAIN)
    .update(String(orderId))
    .update("\u0000")
    .update(code)
    .digest("base64url");

const serviceVerificationCodeMatches = (orderId: number, actualCode: string): boolean => {
  const expected = Buffer.from(
    hashOrderServiceVerificationCode(orderId, deriveOrderServiceVerificationCode(orderId))
  );
  const actual = Buffer.from(hashOrderServiceVerificationCode(orderId, actualCode));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export type BookingOrderStatusPayload =
  | "pending"
  | "confirmed"
  | "inService"
  | "awaitingCheckout"
  | "awaitingPaymentConfirmation"
  | "completed"
  | "cancelled";
export type BookingOrderTypePayload = "booking" | "request";
export type ScheduleSlotStatusPayload = "available" | "booked" | "blocked";
export type BookingFulfillmentMode = "home" | "store";
export type LegacyServicePaymentMethodPayload = "onsite" | "bank_transfer";
export type ServicePaymentMethodPayload =
  | LegacyServicePaymentMethodPayload
  | "cash"
  | "ndp"
  | "other";
export type ServicePaymentStatusPayload = "pending" | "confirmed" | "refundPending" | "refunded";

export interface BookingOrderCustomerPayload {
  userId: number;
  profileId: number | null;
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  membershipLevel: string;
  ratingAverage: string;
  reviewCount: number;
}

const BOOKING_ORDER_STATUS_FROM_DB = {
  [DatabaseBookingOrderStatus.PENDING]: "pending",
  [DatabaseBookingOrderStatus.CONFIRMED]: "confirmed",
  [DatabaseBookingOrderStatus.IN_SERVICE]: "inService",
  [DatabaseBookingOrderStatus.AWAITING_CHECKOUT]: "awaitingCheckout",
  [DatabaseBookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION]: "awaitingPaymentConfirmation",
  [DatabaseBookingOrderStatus.COMPLETED]: "completed",
  [DatabaseBookingOrderStatus.CANCELLED]: "cancelled"
} satisfies Record<DatabaseBookingOrderStatus, BookingOrderStatusPayload>;

const BOOKING_ORDER_STATUS_TO_DB = {
  pending: DatabaseBookingOrderStatus.PENDING,
  confirmed: DatabaseBookingOrderStatus.CONFIRMED,
  inService: DatabaseBookingOrderStatus.IN_SERVICE,
  awaitingCheckout: DatabaseBookingOrderStatus.AWAITING_CHECKOUT,
  awaitingPaymentConfirmation: DatabaseBookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION,
  completed: DatabaseBookingOrderStatus.COMPLETED,
  cancelled: DatabaseBookingOrderStatus.CANCELLED
} satisfies Record<BookingOrderStatusPayload, DatabaseBookingOrderStatus>;

const SERVICE_PAYMENT_METHOD_FROM_DB = {
  [DatabaseServicePaymentMethod.ONSITE]: "onsite",
  [DatabaseServicePaymentMethod.BANK_TRANSFER]: "bank_transfer",
  [DatabaseServicePaymentMethod.CASH]: "cash",
  [DatabaseServicePaymentMethod.NDP]: "ndp",
  [DatabaseServicePaymentMethod.OTHER]: "other"
} satisfies Record<DatabaseServicePaymentMethod, ServicePaymentMethodPayload>;

const SERVICE_PAYMENT_METHOD_TO_DB = {
  onsite: DatabaseServicePaymentMethod.ONSITE,
  bank_transfer: DatabaseServicePaymentMethod.BANK_TRANSFER,
  cash: DatabaseServicePaymentMethod.CASH,
  ndp: DatabaseServicePaymentMethod.NDP,
  other: DatabaseServicePaymentMethod.OTHER
} satisfies Record<ServicePaymentMethodPayload, DatabaseServicePaymentMethod>;

const hasOwnMapping = <TKey extends PropertyKey>(mapping: object, key: PropertyKey): key is TKey =>
  Object.prototype.hasOwnProperty.call(mapping, key);

export const bookingOrderStatusFromDb = (
  status: DatabaseBookingOrderStatus
): BookingOrderStatusPayload => {
  if (!hasOwnMapping<DatabaseBookingOrderStatus>(BOOKING_ORDER_STATUS_FROM_DB, status)) {
    throw new Error("Unsupported database booking order status");
  }
  return BOOKING_ORDER_STATUS_FROM_DB[status];
};

export const bookingOrderStatusToDb = (
  status: BookingOrderStatusPayload
): DatabaseBookingOrderStatus => {
  if (!hasOwnMapping<BookingOrderStatusPayload>(BOOKING_ORDER_STATUS_TO_DB, status)) {
    throw new Error("Unsupported booking order payload status");
  }
  return BOOKING_ORDER_STATUS_TO_DB[status];
};

export const servicePaymentMethodFromDb = (
  method: DatabaseServicePaymentMethod
): ServicePaymentMethodPayload => {
  if (!hasOwnMapping<DatabaseServicePaymentMethod>(SERVICE_PAYMENT_METHOD_FROM_DB, method)) {
    throw new Error("Unsupported database service payment method");
  }
  return SERVICE_PAYMENT_METHOD_FROM_DB[method];
};

export const servicePaymentMethodToDb = (
  method: ServicePaymentMethodPayload
): DatabaseServicePaymentMethod => {
  if (!hasOwnMapping<ServicePaymentMethodPayload>(SERVICE_PAYMENT_METHOD_TO_DB, method)) {
    throw new Error("Unsupported service payment payload method");
  }
  return SERVICE_PAYMENT_METHOD_TO_DB[method];
};

export interface AvailabilityListInput extends PaginationInput {
  serviceId?: number;
  technicianServiceId?: number;
  shopId?: number;
  technicianId?: number;
  includeUnavailable?: boolean;
  from: Date;
  to: Date;
}
export interface BookingCreateRepositoryInput {
  customerUserId: number;
  orderType?: BookingOrderTypePayload;
  serviceId?: number;
  technicianServiceId?: number;
  scheduleSlotId: number;
  fulfillmentMode: BookingFulfillmentMode;
  paymentMethod?: LegacyServicePaymentMethodPayload;
  note?: string | null;
  fulfillmentAddress?: JapaneseRouteAddress;
  travelEstimatePublicId?: string;
}

export interface BookingCreateAffiliatePreparationContext {
  transactionClient: LedgerTransactionClient;
  customerUserId: number;
  shopId: number;
  serviceId: number | null;
  originalPriceJpy: number;
  scheduledStartAt: Date;
}

export interface BookingCreateAffiliatePersistenceContext extends Omit<
  BookingCreateAffiliatePreparationContext,
  "serviceId"
> {
  serviceId: number;
  bookingOrderId: number;
  prepared: AffiliateCheckoutPrepared;
}

export interface BookingSupersededAffiliateInvalidationContext {
  transactionClient: LedgerTransactionClient;
  bookingOrderId: number;
  actorUserId: number;
}

export interface BookingCreateRepositoryOptions {
  prepareAffiliate?: (
    context: BookingCreateAffiliatePreparationContext
  ) => Promise<AffiliateCheckoutPrepared>;
  persistAffiliate?: (context: BookingCreateAffiliatePersistenceContext) => Promise<void>;
  invalidateSupersededAffiliate?: (
    context: BookingSupersededAffiliateInvalidationContext
  ) => Promise<void>;
}

class BookingPendingReplacementUnavailableError extends Error {
  public constructor() {
    super("error.booking.pending_replacement_unavailable");
    this.name = "BookingPendingReplacementUnavailableError";
  }
}

export interface BookingSupersededOrderNotification {
  order: BookingOrderPayload;
  recipientUserIds: number[];
}

export interface BookingCreateMutationResult {
  order: BookingOrderPayload;
  recipientUserIds: number[];
  supersededOrders: BookingSupersededOrderNotification[];
}

export type BookingTravelEstimateFailure = "expired" | "consumed" | "mismatch" | "invalid";
export interface BookingTravelEstimateFailureResult {
  travelEstimateError: BookingTravelEstimateFailure;
}

export type ManualPaymentScope = { scope: "merchant"; shopId: number } | { scope: "backoffice" };

export type ConfirmManualPaymentRepositoryInput = ManualPaymentScope & {
  orderId: number;
  actorUserId: number;
  method: LegacyServicePaymentMethodPayload;
  amountJpy: number;
  reference?: string | null;
  note?: string | null;
};

export type RefundManualPaymentRepositoryInput = ManualPaymentScope & {
  orderId: number;
  actorUserId: number;
  reason: string;
  reference?: string | null;
};

export interface OrderListInput extends PaginationInput {
  customerUserId?: number;
  shopId?: number;
  technicianProfileId?: number;
  status?: BookingOrderStatusPayload;
  from?: Date;
  to?: Date;
}

export type ScheduleScope =
  | { scope: "merchant"; shopId: number }
  | { scope: "technician"; technicianProfileId: number };

export type ScheduleListInput = ScheduleScope &
  PaginationInput & {
    from: Date;
    to: Date;
    serviceId?: number;
    technicianServiceId?: number;
    technicianProfileId?: number;
    status?: ScheduleSlotStatusPayload;
  };

export type ScheduleSlotCreateInput = ScheduleScope & {
  serviceId?: number;
  technicianServiceId?: number;
  technicianProfileId?: number | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
};

export type ScheduleSlotUpdateInput = ScheduleScope & {
  id: number;
  startsAt?: Date;
  endsAt?: Date;
  capacity?: number;
  status?: "available" | "blocked";
};

export type ScheduleSlotDeleteInput = ScheduleScope & { id: number };

export type ScheduleSlotReadInput = ScheduleScope & { id: number };

export type OrderTransitionActorContext = {
  userId: number;
  identityId: number | null;
  identityType: string;
};

export type ScheduleMutationResult =
  | { outcome: "ok"; slot: ScheduleSlotPayload }
  | { outcome: "not_found" | "conflict" | "in_use" | "duration_mismatch" | "suspended" };

interface OrderTransitionRepositoryBaseInput {
  id: number;
  actorUserId: number;
  actor?: OrderTransitionActorContext;
  reason?: string | null;
}

export type OrderTransitionRepositoryInput =
  | (OrderTransitionRepositoryBaseInput & {
      fromStatus: "pending";
      toStatus: "confirmed";
    })
  | (OrderTransitionRepositoryBaseInput & {
      fromStatus: "pending" | "confirmed";
      toStatus: "cancelled";
    });

export interface OrderTransitionSettlementContext {
  transactionClient: LedgerTransactionClient;
  order: BookingOrderPayload;
}

export interface OrderTransitionRepositoryOptions {
  settle?: (context: OrderTransitionSettlementContext) => Promise<void>;
}

export interface ActiveOrderAcceptancePauseSummary {
  subjectType: "merchant_account" | "shop";
  authorityType: "operations" | "merchant" | "shop";
  reasonCode: string;
  startsAt: Date;
}

export interface OrderAcceptancePausedResult {
  kind: "acceptance_paused";
  pauses: ActiveOrderAcceptancePauseSummary[];
}

export type OrderTransitionMutationResult =
  | BookingOrderPayload
  | OrderAcceptancePausedResult
  | null;

export interface ScheduleSlotPayload {
  id: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  shopId: number;
  technicianProfileId: number | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedCount: number;
  status: ScheduleSlotStatusPayload;
  serviceName: string;
  shopName: string;
  technicianName: string | null;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
}

export interface OrderStatusHistoryPayload {
  id: number;
  orderId: number;
  fromStatus: BookingOrderStatusPayload | null;
  toStatus: BookingOrderStatusPayload;
  actorUserId: number | null;
  reason: string | null;
  createdAt: Date;
}

export type OrderAddOnStatusPayload = "proposed" | "accepted" | "rejected";
export type FulfillmentParticipant = "customer" | "technician";

export interface OrderAddOnPayload {
  id: number;
  serviceId: number;
  status: OrderAddOnStatusPayload;
  serviceNameSnapshot: string;
  priceAmountJpy: number;
  currency: "JPY";
  durationMinutes: number;
  serviceSnapshot: unknown;
  proposedBy: FulfillmentParticipant | null;
  proposedAt: Date;
  resolvedBy: FulfillmentParticipant | null;
  resolvedAt: Date | null;
  resolutionReason: string | null;
}

export interface OrderServiceSessionPayload {
  startedAt: Date | null;
  expectedEndsAt: Date | null;
  endedAt: Date | null;
  addOns: OrderAddOnPayload[];
}

export type CheckoutPaymentMethod = "cash" | "ndp" | "other";
export type CheckoutPaymentEvidence =
  | "ndp_ledger"
  | "technician_receipt_confirmation"
  | "operations_receipt_override";

export interface OrderCheckoutPayload {
  id: number;
  orderId: number;
  status: BookingOrderStatusPayload;
  baseAmountJpy: number;
  addOnAmountJpy: number;
  travelFareAmountJpy: number;
  discountAmountJpy: number;
  checkoutAmountJpy: number;
  payableNdp: number;
  rate: {
    ruleId: number;
    publicId: string;
    version: number;
    ndpUnits: number;
    jpyUnits: number;
    effectiveFrom: string;
  };
  calculation: {
    formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount";
    baseAmountJpy: number;
    acceptedAddOnIds: number[];
    addOnAmountJpy: number;
    travelFareAmountJpy: number;
    discountAmountJpy: number;
    checkoutAmountJpy: number;
    rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)";
  };
  paymentMethod: CheckoutPaymentMethod | null;
  paymentSelectedAt: Date | null;
  otherMethod: { code: string; label: string } | null;
  paymentEvidence: CheckoutPaymentEvidence | null;
  receiptConfirmedAt: Date | null;
  receiptConfirmationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderTimelineEventPayload =
  | {
      type: "ORDER_COMMENT_ADDED";
      id: string;
      createdAt: Date;
      actorUserId: number;
      actorDisplayName: string;
      actorAvatarUrl: string | null;
      body: string;
    }
  | {
      type: "ORDER_STATUS_CHANGED";
      id: string;
      createdAt: Date;
      actorUserId: number | null;
      fromStatus: BookingOrderStatusPayload | null;
      toStatus: BookingOrderStatusPayload;
      publicReason: string | null;
    }
  | {
      type:
        | "TECHNICIAN_CANCEL_CLASSIFIED"
        | "TECHNICIAN_UNCOMPLETED_CLASSIFIED"
        | "SPECIAL_CANCELLATION_APPLIED"
        | "SPECIAL_CANCELLATION_REVOKED";
      id: string;
      createdAt: Date;
      actorUserId: number | null;
      publicReason: string | null;
      internalNote?: string;
    };

export interface OrderPerformanceAssessmentPublicPayload {
  id: number;
  bookingOrderId: number;
  technicianProfileId: number;
  outcome: "technician_cancelled" | "technician_uncompleted";
  treatment: "counted" | "special_excluded";
  version: number;
  currentRevisionId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckoutActorInput {
  orderId: number;
  actorUserId: number;
  technicianProfileId: number | null;
}

export interface CheckoutRateSnapshotInput {
  ruleId: number;
  publicId: string;
  version: number;
  ndpUnits: number;
  jpyUnits: number;
  effectiveFrom: Date;
  resolvedAt: Date;
}

export interface GetCheckoutRepositoryInput extends CheckoutActorInput {
  rate: CheckoutRateSnapshotInput | null;
}

export interface SelectCheckoutPaymentMethodRepositoryInput extends CheckoutActorInput {
  method: CheckoutPaymentMethod;
  otherMethodCode?: string;
  otherMethodLabel?: string;
  idempotencyKey: string;
}

export interface PayCheckoutWithNdpRepositoryInput extends CheckoutActorInput {
  idempotencyKey: string;
}

export type ConfirmCheckoutReceiptRepositoryInput = CheckoutActorInput & {
  reason: string;
  idempotencyKey: string;
} & (
    | {
        evidence: "technician_receipt_confirmation";
        audit?: never;
      }
    | {
        evidence: "operations_receipt_override";
        audit: AuditLogCreateInput;
      }
  );

export type CheckoutMutationFailure =
  | "not_found"
  | "invalid_state"
  | "conflict"
  | "invalid_snapshot"
  | "rate_required";
export type CheckoutMutationResult =
  | { outcome: "ok"; checkout: OrderCheckoutPayload; applied: boolean }
  | { outcome: CheckoutMutationFailure };

export interface CheckoutMutationContext {
  transactionClient: LedgerTransactionClient;
  order: BookingOrderPayload;
  checkout: OrderCheckoutPayload;
}

export interface CheckoutNdpPaymentOptions {
  debit: (
    context: CheckoutMutationContext & { idempotencyKey: string }
  ) => Promise<{ transactionId: number }>;
  settle: (context: CheckoutMutationContext) => Promise<void>;
  settleAffiliate: (context: CheckoutMutationContext) => Promise<void>;
}

export interface CheckoutReceiptOptions {
  settle: (context: CheckoutMutationContext) => Promise<void>;
  settleAffiliate: (context: CheckoutMutationContext) => Promise<void>;
}

export type OrderReviewTargetTypePayload = "customer" | "technician";
type ReviewSummaryTargetTypePayload = OrderReviewTargetTypePayload | "shop";
export interface OrderReviewPayload {
  targetType: OrderReviewTargetTypePayload;
  rating: number;
  tags: string[];
  comment: string | null;
  createdAt: Date;
}
export type OrderReviewMutationFailure =
  | "not_found"
  | "invalid_state"
  | "invalid_evidence"
  | "conflict"
  | "already_submitted";
export type OrderReviewMutationResult =
  | { outcome: "ok"; applied: boolean; review: OrderReviewPayload }
  | { outcome: OrderReviewMutationFailure };
export type OrderReviewReadResult =
  | { outcome: "ok"; review: OrderReviewPayload | null }
  | { outcome: "not_found" };
export interface OrderReviewActorInput {
  orderId: number;
  actorUserId: number;
  actor: FulfillmentParticipant;
  technicianProfileId: number | null;
  targetType: OrderReviewTargetTypePayload;
}
export interface CreateOrderReviewRepositoryInput extends OrderReviewActorInput {
  rating: number;
  tags: string[];
  comment: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  audit: AuditLogCreateInput;
}
export interface BookingOrderPayload {
  id: number;
  orderNo: string;
  orderType: BookingOrderTypePayload;
  status: BookingOrderStatusPayload;
  paymentMethod: ServicePaymentMethodPayload;
  paymentStatus: ServicePaymentStatusPayload;
  paymentAmountJpy: number;
  paymentConfirmedById: number | null;
  paymentConfirmedAt: Date | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentRefundedById: number | null;
  paymentRefundedAt: Date | null;
  paymentRefundReference: string | null;
  paymentRefundReason: string | null;
  customerUserId: number;
  customer?: BookingOrderCustomerPayload;
  serviceId: number | null;
  technicianServiceId: number | null;
  shopId: number;
  technicianProfileId: number | null;
  scheduleSlotId: number;
  fulfillmentMode: BookingFulfillmentMode;
  serviceName: string;
  pricingModeSnapshot: "merchant" | "technician";
  serviceOwnerType: "shop" | "technician";
  serviceOwnerId: number | null;
  serviceNameSnapshot: string | null;
  servicePriceSnapshot: string | null;
  serviceDurationSnapshot: number | null;
  serviceSnapshot: unknown;
  fulfillmentAddressSnapshot: FulfillmentAddressSnapshot | null;
  shopName: string;
  technicianName: string | null;
  priceAmount: string;
  currency: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  cancelReason: string | null;
  affiliate: AffiliateCheckoutSummary | null;
  serviceSession?: OrderServiceSessionPayload | null;
  serviceVerificationCode?: string;
  createdAt: Date;
  updatedAt: Date;
  statusHistory: OrderStatusHistoryPayload[];
  performanceAssessment: OrderPerformanceAssessmentPublicPayload | null;
  timelineEvents: OrderTimelineEventPayload[];
}

export type FulfillmentAddressSnapshot = {
  line1: string;
  line2: string | null;
  line3: string | null;
};

export interface FulfillmentRequestContext {
  ip: string;
  userAgent?: string | null;
}

export interface FulfillmentActorInput {
  actorUserId: number;
  actor: FulfillmentParticipant;
  technicianProfileId: number | null;
  requestContext: FulfillmentRequestContext;
}

export interface StartServiceRepositoryInput extends FulfillmentActorInput {
  orderId: number;
  verificationCode: string | null;
  idempotencyKey: string;
}

export interface CreateOrderAddOnRepositoryInput extends FulfillmentActorInput {
  orderId: number;
  serviceId: number;
  idempotencyKey: string;
}

export interface DecideOrderAddOnRepositoryInput extends FulfillmentActorInput {
  orderId: number;
  addOnId: number;
  decision: "accept" | "reject";
  idempotencyKey: string;
}

export interface EndServiceRepositoryInput extends FulfillmentActorInput {
  orderId: number;
  reason: string;
  idempotencyKey: string;
}

type FulfillmentReplayExpectation =
  | { kind: "start" }
  | { kind: "proposal"; serviceId: number }
  | { kind: "decision"; addOnId: number; decision: "accept" | "reject" }
  | { kind: "end"; reason: string };

export type FulfillmentMutationResult =
  | { outcome: "ok"; order: BookingOrderPayload; applied: boolean }
  | {
      outcome:
        | "not_found"
        | "forbidden"
        | "invalid_transition"
        | "verification_failed"
        | "invalid_service"
        | "unresolved_add_on"
        | "conflict";
    };

export type ManualPaymentMutationResult =
  | { outcome: "ok"; order: BookingOrderPayload; applied: boolean }
  | { outcome: "not_found" | "invalid_state" | "amount_mismatch" | "conflict" };

export type OrderTransitionGuardedResult =
  | { outcome: "ok"; order: BookingOrderPayload }
  | { outcome: "acceptance_paused"; pauses: ActiveOrderAcceptancePauseSummary[] }
  | { outcome: "invalid_state" | "schedule_conflict" | "exchange_cancellation_required" };

export interface BookingRepositoryPort {
  listAvailableSlots: (
    input: AvailabilityListInput
  ) => Promise<PaginatedResponse<ScheduleSlotPayload>>;
  createBooking: (
    input: BookingCreateRepositoryInput,
    options?: BookingCreateRepositoryOptions
  ) => Promise<
    BookingCreateMutationResult | BookingOrderPayload | BookingTravelEstimateFailureResult | null
  >;
  findScheduleSlotShopId?: (scheduleSlotId: number) => Promise<number | null>;
  findTechnicianShopId?: (technicianProfileId: number) => Promise<number | null>;
  isShopSuspended?: (shopId: number) => Promise<boolean>;
  listOrders: (input: OrderListInput) => Promise<PaginatedResponse<BookingOrderPayload>>;
  findOrderById: (id: number) => Promise<BookingOrderPayload | null>;
  findOrderRealtimeRecipients?: (
    id: number
  ) => Promise<Array<{ identityId: number; userId: number }>>;
  createOrderTimelineComment?: (input: {
    actorUserId: number;
    body: string;
    orderId: number;
  }) => Promise<BookingOrderPayload | null>;
  getServiceVerificationCode: (orderId: number) => Promise<string>;
  startService: (input: StartServiceRepositoryInput) => Promise<FulfillmentMutationResult>;
  createOrderAddOn: (input: CreateOrderAddOnRepositoryInput) => Promise<FulfillmentMutationResult>;
  decideOrderAddOn: (input: DecideOrderAddOnRepositoryInput) => Promise<FulfillmentMutationResult>;
  endService: (input: EndServiceRepositoryInput) => Promise<FulfillmentMutationResult>;
  getOrCreateCheckout: (input: GetCheckoutRepositoryInput) => Promise<CheckoutMutationResult>;
  selectCheckoutPaymentMethod: (
    input: SelectCheckoutPaymentMethodRepositoryInput
  ) => Promise<CheckoutMutationResult>;
  payCheckoutWithNdp: (
    input: PayCheckoutWithNdpRepositoryInput,
    options: CheckoutNdpPaymentOptions
  ) => Promise<CheckoutMutationResult>;
  confirmCheckoutReceipt: (
    input: ConfirmCheckoutReceiptRepositoryInput,
    options: CheckoutReceiptOptions
  ) => Promise<CheckoutMutationResult>;
  createOrderReview: (
    input: CreateOrderReviewRepositoryInput
  ) => Promise<OrderReviewMutationResult>;
  findOwnOrderReview: (input: OrderReviewActorInput) => Promise<OrderReviewReadResult>;
  transitionOrder: (
    input: OrderTransitionRepositoryInput,
    options?: OrderTransitionRepositoryOptions
  ) => Promise<OrderTransitionMutationResult>;
  transitionOrderWithScheduleGuard?: (
    input: OrderTransitionRepositoryInput,
    options?: OrderTransitionRepositoryOptions
  ) => Promise<OrderTransitionGuardedResult>;
  findScheduleSlotById: (input: ScheduleSlotReadInput) => Promise<ScheduleSlotPayload | null>;
  listScheduleSlots: (input: ScheduleListInput) => Promise<PaginatedResponse<ScheduleSlotPayload>>;
  createScheduleSlot: (input: ScheduleSlotCreateInput) => Promise<ScheduleMutationResult>;
  updateScheduleSlot: (input: ScheduleSlotUpdateInput) => Promise<ScheduleMutationResult>;
  deleteScheduleSlot: (input: ScheduleSlotDeleteInput) => Promise<ScheduleMutationResult>;
  confirmManualPayment: (
    input: ConfirmManualPaymentRepositoryInput
  ) => Promise<ManualPaymentMutationResult>;
  refundManualPayment: (
    input: RefundManualPaymentRepositoryInput
  ) => Promise<ManualPaymentMutationResult>;
}

type DecimalLike = {
  toFixed: (decimalPlaces?: number) => string;
  toString: () => string;
};

type SlotRecord = Prisma.ScheduleSlotGetPayload<{
  include: {
    service: true;
    technicianService: true;
    shop: true;
    technicianProfile: true;
  };
}>;

type OrderRecord = Prisma.BookingOrderGetPayload<{
  include: {
    customer: {
      include: {
        customerProfile: {
          include: {
            mediaAssets: true;
            reviewSummary: true;
          };
        };
      };
    };
    service: true;
    technicianService: true;
    shop: true;
    technicianProfile: true;
    serviceSession: {
      include: {
        addOns: {
          where: { deletedAt: null };
          orderBy: [{ proposedAt: "asc" }, { id: "asc" }];
        };
      };
    };
    statusHistory: {
      orderBy: {
        createdAt: "asc";
      };
    };
    timelineComments: {
      include: { actor: true };
      orderBy: [{ createdAt: "asc" }, { id: "asc" }];
    };
    performanceAssessment: {
      select: {
        id: true;
        bookingOrderId: true;
        technicianProfileId: true;
        outcome: true;
        treatment: true;
        version: true;
        currentRevisionId: true;
        createdAt: true;
        updatedAt: true;
      };
    };
    performanceRevisions: {
      select: {
        id: true;
        action: true;
        actorUserId: true;
        publicReason: true;
        createdAt: true;
      };
      orderBy: [{ createdAt: "asc" }, { id: "asc" }];
    };
    affiliateAttributions: {
      include: {
        claim: {
          select: {
            publicCode: true;
          };
        };
      };
    };
    exchangeMatchParticipant: {
      select: {
        id: true;
      };
    };
    travelFareSnapshot: true;
  };
}>;
type CheckoutRecord = Prisma.OrderCheckoutGetPayload<Record<string, never>>;
const bookingTravelEstimateInclude = {
  policyVersion: { select: { publicId: true, version: true } },
  matchedBand: { select: { maximumDistanceMeters: true } }
};
type BookingTravelEstimateRecord = Prisma.RouteEstimateGetPayload<{
  include: typeof bookingTravelEstimateInclude;
}>;
type OrderReviewRecord = Prisma.OrderReviewGetPayload<{
  include: { tags: true };
}>;

const ACTIVE_ORDER_DB_STATUSES = ["PENDING", "CONFIRMED", "IN_SERVICE"] as const;
const HARD_LOCK_ORDER_DB_STATUSES = ["CONFIRMED", "IN_SERVICE"] as const;

export class BookingRepository implements BookingRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listAvailableSlots(
    input: AvailabilityListInput
  ): Promise<PaginatedResponse<ScheduleSlotPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ScheduleSlotWhereInput = {
      deletedAt: null,
      ...(input.includeUnavailable
        ? {}
        : {
            status: "AVAILABLE",
            bookedCount: { lt: this.client.scheduleSlot.fields.capacity }
          }),
      ...(input.serviceId ? { serviceId: input.serviceId } : {}),
      ...(input.technicianServiceId ? { technicianServiceId: input.technicianServiceId } : {}),
      startsAt: { gte: input.from },
      endsAt: { lte: input.to },
      ...(input.serviceId
        ? {
            service: {
              deletedAt: null,
              status: "published"
            }
          }
        : {}),
      ...(input.technicianServiceId
        ? {
            technicianService: {
              deletedAt: null,
              isActive: true,
              isBookable: true
            }
          }
        : {}),
      shop: {
        deletedAt: null,
        status: "published",
        entitySuspensions: {
          none: { activeKey: { not: null }, status: "active", deletedAt: null }
        }
      },
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.technicianId ? { technicianProfileId: input.technicianId } : {})
    };
    const [list, total] = await Promise.all([
      this.client.scheduleSlot.findMany({
        where,
        include: this.slotInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.scheduleSlot.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((slot) => this.mapSlot(slot)),
      total,
      pagination
    );
  }

  public async findScheduleSlotShopId(scheduleSlotId: number): Promise<number | null> {
    const slot = await this.client.scheduleSlot.findFirst({
      where: { id: scheduleSlotId, deletedAt: null },
      select: { shopId: true }
    });
    return slot?.shopId ?? null;
  }

  public async findTechnicianShopId(technicianProfileId: number): Promise<number | null> {
    const technician = await this.client.technicianProfile.findFirst({
      where: { id: technicianProfileId, deletedAt: null },
      select: { shopId: true }
    });
    return technician?.shopId ?? null;
  }

  public async isShopSuspended(shopId: number): Promise<boolean> {
    return this.isShopSuspendedInTransaction(this.client, shopId);
  }

  public async findScheduleSlotById(
    input: ScheduleSlotReadInput
  ): Promise<ScheduleSlotPayload | null> {
    const slot = await this.client.scheduleSlot.findFirst({
      where: {
        id: input.id,
        deletedAt: null,
        ...this.scheduleScopeWhere(input)
      },
      include: this.slotInclude()
    });

    return slot ? this.mapSlot(slot) : null;
  }

  public async listScheduleSlots(
    input: ScheduleListInput
  ): Promise<PaginatedResponse<ScheduleSlotPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ScheduleSlotWhereInput = {
      deletedAt: null,
      startsAt: { lt: input.to },
      endsAt: { gt: input.from },
      ...(input.scope === "merchant"
        ? {
            shopId: input.shopId,
            ...(input.technicianProfileId ? { technicianProfileId: input.technicianProfileId } : {})
          }
        : { technicianProfileId: input.technicianProfileId }),
      ...(input.serviceId ? { serviceId: input.serviceId } : {}),
      ...(input.technicianServiceId ? { technicianServiceId: input.technicianServiceId } : {}),
      ...(input.status ? { status: this.slotStatusToDb(input.status) } : {})
    };
    const [list, total] = await Promise.all([
      this.client.scheduleSlot.findMany({
        where,
        include: this.slotInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.scheduleSlot.count({ where })
    ]);
    return buildPaginatedResponse(
      list.map((row) => this.mapSlot(row)),
      total,
      pagination
    );
  }

  public createScheduleSlot(input: ScheduleSlotCreateInput): Promise<ScheduleMutationResult> {
    return this.client.$transaction(
      async (transaction) => {
        const target = await this.resolveScheduleTarget(
          transaction,
          input,
          input.serviceId,
          input.technicianServiceId,
          input.technicianProfileId ?? null
        );
        if (!target) return { outcome: "not_found" };
        if (await this.isShopSuspendedInTransaction(transaction, target.shopId))
          return { outcome: "suspended" };
        await this.lockScheduleOwner(transaction, target.shopId, target.technicianProfileId);
        if (!this.matchesServiceDuration(input.startsAt, input.endsAt, target.durationMinutes)) {
          return { outcome: "duration_mismatch" };
        }
        if (
          target.technicianProfileId &&
          (await this.hasConfirmedBookingOverlap(
            transaction,
            target.technicianProfileId,
            input.startsAt,
            input.endsAt
          ))
        ) {
          return { outcome: "conflict" };
        }
        if (
          await this.hasScheduleOverlap(
            transaction,
            target.shopId,
            target.technicianProfileId,
            target.serviceId,
            input.startsAt,
            input.endsAt
          )
        ) {
          return { outcome: "conflict" };
        }
        const availability = await transaction.availability.create({
          data: {
            shopId: target.shopId,
            technicianProfileId: target.technicianProfileId,
            sourceType: input.scope === "technician" ? "TECHNICIAN" : "SHOP",
            visibility: input.scope === "technician" ? "AFFILIATED_SHOPS" : "SHOP_ONLY",
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            capacity: input.capacity,
            isActive: true
          }
        });
        const created = await transaction.scheduleSlot.create({
          data: {
            availabilityId: availability.id,
            serviceId: target.serviceId,
            technicianServiceId: target.technicianServiceId,
            shopId: target.shopId,
            technicianProfileId: target.technicianProfileId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            capacity: input.capacity,
            status: "AVAILABLE"
          },
          include: this.slotInclude()
        });
        return { outcome: "ok", slot: this.mapSlot(created) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public updateScheduleSlot(input: ScheduleSlotUpdateInput): Promise<ScheduleMutationResult> {
    return this.client.$transaction(
      async (transaction) => {
        const existing = await transaction.scheduleSlot.findFirst({
          where: { id: input.id, deletedAt: null, ...this.scheduleScopeWhere(input) },
          include: this.slotInclude()
        });
        if (existing && (await this.isShopSuspendedInTransaction(transaction, existing.shopId)))
          return { outcome: "suspended" };
        if (!existing || (!existing.serviceId && !existing.technicianServiceId))
          return { outcome: "not_found" };
        await this.lockScheduleOwner(transaction, existing.shopId, existing.technicianProfileId);
        const startsAt = input.startsAt ?? existing.startsAt;
        const endsAt = input.endsAt ?? existing.endsAt;
        const capacity = input.capacity ?? existing.capacity;
        const timeChanged =
          startsAt.getTime() !== existing.startsAt.getTime() ||
          endsAt.getTime() !== existing.endsAt.getTime();
        if (
          existing.bookedCount > 0 &&
          (timeChanged || input.status === "blocked" || capacity < existing.bookedCount)
        ) {
          return { outcome: "in_use" };
        }
        if (
          !this.matchesServiceDuration(
            startsAt,
            endsAt,
            existing.service?.durationMinutes ?? existing.technicianService?.durationMinutes ?? 0
          )
        ) {
          return { outcome: "duration_mismatch" };
        }
        if (
          timeChanged &&
          existing.technicianProfileId &&
          (await this.hasConfirmedBookingOverlap(
            transaction,
            existing.technicianProfileId,
            startsAt,
            endsAt,
            existing.id
          ))
        ) {
          return { outcome: "conflict" };
        }
        if (
          timeChanged &&
          (await this.hasScheduleOverlap(
            transaction,
            existing.shopId,
            existing.technicianProfileId,
            existing.serviceId,
            startsAt,
            endsAt,
            existing.id
          ))
        ) {
          return { outcome: "conflict" };
        }
        const requestedStatus = input.status ? this.slotStatusToDb(input.status) : existing.status;
        const status =
          existing.bookedCount >= capacity
            ? "BOOKED"
            : requestedStatus === "BOOKED"
              ? "AVAILABLE"
              : requestedStatus;
        if (existing.availabilityId) {
          await transaction.availability.updateMany({
            where: { id: existing.availabilityId, deletedAt: null },
            data: { startsAt, endsAt, capacity, isActive: status !== "BLOCKED" }
          });
        }
        const updated = await transaction.scheduleSlot.update({
          where: { id: existing.id },
          data: { startsAt, endsAt, capacity, status },
          include: this.slotInclude()
        });
        return { outcome: "ok", slot: this.mapSlot(updated) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public deleteScheduleSlot(input: ScheduleSlotDeleteInput): Promise<ScheduleMutationResult> {
    return this.client.$transaction(
      async (transaction) => {
        const existing = await transaction.scheduleSlot.findFirst({
          where: { id: input.id, deletedAt: null, ...this.scheduleScopeWhere(input) },
          include: this.slotInclude()
        });
        if (!existing) return { outcome: "not_found" };
        await this.lockScheduleOwner(transaction, existing.shopId, existing.technicianProfileId);
        const activeOrders = await transaction.bookingOrder.count({
          where: {
            scheduleSlotId: existing.id,
            deletedAt: null,
            status: { in: [...ACTIVE_ORDER_DB_STATUSES] }
          }
        });
        if (existing.bookedCount > 0 || activeOrders > 0) return { outcome: "in_use" };
        const deletedAt = new Date();
        const deleted = await transaction.scheduleSlot.update({
          where: { id: existing.id },
          data: { status: "BLOCKED", deletedAt },
          include: this.slotInclude()
        });
        if (existing.availabilityId) {
          await transaction.availability.updateMany({
            where: { id: existing.availabilityId, deletedAt: null },
            data: { isActive: false, deletedAt }
          });
        }
        return { outcome: "ok", slot: this.mapSlot(deleted) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public async createBooking(
    input: BookingCreateRepositoryInput,
    options: BookingCreateRepositoryOptions = {}
  ): Promise<BookingCreateMutationResult | BookingTravelEstimateFailureResult | null> {
    if (Boolean(options.prepareAffiliate) !== Boolean(options.persistAffiliate)) {
      throw new Error("error.affiliate.checkout_hook_invalid");
    }
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(
          async (tx) => {
            if (!(await this.lockCustomerUser(tx, input.customerUserId))) {
              return null;
            }
            const customerProfile = await tx.customerProfile.findFirst({
              where: { userId: input.customerUserId, deletedAt: null },
              select: { membershipLevel: true }
            });
            const isBlackMember = customerProfile?.membershipLevel.toLowerCase() === "black";

            let slot = await tx.scheduleSlot.findFirst({
              where: {
                id: input.scheduleSlotId,
                ...(input.serviceId ? { serviceId: input.serviceId } : {}),
                ...(input.technicianServiceId
                  ? { technicianServiceId: input.technicianServiceId }
                  : {}),
                deletedAt: null,
                startsAt: { gt: new Date() },
                status: { in: ["AVAILABLE", "BOOKED"] },
                ...(input.serviceId
                  ? {
                      service: {
                        deletedAt: null,
                        status: "published"
                      }
                    }
                  : {}),
                ...(input.technicianServiceId
                  ? {
                      technicianService: {
                        deletedAt: null,
                        isActive: true,
                        isBookable: true
                      }
                    }
                  : {}),
                shop: {
                  deletedAt: null,
                  status: "published",
                  entitySuspensions: {
                    none: { activeKey: { not: null }, status: "active", deletedAt: null }
                  }
                }
              },
              include: this.slotInclude()
            });

            if (!slot) {
              return null;
            }

            await this.lockScheduleOwner(tx, slot.shopId, slot.technicianProfileId);

            const supersededPendingOrders = !isBlackMember
              ? await tx.bookingOrder.findMany({
                  where: {
                    customerUserId: input.customerUserId,
                    status: "PENDING",
                    deletedAt: null,
                    exchangeMatchParticipant: { is: null }
                  },
                  include: this.orderInclude(),
                  orderBy: { id: "asc" }
                })
              : [];
            const supersededOrderIds = supersededPendingOrders.map((order) => order.id);

            if (supersededOrderIds.length > 0) {
              const cancelled = await tx.bookingOrder.updateMany({
                where: {
                  id: { in: supersededOrderIds },
                  customerUserId: input.customerUserId,
                  status: "PENDING",
                  deletedAt: null,
                  exchangeMatchParticipant: { is: null }
                },
                data: {
                  status: "CANCELLED",
                  cancelReason: "superseded_by_new_pending_order"
                }
              });
              if (cancelled.count !== supersededOrderIds.length) {
                throw new Error("error.booking.pending_replacement_conflict");
              }

              const slotReleaseCounts = new Map<number, number>();
              for (const pendingOrder of supersededPendingOrders) {
                slotReleaseCounts.set(
                  pendingOrder.scheduleSlotId,
                  (slotReleaseCounts.get(pendingOrder.scheduleSlotId) ?? 0) + 1
                );
              }
              for (const [scheduleSlotId, releaseCount] of slotReleaseCounts) {
                const released = await tx.scheduleSlot.updateMany({
                  where: {
                    id: scheduleSlotId,
                    bookedCount: { gte: releaseCount },
                    deletedAt: null
                  },
                  data: {
                    bookedCount: { decrement: releaseCount },
                    status: "AVAILABLE"
                  }
                });
                if (released.count !== 1) {
                  throw new BookingPendingReplacementUnavailableError();
                }
              }
            }

            slot = await tx.scheduleSlot.findFirst({
              where: {
                id: input.scheduleSlotId,
                ...(input.serviceId ? { serviceId: input.serviceId } : {}),
                ...(input.technicianServiceId
                  ? { technicianServiceId: input.technicianServiceId }
                  : {}),
                deletedAt: null,
                startsAt: { gt: new Date() },
                status: "AVAILABLE",
                ...(input.serviceId ? { service: { deletedAt: null, status: "published" } } : {}),
                ...(input.technicianServiceId
                  ? {
                      technicianService: {
                        deletedAt: null,
                        isActive: true,
                        isBookable: true
                      }
                    }
                  : {}),
                shop: {
                  deletedAt: null,
                  status: "published",
                  entitySuspensions: {
                    none: { activeKey: { not: null }, status: "active", deletedAt: null }
                  }
                }
              },
              include: this.slotInclude()
            });
            if (!slot || slot.bookedCount >= slot.capacity) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            const pricingMode = this.pricingModeFromDb(slot.shop.pricingMode);
            const serviceSource =
              pricingMode === "technician"
                ? this.createTechnicianServiceSource(slot, input.technicianServiceId)
                : this.createShopServiceSource(slot, input.serviceId);

            if (!serviceSource) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            let travelEstimate: BookingTravelEstimateRecord | null = null;
            if (input.fulfillmentMode === "home") {
              if (!input.travelEstimatePublicId || !input.fulfillmentAddress) {
                throw new BookingTravelEstimateAbort("invalid");
              }
              await tx.$queryRaw`
                SELECT id FROM route_estimates
                WHERE public_id = ${input.travelEstimatePublicId} AND deleted_at IS NULL
                FOR UPDATE
              `;
              travelEstimate = await tx.routeEstimate.findUnique({
                where: { publicId: input.travelEstimatePublicId },
                include: bookingTravelEstimateInclude
              });
              if (!travelEstimate || travelEstimate.deletedAt) {
                throw new BookingTravelEstimateAbort("invalid");
              }
              if (travelEstimate.consumedAt || travelEstimate.consumedByBookingOrderId) {
                throw new BookingTravelEstimateAbort("consumed");
              }
              const travelValidationAt = new Date();
              if (travelEstimate.expiresAt <= travelValidationAt) {
                throw new BookingTravelEstimateAbort("expired");
              }
              const currentPolicy = await tx.shopTravelFarePolicyVersion.findFirst({
                where: {
                  shopId: slot.shopId,
                  effectiveFrom: { lte: travelValidationAt },
                  deletedAt: null
                },
                select: { id: true },
                orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }]
              });
              const serviceId = serviceSource.affiliateServiceId;
              if (
                !serviceId ||
                travelEstimate.customerUserId !== input.customerUserId ||
                travelEstimate.shopId !== slot.shopId ||
                travelEstimate.serviceId !== serviceId ||
                travelEstimate.policyVersionId !== currentPolicy?.id ||
                travelEstimate.destinationAddressHash !==
                  hashRouteAddress(normalizeJapaneseRouteAddress(input.fulfillmentAddress))
              ) {
                throw new BookingTravelEstimateAbort("mismatch");
              }
            } else if (input.travelEstimatePublicId || input.fulfillmentAddress) {
              throw new BookingTravelEstimateAbort("invalid");
            }

            const conflict = await tx.bookingOrder.findFirst({
              where: {
                deletedAt: null,
                OR: [
                  {
                    customerUserId: input.customerUserId,
                    status: {
                      in: isBlackMember
                        ? [...ACTIVE_ORDER_DB_STATUSES]
                        : [...HARD_LOCK_ORDER_DB_STATUSES]
                    },
                    startsAt: { lt: slot.endsAt },
                    endsAt: { gt: slot.startsAt }
                  },
                  ...(slot.technicianProfileId
                    ? [
                        {
                          scheduleSlotId: { not: slot.id },
                          technicianProfileId: slot.technicianProfileId,
                          status: { in: [...HARD_LOCK_ORDER_DB_STATUSES] },
                          startsAt: { lt: slot.endsAt },
                          endsAt: { gt: slot.startsAt }
                        }
                      ]
                    : [])
                ]
              },
              select: { id: true }
            });

            if (conflict) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }
            if (
              slot.technicianProfileId &&
              (await this.hasExchangeMatchParticipantOverlap(
                tx,
                slot.technicianProfileId,
                slot.startsAt,
                slot.endsAt
              ))
            ) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            if (options.invalidateSupersededAffiliate) {
              for (const bookingOrderId of supersededOrderIds) {
                await options.invalidateSupersededAffiliate({
                  transactionClient: tx,
                  bookingOrderId,
                  actorUserId: input.customerUserId
                });
              }
            }

            const originalPriceJpy = Math.round(Number(serviceSource.priceAmount.toString()));
            const affiliateContext: BookingCreateAffiliatePreparationContext = {
              transactionClient: tx,
              customerUserId: input.customerUserId,
              shopId: slot.shopId,
              serviceId: serviceSource.affiliateServiceId,
              originalPriceJpy,
              scheduledStartAt: slot.startsAt
            };
            const preparedAffiliate = options.prepareAffiliate
              ? await options.prepareAffiliate(affiliateContext)
              : null;
            const finalPriceJpy = preparedAffiliate?.finalPriceJpy ?? originalPriceJpy;

            const nextBookedCount = slot.bookedCount + 1;
            const slotUpdate = await tx.scheduleSlot.updateMany({
              where: {
                id: slot.id,
                deletedAt: null,
                startsAt: { gt: new Date() },
                status: "AVAILABLE",
                bookedCount: { lt: slot.capacity }
              },
              data: {
                bookedCount: { increment: 1 },
                status: nextBookedCount >= slot.capacity ? "BOOKED" : "AVAILABLE"
              }
            });

            if (slotUpdate.count !== 1) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            const order = await tx.bookingOrder.create({
              data: {
                orderNo: this.createOrderNo(),
                orderType: this.orderTypeToDb(input.orderType ?? "booking"),
                customerUserId: input.customerUserId,
                serviceId: serviceSource.serviceId,
                technicianServiceId: serviceSource.technicianServiceId,
                shopId: slot.shopId,
                technicianProfileId: slot.technicianProfileId,
                scheduleSlotId: slot.id,
                status: "PENDING",
                fulfillmentMode: input.fulfillmentMode,
                priceAmount: finalPriceJpy,
                currency: serviceSource.currency,
                pricingModeSnapshot: pricingMode === "technician" ? "TECHNICIAN" : "MERCHANT",
                serviceOwnerType: serviceSource.ownerType === "technician" ? "TECHNICIAN" : "SHOP",
                serviceOwnerId: serviceSource.ownerId,
                serviceNameSnapshot: serviceSource.name,
                servicePriceSnapshot: serviceSource.priceAmount,
                serviceDurationSnapshot: serviceSource.durationMinutes,
                serviceSnapshotJson: serviceSource.snapshot,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                paymentMethod: servicePaymentMethodToDb(input.paymentMethod ?? "onsite"),
                paymentAmountJpy: finalPriceJpy,
                note: input.note?.trim() || null,
                statusHistory: {
                  create: {
                    fromStatus: null,
                    toStatus: "PENDING",
                    actorUserId: input.customerUserId
                  }
                }
              },
              include: this.orderInclude()
            });

            if (travelEstimate && input.fulfillmentAddress) {
              const consumedAt = new Date();
              const consumed = await tx.routeEstimate.updateMany({
                where: {
                  id: travelEstimate.id,
                  consumedAt: null,
                  consumedByBookingOrderId: null,
                  expiresAt: { gt: consumedAt },
                  deletedAt: null
                },
                data: { consumedAt, consumedByBookingOrderId: order.id }
              });
              if (consumed.count !== 1) {
                throw new BookingTravelEstimateAbort("consumed");
              }
              await tx.bookingTravelFareSnapshot.create({
                data: {
                  bookingOrderId: order.id,
                  routeEstimateId: travelEstimate.id,
                  policyVersionId: travelEstimate.policyVersionId,
                  matchedBandId: travelEstimate.matchedBandId,
                  policyVersionPublicId: travelEstimate.policyVersion.publicId,
                  bandMaximumDistanceMeters: travelEstimate.matchedBand.maximumDistanceMeters,
                  providerCode: travelEstimate.providerCode,
                  providerRequestId: travelEstimate.providerRequestId,
                  originAddressHash: travelEstimate.originAddressHash,
                  destinationAddressHash: travelEstimate.destinationAddressHash,
                  fulfillmentAddressJson: normalizeJapaneseRouteAddress(
                    input.fulfillmentAddress
                  ) as unknown as Prisma.InputJsonValue,
                  distanceMeters: travelEstimate.distanceMeters,
                  durationSeconds: travelEstimate.durationSeconds,
                  fareAmountJpy: travelEstimate.fareAmountJpy
                }
              });
            }

            if (supersededOrderIds.length > 0) {
              await tx.orderStatusHistory.createMany({
                data: supersededOrderIds.map((bookingOrderId) => ({
                  bookingOrderId,
                  fromStatus: "PENDING" as const,
                  toStatus: "CANCELLED" as const,
                  actorUserId: input.customerUserId,
                  reason: "superseded_by_new_pending_order",
                  metadata: {
                    supersededByBookingOrderId: order.id
                  }
                }))
              });
            }

            const cancelledOrders =
              supersededOrderIds.length > 0
                ? await tx.bookingOrder.findMany({
                    where: { id: { in: supersededOrderIds }, deletedAt: null },
                    include: this.orderInclude(),
                    orderBy: { id: "asc" }
                  })
                : [];

            const buildResult = (createdOrder: OrderRecord): BookingCreateMutationResult => ({
              order: this.mapOrder(createdOrder),
              recipientUserIds: this.providerUserIds(createdOrder),
              supersededOrders: cancelledOrders.map((cancelledOrder) => ({
                order: this.mapOrder(cancelledOrder),
                recipientUserIds: this.providerUserIds(cancelledOrder)
              }))
            });

            if (preparedAffiliate && options.persistAffiliate) {
              if (!serviceSource.affiliateServiceId) {
                throw new Error("error.affiliate.promotion_scope_mismatch");
              }
              await options.persistAffiliate({
                ...affiliateContext,
                serviceId: serviceSource.affiliateServiceId,
                bookingOrderId: order.id,
                prepared: preparedAffiliate
              });
              const attributedOrder = await tx.bookingOrder.findFirst({
                where: { id: order.id, deletedAt: null },
                include: this.orderInclude()
              });
              if (!attributedOrder) {
                throw new Error("error.order.not_found");
              }
              return buildResult(attributedOrder);
            }

            return buildResult(order);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
        )
      );
    } catch (error) {
      if (error instanceof BookingTravelEstimateAbort) {
        return { travelEstimateError: error.reason };
      }
      if (error instanceof BookingPendingReplacementUnavailableError) {
        return null;
      }
      throw error;
    }
  }

  private async isShopSuspendedInTransaction(
    transaction: Pick<Prisma.TransactionClient, "entitySuspension">,
    shopId: number
  ): Promise<boolean> {
    const suspension = await transaction.entitySuspension.findFirst({
      where: {
        subjectType: "shop",
        shopId,
        activeKey: { not: null },
        status: "active",
        deletedAt: null
      },
      select: { id: true }
    });
    return suspension !== null;
  }

  public async listOrders(input: OrderListInput): Promise<PaginatedResponse<BookingOrderPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.BookingOrderWhereInput = {
      deletedAt: null,
      ...(input.customerUserId ? { customerUserId: input.customerUserId } : {}),
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.technicianProfileId ? { technicianProfileId: input.technicianProfileId } : {}),
      ...(input.status ? { status: bookingOrderStatusToDb(input.status) } : {}),
      ...(input.from && input.to ? { startsAt: { gte: input.from, lt: input.to } } : {})
    };
    const [list, total] = await Promise.all([
      this.client.bookingOrder.findMany({
        where,
        include: this.orderInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }]
      }),
      this.client.bookingOrder.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((order) => ({ ...this.mapOrder(order), fulfillmentAddressSnapshot: null })),
      total,
      pagination
    );
  }

  public async findOrderById(id: number): Promise<BookingOrderPayload | null> {
    const order = await this.client.bookingOrder.findFirst({
      where: {
        id,
        deletedAt: null
      },
      include: this.orderInclude()
    });

    return order ? this.mapOrder(order) : null;
  }

  public async findOrderRealtimeRecipients(
    id: number
  ): Promise<Array<{ identityId: number; userId: number }>> {
    const order = await this.client.bookingOrder.findFirst({
      where: { id, deletedAt: null },
      select: {
        customerUserId: true,
        technicianProfile: { select: { id: true, userId: true } }
      }
    });
    if (!order) return [];

    const customerIdentity = await this.client.userIdentity.findFirst({
      where: {
        userId: order.customerUserId,
        type: { in: ["customer", "user", "u"] },
        isActive: true,
        deletedAt: null
      },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true, userId: true }
    });
    const technicianIdentity = order.technicianProfile
      ? await this.client.userIdentity.findFirst({
          where: {
            userId: order.technicianProfile.userId,
            type: "technician",
            scopeType: "technician_profile",
            scopeId: order.technicianProfile.id,
            isActive: true,
            deletedAt: null
          },
          orderBy: [{ isDefault: "desc" }, { id: "asc" }],
          select: { id: true, userId: true }
        })
      : null;

    return [customerIdentity, technicianIdentity]
      .filter((identity): identity is NonNullable<typeof identity> => identity !== null)
      .map((identity) => ({ identityId: identity.id, userId: identity.userId }));
  }

  public async createOrderTimelineComment(input: {
    actorUserId: number;
    body: string;
    orderId: number;
  }): Promise<BookingOrderPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const order = await transaction.bookingOrder.findFirst({
        where: { id: input.orderId, deletedAt: null },
        select: { id: true }
      });
      if (!order) return null;
      await transaction.orderTimelineComment.create({
        data: {
          actorUserId: input.actorUserId,
          body: input.body,
          bookingOrderId: input.orderId,
          visibility: "participants"
        }
      });
      const updated = await transaction.bookingOrder.findFirst({
        where: { id: input.orderId, deletedAt: null },
        include: this.orderInclude()
      });
      return updated ? this.mapOrder(updated) : null;
    });
  }

  public async getServiceVerificationCode(orderId: number): Promise<string> {
    return deriveOrderServiceVerificationCode(orderId);
  }

  public startService(input: StartServiceRepositoryInput): Promise<FulfillmentMutationResult> {
    const now = new Date();
    return this.runFulfillmentTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      const replay = await this.resolveFulfillmentReplay(
        tx,
        current,
        input,
        DatabaseOrderServiceEventType.SERVICE_STARTED,
        { kind: "start" }
      );
      if (replay) {
        if (replay.outcome !== "ok") return replay;
        if (!current) return { outcome: "not_found" };
        if (!this.fulfillmentActorMatches(current, input)) return { outcome: "forbidden" };
        if (
          input.actor === "technician" &&
          (!input.verificationCode ||
            !serviceVerificationCodeMatches(current.id, input.verificationCode))
        ) {
          return { outcome: "verification_failed" };
        }
        return replay;
      }
      if (!current) return { outcome: "not_found" };
      if (!this.fulfillmentActorMatches(current, input)) return { outcome: "forbidden" };
      if (current.status !== DatabaseBookingOrderStatus.CONFIRMED) {
        return { outcome: "invalid_transition" };
      }
      if (
        input.actor === "technician" &&
        (!input.verificationCode ||
          !serviceVerificationCodeMatches(current.id, input.verificationCode))
      ) {
        return { outcome: "verification_failed" };
      }

      const bookedDurationMinutes = Math.round(
        (current.endsAt.getTime() - current.startsAt.getTime()) / 60_000
      );
      const durationMinutes =
        current.serviceDurationSnapshot && current.serviceDurationSnapshot > 0
          ? current.serviceDurationSnapshot
          : bookedDurationMinutes;
      if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
        return { outcome: "invalid_service" };
      }

      const verificationHash = hashOrderServiceVerificationCode(
        current.id,
        deriveOrderServiceVerificationCode(current.id)
      );
      const existingSession = await tx.orderServiceSession.findUnique({
        where: { bookingOrderId: current.id }
      });
      if (existingSession?.deletedAt || existingSession?.startedAt) {
        return { outcome: "invalid_transition" };
      }
      if (
        existingSession &&
        !this.constantTimeTextEquals(existingSession.verificationHash, verificationHash)
      ) {
        return { outcome: "conflict" };
      }

      const expectedEndsAt = new Date(now.getTime() + durationMinutes * 60_000);
      const session = existingSession
        ? await tx.orderServiceSession.update({
            where: { id: existingSession.id },
            data: {
              verificationHash,
              startedByUserId: input.actorUserId,
              startedAt: now,
              expectedEndsAt
            }
          })
        : await tx.orderServiceSession.create({
            data: {
              bookingOrderId: current.id,
              verificationHash,
              startedByUserId: input.actorUserId,
              startedAt: now,
              expectedEndsAt
            }
          });
      const updated = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          deletedAt: null,
          status: DatabaseBookingOrderStatus.CONFIRMED
        },
        data: { status: DatabaseBookingOrderStatus.IN_SERVICE, updatedAt: now }
      });
      if (updated.count !== 1) throw new FulfillmentTransactionAbort();
      await tx.orderStatusHistory.create({
        data: {
          bookingOrderId: current.id,
          fromStatus: DatabaseBookingOrderStatus.CONFIRMED,
          toStatus: DatabaseBookingOrderStatus.IN_SERVICE,
          actorUserId: input.actorUserId,
          reason: "service_started",
          createdAt: now,
          updatedAt: now
        }
      });
      await tx.orderServiceEvent.create({
        data: {
          bookingOrderId: current.id,
          serviceSessionId: session.id,
          eventType: DatabaseOrderServiceEventType.SERVICE_STARTED,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          metadata: this.fulfillmentEventMetadata(input),
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        }
      });
      return this.fulfillmentSuccess(tx, current.id, true);
    });
  }

  public createOrderAddOn(
    input: CreateOrderAddOnRepositoryInput
  ): Promise<FulfillmentMutationResult> {
    const now = new Date();
    return this.runFulfillmentTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      const replay = await this.resolveFulfillmentReplay(
        tx,
        current,
        input,
        DatabaseOrderServiceEventType.ADD_ON_PROPOSED,
        { kind: "proposal", serviceId: input.serviceId }
      );
      if (replay) return replay;
      if (!current) return { outcome: "not_found" };
      if (!this.fulfillmentActorMatches(current, input)) return { outcome: "forbidden" };
      if (current.status !== DatabaseBookingOrderStatus.IN_SERVICE) {
        return { outcome: "invalid_transition" };
      }
      const session = current.serviceSession;
      if (!session || session.deletedAt || !session.startedAt || session.endedAt) {
        return { outcome: "invalid_transition" };
      }

      const service = await tx.service.findFirst({
        where: {
          id: input.serviceId,
          shopId: current.shopId,
          status: "published",
          deletedAt: null
        },
        select: {
          id: true,
          publicId: true,
          categoryId: true,
          name: true,
          description: true,
          priceAmount: true,
          currency: true,
          durationMinutes: true,
          createdAt: true
        }
      });
      const priceAmountJpy = service ? Number(service.priceAmount.toString()) : Number.NaN;
      if (
        !service ||
        service.currency !== "JPY" ||
        !Number.isSafeInteger(priceAmountJpy) ||
        priceAmountJpy < 0 ||
        !Number.isSafeInteger(service.durationMinutes) ||
        service.durationMinutes <= 0
      ) {
        return { outcome: "invalid_service" };
      }

      const addOn = await tx.orderAddOn.create({
        data: {
          bookingOrderId: current.id,
          serviceSessionId: session.id,
          serviceId: service.id,
          status: "PROPOSED",
          serviceNameSnapshot: service.name,
          priceAmountJpy,
          currency: "JPY",
          durationMinutes: service.durationMinutes,
          serviceSnapshotJson: {
            entityType: "service",
            entityNumericId: service.id,
            serviceId: service.id,
            publicId: service.publicId,
            categoryId: service.categoryId,
            name: service.name,
            description: service.description,
            priceAmountJpy,
            currency: "JPY",
            durationMinutes: service.durationMinutes,
            registeredAt: service.createdAt.toISOString()
          },
          proposedByUserId: input.actorUserId,
          proposedAt: now,
          createdAt: now,
          updatedAt: now
        }
      });
      await tx.orderServiceEvent.create({
        data: {
          bookingOrderId: current.id,
          serviceSessionId: session.id,
          orderAddOnId: addOn.id,
          eventType: DatabaseOrderServiceEventType.ADD_ON_PROPOSED,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          metadata: this.fulfillmentEventMetadata(input, { serviceId: service.id }),
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        }
      });
      return this.fulfillmentSuccess(tx, current.id, true);
    });
  }

  public decideOrderAddOn(
    input: DecideOrderAddOnRepositoryInput
  ): Promise<FulfillmentMutationResult> {
    const now = new Date();
    const eventType =
      input.decision === "accept"
        ? DatabaseOrderServiceEventType.ADD_ON_ACCEPTED
        : DatabaseOrderServiceEventType.ADD_ON_REJECTED;
    return this.runFulfillmentTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      const replay = await this.resolveFulfillmentReplay(tx, current, input, eventType, {
        kind: "decision",
        addOnId: input.addOnId,
        decision: input.decision
      });
      if (replay) return replay;
      if (!current) return { outcome: "not_found" };
      if (!this.fulfillmentActorMatches(current, input)) return { outcome: "forbidden" };
      if (current.status !== DatabaseBookingOrderStatus.IN_SERVICE || !current.serviceSession) {
        return { outcome: "invalid_transition" };
      }
      await tx.$queryRaw`
        SELECT id FROM order_add_ons
        WHERE id = ${input.addOnId} AND booking_order_id = ${current.id} AND deleted_at IS NULL
        FOR UPDATE
      `;
      const addOn = await tx.orderAddOn.findFirst({
        where: {
          id: input.addOnId,
          bookingOrderId: current.id,
          serviceSessionId: current.serviceSession.id,
          deletedAt: null
        }
      });
      if (!addOn) return { outcome: "not_found" };
      if (addOn.status !== "PROPOSED") return { outcome: "invalid_transition" };
      if (addOn.proposedByUserId === input.actorUserId) return { outcome: "forbidden" };
      const expectedEndsAt = current.serviceSession.expectedEndsAt;
      if (input.decision === "accept" && !expectedEndsAt) {
        return { outcome: "invalid_transition" };
      }

      const update = await tx.orderAddOn.updateMany({
        where: { id: addOn.id, status: "PROPOSED", deletedAt: null },
        data:
          input.decision === "accept"
            ? {
                status: "ACCEPTED",
                acceptedByUserId: input.actorUserId,
                acceptedAt: now,
                updatedAt: now
              }
            : {
                status: "REJECTED",
                rejectedByUserId: input.actorUserId,
                rejectedAt: now,
                updatedAt: now
              }
      });
      if (update.count !== 1) return { outcome: "invalid_transition" };
      if (input.decision === "accept" && expectedEndsAt) {
        await tx.orderServiceSession.update({
          where: { id: current.serviceSession.id },
          data: {
            expectedEndsAt: new Date(expectedEndsAt.getTime() + addOn.durationMinutes * 60_000),
            updatedAt: now
          }
        });
      }
      await tx.orderServiceEvent.create({
        data: {
          bookingOrderId: current.id,
          serviceSessionId: current.serviceSession.id,
          orderAddOnId: addOn.id,
          eventType,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          metadata: this.fulfillmentEventMetadata(input, { decision: input.decision }),
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        }
      });
      return this.fulfillmentSuccess(tx, current.id, true);
    });
  }

  public endService(input: EndServiceRepositoryInput): Promise<FulfillmentMutationResult> {
    const now = new Date();
    return this.runFulfillmentTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      const replay = await this.resolveFulfillmentReplay(
        tx,
        current,
        input,
        DatabaseOrderServiceEventType.SERVICE_ENDED,
        { kind: "end", reason: input.reason }
      );
      if (replay) return replay;
      if (!current) return { outcome: "not_found" };
      if (!this.fulfillmentActorMatches(current, input)) return { outcome: "forbidden" };
      if (current.status !== DatabaseBookingOrderStatus.IN_SERVICE || !current.serviceSession) {
        return { outcome: "invalid_transition" };
      }
      const proposedCount = await tx.orderAddOn.count({
        where: {
          bookingOrderId: current.id,
          serviceSessionId: current.serviceSession.id,
          status: "PROPOSED",
          deletedAt: null
        }
      });
      if (proposedCount > 0) return { outcome: "unresolved_add_on" };

      await tx.orderServiceSession.update({
        where: { id: current.serviceSession.id },
        data: { endedByUserId: input.actorUserId, endedAt: now, updatedAt: now }
      });
      const updated = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          status: DatabaseBookingOrderStatus.IN_SERVICE,
          deletedAt: null
        },
        data: { status: DatabaseBookingOrderStatus.AWAITING_CHECKOUT, updatedAt: now }
      });
      if (updated.count !== 1) throw new FulfillmentTransactionAbort();
      await tx.orderStatusHistory.create({
        data: {
          bookingOrderId: current.id,
          fromStatus: DatabaseBookingOrderStatus.IN_SERVICE,
          toStatus: DatabaseBookingOrderStatus.AWAITING_CHECKOUT,
          actorUserId: input.actorUserId,
          reason: input.reason,
          createdAt: now,
          updatedAt: now
        }
      });
      await tx.orderServiceEvent.create({
        data: {
          bookingOrderId: current.id,
          serviceSessionId: current.serviceSession.id,
          eventType: DatabaseOrderServiceEventType.SERVICE_ENDED,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          metadata: this.fulfillmentEventMetadata(input),
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        }
      });
      return this.fulfillmentSuccess(tx, current.id, true);
    });
  }

  public getOrCreateCheckout(input: GetCheckoutRepositoryInput): Promise<CheckoutMutationResult> {
    return this.runCheckoutTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      if (!current || !this.checkoutParticipantMatches(current, input)) {
        return { outcome: "not_found" };
      }
      const existing = await tx.orderCheckout.findUnique({
        where: { bookingOrderId: current.id }
      });
      if (existing && !existing.deletedAt) {
        if (
          current.status !== DatabaseBookingOrderStatus.AWAITING_CHECKOUT &&
          current.status !== DatabaseBookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION &&
          current.status !== DatabaseBookingOrderStatus.COMPLETED
        ) {
          return { outcome: "invalid_state" };
        }
        return {
          outcome: "ok",
          checkout: this.mapCheckout(
            existing,
            current.status,
            await this.resolveStoredCheckoutEvidence(tx, current, existing)
          ),
          applied: false
        };
      }
      if (
        current.status !== DatabaseBookingOrderStatus.AWAITING_CHECKOUT ||
        !current.serviceSession?.endedAt
      ) {
        return { outcome: "invalid_state" };
      }
      if (!input.rate) return { outcome: "rate_required" };

      const calculation = this.calculateCheckout(current, input.rate);
      const now = input.rate.resolvedAt;
      const checkout = await tx.orderCheckout.create({
        data: {
          bookingOrderId: current.id,
          baseAmountJpy: calculation.baseAmountJpy,
          addOnAmountJpy: calculation.addOnAmountJpy,
          travelFareAmountJpy: calculation.travelFareAmountJpy,
          discountAmountJpy: calculation.discountAmountJpy,
          checkoutAmountJpy: calculation.checkoutAmountJpy,
          payableNdp: calculation.payableNdp,
          ndpRateRuleId: input.rate.ruleId,
          rateSnapshotJson: calculation.rate as unknown as Prisma.InputJsonValue,
          calculationSnapshotJson: calculation.calculation as unknown as Prisma.InputJsonValue,
          createdAt: now,
          updatedAt: now
        }
      });
      await tx.orderServiceEvent.create({
        data: {
          bookingOrderId: current.id,
          serviceSessionId: current.serviceSession.id,
          orderCheckoutId: checkout.id,
          eventType: DatabaseOrderServiceEventType.CHECKOUT_CREATED,
          actorUserId: input.actorUserId,
          idempotencyKey: `checkout:${current.id}:created`,
          metadata: {
            checkoutAmountJpy: checkout.checkoutAmountJpy,
            travelFareAmountJpy: checkout.travelFareAmountJpy,
            payableNdp: checkout.payableNdp,
            rateRuleId: checkout.ndpRateRuleId
          },
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        }
      });
      return {
        outcome: "ok",
        checkout: this.mapCheckout(checkout, current.status),
        applied: true
      };
    });
  }

  public selectCheckoutPaymentMethod(
    input: SelectCheckoutPaymentMethodRepositoryInput
  ): Promise<CheckoutMutationResult> {
    return this.runCheckoutTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      const checkout = current
        ? await tx.orderCheckout.findUnique({ where: { bookingOrderId: current.id } })
        : null;
      const replay = await this.resolveCheckoutReplay(tx, current, checkout, input, {
        eventType: DatabaseOrderServiceEventType.PAYMENT_METHOD_SELECTED,
        method: input.method,
        otherMethodCode: input.otherMethodCode?.trim() ?? null,
        otherMethodLabel: input.otherMethodLabel?.trim() ?? null
      });
      if (replay) return replay;
      if (
        !current ||
        !checkout ||
        checkout.deletedAt ||
        current.customerUserId !== input.actorUserId
      ) {
        return { outcome: "not_found" };
      }
      if (!current.serviceSession) return { outcome: "invalid_state" };
      if (current.status !== DatabaseBookingOrderStatus.AWAITING_CHECKOUT) {
        return { outcome: "invalid_state" };
      }
      if (checkout.paymentMethod || checkout.ledgerTransactionId || checkout.receiptConfirmedAt) {
        return { outcome: "invalid_state" };
      }
      const otherMethodCode = input.method === "other" ? input.otherMethodCode?.trim() : null;
      const otherMethodLabel = input.method === "other" ? input.otherMethodLabel?.trim() : null;
      if (input.method === "other" && (!otherMethodCode || !otherMethodLabel)) {
        return { outcome: "invalid_snapshot" };
      }
      const now = new Date();
      const nextStatus =
        input.method === "ndp"
          ? DatabaseBookingOrderStatus.AWAITING_CHECKOUT
          : DatabaseBookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION;
      await tx.orderCheckout.update({
        where: { id: checkout.id },
        data: {
          paymentMethod: servicePaymentMethodToDb(input.method),
          paymentSelectedAt: now,
          otherMethodCode: otherMethodCode ?? null,
          otherMethodLabel: otherMethodLabel ?? null,
          updatedAt: now
        }
      });
      if (current.status !== nextStatus) {
        const updated = await tx.bookingOrder.updateMany({
          where: { id: current.id, status: current.status, deletedAt: null },
          data: { status: nextStatus, updatedAt: now }
        });
        if (updated.count !== 1) throw new CheckoutTransactionAbort("conflict");
        await tx.orderStatusHistory.create({
          data: {
            bookingOrderId: current.id,
            fromStatus: current.status,
            toStatus: nextStatus,
            actorUserId: input.actorUserId,
            reason: "checkout_payment_method_selected",
            createdAt: now,
            updatedAt: now
          }
        });
      }
      await tx.orderServiceEvent.create({
        data: {
          bookingOrderId: current.id,
          serviceSessionId: current.serviceSession.id,
          orderCheckoutId: checkout.id,
          eventType: DatabaseOrderServiceEventType.PAYMENT_METHOD_SELECTED,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          metadata: {
            method: input.method,
            ...(otherMethodCode ? { otherMethodCode } : {}),
            ...(otherMethodLabel ? { otherMethodLabel } : {})
          },
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        }
      });
      const next = await tx.orderCheckout.findUnique({ where: { id: checkout.id } });
      if (!next) throw new CheckoutTransactionAbort("conflict");
      return { outcome: "ok", checkout: this.mapCheckout(next, nextStatus), applied: true };
    });
  }

  public payCheckoutWithNdp(
    input: PayCheckoutWithNdpRepositoryInput,
    options: CheckoutNdpPaymentOptions
  ): Promise<CheckoutMutationResult> {
    if (
      !options ||
      typeof options.debit !== "function" ||
      typeof options.settle !== "function" ||
      typeof options.settleAffiliate !== "function"
    ) {
      return Promise.resolve({ outcome: "invalid_snapshot" });
    }
    return this.runCheckoutTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      const checkout = current
        ? await tx.orderCheckout.findUnique({ where: { bookingOrderId: current.id } })
        : null;
      const replay = await this.resolveCheckoutReplay(tx, current, checkout, input, {
        eventType: DatabaseOrderServiceEventType.NDP_PAYMENT_APPLIED
      });
      if (replay) return replay;
      if (
        !current ||
        !checkout ||
        checkout.deletedAt ||
        current.customerUserId !== input.actorUserId
      ) {
        return { outcome: "not_found" };
      }
      if (!current.serviceSession) return { outcome: "invalid_state" };
      if (
        current.status !== DatabaseBookingOrderStatus.AWAITING_CHECKOUT ||
        (checkout.paymentMethod !== null &&
          checkout.paymentMethod !== DatabaseServicePaymentMethod.NDP) ||
        checkout.ledgerTransactionId ||
        checkout.receiptConfirmedAt
      ) {
        return { outcome: "invalid_state" };
      }
      const before = this.mapCheckout(checkout, current.status);
      const debit = await options.debit({
        transactionClient: tx,
        order: this.mapOrder(current),
        checkout: before,
        idempotencyKey: input.idempotencyKey
      });
      const now = new Date();
      await tx.orderCheckout.update({
        where: { id: checkout.id },
        data: {
          paymentMethod: DatabaseServicePaymentMethod.NDP,
          paymentSelectedAt: checkout.paymentSelectedAt ?? now,
          ledgerTransactionId: debit.transactionId,
          updatedAt: now
        }
      });
      const updated = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          status: DatabaseBookingOrderStatus.AWAITING_CHECKOUT,
          paymentStatus: "PENDING",
          deletedAt: null
        },
        data: {
          status: DatabaseBookingOrderStatus.COMPLETED,
          paymentMethod: DatabaseServicePaymentMethod.NDP,
          paymentStatus: "CONFIRMED",
          paymentAmountJpy: checkout.checkoutAmountJpy,
          paymentConfirmedById: input.actorUserId,
          paymentConfirmedAt: now,
          paymentReference: `checkout:${checkout.id}:ledger:${debit.transactionId}`,
          updatedAt: now
        }
      });
      if (updated.count !== 1) throw new CheckoutTransactionAbort("conflict");
      await this.persistCheckoutCompletionEvidence(tx, current, checkout, input, {
        eventType: DatabaseOrderServiceEventType.NDP_PAYMENT_APPLIED,
        now,
        reason: "checkout_ndp_payment_applied",
        metadata: { paymentEvidence: "ndp_ledger", ledgerTransactionId: debit.transactionId }
      });
      if (current.technicianProfileId !== null) {
        await recalculateTechnicianSummaryInTransaction(tx, current.technicianProfileId, now);
      }
      const context = { transactionClient: tx, order: this.mapOrder(current), checkout: before };
      await options.settle(context);
      await options.settleAffiliate(context);
      const next = await tx.orderCheckout.findUnique({ where: { id: checkout.id } });
      if (!next) throw new CheckoutTransactionAbort("conflict");
      return {
        outcome: "ok",
        checkout: this.mapCheckout(next, DatabaseBookingOrderStatus.COMPLETED),
        applied: true
      };
    });
  }

  public confirmCheckoutReceipt(
    input: ConfirmCheckoutReceiptRepositoryInput,
    options: CheckoutReceiptOptions
  ): Promise<CheckoutMutationResult> {
    const validEvidence =
      input.evidence === "technician_receipt_confirmation" ||
      input.evidence === "operations_receipt_override";
    const hasAudit = Object.prototype.hasOwnProperty.call(input, "audit");
    const validAudit =
      input.evidence === "operations_receipt_override" &&
      hasAudit &&
      input.audit &&
      input.audit.actorId === input.actorUserId &&
      input.audit.action === "backoffice.order.checkout.receipt_override" &&
      input.audit.targetType === "BookingOrder" &&
      input.audit.targetId === input.orderId;
    if (
      !options ||
      typeof options.settle !== "function" ||
      typeof options.settleAffiliate !== "function" ||
      !validEvidence ||
      (input.evidence === "operations_receipt_override" ? !validAudit : hasAudit)
    ) {
      return Promise.resolve({ outcome: "invalid_snapshot" });
    }
    return this.runCheckoutTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      const checkout = current
        ? await tx.orderCheckout.findUnique({ where: { bookingOrderId: current.id } })
        : null;
      const replay = await this.resolveCheckoutReplay(tx, current, checkout, input, {
        eventType: DatabaseOrderServiceEventType.RECEIPT_CONFIRMED,
        reason: input.reason.trim(),
        paymentEvidence: input.evidence
      });
      if (replay) return replay;
      const authorized =
        input.evidence === "operations_receipt_override"
          ? Boolean(current)
          : Boolean(
              current?.technicianProfileId &&
              current.technicianProfile &&
              current.technicianProfileId === input.technicianProfileId &&
              current.technicianProfile.userId === input.actorUserId
            );
      if (!current || !checkout || checkout.deletedAt || !authorized) {
        return { outcome: "not_found" };
      }
      if (!current.serviceSession) return { outcome: "invalid_state" };
      if (
        current.status !== DatabaseBookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION ||
        (checkout.paymentMethod !== DatabaseServicePaymentMethod.CASH &&
          checkout.paymentMethod !== DatabaseServicePaymentMethod.OTHER) ||
        checkout.ledgerTransactionId ||
        checkout.receiptConfirmedAt
      ) {
        return { outcome: "invalid_state" };
      }
      const before = this.mapCheckout(checkout, current.status);
      const now = new Date();
      await tx.orderCheckout.update({
        where: { id: checkout.id },
        data: {
          receiptConfirmedById: input.actorUserId,
          receiptConfirmedAt: now,
          receiptConfirmationReason: input.reason.trim(),
          updatedAt: now
        }
      });
      const updated = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          status: DatabaseBookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION,
          paymentStatus: "PENDING",
          deletedAt: null
        },
        data: {
          status: DatabaseBookingOrderStatus.COMPLETED,
          paymentMethod: checkout.paymentMethod,
          paymentStatus: "CONFIRMED",
          paymentAmountJpy: checkout.checkoutAmountJpy,
          paymentConfirmedById: input.actorUserId,
          paymentConfirmedAt: now,
          paymentReference:
            input.evidence === "operations_receipt_override"
              ? `checkout:${checkout.id}:operations-receipt`
              : `checkout:${checkout.id}:technician-receipt`,
          paymentNote: input.reason.trim(),
          updatedAt: now
        }
      });
      if (updated.count !== 1) throw new CheckoutTransactionAbort("conflict");
      await this.persistCheckoutCompletionEvidence(tx, current, checkout, input, {
        eventType: DatabaseOrderServiceEventType.RECEIPT_CONFIRMED,
        now,
        reason: input.reason.trim(),
        metadata: { paymentEvidence: input.evidence, reason: input.reason.trim() }
      });
      if (current.technicianProfileId !== null) {
        await recalculateTechnicianSummaryInTransaction(tx, current.technicianProfileId, now);
      }
      const context = { transactionClient: tx, order: this.mapOrder(current), checkout: before };
      await options.settle(context);
      await options.settleAffiliate(context);
      if (input.evidence === "operations_receipt_override") {
        const auditMetadata =
          input.audit.metadata &&
          typeof input.audit.metadata === "object" &&
          !Array.isArray(input.audit.metadata)
            ? (input.audit.metadata as Record<string, unknown>)
            : {};
        await tx.auditLog.create({
          data: toAuditLogCreateData({
            ...input.audit,
            metadata: {
              ...auditMetadata,
              orderId: current.id,
              checkoutId: checkout.id,
              selectedMethod: servicePaymentMethodFromDb(checkout.paymentMethod),
              checkoutAmountJpy: checkout.checkoutAmountJpy,
              reason: input.reason.trim()
            }
          })
        });
      }
      const next = await tx.orderCheckout.findUnique({ where: { id: checkout.id } });
      if (!next) throw new CheckoutTransactionAbort("conflict");
      return {
        outcome: "ok",
        checkout: this.mapCheckout(next, DatabaseBookingOrderStatus.COMPLETED, input.evidence),
        applied: true
      };
    });
  }

  public createOrderReview(
    input: CreateOrderReviewRepositoryInput
  ): Promise<OrderReviewMutationResult> {
    if (
      (input.actor !== "customer" && input.actor !== "technician") ||
      (input.targetType !== "customer" && input.targetType !== "technician") ||
      (input.actor === "customer" && input.targetType !== "technician") ||
      (input.actor === "technician" && input.targetType !== "customer")
    ) {
      return Promise.resolve({ outcome: "not_found" });
    }
    return this.runReviewTransaction(async (tx) => {
      await this.lockFulfillmentOrder(tx, input.orderId);
      const current = await this.findFulfillmentOrder(tx, input.orderId);
      if (!current || !this.reviewActorMatches(current, input)) return { outcome: "not_found" };
      if (
        input.audit.actorId !== input.actorUserId ||
        input.audit.action !== "order.review.create" ||
        input.audit.targetType !== "BookingOrder" ||
        input.audit.targetId !== input.orderId
      ) {
        return { outcome: "conflict" };
      }
      if (current.status !== DatabaseBookingOrderStatus.COMPLETED) {
        return { outcome: "invalid_state" };
      }
      const target = await this.resolveAndLockReviewTarget(tx, current, input);
      if (!target || target.userId === input.actorUserId) return { outcome: "not_found" };
      if (input.targetType === "technician") {
        if (current.shop.deletedAt) return { outcome: "not_found" };
        const lockedShops = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM shops
          WHERE id = ${current.shopId} AND deleted_at IS NULL
          FOR UPDATE
        `;
        if (lockedShops.length !== 1) return { outcome: "not_found" };
      }
      const checkout = await tx.orderCheckout.findUnique({ where: { bookingOrderId: current.id } });
      if (!checkout || checkout.deletedAt) return { outcome: "invalid_evidence" };
      try {
        const evidence = await this.resolveStoredCheckoutEvidence(tx, current, checkout);
        if (!evidence) return { outcome: "invalid_evidence" };
      } catch (error) {
        if (error instanceof CheckoutTransactionAbort) return { outcome: "invalid_evidence" };
        throw error;
      }

      const replay = await tx.orderReview.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { tags: { where: { deletedAt: null }, orderBy: { label: "asc" } } }
      });
      if (replay) {
        if (
          replay.idempotencyKey !== input.idempotencyKey ||
          replay.requestFingerprint !== input.requestFingerprint ||
          replay.bookingOrderId !== current.id ||
          replay.reviewerUserId !== input.actorUserId ||
          replay.targetType !== this.reviewTargetTypeToDb(input.targetType)
        ) {
          return { outcome: "conflict" };
        }
        return { outcome: "ok", applied: false, review: this.mapOrderReview(replay) };
      }

      const natural = await tx.orderReview.findUnique({
        where: {
          bookingOrderId_reviewerUserId_targetType: {
            bookingOrderId: current.id,
            reviewerUserId: input.actorUserId,
            targetType: this.reviewTargetTypeToDb(input.targetType)
          }
        },
        select: { id: true }
      });
      if (natural) return { outcome: "already_submitted" };

      const now = new Date();
      const review = await tx.orderReview.create({
        data: {
          bookingOrderId: current.id,
          reviewerUserId: input.actorUserId,
          targetType: this.reviewTargetTypeToDb(input.targetType),
          customerProfileId: input.targetType === "customer" ? target.id : null,
          technicianProfileId: input.targetType === "technician" ? target.id : null,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          rating: input.rating,
          comment: input.comment,
          createdAt: now,
          updatedAt: now
        }
      });
      for (const label of input.tags) {
        await tx.orderReviewTag.create({
          data: { orderReviewId: review.id, label, createdAt: now, updatedAt: now }
        });
      }
      await this.recomputeReviewSummary(tx, input.targetType, target.id, now);
      if (input.targetType === "technician") {
        await this.recomputeReviewSummary(tx, "shop", current.shopId, now);
      }
      await tx.auditLog.create({ data: toAuditLogCreateData(input.audit) });
      const created = await tx.orderReview.findUnique({
        where: { id: review.id },
        include: { tags: { where: { deletedAt: null }, orderBy: { label: "asc" } } }
      });
      if (!created) throw new ReviewTransactionAbort("conflict");
      return { outcome: "ok", applied: true, review: this.mapOrderReview(created) };
    });
  }

  public async findOwnOrderReview(input: OrderReviewActorInput): Promise<OrderReviewReadResult> {
    const current = await this.client.bookingOrder.findFirst({
      where: { id: input.orderId, deletedAt: null },
      include: this.orderInclude()
    });
    if (!current || !this.reviewActorMatches(current, input)) return { outcome: "not_found" };
    const target = await this.resolveReviewTargetForRead(current, input);
    if (!target || target.userId === input.actorUserId) return { outcome: "not_found" };
    const review = await this.client.orderReview.findFirst({
      where: {
        bookingOrderId: current.id,
        reviewerUserId: input.actorUserId,
        targetType: this.reviewTargetTypeToDb(input.targetType),
        deletedAt: null
      },
      include: { tags: { where: { deletedAt: null }, orderBy: { label: "asc" } } }
    });
    return { outcome: "ok", review: review ? this.mapOrderReview(review) : null };
  }

  public async transitionOrder(
    input: OrderTransitionRepositoryInput,
    options: OrderTransitionRepositoryOptions = {}
  ): Promise<OrderTransitionMutationResult> {
    const result = await this.transitionOrderWithScheduleGuard(input, options);
    if (!result) {
      return null;
    }
    if (result.outcome === "ok") {
      return result.order;
    }
    if (result.outcome === "acceptance_paused") {
      return { kind: "acceptance_paused", pauses: result.pauses };
    }
    return null;
  }

  public async transitionOrderWithScheduleGuard(
    input: OrderTransitionRepositoryInput,
    options: OrderTransitionRepositoryOptions = {}
  ): Promise<OrderTransitionGuardedResult> {
    if (!this.isAllowedGenericOrderTransition(input)) {
      return { outcome: "invalid_state" };
    }
    const actor: OrderTransitionActorContext = input.actor ?? {
      userId: input.actorUserId,
      identityId: null,
      identityType: "unknown"
    };
    if (actor.userId !== input.actorUserId) {
      throw new Error("error.order.transition_actor_mismatch");
    }
    return runWithTransactionConflictRetry(() =>
      this.client.$transaction(async (tx) => {
        const current = await tx.bookingOrder.findFirst({
          where: {
            id: input.id,
            deletedAt: null
          },
          include: this.orderInclude()
        });

        if (!current || bookingOrderStatusFromDb(current.status) !== input.fromStatus) {
          return { outcome: "invalid_state" as const };
        }

        if (input.toStatus === "cancelled" && current.exchangeMatchParticipant) {
          return { outcome: "exchange_cancellation_required" as const };
        }

        if (input.toStatus === "confirmed") {
          const pauses = await this.findActiveAcceptancePauses(tx, current.shopId);
          if (pauses.length > 0) {
            return { outcome: "acceptance_paused" as const, pauses };
          }

          if (current.technicianProfileId) {
            await this.lockScheduleOwner(tx, current.shopId, current.technicianProfileId);
            const conflict = await tx.bookingOrder.findFirst({
              where: {
                id: { not: current.id },
                technicianProfileId: current.technicianProfileId,
                status: { in: [...HARD_LOCK_ORDER_DB_STATUSES] },
                startsAt: { lt: current.endsAt },
                endsAt: { gt: current.startsAt },
                deletedAt: null
              },
              select: { id: true }
            });
            if (
              conflict ||
              (await this.hasExchangeMatchParticipantOverlap(
                tx,
                current.technicianProfileId,
                current.startsAt,
                current.endsAt
              ))
            ) {
              return { outcome: "schedule_conflict" as const };
            }
          }
        }

        const update = await tx.bookingOrder.updateMany({
          where: {
            id: input.id,
            deletedAt: null,
            status: bookingOrderStatusToDb(input.fromStatus)
          },
          data: {
            status: bookingOrderStatusToDb(input.toStatus),
            cancelReason: input.toStatus === "cancelled" ? input.reason?.trim() || null : undefined,
            paymentStatus:
              input.toStatus === "cancelled" && current.paymentStatus === "CONFIRMED"
                ? "REFUND_PENDING"
                : undefined
          }
        });

        if (update.count !== 1) {
          return { outcome: "invalid_state" as const };
        }

        if (input.toStatus === "cancelled") {
          await tx.scheduleSlot.updateMany({
            where: {
              id: current.scheduleSlotId,
              bookedCount: { gt: 0 }
            },
            data: {
              bookedCount: { decrement: 1 },
              status: "AVAILABLE"
            }
          });
        }

        await tx.orderStatusHistory.create({
          data: {
            bookingOrderId: input.id,
            fromStatus: bookingOrderStatusToDb(input.fromStatus),
            toStatus: bookingOrderStatusToDb(input.toStatus),
            actorUserId: actor.userId,
            reason: input.reason?.trim() || null
          }
        });

        if (
          input.toStatus === "cancelled" &&
          current.technicianProfileId !== null &&
          current.technicianProfile?.userId === actor.userId
        ) {
          const publicReason = input.reason?.trim() || null;
          const idempotencyKey = `booking-transition:${current.id}:technician-cancelled`;
          const requestFingerprint = createHash("sha256")
            .update(
              JSON.stringify({
                action: "classify_technician_cancelled",
                bookingOrderId: current.id,
                technicianProfileId: current.technicianProfileId,
                actorUserId: actor.userId,
                actorIdentityId: actor.identityId,
                actorIdentityType: actor.identityType,
                publicReason
              })
            )
            .digest("hex");
          const classification = await classifyAdverseOutcomeInTransaction(tx, {
            bookingOrderId: current.id,
            technicianProfileId: current.technicianProfileId,
            outcome: OrderPerformanceOutcome.TECHNICIAN_CANCELLED,
            actorUserId: actor.userId,
            publicReason,
            internalNote: null,
            idempotencyKey,
            requestFingerprint,
            expectedRevision: 0,
            calculatedAt: new Date()
          });
          if (classification.outcome !== "ok") {
            throw new Error("error.order_performance.classification_conflict");
          }
        }

        if (options.settle) {
          await options.settle({
            transactionClient: tx,
            order: this.mapOrder(current)
          });
        }

        const next = await tx.bookingOrder.findFirst({
          where: {
            id: input.id,
            deletedAt: null
          },
          include: this.orderInclude()
        });

        return next
          ? { outcome: "ok" as const, order: this.mapOrder(next) }
          : { outcome: "invalid_state" as const };
      })
    );
  }

  private isAllowedGenericOrderTransition(input: {
    fromStatus: string;
    toStatus: string;
  }): boolean {
    return (
      (input.fromStatus === "pending" && input.toStatus === "confirmed") ||
      ((input.fromStatus === "pending" || input.fromStatus === "confirmed") &&
        input.toStatus === "cancelled")
    );
  }

  public confirmManualPayment(
    input: ConfirmManualPaymentRepositoryInput
  ): Promise<ManualPaymentMutationResult> {
    return this.client.$transaction(async (tx) => {
      const current = await tx.bookingOrder.findFirst({
        where: {
          id: input.orderId,
          deletedAt: null,
          ...this.manualPaymentScopeWhere(input)
        },
        include: this.orderInclude()
      });

      if (!current) {
        return { outcome: "not_found" };
      }
      const formalCheckout = await tx.orderCheckout.findUnique({
        where: { bookingOrderId: current.id }
      });
      if (
        current.serviceSession ||
        (formalCheckout && !formalCheckout.deletedAt) ||
        current.status === DatabaseBookingOrderStatus.AWAITING_CHECKOUT ||
        current.status === DatabaseBookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION
      ) {
        return { outcome: "invalid_state" };
      }

      const amountJpy = Math.round(Number(current.priceAmount.toString()));

      if (input.amountJpy !== amountJpy) {
        return { outcome: "amount_mismatch" };
      }

      const reference = input.reference?.trim() || null;
      const note = input.note?.trim() || null;
      const method = servicePaymentMethodToDb(input.method);

      if (current.paymentStatus === "CONFIRMED") {
        const isSameConfirmation =
          current.paymentMethod === method &&
          current.paymentAmountJpy === input.amountJpy &&
          current.paymentReference === reference &&
          current.paymentNote === note;

        return isSameConfirmation
          ? { outcome: "ok", order: this.mapOrder(current), applied: false }
          : { outcome: "conflict" };
      }

      if (current.paymentStatus !== "PENDING") {
        return { outcome: "conflict" };
      }

      if (
        current.status !== "CONFIRMED" &&
        current.status !== "IN_SERVICE" &&
        current.status !== "COMPLETED"
      ) {
        return { outcome: "invalid_state" };
      }

      const confirmedAt = new Date();
      const update = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          deletedAt: null,
          paymentStatus: "PENDING",
          status: { in: ["CONFIRMED", "IN_SERVICE", "COMPLETED"] }
        },
        data: {
          paymentMethod: method,
          paymentStatus: "CONFIRMED",
          paymentAmountJpy: input.amountJpy,
          paymentConfirmedById: input.actorUserId,
          paymentConfirmedAt: confirmedAt,
          paymentReference: reference,
          paymentNote: note
        }
      });

      if (update.count !== 1) {
        return { outcome: "conflict" };
      }

      const existingFinancial = await tx.orderFinancial.findUnique({
        where: { bookingOrderId: current.id }
      });
      const timeline = this.appendMoneyTimeline(existingFinancial?.moneyTimelineJson, {
        type: "manual_payment_confirmed",
        label: "线下服务收款已确认",
        amountJpy: input.amountJpy,
        actorType: input.scope === "merchant" ? "merchant" : "backoffice",
        occurredAt: confirmedAt.toISOString(),
        status: "confirmed",
        metadata: { method: input.method, reference }
      });
      const financialData = {
        orderType: current.orderType === "REQUEST" ? "request" : "booking",
        customerUserId: current.customerUserId,
        shopId: current.shopId,
        technicianProfileId: current.technicianProfileId,
        serviceAmountJpy: input.amountJpy,
        platformCollectedServiceAmountJpy: 0,
        offlineReportedServiceAmountJpy: input.amountJpy,
        unknownOrUnreportedServiceAmountJpy: 0,
        paymentChannel: input.method === "bank_transfer" ? "bank_transfer" : "offline_cash",
        serviceIncomeStatus: "confirmed",
        serviceIncomeReportedById: input.actorUserId,
        serviceIncomeReportedAt: confirmedAt,
        serviceIncomeConfirmedById: input.actorUserId,
        serviceIncomeConfirmedAt: confirmedAt,
        serviceIncomeNote: note,
        moneyTimelineJson: timeline as Prisma.InputJsonValue,
        deletedAt: null
      };

      await tx.orderFinancial.upsert({
        where: { bookingOrderId: current.id },
        update: financialData,
        create: { bookingOrderId: current.id, ...financialData }
      });

      const next = await tx.bookingOrder.findFirst({
        where: { id: current.id, deletedAt: null },
        include: this.orderInclude()
      });

      return next
        ? { outcome: "ok", order: this.mapOrder(next), applied: true }
        : { outcome: "not_found" };
    });
  }

  public refundManualPayment(
    input: RefundManualPaymentRepositoryInput
  ): Promise<ManualPaymentMutationResult> {
    return this.client.$transaction(async (tx) => {
      const current = await tx.bookingOrder.findFirst({
        where: {
          id: input.orderId,
          deletedAt: null,
          ...this.manualPaymentScopeWhere(input)
        },
        include: this.orderInclude()
      });

      if (!current) {
        return { outcome: "not_found" };
      }
      const formalCheckout = await tx.orderCheckout.findUnique({
        where: { bookingOrderId: current.id }
      });
      if (
        formalCheckout &&
        !formalCheckout.deletedAt &&
        (formalCheckout.ledgerTransactionId !== null ||
          formalCheckout.paymentMethod === DatabaseServicePaymentMethod.NDP)
      ) {
        return { outcome: "invalid_state" };
      }

      const reason = input.reason.trim();
      const reference = input.reference?.trim() || null;

      if (current.paymentStatus === "REFUNDED") {
        const isSameRefund =
          current.paymentRefundReason === reason && current.paymentRefundReference === reference;

        return isSameRefund
          ? { outcome: "ok", order: this.mapOrder(current), applied: false }
          : { outcome: "conflict" };
      }

      const mayRefund =
        (current.paymentStatus === "REFUND_PENDING" && current.status === "CANCELLED") ||
        (current.paymentStatus === "CONFIRMED" && current.status === "COMPLETED");

      if (!mayRefund) {
        return { outcome: "invalid_state" };
      }

      const refundedAt = new Date();
      const update = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          deletedAt: null,
          paymentStatus: current.paymentStatus,
          status: current.status
        },
        data: {
          paymentStatus: "REFUNDED",
          paymentRefundedById: input.actorUserId,
          paymentRefundedAt: refundedAt,
          paymentRefundReference: reference,
          paymentRefundReason: reason
        }
      });

      if (update.count !== 1) {
        return { outcome: "conflict" };
      }

      const existingFinancial = await tx.orderFinancial.findUnique({
        where: { bookingOrderId: current.id }
      });
      const timeline = this.appendMoneyTimeline(existingFinancial?.moneyTimelineJson, {
        type: "manual_payment_refunded",
        label: "线下服务收款已退款",
        amountJpy: current.paymentAmountJpy,
        actorType: input.scope === "merchant" ? "merchant" : "backoffice",
        occurredAt: refundedAt.toISOString(),
        status: "refunded",
        metadata: { reason, reference }
      });

      if (existingFinancial) {
        await tx.orderFinancial.update({
          where: { id: existingFinancial.id },
          data: {
            serviceIncomeStatus: "confirmed",
            settlementStatus: "refunded",
            moneyTimelineJson: timeline as Prisma.InputJsonValue
          }
        });
      }

      const next = await tx.bookingOrder.findFirst({
        where: { id: current.id, deletedAt: null },
        include: this.orderInclude()
      });

      return next
        ? { outcome: "ok", order: this.mapOrder(next), applied: true }
        : { outcome: "not_found" };
    });
  }

  private scheduleScopeWhere(scope: ScheduleScope): Prisma.ScheduleSlotWhereInput {
    return scope.scope === "merchant"
      ? { shopId: scope.shopId }
      : { technicianProfileId: scope.technicianProfileId };
  }

  private manualPaymentScopeWhere(scope: ManualPaymentScope): Prisma.BookingOrderWhereInput {
    return scope.scope === "merchant" ? { shopId: scope.shopId } : {};
  }

  private appendMoneyTimeline(value: Prisma.JsonValue | null | undefined, event: object): object[] {
    return [
      ...(Array.isArray(value)
        ? value.filter((item): item is object => Boolean(item) && typeof item === "object")
        : []),
      event
    ];
  }

  private async resolveScheduleTarget(
    transaction: Prisma.TransactionClient,
    scope: ScheduleScope,
    serviceId: number | undefined,
    technicianServiceId: number | undefined,
    requestedTechnicianProfileId: number | null
  ): Promise<{
    shopId: number;
    technicianProfileId: number | null;
    serviceId: number | null;
    technicianServiceId: number | null;
    durationMinutes: number;
  } | null> {
    if (Boolean(serviceId) === Boolean(technicianServiceId)) return null;
    let shopId: number;
    let technicianProfileId = requestedTechnicianProfileId;
    if (scope.scope === "technician") {
      const technician = await transaction.technicianProfile.findFirst({
        where: {
          id: scope.technicianProfileId,
          deletedAt: null,
          status: "published",
          shopId: { not: null }
        },
        select: { id: true, shopId: true }
      });
      if (!technician?.shopId) return null;
      shopId = technician.shopId;
      technicianProfileId = technician.id;
    } else {
      shopId = scope.shopId;
    }
    const shop = await transaction.shop.findFirst({
      where: { id: shopId, deletedAt: null, status: "published" },
      select: { id: true }
    });
    if (!shop) return null;
    if (technicianServiceId) {
      const technicianService = await transaction.technicianService.findFirst({
        where: {
          id: technicianServiceId,
          shopId,
          deletedAt: null,
          isActive: true,
          isBookable: true
        },
        select: { id: true, technicianId: true, durationMinutes: true }
      });
      if (
        !technicianService ||
        (technicianProfileId && technicianProfileId !== technicianService.technicianId)
      )
        return null;
      technicianProfileId = technicianService.technicianId;
      if (!(await this.hasActiveScheduleAffiliation(transaction, shopId, technicianProfileId)))
        return null;
      return {
        shopId,
        technicianProfileId,
        serviceId: null,
        technicianServiceId: technicianService.id,
        durationMinutes: technicianService.durationMinutes
      };
    }
    const [service, technician] = await Promise.all([
      transaction.service.findFirst({
        where: { id: serviceId, shopId, deletedAt: null, status: "published" },
        select: { id: true, durationMinutes: true }
      }),
      technicianProfileId
        ? this.hasActiveScheduleAffiliation(transaction, shopId, technicianProfileId)
        : Promise.resolve(null)
    ]);
    if (!service || (technicianProfileId && !technician)) return null;
    return {
      shopId,
      technicianProfileId,
      serviceId: service.id,
      technicianServiceId: null,
      durationMinutes: service.durationMinutes
    };
  }

  private async lockScheduleOwner(
    transaction: Prisma.TransactionClient,
    shopId: number,
    technicianProfileId: number | null
  ): Promise<void> {
    const updatedAt = new Date();
    if (technicianProfileId) {
      await transaction.technicianProfile.update({
        where: { id: technicianProfileId },
        data: { updatedAt }
      });
      return;
    }
    await transaction.shop.update({ where: { id: shopId }, data: { updatedAt } });
  }

  private async lockCustomerUser(
    transaction: Prisma.TransactionClient,
    userId: number
  ): Promise<boolean> {
    const rows = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT \`id\` FROM \`users\` WHERE \`id\` = ${userId} AND \`deleted_at\` IS NULL FOR UPDATE`
    );
    return rows.length === 1;
  }

  private async findActiveAcceptancePauses(
    transaction: Prisma.TransactionClient,
    shopId: number
  ): Promise<ActiveOrderAcceptancePauseSummary[]> {
    await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT \`id\` FROM \`shops\` WHERE \`id\` = ${shopId} AND \`deleted_at\` IS NULL FOR UPDATE`
    );
    const at = new Date();
    const memberships = await transaction.$queryRaw<Array<{ merchantAccountId: number }>>(
      Prisma.sql`
        SELECT \`merchant_account_id\` AS \`merchantAccountId\`
        FROM \`merchant_shop_memberships\`
        WHERE \`shop_id\` = ${shopId}
          AND \`active_key\` IS NOT NULL
          AND \`deleted_at\` IS NULL
          AND \`starts_at\` <= ${at}
          AND (\`ends_at\` IS NULL OR \`ends_at\` > ${at})
        ORDER BY \`merchant_account_id\` ASC, \`id\` ASC
        FOR UPDATE
      `
    );
    const merchantAccountIds = Array.from(
      new Set(memberships.map((membership) => membership.merchantAccountId))
    );
    if (merchantAccountIds.length > 0) {
      await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT \`id\` FROM \`merchant_accounts\` WHERE \`id\` IN (${Prisma.join(merchantAccountIds)}) AND \`deleted_at\` IS NULL ORDER BY \`id\` FOR UPDATE`
      );
    }
    const pauses = await transaction.orderAcceptancePause.findMany({
      where: {
        status: "ACTIVE",
        activeKey: { not: null },
        deletedAt: null,
        OR: [
          { subjectType: "SHOP", shopId },
          ...(merchantAccountIds.length > 0
            ? [
                {
                  subjectType: "MERCHANT_ACCOUNT" as const,
                  merchantAccountId: { in: merchantAccountIds }
                }
              ]
            : [])
        ]
      },
      select: {
        subjectType: true,
        authorityType: true,
        reasonCode: true,
        startsAt: true
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }]
    });
    return pauses.map((pause) => ({
      subjectType: pause.subjectType === "SHOP" ? "shop" : "merchant_account",
      authorityType:
        pause.authorityType === "OPERATIONS"
          ? "operations"
          : pause.authorityType === "MERCHANT"
            ? "merchant"
            : "shop",
      reasonCode: pause.reasonCode,
      startsAt: pause.startsAt
    }));
  }

  private providerUserIds(order: OrderRecord): number[] {
    return Array.from(
      new Set(
        [order.shop.ownerUserId, order.technicianProfile?.userId].filter(
          (userId): userId is number => typeof userId === "number"
        )
      )
    );
  }

  private matchesServiceDuration(startsAt: Date, endsAt: Date, durationMinutes: number): boolean {
    return endsAt.getTime() - startsAt.getTime() === durationMinutes * 60_000;
  }

  private async hasScheduleOverlap(
    transaction: Prisma.TransactionClient,
    shopId: number,
    technicianProfileId: number | null,
    serviceId: number | null,
    startsAt: Date,
    endsAt: Date,
    excludeId?: number
  ): Promise<boolean> {
    return Boolean(
      await transaction.scheduleSlot.findFirst({
        where: {
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
          ...(technicianProfileId
            ? { shopId, technicianProfileId }
            : { shopId, serviceId, technicianProfileId: null }),
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt }
        },
        select: { id: true }
      })
    );
  }

  private async hasActiveScheduleAffiliation(
    transaction: Prisma.TransactionClient,
    shopId: number,
    technicianProfileId: number
  ): Promise<boolean> {
    return Boolean(
      await transaction.technicianShopAffiliation.findFirst({
        where: {
          shopId,
          technicianProfileId,
          activeKey: { not: null },
          workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
          endsAt: null,
          deletedAt: null,
          technicianProfile: { deletedAt: null, status: "published" }
        },
        select: { id: true, relationshipType: true }
      })
    );
  }

  private async hasConfirmedBookingOverlap(
    transaction: Prisma.TransactionClient,
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date,
    excludeScheduleSlotId?: number
  ): Promise<boolean> {
    return Boolean(
      await transaction.bookingOrder.findFirst({
        where: {
          technicianProfileId,
          status: { in: [...HARD_LOCK_ORDER_DB_STATUSES] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          deletedAt: null,
          ...(excludeScheduleSlotId ? { scheduleSlotId: { not: excludeScheduleSlotId } } : {})
        },
        select: { id: true }
      })
    );
  }

  private async hasExchangeMatchParticipantOverlap(
    transaction: Prisma.TransactionClient,
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean> {
    return Boolean(
      await transaction.exchangeMatchParticipant.findFirst({
        where: {
          technicianProfileId,
          estimatedStartsAt: { lt: endsAt },
          estimatedEndsAt: { gt: startsAt },
          activeReservationKey: { not: null },
          deletedAt: null
        },
        select: { id: true }
      })
    );
  }

  private slotInclude() {
    return {
      service: true,
      technicianService: true,
      shop: true,
      technicianProfile: true
    };
  }

  private async runFulfillmentTransaction(
    mutation: (transaction: Prisma.TransactionClient) => Promise<FulfillmentMutationResult>
  ): Promise<FulfillmentMutationResult> {
    const operation = () => this.client.$transaction((transaction) => mutation(transaction));
    try {
      return await runWithTransactionConflictRetry(operation);
    } catch (error) {
      if (error instanceof FulfillmentTransactionAbort) {
        return { outcome: "invalid_transition" };
      }
      if (isRetryableTransactionConflict(error)) return { outcome: "conflict" };
      if (!this.isPrismaUniqueConflict(error)) throw error;
      try {
        return await runWithTransactionConflictRetry(operation);
      } catch (replayedError) {
        if (replayedError instanceof FulfillmentTransactionAbort) {
          return { outcome: "invalid_transition" };
        }
        if (
          isRetryableTransactionConflict(replayedError) ||
          this.isPrismaUniqueConflict(replayedError)
        ) {
          return { outcome: "conflict" };
        }
        throw replayedError;
      }
    }
  }

  private async runCheckoutTransaction(
    mutation: (transaction: Prisma.TransactionClient) => Promise<CheckoutMutationResult>
  ): Promise<CheckoutMutationResult> {
    const operation = () => this.client.$transaction((transaction) => mutation(transaction));
    try {
      return await runWithTransactionConflictRetry(operation);
    } catch (error) {
      if (error instanceof CheckoutTransactionAbort) return { outcome: error.outcome };
      if (isRetryableTransactionConflict(error)) return { outcome: "conflict" };
      if (!this.isPrismaUniqueConflict(error)) throw error;
      try {
        return await runWithTransactionConflictRetry(operation);
      } catch (replayedError) {
        if (replayedError instanceof CheckoutTransactionAbort) {
          return { outcome: replayedError.outcome };
        }
        if (
          isRetryableTransactionConflict(replayedError) ||
          this.isPrismaUniqueConflict(replayedError)
        ) {
          return { outcome: "conflict" };
        }
        throw replayedError;
      }
    }
  }

  private async runReviewTransaction(
    mutation: (transaction: Prisma.TransactionClient) => Promise<OrderReviewMutationResult>
  ): Promise<OrderReviewMutationResult> {
    const operation = () => this.client.$transaction((transaction) => mutation(transaction));
    try {
      return await runWithTransactionConflictRetry(operation);
    } catch (error) {
      if (error instanceof ReviewTransactionAbort) return { outcome: error.outcome };
      if (isRetryableTransactionConflict(error)) return { outcome: "conflict" };
      if (!this.isPrismaUniqueConflict(error)) throw error;
      try {
        return await runWithTransactionConflictRetry(operation);
      } catch (replayedError) {
        if (replayedError instanceof ReviewTransactionAbort) {
          return { outcome: replayedError.outcome };
        }
        if (
          isRetryableTransactionConflict(replayedError) ||
          this.isPrismaUniqueConflict(replayedError)
        ) {
          return { outcome: "conflict" };
        }
        throw replayedError;
      }
    }
  }

  private checkoutParticipantMatches(order: OrderRecord, input: CheckoutActorInput): boolean {
    if (order.customerUserId === input.actorUserId && input.technicianProfileId === null) {
      return true;
    }
    return Boolean(
      input.technicianProfileId &&
      order.technicianProfileId === input.technicianProfileId &&
      order.technicianProfile?.userId === input.actorUserId
    );
  }

  private calculateCheckout(current: OrderRecord, rate: CheckoutRateSnapshotInput) {
    try {
      return calculateOrderCheckoutSnapshot(
        {
          currency: current.currency,
          servicePrice: (current.servicePriceSnapshot ?? current.priceAmount).toString(),
          addOns: current.serviceSession?.addOns ?? [],
          affiliateAttribution: current.affiliateAttributions[0] ?? null,
          travelFareAmountJpy: current.travelFareSnapshot?.fareAmountJpy ?? 0
        },
        rate
      );
    } catch (error) {
      if (error instanceof OrderCheckoutSnapshotError) {
        throw new CheckoutTransactionAbort("invalid_snapshot");
      }
      throw error;
    }
  }

  private assertPersistedInt(value: number, maxInt: number): void {
    if (!Number.isInteger(value) || value < 0 || value > maxInt) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
  }

  private async resolveCheckoutReplay(
    transaction: Prisma.TransactionClient,
    current: OrderRecord | null,
    checkout: CheckoutRecord | null,
    input: CheckoutActorInput & { idempotencyKey: string },
    expectation: {
      eventType: DatabaseOrderServiceEventType;
      method?: CheckoutPaymentMethod;
      otherMethodCode?: string | null;
      otherMethodLabel?: string | null;
      reason?: string;
      paymentEvidence?: CheckoutPaymentEvidence;
    }
  ): Promise<CheckoutMutationResult | null> {
    const event = await transaction.orderServiceEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (!event) return null;
    if (
      !this.constantTimeTextEquals(event.idempotencyKey, input.idempotencyKey) ||
      !current ||
      !checkout ||
      event.bookingOrderId !== input.orderId ||
      event.orderCheckoutId !== checkout.id ||
      event.actorUserId !== input.actorUserId ||
      event.eventType !== expectation.eventType
    ) {
      return { outcome: "conflict" };
    }
    const metadata =
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : {};
    if (
      (expectation.method !== undefined && metadata.method !== expectation.method) ||
      (expectation.otherMethodCode !== undefined &&
        (metadata.otherMethodCode ?? null) !== expectation.otherMethodCode) ||
      (expectation.otherMethodLabel !== undefined &&
        (metadata.otherMethodLabel ?? null) !== expectation.otherMethodLabel) ||
      (expectation.reason !== undefined && metadata.reason !== expectation.reason) ||
      (expectation.paymentEvidence !== undefined &&
        metadata.paymentEvidence !== expectation.paymentEvidence)
    ) {
      return { outcome: "conflict" };
    }
    if (
      current.status !== DatabaseBookingOrderStatus.COMPLETED &&
      expectation.eventType !== DatabaseOrderServiceEventType.PAYMENT_METHOD_SELECTED
    ) {
      return { outcome: "conflict" };
    }
    return {
      outcome: "ok",
      checkout: this.mapCheckout(
        checkout,
        current.status,
        await this.resolveStoredCheckoutEvidence(transaction, current, checkout)
      ),
      applied: false
    };
  }

  private async resolveStoredCheckoutEvidence(
    transaction: Prisma.TransactionClient,
    current: OrderRecord,
    checkout: CheckoutRecord
  ): Promise<CheckoutPaymentEvidence | undefined> {
    if (checkout.bookingOrderId !== current.id) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    if (checkout.ledgerTransactionId) {
      if (
        current.status !== DatabaseBookingOrderStatus.COMPLETED ||
        checkout.paymentMethod !== DatabaseServicePaymentMethod.NDP ||
        checkout.receiptConfirmedAt ||
        checkout.receiptConfirmedById ||
        checkout.receiptConfirmationReason
      ) {
        throw new CheckoutTransactionAbort("invalid_snapshot");
      }
      return "ndp_ledger";
    }
    if (!checkout.receiptConfirmedAt) {
      if (
        current.status === DatabaseBookingOrderStatus.COMPLETED ||
        checkout.receiptConfirmedById ||
        checkout.receiptConfirmationReason
      ) {
        throw new CheckoutTransactionAbort("invalid_snapshot");
      }
      return undefined;
    }
    if (
      current.status !== DatabaseBookingOrderStatus.COMPLETED ||
      !checkout.receiptConfirmedById ||
      !checkout.receiptConfirmationReason ||
      (checkout.paymentMethod !== DatabaseServicePaymentMethod.CASH &&
        checkout.paymentMethod !== DatabaseServicePaymentMethod.OTHER)
    ) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    const event = await transaction.orderServiceEvent.findFirst({
      where: {
        bookingOrderId: checkout.bookingOrderId,
        orderCheckoutId: checkout.id,
        eventType: DatabaseOrderServiceEventType.RECEIPT_CONFIRMED,
        deletedAt: null
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }]
    });
    const metadata =
      event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : {};
    const evidence = metadata.paymentEvidence;
    if (
      !event ||
      (evidence !== "operations_receipt_override" &&
        evidence !== "technician_receipt_confirmation") ||
      event.bookingOrderId !== current.id ||
      event.orderCheckoutId !== checkout.id ||
      event.actorUserId !== checkout.receiptConfirmedById ||
      event.reason !== checkout.receiptConfirmationReason ||
      metadata.reason !== checkout.receiptConfirmationReason
    ) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    if (evidence === "technician_receipt_confirmation") {
      if (
        !current.technicianProfileId ||
        !current.technicianProfile ||
        current.technicianProfile.userId !== checkout.receiptConfirmedById
      ) {
        throw new CheckoutTransactionAbort("invalid_snapshot");
      }
      return evidence;
    }
    const audit = await transaction.auditLog.findFirst({
      where: {
        actorId: checkout.receiptConfirmedById,
        action: "backoffice.order.checkout.receipt_override",
        targetType: "BookingOrder",
        targetId: current.id,
        deletedAt: null
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    const auditMetadata =
      audit?.metadata && typeof audit.metadata === "object" && !Array.isArray(audit.metadata)
        ? (audit.metadata as Record<string, unknown>)
        : {};
    if (
      !audit ||
      audit.actorId !== checkout.receiptConfirmedById ||
      audit.action !== "backoffice.order.checkout.receipt_override" ||
      audit.targetType !== "BookingOrder" ||
      audit.targetId !== current.id ||
      auditMetadata.orderId !== current.id ||
      auditMetadata.checkoutId !== checkout.id ||
      auditMetadata.reason !== checkout.receiptConfirmationReason ||
      auditMetadata.selectedMethod !== servicePaymentMethodFromDb(checkout.paymentMethod) ||
      auditMetadata.checkoutAmountJpy !== checkout.checkoutAmountJpy
    ) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    return evidence;
  }

  private async persistCheckoutCompletionEvidence(
    transaction: Prisma.TransactionClient,
    current: OrderRecord,
    checkout: CheckoutRecord,
    input: CheckoutActorInput & { idempotencyKey: string },
    evidence: {
      eventType: DatabaseOrderServiceEventType;
      now: Date;
      reason: string;
      metadata: Prisma.InputJsonObject;
    }
  ): Promise<void> {
    await transaction.orderStatusHistory.create({
      data: {
        bookingOrderId: current.id,
        fromStatus: current.status,
        toStatus: DatabaseBookingOrderStatus.COMPLETED,
        actorUserId: input.actorUserId,
        reason: evidence.reason,
        createdAt: evidence.now,
        updatedAt: evidence.now
      }
    });
    await transaction.orderServiceEvent.create({
      data: {
        bookingOrderId: current.id,
        serviceSessionId: current.serviceSession!.id,
        orderCheckoutId: checkout.id,
        eventType: evidence.eventType,
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
        reason: evidence.reason,
        metadata: evidence.metadata,
        occurredAt: evidence.now,
        createdAt: evidence.now,
        updatedAt: evidence.now
      }
    });
  }

  private mapCheckout(
    checkout: CheckoutRecord,
    status: DatabaseBookingOrderStatus,
    evidenceOverride?: CheckoutPaymentEvidence
  ): OrderCheckoutPayload {
    const rate = checkout.rateSnapshotJson as unknown as OrderCheckoutPayload["rate"];
    const calculation =
      checkout.calculationSnapshotJson as unknown as OrderCheckoutPayload["calculation"];
    if (!rate || typeof rate !== "object" || !calculation || typeof calculation !== "object") {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    const amounts = [
      checkout.baseAmountJpy,
      checkout.addOnAmountJpy,
      checkout.travelFareAmountJpy,
      checkout.discountAmountJpy,
      checkout.checkoutAmountJpy,
      checkout.payableNdp,
      rate.ruleId,
      rate.version,
      rate.ndpUnits,
      rate.jpyUnits
    ];
    if (
      amounts.some((value) => !Number.isInteger(value) || value < 0 || value > 2_147_483_647) ||
      rate.ruleId === 0 ||
      rate.version === 0 ||
      rate.ndpUnits === 0 ||
      rate.jpyUnits === 0 ||
      checkout.baseAmountJpy +
          checkout.addOnAmountJpy +
          checkout.travelFareAmountJpy -
          checkout.discountAmountJpy !==
        checkout.checkoutAmountJpy ||
      BigInt(checkout.payableNdp) !==
        (BigInt(checkout.checkoutAmountJpy) * BigInt(rate.ndpUnits) + BigInt(rate.jpyUnits) - 1n) /
          BigInt(rate.jpyUnits) ||
      calculation.formula !== "base_plus_accepted_add_ons_plus_travel_fare_minus_discount" ||
      calculation.rateFormula !== "ceil(jpy_times_ndp_units_divided_by_jpy_units)" ||
      calculation.baseAmountJpy !== checkout.baseAmountJpy ||
      calculation.addOnAmountJpy !== checkout.addOnAmountJpy ||
      calculation.travelFareAmountJpy !== checkout.travelFareAmountJpy ||
      calculation.discountAmountJpy !== checkout.discountAmountJpy ||
      calculation.checkoutAmountJpy !== checkout.checkoutAmountJpy ||
      !Array.isArray(calculation.acceptedAddOnIds) ||
      calculation.acceptedAddOnIds.some(
        (id) => !Number.isInteger(id) || id <= 0 || id > 2_147_483_647
      )
    ) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    if (
      evidenceOverride === "ndp_ledger" &&
      (!checkout.ledgerTransactionId || checkout.receiptConfirmedAt)
    ) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    if (
      (evidenceOverride === "technician_receipt_confirmation" ||
        evidenceOverride === "operations_receipt_override") &&
      (!checkout.receiptConfirmedAt || checkout.ledgerTransactionId)
    ) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    if (evidenceOverride === undefined && checkout.receiptConfirmedAt) {
      throw new CheckoutTransactionAbort("invalid_snapshot");
    }
    const paymentEvidence: CheckoutPaymentEvidence | null =
      evidenceOverride ?? (checkout.ledgerTransactionId ? "ndp_ledger" : null);
    return {
      id: checkout.id,
      orderId: checkout.bookingOrderId,
      status: bookingOrderStatusFromDb(status),
      baseAmountJpy: checkout.baseAmountJpy,
      addOnAmountJpy: checkout.addOnAmountJpy,
      travelFareAmountJpy: checkout.travelFareAmountJpy,
      discountAmountJpy: checkout.discountAmountJpy,
      checkoutAmountJpy: checkout.checkoutAmountJpy,
      payableNdp: checkout.payableNdp,
      rate,
      calculation,
      paymentMethod: checkout.paymentMethod
        ? (servicePaymentMethodFromDb(checkout.paymentMethod) as CheckoutPaymentMethod)
        : null,
      paymentSelectedAt: checkout.paymentSelectedAt,
      otherMethod:
        checkout.paymentMethod === DatabaseServicePaymentMethod.OTHER &&
        checkout.otherMethodCode &&
        checkout.otherMethodLabel
          ? { code: checkout.otherMethodCode, label: checkout.otherMethodLabel }
          : null,
      paymentEvidence,
      receiptConfirmedAt: checkout.receiptConfirmedAt,
      receiptConfirmationReason: checkout.receiptConfirmationReason,
      createdAt: checkout.createdAt,
      updatedAt: checkout.updatedAt
    };
  }

  private isPrismaUniqueConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown };
    return candidate.code === "P2002";
  }

  private async lockFulfillmentOrder(
    transaction: Prisma.TransactionClient,
    orderId: number
  ): Promise<void> {
    await transaction.$queryRaw`
      SELECT id FROM booking_orders
      WHERE id = ${orderId} AND deleted_at IS NULL
      FOR UPDATE
    `;
  }

  private findFulfillmentOrder(
    transaction: Prisma.TransactionClient,
    orderId: number
  ): Promise<OrderRecord | null> {
    return transaction.bookingOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: this.orderInclude()
    });
  }

  private fulfillmentActorMatches(order: OrderRecord, input: FulfillmentActorInput): boolean {
    if (!order.technicianProfileId || !order.technicianProfile) return false;
    if (input.actor === "customer") {
      return input.technicianProfileId === null && order.customerUserId === input.actorUserId;
    }
    return (
      input.technicianProfileId === order.technicianProfileId &&
      order.technicianProfile.userId === input.actorUserId
    );
  }

  private async resolveFulfillmentReplay(
    transaction: Prisma.TransactionClient,
    current: OrderRecord | null,
    input: FulfillmentActorInput & { idempotencyKey: string },
    eventType: DatabaseOrderServiceEventType,
    expectation: FulfillmentReplayExpectation
  ): Promise<FulfillmentMutationResult | null> {
    const event = await transaction.orderServiceEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (!event) return null;
    const metadata =
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? event.metadata
        : null;
    if (
      event.bookingOrderId !== current?.id ||
      event.eventType !== eventType ||
      event.actorUserId !== input.actorUserId ||
      metadata?.actor !== input.actor
    ) {
      return { outcome: "conflict" };
    }
    if (expectation.kind === "start" && event.orderAddOnId !== null) {
      return { outcome: "conflict" };
    }
    if (expectation.kind === "proposal") {
      if (event.orderAddOnId === null) return { outcome: "conflict" };
      const addOn = await transaction.orderAddOn.findFirst({
        where: {
          id: event.orderAddOnId,
          bookingOrderId: event.bookingOrderId,
          deletedAt: null
        },
        select: { serviceId: true }
      });
      if (!addOn || addOn.serviceId !== expectation.serviceId) {
        return { outcome: "conflict" };
      }
    }
    if (
      expectation.kind === "decision" &&
      (event.orderAddOnId !== expectation.addOnId || metadata?.decision !== expectation.decision)
    ) {
      return { outcome: "conflict" };
    }
    if (expectation.kind === "end" && event.reason !== expectation.reason) {
      return { outcome: "conflict" };
    }
    return current
      ? { outcome: "ok", order: this.mapOrder(current), applied: false }
      : { outcome: "not_found" };
  }

  private async fulfillmentSuccess(
    transaction: Prisma.TransactionClient,
    orderId: number,
    applied: boolean
  ): Promise<FulfillmentMutationResult> {
    const order = await this.findFulfillmentOrder(transaction, orderId);
    return order
      ? { outcome: "ok", order: this.mapOrder(order), applied }
      : { outcome: "not_found" };
  }

  private fulfillmentEventMetadata(
    input: FulfillmentActorInput,
    extra: Record<string, string | number> = {}
  ): Prisma.InputJsonObject {
    return {
      actor: input.actor,
      requestIp: input.requestContext.ip,
      ...(input.requestContext.userAgent
        ? { requestUserAgent: input.requestContext.userAgent }
        : {}),
      ...extra
    };
  }

  private reviewActorMatches(order: OrderRecord, input: OrderReviewActorInput): boolean {
    if (!order.technicianProfileId || !order.technicianProfile) return false;
    if (input.actor === "customer") {
      return (
        input.targetType === "technician" &&
        input.technicianProfileId === null &&
        order.customerUserId === input.actorUserId
      );
    }
    if (input.actor !== "technician") return false;
    return (
      input.targetType === "customer" &&
      input.technicianProfileId === order.technicianProfileId &&
      order.technicianProfile.userId === input.actorUserId
    );
  }

  private async resolveAndLockReviewTarget(
    transaction: Prisma.TransactionClient,
    order: OrderRecord,
    input: OrderReviewActorInput
  ): Promise<{ id: number; userId: number } | null> {
    if (input.targetType === "technician") {
      if (!order.technicianProfile || order.technicianProfile.deletedAt) return null;
      await transaction.$queryRaw`
        SELECT id FROM technician_profiles
        WHERE id = ${order.technicianProfile.id} AND deleted_at IS NULL
        FOR UPDATE
      `;
      const target = await transaction.technicianProfile.findFirst({
        where: { id: order.technicianProfile.id, deletedAt: null },
        select: { id: true, userId: true }
      });
      return target;
    }
    const target = await transaction.customerProfile.findFirst({
      where: { userId: order.customerUserId, deletedAt: null },
      select: { id: true, userId: true }
    });
    if (!target) return null;
    await transaction.$queryRaw`
      SELECT id FROM customer_profiles
      WHERE id = ${target.id} AND deleted_at IS NULL
      FOR UPDATE
    `;
    return transaction.customerProfile.findFirst({
      where: { id: target.id, userId: order.customerUserId, deletedAt: null },
      select: { id: true, userId: true }
    });
  }

  private async resolveReviewTargetForRead(
    order: OrderRecord,
    input: OrderReviewActorInput
  ): Promise<{ id: number; userId: number } | null> {
    if (input.targetType === "technician") {
      return order.technicianProfile && !order.technicianProfile.deletedAt
        ? { id: order.technicianProfile.id, userId: order.technicianProfile.userId }
        : null;
    }
    return this.client.customerProfile.findFirst({
      where: { userId: order.customerUserId, deletedAt: null },
      select: { id: true, userId: true }
    });
  }

  private async recomputeReviewSummary(
    transaction: Prisma.TransactionClient,
    targetType: ReviewSummaryTargetTypePayload,
    targetId: number,
    now: Date
  ): Promise<void> {
    const reviews = await transaction.orderReview.findMany({
      where: {
        targetType: targetType === "shop" ? "TECHNICIAN" : this.reviewTargetTypeToDb(targetType),
        ...(targetType === "shop"
          ? { bookingOrder: { shopId: targetId, deletedAt: null } }
          : targetType === "technician"
            ? { technicianProfileId: targetId }
            : { customerProfileId: targetId }),
        deletedAt: null
      },
      include: { tags: { where: { deletedAt: null } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    if (reviews.length === 0) throw new ReviewTransactionAbort("conflict");
    const latestReviewAt = reviews.reduce(
      (latest, review) => (review.createdAt > latest ? review.createdAt : latest),
      reviews[0]!.createdAt
    );
    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    const tagCounts = new Map<string, number>();
    for (const review of reviews) {
      for (const tag of review.tags) {
        tagCounts.set(tag.label, (tagCounts.get(tag.label) ?? 0) + 1);
      }
    }
    const highlights = [...tagCounts.entries()]
      .sort(
        ([left, leftCount], [right, rightCount]) =>
          rightCount - leftCount || this.compareUtf8Bytes(left, right)
      )
      .slice(0, 5)
      .map(([label]) => label);
    await transaction.reviewSummary.upsert({
      where: { targetType_targetId: { targetType, targetId } },
      create: {
        targetType,
        targetId,
        shopId: targetType === "shop" ? targetId : null,
        serviceId: null,
        technicianProfileId: targetType === "technician" ? targetId : null,
        customerProfileId: targetType === "customer" ? targetId : null,
        ratingAverage: average,
        reviewCount: reviews.length,
        latestReviewAt,
        highlights,
        createdAt: now,
        updatedAt: now
      },
      update: {
        shopId: targetType === "shop" ? targetId : null,
        serviceId: null,
        technicianProfileId: targetType === "technician" ? targetId : null,
        customerProfileId: targetType === "customer" ? targetId : null,
        ratingAverage: average,
        reviewCount: reviews.length,
        latestReviewAt,
        highlights,
        deletedAt: null,
        updatedAt: now
      }
    });
  }

  private mapOrderReview(review: OrderReviewRecord): OrderReviewPayload {
    return {
      targetType: review.targetType === "TECHNICIAN" ? "technician" : "customer",
      rating: review.rating,
      tags: review.tags
        .filter((tag) => !tag.deletedAt)
        .map((tag) => tag.label)
        .sort((left, right) => this.compareUtf8Bytes(left, right)),
      comment: review.comment,
      createdAt: review.createdAt
    };
  }

  private reviewTargetTypeToDb(targetType: OrderReviewTargetTypePayload) {
    return targetType === "technician" ? ("TECHNICIAN" as const) : ("CUSTOMER" as const);
  }

  private compareUtf8Bytes(left: string, right: string): number {
    return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
  }

  private constantTimeTextEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private orderInclude() {
    return {
      customer: {
        include: {
          customerProfile: {
            include: {
              mediaAssets: {
                where: { usageType: "avatar", isActive: true, deletedAt: null },
                orderBy: { id: "desc" as const },
                take: 1
              },
              reviewSummary: true
            }
          }
        }
      },
      service: true,
      technicianService: true,
      shop: true,
      technicianProfile: true,
      serviceSession: {
        include: {
          addOns: {
            where: { deletedAt: null },
            orderBy: [{ proposedAt: "asc" as const }, { id: "asc" as const }]
          }
        }
      },
      statusHistory: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" as const }
      },
      timelineComments: {
        where: { visibility: "participants", deletedAt: null },
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        include: { actor: true }
      },
      performanceAssessment: {
        select: {
          id: true,
          bookingOrderId: true,
          technicianProfileId: true,
          outcome: true,
          treatment: true,
          version: true,
          currentRevisionId: true,
          createdAt: true,
          updatedAt: true
        }
      },
      performanceRevisions: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          action: true,
          actorUserId: true,
          publicReason: true,
          createdAt: true
        }
      },
      affiliateAttributions: {
        where: { deletedAt: null },
        orderBy: { id: "desc" as const },
        take: 1,
        include: {
          claim: {
            select: { publicCode: true }
          }
        }
      },
      exchangeMatchParticipant: {
        select: { id: true }
      },
      travelFareSnapshot: true
    };
  }

  private mapSlot(slot: SlotRecord): ScheduleSlotPayload {
    const serviceName = slot.service?.name ?? slot.technicianService?.name ?? "Unknown service";
    const priceAmount = slot.service?.priceAmount ?? slot.technicianService?.priceAmount ?? 0;
    const currency = slot.service?.currency ?? slot.technicianService?.currency ?? "JPY";
    const durationMinutes =
      slot.service?.durationMinutes ?? slot.technicianService?.durationMinutes ?? 0;

    return {
      id: slot.id,
      serviceId: slot.serviceId,
      technicianServiceId: slot.technicianServiceId,
      shopId: slot.shopId,
      technicianProfileId: slot.technicianProfileId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: slot.capacity,
      bookedCount: slot.bookedCount,
      status: this.slotStatusFromDb(slot.status),
      serviceName,
      shopName: slot.shop.name,
      technicianName: slot.technicianProfile?.displayName ?? null,
      priceAmount: this.formatDecimal(priceAmount, 2),
      currency,
      durationMinutes
    };
  }

  private mapOrder(order: OrderRecord): BookingOrderPayload {
    const serviceName =
      order.serviceNameSnapshot ??
      order.service?.name ??
      order.technicianService?.name ??
      "Unknown service";

    const statusHistory = order.statusHistory.map((history) => ({
      id: history.id,
      orderId: history.bookingOrderId,
      fromStatus: history.fromStatus ? bookingOrderStatusFromDb(history.fromStatus) : null,
      toStatus: bookingOrderStatusFromDb(history.toStatus),
      actorUserId: history.actorUserId,
      reason: history.reason,
      createdAt: history.createdAt
    }));
    const timelineEvents: OrderTimelineEventPayload[] = [
      ...statusHistory.map((history) => ({
        type: "ORDER_STATUS_CHANGED" as const,
        id: `status:${history.id}`,
        createdAt: history.createdAt,
        actorUserId: history.actorUserId,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        publicReason: history.reason
      })),
      ...(order.performanceRevisions ?? []).map((revision) => ({
        type: this.performanceTimelineType(revision.action),
        id: `performance:${revision.id}`,
        createdAt: revision.createdAt,
        actorUserId: revision.actorUserId,
        publicReason: revision.publicReason
      })),
      ...(order.timelineComments ?? []).map((comment) => ({
        type: "ORDER_COMMENT_ADDED" as const,
        id: `comment:${comment.id}`,
        createdAt: comment.createdAt,
        actorUserId: comment.actorUserId,
        actorDisplayName: comment.actor.username,
        actorAvatarUrl: comment.actor.avatarUrl ?? comment.actor.avatarBootstrapUrl ?? null,
        body: comment.body
      }))
    ].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    );

    return {
      id: order.id,
      orderNo: order.orderNo,
      orderType: this.orderTypeFromDb(order.orderType),
      status: bookingOrderStatusFromDb(order.status),
      paymentMethod: servicePaymentMethodFromDb(order.paymentMethod),
      paymentStatus: this.paymentStatusFromDb(order.paymentStatus),
      paymentAmountJpy: order.paymentAmountJpy,
      paymentConfirmedById: order.paymentConfirmedById,
      paymentConfirmedAt: order.paymentConfirmedAt,
      paymentReference: order.paymentReference,
      paymentNote: order.paymentNote,
      paymentRefundedById: order.paymentRefundedById,
      paymentRefundedAt: order.paymentRefundedAt,
      paymentRefundReference: order.paymentRefundReference,
      paymentRefundReason: order.paymentRefundReason,
      customerUserId: order.customerUserId,
      customer: order.customer ? this.mapOrderCustomer(order) : undefined,
      serviceId: order.serviceId,
      technicianServiceId: order.technicianServiceId,
      shopId: order.shopId,
      technicianProfileId: order.technicianProfileId,
      scheduleSlotId: order.scheduleSlotId,
      fulfillmentMode: order.fulfillmentMode === "home" ? "home" : "store",
      serviceName,
      pricingModeSnapshot: this.pricingModeFromDb(order.pricingModeSnapshot),
      serviceOwnerType: this.serviceOwnerTypeFromDb(order.serviceOwnerType),
      serviceOwnerId: order.serviceOwnerId,
      serviceNameSnapshot: order.serviceNameSnapshot,
      servicePriceSnapshot: order.servicePriceSnapshot
        ? this.formatDecimal(order.servicePriceSnapshot, 2)
        : null,
      serviceDurationSnapshot: order.serviceDurationSnapshot,
      serviceSnapshot: order.serviceSnapshotJson,
      fulfillmentAddressSnapshot: this.fulfillmentAddressSnapshot(order.fulfillmentAddressSnapshot),
      shopName: order.shop.name,
      technicianName: order.technicianProfile?.displayName ?? null,
      priceAmount: this.formatDecimal(order.priceAmount, 2),
      currency: order.currency,
      startsAt: order.startsAt,
      endsAt: order.endsAt,
      note: order.note,
      cancelReason: order.cancelReason,
      affiliate: order.affiliateAttributions[0]
        ? {
            taskId: order.affiliateAttributions[0].taskId,
            publicCode: order.affiliateAttributions[0].claim.publicCode,
            source: order.affiliateAttributions[0].source === "CODE" ? "code" : "url",
            originalPriceJpy: order.affiliateAttributions[0].originalPriceJpy,
            customerDiscountJpy: order.affiliateAttributions[0].customerDiscountJpy,
            finalPriceJpy: order.affiliateAttributions[0].finalPriceJpy,
            rewardAllocatedNdp: order.affiliateAttributions[0].rewardAllocatedNdp,
            attributionStatus:
              order.affiliateAttributions[0].status.toLowerCase() as AffiliateCheckoutSummary["attributionStatus"]
          }
        : null,
      serviceSession: order.serviceSession
        ? {
            startedAt: order.serviceSession.startedAt,
            expectedEndsAt: order.serviceSession.expectedEndsAt,
            endedAt: order.serviceSession.endedAt,
            addOns: order.serviceSession.addOns.map((addOn) => {
              const accepted = addOn.status === "ACCEPTED";
              const rejected = addOn.status === "REJECTED";
              const resolvedByUserId = accepted
                ? addOn.acceptedByUserId
                : rejected
                  ? addOn.rejectedByUserId
                  : null;
              return {
                id: addOn.id,
                serviceId: addOn.serviceId,
                status: addOn.status.toLowerCase() as OrderAddOnStatusPayload,
                serviceNameSnapshot: addOn.serviceNameSnapshot,
                priceAmountJpy: addOn.priceAmountJpy,
                currency: "JPY" as const,
                durationMinutes: addOn.durationMinutes,
                serviceSnapshot: addOn.serviceSnapshotJson,
                proposedBy: this.fulfillmentParticipantForUser(order, addOn.proposedByUserId),
                proposedAt: addOn.proposedAt,
                resolvedBy: this.fulfillmentParticipantForUser(order, resolvedByUserId),
                resolvedAt: accepted ? addOn.acceptedAt : rejected ? addOn.rejectedAt : null,
                resolutionReason: addOn.resolutionReason
              };
            })
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      statusHistory,
      performanceAssessment: order.performanceAssessment
        ? {
            id: order.performanceAssessment.id,
            bookingOrderId: order.performanceAssessment.bookingOrderId,
            technicianProfileId: order.performanceAssessment.technicianProfileId,
            outcome:
              order.performanceAssessment.outcome === OrderPerformanceOutcome.TECHNICIAN_CANCELLED
                ? "technician_cancelled"
                : "technician_uncompleted",
            treatment:
              order.performanceAssessment.treatment === OrderPerformanceTreatment.SPECIAL_EXCLUDED
                ? "special_excluded"
                : "counted",
            version: order.performanceAssessment.version,
            currentRevisionId: order.performanceAssessment.currentRevisionId,
            createdAt: order.performanceAssessment.createdAt,
            updatedAt: order.performanceAssessment.updatedAt
          }
        : null,
      timelineEvents
    };
  }

  private fulfillmentAddressSnapshot(value: unknown): FulfillmentAddressSnapshot | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.line1 !== "string" || record.line1.trim().length === 0) return null;
    return {
      line1: record.line1,
      line2: typeof record.line2 === "string" ? record.line2 : null,
      line3: typeof record.line3 === "string" ? record.line3 : null
    };
  }

  private mapOrderCustomer(order: OrderRecord): BookingOrderCustomerPayload {
    const profile = order.customer.customerProfile;
    const reviewSummary = profile?.reviewSummary;

    return {
      userId: order.customer.id,
      profileId: profile?.id ?? null,
      publicId: order.customer.needoId,
      displayName: profile?.displayName ?? order.customer.username,
      avatarUrl:
        order.customer.avatarUrl ??
        profile?.mediaAssets[0]?.url ??
        order.customer.avatarBootstrapUrl ??
        null,
      membershipLevel: profile ? resolveEffectiveCustomerMembershipLevel(profile) : "standard",
      ratingAverage: reviewSummary ? this.formatDecimal(reviewSummary.ratingAverage, 2) : "0.00",
      reviewCount: reviewSummary?.reviewCount ?? 0
    };
  }

  private fulfillmentParticipantForUser(
    order: OrderRecord,
    userId: number | null
  ): FulfillmentParticipant | null {
    if (userId === null) return null;
    if (userId === order.customerUserId) return "customer";
    if (userId === order.technicianProfile?.userId) return "technician";
    return null;
  }

  private performanceTimelineType(
    action: OrderPerformanceRevisionAction
  ): Exclude<OrderTimelineEventPayload["type"], "ORDER_STATUS_CHANGED" | "ORDER_COMMENT_ADDED"> {
    switch (action) {
      case OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_CANCELLED:
        return "TECHNICIAN_CANCEL_CLASSIFIED";
      case OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_UNCOMPLETED:
        return "TECHNICIAN_UNCOMPLETED_CLASSIFIED";
      case OrderPerformanceRevisionAction.APPLY_SPECIAL_EXCLUSION:
        return "SPECIAL_CANCELLATION_APPLIED";
      case OrderPerformanceRevisionAction.REVOKE_SPECIAL_EXCLUSION:
        return "SPECIAL_CANCELLATION_REVOKED";
    }
  }

  private createShopServiceSource(slot: SlotRecord, requestedServiceId?: number) {
    if (!requestedServiceId || !slot.service || slot.serviceId !== requestedServiceId) {
      return null;
    }

    return {
      serviceId: slot.serviceId,
      affiliateServiceId: slot.serviceId,
      technicianServiceId: null,
      ownerType: "shop" as const,
      ownerId: slot.serviceId,
      name: slot.service.name,
      priceAmount: slot.service.priceAmount,
      currency: slot.service.currency,
      durationMinutes: slot.service.durationMinutes,
      snapshot: {
        entityType: "service",
        entityNumericId: slot.serviceId,
        serviceId: slot.serviceId,
        publicId: slot.service.publicId,
        categoryId: slot.service.categoryId,
        name: slot.service.name,
        description: slot.service.description,
        priceAmount: this.formatDecimal(slot.service.priceAmount, 2),
        currency: slot.service.currency,
        durationMinutes: slot.service.durationMinutes,
        registeredAt: slot.service.createdAt.toISOString()
      }
    };
  }

  private createTechnicianServiceSource(slot: SlotRecord, requestedTechnicianServiceId?: number) {
    if (
      !requestedTechnicianServiceId ||
      !slot.technicianService ||
      slot.technicianServiceId !== requestedTechnicianServiceId
    ) {
      return null;
    }

    return {
      serviceId: null,
      affiliateServiceId: slot.technicianService.sourceShopServiceId,
      technicianServiceId: slot.technicianServiceId,
      ownerType: "technician" as const,
      ownerId: slot.technicianService.technicianId,
      name: slot.technicianService.name,
      priceAmount: slot.technicianService.priceAmount,
      currency: slot.technicianService.currency,
      durationMinutes: slot.technicianService.durationMinutes,
      snapshot: {
        entityType: "technician_service",
        entityNumericId: slot.technicianServiceId,
        technicianServiceId: slot.technicianServiceId,
        publicId: slot.technicianService.publicId,
        categoryId: slot.technicianService.categoryId,
        name: slot.technicianService.name,
        description: slot.technicianService.description,
        priceAmount: slot.technicianService.priceAmount,
        currency: slot.technicianService.currency,
        durationMinutes: slot.technicianService.durationMinutes,
        technicianId: slot.technicianService.technicianId,
        registeredAt: slot.technicianService.createdAt.toISOString()
      }
    };
  }

  private paymentStatusFromDb(status: string): ServicePaymentStatusPayload {
    if (status === "CONFIRMED") return "confirmed";
    if (status === "REFUND_PENDING") return "refundPending";
    if (status === "REFUNDED") return "refunded";
    return "pending";
  }

  private slotStatusFromDb(status: string): ScheduleSlotStatusPayload {
    if (status === "BOOKED") {
      return "booked";
    }
    if (status === "BLOCKED") {
      return "blocked";
    }

    return "available";
  }

  private slotStatusToDb(status: ScheduleSlotStatusPayload) {
    if (status === "booked") return "BOOKED" as const;
    if (status === "blocked") return "BLOCKED" as const;
    return "AVAILABLE" as const;
  }

  private orderTypeFromDb(orderType: string): BookingOrderTypePayload {
    return orderType === "REQUEST" ? "request" : "booking";
  }

  private orderTypeToDb(orderType: BookingOrderTypePayload) {
    return orderType === "request" ? ("REQUEST" as const) : ("BOOKING" as const);
  }

  private pricingModeFromDb(value: string): "merchant" | "technician" {
    return value === "TECHNICIAN" ? "technician" : "merchant";
  }

  private serviceOwnerTypeFromDb(value: string): "shop" | "technician" {
    return value === "TECHNICIAN" ? "technician" : "shop";
  }

  private createOrderNo(): string {
    const now = new Date();
    const timestamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
      String(now.getUTCHours()).padStart(2, "0"),
      String(now.getUTCMinutes()).padStart(2, "0"),
      String(now.getUTCSeconds()).padStart(2, "0")
    ].join("");
    const suffix = String(Math.floor(Math.random() * 9000) + 1000);

    return `ND${timestamp}${suffix}`;
  }

  private formatDecimal(value: DecimalLike | string | number, scale: number): string {
    if (typeof value === "number") {
      return value.toFixed(scale);
    }
    if (typeof value === "string") {
      return Number.parseFloat(value).toFixed(scale);
    }

    return value.toFixed(scale);
  }
}
