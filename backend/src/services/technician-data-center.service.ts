import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { AuditLogService } from "./audit-log.service";
import { CompensationEngine, type CompensationRuleSet } from "./compensation-engine.service";

export type TechnicianDataCenterPeriod = "last7days" | "last30days" | "week" | "month" | "year";
export type TechnicianDataCenterBucketUnit = "day" | "five_days" | "week" | "month";

export interface TechnicianDataCenterBucketRange {
  key: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
}

export interface TechnicianDataCenterResolvedPeriod {
  period: TechnicianDataCenterPeriod;
  bucketUnit: TechnicianDataCenterBucketUnit;
  startsAt: Date;
  endsAt: Date;
  buckets: TechnicianDataCenterBucketRange[];
  timeZone: "Asia/Tokyo";
  referenceAt: Date;
}

export interface TechnicianDataCenterFinancialSource {
  serviceIncomeStatus: string;
  baseServiceAmountJpy: number | null;
  extensionAmountJpy: number | null;
  nominationChargeAmountJpy: number | null;
  wasTechnicianNominated: boolean | null;
  compensationBasisVersion: string | null;
}

export interface TechnicianDataCenterOrderSource {
  id: number;
  orderNo: string;
  serviceName: string;
  shopName: string;
  status: string;
  startsAt: string;
  endsAt: string;
  financial: TechnicianDataCenterFinancialSource | null;
}

export interface TechnicianDataCenterIncomeModelSource extends CompensationRuleSet {
  version: number;
  updatedAt: string;
}

export interface TechnicianDataCenterSource {
  technician: {
    id: number;
    userId: number;
    displayName: string;
    employmentStartedAt: string | null;
  };
  affiliation: {
    shopId: number;
    shopName: string;
    relationshipType: string;
    startsAt: string;
  } | null;
  incomeModel: TechnicianDataCenterIncomeModelSource | null;
  compensationRulesByBasis: Record<string, CompensationRuleSet>;
  recognizedIncomeByOrderId: Record<number, number>;
  periodOrders: TechnicianDataCenterOrderSource[];
  recentOrders: TechnicianDataCenterOrderSource[];
  upcomingOrderCount: number;
  nextOrder: TechnicianDataCenterOrderSource | null;
}

export interface TechnicianDataCenterRepositoryPort {
  load(
    userId: number,
    technicianProfileId: number,
    range: TechnicianDataCenterResolvedPeriod
  ): Promise<TechnicianDataCenterSource | null>;
}

export interface TechnicianDataCenterPayload {
  period: TechnicianDataCenterPeriod;
  range: {
    startsAt: string;
    endsAt: string;
    timeZone: "Asia/Tokyo";
    bucketUnit: TechnicianDataCenterBucketUnit;
  };
  technician: TechnicianDataCenterSource["technician"];
  affiliation: TechnicianDataCenterSource["affiliation"];
  incomeModel: {
    sourceType: CompensationRuleSet["sourceType"];
    name: string;
    version: number;
    updatedAt: string;
    baseSalaryJpy: number;
    serviceCommissionRatePercent: number;
    extensionCommissionRatePercent: number;
    nominationFeeJpy: number;
    hasBonus: boolean;
  } | null;
  summary: {
    recognizedIncomeJpy: number;
    completedOrderCount: number;
    workedMinutes: number;
    upcomingOrderCount: number;
  };
  series: Array<{
    key: string;
    label: string;
    startsAt: string;
    endsAt: string;
    incomeJpy: number;
    workedMinutes: number;
    completedOrderCount: number;
  }>;
  recentOrders: Array<{
    id: number;
    orderNo: string;
    serviceName: string;
    shopName: string;
    status: string;
    startsAt: string;
    endsAt: string;
    recognizedIncomeJpy: number | null;
  }>;
  nextOrder: Omit<TechnicianDataCenterOrderSource, "financial"> | null;
}

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

const tokyoParts = (date: Date) => {
  const shifted = new Date(date.getTime() + TOKYO_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay()
  };
};

