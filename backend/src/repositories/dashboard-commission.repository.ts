import { Prisma, type PrismaClient } from "@prisma/client";
import type { DashboardAggregateInput } from "../domain/dashboard";

type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;
type DashboardQueryClient = Pick<PrismaClient, "$queryRaw">;

export interface DashboardReadyFact {
  current: number;
  previous: number;
  dataStatus: "ready";
}

export interface DashboardUnavailableFact {
  current: null;
  previous: null;
  dataStatus: "not_available";
}

export interface CommissionFacts {
  dedicatedTechnicianCommission: DashboardReadyFact | DashboardUnavailableFact;
  partTimeTechnicianCommission: DashboardReadyFact | DashboardUnavailableFact;
  marketingCommission: DashboardReadyFact;
  agentCommission: DashboardReadyFact;
  ndpIncome: DashboardReadyFact;
  affiliatePlatformIncome: DashboardReadyFact;
  consumablesProfit: { current: null; previous: null; dataStatus: "not_connected" };
}

export interface DashboardCommissionReader {
  getCommissionFacts(input: DashboardAggregateInput): Promise<CommissionFacts>;
}

export interface TechnicianCommissionWorkDate {
  technicianProfileId: number;
  shopId: number;
  compensationProfileId: number;
  monthlyBaseJpy: number;
  workDate: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface TechnicianCommissionCalculationInput {
  workDates: readonly TechnicianCommissionWorkDate[];
  settledShareJpy: number;
}

export interface TechnicianActiveWorkDate {
  technicianProfileId: number;
  shopId: number;
  workDate: string;
}

export interface TechnicianCompensationProfileVersion {
  id: number;
  technicianProfileId: number;
  shopId: number;
  status: string;
  wageMode: string;
  monthlyBaseJpy: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  deleted: boolean;
}

export interface TechnicianCompensationResolution {
  workDates: TechnicianCommissionWorkDate[];
  anomalyCount: number;
}

interface CommissionRow {
  periodKey?: string;
  period_key?: string;
  dedicatedJpy?: NumericValue;
  dedicated_jpy?: NumericValue;
  partTimeJpy?: NumericValue;
  part_time_jpy?: NumericValue;
  marketingNdp?: NumericValue;
  marketing_ndp?: NumericValue;
  agentJpy?: NumericValue;
  agent_jpy?: NumericValue;
  ndpIncomeNdp?: NumericValue;
  ndp_income_ndp?: NumericValue;
  affiliatePlatformNdp?: NumericValue;
  affiliate_platform_ndp?: NumericValue;
  salaryAnomalyCount?: NumericValue;
  salary_anomaly_count?: NumericValue;
}

const allocationError = "Technician commission allocation is invalid";
const aggregateError = "Dashboard commission aggregate must be a non-negative safe integer";
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const formalWageModes = new Set([
  "fixed_per_order",
  "commission",
  "base_plus_commission",
  "hourly"
]);

const parseCalendarDate = (value: string): { year: number; month: number; day: number } => {
  const match = datePattern.exec(value);
  if (!match) throw new RangeError(allocationError);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(allocationError);
  }
  return { year, month, day };
};

export const toTokyoBusinessDate = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError(allocationError);
  const tokyo = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return [
    String(tokyo.getUTCFullYear()).padStart(4, "0"),
    String(tokyo.getUTCMonth() + 1).padStart(2, "0"),
    String(tokyo.getUTCDate()).padStart(2, "0")
  ].join("-");
};

export const isProductionNdpEvidence = (input: {
  financialCurrency: string;
  ledgerCurrency: string;
}): boolean => input.financialCurrency === "NDP" && input.ledgerCurrency === "NDP";

