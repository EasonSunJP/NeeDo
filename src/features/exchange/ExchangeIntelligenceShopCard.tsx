import type { Language } from "../../i18n/translations";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { getScopedProfileDetailPath } from "../../shared/profile-detail/paths";
import { UnifiedShopInfoCard, type UnifiedShopInfoCardData } from "../../shared/shop-card";
import { exchangeText } from "./i18n";
import type { ExchangePost } from "./types";

function publicAreaSummary(post: ExchangePost) {
  const areas = post.intelligence?.serviceAreas
    .map((area) => area.trim())
    .filter(Boolean) ?? [];
  return Array.from(new Set(areas)).slice(0, 3).join(" · ") || null;
}

function shopCardData(post: ExchangePost, language: Language): UnifiedShopInfoCardData | null {
  const shop = post.intelligence?.publisherCard;
  if (!shop || shop.type !== "shop") return null;
  const rating = shop.ratingAverage === null ? null : Number.parseFloat(shop.ratingAverage);
  const ratingTag = rating !== null && Number.isFinite(rating) ? `★ ${rating.toFixed(1)}` : null;
  return {
    kind: "shop",
    id: shop.publicId,
    name: shop.name,
    imageUrl: shop.coverUrl ?? shop.imageUrls[0] ?? shop.avatarUrl,
    description: exchangeText(shop.isBookable ? "bookable" : "currentUnavailable", language),
    address: publicAreaSummary(post),
    languages: [],
    tags: [exchangeText(shop.serviceMode, language), ratingTag].filter((tag): tag is string => Boolean(tag)),
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
        density="compact"
        detailTo={getScopedProfileDetailPath(context, "shop", shop.publicId)}
        language={language}
        showMetrics={false}
      />
    </div>
  );
}
