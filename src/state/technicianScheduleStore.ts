import { useSyncExternalStore } from "react";
import { orders, stores, technicians } from "../data/mock";
import type {
  TechnicianDutyShift,
  TechnicianScheduleBooking,
  TechnicianScheduleCustomEvent,
  TechnicianScheduleSnapshot,
  TechnicianScheduleSyncTarget,
  TechnicianScheduleTransferInvitation,
  TechnicianScheduleTransferRequest
} from "../features/technician-schedule/model";
import {
  addDays,
  getTodayDateKey,
  intersectRange,
  intervalToRange,
  isBlockingCustomEvent,
  overlapsRange
} from "../features/technician-schedule/model";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

type TechnicianScheduleStoreState = Omit<TechnicianScheduleSnapshot, "revision">;

export type SaveTechnicianScheduleEventInput = Omit<TechnicianScheduleCustomEvent, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export type CreateTechnicianScheduleTransferRequestInput = {
  shiftId: string;
  requesterId: string;
  storeId: string;
  requestedCount: number;
  candidateIds: string[];
};

export type TechnicianScheduleTransferResponseResult = {
  ok: boolean;
  message: string;
};

const storageKey = "needo.technician-schedule.v1";
const listeners = new Set<() => void>();

let hydrated = false;
let revision = 0;
let cachedSnapshot: TechnicianScheduleSnapshot | null = null;

const state: TechnicianScheduleStoreState = buildSeedState();

