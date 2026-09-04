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
};
