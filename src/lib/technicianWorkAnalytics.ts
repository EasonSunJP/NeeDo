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

export function getFormalTechnicianWorkAnalyticsEvents(_input: {
  technicianId: string;
  storeName: string;
  customerNames: string[];
  anchorDate: string;
}): TechnicianWorkAnalyticsEvent[] {
  return [];
}
