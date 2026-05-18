import type { Technician } from "../../types/domain";
import { buildCapacityForSlot } from "./capacityEngine";
import {
  dispatchReferenceNow,
  enumerateDateKeys,
  getWeekday,
  timeToMinutes,
  type DispatchArrangement,
  type DispatchCandidate,
  type DispatchCycle,
  type DispatchFinalShift,
  type ScheduleAutomationPolicy,
  type ScheduleDemandForecast,
  type ScheduleExceptionQueueItem,
  type ScheduleOptimizationRun,
  type ScheduleRecommendation,
  type SmartScheduleExceptionType,
  type SmartScheduleRunType,
  type TechnicianSchedulePreference
} from "../../features/dispatch-center/domain";

type SmartSlot = {
  date: string;
  hour: number;
  predictedOrders: number;
  requiredStaffCount: number;
  maxStaffCount: number;
  confidenceScore: number;
  isPeak: boolean;
};

type SmartCandidateScore = {
  technician: Technician;
  score: number;
  reasons: string[];
  excluded: boolean;
};

type SmartCandidatePool = SmartSlot & {
  candidates: SmartCandidateScore[];
};

export type AutoSchedulingEngineContext = {
  cycle: DispatchCycle;
  policy: ScheduleAutomationPolicy;
  technicians: Technician[];
  preferences: TechnicianSchedulePreference[];
  arrangements: DispatchArrangement[];
  finalShifts: DispatchFinalShift[];
  runType: SmartScheduleRunType;
  operatorId: string;
  now?: string;
};

export type AutoSchedulingEngineResult = {
  run: ScheduleOptimizationRun;
  forecasts: ScheduleDemandForecast[];
  recommendations: ScheduleRecommendation[];
  exceptions: ScheduleExceptionQueueItem[];
  finalShifts: DispatchFinalShift[];
  score: number;
  autoConfirmed: boolean;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseHour(time: string) {
  const [hour = "0"] = time.split(":");
  return Number(hour);
}

function isHourInsidePreference(preference: TechnicianSchedulePreference, hour: number) {
  const startHour = parseHour(preference.startTime);
  const endHour = parseHour(preference.endTime);
  return hour >= startHour && hour < endHour;
}

function overlapsHour(startTime: string, endTime: string, hour: number) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;

  return Math.max(start, slotStart) < Math.min(end, slotEnd);
}

function getRecommendationEndTime(hour: number) {
  return `${String(Math.min(24, hour + 1)).padStart(2, "0")}:00`;
}

function stringifyReasons(score: number, reasons: string[]) {
  return JSON.stringify({ score, reasons });
}

export class AutoSchedulingEngine {
  private forecasts: ScheduleDemandForecast[] = [];
  private candidatePools: SmartCandidatePool[] = [];
  private recommendations: ScheduleRecommendation[] = [];
  private exceptions: ScheduleExceptionQueueItem[] = [];
  private score = 0;
  private finalShifts: DispatchFinalShift[] = [];
  private autoConfirmed = false;
  private readonly now: string;

  constructor(private readonly context: AutoSchedulingEngineContext) {
    this.now = context.now ?? dispatchReferenceNow;
  }

  generateDemandForecast(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    const slots = this.getOpenSlots();
    this.forecasts = slots.map((slot) => ({
      id: `forecast-${cycleId}-${slot.date}-${slot.hour}`,
      shopId: this.context.cycle.storeId,
      cycleId,
      date: slot.date,
      hour: slot.hour,
      serviceCategoryId: "all",
      predictedOrders: slot.predictedOrders,
      requiredStaffCount: slot.requiredStaffCount,
      confidenceScore: slot.confidenceScore,
      source: slot.predictedOrders > 0 ? "rule_v1" : "existing_booking",
      createdAt: this.now
    }));

    return this.forecasts;
  }

  buildCandidatePool(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    const forecastMap = new Map(this.forecasts.map((forecast) => [`${forecast.date}:${forecast.hour}`, forecast]));
    this.candidatePools = this.getOpenSlots().map((slot) => {
      const forecast = forecastMap.get(`${slot.date}:${slot.hour}`);
      const nextSlot = forecast
        ? {
            ...slot,
            predictedOrders: forecast.predictedOrders,
            requiredStaffCount: forecast.requiredStaffCount,
            confidenceScore: forecast.confidenceScore
          }
        : slot;

      return {
        ...nextSlot,
        candidates: this.context.technicians
          .filter((technician) => this.context.cycle.targetTechnicianIds.includes(technician.id))
          .map((technician) => this.scoreTechnicianForSlot(technician.id, nextSlot))
          .filter((candidate): candidate is SmartCandidateScore => Boolean(candidate))
          .sort((left, right) => right.score - left.score || left.technician.id.localeCompare(right.technician.id, "ja"))
      };
    });

    return this.candidatePools;
  }

