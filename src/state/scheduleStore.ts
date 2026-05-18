import { useSyncExternalStore } from "react";
import { schedules as defaultSchedules } from "../data/mock";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { dispatchTodayKey } from "../lib/dispatchCalendar";
import type { OneClickScheduleConfig } from "../lib/oneClickSchedule";
import type { FulfillmentMode, Schedule } from "../types/domain";

export type ScheduleEdit = Partial<Pick<Schedule, "startTime" | "endTime" | "status">>;
export type SchedulePlanTag =
  | "booked"
  | "expected"
  | "locked"
  | "leave"
  | "travel"
  | "break"
  | "expectedTravel"
  | "expectedBreak"
  | "overflow";
export type AvailabilityWindow = {
  startTime: string;
  endTime: string;
};
export type GeneratedScheduleSource = "autoSchedule" | "autoDispatch";
export type ManagedScheduleDraft = Schedule & {
  planTag?: SchedulePlanTag;
};
export type AutoScheduleSettings = OneClickScheduleConfig & {
  enabled: boolean;
  baseDate: string;
};
export type AutoDispatchPriority = "balanced" | "longIdle" | "highRating" | "preferredTechnician";
export type AutoDispatchSettings = {
  enabled: boolean;
  dateFrom: string;
  dateTo: string;
  startTime: string;
  endTime: string;
  orderModes: FulfillmentMode[];
  eligibleAreas: string[];
  eligibleTechnicianIds: string[];
  priority: AutoDispatchPriority;
  preferredTechnicianId: string | null;
  minimumRating: number;
  minimumAcceptRate: number;
  maximumCancelRate: number;
  maxDailyOrdersPerTechnician: number | "ignore";
  strictAvailabilityWindow: boolean;
  travelMinutesPerKm: number;
};

type ScheduleStoreState = {
  baseSchedules: Schedule[];
  extraSchedules: Schedule[];
  scheduleEdits: Record<string, ScheduleEdit>;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  availabilityOverrides: Record<string, AvailabilityWindow>;
  generatedScheduleSources: Record<string, GeneratedScheduleSource>;
  autoScheduleSettings: AutoScheduleSettings;
  autoDispatchSettings: AutoDispatchSettings;
};

type ScheduleSnapshot = {
  schedules: Schedule[];
  scheduleEdits: Record<string, ScheduleEdit>;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  availabilityOverrides: Record<string, AvailabilityWindow>;
  generatedScheduleSources: Record<string, GeneratedScheduleSource>;
  autoScheduleSettings: AutoScheduleSettings;
  autoDispatchSettings: AutoDispatchSettings;
  revision: number;
};

const storageKey = "needo.schedule-store.v1";
const listeners = new Set<() => void>();
const defaultAutoScheduleSettings: AutoScheduleSettings = {
  enabled: false,
  baseDate: dispatchTodayKey,
  cycle: "weekly",
  repeatWeeks: 4,
  weekdays: [1, 2, 3, 4, 5],
  maxWorkHoursPerDay: 8,
  slots: [
    { id: "auto-slot-1", startTime: "10:00", endTime: "14:00", minStaff: 2, maxStaff: 4 },
    { id: "auto-slot-2", startTime: "18:00", endTime: "22:00", minStaff: 2, maxStaff: 5 }
  ]
};
const defaultAutoDispatchSettings: AutoDispatchSettings = {
  enabled: false,
  dateFrom: dispatchTodayKey,
  dateTo: dispatchTodayKey,
  startTime: "10:00",
  endTime: "23:00",
  orderModes: ["home", "store"],
  eligibleAreas: [],
  eligibleTechnicianIds: [],
  priority: "balanced",
  preferredTechnicianId: null,
  minimumRating: 0,
  minimumAcceptRate: 0,
  maximumCancelRate: 100,
  maxDailyOrdersPerTechnician: "ignore",
  strictAvailabilityWindow: false,
  travelMinutesPerKm: 3
};

let hydrated = false;
let storageListenerBound = false;
let revision = 0;
let cachedSnapshot: ScheduleSnapshot | null = null;
let cachedWorkingSchedules: Schedule[] | null = null;

const state: ScheduleStoreState = {
  baseSchedules: cloneCollection(defaultSchedules),
  extraSchedules: [],
  scheduleEdits: {},
  schedulePlanTags: {},
  availabilityOverrides: {},
  generatedScheduleSources: {},
  autoScheduleSettings: { ...defaultAutoScheduleSettings, slots: cloneCollection(defaultAutoScheduleSettings.slots) },
  autoDispatchSettings: { ...defaultAutoDispatchSettings }
};

