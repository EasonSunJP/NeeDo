import { AutoSchedulingEngine, type AutoSchedulingEngineContext, type AutoSchedulingEngineResult } from "./autoSchedulingEngine";
import {
  addDays,
  addMinutes,
  dispatchReferenceNow,
  enumerateDateKeys,
  getWeekday,
  type DispatchCycle,
  type ScheduleDemandForecast,
  type ScheduleExceptionQueueItem,
  type ScheduleRecommendation,
  type SmartScheduleColdStartStatus,
  type SmartScheduleDataSource,
  type SmartScheduleDataSourceType,
  type SmartScheduleDecision,
  type SmartScheduleRuleExplanation,
  type SmartScheduleSignal
} from "../../features/dispatch-center/domain";

export type SmartSchedulePreviewSnapshot = {
  cycleId: string;
  views: Array<"month" | "week" | "day" | "technician" | "exception" | "capacity">;
  confirmedSlotSource: "confirmed_slots";
  statusLegend: string[];
  recommendationCount: number;
  exceptionCount: number;
};

const dataSourceProfiles: Array<{
  sourceType: SmartScheduleDataSourceType;
  confidenceScore: number;
  fallbackUsed: boolean;
  missingReason: string | null;
}> = [
  { sourceType: "merchant_history", confidenceScore: 0.86, fallbackUsed: false, missingReason: null },
  { sourceType: "technician_preferences", confidenceScore: 0.9, fallbackUsed: false, missingReason: null },
  { sourceType: "platform_flow", confidenceScore: 0.82, fallbackUsed: false, missingReason: null },
  { sourceType: "current_booking_trend", confidenceScore: 0.78, fallbackUsed: false, missingReason: null },
  { sourceType: "weather", confidenceScore: 0.74, fallbackUsed: false, missingReason: null },
  { sourceType: "traffic", confidenceScore: 0.52, fallbackUsed: true, missingReason: "第一版未接入真实路况 API，使用默认通勤缓冲。" },
  { sourceType: "holiday", confidenceScore: 0.92, fallbackUsed: false, missingReason: null },
  { sourceType: "special_date_rules", confidenceScore: 0.84, fallbackUsed: false, missingReason: null },
  { sourceType: "campaign", confidenceScore: 0.66, fallbackUsed: true, missingReason: "当前活动流量使用平台 mock 基准。" },
  { sourceType: "local_event", confidenceScore: 0.58, fallbackUsed: true, missingReason: "商圈大型活动暂未接入实时数据。" }
];

function stringifyReason(reasons: string[]) {
  return JSON.stringify({ reasons });
}

function getRecommendedActionCopy(exception: ScheduleExceptionQueueItem) {
  const actionMap: Record<ScheduleExceptionQueueItem["suggestedAction"], string> = {
    auto_fill: "通知候补技师补位，并按距离、技能和工时均衡排序。",
    auto_reduce: "将低匹配技师移入候补，保留高匹配技师。",
    manual_adjust: "进入本次人工处理，系统不自动迁移高风险班次。",
    ignore: "保留当前排班，仅记录风险提示。",
    recalculate: "重新计算预测、技师可用性和候补队列。"
  };

  return actionMap[exception.suggestedAction];
}