  scoreTechnicianForSlot(technicianId: string, slot: SmartSlot) {
    const technician = this.context.technicians.find((item) => item.id === technicianId);

    if (!technician) {
      return null;
    }

    const weekday = getWeekday(slot.date);
    const preference = this.context.preferences.find((item) => item.technicianId === technicianId && item.weekday === weekday);
    const confirmedHours = this.context.finalShifts.filter(
      (shift) => shift.cycleId === this.context.cycle.id && shift.technicianId === technicianId && shift.status === "confirmed"
    ).length;
    const dayHours = this.context.finalShifts.filter(
      (shift) => shift.cycleId === this.context.cycle.id && shift.technicianId === technicianId && shift.date === slot.date && shift.status === "confirmed"
    ).length;
    const hasOrderConflict = this.context.arrangements.some(
      (arrangement) =>
        arrangement.technicianId === technicianId &&
        arrangement.date === slot.date &&
        arrangement.status !== "cancelled" &&
        overlapsHour(arrangement.startTime, arrangement.endTime, slot.hour)
    );
    const hasShiftConflict = this.context.finalShifts.some(
      (shift) =>
        shift.cycleId === this.context.cycle.id &&
        shift.technicianId === technicianId &&
        shift.date === slot.date &&
        shift.hour === slot.hour &&
        shift.status === "confirmed"
    );
    const supportsLanguage = this.context.cycle.ruleSet.priorityRules.selectedLanguages.length === 0
      ? true
      : technician.languages.some((language) => this.context.cycle.ruleSet.priorityRules.selectedLanguages.includes(language));
    const isPreferred = this.context.cycle.ruleSet.priorityRules.selectedTechnicianIds.includes(technicianId);
    let score = 54;
    const reasons: string[] = [];

    if (preference?.available === false) {
      score -= 55;
      reasons.push("个人偏好标记为不可上班");
    } else if (preference && isHourInsidePreference(preference, slot.hour)) {
      score += 14 + preference.priority;
      reasons.push("符合个人常规可上班时间");
    } else if (preference) {
      score -= 10;
      reasons.push("不在常规偏好时段内");
    } else {
      score += 4;
      reasons.push("缺少偏好时使用历史反馈兜底");
    }

    if (hasOrderConflict || hasShiftConflict) {
      score -= 65;
      reasons.push("与预约或已确认班次冲突");
    } else {
      score += 10;
      reasons.push("无时间冲突");
    }

    if (isPreferred) {
      score += 8;
      reasons.push("商户优先技师");
    }

    if (supportsLanguage) {
      score += 7;
      reasons.push("语言匹配");
    }

    if (technician.canServeForeigners) {
      score += 4;
      reasons.push("可服务外国用户");
    }

    if ((technician.skills?.length ?? 0) > 0) {
      score += 4;
      reasons.push("技能标签完整");
    }

    if (technician.rating >= 4.8) {
      score += 6;
      reasons.push("评分较高");
    }

    if (preference?.acceptTempShift) {
      score += slot.isPeak ? 5 : 2;
      reasons.push("接受临时补位");
    }

    if (preference?.acceptOvertime && slot.isPeak) {
      score += 3;
      reasons.push("高峰可接受加班");
    }

    if (preference && dayHours >= preference.maxHoursDay) {
      score -= 22;
      reasons.push("接近日工时上限");
    }

    if (confirmedHours <= 2) {
      score += 7;
      reasons.push("当前周期工时较低");
    } else if (confirmedHours > this.context.cycle.ruleSet.maxWeeklyHours) {
      score -= 18;
      reasons.push("接近周工时上限");
    }

    const nextScore = clampScore(score);
    return {
      technician,
      score: nextScore,
      reasons,
      excluded: nextScore < 45 || hasOrderConflict || preference?.available === false
    };
  }

