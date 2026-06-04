import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  PayRunDraftSaveInput,
  PayRunPayload,
  PayRunStatus,
  PayRunTransitionInput,
  PayrollAdjustmentApplyInput,
  PayrollAdjustmentCreateInput,
  PayrollAdjustmentRequestPayload,
  PayrollAdjustmentStatus,
  PayrollAdjustmentTransitionInput,
  PayrollAdjustmentType,
  PayrollOrderFinancialSource,
  PayrollPaginationPayload,
  PayrollRepositoryPort,
  PayoutRecordConfirmInput,
  PayoutMethod,
  PayoutRecordCreateInput,
  PayoutRecordPayload,
  PayslipDisputeResolveInput,
  PayslipDisputeStatus,
  PayslipLinePayload,
  PayslipLineSourceType,
  PayslipLineType,
  PayslipPayload,
  PayslipStatus,
  PayslipTransitionInput
} from "../services/payroll.service";
import type {
  CompensationAdjustmentRule,
  CompensationNdpBearer,
  CompensationRuleSet,
  CompensationWageMode
} from "../services/compensation-engine.service";
import type { ParsedPayrollListQuery } from "../validators/payroll.validator";

const payRunInclude = {
  shop: { select: { name: true } },
  payslips: {
    where: { deletedAt: null },
    orderBy: [{ id: "asc" }],
    include: {
      shop: { select: { name: true } },
      technicianProfile: { select: { displayName: true, userId: true } },
      lines: {
        where: { deletedAt: null },
        orderBy: [{ id: "asc" }]
      },
      payoutRecords: {
        where: { deletedAt: null },
        orderBy: [{ id: "asc" }]
      }
    }
  }
} satisfies Prisma.PayRunInclude;

const payslipInclude = {
  shop: { select: { name: true } },
  technicianProfile: { select: { displayName: true, userId: true } },
  lines: {
    where: { deletedAt: null },
    orderBy: [{ id: "asc" }]
  },
  payoutRecords: {
    where: { deletedAt: null },
    orderBy: [{ id: "asc" }]
  }
} satisfies Prisma.PayslipInclude;

const payrollAdjustmentInclude = {
  shop: { select: { name: true } },
  technicianProfile: { select: { displayName: true, userId: true } }
} satisfies Prisma.PayrollAdjustmentRequestInclude;

type PayRunRecord = Prisma.PayRunGetPayload<{ include: typeof payRunInclude }>;
type PayslipRecord = Prisma.PayslipGetPayload<{ include: typeof payslipInclude }>;
type PayrollAdjustmentRecord = Prisma.PayrollAdjustmentRequestGetPayload<{
  include: typeof payrollAdjustmentInclude;
}>;
type PayslipLineRecord = Prisma.PayslipLineGetPayload<Record<string, never>>;
type PayoutRecordRecord = Prisma.PayoutRecordGetPayload<Record<string, never>>;
type TechnicianProfileRecord = Prisma.TechnicianCompensationProfileGetPayload<
  Record<string, never>
>;
type ShopRuleRecord = Prisma.ShopFinanceRuleSetGetPayload<Record<string, never>>;

