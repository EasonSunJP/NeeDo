import type { Customer, Store, Technician } from "../../types/domain";
import type { UnifiedEntityInfoCardData } from "./UnifiedEntityInfoCard";

export const mapStoreToUnifiedEntityData = (
  store: Store,
): UnifiedEntityInfoCardData => ({
  kind: "shop",
  id: store.systemId || store.id,
  name: store.name,
  imageUrl: store.gallery[0] || store.cover || null,
  description: store.description || store.rankLabel || null,
  address: store.address || null,
  languages: [],
  tags: store.tags,
  rating: store.rating,
  reviewCount: store.reviewCount,
  distanceKm: store.distanceKm ?? null,
  favoriteCount: store.favoriteCount ?? null,
  shareCount: store.shareCount ?? null,
  engagementTarget: /^shop\d{10}$/u.test(store.systemId)
    ? { targetType: "shop", publicId: store.systemId }
    : null,
});

export const mapTechnicianToUnifiedEntityData = (
  technician: Technician,
): UnifiedEntityInfoCardData => ({
  kind: "technician",
  id: technician.systemId || technician.id,
  name: technician.nickname?.trim() || technician.name,
  imageUrl: technician.gallery?.[0] || technician.avatar || null,
  description:
    technician.bio || technician.profileTags?.slice(0, 2).join(" / ") || null,
  languages: technician.languages,
  tags: technician.profileTags ?? technician.skills,
  rating: technician.rating,
  completedOrderCount: technician.orderCount,
  distanceKm: technician.distanceKm ?? null,
  favoriteCount: technician.favoriteCount ?? null,
  shareCount: technician.shareCount ?? null,
  engagementTarget: /^s\d{10}$/u.test(technician.systemId)
    ? { targetType: "technician", publicId: technician.systemId }
    : null,
  specialReviewTags: technician.specialReviewTags ?? [],
});

export const mapCustomerToUnifiedEntityData = (
  customer: Customer,
): UnifiedEntityInfoCardData => ({
  kind: "user",
  id: customer.systemId || customer.id,
  name: customer.nickname?.trim() || customer.name,
  imageUrl: customer.avatar || null,
  description: customer.bio || null,
  languages: customer.languages ?? [],
  tags: [],
});