export const resolveTechnicianCompensationAllocations = (input: {
  workDates: readonly TechnicianActiveWorkDate[];
  profiles: readonly TechnicianCompensationProfileVersion[];
}): TechnicianCompensationResolution => {
  const uniqueWorkDates = new Map<string, TechnicianActiveWorkDate>();
  for (const workDate of input.workDates) {
    if (
      !Number.isSafeInteger(workDate.technicianProfileId) ||
      workDate.technicianProfileId <= 0 ||
      !Number.isSafeInteger(workDate.shopId) ||
      workDate.shopId <= 0
    ) {
      throw new RangeError(allocationError);
    }
    parseCalendarDate(workDate.workDate);
    uniqueWorkDates.set(
      `${workDate.technicianProfileId}:${workDate.shopId}:${workDate.workDate}`,
      workDate
    );
  }

  const resolved: TechnicianCommissionWorkDate[] = [];
  let anomalyCount = 0;
  for (const workDate of uniqueWorkDates.values()) {
    const candidates: TechnicianCompensationProfileVersion[] = [];
    let invalidCandidate = false;
    for (const profile of input.profiles) {
      if (
        profile.technicianProfileId !== workDate.technicianProfileId ||
        profile.shopId !== workDate.shopId ||
        profile.deleted ||
        (profile.status !== "active" && profile.status !== "archived")
      ) {
        continue;
      }
      try {
        if (
          !Number.isSafeInteger(profile.id) ||
          profile.id <= 0 ||
          !formalWageModes.has(profile.wageMode) ||
          !Number.isSafeInteger(profile.monthlyBaseJpy) ||
          profile.monthlyBaseJpy < 0
        ) {
          throw new RangeError(allocationError);
        }
        if (profile.effectiveFrom !== undefined && profile.effectiveFrom !== null) {
          parseCalendarDate(profile.effectiveFrom);
        }
        if (profile.effectiveTo !== undefined && profile.effectiveTo !== null) {
          parseCalendarDate(profile.effectiveTo);
        }
        if (
          profile.effectiveFrom !== undefined &&
          profile.effectiveFrom !== null &&
          profile.effectiveTo !== undefined &&
          profile.effectiveTo !== null &&
          profile.effectiveFrom > profile.effectiveTo
        ) {
          throw new RangeError(allocationError);
        }
      } catch {
        invalidCandidate = true;
        continue;
      }
      const isEffective =
        (profile.effectiveFrom === undefined ||
          profile.effectiveFrom === null ||
          profile.effectiveFrom <= workDate.workDate) &&
        (profile.effectiveTo === undefined ||
          profile.effectiveTo === null ||
          profile.effectiveTo >= workDate.workDate);
      if (!isEffective) continue;
      candidates.push(profile);
    }
    if (invalidCandidate || candidates.length !== 1) {
      anomalyCount += 1;
      continue;
    }
    const profile = candidates[0]!;
    if (profile.wageMode !== "base_plus_commission") continue;
    resolved.push({
      technicianProfileId: workDate.technicianProfileId,
      shopId: workDate.shopId,
      compensationProfileId: profile.id,
      monthlyBaseJpy: profile.monthlyBaseJpy,
      workDate: workDate.workDate,
      effectiveFrom: profile.effectiveFrom,
      effectiveTo: profile.effectiveTo
    });
  }
  return { workDates: resolved, anomalyCount };
};

export const calculateTechnicianCommission = (
  input: TechnicianCommissionCalculationInput
): number => {
  if (!Number.isSafeInteger(input.settledShareJpy) || input.settledShareJpy < 0) {
    throw new RangeError(allocationError);
  }

  const activeByTechnicianShopDate = new Map<string, TechnicianCommissionWorkDate>();
  for (const allocation of input.workDates) {
    if (
      !Number.isSafeInteger(allocation.technicianProfileId) ||
      allocation.technicianProfileId <= 0 ||
      !Number.isSafeInteger(allocation.shopId) ||
      allocation.shopId <= 0 ||
      !Number.isSafeInteger(allocation.compensationProfileId) ||
      allocation.compensationProfileId <= 0 ||
      !Number.isSafeInteger(allocation.monthlyBaseJpy) ||
      allocation.monthlyBaseJpy < 0
    ) {
      throw new RangeError(allocationError);
    }
    parseCalendarDate(allocation.workDate);
    if (allocation.effectiveFrom !== undefined && allocation.effectiveFrom !== null) {
      parseCalendarDate(allocation.effectiveFrom);
    }
    if (allocation.effectiveTo !== undefined && allocation.effectiveTo !== null) {
      parseCalendarDate(allocation.effectiveTo);
    }
    if (
      allocation.effectiveFrom !== undefined &&
      allocation.effectiveFrom !== null &&
      allocation.effectiveTo !== undefined &&
      allocation.effectiveTo !== null &&
      allocation.effectiveFrom > allocation.effectiveTo
    ) {
      throw new RangeError(allocationError);
    }
    if (
      (allocation.effectiveFrom !== undefined &&
        allocation.effectiveFrom !== null &&
        allocation.workDate < allocation.effectiveFrom) ||
      (allocation.effectiveTo !== undefined &&
        allocation.effectiveTo !== null &&
        allocation.workDate > allocation.effectiveTo)
    ) {
      continue;
    }

    const activeKey = [allocation.technicianProfileId, allocation.shopId, allocation.workDate].join(
      ":"
    );
    const existing = activeByTechnicianShopDate.get(activeKey);
    if (
      existing &&
      (existing.compensationProfileId !== allocation.compensationProfileId ||
        existing.monthlyBaseJpy !== allocation.monthlyBaseJpy)
    ) {
      throw new RangeError(allocationError);
    }
    activeByTechnicianShopDate.set(activeKey, allocation);
  }

  const groups = new Map<string, { monthlyBaseJpy: number; dates: Set<string> }>();
  for (const allocation of activeByTechnicianShopDate.values()) {
    const { year, month } = parseCalendarDate(allocation.workDate);
    const groupKey = [
      allocation.technicianProfileId,
      allocation.shopId,
      allocation.compensationProfileId,
      year,
      month
    ].join(":");
    const existing = groups.get(groupKey);
    if (existing && existing.monthlyBaseJpy !== allocation.monthlyBaseJpy) {
      throw new RangeError(allocationError);
    }
    const group = existing ?? { monthlyBaseJpy: allocation.monthlyBaseJpy, dates: new Set() };
    group.dates.add(allocation.workDate);
    groups.set(groupKey, group);
  }

  let total = input.settledShareJpy;
  for (const [key, group] of groups) {
    const parts = key.split(":");
    const year = Number(parts[3]);
    const month = Number(parts[4]);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const product = group.monthlyBaseJpy * group.dates.size;
    if (!Number.isSafeInteger(product)) throw new RangeError(allocationError);
    const allocated = Math.round(product / daysInMonth);
    total += allocated;
    if (!Number.isSafeInteger(total) || total < 0) throw new RangeError(allocationError);
  }
  return total;
};