export class ExternalSignalAdapter {
  collect(cycle: DispatchCycle): SmartScheduleSignal[] {
    const firstWeek = enumerateDateKeys(cycle.periodStart, cycle.periodEnd).slice(0, 7);

    return firstWeek.flatMap((date, index) => {
      const weekday = getWeekday(date);
      const rainy = index === 2 || index === 5;
      const holidayDelta = cycle.ruleSet.holidayAdjustments[date] ?? 0;

      return [
        {
          id: `smart-signal-${cycle.id}-weather-${date}`,
          shopId: cycle.storeId,
          cycleId: cycle.id,
          signalType: "weather",
          signalDate: date,
          signalHour: null,
          valueJson: JSON.stringify({
            rainProbability: rainy ? 0.8 : 0.22,
            temperatureC: rainy ? 17 : 22,
            mobilityBufferMinutes: rainy ? 15 : 5
          }),
          confidenceScore: rainy ? 0.78 : 0.72,
          source: "ExternalSignalAdapter.mock.weather",
          createdAt: dispatchReferenceNow
        },
        {
          id: `smart-signal-${cycle.id}-traffic-${date}`,
          shopId: cycle.storeId,
          cycleId: cycle.id,
          signalType: "traffic",
          signalDate: date,
          signalHour: 18,
          valueJson: JSON.stringify({
            congestionLevel: weekday === 5 ? "high" : "normal",
            commuteBufferMinutes: weekday === 5 ? 20 : 10
          }),
          confidenceScore: weekday === 5 ? 0.62 : 0.56,
          source: "ExternalSignalAdapter.mock.traffic",
          createdAt: dispatchReferenceNow
        },
        {
          id: `smart-signal-${cycle.id}-holiday-${date}`,
          shopId: cycle.storeId,
          cycleId: cycle.id,
          signalType: "holiday",
          signalDate: date,
          signalHour: null,
          valueJson: JSON.stringify({
            deltaStaff: holidayDelta,
            baselineDemandLiftPercent: holidayDelta > 0 ? 38 : weekday === 0 || weekday === 6 ? 22 : 0
          }),
          confidenceScore: holidayDelta > 0 ? 0.9 : 0.72,
          source: "ExternalSignalAdapter.mock.holiday",
          createdAt: dispatchReferenceNow
        }
      ];
    });
  }
}

export class SmartScheduleEngine {
  private readonly externalSignalAdapter = new ExternalSignalAdapter();

  constructor(private readonly context: AutoSchedulingEngineContext) {}

  collectColdStartData(shopId: string): SmartScheduleDataSource[] {
    return dataSourceProfiles.map((profile) => ({
      id: `smart-source-${shopId}-${profile.sourceType}`,
      shopId,
      sourceType: profile.sourceType,
      enabled: true,
      status: profile.missingReason ? "fallback" : "ready",
      confidenceScore: profile.confidenceScore,
      lastCollectedAt: dispatchReferenceNow,
      missingReason: profile.missingReason,
      fallbackUsed: profile.fallbackUsed,
      createdAt: dispatchReferenceNow,
      updatedAt: dispatchReferenceNow
    }));
  }

  evaluateColdStartReadiness(shopId: string): SmartScheduleColdStartStatus {
    if (shopId !== this.context.cycle.storeId || !this.context.policy.enabled) {
      return "not_enabled";
    }

    const days = Math.max(0, Math.ceil((new Date(this.context.policy.coldStartEndsAt).getTime() - new Date(this.context.policy.coldStartStartedAt).getTime()) / (24 * 60 * 60 * 1000)));

    if (days > this.context.policy.coldStartRequiredDays) {
      return "cold_start_collecting";
    }

    return this.context.policy.mode === "smart_schedule" ? "smart_running" : "cold_start_ready";
  }

  collectExternalSignals(cycleId: string): SmartScheduleSignal[] {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    return this.externalSignalAdapter.collect(this.context.cycle);
  }

  buildDemandForecast(cycleId: string): ScheduleDemandForecast[] {
    const engine = new AutoSchedulingEngine(this.context);
    return engine.generateDemandForecast(cycleId);
  }

  buildTechnicianAvailability(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    return this.context.preferences.map((preference) => ({
      technicianId: preference.technicianId,
      weekday: preference.weekday,
      available: preference.available,
      timeRange: `${preference.startTime}-${preference.endTime}`,
      accepts: {
        overtime: preference.acceptOvertime,
        holiday: preference.acceptHoliday,
        tempShift: preference.acceptTempShift
      }
    }));
  }

