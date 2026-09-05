export type UnifiedServiceInfoCardData = {
  id: string;
  coverUrl: string | null;
  name: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number | null;
  usageCount: number | null;
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
