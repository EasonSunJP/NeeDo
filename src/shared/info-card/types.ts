import type { DetailProfile } from "../../types/detailProfile";
import type { Customer, Store, StoreCardTagStyle, Technician } from "../../types/domain";

export type InfoCardEntityType = "user" | "technician" | "shop";

export type InfoCardVariant = "nearby" | "list" | "compact" | "share" | "detailHeader";

export type InfoCardTone = "success" | "warning" | "neutral" | "accent";

export type InfoCardRatingType = "服务评分" | "店铺评分" | "信用值" | "信用度";

export type InfoCardBadge = {
  label: string;
  tone?: InfoCardTone;
};

export type InfoCardMetric = {
  label: string;
  value: string;
  tone?: InfoCardTone;
};

export type InfoCardUiConfig = {
  coverHeight?: string;
  tagStyle?: StoreCardTagStyle;
  cta?: string;
};

export interface BaseInfoCardData {
  id: string;
  entityType: InfoCardEntityType;
  coverImage?: string;
  avatar?: string;
  displayName: string;
  subtitle?: string;
  region?: string;
  serviceArea?: string;
  status?: string;
  isBookable?: boolean;
  isOnline?: boolean;
  rating?: number;
  ratingType?: InfoCardRatingType;
  reviewCount?: number;
  tags: string[];
  priceLabel?: string;
  actionButtons?: string[];
  badgeList: InfoCardBadge[];
  shareable?: boolean;
  favoriteStatus?: boolean;
  description?: string;
  metaLines?: string[];
  nextAvailability?: string;
  metricList?: InfoCardMetric[];
  highlightChips?: string[];
  detailPath?: string;
  cardUi?: InfoCardUiConfig;
}

export interface TechnicianInfoCardData extends BaseInfoCardData {
  entityType: "technician";
  gender?: string;
  age?: string;
  serviceTypes?: string[];
  languages?: string[];
  supportForeigner?: boolean;
  paymentMethods?: string[];
  prepayRequired?: boolean;
  minUserCreditScore?: string;
  intro?: string;
  schedulePreview?: string[];
  workStyleTags?: string[];
  acceptanceRate?: number;
  cancelRate?: number;
}

export interface UserInfoCardData extends BaseInfoCardData {
  entityType: "user";
  gender?: string;
  intro?: string;
  contactActions?: string[];
}

export interface ShopInfoCardData extends BaseInfoCardData {
  entityType: "shop";
  shopCategory?: string;
  businessHours?: string;
  averagePrice?: string;
  startPrice?: string;
  languages?: string[];
  supportForeigner?: boolean;
  paymentMethods?: string[];
  reservable?: boolean;
  intro?: string;
  technicianCount?: number;
  serviceCategories?: string[];
  addressSummary?: string;
}

export type InfoCardData = UserInfoCardData | TechnicianInfoCardData | ShopInfoCardData;

export type InfoCardEntitySource =
  | { store: Store; technicians?: Technician[] }
  | { customer: Customer }
  | { technician: Technician }
  | { detail: DetailProfile };