function buildSeedState(): TechnicianScheduleStoreState {
  const fallbackTechnician = technicians[0];
  const fallbackStore = stores[0];

  if (!fallbackTechnician || !fallbackStore) {
    return {
      dutyShifts: [],
      bookings: [],
      customEvents: [],
      transferRequests: [],
      transferInvitations: []
    };
  }

  const primaryTechnician = technicians.find((technician) => technician.id === "tech-1") ?? fallbackTechnician;
  const homeStore = stores.find((store) => store.id === primaryTechnician.storeId) ?? fallbackStore;
  const sameStoreColleagues = technicians.filter(
    (technician) => technician.storeId === homeStore.id && technician.id !== primaryTechnician.id
  );
  const [colleagueOne, colleagueTwo, colleagueThree] = sameStoreColleagues;
  const today = getTodayDateKey();
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  const nextWeek = addDays(today, 5);
  const orderPool = orders.filter((order) => typeof order.amount === "number" && order.amount > 0);
  const syncStoreTarget: TechnicianScheduleSyncTarget = {
    id: homeStore.id,
    type: "store",
    label: homeStore.name
  };

  const dutyShifts: TechnicianDutyShift[] = [
    {
      id: "duty-self-1",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: today,
      startTime: "10:00",
      endTime: "18:00",
      title: `${homeStore.name} 已确认勤务`,
      shiftLabel: "日班"
    },
    {
      id: "duty-self-2",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: tomorrow,
      startTime: "11:00",
      endTime: "17:00",
      title: `${homeStore.name} 已确认勤务`,
      shiftLabel: "中班"
    },
    {
      id: "duty-self-3",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: dayAfterTomorrow,
      startTime: "12:00",
      endTime: "20:00",
      title: `${homeStore.name} 已确认勤务`,
      shiftLabel: "晚班"
    },
    {
      id: "duty-self-4",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: nextWeek,
      startTime: "10:00",
      endTime: "16:00",
      title: `${homeStore.name} 已确认勤务`,
      shiftLabel: "短班"
    }
  ];

  if (colleagueOne) {
    dutyShifts.push({
      id: "duty-peer-1",
      technicianId: colleagueOne.id,
      storeId: homeStore.id,
      date: dayAfterTomorrow,
      startTime: "12:00",
      endTime: "16:00",
      title: `${homeStore.name} 已确认勤务`,
      shiftLabel: "协作班"
    });
  }

  if (colleagueTwo) {
    dutyShifts.push({
      id: "duty-peer-2",
      technicianId: colleagueTwo.id,
      storeId: homeStore.id,
      date: tomorrow,
      startTime: "18:00",
      endTime: "20:00",
      title: `${homeStore.name} 已确认勤务`,
      shiftLabel: "晚间接替"
    });
  }

  if (colleagueThree) {
    dutyShifts.push({
      id: "duty-peer-3",
      technicianId: colleagueThree.id,
      storeId: homeStore.id,
      date: today,
      startTime: "10:00",
      endTime: "12:00",
      title: `${homeStore.name} 已确认勤务`,
      shiftLabel: "晨班"
    });
  }

  const bookings: TechnicianScheduleBooking[] = [
    {
      id: "booking-self-1",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: today,
      startTime: "10:30",
      endTime: "12:00",
      title: orderPool[0]?.itemName ?? "肩颈放松护理",
      customerName: orderPool[0]?.customerName ?? "林 小雨",
      amount: orderPool[0]?.amount ?? 12800,
      orderId: orderPool[0]?.id,
      eventType: "booking",
      detailTargetType: "order_detail",
      detailTargetId: orderPool[0]?.id,
      note: "门店正式预约"
    },
    {
      id: "booking-self-2",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: today,
      startTime: "14:00",
      endTime: "15:30",
      title: orderPool[1]?.itemName ?? "深层舒缓护理",
      customerName: orderPool[1]?.customerName ?? "佐藤 健",
      amount: orderPool[1]?.amount ?? 9800,
      orderId: orderPool[1]?.id,
      eventType: "booking",
      detailTargetType: "order_detail",
      detailTargetId: orderPool[1]?.id,
      note: "门店正式预约"
    },
    {
      id: "booking-self-3",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: today,
      startTime: "19:30",
      endTime: "20:30",
      title: orderPool[2]?.itemName ?? "加急护理预约",
      customerName: orderPool[2]?.customerName ?? "Mia Chen",
      amount: orderPool[2]?.amount ?? 16800,
      orderId: orderPool[2]?.id,
      eventType: "booking",
      detailTargetType: "order_detail",
      detailTargetId: orderPool[2]?.id,
      note: "落在确认班次外，需要额外确认"
    },
    {
      id: "booking-self-4",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: tomorrow,
      startTime: "12:00",
      endTime: "13:30",
      title: orderPool[3]?.itemName ?? "肩颈护理 90 分钟",
      customerName: orderPool[3]?.customerName ?? "高桥 由美",
      amount: orderPool[3]?.amount ?? 11800,
      orderId: orderPool[3]?.id,
      eventType: "reschedule",
      detailTargetType: "order_detail",
      detailTargetId: orderPool[3]?.id,
      note: "已改期到当前时间段，点击打开当前预约订单"
    },
    {
      id: "booking-self-5",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: tomorrow,
      startTime: "16:30",
      endTime: "18:30",
      title: orderPool[4]?.itemName ?? "到店延长护理",
      customerName: orderPool[4]?.customerName ?? "Emily Wong",
      amount: orderPool[4]?.amount ?? 15600,
      orderId: orderPool[4]?.id,
      parentOrderId: orderPool[0]?.id,
      eventType: "extension",
      detailTargetType: "order_detail",
      detailTargetId: orderPool[4]?.id,
      note: "加钟订单，详情页可回到原订单"
    }
  ];

  if (colleagueOne) {
    bookings.push({
      id: "booking-peer-1",
      technicianId: colleagueOne.id,
      storeId: homeStore.id,
      date: today,
      startTime: "13:00",
      endTime: "15:00",
      title: orderPool[5]?.itemName ?? "店内预约",
      customerName: orderPool[5]?.customerName ?? "小林 美月",
      amount: orderPool[5]?.amount ?? 8800,
      orderId: orderPool[5]?.id,
      eventType: "booking",
      detailTargetType: "order_detail",
      detailTargetId: orderPool[5]?.id
    });
  }

  const customEvents: TechnicianScheduleCustomEvent[] = [
    {
      id: "event-self-availability-1",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: today,
      startTime: "09:30",
      endTime: "18:30",
      title: "可上班",
      kind: "availability",
      note: "技师自己设定的可工作时间",
      syncTargets: [syncStoreTarget],
      createdAt: `${today}T08:00:00`,
      updatedAt: `${today}T08:00:00`
    },
    {
      id: "event-self-availability-2",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: today,
      startTime: "19:00",
      endTime: "21:30",
      title: "可上班",
      kind: "availability",
      note: "晚间补充可工作时间",
      syncTargets: [],
      createdAt: `${today}T08:10:00`,
      updatedAt: `${today}T08:10:00`
    },
    {
      id: "event-self-availability-3",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: tomorrow,
      startTime: "10:00",
      endTime: "19:00",
      title: "可上班",
      kind: "availability",
      note: "次日可排班时间",
      syncTargets: [syncStoreTarget],
      createdAt: `${today}T08:20:00`,
      updatedAt: `${today}T08:20:00`
    },
    {
      id: "event-self-rest-1",
      technicianId: primaryTechnician.id,
      storeId: homeStore.id,
      date: tomorrow,
      startTime: "09:00",
      endTime: "10:00",
      title: "通勤前准备",
      kind: "travel",
      note: "上门前移动",
      syncTargets: [],
      createdAt: `${today}T08:25:00`,
      updatedAt: `${today}T08:25:00`
    }
  ];

  if (colleagueThree) {
    customEvents.push({
      id: "event-peer-locked-1",
      technicianId: colleagueThree.id,
      storeId: homeStore.id,
      date: tomorrow,
      startTime: "18:00",
      endTime: "20:00",
      title: "锁定安排",
      kind: "locked",
      note: "已有私人安排",
      syncTargets: [],
      createdAt: `${today}T08:30:00`,
      updatedAt: `${today}T08:30:00`
    });
  }

  const transferRequests: TechnicianScheduleTransferRequest[] = [];
  const transferInvitations: TechnicianScheduleTransferInvitation[] = [];

  if (colleagueTwo) {
    transferRequests.push({
      id: "transfer-seed-incoming-1",
      shiftId: "duty-peer-2",
      requesterId: colleagueTwo.id,
      storeId: homeStore.id,
      requestedCount: 1,
      candidateIds: [primaryTechnician.id, colleagueThree?.id].filter((candidateId): candidateId is string => Boolean(candidateId)),
      status: "transfer_pending",
      createdAt: `${today}T09:00:00`,
      updatedAt: `${today}T09:00:00`
    });

    transferInvitations.push(
      {
        id: "transfer-seed-incoming-1-invite-self",
        requestId: "transfer-seed-incoming-1",
        candidateId: primaryTechnician.id,
        status: "pending",
        invitedAt: `${today}T09:00:00`
      },
      ...(colleagueThree
        ? [
            {
              id: "transfer-seed-incoming-1-invite-peer",
              requestId: "transfer-seed-incoming-1",
              candidateId: colleagueThree.id,
              status: "pending",
              invitedAt: `${today}T09:00:00`
            } satisfies TechnicianScheduleTransferInvitation
          ]
        : [])
    );
  }

  return {
    dutyShifts,
    bookings,
    customEvents,
    transferRequests,
    transferInvitations
  };
}