function cloneCollection<T>(collection: T[]) {
  return JSON.parse(JSON.stringify(collection)) as T[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getScheduleStatus(value: unknown, fallback: Schedule["status"]) {
  return value === "free" || value === "booked" || value === "blocked" ? value : fallback;
}

function getScheduleEventType(value: unknown, fallback?: Schedule["eventType"]) {
  return value === "booking" ||
    value === "extension" ||
    value === "reschedule" ||
    value === "block" ||
    value === "attendance" ||
    value === "break"
    ? value
    : fallback;
}

function getScheduleDetailTargetType(value: unknown, fallback?: Schedule["detailTargetType"]) {
  return value === "order_detail" || value === "attendance_detail" || value === "none" ? value : fallback;
}

function isGeneratedScheduleSource(value: unknown): value is GeneratedScheduleSource {
  return value === "autoSchedule" || value === "autoDispatch";
}

function getAutoDispatchPriority(value: unknown, fallback: AutoDispatchPriority) {
  return value === "balanced" || value === "longIdle" || value === "highRating" || value === "preferredTechnician" ? value : fallback;
}

function isFulfillmentMode(value: unknown): value is FulfillmentMode {
  return value === "home" || value === "store";
}

function getStringList(value: unknown) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function normalizeAutoScheduleSettings(raw?: Partial<AutoScheduleSettings>): AutoScheduleSettings {
  return {
    enabled: Boolean(raw?.enabled),
    baseDate: getString(raw?.baseDate, defaultAutoScheduleSettings.baseDate),
    cycle: raw?.cycle === "single" || raw?.cycle === "weekly" ? raw.cycle : defaultAutoScheduleSettings.cycle,
    repeatWeeks: typeof raw?.repeatWeeks === "number" && raw.repeatWeeks > 0 ? raw.repeatWeeks : defaultAutoScheduleSettings.repeatWeeks,
    weekdays: Array.isArray(raw?.weekdays)
      ? raw.weekdays.filter((weekday): weekday is number => typeof weekday === "number" && weekday >= 0 && weekday <= 6)
      : defaultAutoScheduleSettings.weekdays,
    maxWorkHoursPerDay:
      raw?.maxWorkHoursPerDay === "ignore" || typeof raw?.maxWorkHoursPerDay === "number"
        ? raw.maxWorkHoursPerDay
        : defaultAutoScheduleSettings.maxWorkHoursPerDay,
    slots:
      Array.isArray(raw?.slots) && raw.slots.length > 0
        ? raw.slots
            .filter((slot) => slot && isNonEmptyString(slot.id))
            .map((slot, index) => ({
              id: slot.id ?? `auto-slot-${index + 1}`,
              startTime: getString(slot.startTime, "10:00"),
              endTime: getString(slot.endTime, "14:00"),
              minStaff: typeof slot.minStaff === "number" && slot.minStaff > 0 ? slot.minStaff : 1,
              maxStaff:
                typeof slot.maxStaff === "number" && slot.maxStaff > 0
                  ? Math.max(typeof slot.minStaff === "number" && slot.minStaff > 0 ? slot.minStaff : 1, slot.maxStaff)
                  : Math.max(typeof slot.minStaff === "number" && slot.minStaff > 0 ? slot.minStaff : 1, 2)
            }))
        : cloneCollection(defaultAutoScheduleSettings.slots)
  };
}

function normalizeAutoDispatchSettings(raw?: Partial<AutoDispatchSettings>): AutoDispatchSettings {
  return {
    enabled: Boolean(raw?.enabled),
    dateFrom: getString(raw?.dateFrom, defaultAutoDispatchSettings.dateFrom),
    dateTo: getString(raw?.dateTo, defaultAutoDispatchSettings.dateTo),
    startTime: getString(raw?.startTime, defaultAutoDispatchSettings.startTime),
    endTime: getString(raw?.endTime, defaultAutoDispatchSettings.endTime),
    orderModes:
      Array.isArray(raw?.orderModes) && raw.orderModes.length > 0
        ? raw.orderModes.filter(isFulfillmentMode)
        : cloneCollection(defaultAutoDispatchSettings.orderModes),
    eligibleAreas: getStringList(raw?.eligibleAreas),
    eligibleTechnicianIds: getStringList(raw?.eligibleTechnicianIds),
    priority: getAutoDispatchPriority(raw?.priority, defaultAutoDispatchSettings.priority),
    preferredTechnicianId: typeof raw?.preferredTechnicianId === "string" && raw.preferredTechnicianId.trim().length > 0 ? raw.preferredTechnicianId : null,
    minimumRating:
      typeof raw?.minimumRating === "number" && raw.minimumRating >= 0
        ? Math.min(5, Math.max(0, raw.minimumRating))
        : defaultAutoDispatchSettings.minimumRating,
    minimumAcceptRate:
      typeof raw?.minimumAcceptRate === "number" && raw.minimumAcceptRate >= 0
        ? Math.min(100, Math.max(0, raw.minimumAcceptRate))
        : defaultAutoDispatchSettings.minimumAcceptRate,
    maximumCancelRate:
      typeof raw?.maximumCancelRate === "number" && raw.maximumCancelRate >= 0
        ? Math.min(100, Math.max(0, raw.maximumCancelRate))
        : defaultAutoDispatchSettings.maximumCancelRate,
    maxDailyOrdersPerTechnician:
      raw?.maxDailyOrdersPerTechnician === "ignore"
        ? "ignore"
        : typeof raw?.maxDailyOrdersPerTechnician === "number" && raw.maxDailyOrdersPerTechnician > 0
          ? Math.round(raw.maxDailyOrdersPerTechnician)
          : defaultAutoDispatchSettings.maxDailyOrdersPerTechnician,
    strictAvailabilityWindow: Boolean(raw?.strictAvailabilityWindow),
    travelMinutesPerKm:
      typeof raw?.travelMinutesPerKm === "number" && raw.travelMinutesPerKm > 0
        ? raw.travelMinutesPerKm
        : defaultAutoDispatchSettings.travelMinutesPerKm
  };
}

function normalizeSchedule(base: Schedule, raw?: Partial<Schedule>): Schedule {
  if (!raw) {
    return { ...base };
  }

  return {
    ...base,
    ...raw,
    id: base.id,
    staffId: getString(raw.staffId, base.staffId),
    date: getString(raw.date, base.date),
    startTime: getString(raw.startTime, base.startTime),
    endTime: getString(raw.endTime, base.endTime),
    status: getScheduleStatus(raw.status, base.status),
    orderId: typeof raw.orderId === "string" ? raw.orderId : base.orderId,
    parentOrderId: typeof raw.parentOrderId === "string" ? raw.parentOrderId : base.parentOrderId,
    appointmentId: typeof raw.appointmentId === "string" ? raw.appointmentId : base.appointmentId,
    eventType: getScheduleEventType(raw.eventType, base.eventType),
    isClickable: typeof raw.isClickable === "boolean" ? raw.isClickable : base.isClickable,
    detailTargetType: getScheduleDetailTargetType(raw.detailTargetType, base.detailTargetType),
    detailTargetId: typeof raw.detailTargetId === "string" ? raw.detailTargetId : base.detailTargetId
  };
}

function normalizeCollection(defaults: Schedule[], rawList: unknown) {
  const rawMap = new Map(
    Array.isArray(rawList)
      ? rawList
          .filter((item): item is Partial<Schedule> & { id: string } => typeof item === "object" && item !== null && isNonEmptyString((item as { id?: unknown }).id))
          .map((item) => [item.id, item])
      : []
  );

  return defaults.map((base) => normalizeSchedule(base, rawMap.get(base.id)));
}

function replaceCollection<T>(target: T[], next: T[]) {
  while (target.length > next.length) {
    target.pop();
  }

  next.forEach((item, index) => {
    if (target[index] && typeof target[index] === "object" && target[index] !== null) {
      Object.assign(target[index] as Record<string, unknown>, item as Record<string, unknown>);
      return;
    }

    target[index] = item;
  });
}

function persist() {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(
    storageKey,
    JSON.stringify({
      baseSchedules: state.baseSchedules,
      extraSchedules: state.extraSchedules,
      scheduleEdits: state.scheduleEdits,
      schedulePlanTags: state.schedulePlanTags,
      availabilityOverrides: state.availabilityOverrides,
      generatedScheduleSources: state.generatedScheduleSources,
      autoScheduleSettings: state.autoScheduleSettings,
      autoDispatchSettings: state.autoDispatchSettings
    }),
    { silent: true }
  );
}

function emitExternalUpdate() {
  revision += 1;
  cachedSnapshot = null;
  cachedWorkingSchedules = null;
  listeners.forEach((listener) => listener());
}

function notify() {
  persist();
  emitExternalUpdate();
}

function applyHydratedState(parsed?: Partial<ScheduleStoreState> | null) {
  if (!parsed) {
    replaceCollection(state.baseSchedules, cloneCollection(defaultSchedules));
    replaceCollection(state.extraSchedules, []);
    state.scheduleEdits = {};
    state.schedulePlanTags = {};
    state.availabilityOverrides = {};
    state.generatedScheduleSources = {};
    state.autoScheduleSettings = { ...defaultAutoScheduleSettings, slots: cloneCollection(defaultAutoScheduleSettings.slots) };
    state.autoDispatchSettings = { ...defaultAutoDispatchSettings };
    return;
  }

  replaceCollection(state.baseSchedules, normalizeCollection(defaultSchedules, parsed.baseSchedules));
  replaceCollection(
    state.extraSchedules,
    Array.isArray(parsed.extraSchedules)
      ? parsed.extraSchedules
          .filter((item): item is Schedule => typeof item === "object" && item !== null && isNonEmptyString((item as { id?: unknown }).id))
          .map((item) => normalizeSchedule(item))
      : []
  );
  state.scheduleEdits = typeof parsed.scheduleEdits === "object" && parsed.scheduleEdits ? parsed.scheduleEdits : {};
  state.schedulePlanTags = typeof parsed.schedulePlanTags === "object" && parsed.schedulePlanTags ? parsed.schedulePlanTags : {};
  state.availabilityOverrides = typeof parsed.availabilityOverrides === "object" && parsed.availabilityOverrides ? parsed.availabilityOverrides : {};
  state.generatedScheduleSources =
    typeof parsed.generatedScheduleSources === "object" && parsed.generatedScheduleSources
      ? Object.fromEntries(
          Object.entries(parsed.generatedScheduleSources).filter((entry): entry is [string, GeneratedScheduleSource] => isGeneratedScheduleSource(entry[1]))
        )
      : {};
  state.autoScheduleSettings = normalizeAutoScheduleSettings(parsed.autoScheduleSettings);
  state.autoDispatchSettings = normalizeAutoDispatchSettings(parsed.autoDispatchSettings);
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || event.key !== storageKey) {
      return;
    }

    if (!event.newValue) {
      applyHydratedState(null);
      emitExternalUpdate();
      return;
    }

    try {
      applyHydratedState(JSON.parse(event.newValue) as Partial<ScheduleStoreState>);
    } catch {
      applyHydratedState(null);
    }

    emitExternalUpdate();
  });
}

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    hydrated = true;
    return;
  }

  hydrated = true;
  bindStorageListener();
  const raw = readBrowserStorage(storageKey, { silent: true });

  if (!raw) {
    persist();
    return;
  }

  try {
    applyHydratedState(JSON.parse(raw) as Partial<ScheduleStoreState>);
  } catch {
    persist();
  }
}