const tokyoMidnight = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day) - TOKYO_OFFSET_MS);
const addDays = (date: Date, count: number) => new Date(date.getTime() + count * DAY_MS);
const localDateKey = (date: Date) => {
  const { year, month, day } = tokyoParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const dayLabel = (date: Date) => {
  const { month, day } = tokyoParts(date);
  return `${month + 1}/${day}`;
};

const buildBuckets = (
  startsAt: Date,
  endsAt: Date,
  stepDays: number,
  label: (start: Date, end: Date) => string
): TechnicianDataCenterBucketRange[] => {
  const buckets: TechnicianDataCenterBucketRange[] = [];
  for (let cursor = startsAt; cursor < endsAt; cursor = addDays(cursor, stepDays)) {
    const bucketEnd = new Date(Math.min(addDays(cursor, stepDays).getTime(), endsAt.getTime()));
    buckets.push({
      key: localDateKey(cursor),
      label: label(cursor, bucketEnd),
      startsAt: cursor,
      endsAt: bucketEnd
    });
  }
  return buckets;
};

export const resolveTechnicianDataCenterPeriod = (
  period: TechnicianDataCenterPeriod,
  now = new Date()
): TechnicianDataCenterResolvedPeriod => {
  const current = tokyoParts(now);
  const today = tokyoMidnight(current.year, current.month, current.day);
  if (period === "last7days" || period === "last30days") {
    const days = period === "last7days" ? 7 : 30;
    const startsAt = addDays(today, -(days - 1));
    const endsAt = addDays(today, 1);
    const step = period === "last7days" ? 1 : 5;
    return {
      period,
      bucketUnit: period === "last7days" ? "day" : "five_days",
      startsAt,
      endsAt,
      buckets: buildBuckets(startsAt, endsAt, step, (start, end) =>
        step === 1 ? dayLabel(start) : `${dayLabel(start)}–${dayLabel(addDays(end, -1))}`
      ),
      timeZone: "Asia/Tokyo",
      referenceAt: now
    };
  }
  if (period === "week") {
    const daysSinceMonday = (current.weekday + 6) % 7;
    const startsAt = addDays(today, -daysSinceMonday);
    const endsAt = addDays(startsAt, 7);
    return {
      period,
      bucketUnit: "day",
      startsAt,
      endsAt,
      buckets: buildBuckets(startsAt, endsAt, 1, (start) => dayLabel(start)),
      timeZone: "Asia/Tokyo",
      referenceAt: now
    };
  }
  if (period === "month") {
    const startsAt = tokyoMidnight(current.year, current.month, 1);
    const endsAt = tokyoMidnight(current.year, current.month + 1, 1);
    return {
      period,
      bucketUnit: "week",
      startsAt,
      endsAt,
      buckets: buildBuckets(
        startsAt,
        endsAt,
        7,
        (start, end) => `${dayLabel(start)}–${dayLabel(addDays(end, -1))}`
      ),
      timeZone: "Asia/Tokyo",
      referenceAt: now
    };
  }
  const startsAt = tokyoMidnight(current.year, 0, 1);
  const endsAt = tokyoMidnight(current.year + 1, 0, 1);
  const buckets = Array.from({ length: 12 }, (_, month) => {
    const bucketStart = tokyoMidnight(current.year, month, 1);
    const bucketEnd = tokyoMidnight(current.year, month + 1, 1);
    return {
      key: `${current.year}-${String(month + 1).padStart(2, "0")}`,
      label: `${month + 1}月`,
      startsAt: bucketStart,
      endsAt: bucketEnd
    };
  });
  return {
    period,
    bucketUnit: "month",
    startsAt,
    endsAt,
    buckets,
    timeZone: "Asia/Tokyo",
    referenceAt: now
  };
};

type AuditRecorder = Pick<AuditLogService, "record">;

export class TechnicianDataCenterService {
  public constructor(
    private readonly repository: TechnicianDataCenterRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly clock: () => Date = () => new Date(),
    private readonly compensationEngine = new CompensationEngine()
  ) {}

  public async getMine(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    period: TechnicianDataCenterPeriod
  ): Promise<TechnicianDataCenterPayload> {
    const profileId = this.profileId(actor);
    const range = resolveTechnicianDataCenterPeriod(period, this.clock());
    const source = await this.repository.load(actor.userId, profileId, range);
    if (!source) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.technician_data_center.not_found",
        statusCode: 404
      });
    }

    const series = range.buckets.map((bucket) => {
      const orders = source.periodOrders.filter((order) => {
        const startsAt = new Date(order.startsAt).getTime();
        return (
          order.status === "completed" &&
          startsAt >= bucket.startsAt.getTime() &&
          startsAt < bucket.endsAt.getTime()
        );
      });
      return {
        key: bucket.key,
        label: bucket.label,
        startsAt: bucket.startsAt.toISOString(),
        endsAt: bucket.endsAt.toISOString(),
        incomeJpy: orders.reduce(
          (sum, order) => sum + (this.recognizedIncome(source, order) ?? 0),
          0
        ),
        workedMinutes: orders.reduce((sum, order) => sum + this.workedMinutes(order), 0),
        completedOrderCount: orders.length
      };
    });
    const summary = series.reduce(
      (total, point) => ({
        recognizedIncomeJpy: total.recognizedIncomeJpy + point.incomeJpy,
        completedOrderCount: total.completedOrderCount + point.completedOrderCount,
        workedMinutes: total.workedMinutes + point.workedMinutes,
        upcomingOrderCount: source.upcomingOrderCount
      }),
      {
        recognizedIncomeJpy: 0,
        completedOrderCount: 0,
        workedMinutes: 0,
        upcomingOrderCount: source.upcomingOrderCount
      }
    );
    await this.auditLogService.record({
      actor,
      context,
      action: "technician_data_center.self_read",
      targetType: "TechnicianProfile",
      targetId: profileId,
      metadata: {
        period,
        startsAt: range.startsAt.toISOString(),
        endsAt: range.endsAt.toISOString()
      }
    });

    return {
      period,
      range: {
        startsAt: range.startsAt.toISOString(),
        endsAt: range.endsAt.toISOString(),
        timeZone: range.timeZone,
        bucketUnit: range.bucketUnit
      },
      technician: source.technician,
      affiliation: source.affiliation,
      incomeModel: source.incomeModel
        ? {
            sourceType: source.incomeModel.sourceType,
            name: source.incomeModel.name,
            version: source.incomeModel.version,
            updatedAt: source.incomeModel.updatedAt,
            baseSalaryJpy: source.incomeModel.baseSalaryJpy,
            serviceCommissionRatePercent: source.incomeModel.commissionRatePercent,
            extensionCommissionRatePercent: source.incomeModel.extensionCommissionRatePercent,
            nominationFeeJpy: source.incomeModel.nominationFeeJpy,
            hasBonus: source.incomeModel.bonusRules.some((rule) => rule.active)
          }
        : null,
      summary,
      series,
      recentOrders: source.recentOrders.slice(0, 3).map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        serviceName: order.serviceName,
        shopName: order.shopName,
        status: order.status,
        startsAt: order.startsAt,
        endsAt: order.endsAt,
        recognizedIncomeJpy: this.recognizedIncome(source, order)
      })),
      nextOrder: source.nextOrder
        ? {
            id: source.nextOrder.id,
            orderNo: source.nextOrder.orderNo,
            serviceName: source.nextOrder.serviceName,
            shopName: source.nextOrder.shopName,
            status: source.nextOrder.status,
            startsAt: source.nextOrder.startsAt,
            endsAt: source.nextOrder.endsAt
          }
        : null
    };
  }

  private profileId(actor: AuthenticatedAccessContext): number {
    if (
      actor.currentIdentityType !== "technician" ||
      actor.currentIdentityScopeType !== "technician_profile" ||
      !actor.currentIdentityScopeId
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
    return actor.currentIdentityScopeId;
  }

  private recognizedIncome(
    source: TechnicianDataCenterSource,
    order: TechnicianDataCenterOrderSource
  ): number | null {
    const fromPayslip = source.recognizedIncomeByOrderId[order.id];
    if (fromPayslip !== undefined) return fromPayslip;
    const financial = order.financial;
    if (
      financial?.serviceIncomeStatus !== "confirmed" ||
      financial.baseServiceAmountJpy === null ||
      financial.extensionAmountJpy === null ||
      financial.nominationChargeAmountJpy === null ||
      !financial.compensationBasisVersion
    )
      return null;
    const rule = source.compensationRulesByBasis[financial.compensationBasisVersion];
    if (!rule) return null;
    return this.compensationEngine.calculate(rule, {
      baseServiceAmountJpy: financial.baseServiceAmountJpy,
      extensionAmountJpy: financial.extensionAmountJpy,
      nominationChargeAmountJpy: financial.nominationChargeAmountJpy,
      nominated: financial.wasTechnicianNominated === true,
      platformFeeNdp: 0,
      workedMinutes: this.workedMinutes(order)
    }).technicianNetIncomeJpy;
  }

  private workedMinutes(order: TechnicianDataCenterOrderSource): number {
    return Math.max(
      0,
      Math.round((new Date(order.endsAt).getTime() - new Date(order.startsAt).getTime()) / 60_000)
    );
  }
}
