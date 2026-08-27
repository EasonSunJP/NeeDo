import type { Prisma, PrismaClient } from "@prisma/client";
import type { PayrollService } from "../services/payroll.service";
import type { PayRunPayload } from "../services/payroll.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../services/auth.service";
import { SIMULATION_NAMESPACE } from "./three-month-simulation-plan";

const LEGACY_SIMULATION_NAMESPACE = "needo_three_month_v1";

export interface LifeDancePayrollPort {
  generateMerchantPayRun: PayrollService["generateMerchantPayRun"];
  publishMerchantPayRun: PayrollService["publishMerchantPayRun"];
  confirmTechnicianPayslip: PayrollService["confirmTechnicianPayslip"];
  approveMerchantPayRun: PayrollService["approveMerchantPayRun"];
  recordMerchantPayout: PayrollService["recordMerchantPayout"];
  confirmTechnicianPayoutRecord: PayrollService["confirmTechnicianPayoutRecord"];
}

export interface LifeDanceTechnicianPayrollActor {
  technicianProfileId: number;
  actor: AuthenticatedAccessContext;
}

export interface LifeDancePayrollWorkflowInput {
  shopId: number;
  merchantActor: AuthenticatedAccessContext;
  technicianActors: LifeDanceTechnicianPayrollActor[];
  context: AuthRequestContext;
}

export const LIFEDANCE_PAYROLL_PERIODS = [
  {
    month: "2026-06",
    periodStart: "2026-05-31T15:00:00.000Z",
    periodEnd: "2026-06-30T14:59:59.999Z",
    payoutDate: "2026-07-05T03:00:00.000Z",
    payoutReferencePrefix: "LD-PAYOUT-202606",
    shouldPay: true
  },
  {
    month: "2026-07",
    periodStart: "2026-06-30T15:00:00.000Z",
    periodEnd: "2026-07-31T14:59:59.999Z",
    payoutDate: "2026-08-05T03:00:00.000Z",
    payoutReferencePrefix: "LD-PAYOUT-202607",
    shouldPay: true
  },
  {
    month: "2026-08",
    periodStart: "2026-07-31T15:00:00.000Z",
    periodEnd: "2026-08-31T14:59:59.999Z",
    payoutDate: null,
    payoutReferencePrefix: null,
    shouldPay: false
  }
] as const;

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const payrollPeriodWhere = (shopId: number) => ({
  shopId,
  OR: LIFEDANCE_PAYROLL_PERIODS.map((period) => ({
    periodStart: new Date(period.periodStart),
    periodEnd: new Date(period.periodEnd)
  })),
  deletedAt: null
});

