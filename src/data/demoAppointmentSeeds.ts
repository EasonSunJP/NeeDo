import type { DispatchArrangement } from "../features/dispatch-center/domain";
import type {
  TechnicianDutyShift,
  TechnicianScheduleBooking,
  TechnicianScheduleCustomEvent,
  TechnicianScheduleSyncTarget
} from "../features/technician-schedule/model";
import type { Customer, Order, Store, Technician } from "../types/domain";

export const demoAppointmentSeedStartDate = "2026-05-01";
export const demoAppointmentSeedEndDate = "2026-07-31";
export const demoAppointmentSeedStoreId = "store-1";
export const demoAppointmentSeedCustomerId = "cus-1";
export const demoAppointmentSeedTechnicianId = "tech-1";
export const demoAppointmentOrderIdPrefix = "ord-demo-appt-";
export const demoAppointmentArrangementIdPrefix = "arrangement-demo-appt-";
export const demoTechnicianBookingIdPrefix = "booking-demo-appt-";
export const demoTechnicianDutyShiftIdPrefix = "duty-demo-appt-";
export const demoTechnicianCustomEventIdPrefix = "event-demo-appt-";

const demoAppointmentReferenceDate = "2026-05-24";

type DemoAppointmentSeedInput = {
  customers: Customer[];
  store?: Store | null;
  technicians: Technician[];
};

type DemoAppointmentSpec = {
  id: string;
  sequence: number;
  orderNo: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  serviceName: string;
  serviceMode: Order["mode"];
  customerId: string;
  customerName: string;
  storeId: string;
  storeName: string;
  technicianId: string | null;
  technicianName: string | null;
  area: string;
  amount: number;
  paymentStatus: Order["paymentStatus"];
  orderStatus: Order["status"];
  arrangementStatus: DispatchArrangement["status"];
  source: Order["source"];
  roomLabel: string;
  address: string;
  note: string;
  internalNote: string;
  eventType: TechnicianScheduleBooking["eventType"];
};

const demoServiceSeeds = [
  { name: "门店肩颈深层舒缓", duration: 60, amount: 9800, mode: "store" as const },
  { name: "门店睡眠放松护理", duration: 75, amount: 11800, mode: "store" as const },
  { name: "上门肩颈舒缓按摩", duration: 90, amount: 12800, mode: "home" as const },
  { name: "门店芳疗放松", duration: 60, amount: 10800, mode: "store" as const },
  { name: "上门经络护理", duration: 120, amount: 18800, mode: "home" as const },
  { name: "门店足底护理", duration: 60, amount: 8800, mode: "store" as const },
  { name: "门店热石护理", duration: 75, amount: 14800, mode: "store" as const },
  { name: "上门运动恢复", duration: 90, amount: 15800, mode: "home" as const }
];

const demoAreas = ["银座", "日本桥", "丸之内", "新宿", "六本木", "有乐町", "东京站", "涩谷"];
const demoRooms = ["Bed A", "Bed B", "Bed C", "Bed D", "VIP Room", "Couple Room"];
const demoSources: Order["source"][] = ["app", "web", "line", "partner"];
const demoNotes = [
  "老客复购，偏好同一位担当。",
  "需要中文沟通，服务前确认力度。",
  "来店前希望收到楼层和门铃提示。",
  "酒店上门，前台登记姓名需要提前发送。",
  "初次预约，需先电话确认身体状态。",
  "企业客户，结束后需要电子收据。",
  "情侣同行，尽量安排相邻房间。",
  "深夜预约，请预留到店引导时间。"
];

const monthlySpikeSlots: Record<string, Array<{ time: string; count: number }>> = {
  "2026-05-15": [
    { time: "10:15", count: 12 },
    { time: "15:45", count: 10 },
    { time: "20:15", count: 15 }
  ],
  "2026-06-15": [
    { time: "11:15", count: 10 },
    { time: "14:45", count: 12 },
    { time: "20:30", count: 15 }
  ],
  "2026-07-15": [
    { time: "10:45", count: 11 },
    { time: "16:15", count: 13 },
    { time: "21:15", count: 10 }
  ]
};