  generateRecommendations(cycleId: string) {
    const runId = this.createRunId();

    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    this.recommendations = this.candidatePools.flatMap((slot) => {
      const accepted = slot.candidates.filter((candidate) => !candidate.excluded);
      const excluded = slot.candidates.filter((candidate) => candidate.excluded).slice(0, 2);
      const confirmCount = Math.min(slot.maxStaffCount, slot.requiredStaffCount, accepted.length);
      const selected = accepted.slice(0, confirmCount);
      const waitlist = accepted.slice(confirmCount, confirmCount + Math.max(1, slot.maxStaffCount - confirmCount + 1));
      const makeRecommendation = (
        candidate: SmartCandidateScore,
        type: "confirm" | "waitlist" | "exclude",
        index: number
      ): ScheduleRecommendation => ({
        id: `smart-rec-${cycleId}-${slot.date}-${slot.hour}-${candidate.technician.id}-${type}-${index}`,
        runId,
        cycleId,
        technicianId: candidate.technician.id,
        date: slot.date,
        startTime: `${String(slot.hour).padStart(2, "0")}:00`,
        endTime: getRecommendationEndTime(slot.hour),
        recommendationType: type,
        score: candidate.score,
        reasonJson: stringifyReasons(candidate.score, candidate.reasons),
        status: type === "waitlist" ? "waitlisted" : type === "exclude" ? "rejected" : "recommended"
      });

      return [
        ...selected.map((candidate, index) => makeRecommendation(candidate, "confirm", index)),
        ...waitlist.map((candidate, index) => makeRecommendation(candidate, "waitlist", index)),
        ...excluded.map((candidate, index) => makeRecommendation(candidate, "exclude", index))
      ];
    });

    return this.recommendations;
  }

  detectSmartConflicts(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    const conflicts: ScheduleExceptionQueueItem[] = [];

    this.candidatePools.forEach((slot) => {
      const confirmedRecommendations = this.recommendations.filter(
        (recommendation) => recommendation.date === slot.date && Number(recommendation.startTime.slice(0, 2)) === slot.hour && recommendation.recommendationType === "confirm"
      );

      if (confirmedRecommendations.length < slot.requiredStaffCount) {
        conflicts.push(this.createException("shortage", "high", slot, null, `需要 ${slot.requiredStaffCount} 人，当前仅推荐 ${confirmedRecommendations.length} 人。`, "auto_fill"));
      }

      if (confirmedRecommendations.length > slot.maxStaffCount) {
        conflicts.push(this.createException("overflow", "medium", slot, null, `最大 ${slot.maxStaffCount} 人，当前推荐 ${confirmedRecommendations.length} 人。`, "auto_reduce"));
      }

      confirmedRecommendations.forEach((recommendation) => {
        const scorePayload = JSON.parse(recommendation.reasonJson) as { reasons?: string[] };
        const reasons = scorePayload.reasons ?? [];

        if (reasons.some((reason) => reason.includes("与预约") || reason.includes("已确认班次冲突"))) {
          conflicts.push(this.createException("order_conflict", "high", slot, recommendation.technicianId, "推荐技师与预约或已确认班次存在时间冲突。", "manual_adjust"));
        }
      });
    });

    const unsubmittedPreferences = this.context.preferences.filter((preference) => !preference.autoSubmitEnabled);
    unsubmittedPreferences.slice(0, 3).forEach((preference) => {
      const slot = this.candidatePools.find((item) => getWeekday(item.date) === preference.weekday);

      if (slot) {
        conflicts.push(this.createException("unsubmitted", "low", slot, preference.technicianId, "技师未开启自动提交反馈，智能排班使用历史偏好兜底。", "recalculate"));
      }
    });

    return conflicts;
  }

  calculateScheduleQuality(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return 0;
    }

    const shortageCount = this.exceptions.filter((exception) => exception.exceptionType === "shortage").length;
    const overflowCount = this.exceptions.filter((exception) => exception.exceptionType === "overflow").length;
    const conflictCount = this.exceptions.filter((exception) => exception.exceptionType === "order_conflict" || exception.exceptionType === "conflict").length;
    const lowScoreCount = this.recommendations.filter((recommendation) => recommendation.recommendationType === "confirm" && recommendation.score < 70).length;
    const averageScore =
      this.recommendations.filter((recommendation) => recommendation.recommendationType === "confirm").reduce((sum, recommendation) => sum + recommendation.score, 0) /
      Math.max(1, this.recommendations.filter((recommendation) => recommendation.recommendationType === "confirm").length);
    const baseScore = 62 + averageScore * 0.38;

