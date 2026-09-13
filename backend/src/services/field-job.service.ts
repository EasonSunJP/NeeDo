import { ERROR_CODES } from "../constants/error-codes";
import { FIELD_JOB_PERMISSIONS } from "../constants/permissions.constants";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { FieldJobListQuery } from "../validators/field-job.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export interface FieldJobSourceRecord {
  id: number;
  orderNo: string;
  status: string;
  serviceName: string;
  shopId: number;
  shopName: string;
  customerPublicId: string;
  technicianProfileId: number | null;
  technicianNeedoId: string | null;
  technicianName: string | null;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
  address: { regionLabel: string; lines: string[] };
  serviceSession: {
    startedAt: Date | null;
    expectedEndsAt: Date | null;
    endedAt: Date | null;
  } | null;
  receiptConfirmedAt: Date | null;
  paymentStatus: string;
  activeSosCount: number;
  activeRefundCaseCount: number;
  openDisputeCount: number;
  overdueResolution: string | null;
  hasPerformanceIssue: boolean;
  timeline: Array<{
    id: number;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    createdAt: Date;
  }>;
}

export interface FieldJobRepositoryPort {
  list(input: FieldJobListQuery): Promise<PaginatedResponse<FieldJobSourceRecord>>;
  findById(id: number): Promise<FieldJobSourceRecord | null>;
}

const apiStatus = (status: string): string =>
  status.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export class FieldJobService {
  public constructor(
    private readonly repository: FieldJobRepositoryPort,
    private readonly audit: Pick<AuditLogService, "record">
  ) {}

  public async list(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: FieldJobListQuery
  ) {
    const result = await this.repository.list(input);
    await this.audit.record({
      actor,
      context,
      action: "backoffice.field_jobs.list",
      targetType: "booking_order",
      metadata: input
    });
    return { ...result, list: result.list.map((record) => this.present(record, actor, false)) };
  }

  public async get(actor: AuthenticatedAccessContext, context: AuthRequestContext, id: number) {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.field_job.not_found",
        statusCode: 404
      });
    }

    const hasAddressAccess = actor.permissions.includes(FIELD_JOB_PERMISSIONS.addressRead);
    const hasSosAccess = actor.permissions.includes("sos:list");
    await this.audit.record({
      actor,
      context,
      action: "backoffice.field_job.read",
      targetType: "BookingOrder",
      targetId: record.id,
      metadata: {
        bookingOrderId: record.id,
        addressDisclosure: hasAddressAccess ? "full" : "region_only",
        sosDisclosure: hasSosAccess ? "visible" : "hidden"
      }
    });
    return this.present(record, actor, true);
  }

  private present(
    record: FieldJobSourceRecord,
    actor: AuthenticatedAccessContext,
    detail: boolean
  ) {
    const hasAddressAccess = actor.permissions.includes(FIELD_JOB_PERMISSIONS.addressRead);
    const discloseAddress = detail && hasAddressAccess;
    const hasSosAccess = actor.permissions.includes("sos:list");
    const credentialState = !record.serviceSession
      ? "not_issued"
      : record.serviceSession.startedAt
        ? "verified"
        : "issued";

    return {
      id: record.id,
      orderNo: record.orderNo,
      status: apiStatus(record.status),
      serviceName: record.serviceName,
      shop: { id: record.shopId, name: record.shopName },
      technician: record.technicianProfileId
        ? {
            assignment: "assigned",
            profileId: record.technicianProfileId,
            needoId: record.technicianNeedoId,
            name: record.technicianName
          }
        : { assignment: "unassigned", profileId: null, needoId: null, name: null },
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt.toISOString(),
      location: {
        disclosure: discloseAddress ? "full" : "region_only",
        regionLabel: record.address.regionLabel,
        lines: discloseAddress ? record.address.lines : null
      },
      credential: {
        state: credentialState,
        verifiedAt:
          credentialState === "verified" ? iso(record.serviceSession?.startedAt ?? null) : null
      },
      evidence: {
        startedAt: iso(record.serviceSession?.startedAt ?? null),
        expectedEndsAt: iso(record.serviceSession?.expectedEndsAt ?? null),
        endedAt: iso(record.serviceSession?.endedAt ?? null),
        receiptConfirmedAt: iso(record.receiptConfirmedAt),
        paymentStatus: apiStatus(record.paymentStatus)
      },
      exceptions: {
        activeSosCount: hasSosAccess ? record.activeSosCount : null,
        activeRefundCaseCount: record.activeRefundCaseCount,
        openDisputeCount: record.openDisputeCount,
        overdueResolution: record.overdueResolution ? apiStatus(record.overdueResolution) : null,
        hasPerformanceIssue: record.hasPerformanceIssue
      },
      ...(detail
        ? {
            customerPublicId: record.customerPublicId,
            timeline: record.timeline.map((event) => ({
              id: event.id,
              fromStatus: event.fromStatus ? apiStatus(event.fromStatus) : null,
              toStatus: apiStatus(event.toStatus),
              reason: event.reason,
              createdAt: event.createdAt.toISOString()
            }))
          }
        : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