export const resetLifeDancePayrollPeriods = async (
  client: PrismaClient,
  shopId: number
): Promise<number> => {
  const payRuns = await client.payRun.findMany({
    where: payrollPeriodWhere(shopId),
    include: {
      payslips: {
        where: { deletedAt: null },
        include: { lines: { where: { deletedAt: null } } }
      }
    }
  });
  if (payRuns.length === 0) {
    return 0;
  }
  const sourceOrderIds = [
    ...new Set(
      payRuns.flatMap((payRun) =>
        payRun.payslips.flatMap((payslip) =>
          payslip.lines.flatMap((line) =>
            line.sourceType === "order" && line.orderId ? [line.orderId] : []
          )
        )
      )
    )
  ];
  if (sourceOrderIds.length === 0) {
    throw new Error("LIFEDANCE_PAYROLL_PERIOD_CONFLICT:NO_COHORT_ORDER_LINES");
  }
  const sourceOrders = await client.bookingOrder.findMany({
    where: { id: { in: sourceOrderIds } },
    select: { id: true, serviceSnapshotJson: true }
  });
  const verifiedOrderIds = new Set(
    sourceOrders.flatMap((order) => {
      const snapshot = readJsonRecord(order.serviceSnapshotJson);
      return [SIMULATION_NAMESPACE, LEGACY_SIMULATION_NAMESPACE].includes(
        String(snapshot?.namespace)
      )
        ? [order.id]
        : [];
    })
  );
  if (
    sourceOrders.length !== sourceOrderIds.length ||
    sourceOrderIds.some((orderId) => !verifiedOrderIds.has(orderId))
  ) {
    throw new Error("LIFEDANCE_PAYROLL_PERIOD_CONFLICT:NON_COHORT_ORDER");
  }
  const payslipIds = payRuns.flatMap((payRun) => payRun.payslips.map((payslip) => payslip.id));
  const payRunIds = payRuns.map((payRun) => payRun.id);
  const retiredAt = new Date();
  await client.$transaction(async (transaction) => {
    await transaction.payoutRecord.updateMany({
      where: { payslipId: { in: payslipIds }, deletedAt: null },
      data: { deletedAt: retiredAt }
    });
    await transaction.payslipLine.updateMany({
      where: { payslipId: { in: payslipIds }, deletedAt: null },
      data: { deletedAt: retiredAt }
    });
    await transaction.payslip.updateMany({
      where: { id: { in: payslipIds }, deletedAt: null },
      data: { deletedAt: retiredAt }
    });
    await transaction.payRun.updateMany({
      where: { id: { in: payRunIds }, deletedAt: null },
      data: { deletedAt: retiredAt }
    });
    await transaction.orderFinancial.updateMany({
      where: {
        bookingOrderId: { in: sourceOrderIds },
        settlementStatus: { in: ["payroll_approved", "settled"] },
        deletedAt: null
      },
      data: { settlementStatus: "ready_for_payroll" }
    });
  });
  return payRuns.length;
};

export interface LifeDanceCompensationProfileInput {
  technicianProfileId: number;
  employmentType: "FULL_TIME" | "TEMPORARY";
}

export const upsertLifeDanceCompensationProfiles = async (
  client: PrismaClient,
  input: {
    shopId: number;
    adminUserId: number;
    technicians: LifeDanceCompensationProfileInput[];
  }
): Promise<number[]> => {
  if (input.technicians.length !== 20) {
    throw new Error(`LIFEDANCE_COMPENSATION_TECHNICIAN_COUNT_INVALID:${input.technicians.length}`);
  }
  return client.$transaction(async (transaction) => {
    const profileIds: number[] = [];
    for (const technician of input.technicians) {
      const stableName =
        technician.employmentType === "FULL_TIME"
          ? "LifeDance 2026 正社員給与"
          : "LifeDance 2026 臨時スタッフ給与";
      const activeProfiles = await transaction.technicianCompensationProfile.findMany({
        where: {
          shopId: input.shopId,
          technicianProfileId: technician.technicianProfileId,
          status: "active",
          deletedAt: null
        },
        select: { id: true, name: true }
      });
      if (
        activeProfiles.length > 1 ||
        activeProfiles.some((profile) => profile.name !== stableName)
      ) {
        throw new Error(
          `LIFEDANCE_COMPENSATION_PROFILE_CONFLICT:${technician.technicianProfileId}`
        );
      }
      const existing =
        activeProfiles[0] ??
        (await transaction.technicianCompensationProfile.findFirst({
          where: {
            shopId: input.shopId,
            technicianProfileId: technician.technicianProfileId,
            name: stableName
          },
          orderBy: [{ id: "desc" }]
        }));
      const rule =
        technician.employmentType === "FULL_TIME"
          ? {
              wageMode: "base_plus_commission",
              baseSalaryJpy: 230_000,
              fixedOrderPayJpy: 0,
              commissionRateBps: 2_000,
              hourlyRateJpy: 0
            }
          : {
              wageMode: "hourly",
              baseSalaryJpy: 0,
              fixedOrderPayJpy: 0,
              commissionRateBps: 0,
              hourlyRateJpy: 1_500
            };
      const data = {
        name: stableName,
        status: "active",
        version: 1,
        ...rule,
        dailyRateJpy: 0,
        guaranteedMinimumJpy: 0,
        ndpFeeBearer: "shop",
        technicianNdpShareBps: 0,
        bonusRulesJson: [],
        deductionRulesJson: [],
        effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
        effectiveTo: null,
        updatedById: input.adminUserId,
        deletedAt: null
      } satisfies Prisma.TechnicianCompensationProfileUncheckedUpdateInput;
      const profile = existing
        ? await transaction.technicianCompensationProfile.update({
            where: { id: existing.id },
            data
          })
        : await transaction.technicianCompensationProfile.create({
            data: {
              shopId: input.shopId,
              technicianProfileId: technician.technicianProfileId,
              createdById: input.adminUserId,
              ...data
            }
          });
      profileIds.push(profile.id);
    }
    return profileIds;
  });
};

