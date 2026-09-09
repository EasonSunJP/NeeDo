export type UnifiedServiceInfoCardData = {
  id: string;
  coverUrl: string | null;
  name: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number | null;
  usageCount: number | null;
  engagementTarget?: {
    targetType: "service" | "technician_service";
    publicId: string;
  } | null;
  favoriteCount?: number | null;
  shareCount?: number | null;
  isFavorited?: boolean;
  isBookable?: boolean | null;
  distanceKm?: number | null;
  shopPublicId: string | null;
  shopAddress: string | null;
  description: string | null;
  tags: string[];
  catalogPriceAmount?: number | null;
  serviceModeLabel?: string | null;
};

export type ExchangeIntelligenceServiceCardProjection = {
  targetType: "shop_service" | "technician_service";
  publicId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  imageUrls: string[];
  tags: string[];
  catalogPriceJpy: number;
  campaignPriceJpy: number;
  currency: "JPY";
  durationMinutes: number;
  serviceMode: "store" | "onsite" | "flexible";
  shopPublicId: string;
  shopAddress: string;
  detailPath: string;
};

export type TechnicianServiceBookingContextServiceCardProjection = Omit<
  ExchangeIntelligenceServiceCardProjection,
  "campaignPriceJpy"
> & {
  targetType: "technician_service";
  serviceAreas: string[];
};
