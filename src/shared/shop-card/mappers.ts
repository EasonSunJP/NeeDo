import type {
  CoreShopCard,
  CoreShopDetail,
} from "../../features/core-read/api";
import type { Store } from "../../types/domain";
import { mapStoreToUnifiedEntityData } from "../profile-card/unifiedEntityMappers";
import type { UnifiedShopInfoCardData } from "./model";

export function mapCoreShopToUnifiedData(
  shop: CoreShopCard | CoreShopDetail,
): UnifiedShopInfoCardData {
  const detail = "services" in shop ? shop : null;
  return {
    kind: "shop",
    id: shop.publicId,
    name: shop.name,
    imageUrl: shop.coverUrl,
    description: detail?.description ?? null,
    address: shop.address,
    languages: [],
    tags: [...shop.serviceCategories, ...shop.businessKeywords]
      .map((tag) => tag.label)
      .slice(0, 8),
    rating: Number.parseFloat(shop.reviewSummary.ratingAverage),
    reviewCount: shop.reviewSummary.reviewCount,
    distanceKm: shop.distanceKm ?? null,
    favoriteCount: shop.favoriteCount,
    shareCount: shop.shareCount,
    engagementTarget: { targetType: "shop", publicId: shop.publicId },
  };
}

export function mapStoreToUnifiedShopData(
  store: Store,
): UnifiedShopInfoCardData {
  return mapStoreToUnifiedEntityData(store) as UnifiedShopInfoCardData;
}
