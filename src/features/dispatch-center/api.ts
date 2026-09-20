import type { DispatchCycle, DispatchServiceMode, DispatchSpecialTask } from "./domain";
import { httpClient } from "../../api/httpClient";
import {
  adjustDispatchFinalShift,
  annotateArrangement,
  assignArrangementTechnician,
  cancelArrangement,
  createSpecialTask,
  getDispatchOverviewSummary,
  getDispatchScheduleGrid,
  getFloatingTasks,
  getSpecialTasks,
  getTodayArrangements,
  minimizeFloatingTask,
  previewDispatchNotificationTemplate,
  rescheduleArrangement,
  updateSpecialTask
} from "./store";

type DispatchCyclePage = { list: DispatchCycle[]; total: number; page: number; page_size: number };
type DispatchAutoConfirmResult = {
  cycle: DispatchCycle;
  summary: { confirmedCount: number; waitlistedCount: number; shortageCount: number; overflowCount: number };
};

type ServerDispatchCycle = Omit<DispatchCycle, "storeId" | "status" | "templateType" | "targetTechnicianIds" | "feedbackRows" | "finalShifts"> & {
  shopId: number;
  status: Uppercase<DispatchCycle["status"]>;
  templateType: Uppercase<DispatchCycle["templateType"]>;
  targetTechnicianIds: number[];
  feedbackRows: Array<{
    technicianProfileId: number;
    date: string;
    hour: number;
    status: "AVAILABLE" | "UNAVAILABLE" | "UPDATED";
    note: string;
    submittedAt: string;
    updatedAt: string;
  }>;
  finalShifts: Array<{
    id: number;
    technicianProfileId: number;
    date: string;
    hour: number;
    status: "CONFIRMED" | "WAITLISTED" | "CANCELLED";
    source: "AUTO" | "MANUAL";
    confirmedAt: string;
  }>;
  version: number;
};

type ServerDispatchCyclePage = Omit<DispatchCyclePage, "list"> & { list: ServerDispatchCycle[] };
type ServerDispatchAutoConfirmResult = Omit<DispatchAutoConfirmResult, "cycle"> & { cycle: ServerDispatchCycle };

function fromServerCycle(cycle: ServerDispatchCycle): DispatchCycle {
  return {
    ...cycle,
    storeId: String(cycle.shopId),
    status: cycle.status.toLowerCase() as DispatchCycle["status"],
    templateType: cycle.templateType.toLowerCase() as DispatchCycle["templateType"],
    targetTechnicianIds: cycle.targetTechnicianIds.map(String),
    feedbackRows: cycle.feedbackRows.map((entry, index) => ({
      id: `${cycle.id}:feedback:${entry.technicianProfileId}:${entry.date}:${entry.hour}:${index}`,
      cycleId: cycle.id,
      technicianId: String(entry.technicianProfileId),
      date: entry.date,
      hour: entry.hour,
      status: entry.status.toLowerCase() as "available" | "unavailable" | "updated",
      note: entry.note,
      submittedAt: entry.submittedAt,
      updatedAt: entry.updatedAt,
      version: cycle.version
    })),
    finalShifts: cycle.finalShifts.map((shift) => ({
      id: String(shift.id),
      cycleId: cycle.id,
      storeId: String(cycle.shopId),
      technicianId: String(shift.technicianProfileId),
      date: shift.date,
      hour: shift.hour,
      status: shift.status.toLowerCase() as "confirmed" | "waitlisted" | "cancelled",
      source: shift.source.toLowerCase() as "auto" | "manual",
      ruleSnapshot: "",
      confirmedAt: shift.confirmedAt,
      confirmedBy: "server"
    }))
  };
}

function toServerCycleUpdate(cycle: DispatchCycle) {
  return {
    name: cycle.name,
    mode: cycle.mode,
    currentStep: cycle.currentStep,
    templateType: cycle.templateType.toUpperCase(),
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    targetTechnicianIds: cycle.targetTechnicianIds.map(Number),
    feedbackDeadline: cycle.feedbackDeadline,
    templateMatrix: cycle.templateMatrix,
    regularHolidayWeekdays: cycle.regularHolidayWeekdays,
    ruleSet: cycle.ruleSet,
    version: cycle.version
  };
}