  buildRuleSummary(cycleId: string): SmartScheduleRuleExplanation[] {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    const cycle = this.context.cycle;
    const explanations: SmartScheduleRuleExplanation[] = [
      {
        id: `smart-rule-${cycleId}-automation`,
        cycleId,
        ruleType: "automation_level",
        targetId: this.context.policy.id,
        title: "当前自动化等级",
        reasonJson: stringifyReason([
          this.context.policy.automationLevel === "full_auto" ? "排班质量达标时可自动确认。" : "异常仍会进入人工可见队列。",
          `异常自动处理默认 ${this.context.policy.autoExceptionActionDelayMinutes} 分钟后执行。`
        ]),
        confidenceScore: 0.92,
        createdAt: dispatchReferenceNow
      },
      {
        id: `smart-rule-${cycleId}-base`,
        cycleId,
        ruleType: "base_rule",
        targetId: cycle.id,
        title: "基础营业与工时规则",
        reasonJson: stringifyReason([
          `服务前缓冲 ${cycle.ruleSet.preBufferMinutes} 分钟，服务后缓冲 ${cycle.ruleSet.postBufferMinutes} 分钟。`,
          `最大日工时 ${cycle.ruleSet.maxDailyHours} 小时，最大周工时 ${cycle.ruleSet.maxWeeklyHours} 小时。`
        ]),
        confidenceScore: 0.88,
        createdAt: dispatchReferenceNow
      },
      {
        id: `smart-rule-${cycleId}-staffing`,
        cycleId,
        ruleType: "staffing_rule",
        targetId: cycle.id,
        title: "人数规则",
        reasonJson: stringifyReason([
          `最低 ${cycle.ruleSet.minStaff} 人，目标 ${cycle.ruleSet.targetStaff} 人，最大 ${cycle.ruleSet.maxStaff} 人。`,
          "预测、异常队列和质量评分都基于至少 1 个月周期。"
        ]),
        confidenceScore: 0.9,
        createdAt: dispatchReferenceNow
      },
      ...cycle.ruleSet.priorityRules.selectedTechnicianIds.map((technicianId, index) => ({
        id: `smart-rule-${cycleId}-priority-${technicianId}`,
        cycleId,
        ruleType: "priority_technician" as const,
        targetId: technicianId,
        title: "优先技师",
        reasonJson: stringifyReason([
          "评分高或历史接单稳定。",
          "本周期工时较少时优先补齐。",
          `语言匹配：${cycle.ruleSet.priorityRules.selectedLanguages.join("、") || "按服务默认语言"}。`
        ]),
        confidenceScore: Math.max(0.72, 0.9 - index * 0.04),
        createdAt: dispatchReferenceNow
      })),
      ...Object.entries(cycle.ruleSet.holidayAdjustments).slice(0, 6).map(([date, delta]) => ({
        id: `smart-rule-${cycleId}-special-${date}`,
        cycleId,
        ruleType: "special_date_adjustment" as const,
        targetId: date,
        title: `${date} 特别日期 ${delta >= 0 ? "+" : ""}${delta} 人`,
        reasonJson: stringifyReason([
          "历史节假日预约量高于平日。",
          "平台同类商户高峰覆盖率上升。",
          "用于提前增加候补或降低缺人风险。"
        ]),
        confidenceScore: 0.84,
        createdAt: dispatchReferenceNow
      }))
    ];

    return explanations;
  }

  explainRules(cycleId: string): SmartScheduleRuleExplanation[] {
    return this.buildRuleSummary(cycleId);
  }

  generateSmartSchedule(cycleId: string): AutoSchedulingEngineResult {
    const engine = new AutoSchedulingEngine(this.context);
    return engine.run(cycleId);
  }

  calculateQualityScore(cycleId: string) {
    return this.generateSmartSchedule(cycleId).score;
  }

  detectSmartExceptions(cycleId: string) {
    return this.generateSmartSchedule(cycleId).exceptions;
  }

  recommendEmergencyAction(exception: ScheduleExceptionQueueItem) {
    return {
      action: getRecommendedActionCopy(exception),
      reasonJson: stringifyReason([
        exception.exceptionType === "shortage" ? "优先通知当前无冲突且接受临时补位的技师。" : "系统会优先保护已确认订单和用户端稳定容量。",
        exception.exceptionType === "weather_risk" || exception.exceptionType === "traffic_delay" ? "外部信号提示移动时间需要增加缓冲。" : "处理前会保留商户取消本次自动处理的入口。",
        "处理结果会写入智能决策日志。"
      ])
    };
  }

