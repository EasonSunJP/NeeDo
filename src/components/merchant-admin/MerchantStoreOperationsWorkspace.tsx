import { useEffect, useMemo, useState } from "react";
import { backofficeRealDataApi, type BackofficeFinanceSettlementPayload } from "../../api/backofficeRealData";
import {
  merchantFinanceCenterApi,
  type CompensationProfilePreviewInput,
  type CompensationProfilePreviewResult,
  type OrderFinanceDetailPayload,
  type ServiceIncomeReportInput,
  type TechnicianCompensationProfileInput,
  type TechnicianCompensationProfilePayload
} from "../../api/merchantFinanceCenter";
import {
  merchantFinanceRulesApi,
  type ShopFinanceBonusRulePayload,
  type ShopFinanceNdpBearer,
  type ShopFinanceRulePreviewInput,
  type ShopFinanceRulePreviewResult,
  type ShopFinanceRuleSetInput,
  type ShopFinanceRuleSetPayload,
  type ShopFinanceWageMode
} from "../../api/merchantFinanceRules";
import {
  merchantPayrollCenterApi,
  type PayrollAdjustmentCreateInput,
  type PayrollAdjustmentRequestPayload,
  type PayRunPayload,
  type PayslipPayload
} from "../../api/merchantPayrollCenter";
import { DetailGrid } from "../admin/DetailGrid";
import { Badge } from "../ui/Badge";
import { DataTable } from "../ui/DataTable";
import { Drawer } from "../ui/Drawer";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { merchantAdminDemo } from "../../data/merchantAdmin";
import { downloadCsvExport } from "../../lib/downloadCsvExport";
import { yen } from "../../lib/utils";
import type { InventoryItem } from "../../types/domain";

export type MerchantStoreOperationsModule = "stage-layout" | "inventory" | "finance";

const stageLayoutItems = [
  { id: "bed-1", name: "A1 护理床", area: "东区", status: "使用中", utilization: "82%", nextBooking: "19:30 佐藤 美咲" },
  { id: "bed-2", name: "A2 护理床", area: "东区", status: "空闲", utilization: "48%", nextBooking: "20:15 空档" },
  { id: "room-1", name: "静音包间", area: "南区", status: "已预约", utilization: "76%", nextBooking: "21:00 林 小雨" },
  { id: "front-1", name: "前台接待", area: "入口", status: "可用", utilization: "64%", nextBooking: "随时可用" }
];

const defaultBonusRule: ShopFinanceBonusRulePayload = {
  id: "monthly-100",
  name: "月 100 单突破奖金",
  triggerType: "monthly_order_count",
  threshold: 100,
  amountJpy: 3000,
  active: true
};

const defaultFinanceRuleInput: ShopFinanceRuleSetInput = {
  name: "商户财务规则中心 v1",
  wageMode: "base_plus_commission",
  baseSalaryJpy: 0,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 1000,
  commissionRatePercent: 50,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "split",
  technicianNdpSharePercent: 30,
  bonusRules: [defaultBonusRule],
  deductionRules: []
};

const defaultPreviewInput: ShopFinanceRulePreviewInput = {
  serviceAmountJpy: 8800,
  platformFeeNdp: 500,
  workedMinutes: 60,
  monthlyCompletedOrders: 101,
  monthlyServiceGmvJpy: 900_000,
  ratingAverage: 4.8,
  lateCancellationCount: 0
};

const defaultServiceIncomeReport: ServiceIncomeReportInput = {
  serviceAmountJpy: 8800,
  platformCollectedServiceAmountJpy: 0,
  offlineReportedServiceAmountJpy: 8800,
  paymentChannel: "offline_cash",
  confirmNow: true,
  note: "店铺收款确认"
};

const defaultCompensationProfileInput: TechnicianCompensationProfileInput = {
  name: "技师收入模式 v1",
  wageMode: "base_plus_commission",
  baseSalaryJpy: 0,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 1000,
  commissionRatePercent: 50,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "split",
  technicianNdpSharePercent: 30,
  bonusRules: [defaultBonusRule],
  deductionRules: []
};

const defaultCompensationPreviewInput: CompensationProfilePreviewInput = {
  serviceAmountJpy: 8800,
  platformFeeNdp: 500,
  workedMinutes: 60,
  monthlyCompletedOrders: 101,
  monthlyServiceGmvJpy: 900_000,
  ratingAverage: 4.8,
  lateCancellationCount: 0
};

const wageModeLabels: Record<ShopFinanceWageMode, string> = {
  fixed_per_order: "单笔固定",
  commission: "按比例分成",
  base_plus_commission: "固定 + 分成",
  hourly: "按小时"
};

const ndpBearerLabels: Record<ShopFinanceNdpBearer, string> = {
  shop: "店铺承担",
  technician: "技师承担",
  split: "店铺/技师分摊"
};

function financeRuleToInput(rule: ShopFinanceRuleSetPayload): ShopFinanceRuleSetInput {
  return {
    name: rule.name,
    wageMode: rule.wageMode,
    baseSalaryJpy: rule.baseSalaryJpy,
    hourlyRateJpy: rule.hourlyRateJpy,
    dailyRateJpy: rule.dailyRateJpy,
    fixedOrderPayJpy: rule.fixedOrderPayJpy,
    commissionRatePercent: rule.commissionRatePercent,
    guaranteedMinimumJpy: rule.guaranteedMinimumJpy,
    ndpFeeBearer: rule.ndpFeeBearer,
    technicianNdpSharePercent: rule.technicianNdpSharePercent,
    bonusRules: rule.bonusRules.length > 0 ? rule.bonusRules : [defaultBonusRule],
    deductionRules: rule.deductionRules,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo
  };
}

function compensationProfileToInput(
  profile: TechnicianCompensationProfilePayload
): TechnicianCompensationProfileInput {
  return {
    name: profile.name,
    wageMode: profile.wageMode,
    baseSalaryJpy: profile.baseSalaryJpy,
    hourlyRateJpy: profile.hourlyRateJpy,
    dailyRateJpy: profile.dailyRateJpy,
    fixedOrderPayJpy: profile.fixedOrderPayJpy,
    commissionRatePercent: profile.commissionRatePercent,
    guaranteedMinimumJpy: profile.guaranteedMinimumJpy,
    ndpFeeBearer: profile.ndpFeeBearer,
    technicianNdpSharePercent: profile.technicianNdpSharePercent,
    bonusRules: profile.bonusRules.length > 0 ? profile.bonusRules : [defaultBonusRule],
    deductionRules: profile.deductionRules,
    effectiveFrom: profile.effectiveFrom,
    effectiveTo: profile.effectiveTo
  };
}