function computeWorkingSchedules() {
  if (cachedWorkingSchedules) {
    return cachedWorkingSchedules;
  }

  cachedWorkingSchedules = [...state.baseSchedules, ...state.extraSchedules].map((schedule) => ({
    ...schedule,
    ...(state.scheduleEdits[schedule.id] ?? {})
  }));

  return cachedWorkingSchedules;
}

function getSnapshot(): ScheduleSnapshot {
  hydrate();

  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    schedules: computeWorkingSchedules(),
    scheduleEdits: state.scheduleEdits,
    schedulePlanTags: state.schedulePlanTags,
    availabilityOverrides: state.availabilityOverrides,
    generatedScheduleSources: state.generatedScheduleSources,
    autoScheduleSettings: state.autoScheduleSettings,
    autoDispatchSettings: state.autoDispatchSettings,
    revision
  };

  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function findSchedule(scheduleId: string) {
  return [...state.baseSchedules, ...state.extraSchedules].find((schedule) => schedule.id === scheduleId);
}

export function useScheduleStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getScheduleStoreSnapshot() {
  return getSnapshot();
}

export function updateSharedSchedule(scheduleId: string, changes: ScheduleEdit) {
  if (!findSchedule(scheduleId)) {
    return;
  }

  state.scheduleEdits = {
    ...state.scheduleEdits,
    [scheduleId]: {
      ...(state.scheduleEdits[scheduleId] ?? {}),
      ...changes
    }
  };
  notify();
}