  startAutoActionCountdown(exception: ScheduleExceptionQueueItem): ScheduleExceptionQueueItem {
    const countdownSeconds = this.context.policy.autoExceptionActionDelayMinutes * 60;

    return {
      ...exception,
      status: "auto_handling_countdown",
      countdownSeconds,
      autoExecuteAt: `${addDays(dispatchReferenceNow.slice(0, 10), 0)}T${addMinutes(dispatchReferenceNow.slice(11, 16), this.context.policy.autoExceptionActionDelayMinutes)}:00+09:00`,
      updatedAt: dispatchReferenceNow
    };
  }

  executeAutoAction(exception: ScheduleExceptionQueueItem): ScheduleExceptionQueueItem {
    return {
      ...exception,
      status: "executed",
      resolvedBy: "smart-system",
      resolvedAt: dispatchReferenceNow,
      updatedAt: dispatchReferenceNow
    };
  }

  cancelAutoAction(exception: ScheduleExceptionQueueItem): ScheduleExceptionQueueItem {
    return {
      ...exception,
      status: "cancelled_auto_action",
      countdownSeconds: 0,
      autoExecuteAt: null,
      updatedAt: dispatchReferenceNow
    };
  }

  markHumanOverride(exception: ScheduleExceptionQueueItem): ScheduleExceptionQueueItem {
    return {
      ...exception,
      status: "human_override_pending",
      humanOverride: true,
      countdownSeconds: 0,
      autoExecuteAt: null,
      updatedAt: dispatchReferenceNow
    };
  }

  previewSchedule(cycleId: string, recommendations: ScheduleRecommendation[] = [], exceptions: ScheduleExceptionQueueItem[] = []): SmartSchedulePreviewSnapshot {
    return {
      cycleId,
      views: ["month", "week", "day", "technician", "exception", "capacity"],
      confirmedSlotSource: "confirmed_slots",
      statusLegend: ["确认上班", "已预约", "空闲", "待定", "缺人", "超员", "撞车", "候补", "自动补人中", "自动处理倒计时"],
      recommendationCount: recommendations.length,
      exceptionCount: exceptions.filter((exception) => exception.status !== "resolved" && exception.status !== "ignored").length
    };
  }

  buildDecisionLog(cycleId: string, recommendations: ScheduleRecommendation[], exceptions: ScheduleExceptionQueueItem[]): SmartScheduleDecision[] {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    const recommendationDecisions = recommendations
      .filter((recommendation) => recommendation.recommendationType === "confirm")
      .slice(0, 24)
      .map((recommendation): SmartScheduleDecision => ({
        id: `smart-decision-${cycleId}-${recommendation.technicianId}-${recommendation.date}-${recommendation.startTime}`,
        cycleId,
        decisionType: "generate_shift",
        targetDate: recommendation.date,
        targetTime: recommendation.startTime,
        technicianId: recommendation.technicianId,
        action: "生成推荐确认班次",
        reasonJson: recommendation.reasonJson,
        confidenceScore: recommendation.score / 100,
        status: recommendation.status === "auto_confirmed" || recommendation.status === "manual_confirmed" ? "executed" : "recommended",
        createdAt: dispatchReferenceNow
      }));
    const exceptionDecisions = exceptions.slice(0, 12).map((exception): SmartScheduleDecision => ({
      id: `smart-decision-${exception.id}`,
      cycleId,
      decisionType: exception.suggestedAction === "auto_fill" ? "add_staff" : exception.suggestedAction === "auto_reduce" ? "waitlist_staff" : "manual_review",
      targetDate: exception.targetDate,
      targetTime: `${String(exception.targetHour).padStart(2, "0")}:00`,
      technicianId: exception.technicianId,
      action: getRecommendedActionCopy(exception),
      reasonJson: exception.reasonJson ?? stringifyReason([exception.description]),
      confidenceScore: exception.severity === "high" ? 0.72 : exception.severity === "medium" ? 0.8 : 0.86,
      status: exception.status === "executed" ? "executed" : exception.status === "human_override_pending" ? "human_override" : "scheduled",
      createdAt: dispatchReferenceNow
    }));

    return [...exceptionDecisions, ...recommendationDecisions];
  }
}