export class PayrollRepository implements PayrollRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listMerchantPayRuns(
    shopId: number,
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayRunPayload>> {
    return this.listPayRuns({ ...query, shopId });
  }

  public async listBackofficePayRuns(
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayRunPayload>> {
    return this.listPayRuns(query);
  }

  public async listTechnicianPayslips(
    technicianProfileId: number,
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayslipPayload>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PayslipWhereInput = {
      technicianProfileId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {})
            }
          }
        : {})
    };
    const [rows, total] = await this.client.$transaction([
      this.client.payslip.findMany({
        where,
        include: payslipInclude,
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.client.payslip.count({ where })
    ]);

    return {
      list: rows.map((row) => this.mapPayslip(row)),
      total,
      page,
      page_size: pageSize
    };
  }

  public async findPayRunDetail(payRunId: number): Promise<PayRunPayload | null> {
    const record = await this.client.payRun.findFirst({
      where: { id: payRunId, deletedAt: null },
      include: payRunInclude
    });

    return record ? this.mapPayRun(record) : null;
  }

  public async findPayslipDetail(payslipId: number): Promise<PayslipPayload | null> {
    const record = await this.client.payslip.findFirst({
      where: { id: payslipId, deletedAt: null },
      include: payslipInclude
    });

    return record ? this.mapPayslip(record) : null;
  }

  public async findPayrollSourceOrders(input: {
    shopId: number;
    periodStart: string;
    periodEnd: string;
  }): Promise<PayrollOrderFinancialSource[]> {
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    const [financials, profiles, fallbackRule] = await this.client.$transaction([
      this.client.orderFinancial.findMany({
        where: {
          shopId: input.shopId,
          orderType: "booking",
          technicianProfileId: { not: null },
          serviceIncomeStatus: { in: ["reported", "confirmed"] },
          deletedAt: null,
          bookingOrder: {
            status: "COMPLETED",
            deletedAt: null,
            endsAt: { gte: periodStart, lte: periodEnd }
          }
        },
        include: {
          bookingOrder: {
            include: {
              shop: { select: { name: true } },
              technicianProfile: { select: { id: true, displayName: true, userId: true } }
            }
          }
        },
        orderBy: [{ bookingOrderId: "asc" }]
      }),
      this.client.technicianCompensationProfile.findMany({
        where: {
          shopId: input.shopId,
          status: "active",
          deletedAt: null
        },
        orderBy: [{ version: "desc" }, { id: "desc" }]
      }),
      this.client.shopFinanceRuleSet.findFirst({
        where: {
          shopId: input.shopId,
          status: "active",
          deletedAt: null
        },
        orderBy: [{ id: "desc" }]
      })
    ]);
    const profileByTechnician = new Map<number, CompensationRuleSet>();
    profiles.forEach((profile) => {
      if (!profileByTechnician.has(profile.technicianProfileId)) {
        profileByTechnician.set(profile.technicianProfileId, this.mapTechnicianRule(profile));
      }
    });
    const fallback = fallbackRule ? this.mapShopRule(fallbackRule) : this.defaultRule(input.shopId);

    return financials.flatMap((financial) => {
      const technicianProfileId = financial.technicianProfileId;
      const technician = financial.bookingOrder.technicianProfile;
      if (!technicianProfileId || !technician) {
        return [];
      }
      const startsAt = financial.bookingOrder.startsAt;
      const endsAt = financial.bookingOrder.endsAt;
      const workedMinutes = Math.max(
        0,
        Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)
      );

      return [
        {
          bookingOrderId: financial.bookingOrderId,
          orderNo: financial.bookingOrder.orderNo,
          shopId: financial.shopId,
          shopName: financial.bookingOrder.shop.name,
          technicianProfileId,
          technicianName: technician.displayName,
          technicianUserId: technician.userId,
          serviceName:
            financial.bookingOrder.serviceNameSnapshot ??
            financial.bookingOrder.note ??
            financial.bookingOrder.orderNo,
          completedAt: endsAt.toISOString(),
          workedMinutes,
          serviceAmountJpy: financial.serviceAmountJpy,
          bPlatformFeeActualNdp: financial.bPlatformFeeActualNdp,
          serviceIncomeStatus:
            financial.serviceIncomeStatus === "confirmed" ? "confirmed" : "reported",
          compensationRule: profileByTechnician.get(technicianProfileId) ?? fallback
        }
      ];
    });
  }

  public async savePayRunDraft(input: PayRunDraftSaveInput): Promise<PayRunPayload> {
    const created = await this.client.$transaction(async (transaction) => {
      await transaction.payRun.updateMany({
        where: {
          shopId: input.shopId,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          status: { in: ["draft", "reviewing"] },
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      return transaction.payRun.create({
        data: {
          shopId: input.shopId,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          status: input.status,
          totalBaseSalaryJpy: input.totalBaseSalaryJpy,
          totalCommissionJpy: input.totalCommissionJpy,
          totalBonusJpy: input.totalBonusJpy,
          totalAllowanceJpy: input.totalAllowanceJpy,
          totalDeductionJpy: input.totalDeductionJpy,
          totalNetPayJpy: input.totalNetPayJpy,
          paidAmountJpy: input.paidAmountJpy,
          unpaidAmountJpy: input.unpaidAmountJpy,
          generatedById: input.generatedById,
          approvedById: input.approvedById,
          lockedAt: input.lockedAt ? new Date(input.lockedAt) : null,
          payslips: {
            create: input.payslips.map((payslip) => ({
              shopId: payslip.shopId,
              technicianProfileId: payslip.technicianProfileId,
              technicianUserId: payslip.technicianUserId,
              compensationProfileId: payslip.compensationProfileId,
              periodStart: new Date(payslip.periodStart),
              periodEnd: new Date(payslip.periodEnd),
              status: payslip.status,
              disputeStatus: payslip.disputeStatus,
              disputeReason: payslip.disputeReason,
              baseSalaryJpy: payslip.baseSalaryJpy,
              annualSalaryProratedJpy: payslip.annualSalaryProratedJpy,
              dailyWageJpy: payslip.dailyWageJpy,
              hourlyWageJpy: payslip.hourlyWageJpy,
              commissionJpy: payslip.commissionJpy,
              guaranteeTopupJpy: payslip.guaranteeTopupJpy,
              bonusJpy: payslip.bonusJpy,
              allowanceJpy: payslip.allowanceJpy,
              deductionJpy: payslip.deductionJpy,
              platformFeeShareDeductionJpy: payslip.platformFeeShareDeductionJpy,
              netPayJpy: payslip.netPayJpy,
              paidAmountJpy: payslip.paidAmountJpy,
              unpaidAmountJpy: payslip.unpaidAmountJpy,
              lines: {
                create: payslip.lines.map((line) => ({
                  lineType: line.lineType,
                  title: line.title,
                  amountJpy: line.amountJpy,
                  quantity: line.quantity,
                  unitAmountJpy: line.unitAmountJpy,
                  formulaText: line.formulaText,
                  sourceType: line.sourceType,
                  sourceId: line.sourceId,
                  ruleId: line.ruleId,
                  orderId: line.orderId,
                  explanation: line.explanation,
                  createdById: line.createdById
                }))
              }
            }))
          }
        },
        include: payRunInclude
      });
    });

    return this.mapPayRun(created);
  }

  public async transitionPayRun(input: PayRunTransitionInput): Promise<PayRunPayload> {
    const updated = await this.client.$transaction(async (transaction) => {
      const payRun = await transaction.payRun.update({
        where: { id: input.payRunId },
        data: {
          status: input.status,
          approvedById: input.approvedById ?? undefined,
          lockedAt: input.lockedAt ? new Date(input.lockedAt) : undefined
        }
      });
      if (input.status === "published") {
        await transaction.payslip.updateMany({
          where: {
            payRunId: input.payRunId,
            status: { in: ["draft", "reviewing"] },
            deletedAt: null
          },
          data: { status: "published" }
        });
      }
      if (input.status === "approved" || input.status === "locked") {
        await transaction.payslip.updateMany({
          where: { payRunId: input.payRunId, deletedAt: null },
          data: { status: input.status }
        });
      }

      return transaction.payRun.findUniqueOrThrow({
        where: { id: payRun.id },
        include: payRunInclude
      });
    });

    return this.mapPayRun(updated);
  }

  public async transitionPayslip(input: PayslipTransitionInput): Promise<PayslipPayload> {
    const updated = await this.client.$transaction(async (transaction) => {
      const payslip = await transaction.payslip.update({
        where: { id: input.payslipId },
        data: {
          status: input.status,
          disputeStatus: input.disputeStatus,
          disputeReason: input.disputeReason,
          confirmedAt: input.confirmedAt ? new Date(input.confirmedAt) : undefined,
          disputedAt: input.disputedAt ? new Date(input.disputedAt) : undefined
        },
        include: payslipInclude
      });
      const siblings = await transaction.payslip.findMany({
        where: { payRunId: payslip.payRunId, deletedAt: null },
        select: { status: true }
      });
      const payRunStatus = siblings.some((item) => item.status === "disputed")
        ? "disputed"
        : siblings.every((item) => item.status === "confirmed")
          ? "confirmed"
          : null;
      if (payRunStatus) {
        await transaction.payRun.update({
          where: { id: payslip.payRunId },
          data: { status: payRunStatus }
        });
      }

      return payslip;
    });

    return this.mapPayslip(updated);
  }

  public async resolvePayslipDispute(input: PayslipDisputeResolveInput): Promise<PayslipPayload> {
    const updated = await this.client.$transaction(async (transaction) => {
      const payslip = await transaction.payslip.update({
        where: { id: input.payslipId },
        data: {
          status: input.status,
          disputeStatus: input.disputeStatus,
          disputeResolvedById: input.disputeResolvedById,
          disputeResolvedAt: new Date(input.disputeResolvedAt),
          disputeResolutionNote: input.disputeResolutionNote
        },
        include: payslipInclude
      });
      await transaction.payRun.update({
        where: { id: payslip.payRunId },
        data: { status: "published" }
      });

      return payslip;
    });

    return this.mapPayslip(updated);
  }

  public async addPayoutRecord(input: PayoutRecordCreateInput): Promise<PayslipPayload> {
    const updated = await this.client.$transaction(async (transaction) => {
      const payslip = await transaction.payslip.update({
        where: { id: input.payslipId },
        data: {
          paidAmountJpy: input.nextPaidAmountJpy,
          unpaidAmountJpy: input.nextUnpaidAmountJpy,
          status: input.nextPayslipStatus,
          payoutRecords: {
            create: {
              shopId: input.shopId,
              technicianProfileId: input.technicianProfileId,
              amountJpy: input.amountJpy,
              payoutMethod: input.payoutMethod,
              payoutDate: new Date(input.payoutDate),
              referenceNo: input.referenceNo,
              proofUrl: input.proofUrl,
              note: input.note,
              status: "completed",
              confirmedByTechnician: false,
              createdById: input.createdById
            }
          }
        },
        include: payslipInclude
      });
      const totals = await transaction.payslip.aggregate({
        where: { payRunId: payslip.payRunId, deletedAt: null },
        _sum: {
          paidAmountJpy: true,
          unpaidAmountJpy: true
        }
      });
      await transaction.payRun.update({
        where: { id: payslip.payRunId },
        data: {
          paidAmountJpy: totals._sum.paidAmountJpy ?? 0,
          unpaidAmountJpy: totals._sum.unpaidAmountJpy ?? 0,
          status: (totals._sum.unpaidAmountJpy ?? 0) === 0 ? "paid" : "scheduled"
        }
      });

      return payslip;
    });

    return this.mapPayslip(updated);
  }

  public async confirmPayoutRecord(input: PayoutRecordConfirmInput): Promise<PayslipPayload> {
    const updated = await this.client.$transaction(async (transaction) => {
      const result = await transaction.payoutRecord.updateMany({
        where: {
          id: input.payoutRecordId,
          payslipId: input.payslipId,
          technicianProfileId: input.technicianProfileId,
          deletedAt: null
        },
        data: {
          confirmedByTechnician: true,
          technicianConfirmedAt: new Date(input.technicianConfirmedAt)
        }
      });
      if (result.count !== 1) {
        throw new Error("payout_record_not_found");
      }

      return transaction.payslip.findUniqueOrThrow({
        where: { id: input.payslipId },
        include: payslipInclude
      });
    });

    return this.mapPayslip(updated);
  }

  public async listMerchantPayrollAdjustments(
    shopId: number,
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayrollAdjustmentRequestPayload>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PayrollAdjustmentRequestWhereInput = {
      shopId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {})
            }
          }
        : {})
    };
    const [rows, total] = await this.client.$transaction([
      this.client.payrollAdjustmentRequest.findMany({
        where,
        include: payrollAdjustmentInclude,
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.client.payrollAdjustmentRequest.count({ where })
    ]);

    return {
      list: rows.map((row) => this.mapPayrollAdjustment(row)),
      total,
      page,
      page_size: pageSize
    };
  }

  public async createPayrollAdjustment(
    input: PayrollAdjustmentCreateInput
  ): Promise<PayrollAdjustmentRequestPayload> {
    const created = await this.client.payrollAdjustmentRequest.create({
      data: {
        shopId: input.shopId,
        technicianProfileId: input.technicianProfileId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        adjustmentType: input.adjustmentType,
        title: input.title,
        amountJpy: input.amountJpy,
        reason: input.reason,
        proofUrl: input.proofUrl,
        status: "draft",
        requestedById: input.requestedById
      },
      include: payrollAdjustmentInclude
    });

    return this.mapPayrollAdjustment(created);
  }

  public async findPayrollAdjustment(
    adjustmentId: number
  ): Promise<PayrollAdjustmentRequestPayload | null> {
    const record = await this.client.payrollAdjustmentRequest.findFirst({
      where: { id: adjustmentId, deletedAt: null },
      include: payrollAdjustmentInclude
    });

    return record ? this.mapPayrollAdjustment(record) : null;
  }

  public async transitionPayrollAdjustment(
    input: PayrollAdjustmentTransitionInput
  ): Promise<PayrollAdjustmentRequestPayload> {
    const updated = await this.client.payrollAdjustmentRequest.update({
      where: { id: input.adjustmentId },
      data: {
        status: input.status,
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : undefined,
        approvedById: input.approvedById ?? undefined,
        approvedAt: input.approvedAt ? new Date(input.approvedAt) : undefined,
        rejectedById: input.rejectedById ?? undefined,
        rejectedAt: input.rejectedAt ? new Date(input.rejectedAt) : undefined,
        rejectionReason: input.rejectionReason ?? undefined
      },
      include: payrollAdjustmentInclude
    });

    return this.mapPayrollAdjustment(updated);
  }

  public async listApprovedPayrollAdjustments(input: {
    shopId: number;
    periodStart: string;
    periodEnd: string;
  }): Promise<PayrollAdjustmentRequestPayload[]> {
    const rows = await this.client.payrollAdjustmentRequest.findMany({
      where: {
        shopId: input.shopId,
        status: "approved",
        appliedPayRunId: null,
        deletedAt: null,
        periodStart: { gte: new Date(input.periodStart) },
        periodEnd: { lte: new Date(input.periodEnd) }
      },
      include: payrollAdjustmentInclude,
      orderBy: [{ technicianProfileId: "asc" }, { id: "asc" }]
    });

    return rows.map((row) => this.mapPayrollAdjustment(row));
  }

  public async applyPayrollAdjustments(input: PayrollAdjustmentApplyInput): Promise<void> {
    if (input.applications.length === 0) {
      return;
    }
    await this.client.$transaction(
      input.applications.map((application) =>
        this.client.payrollAdjustmentRequest.updateMany({
          where: {
            id: application.adjustmentId,
            status: "approved",
            deletedAt: null
          },
          data: {
            status: "applied",
            appliedPayRunId: input.payRunId,
            appliedPayslipLineId: application.payslipLineId
          }
        })
      )
    );
  }

  public async hasClosedPayRunForPeriod(input: {
    shopId: number;
    technicianProfileId: number;
    periodStart: string;
    periodEnd: string;
  }): Promise<boolean> {
    const closed = await this.client.payRun.findFirst({
      where: {
        shopId: input.shopId,
        deletedAt: null,
        periodStart: { lte: new Date(input.periodEnd) },
        periodEnd: { gte: new Date(input.periodStart) },
        status: { in: ["paid", "locked"] },
        payslips: {
          some: {
            technicianProfileId: input.technicianProfileId,
            deletedAt: null
          }
        }
      },
      select: { id: true }
    });

    return closed !== null;
  }

  private async listPayRuns(
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayRunPayload>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PayRunWhereInput = {
      deletedAt: null,
      ...(query.shopId ? { shopId: query.shopId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {})
            }
          }
        : {})
    };
    const [rows, total] = await this.client.$transaction([
      this.client.payRun.findMany({
        where,
        include: payRunInclude,
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.client.payRun.count({ where })
    ]);

    return {
      list: rows.map((row) => this.mapPayRun(row)),
      total,
      page,
      page_size: pageSize
    };
  }

  private mapPayRun(record: PayRunRecord): PayRunPayload {
    return {
      id: record.id,
      shopId: record.shopId,
      shopName: record.shop.name,
      periodStart: record.periodStart.toISOString(),
      periodEnd: record.periodEnd.toISOString(),
      status: this.payRunStatus(record.status),
      totalBaseSalaryJpy: record.totalBaseSalaryJpy,
      totalCommissionJpy: record.totalCommissionJpy,
      totalBonusJpy: record.totalBonusJpy,
      totalAllowanceJpy: record.totalAllowanceJpy,
      totalDeductionJpy: record.totalDeductionJpy,
      totalNetPayJpy: record.totalNetPayJpy,
      paidAmountJpy: record.paidAmountJpy,
      unpaidAmountJpy: record.unpaidAmountJpy,
      generatedById: record.generatedById,
      approvedById: record.approvedById,
      lockedAt: record.lockedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      payslips: record.payslips.map((payslip) => this.mapPayslip(payslip))
    };
  }

  private mapPayslip(record: PayslipRecord): PayslipPayload {
    return {
      id: record.id,
      payRunId: record.payRunId,
      shopId: record.shopId,
      shopName: record.shop.name,
      technicianProfileId: record.technicianProfileId,
      technicianName: record.technicianProfile.displayName,
      technicianUserId: record.technicianUserId ?? record.technicianProfile.userId,
      compensationProfileId: record.compensationProfileId,
      periodStart: record.periodStart.toISOString(),
      periodEnd: record.periodEnd.toISOString(),
      status: this.payslipStatus(record.status),
      disputeStatus: this.disputeStatus(record.disputeStatus),
      disputeReason: record.disputeReason,
      baseSalaryJpy: record.baseSalaryJpy,
      annualSalaryProratedJpy: record.annualSalaryProratedJpy,
      dailyWageJpy: record.dailyWageJpy,
      hourlyWageJpy: record.hourlyWageJpy,
      commissionJpy: record.commissionJpy,
      guaranteeTopupJpy: record.guaranteeTopupJpy,
      bonusJpy: record.bonusJpy,
      allowanceJpy: record.allowanceJpy,
      deductionJpy: record.deductionJpy,
      platformFeeShareDeductionJpy: record.platformFeeShareDeductionJpy,
      netPayJpy: record.netPayJpy,
      paidAmountJpy: record.paidAmountJpy,
      unpaidAmountJpy: record.unpaidAmountJpy,
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      disputedAt: record.disputedAt?.toISOString() ?? null,
      disputeResolvedAt: record.disputeResolvedAt?.toISOString() ?? null,
      disputeResolvedById: record.disputeResolvedById,
      disputeResolutionNote: record.disputeResolutionNote,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      lines: record.lines.map((line) => this.mapLine(line)),
      payoutRecords: record.payoutRecords.map((payout) => this.mapPayoutRecord(payout))
    };
  }

  private mapLine(record: PayslipLineRecord): PayslipLinePayload {
    return {
      id: record.id,
      payslipId: record.payslipId,
      lineType: this.lineType(record.lineType),
      title: record.title,
      amountJpy: record.amountJpy,
      quantity: Number(record.quantity),
      unitAmountJpy: record.unitAmountJpy,
      formulaText: record.formulaText,
      sourceType: this.sourceType(record.sourceType),
      sourceId: record.sourceId,
      ruleId: record.ruleId,
      orderId: record.orderId,
      explanation: record.explanation,
      createdById: record.createdById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapPayoutRecord(record: PayoutRecordRecord): PayoutRecordPayload {
    return {
      id: record.id,
      payslipId: record.payslipId,
      shopId: record.shopId,
      technicianProfileId: record.technicianProfileId,
      amountJpy: record.amountJpy,
      payoutMethod: this.payoutMethod(record.payoutMethod),
      payoutDate: record.payoutDate.toISOString(),
      referenceNo: record.referenceNo,
      proofUrl: record.proofUrl,
      note: record.note,
      status:
        record.status === "pending" || record.status === "failed" || record.status === "cancelled"
          ? record.status
          : "completed",
      confirmedByTechnician: record.confirmedByTechnician,
      technicianConfirmedAt: record.technicianConfirmedAt?.toISOString() ?? null,
      createdById: record.createdById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapPayrollAdjustment(record: PayrollAdjustmentRecord): PayrollAdjustmentRequestPayload {
    return {
      id: record.id,
      shopId: record.shopId,
      shopName: record.shop.name,
      technicianProfileId: record.technicianProfileId,
      technicianName: record.technicianProfile.displayName,
      technicianUserId: record.technicianProfile.userId,
      periodStart: record.periodStart.toISOString(),
      periodEnd: record.periodEnd.toISOString(),
      adjustmentType: this.payrollAdjustmentType(record.adjustmentType),
      title: record.title,
      amountJpy: record.amountJpy,
      reason: record.reason,
      proofUrl: record.proofUrl,
      status: this.payrollAdjustmentStatus(record.status),
      requestedById: record.requestedById,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      approvedById: record.approvedById,
      approvedAt: record.approvedAt?.toISOString() ?? null,
      rejectedById: record.rejectedById,
      rejectedAt: record.rejectedAt?.toISOString() ?? null,
      rejectionReason: record.rejectionReason,
      appliedPayRunId: record.appliedPayRunId,
      appliedPayslipLineId: record.appliedPayslipLineId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapTechnicianRule(record: TechnicianProfileRecord): CompensationRuleSet {
    return {
      id: record.id,
      sourceType: "technician_override",
      shopId: record.shopId,
      technicianProfileId: record.technicianProfileId,
      name: record.name,
      wageMode: this.wageMode(record.wageMode),
      baseSalaryJpy: record.baseSalaryJpy,
      hourlyRateJpy: record.hourlyRateJpy,
      dailyRateJpy: record.dailyRateJpy,
      fixedOrderPayJpy: record.fixedOrderPayJpy,
      commissionRatePercent: record.commissionRateBps / 100,
      guaranteedMinimumJpy: record.guaranteedMinimumJpy,
      ndpFeeBearer: this.ndpBearer(record.ndpFeeBearer),
      technicianNdpSharePercent: record.technicianNdpShareBps / 100,
      bonusRules: this.adjustmentRules(record.bonusRulesJson),
      deductionRules: this.adjustmentRules(record.deductionRulesJson)
    };
  }

  private mapShopRule(record: ShopRuleRecord): CompensationRuleSet {
    return {
      id: record.id,
      sourceType: "shop_default",
      shopId: record.shopId,
      technicianProfileId: null,
      name: record.name,
      wageMode: this.wageMode(record.wageMode),
      baseSalaryJpy: record.baseSalaryJpy,
      hourlyRateJpy: record.hourlyRateJpy,
      dailyRateJpy: record.dailyRateJpy,
      fixedOrderPayJpy: record.fixedOrderPayJpy,
      commissionRatePercent: record.commissionRateBps / 100,
      guaranteedMinimumJpy: record.guaranteedMinimumJpy,
      ndpFeeBearer: this.ndpBearer(record.ndpFeeBearer),
      technicianNdpSharePercent: record.technicianNdpShareBps / 100,
      bonusRules: this.adjustmentRules(record.bonusRulesJson),
      deductionRules: this.adjustmentRules(record.deductionRulesJson)
    };
  }

  private defaultRule(shopId: number): CompensationRuleSet {
    return {
      id: 0,
      sourceType: "shop_default",
      shopId,
      technicianProfileId: null,
      name: "Default commission payroll",
      wageMode: "commission",
      baseSalaryJpy: 0,
      hourlyRateJpy: 0,
      dailyRateJpy: 0,
      fixedOrderPayJpy: 0,
      commissionRatePercent: 60,
      guaranteedMinimumJpy: 0,
      ndpFeeBearer: "shop",
      technicianNdpSharePercent: 0,
      bonusRules: [],
      deductionRules: []
    };
  }

  private adjustmentRules(value: unknown): CompensationAdjustmentRule[] {
    return Array.isArray(value)
      ? value.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }
          const rule = item as Partial<CompensationAdjustmentRule>;
          if (
            typeof rule.id !== "string" ||
            typeof rule.name !== "string" ||
            typeof rule.triggerType !== "string" ||
            typeof rule.threshold !== "number" ||
            typeof rule.amountJpy !== "number"
          ) {
            return [];
          }
          return [
            {
              id: rule.id,
              name: rule.name,
              triggerType: rule.triggerType as CompensationAdjustmentRule["triggerType"],
              threshold: rule.threshold,
              amountJpy: rule.amountJpy,
              active: rule.active ?? true
            }
          ];
        })
      : [];
  }

  private payRunStatus(value: string): PayRunStatus {
    return this.status(value) as PayRunStatus;
  }

  private payslipStatus(value: string): PayslipStatus {
    return this.status(value) as PayslipStatus;
  }

  private status(value: string): PayRunStatus {
    if (
      value === "draft" ||
      value === "reviewing" ||
      value === "published" ||
      value === "confirmed" ||
      value === "disputed" ||
      value === "approved" ||
      value === "scheduled" ||
      value === "paid" ||
      value === "locked"
    ) {
      return value;
    }

    return "draft";
  }

  private disputeStatus(value: string): PayslipDisputeStatus {
    if (value === "confirmed" || value === "disputed" || value === "resolved") {
      return value;
    }

    return "none";
  }

  private lineType(value: string): PayslipLineType {
    if (
      value === "base_salary" ||
      value === "commission" ||
      value === "bonus" ||
      value === "allowance" ||
      value === "deduction" ||
      value === "adjustment" ||
      value === "guarantee_topup" ||
      value === "platform_fee_share_deduction"
    ) {
      return value;
    }

    return "adjustment";
  }

  private sourceType(value: string): PayslipLineSourceType {
    if (
      value === "order" ||
      value === "attendance" ||
      value === "rule" ||
      value === "manual" ||
      value === "payout" ||
      value === "adjustment"
    ) {
      return value;
    }

    return "manual";
  }

  private wageMode(value: string): CompensationWageMode {
    if (
      value === "fixed_per_order" ||
      value === "commission" ||
      value === "base_plus_commission" ||
      value === "hourly"
    ) {
      return value;
    }

    return "commission";
  }

  private ndpBearer(value: string): CompensationNdpBearer {
    if (value === "shop" || value === "technician" || value === "split") {
      return value;
    }

    return "shop";
  }

  private payoutMethod(value: string): PayoutMethod {
    if (
      value === "bank_transfer" ||
      value === "cash" ||
      value === "ndp" ||
      value === "external" ||
      value === "mixed" ||
      value === "other"
    ) {
      return value;
    }

    return "other";
  }

  private payrollAdjustmentType(value: string): PayrollAdjustmentType {
    if (value === "bonus" || value === "allowance" || value === "deduction") {
      return value;
    }

    return "adjustment";
  }

  private payrollAdjustmentStatus(value: string): PayrollAdjustmentStatus {
    if (
      value === "draft" ||
      value === "submitted" ||
      value === "approved" ||
      value === "rejected" ||
      value === "applied"
    ) {
      return value;
    }

    return "draft";
  }
}
