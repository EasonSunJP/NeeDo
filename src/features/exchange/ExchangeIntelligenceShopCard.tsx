import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { getScopedProfileDetailPath } from "../../shared/profile-detail/paths";
import { UnifiedShopInfoCard, type UnifiedShopInfoCardData } from "../../shared/shop-card";
import { exchangeText } from "./i18n";
import type { ExchangePost } from "./types";

function shopCardData(post: ExchangePost, language: Language): UnifiedShopInfoCardData | null {
  const shop = post.intelligence?.publisherCard;
  if (!shop || shop.type !== "shop") return null;
  const rating = shop.ratingAverage === null ? null : Number.parseFloat(shop.ratingAverage);
  return {
    kind: "shop",
    id: shop.publicId,
    name: shop.name,
    imageUrl: shop.coverUrl ?? shop.imageUrls[0] ?? shop.avatarUrl,
    description: exchangeText(shop.isBookable ? "bookable" : "currentUnavailable", language),
    address: shop.address.trim() || null,
    languages: [],
    tags: [],
    rating: rating !== null && Number.isFinite(rating) ? rating : null,
    reviewCount: shop.reviewCount,
    completedOrderCount: shop.completedOrderCount ?? null,
    favoriteCount: shop.favoriteCount ?? null,
    shareCount: shop.shareCount ?? null,
  };
}

export function ExchangeIntelligenceShopCard({
  context,
  language,
  post,
}: {
  context: MessageCenterContext;
  language: Language;
  post: ExchangePost;
}) {
  const shop = post.intelligence?.publisherCard;
  const data = shopCardData(post, language);
  if (!data || !shop || shop.type !== "shop") return null;
  return (
    <div
      data-no-i18n="true"
      data-testid="exchange-intelligence-shop-card"
      onClick={(event) => event.stopPropagation()}
    >
      <UnifiedShopInfoCard
        data={data}
        detailTo={`${getScopedProfileDetailPath(context, "shop", shop.publicId)}?sourcePostId=${post.id}`}
        language={language}
      />
    </div>
  );
}
