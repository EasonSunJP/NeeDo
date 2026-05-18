import type { AutoDispatchSettings, AutoScheduleSettings, AvailabilityWindow, ManagedScheduleDraft, SchedulePlanTag } from "../state/scheduleStore";
import { formatDateKey, getOneClickTargetDates, timeToMinutes } from "./oneClickSchedule";
import type { Order, Schedule, Technician } from "../types/domain";

function addMinutesToClock(time: string, minutesToAdd: number) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutesToAdd;
  const safeMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextHour = Math.floor(safeMinutes / 60);
  const nextMinute = safeMinutes % 60;

  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

function scheduleDurationMinutes(schedule: Pick<Schedule, "startTime" | "endTime">) {
  return Math.max(0, timeToMinutes(schedule.endTime) - timeToMinutes(schedule.startTime));
}

function hasScheduleConflict(
  schedules: Schedule[],
  staffId: string,
  date: string,
  startTime: string,
  endTime: string,
  options?: { ignoreFree?: boolean }
) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  return schedules.some((schedule) => {
    if (schedule.staffId !== staffId || schedule.date !== date) {
      return false;
    }

    if (options?.ignoreFree && schedule.status === "free") {
      return false;
    }

    return startMinutes < timeToMinutes(schedule.endTime) && endMinutes > timeToMinutes(schedule.startTime);
  });
}

function getAvailabilityKey(staffId: string, date: string) {
  return `${staffId}__${date}`;
}

function createAvailabilityMap(schedules: Schedule[], overrides: Record<string, AvailabilityWindow>) {
  const derived = schedules.reduce<Record<string, AvailabilityWindow>>((accumulator, schedule) => {
    if (schedule.status !== "free") {
      return accumulator;
    }

    const key = getAvailabilityKey(schedule.staffId, schedule.date);
    const current = accumulator[key];

    if (!current) {
      accumulator[key] = { startTime: schedule.startTime, endTime: schedule.endTime };
      return accumulator;
    }

    accumulator[key] = {
      startTime: timeToMinutes(schedule.startTime) < timeToMinutes(current.startTime) ? schedule.startTime : current.startTime,
      endTime: timeToMinutes(schedule.endTime) > timeToMinutes(current.endTime) ? schedule.endTime : current.endTime
    };

    return accumulator;
  }, {});

  return { ...derived, ...overrides };
}

function isOutsideAvailabilityRange(
  staffId: string,
  date: string,
  startTime: string,
  endTime: string,
  availabilityMap: Record<string, AvailabilityWindow>
) {
  const availability = availabilityMap[getAvailabilityKey(staffId, date)];

  if (!availability) {
    return false;
  }

  return timeToMinutes(startTime) < timeToMinutes(availability.startTime) || timeToMinutes(endTime) > timeToMinutes(availability.endTime);
}

export function buildAutoScheduleDrafts({
  technicians,
  schedules,
  availabilityOverrides,
  settings
}: {
  technicians: Technician[];
  schedules: Schedule[];
  availabilityOverrides: Record<string, AvailabilityWindow>;
  settings: AutoScheduleSettings;
}): ManagedScheduleDraft[] {
  if (!settings.enabled || technicians.length === 0 || settings.slots.length === 0) {
    return [];
  }

  const targetDates = getOneClickTargetDates(new Date(settings.baseDate), settings);
  const availabilityMap = createAvailabilityMap(schedules, availabilityOverrides);
  const plannedSchedules: ManagedScheduleDraft[] = [];
  const knownSchedules = [...schedules];
  const maxDailyMinutes = settings.maxWorkHoursPerDay === "ignore" ? Number.POSITIVE_INFINITY : settings.maxWorkHoursPerDay * 60;

  targetDates.forEach((dateKey, dateIndex) => {
    settings.slots.forEach((slot, slotIndex) => {
      const slotMinutes = Math.max(30, timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime));
      const safeMax = Math.max(slot.minStaff, slot.maxStaff);
      const targetCount = Math.min(safeMax, technicians.length);
      const rotationOffset = (dateIndex + slotIndex) % Math.max(technicians.length, 1);
      const rotatedStaff = [...technicians.slice(rotationOffset), ...technicians.slice(0, rotationOffset)];
      const candidates = rotatedStaff.filter((technician) => {
        const sameDaySchedules = [...knownSchedules, ...plannedSchedules].filter((schedule) => schedule.staffId === technician.id && schedule.date === dateKey);
        const dayMinutes = sameDaySchedules.reduce((sum, schedule) => sum + scheduleDurationMinutes(schedule), 0);

        if (dayMinutes + slotMinutes > maxDailyMinutes) {
          return false;
        }

        return !hasScheduleConflict([...knownSchedules, ...plannedSchedules], technician.id, dateKey, slot.startTime, slot.endTime);
      });
      const inWindowCandidates = candidates.filter((technician) => !isOutsideAvailabilityRange(technician.id, dateKey, slot.startTime, slot.endTime, availabilityMap));
      const overflowCandidates = candidates.filter((technician) => isOutsideAvailabilityRange(technician.id, dateKey, slot.startTime, slot.endTime, availabilityMap));
      const selectedTechnicians = [...inWindowCandidates, ...overflowCandidates].slice(0, targetCount);

      selectedTechnicians.forEach((technician) => {
        const outsideWindow = isOutsideAvailabilityRange(technician.id, dateKey, slot.startTime, slot.endTime, availabilityMap);
        const planTag: SchedulePlanTag = outsideWindow ? "overflow" : "expected";

        plannedSchedules.push({
          id: `auto-schedule-${dateKey}-${slot.id}-${technician.id}`,
          staffId: technician.id,
          date: dateKey,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "free",
          planTag
        });
      });
    });
  });

  return plannedSchedules;
}

