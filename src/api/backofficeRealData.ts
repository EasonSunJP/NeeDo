import { httpClient } from "./httpClient";
import type { Metric, Merchant, Order, OrderStatus, Settlement, Store, Technician } from "../types/domain";
import { formatSystemId } from "../lib/systemIds";

export type BackofficeScope = "backoffice" | "merchant-admin";

export interface BackofficeOrderPayload {
  id: number;
  orderNo: string;
  status: string;
  paymentStatus: "unpaid";
  customerUserId: number;
  customerName: string;
  serviceId: number;
  serviceName: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  fulfillmentMode: "home" | "store" | string;
  priceAmount: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackofficeScheduleSlotPayload {
  id: number;
  serviceId: number;
  serviceName: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
}

export interface BackofficeFinanceSettlementPayload {
  id: number;
  transactionId: number;
  transactionNo: string;
  referenceType: string;
  referenceId: number;
  status: string;
  currency: string;
  expectedAmount: number;
  actualAmount: number;
  differenceAmount: number;
  exportedAt: string | null;
  createdAt: string;
}

export interface BackofficeTechnicianPayload {
  id: number;
  userId: number;
  displayName: string;
  email: string;
  shopId: number | null;
  shopName: string | null;
  city: string;
  serviceArea: string | null;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface BackofficeShopPayload {
  id: number;
  ownerUserId: number | null;
  ownerEmail: string | null;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  status: string;
  isRecommended: boolean;
  createdAt: string;
}

export interface BackofficeDashboardPayload {
  metrics: Metric[];
  orders: BackofficeOrderPayload[];
  schedule: {
    total: number;
    available: number;
    booked: number;
  };
  finance: {
    grossAmount: number;
    pendingSettlementAmount: number;
    refundAmount: number;
  };
  technicians: BackofficeTechnicianPayload[];
  shops: BackofficeShopPayload[];
}

export interface PaginatedApiPayload<TItem> {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface CsvExportPayload {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  content: string;
}

type ListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  from?: string;
  to?: string;
};

const scopePrefix = (scope: BackofficeScope) => (scope === "merchant-admin" ? "/merchant-admin" : "/backoffice");

export const backofficeRealDataApi = {
  dashboard(scope: BackofficeScope) {
    return httpClient.request<BackofficeDashboardPayload>(`${scopePrefix(scope)}/dashboard`);
  },
  orders(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeOrderPayload>>(`${scopePrefix(scope)}/orders`, {
      query
    });
  },
  schedule(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeScheduleSlotPayload>>(`${scopePrefix(scope)}/schedule`, {
      query
    });
  },
  financeSettlements(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeFinanceSettlementPayload>>(`${scopePrefix(scope)}/finance/settlements`, {
      query
    });
  },
  exportFinanceSettlements(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<CsvExportPayload>(`${scopePrefix(scope)}/finance/settlements/export`, {
      query
    });
  },
  technicians(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeTechnicianPayload>>(`${scopePrefix(scope)}/technicians`, {
      query
    });
  },
  shops(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeShopPayload>>(`${scopePrefix(scope)}/shops`, {
      query
    });
  },
  merchantShop() {
    return httpClient.request<PaginatedApiPayload<BackofficeShopPayload>>("/merchant-admin/shop");
  }
};

export function mapBackofficeOrder(row: BackofficeOrderPayload): Order {
  return {
    id: String(row.id),
    orderNo: row.orderNo,
    mode: row.fulfillmentMode === "home" ? "home" : "store",
    status: normalizeOrderStatus(row.status),
    customerId: String(row.customerUserId),
    customerName: row.customerName,
    itemName: row.serviceName,
    storeName: row.shopName,
    technicianName: row.technicianName ?? undefined,
    city: "",
    area: "",
    amount: row.priceAmount,
    paymentStatus: row.paymentStatus,
    bookedAt: formatDateTime(row.startsAt),
    createdAt: formatDateTime(row.createdAt),
    source: "web",
    remark: row.note ?? row.cancelReason ?? undefined
  };
}

export function mapBackofficeSettlement(row: BackofficeFinanceSettlementPayload): Settlement {
  const platformFee = Math.max(0, row.actualAmount - row.expectedAmount);

  return {
    id: String(row.id),
    merchantName: row.referenceType === "booking_order" ? `Booking #${row.referenceId}` : row.referenceType,
    period: formatDateTime(row.createdAt).slice(0, 10),
    grossAmount: row.actualAmount,
    platformFee,
    refundAmount: row.differenceAmount < 0 ? Math.abs(row.differenceAmount) : 0,
    payableAmount: row.actualAmount - platformFee,
    status: row.status === "exported" ? "paid" : "pending"
  };
}

export function mapBackofficeTechnician(row: BackofficeTechnicianPayload): Technician {
  return {
    id: `tech-${row.id}`,
    systemId: formatSystemId("b", row.id),
    name: row.displayName,
    storeId: row.shopId ? `store-${row.shopId}` : "",
    role: "therapist",
    status: row.status === "published" ? "available" : "off",
    rating: 0,
    orderCount: 0,
    income: 0,
    skills: [],
    serviceAreas: row.serviceArea ? row.serviceArea.split(",").map((item) => item.trim()).filter(Boolean) : [],
    acceptRate: 0,
    cancelRate: 0,
    reviewCount: 0,
    languages: ["日本語"],
    avatar: "/images/generated/profiles/profile-12.jpg",
    accountUsername: row.email,
    identityLabel: row.shopId ? "店铺所属技师" : "个人技师"
  };
}

export function mapBackofficeStore(row: BackofficeShopPayload): Store {
  return {
    id: `store-${row.id}`,
    systemId: formatSystemId("s", row.id),
    merchantId: row.ownerUserId ? `merchant-${row.ownerUserId}` : "merchant-unassigned",
    name: row.name,
    accountUsername: row.ownerEmail ?? undefined,
    area: row.city,
    address: row.address,
    rating: 0,
    reviewCount: 0,
    priceLabel: "NDP",
    tags: [row.city, row.status].filter(Boolean),
    openStatus: row.status === "published" ? "open" : "resting",
    nextSlot: "",
    cover: "/images/generated/home-merchant-feature.jpg",
    gallery: [],
    description: "",
    rankLabel: row.isRecommended ? "Recommended" : "Standard",
    businessHours: "",
    mode: "store"
  };
}

export function mapBackofficeMerchant(row: BackofficeShopPayload): Merchant {
  return {
    id: `merchant-shop-${row.id}`,
    name: row.name,
    status: row.status === "published" ? "active" : "pending",
    categories: [],
    city: row.city,
    commissionRate: 0,
    settlementCycle: "NDP",
    documents: [row.ownerEmail ?? "未绑定账号"]
  };
}

function normalizeOrderStatus(status: string): OrderStatus {
  if (status === "in_service") {
    return "inService";
  }

  if (status === "confirmed" || status === "inService" || status === "completed" || status === "cancelled" || status === "pending") {
    return status as OrderStatus;
  }

  return "pending";
}

function formatDateTime(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