const getTechnicianActor = (
  actors: LifeDanceTechnicianPayrollActor[],
  technicianProfileId: number
): AuthenticatedAccessContext => {
  const actor = actors.find(
    (candidate) => candidate.technicianProfileId === technicianProfileId
  )?.actor;
  if (!actor) {
    throw new Error(`LIFEDANCE_PAYROLL_TECHNICIAN_ACTOR_MISSING:${technicianProfileId}`);
  }
  return actor;
};

export const runLifeDancePayrollWorkflow = async (
  port: LifeDancePayrollPort,
  input: LifeDancePayrollWorkflowInput
): Promise<PayRunPayload[]> => {
  if (input.technicianActors.length !== 20) {
    throw new Error(`LIFEDANCE_PAYROLL_TECHNICIAN_COUNT_INVALID:${input.technicianActors.length}`);
  }
  const results: PayRunPayload[] = [];
  for (const period of LIFEDANCE_PAYROLL_PERIODS) {
    const generated = await port.generateMerchantPayRun(input.merchantActor, input.context, {
      shopId: input.shopId,
      periodStart: new Date(period.periodStart),
      periodEnd: new Date(period.periodEnd),
      manualLines: []
    });
    const published = await port.publishMerchantPayRun(
      input.merchantActor,
      input.context,
      generated.id
    );
    if (published.payslips.length !== 20) {
      throw new Error(
        `LIFEDANCE_PAYROLL_PAYSLIP_COUNT_INVALID:${period.month}:${published.payslips.length}`
      );
    }
    for (const payslip of published.payslips) {
      await port.confirmTechnicianPayslip(
        getTechnicianActor(input.technicianActors, payslip.technicianProfileId),
        input.context,
        payslip.id
      );
    }
    const approved = await port.approveMerchantPayRun(
      input.merchantActor,
      input.context,
      generated.id
    );
    if (period.shouldPay) {
      for (const [payslipIndex, payslip] of approved.payslips.entries()) {
        const paidPayslip = await port.recordMerchantPayout(
          input.merchantActor,
          input.context,
          payslip.id,
          {
            amountJpy: payslip.unpaidAmountJpy,
            payoutMethod: "cash",
            payoutDate: new Date(period.payoutDate),
            referenceNo: `${period.payoutReferencePrefix}-${String(payslipIndex + 1).padStart(3, "0")}`,
            proofUrl: null,
            note: `${period.month} 給与支払確認`
          }
        );
        const payoutRecord = paidPayslip.payoutRecords.at(-1);
        if (!payoutRecord) {
          throw new Error(`LIFEDANCE_PAYROLL_PAYOUT_RECORD_MISSING:${payslip.id}`);
        }
        await port.confirmTechnicianPayoutRecord(
          getTechnicianActor(input.technicianActors, payslip.technicianProfileId),
          input.context,
          payslip.id,
          payoutRecord.id
        );
      }
    }
    results.push(approved);
  }
  return results;
};