export function updateSharedSchedulePlanTag(scheduleId: string, planTag: SchedulePlanTag) {
  const schedule = findSchedule(scheduleId);

  if (!schedule || schedule.status === "booked") {
    return;
  }

  state.schedulePlanTags = {
    ...state.schedulePlanTags,
    [scheduleId]: planTag
  };
  updateSharedSchedule(scheduleId, {
    status: planTag === "expected" ? "free" : "blocked"
  });
}

export function removeSharedSchedule(scheduleId: string) {
  const existsInExtraSchedules = state.extraSchedules.some((schedule) => schedule.id === scheduleId);

  if (!existsInExtraSchedules) {
    return;
  }

  state.extraSchedules = state.extraSchedules.filter((schedule) => schedule.id !== scheduleId);
  state.scheduleEdits = Object.fromEntries(Object.entries(state.scheduleEdits).filter(([id]) => id !== scheduleId));
  state.schedulePlanTags = Object.fromEntries(Object.entries(state.schedulePlanTags).filter(([id]) => id !== scheduleId));
  state.generatedScheduleSources = Object.fromEntries(Object.entries(state.generatedScheduleSources).filter(([id]) => id !== scheduleId));
  notify();
}

export function updateSharedAvailabilityWindow(staffId: string, date: string, window: AvailabilityWindow | null) {
  const key = `${staffId}__${date}`;

  if (!window) {
    state.availabilityOverrides = Object.fromEntries(
      Object.entries(state.availabilityOverrides).filter(([entryKey]) => entryKey !== key)
    );
    notify();
    return;
  }

  state.availabilityOverrides = {
    ...state.availabilityOverrides,
    [key]: window
  };
  notify();
}

