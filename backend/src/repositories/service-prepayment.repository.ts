import {
  Prisma,
  ServicePaymentMethod as PrismaServicePaymentMethod,
  ServicePrepaymentStatus as PrismaServicePrepaymentStatus,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";

export type ServicePrepaymentSubject = { type: "booking" | "exchange"; id: number };
export type ServicePrepaymentMethod = "onsite" | "bank_transfer" | "cash" | "ndp" | "other";
export type ServicePrepaymentStatus = "pending" | "confirmed" | "captured" | "released" | "refund_pending" | "refunded";

export interface ServicePrepaymentRecord {
  id: number;
  subject: ServicePrepaymentSubject;
  baseAmountJpy: number;
  percent: number;
  amountJpy: number;
  confirmedAmountJpy: number;
  paymentMethod: ServicePrepaymentMethod;
  status: ServicePrepaymentStatus;
  walletHoldId: number | null;
  externalReference: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  createdByIdentityId: number;
  confirmedAt: Date | null;
  capturedAt: Date | null;
  releasedAt: Date | null;
  refundPendingAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServicePrepaymentCreateInput {
  subject: ServicePrepaymentSubject;
  baseAmountJpy: number;
  percent: number;
  amountJpy: number;
  confirmedAmountJpy: number;
  paymentMethod: ServicePrepaymentMethod;
  status: Extract<ServicePrepaymentStatus, "pending" | "confirmed">;
  walletHoldId: number | null;
  externalReference?: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  createdByIdentityId: number;
  confirmedAt: Date | null;
}

export interface ServicePrepaymentRepositoryPort {
  runInTransaction<T>(handler: (repository: ServicePrepaymentRepositoryPort, transactionClient: unknown) => Promise<T>, transactionClient?: unknown): Promise<T>;
  findByIdempotencyKeyForUpdate(idempotencyKey: string): Promise<ServicePrepaymentRecord | null>;
  findBySubjectForUpdate(subject: ServicePrepaymentSubject): Promise<ServicePrepaymentRecord | null>;
  subjectBelongsToIdentity(subject: ServicePrepaymentSubject, identityId: number): Promise<boolean>;
  resolveSubjectContext(subject: ServicePrepaymentSubject, identityId: number): Promise<{
    baseAmountJpy: number;
    walletOwnerType: "user";
    walletOwnerId: number;
  } | null>;
  create(input: ServicePrepaymentCreateInput): Promise<ServicePrepaymentRecord>;
  transition(input: {
    id: number;
    status: ServicePrepaymentStatus;
    confirmedAmountJpy?: number;
    externalReference?: string | null;
    occurredAt: Date;
  }): Promise<ServicePrepaymentRecord>;
  createAudit(input: { actorUserId: number; action: string; targetId: number; metadata: unknown }): Promise<void>;
}

type ServicePrepaymentPrismaClient = PrismaClient | Prisma.TransactionClient;

const statusToDb: Record<ServicePrepaymentStatus, PrismaServicePrepaymentStatus> = {
  pending: PrismaServicePrepaymentStatus.PENDING,
  confirmed: PrismaServicePrepaymentStatus.CONFIRMED,
  captured: PrismaServicePrepaymentStatus.CAPTURED,
  released: PrismaServicePrepaymentStatus.RELEASED,
  refund_pending: PrismaServicePrepaymentStatus.REFUND_PENDING,
  refunded: PrismaServicePrepaymentStatus.REFUNDED
};

const methodToDb: Record<ServicePrepaymentMethod, PrismaServicePaymentMethod> = {
  onsite: PrismaServicePaymentMethod.ONSITE,
  bank_transfer: PrismaServicePaymentMethod.BANK_TRANSFER,
  cash: PrismaServicePaymentMethod.CASH,
  ndp: PrismaServicePaymentMethod.NDP,
  other: PrismaServicePaymentMethod.OTHER
};

export class ServicePrepaymentRepository implements ServicePrepaymentRepositoryPort {
  public constructor(private readonly client: ServicePrepaymentPrismaClient = prisma) {}

  public runInTransaction<T>(
    handler: (repository: ServicePrepaymentRepositoryPort, transactionClient: unknown) => Promise<T>,
    transactionClient?: unknown
  ): Promise<T> {
    if (transactionClient) {
      const tx = transactionClient as Prisma.TransactionClient;
      return handler(new ServicePrepaymentRepository(tx), tx);
    }
    if ("$transaction" in this.client) {
      return this.client.$transaction((tx) => handler(new ServicePrepaymentRepository(tx), tx));
    }
    return handler(this, this.client);
  }

  public async findByIdempotencyKeyForUpdate(idempotencyKey: string): Promise<ServicePrepaymentRecord | null> {
    await this.client.$queryRaw(Prisma.sql`
      SELECT id FROM service_prepayments
      WHERE idempotency_key = ${idempotencyKey} AND deleted_at IS NULL
      FOR UPDATE
    `);
    const record = await this.client.servicePrepayment.findFirst({ where: { idempotencyKey, deletedAt: null } });
    return record ? this.map(record) : null;
  }

  public async findBySubjectForUpdate(subject: ServicePrepaymentSubject): Promise<ServicePrepaymentRecord | null> {
    const subjectColumn = subject.type === "booking" ? Prisma.raw("booking_order_id") : Prisma.raw("exchange_post_id");
    await this.client.$queryRaw(Prisma.sql`
      SELECT id FROM service_prepayments
      WHERE ${subjectColumn} = ${subject.id} AND deleted_at IS NULL
      FOR UPDATE
    `);
    const record = await this.client.servicePrepayment.findFirst({
      where: subject.type === "booking"
        ? { bookingOrderId: subject.id, deletedAt: null }
        : { exchangePostId: subject.id, deletedAt: null }
    });
    return record ? this.map(record) : null;
  }

  public async subjectBelongsToIdentity(subject: ServicePrepaymentSubject, identityId: number): Promise<boolean> {
    if (subject.type === "exchange") {
      return Boolean(await this.client.exchangePost.findFirst({
        where: { id: subject.id, ownerIdentityId: identityId, deletedAt: null },
        select: { id: true }
      }));
    }
    const booking = await this.client.bookingOrder.findFirst({
      where: { id: subject.id, deletedAt: null },
      select: { customerUserId: true }
    });
    if (!booking) return false;
    return Boolean(await this.client.userIdentity.findFirst({
      where: { id: identityId, userId: booking.customerUserId, deletedAt: null },
      select: { id: true }
    }));
  }

  public async resolveSubjectContext(subject: ServicePrepaymentSubject, identityId: number): Promise<{
    baseAmountJpy: number;
    walletOwnerType: "user";
    walletOwnerId: number;
  } | null> {
    if (subject.type === "exchange") {
      const post = await this.client.exchangePost.findFirst({
        where: { id: subject.id, ownerIdentityId: identityId, type: "DEMAND", deletedAt: null },
        select: {
          authorUserId: true,
          demand: { select: { budgetMode: true, budgetMaxJpy: true, targetProviderCount: true } }
        }
      });
      if (!post?.demand) return null;
      const baseAmountJpy = post.demand.budgetMode === "PER_PROVIDER"
        ? post.demand.budgetMaxJpy * post.demand.targetProviderCount
        : post.demand.budgetMaxJpy;
      return Number.isSafeInteger(baseAmountJpy)
        ? { baseAmountJpy, walletOwnerType: "user", walletOwnerId: post.authorUserId }
        : null;
    }
    const booking = await this.client.bookingOrder.findFirst({
      where: { id: subject.id, currency: "JPY", deletedAt: null },
      select: { customerUserId: true, priceAmount: true }
    });
    if (!booking) return null;
    const identity = await this.client.userIdentity.findFirst({
      where: { id: identityId, userId: booking.customerUserId, deletedAt: null },
      select: { id: true }
    });
    const baseAmountJpy = Number(booking.priceAmount.toString());
    return identity && Number.isSafeInteger(baseAmountJpy) && baseAmountJpy >= 0
      ? { baseAmountJpy, walletOwnerType: "user", walletOwnerId: booking.customerUserId }
      : null;
  }

  public async create(input: ServicePrepaymentCreateInput): Promise<ServicePrepaymentRecord> {
    const record = await this.client.servicePrepayment.create({
      data: {
        bookingOrderId: input.subject.type === "booking" ? input.subject.id : null,
        exchangePostId: input.subject.type === "exchange" ? input.subject.id : null,
        baseAmountJpy: input.baseAmountJpy,
        percent: input.percent,
        amountJpy: input.amountJpy,
        confirmedAmountJpy: input.confirmedAmountJpy,
        paymentMethod: methodToDb[input.paymentMethod],
        status: statusToDb[input.status],
        walletHoldId: input.walletHoldId,
        externalReference: input.externalReference ?? null,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        createdByIdentityId: input.createdByIdentityId,
        confirmedAt: input.confirmedAt
      }
    });
    return this.map(record);
  }

  public async transition(input: {
    id: number;
    status: ServicePrepaymentStatus;
    confirmedAmountJpy?: number;
    externalReference?: string | null;
    occurredAt: Date;
  }): Promise<ServicePrepaymentRecord> {
    const timestampField = input.status === "confirmed" ? "confirmedAt"
      : input.status === "captured" ? "capturedAt"
      : input.status === "released" ? "releasedAt"
      : input.status === "refund_pending" ? "refundPendingAt"
      : input.status === "refunded" ? "refundedAt"
      : null;
    const record = await this.client.servicePrepayment.update({
      where: { id: input.id },
      data: {
        status: statusToDb[input.status],
        ...(input.confirmedAmountJpy !== undefined ? { confirmedAmountJpy: input.confirmedAmountJpy } : {}),
        ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
        ...(timestampField ? { [timestampField]: input.occurredAt } : {})
      }
    });
    return this.map(record);
  }

  public async createAudit(input: { actorUserId: number; action: string; targetId: number; metadata: unknown }): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: input.action,
        targetType: "service_prepayment",
        targetId: input.targetId,
        metadata: input.metadata as Prisma.InputJsonValue
      }
    });
  }

  private map(record: {
    id: number;
    bookingOrderId: number | null;
    exchangePostId: number | null;
    baseAmountJpy: number;
    percent: number;
    amountJpy: number;
    confirmedAmountJpy: number;
    paymentMethod: PrismaServicePaymentMethod;
    status: PrismaServicePrepaymentStatus;
    walletHoldId: number | null;
    externalReference: string | null;
    idempotencyKey: string;
    requestFingerprint: string;
    createdByIdentityId: number;
    confirmedAt: Date | null;
    capturedAt: Date | null;
    releasedAt: Date | null;
    refundPendingAt: Date | null;
    refundedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ServicePrepaymentRecord {
    return {
      ...record,
      subject: record.bookingOrderId !== null
        ? { type: "booking", id: record.bookingOrderId }
        : { type: "exchange", id: record.exchangePostId! },
      paymentMethod: record.paymentMethod.toLowerCase() as ServicePrepaymentMethod,
      status: record.status.toLowerCase() as ServicePrepaymentStatus
    };
  }
}