    this.score = clampScore(baseScore - shortageCount * 4 - overflowCount * 2 - conflictCount * 8 - lowScoreCount * 1.5);
    return this.score;
  }

  autoFillShortage(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    return this.exceptions.filter((exception) => exception.exceptionType === "shortage");
  }

  autoReduceOverflow(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    return this.exceptions.filter((exception) => exception.exceptionType === "overflow");
  }

  createExceptionQueue(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    const detected = this.detectSmartConflicts(cycleId);
    const scoreSlot = this.candidatePools[0] ?? this.getOpenSlots()[0] ?? null;
    const lowScore =
      this.score > 0 && this.score < 70 && scoreSlot
        ? [this.createException("low_score", "high", scoreSlot, null, `本次排班质量 ${this.score} 分，低于人工审核建议线。`, "manual_adjust")]
        : [];

    this.exceptions = [...detected, ...lowScore];
    return this.exceptions;
  }

  smartConfirm(cycleId: string) {
    if (cycleId !== this.context.cycle.id) {
      return [];
    }

    const highExceptionCount = this.exceptions.filter((exception) => exception.severity === "high").length;
    const canFullAutoConfirm =
      this.context.policy.automationLevel === "full_auto" &&
      this.context.policy.autoConfirmEnabled &&
      this.score >= this.context.policy.autoConfirmScoreThreshold &&
      highExceptionCount === 0;
    const canSemiAutoConfirm =
      this.context.policy.automationLevel === "semi_auto" &&
      this.score >= 70;

    this.autoConfirmed = canFullAutoConfirm || canSemiAutoConfirm;

    if (this.context.policy.automationLevel === "recommend_only" || !this.autoConfirmed) {
      this.finalShifts = [];
      return this.finalShifts;
    }

    const blockedSlots = new Set(
      this.exceptions
        .filter((exception) => exception.severity === "high")
        .map((exception) => `${exception.targetDate}:${exception.targetHour}`)
    );

    this.recommendations = this.recommendations.map((recommendation) => {
      if (recommendation.recommendationType !== "confirm") {
        return recommendation;
      }

      const hour = Number(recommendation.startTime.slice(0, 2));
      const blocked = canSemiAutoConfirm && blockedSlots.has(`${recommendation.date}:${hour}`);

      return {
        ...recommendation,
        status: blocked ? "recommended" : "auto_confirmed"
      };
    });

    this.finalShifts = this.recommendations
      .filter((recommendation) => recommendation.status === "auto_confirmed" || recommendation.recommendationType === "waitlist")
      .map((recommendation) => ({
        id: `smart-shift-${cycleId}-${recommendation.technicianId}-${recommendation.date}-${recommendation.startTime.replace(":", "")}`,
        cycleId,
        storeId: this.context.cycle.storeId,
        technicianId: recommendation.technicianId,
        date: recommendation.date,
        hour: Number(recommendation.startTime.slice(0, 2)),
        status: recommendation.status === "auto_confirmed" ? "confirmed" : "waitlisted",
        source: "auto",
        ruleSnapshot: recommendation.reasonJson,
        confirmedAt: this.now,
        confirmedBy: this.context.operatorId
      }));

    return this.finalShifts;
  }

  writeOptimizationRun(cycleId: string) {
    const run: ScheduleOptimizationRun = {
      id: this.createRunId(),
      cycleId,
      shopId: this.context.cycle.storeId,
      runType: this.context.runType,
      status: this.exceptions.some((exception) => exception.status === "open") ? "exception_pending" : "completed",
      score: this.score,
      shortageCount: this.exceptions.filter((exception) => exception.exceptionType === "shortage").length,
      overflowCount: this.exceptions.filter((exception) => exception.exceptionType === "overflow").length,
      conflictCount: this.exceptions.filter((exception) => exception.exceptionType === "conflict" || exception.exceptionType === "order_conflict").length,
      autoConfirmed: this.autoConfirmed,
      inputSnapshotJson: JSON.stringify({
        automationLevel: this.context.policy.automationLevel,
        targetTechnicianCount: this.context.cycle.targetTechnicianIds.length,
        forecastCount: this.forecasts.length
      }),
      outputSnapshotJson: JSON.stringify({
        recommendationCount: this.recommendations.length,
        exceptionCount: this.exceptions.length,
        finalShiftCount: this.finalShifts.length
      }),
      createdAt: this.now
    };

    return run;
  }

  run(cycleId: string): AutoSchedulingEngineResult {
    this.generateDemandForecast(cycleId);
    this.buildCandidatePool(cycleId);
    this.generateRecommendations(cycleId);
    this.exceptions = this.detectSmartConflicts(cycleId);
    this.calculateScheduleQuality(cycleId);
    this.createExceptionQueue(cycleId);
    this.autoFillShortage(cycleId);
    this.autoReduceOverflow(cycleId);
    this.smartConfirm(cycleId);
    const run = this.writeOptimizationRun(cycleId);

    this.recommendations = this.recommendations.map((recommendation) => ({ ...recommendation, runId: run.id }));

    return {
      run,
      forecasts: this.forecasts,
      recommendations: this.recommendations,
      exceptions: this.exceptions,
      finalShifts: this.finalShifts,
      score: this.score,
      autoConfirmed: this.autoConfirmed
    };
  }

  private createRunId() {
    return `smart-run-${this.context.cycle.id}-${this.context.runType}-${this.now.replace(/[^0-9]/g, "").slice(0, 12)}`;
  }

  private getOpenSlots(): SmartSlot[] {
    const cycle = this.context.cycle;
    const dates = enumerateDateKeys(cycle.periodStart, cycle.periodEnd).slice(0, cycle.templateType === "day" ? 1 : cycle.templateType === "week" ? 7 : 28);

    return dates.flatMap((dateKey, dateIndex) => {
      const weekday = getWeekday(dateKey);
      const dayIndex = cycle.templateType === "day" ? 0 : cycle.templateType === "week" ? weekday : dateIndex;

      return Array.from({ length: 24 }, (_, hour) => {
        if (!cycle.templateMatrix[dayIndex]?.[hour] || cycle.regularHolidayWeekdays.includes(weekday)) {
          return null;
        }

        const capacity = buildCapacityForSlot(cycle, dateKey);

        if (capacity.maxCount <= 0) {
          return null;
        }

        const existingOrders = this.context.arrangements.filter(
          (arrangement) => arrangement.date === dateKey && arrangement.status !== "cancelled" && overlapsHour(arrangement.startTime, arrangement.endTime, hour)
        ).length;
        const isWeekend = weekday === 0 || weekday === 5 || weekday === 6;
        const isPeak = isWeekend || hour >= 18 || hour <= 11;
        const baseDemand = (isWeekend ? 1.8 : 1.1) + (hour >= 18 && hour <= 21 ? 1.1 : 0) + (hour >= 11 && hour <= 14 ? 0.7 : 0);
        const predictedOrders = Math.round((baseDemand + existingOrders * 0.9 + (capacity.isHoliday ? 0.8 : 0)) * 10) / 10;
        const requiredStaffCount = Math.min(capacity.maxCount, Math.max(capacity.minCount, capacity.targetCount, Math.ceil(predictedOrders / 1.8)));

        return {
          date: dateKey,
          hour,
          predictedOrders,
          requiredStaffCount,
          maxStaffCount: capacity.maxCount,
          confidenceScore: Math.min(0.94, Math.round((0.66 + Math.min(0.2, existingOrders * 0.04) + (isPeak ? 0.08 : 0.04)) * 100) / 100),
          isPeak
        };
      }).filter((slot): slot is SmartSlot => Boolean(slot));
    });
  }

  private createException(
    exceptionType: SmartScheduleExceptionType,
    severity: "high" | "medium" | "low",
    slot: SmartSlot,
    technicianId: string | null,
    description: string,
    suggestedAction: ScheduleExceptionQueueItem["suggestedAction"]
  ): ScheduleExceptionQueueItem {
    return {
      id: `smart-ex-${this.context.cycle.id}-${exceptionType}-${slot.date}-${slot.hour}-${technicianId ?? "slot"}`,
      cycleId: this.context.cycle.id,
      shopId: this.context.cycle.storeId,
      exceptionType,
      severity,
      targetDate: slot.date,
      targetHour: slot.hour,
      technicianId,
      description,
      suggestedAction,
      status: "open",
      resolvedBy: null,
      resolvedAt: null,
      createdAt: this.now,
      updatedAt: this.now
    };
  }
}

export function buildSmartScheduleCandidateAdapter(candidate: SmartCandidateScore): DispatchCandidate {
  return {
    technician: candidate.technician,
    confirmedHours: 0,
    responseTimestamp: Number.POSITIVE_INFINITY,
    supportsSelectedLanguage: candidate.reasons.includes("语言匹配"),
    supportsForeigners: candidate.reasons.includes("可服务外国用户"),
    isPreferredTechnician: candidate.reasons.includes("商户优先技师")
  };
}