function parseOrderSchedule(order: Order, travelMinutes: number) {
  const [date = "2026-04-14", startTime = "12:00"] = order.bookedAt.split(" ");
  const durationMinutes = 90;

  return {
    date,
    startTime,
    endTime: addMinutesToClock(startTime, durationMinutes + travelMinutes)
  };
}

function buildDispatchCandidateScore({
  technician,
  priority,
  preferredTechnicianId,
  daySchedules,
  travelMinutes,
  availabilityPenalty
}: {
  technician: Technician;
  priority: AutoDispatchSettings["priority"];
  preferredTechnicianId: string | null;
  daySchedules: Schedule[];
  travelMinutes: number;
  availabilityPenalty: number;
}) {
  const dayMinutes = daySchedules.reduce((sum, schedule) => sum + scheduleDurationMinutes(schedule), 0);
  const idleScore = Math.max(0, 600 - dayMinutes);
  const ratingScore = technician.rating * 30 + technician.acceptRate * 1.6 - technician.cancelRate * 4;
  const baseScore = ratingScore + idleScore / 10 - travelMinutes - availabilityPenalty;

  if (priority === "preferredTechnician" && preferredTechnicianId === technician.id) {
    return baseScore + 160;
  }

  if (priority === "highRating") {
    return baseScore + technician.rating * 60;
  }

  if (priority === "longIdle") {
    return baseScore + idleScore / 2;
  }

  return baseScore;
}

export function buildAutoDispatchDrafts({
  orders,
  technicians,
  schedules,
  availabilityOverrides,
  settings
}: {
  orders: Order[];
  technicians: Technician[];
  schedules: Schedule[];
  availabilityOverrides: Record<string, AvailabilityWindow>;
  settings: AutoDispatchSettings;
}): ManagedScheduleDraft[] {
  if (!settings.enabled || technicians.length === 0 || orders.length === 0) {
    return [];
  }

  const availabilityMap = createAvailabilityMap(schedules, availabilityOverrides);
  const plannedSchedules: ManagedScheduleDraft[] = [];
  const knownSchedules = [...schedules];
  const eligibleOrders = orders.filter((order) => {
    if (!["pending", "confirmed", "scheduled"].includes(order.status)) {
      return false;
    }

    const [date = settings.dateFrom, time = "00:00"] = order.bookedAt.split(" ");
    if (date < settings.dateFrom || date > settings.dateTo || time < settings.startTime || time > settings.endTime) {
      return false;
    }

    if (!settings.orderModes.includes(order.mode)) {
      return false;
    }

    if (settings.eligibleAreas.length > 0 && !settings.eligibleAreas.includes(order.area)) {
      return false;
    }

    return true;
  });

  eligibleOrders.forEach((order, orderIndex) => {
    if ([...knownSchedules, ...plannedSchedules].some((schedule) => schedule.orderId === order.id)) {
      return;
    }

    const candidatePool = technicians
      .map((technician, technicianIndex) => {
        if (settings.eligibleTechnicianIds.length > 0 && !settings.eligibleTechnicianIds.includes(technician.id)) {
          return null;
        }

        if (technician.rating < settings.minimumRating || technician.acceptRate < settings.minimumAcceptRate || technician.cancelRate > settings.maximumCancelRate) {
          return null;
        }

        const travelMinutes = order.mode === "home" ? Math.round((2 + technicianIndex * 1.5) * settings.travelMinutesPerKm) : 0;
        const target = parseOrderSchedule(order, travelMinutes);
        const daySchedules = [...knownSchedules, ...plannedSchedules].filter((schedule) => schedule.staffId === technician.id && schedule.date === target.date);
        const bookedCount = daySchedules.filter((schedule) => schedule.status === "booked").length;

        if (settings.maxDailyOrdersPerTechnician !== "ignore" && bookedCount >= settings.maxDailyOrdersPerTechnician) {
          return null;
        }

        const hasConflict = hasScheduleConflict([...knownSchedules, ...plannedSchedules], technician.id, target.date, target.startTime, target.endTime, {
          ignoreFree: true
        });

        if (hasConflict) {
          return null;
        }

        const outsideAvailabilityRange = isOutsideAvailabilityRange(technician.id, target.date, target.startTime, target.endTime, availabilityMap);

        if (settings.strictAvailabilityWindow && outsideAvailabilityRange) {
          return null;
        }

        const availabilityPenalty = outsideAvailabilityRange ? 60 : 0;

        return {
          technician,
          target,
          score: buildDispatchCandidateScore({
            technician,
            priority: settings.priority,
            preferredTechnicianId: settings.preferredTechnicianId,
            daySchedules,
            travelMinutes,
            availabilityPenalty
          })
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => right.score - left.score);

    const bestCandidate = candidatePool[0];

    if (!bestCandidate) {
      return;
    }

    plannedSchedules.push({
      id: `auto-dispatch-${order.id}-${bestCandidate.technician.id}-${orderIndex}`,
      staffId: bestCandidate.technician.id,
      date: bestCandidate.target.date,
      startTime: bestCandidate.target.startTime,
      endTime: bestCandidate.target.endTime,
      status: "booked",
      orderId: order.id
    });
  });

  return plannedSchedules;
}