export function createDispatchCenterApi(operatorId: string) {
  return {
    async getOverview(storeId: string) {
      return getDispatchOverviewSummary(storeId);
    },
    async getScheduleGrid(storeId: string, view: "day" | "week" | "month", dateKey: string, cycleId?: string | null) {
      return getDispatchScheduleGrid(storeId, view, dateKey, cycleId);
    },
    async getTodayArrangements(storeId: string, serviceMode: DispatchServiceMode) {
      return getTodayArrangements(storeId, serviceMode);
    },
    async getSpecialTasks(storeId: string) {
      return getSpecialTasks(storeId);
    },
    async getFloatingTasks(storeId: string) {
      return getFloatingTasks(storeId);
    },
    async patchFloatingTask(taskId: string, minimized: boolean) {
      minimizeFloatingTask(taskId, minimized);
      return { ok: true };
    },
    async listCycles(storeId: string) {
      void storeId;
      const page = await httpClient.request<ServerDispatchCyclePage>("/merchant-admin/schedule-cycles", {
        query: { page: 1, pageSize: 20 }
      });
      return { ...page, list: page.list.map(fromServerCycle) };
    },
    async getActivePlanningCycle(storeId: string) {
      const page = await this.listCycles(storeId);
      return page.list.find((cycle) => !["active", "completed", "archived", "cancelled"].includes(cycle.status)) ?? null;
    },
    async createCycleDraft(storeId: string, targetTechnicianIds: string[] = []) {
      void storeId;
      const cycle = await httpClient.request<ServerDispatchCycle>("/merchant-admin/schedule-cycles", {
        body: { targetTechnicianIds: targetTechnicianIds.map(Number) },
        method: "POST"
      });
      return fromServerCycle(cycle);
    },
    async saveCycleDraft(cycle: DispatchCycle) {
      const saved = await httpClient.request<ServerDispatchCycle>(`/merchant-admin/schedule-cycles/${cycle.id}`, {
        body: toServerCycleUpdate(cycle),
        method: "PUT"
      });
      return fromServerCycle(saved);
    },
    async launchCycle(cycleId: string) {
      const cycle = await httpClient.request<ServerDispatchCycle>(`/merchant-admin/schedule-cycles/${cycleId}/launch`, {
        body: { idempotencyKey: `${cycleId}:launch` },
        method: "POST"
      });
      return fromServerCycle(cycle);
    },
    async runAutoConfirm(cycleId: string) {
      const result = await httpClient.request<ServerDispatchAutoConfirmResult>(`/merchant-admin/schedule-cycles/${cycleId}/auto-confirm`, {
        body: { idempotencyKey: `${cycleId}:auto-confirm` },
        method: "POST"
      });
      return { ...result, cycle: fromServerCycle(result.cycle) };
    },
    async closeFeedback(cycleId: string) {
      const cycle = await httpClient.request<ServerDispatchCycle>(`/merchant-admin/schedule-cycles/${cycleId}/close-feedback`, {
        method: "POST"
      });
      return fromServerCycle(cycle);
    },
    async adjustFinalShift(args: Parameters<typeof adjustDispatchFinalShift>[0]) {
      return adjustDispatchFinalShift({ ...args, operatorId });
    },
    async finalizeCycle(cycleId: string) {
      const cycle = await httpClient.request<ServerDispatchCycle>(`/merchant-admin/schedule-cycles/${cycleId}/finalize`, {
        body: { idempotencyKey: `${cycleId}:finalize` },
        method: "POST"
      });
      return fromServerCycle(cycle);
    },
    async cancelCycle(cycleId: string) {
      const cycle = await httpClient.request<ServerDispatchCycle>(`/merchant-admin/schedule-cycles/${cycleId}`, {
        method: "DELETE"
      });
      return fromServerCycle(cycle);
    },
    async listTechnicianCycles() {
      const page = await httpClient.request<ServerDispatchCyclePage>("/technician/schedule-cycles", {
        query: { page: 1, pageSize: 20 }
      });
      return { ...page, list: page.list.map(fromServerCycle) };
    },
    async submitTechnicianFeedback(cycleId: string, version: number, entries: Array<{ date: string; hour: number; status: "AVAILABLE" | "UNAVAILABLE" | "UPDATED"; note: string }>) {
      const cycle = await httpClient.request<ServerDispatchCycle>(`/technician/schedule-cycles/${cycleId}/feedback`, {
        body: { version, entries },
        method: "PUT"
      });
      return fromServerCycle(cycle);
    },
    async rescheduleArrangement(orderId: string, minutes: number) {
      return rescheduleArrangement(orderId, minutes, operatorId);
    },
    async assignArrangement(orderId: string, technicianId: string | null) {
      return assignArrangementTechnician(orderId, technicianId, operatorId);
    },
    async annotateArrangement(orderId: string) {
      return annotateArrangement(orderId, operatorId);
    },
    async cancelArrangement(orderId: string) {
      return cancelArrangement(orderId, operatorId);
    },
    async createSpecialTask(task: Omit<DispatchSpecialTask, "id">) {
      return createSpecialTask(task, operatorId);
    },
    async updateSpecialTask(taskId: string, patch: Partial<DispatchSpecialTask>) {
      return updateSpecialTask(taskId, patch, operatorId);
    },
    async previewNotificationTemplate(storeId: string, serviceName: string, date: string, timeRange: string) {
      return previewDispatchNotificationTemplate(storeId, serviceName, date, timeRange);
    }
  };
}