export function addSharedSchedules(nextSchedules: Schedule[]) {
  if (nextSchedules.length === 0) {
    return;
  }

  state.extraSchedules = [...state.extraSchedules, ...nextSchedules.map((schedule) => ({ ...schedule }))];
  notify();
}

export function updateAutoScheduleSettings(changes: Partial<AutoScheduleSettings>) {
  state.autoScheduleSettings = normalizeAutoScheduleSettings({
    ...state.autoScheduleSettings,
    ...changes
  });
  notify();
}

export function updateAutoDispatchSettings(changes: Partial<AutoDispatchSettings>) {
  state.autoDispatchSettings = normalizeAutoDispatchSettings({
    ...state.autoDispatchSettings,
    ...changes
  });
  notify();
}

export function replaceGeneratedSchedules(source: GeneratedScheduleSource, nextSchedules: ManagedScheduleDraft[]) {
  const currentIds = Object.entries(state.generatedScheduleSources)
    .filter((entry): entry is [string, GeneratedScheduleSource] => entry[1] === source)
    .map(([scheduleId]) => scheduleId)
    .sort();
  const currentSignature = JSON.stringify({
    ids: currentIds,
    schedules: currentIds
      .map((scheduleId) => state.extraSchedules.find((schedule) => schedule.id === scheduleId))
      .filter((schedule): schedule is Schedule => Boolean(schedule))
      .map((schedule) => ({
        id: schedule.id,
        staffId: schedule.staffId,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        status: schedule.status,
        orderId: schedule.orderId ?? null,
        planTag: state.schedulePlanTags[schedule.id] ?? null
      }))
  });
  const normalizedNext = nextSchedules.map((schedule) => ({ ...schedule }));
  const nextSignature = JSON.stringify({
    ids: normalizedNext.map((schedule) => schedule.id).sort(),
    schedules: normalizedNext.map((schedule) => ({
      id: schedule.id,
      staffId: schedule.staffId,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      status: schedule.status,
      orderId: schedule.orderId ?? null,
      planTag: schedule.planTag ?? null
    }))
  });

  if (currentSignature === nextSignature) {
    return;
  }

  const currentIdSet = new Set(currentIds);
  state.extraSchedules = state.extraSchedules.filter((schedule) => !currentIdSet.has(schedule.id));
  state.scheduleEdits = Object.fromEntries(Object.entries(state.scheduleEdits).filter(([scheduleId]) => !currentIdSet.has(scheduleId)));
  state.schedulePlanTags = Object.fromEntries(Object.entries(state.schedulePlanTags).filter(([scheduleId]) => !currentIdSet.has(scheduleId)));
  state.generatedScheduleSources = Object.fromEntries(
    Object.entries(state.generatedScheduleSources).filter(([scheduleId]) => !currentIdSet.has(scheduleId))
  );

  if (normalizedNext.length > 0) {
    state.extraSchedules = [
      ...state.extraSchedules,
      ...normalizedNext.map(({ planTag: _planTag, ...schedule }) => ({ ...schedule }))
    ];
    normalizedNext.forEach((schedule) => {
      state.generatedScheduleSources[schedule.id] = source;

      if (schedule.planTag) {
        state.schedulePlanTags[schedule.id] = schedule.planTag;
      }
    });
  }

  notify();
}