function padNumber(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function formatDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${padNumber(date.getUTCMonth() + 1)}-${padNumber(date.getUTCDate())}`;
}

function enumerateDateKeys(startDate: string, endDate: string) {
  const [startYear = "2026", startMonth = "1", startDay = "1"] = startDate.split("-");
  const [endYear = "2026", endMonth = "1", endDay = "1"] = endDate.split("-");
  const cursor = new Date(Date.UTC(Number(startYear), Number(startMonth) - 1, Number(startDay)));
  const end = new Date(Date.UTC(Number(endYear), Number(endMonth) - 1, Number(endDay)));
  const dates: string[] = [];

  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function getWeekday(dateKey: string) {
  const [year = "2026", month = "1", day = "1"] = dateKey.split("-");
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
}

function addMinutesToTime(time: string, minutes: number) {
  const [hour = "0", minute = "0"] = time.split(":");
  const total = Number(hour) * 60 + Number(minute) + minutes;
  return `${padNumber(Math.floor(total / 60))}:${padNumber(total % 60)}`;
}

function getDailySlots(dateKey: string) {
  const weekday = getWeekday(dateKey);

  if (weekday === 0) {
    return ["11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00"];
  }

  if (weekday === 3) {
    return ["12:00", "13:30", "15:00", "18:00", "19:30", "21:00"];
  }

  if (weekday === 5 || weekday === 6) {
    return ["10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00", "22:15"];
  }

  return ["10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00"];
}

function getBaseSlotCount(dateKey: string, slotIndex: number) {
  const day = Number(dateKey.slice(-2));
  const month = Number(dateKey.slice(5, 7));
  const weekday = getWeekday(dateKey);
  const evening = slotIndex >= getDailySlots(dateKey).length - 3;
  const weekendBoost = weekday === 5 || weekday === 6 ? 1 : 0;
  const eveningBoost = evening && (day + slotIndex + month) % 2 === 0 ? 1 : 0;
  const regular = 1 + ((day + slotIndex + month) % 3 === 0 ? 1 : 0);

  if (weekday === 3 && slotIndex < 2) {
    return Math.max(1, regular - 1);
  }

  return Math.min(4, regular + weekendBoost + eveningBoost);
}

function pickItem<T>(items: T[], index: number, fallback: T): T {
  return items.length > 0 ? items[index % items.length] ?? fallback : fallback;
}

function getSeedStore(store?: Store | null): Store {
  return store ?? {
    id: demoAppointmentSeedStoreId,
    systemId: "S-DEMO",
    merchantId: "merchant-1",
    name: "GINZA Calm Body Lab",
    area: "银座",
    address: "東京都中央区銀座3-4-12",
    rating: 4.72,
    reviewCount: 1286,
    priceLabel: "¥8,000-¥15,000",
    tags: [],
    openStatus: "open",
    nextSlot: "今日 19:30",
    cover: "",
    gallery: [],
    description: "",
    rankLabel: "",
    businessHours: "11:00-23:00",
    mode: "store"
  };
}

function getSeedCustomers(customers: Customer[]) {
  const demoCustomer = customers.find((customer) => customer.id === demoAppointmentSeedCustomerId) ?? customers[0];

  return {
    demoCustomer,
    pool: customers.length > 0 ? customers : demoCustomer ? [demoCustomer] : []
  };
}

function getSeedTechnicians(store: Store, technicians: Technician[]) {
  const storeTechnicians = technicians.filter((technician) => technician.storeId === store.id || technician.relatedStoreIds?.includes(store.id));
  const demoTechnician = storeTechnicians.find((technician) => technician.id === demoAppointmentSeedTechnicianId) ?? storeTechnicians[0] ?? technicians[0];

  return {
    demoTechnician,
    storeTechnicians: storeTechnicians.length > 0 ? storeTechnicians : demoTechnician ? [demoTechnician] : []
  };
}

function shouldLeaveUnassigned(date: string, sequence: number, slotIndex: number, collisionIndex: number, isSpike: boolean) {
  if (date < demoAppointmentReferenceDate) {
    return false;
  }

  if (isSpike) {
    return collisionIndex % 4 === 0 || (collisionIndex > 8 && sequence % 3 === 0);
  }

  return sequence % 5 === 0 || (slotIndex % 4 === 0 && collisionIndex === 0) || (date.endsWith("05") && slotIndex % 2 === 0);
}

function getOrderStatus(date: string, technicianId: string | null, sequence: number): Order["status"] {
  if (date < demoAppointmentReferenceDate) {
    return "completed";
  }

  if (date === demoAppointmentReferenceDate && technicianId && sequence % 7 === 0) {
    return "inService";
  }

  if (!technicianId) {
    return sequence % 4 === 0 ? "unpaid" : "pending";
  }

  return sequence % 6 === 0 ? "confirmed" : "scheduled";
}

function getArrangementStatus(date: string, technicianId: string | null, orderStatus: Order["status"]): DispatchArrangement["status"] {
  if (date < demoAppointmentReferenceDate) {
    return "completed";
  }

  if (orderStatus === "inService") {
    return "inService";
  }

  return technicianId ? "confirmed" : "pending";
}

function getPaymentStatus(orderStatus: Order["status"], technicianId: string | null, sequence: number): Order["paymentStatus"] {
  if (orderStatus === "unpaid") {
    return "unpaid";
  }

  if (!technicianId && sequence % 3 === 0) {
    return "unpaid";
  }

  return sequence % 4 === 0 ? "depositPaid" : "paid";
}

function getBookingEventType(sequence: number): TechnicianScheduleBooking["eventType"] {
  if (sequence % 41 === 0) {
    return "extension";
  }

  if (sequence % 37 === 0) {
    return "reschedule";
  }

  return "booking";
}

function buildAppointmentSpec(
  input: DemoAppointmentSeedInput,
  sequence: number,
  date: string,
  startTime: string,
  slotIndex: number,
  collisionIndex: number,
  isSpike: boolean
): DemoAppointmentSpec | null {
  const store = getSeedStore(input.store);
  const { demoCustomer, pool: customers } = getSeedCustomers(input.customers);
  const { demoTechnician, storeTechnicians } = getSeedTechnicians(store, input.technicians);

  if (!demoCustomer || !demoTechnician || storeTechnicians.length === 0) {
    return null;
  }

  const day = Number(date.slice(-2));
  const serviceSeed = pickItem(demoServiceSeeds, sequence + slotIndex + collisionIndex, demoServiceSeeds[0]);
  const durationMinutes = Math.min(135, serviceSeed.duration + (sequence % 6 === 0 ? 15 : 0));
  const customer =
    sequence % 9 === 0 || (isSpike && collisionIndex === 1)
      ? demoCustomer
      : pickItem(customers, sequence + day + slotIndex, demoCustomer);
  const unassigned = shouldLeaveUnassigned(date, sequence, slotIndex, collisionIndex, isSpike);
  const technician = unassigned
    ? null
    : sequence % 5 === 0
      ? demoTechnician
      : pickItem(storeTechnicians, sequence + slotIndex + collisionIndex, demoTechnician);
  const orderStatus = getOrderStatus(date, technician?.id ?? null, sequence);
  const serviceName = `${serviceSeed.name} ${durationMinutes} 分钟`;
  const id = `${demoAppointmentOrderIdPrefix}${padNumber(sequence, 4)}`;
  const area = serviceSeed.mode === "store" ? store.area : pickItem(demoAreas, sequence + day, store.area);
  const spikeNote = isSpike ? "同一时段集中预约，用于测试并发预约展示。" : "";
  const note = [spikeNote, pickItem(demoNotes, sequence, demoNotes[0])].filter(Boolean).join(" ");

  return {
    id,
    sequence,
    orderNo: `ND${date.replace(/-/g, "")}${padNumber(70000 + sequence, 5)}`,
    date,
    startTime,
    endTime: addMinutesToTime(startTime, durationMinutes),
    durationMinutes,
    serviceName,
    serviceMode: serviceSeed.mode,
    customerId: customer.id,
    customerName: customer.name,
    storeId: store.id,
    storeName: store.name,
    technicianId: technician?.id ?? null,
    technicianName: technician?.name ?? null,
    area,
    amount: serviceSeed.amount + (sequence % 5) * 700 + (isSpike ? 1200 : 0),
    paymentStatus: getPaymentStatus(orderStatus, technician?.id ?? null, sequence),
    orderStatus,
    arrangementStatus: getArrangementStatus(date, technician?.id ?? null, orderStatus),
    source: pickItem(demoSources, sequence + slotIndex, "app"),
    roomLabel: serviceSeed.mode === "store" ? pickItem(demoRooms, sequence + slotIndex, "Bed A") : "用户约定地点",
    address: serviceSeed.mode === "store" ? `${store.name} · ${pickItem(demoRooms, sequence + slotIndex, "Bed A")}` : `${area} · 上门地址已确认`,
    note,
    internalNote: isSpike ? "并发预约压力测试：同一开始时间多笔预约。" : sequence % 13 === 0 ? "优先确认语言和到店方式。" : "",
    eventType: getBookingEventType(sequence)
  };
}

function buildDemoAppointmentSpecs(input: DemoAppointmentSeedInput) {
  const specs: DemoAppointmentSpec[] = [];
  let sequence = 1;

  enumerateDateKeys(demoAppointmentSeedStartDate, demoAppointmentSeedEndDate).forEach((date) => {
    getDailySlots(date).forEach((startTime, slotIndex) => {
      const count = getBaseSlotCount(date, slotIndex);
      for (let collisionIndex = 0; collisionIndex < count; collisionIndex += 1) {
        const spec = buildAppointmentSpec(input, sequence, date, startTime, slotIndex, collisionIndex, false);
        if (spec) {
          specs.push(spec);
          sequence += 1;
        }
      }
    });

    (monthlySpikeSlots[date] ?? []).forEach((slot, slotIndex) => {
      for (let collisionIndex = 0; collisionIndex < slot.count; collisionIndex += 1) {
        const spec = buildAppointmentSpec(input, sequence, date, slot.time, slotIndex + 20, collisionIndex, true);
        if (spec) {
          specs.push(spec);
          sequence += 1;
        }
      }
    });
  });

  return specs.sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime) || left.sequence - right.sequence);
}

export function buildDemoAppointmentTestOrders(input: DemoAppointmentSeedInput): Order[] {
  return buildDemoAppointmentSpecs(input).map((spec): Order => ({
    id: spec.id,
    orderNo: spec.orderNo,
    mode: spec.serviceMode,
    status: spec.orderStatus,
    customerId: spec.customerId,
    customerName: spec.customerName,
    itemName: spec.serviceName,
    storeName: spec.storeName,
    technicianName: spec.technicianName ?? undefined,
    city: "东京",
    area: spec.area,
    amount: spec.amount,
    paymentStatus: spec.paymentStatus,
    bookedAt: `${spec.date} ${spec.startTime}`,
    createdAt: `${spec.date} ${addMinutesToTime(spec.startTime, -120)}`,
    source: spec.source,
    remark: spec.note
  }));
}

export function buildDemoAppointmentDispatchArrangements(input: DemoAppointmentSeedInput): DispatchArrangement[] {
  return buildDemoAppointmentSpecs(input).map((spec): DispatchArrangement => ({
    id: `${demoAppointmentArrangementIdPrefix}${padNumber(spec.sequence, 4)}`,
    storeId: spec.storeId,
    orderId: spec.id,
    orderNo: spec.orderNo,
    customerId: spec.customerId,
    customerName: spec.customerName,
    serviceName: spec.serviceName,
    serviceMode: spec.serviceMode,
    date: spec.date,
    startTime: spec.startTime,
    endTime: spec.endTime,
    address: spec.address,
    roomLabel: spec.roomLabel,
    technicianId: spec.technicianId,
    technicianLabel: spec.technicianName,
    status: spec.arrangementStatus,
    note: spec.note,
    internalNote: spec.internalNote,
    amount: spec.amount,
    source: "order"
  }));
}

function buildDemoDutyShifts(input: DemoAppointmentSeedInput): TechnicianDutyShift[] {
  const store = getSeedStore(input.store);
  const { demoTechnician, storeTechnicians } = getSeedTechnicians(store, input.technicians);

  if (!demoTechnician || storeTechnicians.length === 0) {
    return [];
  }

  return enumerateDateKeys(demoAppointmentSeedStartDate, demoAppointmentSeedEndDate).flatMap((date) => {
    const weekday = getWeekday(date);

    return storeTechnicians.flatMap((technician, technicianIndex): TechnicianDutyShift[] => {
      const regularRest = (weekday === 3 && technicianIndex % 3 === 1) || (weekday === 0 && technicianIndex % 4 === 2);
      const demoTechLightRest = technician.id === demoAppointmentSeedTechnicianId && weekday === 3 && Number(date.slice(-2)) % 2 === 0;

      if (regularRest || demoTechLightRest) {
        return [];
      }

      const lateShift = (technicianIndex + Number(date.slice(-2))) % 4 === 0;
      const startTime = lateShift ? "15:00" : weekday === 5 || weekday === 6 ? "12:00" : technicianIndex % 2 === 0 ? "10:00" : "11:00";
      const endTime = lateShift ? "23:00" : weekday === 5 || weekday === 6 ? "22:00" : technicianIndex % 2 === 0 ? "18:00" : "19:00";

      return [{
        id: `${demoTechnicianDutyShiftIdPrefix}${technician.id}-${date}`,
        technicianId: technician.id,
        storeId: store.id,
        date,
        startTime,
        endTime,
        title: `${store.name} 已确认勤务`,
        shiftLabel: lateShift ? "晚班" : weekday === 5 || weekday === 6 ? "周末班" : "日班"
      }];
    });
  });
}

function buildDemoScheduleBookings(input: DemoAppointmentSeedInput): TechnicianScheduleBooking[] {
  return buildDemoAppointmentSpecs(input)
    .filter((spec) => Boolean(spec.technicianId))
    .map((spec): TechnicianScheduleBooking => ({
      id: `${demoTechnicianBookingIdPrefix}${padNumber(spec.sequence, 4)}`,
      technicianId: spec.technicianId as string,
      storeId: spec.storeId,
      date: spec.date,
      startTime: spec.startTime,
      endTime: spec.endTime,
      title: spec.serviceName,
      customerName: spec.customerName,
      amount: spec.amount,
      orderId: spec.id,
      eventType: spec.eventType,
      detailTargetType: "order_detail",
      detailTargetId: spec.id,
      note: spec.note
    }));
}

function buildDemoCustomEvents(input: DemoAppointmentSeedInput): TechnicianScheduleCustomEvent[] {
  const store = getSeedStore(input.store);
  const { demoTechnician, storeTechnicians } = getSeedTechnicians(store, input.technicians);

  if (!demoTechnician) {
    return [];
  }

  const syncStoreTarget: TechnicianScheduleSyncTarget = {
    id: store.id,
    type: "store",
    label: store.name
  };
  const supportTechnician = storeTechnicians.find((technician) => technician.id !== demoTechnician.id) ?? demoTechnician;

  return [
    {
      id: `${demoTechnicianCustomEventIdPrefix}tech-1-may-rest`,
      technicianId: demoTechnician.id,
      storeId: store.id,
      date: "2026-05-28",
      startTime: "13:00",
      endTime: "15:00",
      title: "短休与复盘",
      kind: "rest",
      note: "连续夜班后的恢复时间，不开放新预约。",
      syncTargets: [syncStoreTarget],
      createdAt: "2026-05-01T08:00:00+09:00",
      updatedAt: "2026-05-01T08:00:00+09:00"
    },
    {
      id: `${demoTechnicianCustomEventIdPrefix}tech-1-jun-travel`,
      technicianId: demoTechnician.id,
      storeId: store.id,
      date: "2026-06-15",
      startTime: "18:45",
      endTime: "19:20",
      title: "上门移动",
      kind: "travel",
      note: "从银座移动到日本桥酒店预约。",
      syncTargets: [syncStoreTarget],
      createdAt: "2026-06-01T08:00:00+09:00",
      updatedAt: "2026-06-01T08:00:00+09:00"
    },
    {
      id: `${demoTechnicianCustomEventIdPrefix}tech-1-jul-leave`,
      technicianId: demoTechnician.id,
      storeId: store.id,
      date: "2026-07-08",
      startTime: "10:00",
      endTime: "16:00",
      title: "半日请假",
      kind: "leave",
      note: "上午体检，下午 16:00 后可恢复接单。",
      syncTargets: [syncStoreTarget],
      createdAt: "2026-07-01T08:00:00+09:00",
      updatedAt: "2026-07-01T08:00:00+09:00"
    },
    {
      id: `${demoTechnicianCustomEventIdPrefix}peer-jun-locked`,
      technicianId: supportTechnician.id,
      storeId: store.id,
      date: "2026-06-21",
      startTime: "19:00",
      endTime: "21:00",
      title: "指名客预留",
      kind: "locked",
      note: "熟客电话预约，等待正式下单。",
      syncTargets: [syncStoreTarget],
      createdAt: "2026-06-10T08:00:00+09:00",
      updatedAt: "2026-06-10T08:00:00+09:00"
    }
  ];
}

export function buildDemoTechnicianScheduleSeeds(input: DemoAppointmentSeedInput) {
  return {
    dutyShifts: buildDemoDutyShifts(input),
    bookings: buildDemoScheduleBookings(input),
    customEvents: buildDemoCustomEvents(input)
  };
}