function toNumberInput(value: string, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function MerchantStoreOperationsWorkspace({
  module
}: {
  module: MerchantStoreOperationsModule;
}) {
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null);
  const [realFinanceRows, setRealFinanceRows] = useState<BackofficeFinanceSettlementPayload[]>([]);
  const [merchantShopId, setMerchantShopId] = useState<number | null>(null);
  const [financeRule, setFinanceRule] = useState<ShopFinanceRuleSetPayload | null>(null);
  const [financeRuleForm, setFinanceRuleForm] = useState<ShopFinanceRuleSetInput>(defaultFinanceRuleInput);
  const [financePreviewInput, setFinancePreviewInput] = useState<ShopFinanceRulePreviewInput>(defaultPreviewInput);
  const [financePreview, setFinancePreview] = useState<ShopFinanceRulePreviewResult | null>(null);
  const [orderFinanceDetail, setOrderFinanceDetail] = useState<OrderFinanceDetailPayload | null>(null);
  const [serviceIncomeReport, setServiceIncomeReport] = useState<ServiceIncomeReportInput>(defaultServiceIncomeReport);
  const [compensationProfile, setCompensationProfile] = useState<TechnicianCompensationProfilePayload | null>(null);
  const [compensationProfileForm, setCompensationProfileForm] = useState<TechnicianCompensationProfileInput>(defaultCompensationProfileInput);
  const [compensationPreviewInput, setCompensationPreviewInput] = useState<CompensationProfilePreviewInput>(defaultCompensationPreviewInput);
  const [compensationPreview, setCompensationPreview] = useState<CompensationProfilePreviewResult | null>(null);
  const [payRuns, setPayRuns] = useState<PayRunPayload[]>([]);
  const [activePayRun, setActivePayRun] = useState<PayRunPayload | null>(null);
  const [activePayslip, setActivePayslip] = useState<PayslipPayload | null>(null);
  const [disputeResolutionNote, setDisputeResolutionNote] = useState("已复核工资单明细并重新发布确认。");
  const [payrollAdjustments, setPayrollAdjustments] = useState<PayrollAdjustmentRequestPayload[]>([]);
  const [activePayrollAdjustment, setActivePayrollAdjustment] = useState<PayrollAdjustmentRequestPayload | null>(null);
  const [financeRuleError, setFinanceRuleError] = useState<string | null>(null);
  const [financeCenterError, setFinanceCenterError] = useState<string | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [isSavingFinanceRule, setIsSavingFinanceRule] = useState(false);
  const [isSavingIncomeReport, setIsSavingIncomeReport] = useState(false);
  const [isSavingCompensationProfile, setIsSavingCompensationProfile] = useState(false);
  const [isPayrollBusy, setIsPayrollBusy] = useState(false);
  const currentSettlement = realFinanceRows[0];
  const financeRows = useMemo(() => realFinanceRows, [realFinanceRows]);
  const primaryBonusRule = financeRuleForm.bonusRules?.[0] ?? defaultBonusRule;

  useEffect(() => {
    if (module !== "finance") {
      return undefined;
    }

    let activeRequest = true;

    backofficeRealDataApi.financeSettlements("merchant-admin").then((response) => {
      if (activeRequest) {
        setRealFinanceRows(response.list);
        const firstOrder = response.list[0];

        if (firstOrder) {
          void merchantFinanceCenterApi.getOrderFinance(firstOrder.bookingOrderId).then((detail) => {
            if (!activeRequest) {
              return;
            }

            setOrderFinanceDetail(detail);
            setServiceIncomeReport({
              serviceAmountJpy: detail.estimatedServiceGmvJpy,
              platformCollectedServiceAmountJpy: detail.platformCollectedServiceAmountJpy,
              offlineReportedServiceAmountJpy: detail.offlineReportedServiceAmountJpy || detail.estimatedServiceGmvJpy,
              paymentChannel: detail.paymentChannel === "unknown" ? "offline_cash" : detail.paymentChannel,
              confirmNow: detail.serviceIncomeStatus !== "confirmed",
              note: detail.serviceIncomeNote ?? "店铺收款确认",
              proofUrl: detail.serviceIncomeProofUrl
            });
          }).catch(() => {
            if (activeRequest) {
              setFinanceCenterError("订单钱路加载失败");
            }
          });
        }
      }
    }).catch(() => {
      if (activeRequest) {
        setRealFinanceRows([]);
      }
    });
    backofficeRealDataApi.merchantShop().then((response) => {
      const shopId = response.list[0]?.id;

      if (!activeRequest || !shopId) {
        return undefined;
      }

      setMerchantShopId(shopId);
      return merchantFinanceRulesApi.get(shopId).then((rule) => {
        if (!activeRequest) {
          return;
        }

        setFinanceRule(rule);
        setFinanceRuleForm(financeRuleToInput(rule));
        void merchantFinanceRulesApi.preview(shopId, defaultPreviewInput).then((preview) => {
          if (activeRequest) {
            setFinancePreview(preview);
          }
        });
      });
    }).catch(() => {
      if (activeRequest) {
        setFinanceRuleError("财务规则加载失败");
      }
    });
    merchantPayrollCenterApi.listPayRuns().then((response) => {
      if (!activeRequest) {
        return;
      }

      setPayRuns(response.list);
      setActivePayRun(response.list[0] ?? null);
      setActivePayslip(response.list[0]?.payslips[0] ?? null);
    }).catch(() => {
      if (activeRequest) {
        setPayrollError("工资单加载失败");
      }
    });
    merchantPayrollCenterApi.listPayrollAdjustments().then((response) => {
      if (!activeRequest) {
        return;
      }

      setPayrollAdjustments(response.list);
      setActivePayrollAdjustment(response.list[0] ?? null);
    }).catch(() => {
      if (activeRequest) {
        setPayrollError("工资调整申请加载失败");
      }
    });

    return () => {
      activeRequest = false;
    };
  }, [module]);

  useEffect(() => {
    if (module !== "finance" || !merchantShopId || !currentSettlement?.technicianProfileId) {
      return undefined;
    }

    let activeRequest = true;
    const technicianProfileId = currentSettlement.technicianProfileId;

    merchantFinanceCenterApi.getCompensationProfile(merchantShopId, technicianProfileId).then((profile) => {
      if (!activeRequest) {
        return;
      }

      setCompensationProfile(profile);
      setCompensationProfileForm(compensationProfileToInput(profile));
      void merchantFinanceCenterApi.previewCompensationProfile(
        merchantShopId,
        technicianProfileId,
        defaultCompensationPreviewInput
      ).then((preview) => {
        if (activeRequest) {
          setCompensationPreview(preview);
        }
      });
    }).catch(() => {
      if (activeRequest) {
        setFinanceCenterError("技师收入模式加载失败");
      }
    });

    return () => {
      activeRequest = false;
    };
  }, [currentSettlement?.technicianProfileId, merchantShopId, module]);

  const updateFinanceRuleField = <TKey extends keyof ShopFinanceRuleSetInput>(
    key: TKey,
    value: ShopFinanceRuleSetInput[TKey]
  ) => {
    setFinanceRuleForm((current) => ({ ...current, [key]: value }));
  };

  const updateCompensationProfileField = <TKey extends keyof TechnicianCompensationProfileInput>(
    key: TKey,
    value: TechnicianCompensationProfileInput[TKey]
  ) => {
    setCompensationProfileForm((current) => ({ ...current, [key]: value }));
  };

  const updatePrimaryBonusRule = <TKey extends keyof ShopFinanceBonusRulePayload>(
    key: TKey,
    value: ShopFinanceBonusRulePayload[TKey]
  ) => {
    setFinanceRuleForm((current) => ({
      ...current,
      bonusRules: [{ ...primaryBonusRule, [key]: value }]
    }));
  };

  const runFinancePreview = async () => {
    if (!merchantShopId) {
      return;
    }

    setFinanceRuleError(null);
    try {
      setFinancePreview(await merchantFinanceRulesApi.preview(merchantShopId, financePreviewInput));
    } catch {
      setFinanceRuleError("财务预览计算失败");
    }
  };

  const saveFinanceRule = async () => {
    if (!merchantShopId) {
      return;
    }

    setIsSavingFinanceRule(true);
    setFinanceRuleError(null);
    try {
      const nextRule = await merchantFinanceRulesApi.update(merchantShopId, {
        ...financeRuleForm,
        bonusRules: financeRuleForm.bonusRules?.map((rule) => ({ ...rule, active: rule.active ?? true })) ?? [],
        deductionRules: financeRuleForm.deductionRules ?? []
      });
      setFinanceRule(nextRule);
      setFinanceRuleForm(financeRuleToInput(nextRule));
      setFinancePreview(await merchantFinanceRulesApi.preview(merchantShopId, financePreviewInput));
    } catch {
      setFinanceRuleError("财务规则保存失败");
    } finally {
      setIsSavingFinanceRule(false);
    }
  };

  const saveServiceIncomeReport = async () => {
    if (!currentSettlement) {
      return;
    }

    setIsSavingIncomeReport(true);
    setFinanceCenterError(null);
    try {
      const detail = await merchantFinanceCenterApi.reportServiceIncome(
        currentSettlement.bookingOrderId,
        serviceIncomeReport
      );
      setOrderFinanceDetail(detail);
    } catch {
      setFinanceCenterError("服务收入上报失败");
    } finally {
      setIsSavingIncomeReport(false);
    }
  };

  const runCompensationPreview = async () => {
    if (!merchantShopId || !currentSettlement?.technicianProfileId) {
      return;
    }

    setFinanceCenterError(null);
    try {
      setCompensationPreview(
        await merchantFinanceCenterApi.previewCompensationProfile(
          merchantShopId,
          currentSettlement.technicianProfileId,
          compensationPreviewInput
        )
      );
    } catch {
      setFinanceCenterError("技师收入预览失败");
    }
  };

  const saveCompensationProfile = async () => {
    if (!merchantShopId || !currentSettlement?.technicianProfileId) {
      return;
    }

    setIsSavingCompensationProfile(true);
    setFinanceCenterError(null);
    try {
      const nextProfile = await merchantFinanceCenterApi.updateCompensationProfile(
        merchantShopId,
        currentSettlement.technicianProfileId,
        {
          ...compensationProfileForm,
          bonusRules: compensationProfileForm.bonusRules?.map((rule) => ({ ...rule, active: rule.active ?? true })) ?? [],
          deductionRules: compensationProfileForm.deductionRules ?? []
        }
      );
      setCompensationProfile(nextProfile);
      setCompensationProfileForm(compensationProfileToInput(nextProfile));
      setCompensationPreview(
        await merchantFinanceCenterApi.previewCompensationProfile(
          merchantShopId,
          currentSettlement.technicianProfileId,
          compensationPreviewInput
        )
      );
    } catch {
      setFinanceCenterError("技师收入模式保存失败");
    } finally {
      setIsSavingCompensationProfile(false);
    }
  };

  const refreshPayroll = async () => {
    const response = await merchantPayrollCenterApi.listPayRuns();
    setPayRuns(response.list);
    setActivePayRun(response.list[0] ?? null);
    setActivePayslip(response.list[0]?.payslips[0] ?? null);
  };

  const runPayrollAction = async (action: () => Promise<PayRunPayload | PayslipPayload>) => {
    setIsPayrollBusy(true);
    setPayrollError(null);
    try {
      const result = await action();
      if ("payslips" in result) {
        setActivePayRun(result);
        setPayRuns((current) => [result, ...current.filter((item) => item.id !== result.id)]);
        setActivePayslip(result.payslips[0] ?? null);
      } else {
        setActivePayslip(result);
        await refreshPayroll();
      }
    } catch {
      setPayrollError("工资单操作失败");
    } finally {
      setIsPayrollBusy(false);
    }
  };

  const refreshPayrollAdjustments = async () => {
    const response = await merchantPayrollCenterApi.listPayrollAdjustments();
    setPayrollAdjustments(response.list);
    setActivePayrollAdjustment(response.list[0] ?? null);
  };

  const runPayrollAdjustmentAction = async (
    action: () => Promise<PayrollAdjustmentRequestPayload>
  ) => {
    setIsPayrollBusy(true);
    setPayrollError(null);
    try {
      const result = await action();
      setActivePayrollAdjustment(result);
      setPayrollAdjustments((current) => [result, ...current.filter((item) => item.id !== result.id)]);
    } catch {
      setPayrollError("工资调整申请操作失败");
    } finally {
      setIsPayrollBusy(false);
    }
  };

  const exportMerchantPayRuns = async () => {
    setIsPayrollBusy(true);
    setPayrollError(null);
    try {
      downloadCsvExport(await merchantPayrollCenterApi.exportPayRuns());
    } catch {
      setPayrollError("工资 CSV 导出失败");
    } finally {
      setIsPayrollBusy(false);
    }
  };

  const createPayrollAdjustment = () => {
    const technicianProfileId = activePayslip?.technicianProfileId ?? currentSettlement?.technicianProfileId;

    if (!merchantShopId || !technicianProfileId) {
      return;
    }

    const body: PayrollAdjustmentCreateInput = {
      shopId: merchantShopId,
      technicianProfileId,
      periodStart: activePayRun?.periodStart ?? "2026-06-01T00:00:00.000Z",
      periodEnd: activePayRun?.periodEnd ?? "2026-06-30T23:59:59.000Z",
      adjustmentType: "bonus",
      title: "客户好评奖金",
      amountJpy: 1200,
      reason: "本周期收到 5 星好评"
    };

    void runPayrollAdjustmentAction(() => merchantPayrollCenterApi.createPayrollAdjustment(body));
  };

  const resolveActivePayslipDispute = () => {
    if (!activePayslip) {
      return;
    }

    void runPayrollAction(() =>
      merchantPayrollCenterApi.resolvePayslipDispute(activePayslip.id, disputeResolutionNote)
    );
  };

  const generatePayRun = () => {
    if (!merchantShopId) {
      return;
    }

    void runPayrollAction(() =>
      merchantPayrollCenterApi.createPayRun({
        shopId: merchantShopId,
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-06-30T23:59:59.000Z",
        manualLines: currentSettlement?.technicianProfileId
          ? [
              {
                technicianProfileId: currentSettlement.technicianProfileId,
                lineType: "bonus",
                title: "店铺手动奖金",
                amountJpy: 300,
                explanation: "月度表现奖励"
              }
            ]
          : []
      })
    );
  };

  const config = {
    "stage-layout": {
      title: "场控布局",
      description: "从店铺角度查看床位、包间和接待区域的占用情况，更适合门店现场调度。",
      content: (
        <div className="grid gap-5 xl:grid-cols-[1fr,0.9fr]">
          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="grid gap-3 sm:grid-cols-2">
              {stageLayoutItems.map((item) => (
                <article className="rounded-lg border border-line bg-paper p-4" key={item.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-ink/45">{item.area}</p>
                      <h2 className="mt-1 font-black">{item.name}</h2>
                    </div>
                    <Badge tone={item.status === "空闲" || item.status === "可用" ? "green" : item.status === "已预约" ? "yellow" : "red"}>{item.status}</Badge>
                  </div>
                  <div className="mt-4 rounded-full bg-white p-1">
                    <div className="h-2 rounded-full bg-moss" style={{ width: item.utilization }} />
                  </div>
                  <p className="mt-2 text-xs text-ink/55">利用率 {item.utilization} · 下一段 {item.nextBooking}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="font-black">今日空间摘要</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {[
                  ["开放工位", "4 / 6"],
                  ["高峰时段", "19:00 - 22:00"],
                  ["包间预约率", "76%"]
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-paper p-3" key={label}>
                    <p className="text-xs text-ink/45">{label}</p>
                    <strong className="mt-1 block">{value}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <TitleWithInfo
                as="h2"
                info="今晚 20:00 后东区床位利用率会抬高，建议把足底护理移到静音包间，并提前锁定热石护理耗材。"
                label="店长建议说明"
                title="店长建议"
                titleClassName="font-black"
                variant="paper"
              />
            </article>
          </section>
        </div>
      )
    },
    inventory: {
      title: "库存管理",
      description: "只显示本店耗材与工具，不掺平台其他门店的数据。",
      content: (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ["库存品项", `${merchantAdminDemo.inventoryItems.length}`],
              ["预警品项", `${merchantAdminDemo.inventoryItems.filter((item) => item.stock <= item.warningLine).length}`],
              ["最近入库", merchantAdminDemo.inventoryItems[0]?.lastChangedAt ?? "-"]
            ].map(([label, value]) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
                <p className="text-xs font-bold text-ink/50">{label}</p>
                <strong className="mt-2 block text-xl">{value}</strong>
              </article>
            ))}
          </section>
          <DataTable<InventoryItem>
            columns={[
              { key: "name", title: "物品", render: (row) => row.name },
              { key: "category", title: "分类", render: (row) => row.category },
              { key: "stock", title: "库存", render: (row) => `${row.stock}${row.unit}` },
              { key: "warning", title: "预警线", render: (row) => `${row.warningLine}${row.unit}` },
              { key: "changed", title: "最近变动", render: (row) => row.lastChangedAt },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.stock <= row.warningLine ? "red" : "green"}>{row.stock <= row.warningLine ? "需补货" : "充足"}</Badge> }
            ]}
            onView={setSelectedInventory}
            pageSize={8}
            rows={merchantAdminDemo.inventoryItems}
          />
        </div>
      )
    },
    finance: {
      title: "财务结算",
      description: "店铺后台只看本店工资、分成、NDP 承担、结算与退款影响。",
      content: (
        <div className="space-y-4">
          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <TitleWithInfo
                  as="h2"
                  info="保存后会创建新的 active 规则版本；订单预览会按当前版本计算技师收入、店铺毛利和 NDP 分摊。"
                  label="商户财务规则说明"
                  title="财务规则中心"
                  titleClassName="font-black"
                  variant="paper"
                />
                <p className="mt-1 text-xs font-bold text-ink/45">
                  {financeRule ? `规则 #${financeRule.id} · ${financeRule.updatedAt.slice(0, 10)}` : "等待规则载入"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink transition hover:bg-white"
                  onClick={() => void runFinancePreview()}
                  type="button"
                >
                  预览
                </button>
                <button
                  className="rounded-full bg-moss px-4 py-2 text-xs font-black text-white transition hover:bg-moss/90 disabled:opacity-50"
                  disabled={isSavingFinanceRule || !merchantShopId}
                  onClick={() => void saveFinanceRule()}
                  type="button"
                >
                  {isSavingFinanceRule ? "保存中" : "保存规则"}
                </button>
              </div>
            </div>

            {financeRuleError ? (
              <div className="mt-3">
                <Badge tone="red">{financeRuleError}</Badge>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr,0.85fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  规则名称
                  <input
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    value={financeRuleForm.name}
                    onChange={(event) => updateFinanceRuleField("name", event.currentTarget.value)}
                  />
                </label>
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  工资模式
                  <select
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    value={financeRuleForm.wageMode}
                    onChange={(event) => updateFinanceRuleField("wageMode", event.currentTarget.value as ShopFinanceWageMode)}
                  >
                    {Object.entries(wageModeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  单笔固定工资 JPY
                  <input
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    min={0}
                    type="number"
                    value={financeRuleForm.fixedOrderPayJpy ?? 0}
                    onChange={(event) => updateFinanceRuleField("fixedOrderPayJpy", toNumberInput(event.currentTarget.value))}
                  />
                </label>
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  小时工资 JPY
                  <input
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    min={0}
                    type="number"
                    value={financeRuleForm.hourlyRateJpy ?? 0}
                    onChange={(event) => updateFinanceRuleField("hourlyRateJpy", toNumberInput(event.currentTarget.value))}
                  />
                </label>
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  分成比例 %
                  <input
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    max={100}
                    min={0}
                    step={0.1}
                    type="number"
                    value={financeRuleForm.commissionRatePercent ?? 0}
                    onChange={(event) => updateFinanceRuleField("commissionRatePercent", toNumberInput(event.currentTarget.value))}
                  />
                </label>
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  保底工资 JPY
                  <input
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    min={0}
                    type="number"
                    value={financeRuleForm.guaranteedMinimumJpy ?? 0}
                    onChange={(event) => updateFinanceRuleField("guaranteedMinimumJpy", toNumberInput(event.currentTarget.value))}
                  />
                </label>
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  NDP 平台费承担
                  <select
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    value={financeRuleForm.ndpFeeBearer}
                    onChange={(event) => updateFinanceRuleField("ndpFeeBearer", event.currentTarget.value as ShopFinanceNdpBearer)}
                  >
                    {Object.entries(ndpBearerLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-bold text-ink/55">
                  技师承担 NDP %
                  <input
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                    max={100}
                    min={0}
                    step={0.1}
                    type="number"
                    value={financeRuleForm.technicianNdpSharePercent ?? 0}
                    onChange={(event) => updateFinanceRuleField("technicianNdpSharePercent", toNumberInput(event.currentTarget.value))}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-line bg-paper p-3">
                  <p className="text-xs font-black text-ink/55">奖金规则</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    <label className="space-y-1 text-xs font-bold text-ink/55">
                      月单量阈值
                      <input
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink"
                        min={0}
                        type="number"
                        value={primaryBonusRule.threshold}
                        onChange={(event) => updatePrimaryBonusRule("threshold", toNumberInput(event.currentTarget.value))}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-ink/55">
                      奖金 JPY
                      <input
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink"
                        min={0}
                        type="number"
                        value={primaryBonusRule.amountJpy}
                        onChange={(event) => updatePrimaryBonusRule("amountJpy", toNumberInput(event.currentTarget.value))}
                      />
                    </label>
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-paper p-3">
                  <p className="text-xs font-black text-ink/55">订单预览输入</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {[
                      ["serviceAmountJpy", "服务金额 JPY"],
                      ["platformFeeNdp", "平台费 NDP"],
                      ["monthlyCompletedOrders", "本月完成单"]
                    ].map(([key, label]) => (
                      <label className="space-y-1 text-xs font-bold text-ink/55" key={key}>
                        {label}
                        <input
                          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink"
                          min={0}
                          type="number"
                          value={financePreviewInput[key as keyof ShopFinanceRulePreviewInput] ?? 0}
                          onChange={(event) =>
                            setFinancePreviewInput((current) => ({
                              ...current,
                              [key]: toNumberInput(event.currentTarget.value)
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {financePreview ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["技师毛收入", yen(financePreview.preview.technicianGrossIncomeJpy)],
                  ["技师净收入", yen(financePreview.preview.technicianNetIncomeJpy)],
                  ["店铺毛利", yen(financePreview.preview.shopGrossMarginJpy)],
                  ["NDP 分摊", `${financePreview.preview.shopNdpShareNdp} / ${financePreview.preview.technicianNdpShareNdp} NDP`]
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-paper p-3" key={label}>
                    <p className="text-xs font-bold text-ink/45">{label}</p>
                    <strong className="mt-1 block text-lg">{value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <TitleWithInfo
                  as="h2"
                  info="订单钱路把服务收入、平台费冻结/扣除、用户返点、技师收入预估放在同一条时间线里。"
                  label="订单钱路说明"
                  title="订单钱路 / 服务收入上报"
                  titleClassName="font-black"
                  variant="paper"
                />
                <p className="mt-1 text-xs font-bold text-ink/45">
                  {orderFinanceDetail ? `${orderFinanceDetail.orderNo} · ${orderFinanceDetail.technicianName ?? "未指派技师"}` : "等待订单钱路载入"}
                </p>
              </div>
              <button
                className="rounded-full bg-moss px-4 py-2 text-xs font-black text-white transition hover:bg-moss/90 disabled:opacity-50"
                disabled={isSavingIncomeReport || !currentSettlement}
                onClick={() => void saveServiceIncomeReport()}
                type="button"
              >
                {isSavingIncomeReport ? "上报中" : "上报收入"}
              </button>
            </div>

            {financeCenterError ? (
              <div className="mt-3">
                <Badge tone="red">{financeCenterError}</Badge>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr,1.1fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["服务 GMV", yen(orderFinanceDetail?.estimatedServiceGmvJpy ?? 0)],
                  ["订单类型", orderFinanceDetail?.orderType ?? "-"],
                  ["Request 费用", `${orderFinanceDetail?.requestFeeNdpRevenue ?? 0} NDP`],
                  ["Request 冻结/实扣", `${orderFinanceDetail?.cRequestFeeHoldNdp ?? 0} / ${orderFinanceDetail?.cRequestFeeActualNdp ?? 0} NDP`],
                  ["未上报金额", yen(orderFinanceDetail?.unknownOrUnreportedServiceAmountJpy ?? 0)],
                  ["服务收入状态", orderFinanceDetail?.serviceIncomeStatus ?? "-"],
                  ["钱路状态", orderFinanceDetail?.moneyTimelineStatus ?? "-"]
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-paper p-3" key={label}>
                    <p className="text-xs font-bold text-ink/45">{label}</p>
                    <strong className="mt-1 block text-base">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-ink/55">
                  服务金额 JPY
                  <input
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    min={0}
                    onChange={(event) => setServiceIncomeReport((current) => ({
                      ...current,
                      serviceAmountJpy: toNumberInput(event.target.value)
                    }))}
                    type="number"
                    value={serviceIncomeReport.serviceAmountJpy}
                  />
                </label>
                <label className="text-xs font-bold text-ink/55">
                  线下收款 JPY
                  <input
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    min={0}
                    onChange={(event) => setServiceIncomeReport((current) => ({
                      ...current,
                      offlineReportedServiceAmountJpy: toNumberInput(event.target.value)
                    }))}
                    type="number"
                    value={serviceIncomeReport.offlineReportedServiceAmountJpy ?? 0}
                  />
                </label>
                <label className="text-xs font-bold text-ink/55">
                  支付渠道
                  <select
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    onChange={(event) => setServiceIncomeReport((current) => ({
                      ...current,
                      paymentChannel: event.target.value as ServiceIncomeReportInput["paymentChannel"]
                    }))}
                    value={serviceIncomeReport.paymentChannel ?? "offline_cash"}
                  >
                    <option value="offline_cash">线下现金</option>
                    <option value="offline_card">线下刷卡</option>
                    <option value="platform_online">平台代收</option>
                    <option value="bank_transfer">银行转账</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-ink/55">
                  备注
                  <input
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    onChange={(event) => setServiceIncomeReport((current) => ({
                      ...current,
                      note: event.target.value
                    }))}
                    value={serviceIncomeReport.note ?? ""}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {(orderFinanceDetail?.moneyTimeline ?? []).slice(0, 6).map((event) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2" key={`${event.type}-${event.occurredAt}`}>
                  <div>
                    <p className="text-sm font-black">{event.label}</p>
                    <p className="text-xs text-ink/45">{event.type} · {event.status}</p>
                  </div>
                  <strong className="text-sm">
                    {event.amountJpy !== undefined ? yen(event.amountJpy) : event.amountNdp !== undefined ? `${event.amountNdp} NDP` : "-"}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <TitleWithInfo
                  as="h2"
                  info="没有技师单独配置时自动继承店铺财务规则；保存后会生成技师 override 版本。"
                  label="技师收入模式说明"
                  title="技师收入模式"
                  titleClassName="font-black"
                  variant="paper"
                />
                <p className="mt-1 text-xs font-bold text-ink/45">
                  {compensationProfile ? `${compensationProfile.sourceType} · v${compensationProfile.version}` : "等待技师收入配置载入"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink transition hover:bg-white"
                  onClick={() => void runCompensationPreview()}
                  type="button"
                >
                  预览技师收入
                </button>
                <button
                  className="rounded-full bg-moss px-4 py-2 text-xs font-black text-white transition hover:bg-moss/90 disabled:opacity-50"
                  disabled={isSavingCompensationProfile || !currentSettlement?.technicianProfileId}
                  onClick={() => void saveCompensationProfile()}
                  type="button"
                >
                  {isSavingCompensationProfile ? "保存中" : "保存技师模式"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-bold text-ink/55">
                收入模式
                <select
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                  onChange={(event) => updateCompensationProfileField("wageMode", event.target.value as ShopFinanceWageMode)}
                  value={compensationProfileForm.wageMode}
                >
                  {Object.entries(wageModeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-ink/55">
                单笔固定 JPY
                <input
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                  min={0}
                  onChange={(event) => updateCompensationProfileField("fixedOrderPayJpy", toNumberInput(event.target.value))}
                  type="number"
                  value={compensationProfileForm.fixedOrderPayJpy ?? 0}
                />
              </label>
              <label className="text-xs font-bold text-ink/55">
                分成比例 %
                <input
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                  max={100}
                  min={0}
                  onChange={(event) => updateCompensationProfileField("commissionRatePercent", toNumberInput(event.target.value))}
                  type="number"
                  value={compensationProfileForm.commissionRatePercent ?? 0}
                />
              </label>
              <label className="text-xs font-bold text-ink/55">
                NDP 承担
                <select
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                  onChange={(event) => updateCompensationProfileField("ndpFeeBearer", event.target.value as ShopFinanceNdpBearer)}
                  value={compensationProfileForm.ndpFeeBearer ?? "shop"}
                >
                  {Object.entries(ndpBearerLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            {compensationPreview ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["技师净收入", yen(compensationPreview.preview.technicianNetIncomeJpy)],
                  ["技师毛收入", yen(compensationPreview.preview.technicianGrossIncomeJpy)],
                  ["店铺预估毛利", yen(compensationPreview.preview.shopEstimatedGrossProfitJpy)],
                  ["NDP 分摊", `${compensationPreview.preview.shopNdpShareNdp} / ${compensationPreview.preview.technicianNdpShareNdp} NDP`]
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-paper p-3" key={label}>
                    <p className="text-xs font-bold text-ink/45">{label}</p>
                    <strong className="mt-1 block text-lg">{value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <TitleWithInfo
                  as="h2"
                  info="工资单草稿来自已完成且已上报/确认收入的 Booking 订单；发布后技师端可确认或申诉，支付记录只保存方式、凭证 URL 与备注。"
                  label="工资单闭环说明"
                  title="工资单闭环"
                  titleClassName="font-black"
                  variant="paper"
                />
                <p className="mt-1 text-xs font-bold text-ink/45">
                  {activePayRun ? `Pay Run #${activePayRun.id} · ${activePayRun.status}` : "等待工资周期载入"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink transition hover:bg-white disabled:opacity-50"
                  disabled={isPayrollBusy || !merchantShopId}
                  onClick={generatePayRun}
                  type="button"
                >
                  生成工资草稿
                </button>
                <button
                  className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink transition hover:bg-white disabled:opacity-50"
                  disabled={isPayrollBusy || !activePayRun}
                  onClick={() => activePayRun && void runPayrollAction(() => merchantPayrollCenterApi.recalculatePayRun(activePayRun.id))}
                  type="button"
                >
                  重算草稿
                </button>
                <button
                  className="rounded-full bg-moss px-4 py-2 text-xs font-black text-white transition hover:bg-moss/90 disabled:opacity-50"
                  disabled={isPayrollBusy || !activePayRun}
                  onClick={() => activePayRun && void runPayrollAction(() => merchantPayrollCenterApi.publishPayRun(activePayRun.id))}
                  type="button"
                >
                  发布工资单
                </button>
                <button
                  className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink transition hover:bg-white disabled:opacity-50"
                  disabled={isPayrollBusy}
                  onClick={() => void exportMerchantPayRuns()}
                  type="button"
                >
                  导出工资 CSV
                </button>
              </div>
            </div>

            {payrollError ? (
              <div className="mt-3">
                <Badge tone="red">{payrollError}</Badge>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["净应付", yen(activePayRun?.totalNetPayJpy ?? 0)],
                ["已支付", yen(activePayRun?.paidAmountJpy ?? 0)],
                ["未支付", yen(activePayRun?.unpaidAmountJpy ?? 0)],
                ["申诉状态", activePayslip?.disputeStatus ?? "-"],
                ["工资单数", `${activePayRun?.payslips.length ?? 0}`]
              ].map(([label, value]) => (
                <div className="rounded-lg bg-paper p-3" key={label}>
                  <p className="text-xs font-bold text-ink/45">{label}</p>
                  <strong className="mt-1 block text-base">{value}</strong>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-line bg-paper p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-ink/45">工资调整申请</p>
                  <h3 className="mt-1 font-black">
                    {activePayrollAdjustment ? `${activePayrollAdjustment.title} · ${activePayrollAdjustment.status}` : "暂无申请"}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-line bg-white px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy || !merchantShopId || !(activePayslip?.technicianProfileId ?? currentSettlement?.technicianProfileId)}
                    onClick={createPayrollAdjustment}
                    type="button"
                  >
                    申请奖金/扣款
                  </button>
                  <button
                    className="rounded-full border border-line bg-white px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy}
                    onClick={() => void refreshPayrollAdjustments()}
                    type="button"
                  >
                    刷新申请
                  </button>
                  <button
                    className="rounded-full border border-line bg-white px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy || activePayrollAdjustment?.status !== "draft"}
                    onClick={() => activePayrollAdjustment && void runPayrollAdjustmentAction(() => merchantPayrollCenterApi.submitPayrollAdjustment(activePayrollAdjustment.id))}
                    type="button"
                  >
                    提交申请
                  </button>
                  <button
                    className="rounded-full border border-line bg-white px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy || activePayrollAdjustment?.status !== "submitted"}
                    onClick={() => activePayrollAdjustment && void runPayrollAdjustmentAction(() => merchantPayrollCenterApi.approvePayrollAdjustment(activePayrollAdjustment.id))}
                    type="button"
                  >
                    审批调整
                  </button>
                  <button
                    className="rounded-full border border-line bg-white px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy || activePayrollAdjustment?.status !== "submitted"}
                    onClick={() => activePayrollAdjustment && void runPayrollAdjustmentAction(() => merchantPayrollCenterApi.rejectPayrollAdjustment(activePayrollAdjustment.id, "重复或资料不足，退回修改"))}
                    type="button"
                  >
                    驳回调整
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <DataTable<PayrollAdjustmentRequestPayload>
                  columns={[
                    { key: "title", title: "申请", render: (row) => `${row.title} · ${row.technicianName}` },
                    { key: "type", title: "类型", render: (row) => row.adjustmentType },
                    { key: "amount", title: "金额", render: (row) => yen(row.amountJpy) },
                    { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "approved" || row.status === "applied" ? "green" : row.status === "rejected" ? "red" : "yellow"}>{row.status}</Badge> }
                  ]}
                  onView={setActivePayrollAdjustment}
                  pageSize={4}
                  rows={payrollAdjustments}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr,1.1fr]">
              <div className="space-y-3">
                <DataTable<PayRunPayload>
                  columns={[
                    { key: "period", title: "周期", render: (row) => `${row.periodStart.slice(0, 10)} - ${row.periodEnd.slice(0, 10)}` },
                    { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "paid" || row.status === "locked" ? "green" : row.status === "disputed" ? "red" : "yellow"}>{row.status}</Badge> },
                    { key: "net", title: "净应付", render: (row) => yen(row.totalNetPayJpy) }
                  ]}
                  onView={(row) => {
                    setActivePayRun(row);
                    setActivePayslip(row.payslips[0] ?? null);
                  }}
                  pageSize={4}
                  rows={payRuns}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy || !activePayRun}
                    onClick={() => activePayRun && void runPayrollAction(() => merchantPayrollCenterApi.approvePayRun(activePayRun.id))}
                    type="button"
                  >
                    审批工资单
                  </button>
                  <button
                    className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy || !activePayslip || (activePayslip.status !== "approved" && activePayslip.status !== "scheduled")}
                    onClick={() => activePayslip && void runPayrollAction(() => merchantPayrollCenterApi.recordPayout(activePayslip.id, {
                      amountJpy: activePayslip.unpaidAmountJpy,
                      payoutMethod: "bank_transfer",
                      payoutDate: "2026-07-10T00:00:00.000Z",
                      referenceNo: "STATIC-PAYOUT-001",
                      note: "店铺工资支付记录"
                    }))}
                    type="button"
                  >
                    记录支付
                  </button>
                  <button
                    className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-black text-ink disabled:opacity-50"
                    disabled={isPayrollBusy || !activePayRun}
                    onClick={() => activePayRun && void runPayrollAction(() => merchantPayrollCenterApi.lockPayRun(activePayRun.id))}
                    type="button"
                  >
                    锁定归档
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-paper p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-ink/45">工资单详情</p>
                    <h3 className="mt-1 font-black">{activePayslip?.technicianName ?? "未选择技师"}</h3>
                  </div>
                  <Badge tone={activePayslip?.status === "paid" ? "green" : activePayslip?.status === "disputed" ? "red" : "yellow"}>
                    {activePayslip?.status ?? "-"}
                  </Badge>
                </div>
                <DetailGrid
                  items={[
                    { label: "基础工资", value: yen(activePayslip?.baseSalaryJpy ?? 0) },
                    { label: "分成", value: yen(activePayslip?.commissionJpy ?? 0) },
                    { label: "奖金", value: yen(activePayslip?.bonusJpy ?? 0) },
                    { label: "扣款/NDP 分摊", value: yen(activePayslip?.deductionJpy ?? 0) },
                    { label: "净收入", value: yen(activePayslip?.netPayJpy ?? 0) },
                    { label: "未支付", value: yen(activePayslip?.unpaidAmountJpy ?? 0) },
                    { label: "申诉处理", value: activePayslip?.disputeResolutionNote ?? activePayslip?.disputeReason ?? "-" }
                  ]}
                />
                <div className="mt-3 rounded-lg border border-line bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-ink/45">申诉处理</p>
                      <h4 className="mt-1 text-sm font-black">
                        {activePayslip?.disputeStatus === "disputed" ? "等待商户复核" : activePayslip?.disputeStatus ?? "-"}
                      </h4>
                    </div>
                    <Badge tone={activePayslip?.disputeStatus === "disputed" ? "red" : "green"}>
                      {activePayslip?.disputeStatus ?? "-"}
                    </Badge>
                  </div>
                  <textarea
                    className="mt-3 min-h-20 w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink outline-none"
                    onChange={(event) => setDisputeResolutionNote(event.target.value)}
                    value={disputeResolutionNote}
                  />
                  <button
                    className="mt-3 rounded-full bg-moss px-4 py-2 text-xs font-black text-white transition hover:bg-moss/90 disabled:opacity-50"
                    disabled={isPayrollBusy || activePayslip?.disputeStatus !== "disputed"}
                    onClick={resolveActivePayslipDispute}
                    type="button"
                  >
                    处理申诉
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {(activePayslip?.lines ?? []).slice(0, 5).map((line) => (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2" key={`${line.id}-${line.title}`}>
                      <div>
                        <p className="text-sm font-black">{line.title}</p>
                        <p className="text-xs text-ink/45">{line.sourceType} · {line.lineType}</p>
                      </div>
                      <strong className="text-sm">{yen(line.amountJpy)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-4">
            {[
               ["估算服务 GMV", yen(currentSettlement?.estimatedServiceGmvJpy ?? 0)],
               ["平台 NDP 收入", `${currentSettlement?.platformNdpRevenue ?? 0} NDP`],
               ["Request 费用", `${currentSettlement?.requestFeeNdpRevenue ?? 0} NDP`],
               ["技师收入预估", yen(currentSettlement?.technicianEstimatedIncomeJpy ?? 0)],
               ["未上报金额", yen(currentSettlement?.unknownOrUnreportedServiceAmountJpy ?? 0)]
            ].map(([label, value]) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
                <p className="text-xs font-bold text-ink/50">{label}</p>
                <strong className="mt-2 block text-xl">{value}</strong>
              </article>
            ))}
          </section>
          <DataTable<BackofficeFinanceSettlementPayload>
            columns={[
               { key: "orderNo", title: "订单/店铺", render: (row) => `${row.orderNo} · ${row.shopName}` },
               { key: "orderType", title: "类型", render: (row) => row.orderType },
               { key: "estimatedServiceGmvJpy", title: "估算服务 GMV", render: (row) => yen(row.estimatedServiceGmvJpy) },
               { key: "platformNdpRevenue", title: "平台 NDP 收入", render: (row) => `${row.platformNdpRevenue} NDP` },
               { key: "requestFeeNdpRevenue", title: "Request 费用", render: (row) => `${row.requestFeeNdpRevenue} NDP` },
               { key: "technicianEstimatedIncomeJpy", title: "技师收入", render: (row) => yen(row.technicianEstimatedIncomeJpy) },
              { key: "pendingHoldNdp", title: "冻结/释放", render: (row) => `${row.pendingHoldNdp} / ${row.releasedNdp} NDP` },
              { key: "serviceIncomeStatus", title: "收入状态", render: (row) => <Badge tone={row.serviceIncomeStatus === "confirmed" ? "green" : row.serviceIncomeStatus === "reported" ? "yellow" : "red"}>{row.serviceIncomeStatus}</Badge> }
            ]}
            pageSize={6}
            rows={financeRows}
          />
        </div>
      )
    }
  }[module];

  return (
    <>
      {config.content}

      <Drawer onClose={() => setSelectedInventory(null)} open={Boolean(selectedInventory)} title="库存详情">
        {selectedInventory ? (
          <div className="space-y-5">
            <img alt={selectedInventory.name} className="h-56 w-full rounded-lg object-cover" src={selectedInventory.image} />
            <DetailGrid
              items={[
                { label: "物品名称", value: selectedInventory.name },
                { label: "所属门店", value: selectedInventory.storeName },
                { label: "当前库存", value: `${selectedInventory.stock}${selectedInventory.unit}` },
                { label: "预警线", value: `${selectedInventory.warningLine}${selectedInventory.unit}` },
                { label: "分类", value: selectedInventory.category },
                { label: "最近变动", value: selectedInventory.lastChangedAt }
              ]}
            />
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