export class DashboardCommissionRepository implements DashboardCommissionReader {
  public constructor(private readonly client: DashboardQueryClient) {}

  public async getCommissionFacts(input: DashboardAggregateInput): Promise<CommissionFacts> {
    const rows = await this.queryCommissionFacts(input);
    const periods = new Map<
      "current" | "previous",
      {
        dedicated: number;
        partTime: number;
        marketing: number;
        agent: number;
        ndpIncome: number;
        affiliatePlatform: number;
        salaryAnomaly: boolean;
      }
    >();
    for (const row of rows) {
      const key = row.periodKey ?? row.period_key;
      if ((key !== "current" && key !== "previous") || periods.has(key)) {
        throw new RangeError(aggregateError);
      }
      const anomalyCount = this.toSafeAggregate(row.salaryAnomalyCount ?? row.salary_anomaly_count);
      periods.set(key, {
        dedicated: this.toSafeAggregate(row.dedicatedJpy ?? row.dedicated_jpy),
        partTime: this.toSafeAggregate(row.partTimeJpy ?? row.part_time_jpy),
        marketing: this.toSafeAggregate(row.marketingNdp ?? row.marketing_ndp),
        agent: this.toSafeAggregate(row.agentJpy ?? row.agent_jpy),
        ndpIncome: this.toSafeAggregate(row.ndpIncomeNdp ?? row.ndp_income_ndp),
        affiliatePlatform: this.toSafeAggregate(
          row.affiliatePlatformNdp ?? row.affiliate_platform_ndp
        ),
        salaryAnomaly: anomalyCount !== 0
      });
    }
    const zero = {
      dedicated: 0,
      partTime: 0,
      marketing: 0,
      agent: 0,
      ndpIncome: 0,
      affiliatePlatform: 0,
      salaryAnomaly: false
    };
    const current = periods.get("current") ?? zero;
    const previous = periods.get("previous") ?? zero;
    const technicianCommissionUnavailable = current.salaryAnomaly || previous.salaryAnomaly;
    const unavailable = {
      current: null,
      previous: null,
      dataStatus: "not_available" as const
    };
    return {
      dedicatedTechnicianCommission: technicianCommissionUnavailable
        ? unavailable
        : {
            current: current.dedicated,
            previous: previous.dedicated,
            dataStatus: "ready"
          },
      partTimeTechnicianCommission: technicianCommissionUnavailable
        ? unavailable
        : {
            current: current.partTime,
            previous: previous.partTime,
            dataStatus: "ready"
          },
      marketingCommission: {
        current: current.marketing,
        previous: previous.marketing,
        dataStatus: "ready"
      },
      agentCommission: { current: current.agent, previous: previous.agent, dataStatus: "ready" },
      ndpIncome: { current: current.ndpIncome, previous: previous.ndpIncome, dataStatus: "ready" },
      affiliatePlatformIncome: {
        current: current.affiliatePlatform,
        previous: previous.affiliatePlatform,
        dataStatus: "ready"
      },
      consumablesProfit: { current: null, previous: null, dataStatus: "not_connected" }
    };
  }

