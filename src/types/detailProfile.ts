export type DetailRoleType = "technician" | "user" | "shop";

export type DetailBadgeTone = "primary" | "success" | "warning" | "danger" | "neutral";

export type DetailPaymentMethod = "cash" | "offline" | "platform";

export type DetailBadge = {
  label: string;
  tone?: DetailBadgeTone;
};

export type DetailGalleryImage = {
  src: string;
  alt: string;
  category?: string;
};

export type DetailInfoRow = {
  label: string;
  value: string;
};

export type DetailTextBlock = {
  title: string;
  content: string;
};

export type DetailReviewSummary = {
  scoreLabel: string;
  score?: number;
  reviewCount: number;
  reviewUnitLabel: string;
  tags: string[];
  recentSummary?: string;
};

export type DetailAvailabilityTone = "available" | "limited" | "busy" | "offline" | "neutral";

export type DetailAvailabilityItem = {
  id: string;
  dateLabel: string;
  weekdayLabel: string;
  statusLabel: string;
  tone: DetailAvailabilityTone;
  meta?: string;
  caption?: string;
};

export type DetailAvailabilityPreview = {
  title: string;
  caption?: string;
  actionLabel?: string;
  footer?: string;
  items: DetailAvailabilityItem[];
};

export type ShopCoreInfoItem = {
  label: string;
  value: string;
  caption?: string;
};

export type ShopServiceItem = {
  id: string;
  name: string;
  summary: string;
  priceLabel: string;
  durationLabel?: string;
  tags: string[];
};

export type DetailTeamMember = {
  id: string;
  name: string;
  subtitle: string;
  avatar: string;
  score?: number;
  reviewCount?: number;
  tags: string[];
};

export type ShopMapInfo = {
  address: string;
  access: string;
  nearestStation?: string;
  landmark?: string;
};

export type BusinessHourSlot = {
  label: string;
  open: string;
  close: string;
};

export interface BaseDetailProfile {
  id: string;
  roleType: DetailRoleType;
  displayName: string;
  subtitle: string;
  galleryImages: DetailGalleryImage[];
  summaryBadges: DetailBadge[];
  introBlocks: DetailTextBlock[];
  tags: string[];
  reviewSummary: DetailReviewSummary;
}

export interface PersonalDetailProfile extends BaseDetailProfile {
  roleType: "technician" | "user";
  avatar?: string;
  scoreLabel: string;
  score?: number;
  reviewCount: number;
  reviewLabel: string;
  locationLabel: string;
  statusBadges: DetailBadge[];
  quickBadges: DetailBadge[];
  availabilityPreview: DetailAvailabilityPreview;
  basicInfoRows: DetailInfoRow[];
  capabilityTitle: string;
  capabilityRows: DetailInfoRow[];
}

export interface ShopDetailProfile extends BaseDetailProfile {
  roleType: "shop";
  scoreLabel: string;
  score?: number;
  reviewCount: number;
  reviewLabel: string;
  priceSummary: string;
  categories: string[];
  openStatusLabel: string;
  businessHours: BusinessHourSlot[];
  coreInfoItems: ShopCoreInfoItem[];
  detailInfoRows: DetailInfoRow[];
  serviceItems: ShopServiceItem[];
  teamMembers: DetailTeamMember[];
  mapInfo: ShopMapInfo;
}

export type DetailProfile = PersonalDetailProfile | ShopDetailProfile;
