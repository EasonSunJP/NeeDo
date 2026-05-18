import type { DispatchCycle, DispatchServiceMode, DispatchSpecialTask } from "./domain";
import {
  adjustDispatchFinalShift,
  annotateArrangement,
  assignArrangementTechnician,
  cancelArrangement,
  closeDispatchFeedback,
  createDispatchCycleDraft,
  createSpecialTask,
  finalizeDispatchCycle,
  getCycleFeedbackMatrix,
  getDispatchCycleList,
  getDispatchOverviewSummary,
  getDispatchScheduleGrid,
  getFloatingTasks,
  getPlanningCycleForStore,
  getSpecialTasks,
  getTodayArrangements,
  launchDispatchCycle,
  minimizeFloatingTask,
  previewDispatchNotificationTemplate,
  rescheduleArrangement,
  runDispatchAutoConfirm,
  saveDispatchCycleDraft,
  sendDispatchFeedbackReminder,
  updateSpecialTask
} from "./store";

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
      return getDispatchCycleList(storeId);
    },
    async getActivePlanningCycle(storeId: string) {
      return getPlanningCycleForStore(storeId);
    },
    async createCycleDraft(storeId: string) {
      return createDispatchCycleDraft(storeId);
    },
    async saveCycleDraft(cycle: DispatchCycle) {
      return saveDispatchCycleDraft(cycle);
    },
    async launchCycle(cycleId: string) {
      return launchDispatchCycle(cycleId, operatorId);
    },
    async getFeedbackMatrix(cycleId: string, dateKey: string) {
      return getCycleFeedbackMatrix(cycleId, dateKey);
    },
    async remindFeedback(cycleId: string) {
      return sendDispatchFeedbackReminder(cycleId, operatorId);
    },
    async closeFeedback(cycleId: string) {
      return closeDispatchFeedback(cycleId, operatorId);
    },
    async runAutoConfirm(cycleId: string) {
      return runDispatchAutoConfirm(cycleId, operatorId);
    },
    async adjustFinalShift(args: Parameters<typeof adjustDispatchFinalShift>[0]) {
      return adjustDispatchFinalShift({ ...args, operatorId });
    },
    async finalizeCycle(cycleId: string) {
      return finalizeDispatchCycle(cycleId, operatorId);
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