  private periodTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join(
      [
        Prisma.sql`SELECT ${"current"} AS period_key, ${input.window.fromInclusive} AS from_inclusive, ${input.window.toExclusive} AS to_exclusive`,
        Prisma.sql`SELECT ${"previous"} AS period_key, ${input.window.previousFromInclusive} AS from_inclusive, ${input.window.previousToExclusive} AS to_exclusive`
      ],
      " UNION ALL "
    );
  }

  private shopScope(input: DashboardAggregateInput, alias: string): Prisma.Sql {
    if (input.scope.kind === "shop") {
      return Prisma.sql`${Prisma.raw(alias)}.shop_id = ${input.scope.shopId}`;
    }
    if (input.city) {
      return Prisma.sql`TRIM(shop.city) = ${input.city}`;
    }
    return Prisma.sql`TRUE`;
  }

  private agentSettlementScope(input: DashboardAggregateInput): Prisma.Sql {
    if (input.scope.kind === "shop") {
      return Prisma.sql`agent_line.shop_id = ${input.scope.shopId}`;
    }
    if (input.city) {
      return Prisma.sql`TRIM(agent_shop.city) = ${input.city}`;
    }
    return Prisma.sql`TRUE`;
  }

  private queryCommissionFacts(input: DashboardAggregateInput): Promise<CommissionRow[]> {
    const periods = this.periodTable(input);
    const bookingScope = this.shopScope(input, "booking");
    const attributionScope = this.shopScope(input, "attribution");
    const agentSettlementScope = this.agentSettlementScope(input);
    return this.client.$queryRaw<CommissionRow[]>(Prisma.sql`
      /* dashboard_commission_facts */
      WITH periods AS (${periods}),
      valid_completed_orders AS (
        SELECT booking.id AS booking_order_id, booking.shop_id,
          booking.technician_profile_id,
          booking.payment_confirmed_at,
          session.ended_at AS service_ended_at,
          DATE(CONVERT_TZ(session.ended_at, ${"+00:00"}, ${"+09:00"})) AS work_date
        FROM booking_orders AS booking
        INNER JOIN shops AS shop ON booking.shop_id = shop.id AND shop.deleted_at IS NULL
        INNER JOIN order_service_sessions AS session
          ON session.booking_order_id = booking.id
          AND session.started_at IS NOT NULL
          AND session.started_by_user_id IS NOT NULL
          AND session.ended_at IS NOT NULL
          AND session.ended_by_user_id IS NOT NULL
          AND session.started_at <= session.ended_at
          AND session.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
        LEFT JOIN ledger_transactions AS payment_ledger
          ON payment_ledger.id = checkout.ledger_transaction_id
        WHERE ${bookingScope}
          AND booking.deleted_at IS NULL
          AND booking.status = ${"completed"}
          AND booking.payment_status = ${"confirmed"}
          AND booking.technician_profile_id IS NOT NULL
          AND booking.payment_confirmed_by_id IS NOT NULL
          AND booking.payment_refunded_at IS NULL
          AND booking.payment_refunded_by_id IS NULL
          AND booking.payment_refund_reference IS NULL
          AND booking.payment_refund_reason IS NULL
          AND EXISTS (
            SELECT 1 FROM order_service_events AS service_end_event
            WHERE service_end_event.booking_order_id = booking.id
              AND service_end_event.service_session_id = session.id
              AND service_end_event.event_type = ${"service_ended"}
              AND service_end_event.actor_user_id = session.ended_by_user_id
              AND service_end_event.occurred_at = session.ended_at
              AND service_end_event.deleted_at IS NULL
          )
          AND (
            EXISTS (
              SELECT 1 FROM periods AS work_period
              WHERE session.ended_at >= work_period.from_inclusive
                AND session.ended_at < work_period.to_exclusive
            )
            OR EXISTS (
              SELECT 1 FROM periods AS payment_period
              WHERE booking.payment_confirmed_at >= payment_period.from_inclusive
                AND booking.payment_confirmed_at < payment_period.to_exclusive
            )
            OR EXISTS (
              SELECT 1
              FROM order_financials AS reward_financial
              INNER JOIN periods AS reward_period
                ON reward_financial.user_reward_granted_at >= reward_period.from_inclusive
                AND reward_financial.user_reward_granted_at < reward_period.to_exclusive
              WHERE reward_financial.booking_order_id = booking.id
                AND reward_financial.deleted_at IS NULL
            )
          )
          AND booking.payment_amount_jpy = checkout.checkout_amount_jpy
          AND checkout.base_amount_jpy >= 0 AND checkout.add_on_amount_jpy >= 0
          AND checkout.discount_amount_jpy >= 0 AND checkout.checkout_amount_jpy >= 0
          AND checkout.payable_ndp >= 0
          AND checkout.base_amount_jpy + checkout.add_on_amount_jpy - checkout.discount_amount_jpy = checkout.checkout_amount_jpy
          AND checkout.payment_method = booking.payment_method
          AND checkout.payment_selected_at IS NOT NULL
          AND checkout.payment_selected_at <= booking.payment_confirmed_at
          AND (
            (checkout.payment_method = ${"ndp"}
              AND checkout.ledger_transaction_id IS NOT NULL
              AND payment_ledger.type = ${"booking_complete_settlement"}
              AND payment_ledger.status = ${"applied"}
              AND payment_ledger.currency = ${"NDP"}
              AND payment_ledger.reference_type = ${"order_checkout_payment"}
              AND payment_ledger.reference_id = checkout.id
              AND payment_ledger.amount = checkout.payable_ndp
              AND payment_ledger.actor_user_id = booking.payment_confirmed_by_id
              AND payment_ledger.deleted_at IS NULL
              AND checkout.payment_selected_at <= payment_ledger.created_at
              AND payment_ledger.created_at <= booking.payment_confirmed_at
              AND booking.payment_reference = CONCAT(${"checkout:"}, checkout.id, ${":ledger:"}, payment_ledger.id)
              AND booking.payment_note IS NULL
              AND checkout.receipt_confirmed_by_id IS NULL
              AND checkout.receipt_confirmed_at IS NULL
              AND checkout.receipt_confirmation_reason IS NULL)
            OR
            (checkout.payment_method IN (${"cash"}, ${"other"})
              AND checkout.ledger_transaction_id IS NULL
              AND payment_ledger.id IS NULL
              AND checkout.receipt_confirmed_by_id = booking.payment_confirmed_by_id
              AND checkout.receipt_confirmed_at IS NOT NULL
              AND checkout.payment_selected_at <= checkout.receipt_confirmed_at
              AND checkout.receipt_confirmed_at <= booking.payment_confirmed_at
              AND checkout.receipt_confirmation_reason IS NOT NULL
              AND TRIM(checkout.receipt_confirmation_reason) <> ${""}
              AND booking.payment_note = checkout.receipt_confirmation_reason
              AND booking.payment_reference IN (
                CONCAT(${"checkout:"}, checkout.id, ${":technician-receipt"}),
                CONCAT(${"checkout:"}, checkout.id, ${":merchant-receipt"}),
                CONCAT(${"checkout:"}, checkout.id, ${":operations-receipt"})
              )
              AND (
                (checkout.payment_method = ${"cash"}
                  AND checkout.other_method_code IS NULL
                  AND checkout.other_method_label IS NULL)
                OR
                (checkout.payment_method = ${"other"}
                  AND checkout.other_method_code IS NOT NULL
                  AND TRIM(checkout.other_method_code) <> ${""}
                  AND checkout.other_method_label IS NOT NULL
                  AND TRIM(checkout.other_method_label) <> ${""})
              ))
          )
      ),
      eligible_work_orders AS (
        SELECT period.period_key, valid.*
        FROM periods AS period
        INNER JOIN valid_completed_orders AS valid
          ON valid.service_ended_at >= period.from_inclusive
          AND valid.service_ended_at < period.to_exclusive
      ),
      eligible_payment_orders AS (
        SELECT period.period_key, valid.*
        FROM periods AS period
        INNER JOIN valid_completed_orders AS valid
          ON valid.payment_confirmed_at >= period.from_inclusive
          AND valid.payment_confirmed_at < period.to_exclusive
      ),
      classified_orders AS (
        SELECT eligible.*,
          CASE
            WHEN COUNT(DISTINCT current_affiliation.shop_id) = 1 THEN ${"dedicated"}
            WHEN COUNT(DISTINCT current_affiliation.shop_id) > 1 THEN ${"part_time"}
            ELSE NULL
          END AS classification
        FROM eligible_work_orders AS eligible
        INNER JOIN technician_profiles AS profile
          ON profile.id = eligible.technician_profile_id AND profile.deleted_at IS NULL
        INNER JOIN technician_shop_affiliations AS current_shop_affiliation
          ON current_shop_affiliation.technician_profile_id = eligible.technician_profile_id
          AND current_shop_affiliation.shop_id = eligible.shop_id
          AND current_shop_affiliation.work_status = ${"active"}
          AND current_shop_affiliation.deleted_at IS NULL
          AND DATE(CONVERT_TZ(current_shop_affiliation.starts_at, ${"+00:00"}, ${"+09:00"})) <= eligible.work_date
          AND (current_shop_affiliation.ends_at IS NULL OR DATE(CONVERT_TZ(current_shop_affiliation.ends_at, ${"+00:00"}, ${"+09:00"})) >= eligible.work_date)
        INNER JOIN technician_shop_affiliations AS current_affiliation
          ON current_affiliation.technician_profile_id = eligible.technician_profile_id
          AND current_affiliation.work_status = ${"active"}
          AND current_affiliation.deleted_at IS NULL
          AND DATE(CONVERT_TZ(current_affiliation.starts_at, ${"+00:00"}, ${"+09:00"})) <= eligible.work_date
          AND (current_affiliation.ends_at IS NULL OR DATE(CONVERT_TZ(current_affiliation.ends_at, ${"+00:00"}, ${"+09:00"})) >= eligible.work_date)
        GROUP BY eligible.period_key, eligible.booking_order_id, eligible.shop_id,
          eligible.technician_profile_id, eligible.work_date
        HAVING classification IS NOT NULL
      ),
      profile_history_anomalies AS (
        SELECT classified.period_key,
          COUNT(DISTINCT compensation.id) AS profile_history_anomaly_count
        FROM (SELECT DISTINCT period_key, technician_profile_id, shop_id
              FROM classified_orders) AS classified
        INNER JOIN technician_compensation_profiles AS compensation
          ON compensation.technician_profile_id = classified.technician_profile_id
          AND compensation.shop_id = classified.shop_id
          AND compensation.status IN (${"active"}, ${"archived"})
          AND compensation.deleted_at IS NULL
        WHERE compensation.base_salary_jpy IS NULL
          OR compensation.base_salary_jpy < 0
          OR compensation.base_salary_jpy > ${Number.MAX_SAFE_INTEGER}
          OR compensation.base_salary_jpy <> FLOOR(compensation.base_salary_jpy)
          OR compensation.wage_mode IS NULL
          OR compensation.wage_mode NOT IN (
            ${"fixed_per_order"}, ${"commission"}, ${"base_plus_commission"}, ${"hourly"}
          )
          OR (compensation.effective_from IS NOT NULL
            AND compensation.effective_to IS NOT NULL
            AND compensation.effective_from > compensation.effective_to)
        GROUP BY classified.period_key
      ),
      salary_date_resolution AS (
        SELECT classified.period_key, classified.classification, classified.technician_profile_id,
          classified.shop_id, classified.work_date,
          COUNT(compensation.id) AS matching_profile_count,
          SUM(CASE WHEN compensation.id IS NOT NULL AND (
              compensation.base_salary_jpy < 0
              OR compensation.wage_mode NOT IN (
                ${"fixed_per_order"}, ${"commission"}, ${"base_plus_commission"}, ${"hourly"}
              )
              OR (compensation.effective_from IS NOT NULL
                AND compensation.effective_to IS NOT NULL
                AND compensation.effective_from > compensation.effective_to)
            ) THEN 1 ELSE 0 END) AS invalid_profile_count,
          MAX(compensation.id) AS compensation_profile_id,
          MAX(compensation.base_salary_jpy) AS base_salary_jpy,
          MAX(compensation.wage_mode) AS wage_mode
        FROM (SELECT DISTINCT period_key, classification, technician_profile_id, shop_id, work_date
              FROM classified_orders) AS classified
        LEFT JOIN technician_compensation_profiles AS compensation
          ON compensation.technician_profile_id = classified.technician_profile_id
          AND compensation.shop_id = classified.shop_id
          AND compensation.status IN (${"active"}, ${"archived"})
          AND compensation.deleted_at IS NULL
          AND (compensation.effective_from IS NULL OR DATE(CONVERT_TZ(compensation.effective_from, ${"+00:00"}, ${"+09:00"})) <= classified.work_date)
          AND (compensation.effective_to IS NULL OR DATE(CONVERT_TZ(compensation.effective_to, ${"+00:00"}, ${"+09:00"})) >= classified.work_date)
        GROUP BY classified.period_key, classified.classification,
          classified.technician_profile_id, classified.shop_id, classified.work_date
      ),
      valid_salary_dates AS (
        SELECT period_key, classification, technician_profile_id, shop_id, work_date,
          compensation_profile_id, base_salary_jpy, wage_mode
        FROM salary_date_resolution
        WHERE matching_profile_count = 1 AND invalid_profile_count = 0
      ),
      salary_anomalies AS (
        SELECT period.period_key,
          COALESCE(SUM(CASE WHEN resolution.matching_profile_count <> 1
            OR resolution.invalid_profile_count <> 0 THEN 1 ELSE 0 END), 0)
            + COALESCE(MAX(history.profile_history_anomaly_count), 0)
            AS salary_anomaly_count
        FROM periods AS period
        LEFT JOIN salary_date_resolution AS resolution
          ON resolution.period_key = period.period_key
        LEFT JOIN profile_history_anomalies AS history
          ON history.period_key = period.period_key
        GROUP BY period.period_key
      ),
      monthly_base AS (
        SELECT period_key, classification, technician_profile_id, shop_id, compensation_profile_id,
          YEAR(work_date) AS work_year, MONTH(work_date) AS work_month,
          ROUND(MAX(base_salary_jpy) * COUNT(DISTINCT eligible.work_date)
            / MAX(DAY(LAST_DAY(eligible.work_date)))) AS amount_jpy
        FROM valid_salary_dates AS eligible
        WHERE eligible.wage_mode = ${"base_plus_commission"}
        GROUP BY period_key, classification, technician_profile_id, shop_id,
          compensation_profile_id, YEAR(work_date), MONTH(work_date)
      ),
      settled_share AS (
        SELECT classified.period_key, classified.classification,
          SUM(CAST(line.amount_jpy AS DECIMAL(65, 0))) AS amount_jpy
        FROM classified_orders AS classified
        INNER JOIN payslip_lines AS line
          ON line.order_id = classified.booking_order_id
          AND line.line_type = ${"commission"}
          AND line.deleted_at IS NULL
        INNER JOIN payslips AS payslip
          ON payslip.id = line.payslip_id
          AND payslip.shop_id = classified.shop_id
          AND payslip.technician_profile_id = classified.technician_profile_id
          AND payslip.status IN (${"approved"}, ${"scheduled"}, ${"paid"}, ${"locked"})
          AND payslip.dispute_status = ${"none"}
          AND payslip.deleted_at IS NULL
        INNER JOIN pay_runs AS pay_run
          ON pay_run.id = payslip.pay_run_id
          AND pay_run.status IN (${"approved"}, ${"scheduled"}, ${"paid"}, ${"locked"})
          AND pay_run.deleted_at IS NULL
        WHERE line.amount_jpy >= 0
        GROUP BY classified.period_key, classified.classification
      ),
      monthly_base_summary AS (
        SELECT period_key,
          SUM(CASE WHEN classification = ${"dedicated"} THEN amount_jpy ELSE 0 END) AS dedicated_jpy,
          SUM(CASE WHEN classification = ${"part_time"} THEN amount_jpy ELSE 0 END) AS part_time_jpy
        FROM monthly_base
        GROUP BY period_key
      ),
      settled_share_summary AS (
        SELECT period_key,
          SUM(CASE WHEN classification = ${"dedicated"} THEN amount_jpy ELSE 0 END) AS dedicated_jpy,
          SUM(CASE WHEN classification = ${"part_time"} THEN amount_jpy ELSE 0 END) AS part_time_jpy
        FROM settled_share
        GROUP BY period_key
      ),
      technician_commission AS (
        SELECT period.period_key,
          COALESCE(monthly.dedicated_jpy, 0) + COALESCE(share.dedicated_jpy, 0) AS dedicated_jpy,
          COALESCE(monthly.part_time_jpy, 0) + COALESCE(share.part_time_jpy, 0) AS part_time_jpy
        FROM periods AS period
        LEFT JOIN monthly_base_summary AS monthly ON monthly.period_key = period.period_key
        LEFT JOIN settled_share_summary AS share ON share.period_key = period.period_key
      ),
      settled_affiliate AS (
        SELECT period.period_key, reward.reward_ndp, reward.platform_fee_ndp
        FROM periods AS period
        INNER JOIN affiliate_rewards AS reward
          ON reward.settled_at >= period.from_inclusive
          AND reward.settled_at < period.to_exclusive
          AND reward.status = ${"settled"}
          AND reward.deleted_at IS NULL
        INNER JOIN affiliate_attributions AS attribution
          ON attribution.id = reward.attribution_id
          AND attribution.booking_order_id = reward.booking_order_id
          AND attribution.task_id = reward.task_id
          AND attribution.claim_id = reward.claim_id
          AND attribution.status = ${"settled"}
          AND attribution.settled_at = reward.settled_at
          AND attribution.deleted_at IS NULL
        INNER JOIN booking_orders AS booking
          ON booking.id = attribution.booking_order_id
          AND booking.shop_id = attribution.shop_id
          AND booking.status = ${"completed"}
          AND booking.payment_status = ${"confirmed"}
          AND booking.payment_confirmed_by_id IS NOT NULL
          AND booking.payment_refunded_at IS NULL
          AND booking.payment_refunded_by_id IS NULL
          AND booking.payment_refund_reference IS NULL
          AND booking.payment_refund_reason IS NULL
          AND booking.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = attribution.shop_id AND shop.deleted_at IS NULL
        INNER JOIN affiliate_reward_transactions AS reward_transaction
          ON reward_transaction.reward_id = reward.id
          AND reward_transaction.kind = ${"settlement"}
          AND reward_transaction.amount_ndp = reward.reward_ndp + reward.platform_fee_ndp
          AND reward_transaction.deleted_at IS NULL
        INNER JOIN ledger_transactions AS ledger
          ON ledger.id = reward_transaction.ledger_transaction_id
          AND ledger.type = ${"affiliate_reward_settlement"}
          AND ledger.status = ${"applied"}
          AND ledger.reference_type = ${"affiliate_reward"}
          AND ledger.reference_id = reward.id
          AND ledger.amount = reward.reward_ndp + reward.platform_fee_ndp
          AND ledger.currency = ${"NDP"}
          AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, ${"$.taskId"})) = CAST(reward.task_id AS CHAR)
          AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, ${"$.attributionId"})) = CAST(reward.attribution_id AS CHAR)
          AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, ${"$.bookingOrderId"})) = CAST(reward.booking_order_id AS CHAR)
          AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, ${"$.rewardNdp"})) = CAST(reward.reward_ndp AS CHAR)
          AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, ${"$.platformFeeNdp"})) = CAST(reward.platform_fee_ndp AS CHAR)
          AND ledger.deleted_at IS NULL
        WHERE ${attributionScope}
          AND reward.reward_ndp >= 0 AND reward.platform_fee_ndp >= 0
          AND reward.reversal_required_ndp = 0
          AND reward.reversed_ndp = 0
          AND reward.outstanding_recovery_ndp = 0
          AND reward.reversed_at IS NULL
          AND reward.reversal_reason IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM affiliate_reward_transactions AS contradictory_transaction
            WHERE contradictory_transaction.reward_id = reward.id
              AND contradictory_transaction.kind IN (${"reversal"}, ${"recovery"})
              AND contradictory_transaction.deleted_at IS NULL
          )
        GROUP BY period.period_key, reward.id, reward.reward_ndp, reward.platform_fee_ndp
        HAVING COUNT(reward_transaction.id) = 1
      ),
      confirmed_agent_commission AS (
        SELECT period.period_key,
          SUM(CAST(agent_line.amount_jpy AS DECIMAL(65, 0))) AS amount_jpy
        FROM periods AS period
        INNER JOIN agent_settlements AS settlement
          ON settlement.confirmed_at >= period.from_inclusive
          AND settlement.confirmed_at < period.to_exclusive
          AND settlement.status IN (${"confirmed"}, ${"paid"})
          AND settlement.currency = ${"JPY"}
          AND settlement.deleted_at IS NULL
        INNER JOIN agent_settlement_lines AS agent_line
          ON agent_line.settlement_id = settlement.id
          AND agent_line.amount_jpy >= 0
          AND agent_line.deleted_at IS NULL
        INNER JOIN shops AS agent_shop
          ON agent_line.shop_id = agent_shop.id AND agent_shop.deleted_at IS NULL
        WHERE ${agentSettlementScope}
        GROUP BY period.period_key
      ),
      settled_platform_income AS (
        SELECT eligible.period_key,
          SUM(CAST(financial.b_platform_fee_actual_ndp + financial.c_request_fee_actual_ndp
            AS DECIMAL(65, 0))) AS amount_ndp
        FROM eligible_payment_orders AS eligible
        INNER JOIN order_financials AS financial
          ON financial.booking_order_id = eligible.booking_order_id
          AND financial.shop_id = eligible.shop_id
          AND financial.technician_profile_id = eligible.technician_profile_id
          AND financial.ndp_currency = ${"NDP"}
          AND financial.settlement_status = ${"settled"}
          AND financial.deleted_at IS NULL
        WHERE financial.b_platform_fee_actual_ndp >= 0
          AND financial.c_request_fee_actual_ndp >= 0
        GROUP BY eligible.period_key
      ),
      settled_user_rewards AS (
        SELECT period.period_key,
          SUM(CAST(financial.user_reward_ndp AS DECIMAL(65, 0))) AS amount_ndp
        FROM periods AS period
        INNER JOIN order_financials AS financial
          ON financial.user_reward_granted_at >= period.from_inclusive
          AND financial.user_reward_granted_at < period.to_exclusive
          AND financial.user_reward_status IN (${"immediate"}, ${"paid"})
          AND financial.ndp_currency = ${"NDP"}
          AND financial.settlement_status = ${"settled"}
          AND financial.deleted_at IS NULL
        INNER JOIN valid_completed_orders AS valid
          ON valid.booking_order_id = financial.booking_order_id
          AND valid.shop_id = financial.shop_id
          AND valid.technician_profile_id = financial.technician_profile_id
        WHERE financial.user_reward_granted_at IS NOT NULL
          AND financial.user_reward_ndp >= 0
          AND (
            financial.user_reward_ndp = 0
            OR EXISTS (
              SELECT 1
              FROM ledger_transactions AS reward_ledger
              INNER JOIN wallet_ledgers AS reward_entry
                ON reward_entry.transaction_id = reward_ledger.id
                AND reward_entry.direction = ${"available_credit"}
                AND reward_entry.amount = financial.user_reward_ndp
                AND reward_entry.available_delta = financial.user_reward_ndp
                AND reward_entry.frozen_delta = 0
                AND reward_entry.reason IN (${"booking_complete_customer_reward"}, ${"booking_delayed_customer_reward"})
                AND reward_entry.deleted_at IS NULL
              INNER JOIN wallets AS reward_wallet
                ON reward_wallet.id = reward_entry.wallet_id
                AND reward_wallet.owner_type = ${"user"}
                AND reward_wallet.owner_id = financial.customer_user_id
                AND reward_wallet.currency = ${"NDP"}
                AND reward_wallet.deleted_at IS NULL
              WHERE reward_ledger.type = ${"booking_complete_settlement"}
                AND reward_ledger.status = ${"applied"}
                AND reward_ledger.reference_type = ${"booking_order"}
                AND reward_ledger.reference_id = financial.booking_order_id
                AND reward_ledger.currency = ${"NDP"}
                AND reward_ledger.created_at >= financial.user_reward_granted_at
                AND reward_ledger.deleted_at IS NULL
            )
          )
        GROUP BY period.period_key
      ),
      settled_ndp_income AS (
        SELECT period.period_key,
          COALESCE(platform.amount_ndp, 0) - COALESCE(reward.amount_ndp, 0) AS amount_ndp
        FROM periods AS period
        LEFT JOIN settled_platform_income AS platform ON platform.period_key = period.period_key
        LEFT JOIN settled_user_rewards AS reward ON reward.period_key = period.period_key
      )
      SELECT period.period_key AS periodKey,
        COALESCE(MAX(anomaly.salary_anomaly_count), 0) AS salaryAnomalyCount,
        COALESCE(MAX(technician.dedicated_jpy), 0) AS dedicatedJpy,
        COALESCE(MAX(technician.part_time_jpy), 0) AS partTimeJpy,
        COALESCE(SUM(CAST(affiliate.reward_ndp AS DECIMAL(65, 0))), 0) AS marketingNdp,
        COALESCE(MAX(agent.amount_jpy), 0) AS agentJpy,
        COALESCE(MAX(ndp.amount_ndp), 0) AS ndpIncomeNdp,
        COALESCE(SUM(CAST(affiliate.platform_fee_ndp AS DECIMAL(65, 0))), 0) AS affiliatePlatformNdp
      FROM periods AS period
      LEFT JOIN technician_commission AS technician ON technician.period_key = period.period_key
      LEFT JOIN salary_anomalies AS anomaly ON anomaly.period_key = period.period_key
      LEFT JOIN settled_affiliate AS affiliate ON affiliate.period_key = period.period_key
      LEFT JOIN confirmed_agent_commission AS agent ON agent.period_key = period.period_key
      LEFT JOIN settled_ndp_income AS ndp ON ndp.period_key = period.period_key
      GROUP BY period.period_key
    `);
  }

  private toSafeAggregate(value: NumericValue): number {
    if (value === null || value === undefined) throw new RangeError(aggregateError);
    if (typeof value === "bigint") {
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new RangeError(aggregateError);
      return Number(value);
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(aggregateError);
      return value;
    }
    const serialized = typeof value === "string" ? value : value.toString();
    if (!/^(0|[1-9]\d*)$/u.test(serialized)) throw new RangeError(aggregateError);
    const parsed = Number(serialized);
    if (!Number.isSafeInteger(parsed)) throw new RangeError(aggregateError);
    return parsed;
  }
}
