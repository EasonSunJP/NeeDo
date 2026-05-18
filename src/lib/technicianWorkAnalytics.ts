export type TechnicianWorkAnalyticsMode = "store" | "personal";
export type TechnicianWorkAnalyticsPlanType = "availability" | "locked" | "leave";

export type TechnicianWorkAnalyticsEvent = {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "free" | "booked" | "blocked";
  workMode: TechnicianWorkAnalyticsMode;
  title: string;
  place: string;
  customer: string;
  amount: number;
  note: string;
  planType?: TechnicianWorkAnalyticsPlanType;
};

function shiftDate(date: string, offset: number) {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + offset);
  return nextDate.toISOString().slice(0, 10);
}

export function buildTechnicianWorkAnalyticsSeed({
  technicianId,
  storeName,
  customerNames,
  anchorDate
}: {
  technicianId: string;
  storeName: string;
  customerNames: string[];
  anchorDate: string;
}): TechnicianWorkAnalyticsEvent[] {
  const [primaryCustomer = "林 小雨", secondCustomer = "Mia Chen", thirdCustomer = "佐藤 健", fourthCustomer = "高桥 由美"] = customerNames;

  return [
    {
      id: `tech-analytics-store-history-1-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, -5),
      startTime: "11:00",
      endTime: "12:30",
      status: "booked",
      workMode: "store",
      title: "肩颈舒缓 90 分钟",
      place: storeName,
      customer: primaryCustomer,
      amount: 12800,
      note: "门店自动派单，常客按指名奖励结算。"
    },
    {
      id: `tech-analytics-store-locked-1-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, -4),
      startTime: "14:00",
      endTime: "15:30",
      status: "blocked",
      workMode: "store",
      title: "门店培训锁档",
      place: storeName,
      customer: "内部安排",
      amount: 0,
      note: "店铺统一安排培训，暂停对外派单。",
      planType: "locked"
    },
    {
      id: `tech-analytics-personal-history-1-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, -4),
      startTime: "21:00",
      endTime: "22:30",
      status: "booked",
      workMode: "personal",
      title: "酒店夜间舒缓",
      place: "新宿御苑周边",
      customer: secondCustomer,
      amount: 15200,
      note: "退勤后个人接单，独立结算。"
    },
    {
      id: `tech-analytics-store-history-2-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, -2),
      startTime: "18:30",
      endTime: "20:00",
      status: "booked",
      workMode: "store",
      title: "深层放松 90 分钟",
      place: storeName,
      customer: thirdCustomer,
      amount: 9800,
      note: "门店预约，含到店加时 30 分钟。"
    },
    {
      id: `tech-analytics-personal-history-2-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, -2),
      startTime: "20:30",
      endTime: "22:00",
      status: "booked",
      workMode: "personal",
      title: "上门肩颈调理",
      place: "品川区高轮",
      customer: primaryCustomer,
      amount: 16800,
      note: "老客复约，已包含夜间加价。"
    },
    {
      id: `tech-analytics-store-today-booked-${technicianId}`,
      staffId: technicianId,
      date: anchorDate,
      startTime: "13:00",
      endTime: "14:30",
      status: "booked",
      workMode: "store",
      title: "午间门店护理",
      place: storeName,
      customer: fourthCustomer,
      amount: 13800,
      note: "午间高峰自动派单，履约状态正常。"
    },
    {
      id: `tech-analytics-store-today-availability-${technicianId}`,
      staffId: technicianId,
      date: anchorDate,
      startTime: "16:00",
      endTime: "18:00",
      status: "free",
      workMode: "store",
      title: "店铺可接单空档",
      place: storeName,
      customer: "待分配",
      amount: 0,
      note: "门店保留的当日补单时段。",
      planType: "availability"
    },
    {
      id: `tech-analytics-personal-today-booked-${technicianId}`,
      staffId: technicianId,
      date: anchorDate,
      startTime: "20:00",
      endTime: "21:30",
      status: "booked",
      workMode: "personal",
      title: "退勤后私人预约",
      place: "港区六本木",
      customer: secondCustomer,
      amount: 15800,
      note: "个人工单，客户已提前确认支付方式。"
    },
    {
      id: `tech-analytics-personal-today-availability-${technicianId}`,
      staffId: technicianId,
      date: anchorDate,
      startTime: "22:00",
      endTime: "23:30",
      status: "free",
      workMode: "personal",
      title: "个人开放接单时段",
      place: "新宿 / 涩谷可上门",
      customer: "待确认",
      amount: 0,
      note: "保留给熟客或临时加单。",
      planType: "availability"
    },
    {
      id: `tech-analytics-store-future-booked-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, 1),
      startTime: "12:00",
      endTime: "13:30",
      status: "booked",
      workMode: "store",
      title: "午后门店预约",
      place: storeName,
      customer: primaryCustomer,
      amount: 11800,
      note: "已确认预约，等待到店履约。"
    },
    {
      id: `tech-analytics-personal-future-booked-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, 2),
      startTime: "21:00",
      endTime: "22:30",
      status: "booked",
      workMode: "personal",
      title: "熟客加钟预约",
      place: "中央区月岛",
      customer: thirdCustomer,
      amount: 17200,
      note: "熟客提前锁定的晚间时段。"
    },
    {
      id: `tech-analytics-store-future-availability-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, 3),
      startTime: "18:30",
      endTime: "20:30",
      status: "free",
      workMode: "store",
      title: "晚高峰候补时段",
      place: storeName,
      customer: "待分配",
      amount: 0,
      note: "门店留作临时补位。",
      planType: "availability"
    },
    {
      id: `tech-analytics-store-future-locked-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, 4),
      startTime: "11:00",
      endTime: "14:00",
      status: "blocked",
      workMode: "store",
      title: "店内物料盘点",
      place: storeName,
      customer: "门店安排",
      amount: 0,
      note: "盘点与设备维护期间暂停出单。",
      planType: "locked"
    },
    {
      id: `tech-analytics-personal-future-leave-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, 5),
      startTime: "19:00",
      endTime: "23:00",
      status: "blocked",
      workMode: "personal",
      title: "个人休息",
      place: "自行安排",
      customer: "不接单",
      amount: 0,
      note: "预留给休息与复盘，不开放新预约。",
      planType: "leave"
    },
    {
      id: `tech-analytics-personal-future-availability-${technicianId}`,
      staffId: technicianId,
      date: shiftDate(anchorDate, 6),
      startTime: "20:00",
      endTime: "22:00",
      status: "free",
      workMode: "personal",
      title: "周末个人开放档",
      place: "池袋 / 文京周边",
      customer: "待确认",
      amount: 0,
      note: "周末熟客优先的个人工作时段。",
      planType: "availability"
    }
  ];
}
