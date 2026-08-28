import type {
  Campaign,
  Customer,
  FieldJob,
  InventoryItem,
  Merchant,
  Order,
  Review,
  Schedule,
  ServiceCategory,
  ServiceItem,
  Settlement,
  Store,
  Technician
} from "../types/domain";

/**
 * Honest empty states used while a formal API capability has no records.
 * These exports intentionally contain no fabricated accounts or business data.
 */
export const emptyCampaigns: Campaign[] = [];
export const emptyCustomers: Customer[] = [];
export const emptyFieldJobs: FieldJob[] = [];
export const emptyInventoryItems: InventoryItem[] = [];
export const emptyMerchants: Merchant[] = [];
export const emptyOrders: Order[] = [];
export const emptyReviews: Review[] = [];
export const emptySchedules: Schedule[] = [];
export const emptyServiceCategories: ServiceCategory[] = [];
export const emptyServices: ServiceItem[] = [];
export const emptySettlements: Settlement[] = [];
export const emptyStores: Store[] = [];
export const emptyTechnicians: Technician[] = [];
export const emptyTrendData: Array<{ label: string; revenue: number; orders: number; users: number }> = [];

export type TechnicianMomentPost = {
  id: string;
  technicianId: string;
  technicianName: string;
  role: string;
  postedAt: string;
  location: string;
  visibility: "公开" | "仅关注者" | "仅预约客户";
  content: string;
  images: string[];
  serviceTitle: string;
  servicePrice: number;
  likes: number;
  likedUsers: string[];
  comments: Array<{ id: string; userName: string; content: string; at: string }>;
  status: "visible" | "reviewing" | "hidden";
};

export const emptyTechnicianMoments: TechnicianMomentPost[] = [];

const brandFallback = "/icons/icon-192-v7.png";

/** Brand artwork only; never represents a user, shop, order, or service record. */
export const formalMediaFallback = {
  appliance: brandFallback,
  cafe: brandFallback,
  care: brandFallback,
  cleanBase: brandFallback,
  cleaning: brandFallback,
  cleaningAlt: brandFallback,
  cleaningPortrait: brandFallback,
  home: brandFallback,
  laundry: brandFallback,
  massage: brandFallback,
  massageAlt: brandFallback,
  moving: brandFallback,
  nail: brandFallback,
  nailAtelier: brandFallback,
  pet: brandFallback,
  petGrooming: brandFallback,
  repair: brandFallback,
  repairAlt: brandFallback,
  restaurant: brandFallback,
  salon: brandFallback,
  tutor: brandFallback
} as const;