function cloneState(nextState: TechnicianScheduleStoreState) {
  return JSON.parse(JSON.stringify(nextState)) as TechnicianScheduleStoreState;
}

function nowIsoString() {
  return new Date().toISOString();
}

function generateId(prefix: string) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function persist() {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(state), { silent: true });
}

function emitChange() {
  revision += 1;
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function notify() {
  persist();
  emitChange();
}

function hydrate() {
  if (hydrated) {
    return;
  }

  hydrated = true;

  if (typeof window === "undefined") {
    return;
  }

  const raw = readBrowserStorage(storageKey, { silent: true });
  if (!raw) {
    persist();
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TechnicianScheduleStoreState>;
    if (
      !Array.isArray(parsed?.dutyShifts) ||
      !Array.isArray(parsed?.bookings) ||
      !Array.isArray(parsed?.customEvents) ||
      !Array.isArray(parsed?.transferRequests) ||
      !Array.isArray(parsed?.transferInvitations)
    ) {
      persist();
      return;
    }

    Object.assign(state, cloneState(parsed as TechnicianScheduleStoreState));
  } catch {
    persist();
  }
}

function getSnapshot(): TechnicianScheduleSnapshot {
  hydrate();

  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    ...cloneState(state),
    revision
  };

  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getRequestInvitations(requestId: string) {
  return state.transferInvitations.filter((invitation) => invitation.requestId === requestId);
}

function getLatestRequestForShift(shiftId: string) {
  const requests = state.transferRequests
    .filter((request) => request.shiftId === shiftId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return requests[0] ?? null;
}

function getEffectiveOwnerShiftState(shiftId: string) {
  const request = getLatestRequestForShift(shiftId);
  if (!request) {
    return { request: null, transferredAway: false };
  }

  return {
    request,
    transferredAway: request.status === "transfer_completed"
  };
}

function resolveAcceptedShiftCopies(technicianId: string) {
  return state.transferInvitations
    .filter((invitation) => invitation.candidateId === technicianId && invitation.status === "accepted")
    .map((invitation) => {
      const request = state.transferRequests.find((item) => item.id === invitation.requestId);
      const shift = request ? state.dutyShifts.find((item) => item.id === request.shiftId) : null;
      return request && shift ? { invitation, request, shift } : null;
    })
    .filter(
      (
        item
      ): item is {
        invitation: TechnicianScheduleTransferInvitation;
        request: TechnicianScheduleTransferRequest;
        shift: TechnicianDutyShift;
      } => Boolean(item)
    );
}

function resolveAssignedShiftsForTechnician(technicianId: string) {
  const directShifts = state.dutyShifts.filter((shift) => {
    if (shift.technicianId !== technicianId) {
      return false;
    }

    return !getEffectiveOwnerShiftState(shift.id).transferredAway;
  });

  const acceptedShiftCopies = resolveAcceptedShiftCopies(technicianId).map(({ request, shift, invitation }) => ({
    ...shift,
    id: `${shift.id}__accepted__${invitation.id}`,
    technicianId,
    title: `${shift.title} · 接手班次`,
    shiftLabel: request.status === "transfer_completed" ? "已接手" : "待生效"
  }));

  return [...directShifts, ...acceptedShiftCopies];
}

function hasTechnicianConflict(technicianId: string, shift: TechnicianDutyShift, ignoredInvitationId?: string) {
  const targetRange = intervalToRange(shift);

  const shiftConflict = resolveAssignedShiftsForTechnician(technicianId).some((assignedShift) => {
    if (assignedShift.id === shift.id) {
      return false;
    }

    if (assignedShift.date !== shift.date) {
      return false;
    }

    return overlapsRange(intervalToRange(assignedShift), targetRange);
  });

  if (shiftConflict) {
    return true;
  }

  const bookingConflict = state.bookings.some((booking) => {
    if (booking.technicianId !== technicianId || booking.date !== shift.date) {
      return false;
    }

    return overlapsRange(intervalToRange(booking), targetRange);
  });

  if (bookingConflict) {
    return true;
  }

  const customEventConflict = state.customEvents.some((event) => {
    if (event.technicianId !== technicianId || event.date !== shift.date || !isBlockingCustomEvent(event.kind)) {
      return false;
    }

    return overlapsRange(intervalToRange(event), targetRange);
  });

  if (customEventConflict) {
    return true;
  }

  return state.transferInvitations.some((invitation) => {
    if (invitation.id === ignoredInvitationId || invitation.candidateId !== technicianId || invitation.status !== "accepted") {
      return false;
    }

    const invitationRequest = state.transferRequests.find((item) => item.id === invitation.requestId);
    const invitationShift = invitationRequest ? state.dutyShifts.find((item) => item.id === invitationRequest.shiftId) : null;
    if (!invitationShift || invitationShift.date !== shift.date) {
      return false;
    }

    return overlapsRange(intervalToRange(invitationShift), targetRange);
  });
}

function refreshRequestStatus(requestId: string) {
  const requestIndex = state.transferRequests.findIndex((request) => request.id === requestId);
  if (requestIndex === -1) {
    return;
  }

  const request = state.transferRequests[requestIndex];
  if (request.status === "transfer_cancelled") {
    return;
  }

  const invitations = getRequestInvitations(request.id);
  const acceptedCount = invitations.filter((invitation) => invitation.status === "accepted").length;
  const pendingCount = invitations.filter((invitation) => invitation.status === "pending").length;
  const nextStatus =
    acceptedCount >= request.requestedCount
      ? "transfer_completed"
      : pendingCount === 0
        ? "transfer_failed"
        : "transfer_pending";

  state.transferRequests[requestIndex] = {
    ...request,
    status: nextStatus,
    updatedAt: nowIsoString()
  };
}

export function useTechnicianScheduleStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getTechnicianScheduleStoreSnapshot() {
  return getSnapshot();
}

export function saveTechnicianScheduleEvent(input: SaveTechnicianScheduleEventInput) {
  hydrate();
  const now = nowIsoString();

  if (input.id) {
    state.customEvents = state.customEvents.map((event) =>
      event.id === input.id
        ? {
            ...event,
            ...input,
            updatedAt: now
          }
        : event
    );
    notify();
    return input.id;
  }

  const nextId = generateId("tech-event");
  state.customEvents = [
    ...state.customEvents,
    {
      ...input,
      id: nextId,
      createdAt: now,
      updatedAt: now
    }
  ];
  notify();
  return nextId;
}

export function deleteTechnicianScheduleEvent(eventId: string) {
  hydrate();
  const beforeLength = state.customEvents.length;
  state.customEvents = state.customEvents.filter((event) => event.id !== eventId);
  if (state.customEvents.length !== beforeLength) {
    notify();
  }
}

export function createTechnicianScheduleTransferRequest(input: CreateTechnicianScheduleTransferRequestInput) {
  hydrate();
  const shift = state.dutyShifts.find((item) => item.id === input.shiftId);

  if (!shift || shift.technicianId !== input.requesterId || shift.storeId !== input.storeId) {
    return null;
  }

  const existingRequest = getLatestRequestForShift(shift.id);
  if (existingRequest && (existingRequest.status === "transfer_pending" || existingRequest.status === "transfer_completed")) {
    return existingRequest.id;
  }

  const sameStoreCandidateIds = technicians
    .filter((technician) => technician.storeId === input.storeId && technician.id !== input.requesterId)
    .map((technician) => technician.id);
  const uniqueCandidateIds = Array.from(new Set(input.candidateIds)).filter((candidateId) => sameStoreCandidateIds.includes(candidateId));

  if (uniqueCandidateIds.length === 0) {
    return null;
  }

  const requestId = generateId("transfer-request");
  const createdAt = nowIsoString();
  state.transferRequests = [
    ...state.transferRequests,
    {
      id: requestId,
      shiftId: input.shiftId,
      requesterId: input.requesterId,
      storeId: input.storeId,
      requestedCount: Math.max(1, input.requestedCount),
      candidateIds: uniqueCandidateIds,
      status: "transfer_pending",
      createdAt,
      updatedAt: createdAt
    }
  ];
  state.transferInvitations = [
    ...state.transferInvitations,
    ...uniqueCandidateIds.map((candidateId) => ({
      id: generateId("transfer-invite"),
      requestId,
      candidateId,
      status: "pending" as const,
      invitedAt: createdAt
    }))
  ];
  notify();
  return requestId;
}

export function cancelTechnicianScheduleTransferRequest(requestId: string) {
  hydrate();
  const requestIndex = state.transferRequests.findIndex((request) => request.id === requestId);
  if (requestIndex === -1) {
    return false;
  }

  const request = state.transferRequests[requestIndex];
  if (request.status !== "transfer_pending") {
    return false;
  }

  state.transferRequests[requestIndex] = {
    ...request,
    status: "transfer_cancelled",
    updatedAt: nowIsoString()
  };
  state.transferInvitations = state.transferInvitations.map((invitation) =>
    invitation.requestId === requestId && invitation.status === "pending"
      ? {
          ...invitation,
          status: "cancelled",
          respondedAt: nowIsoString()
        }
      : invitation
  );
  notify();
  return true;
}

export function respondToTechnicianScheduleTransferInvitation(
  invitationId: string,
  action: "accept" | "reject"
): TechnicianScheduleTransferResponseResult {
  hydrate();
  const invitationIndex = state.transferInvitations.findIndex((invitation) => invitation.id === invitationId);
  if (invitationIndex === -1) {
    return { ok: false, message: "转让邀请不存在。" };
  }

  const invitation = state.transferInvitations[invitationIndex];
  const request = state.transferRequests.find((item) => item.id === invitation.requestId);
  const shift = request ? state.dutyShifts.find((item) => item.id === request.shiftId) : null;

  if (!request || !shift) {
    return { ok: false, message: "转让班次已失效。" };
  }

  if (invitation.status !== "pending") {
    return { ok: false, message: "这条邀请已经处理过了。" };
  }

  if (action === "reject") {
    state.transferInvitations[invitationIndex] = {
      ...invitation,
      status: "rejected",
      respondedAt: nowIsoString()
    };
    refreshRequestStatus(request.id);
    notify();
    return { ok: true, message: "已拒绝这次转让邀请。" };
  }

  if (request.status === "transfer_cancelled") {
    state.transferInvitations[invitationIndex] = {
      ...invitation,
      status: "cancelled",
      respondedAt: nowIsoString()
    };
    notify();
    return { ok: false, message: "这次转让已经取消。" };
  }

  const acceptedCount = getRequestInvitations(request.id).filter((item) => item.status === "accepted").length;
  if (acceptedCount >= request.requestedCount || request.status === "transfer_completed") {
    state.transferInvitations[invitationIndex] = {
      ...invitation,
      status: "failed_capacity",
      respondedAt: nowIsoString()
    };
    notify();
    return { ok: false, message: "接受转让失败：名额已满。" };
  }

  if (hasTechnicianConflict(invitation.candidateId, shift, invitation.id)) {
    state.transferInvitations[invitationIndex] = {
      ...invitation,
      status: "failed_conflict",
      respondedAt: nowIsoString()
    };
    refreshRequestStatus(request.id);
    notify();
    return { ok: false, message: "接受转让失败：当前时间已产生冲突。" };
  }

  state.transferInvitations[invitationIndex] = {
    ...invitation,
    status: "accepted",
    respondedAt: nowIsoString()
  };
  refreshRequestStatus(request.id);
  notify();
  return { ok: true, message: "接受成功，已加入接手名单。" };
}

export function getTechnicianScheduleTransferPreview(shiftId: string) {
  hydrate();
  const request = getLatestRequestForShift(shiftId);
  return request
    ? {
        request,
        invitations: getRequestInvitations(request.id)
      }
    : null;
}

export function getTechnicianShiftConflictState(technicianId: string, shift: TechnicianDutyShift) {
  hydrate();
  return hasTechnicianConflict(technicianId, shift);
}

export function getTechnicianVisibleBookingsForShift(technicianId: string, shiftId: string) {
  hydrate();
  const shift = state.dutyShifts.find((item) => item.id === shiftId);
  if (!shift) {
    return [] as TechnicianScheduleBooking[];
  }

  return state.bookings.filter((booking) => {
    if (booking.technicianId !== technicianId || booking.date !== shift.date) {
      return false;
    }

    return Boolean(intersectRange(intervalToRange(booking), intervalToRange(shift)));
  });
}
