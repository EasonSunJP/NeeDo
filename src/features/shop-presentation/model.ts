import type {
  ShopPresentationContent,
  ShopPresentationLocalePayload,
  ShopPresentationWorkspacePayload
} from "../../api/backofficeRealData";
import { normalizeStorePresentationConfig } from "../../lib/storePresentation";
import type { Store, StoreMenuConfig } from "../../types/domain";

export function mergeUploadedCarouselImage({
  images,
  formalMediaUrls,
  uploadedUrl,
  replaceIndex
}: {
  images: readonly string[];
  formalMediaUrls: ReadonlySet<string>;
  uploadedUrl: string;
  replaceIndex?: number;
}): string[] {
  const candidates = replaceIndex === undefined
    ? [...images, uploadedUrl]
    : images.map((image, index) => index === replaceIndex ? uploadedUrl : image);
  if (replaceIndex !== undefined && !candidates.includes(uploadedUrl)) {
    candidates.push(uploadedUrl);
  }
  return [...new Set(candidates.filter((image) => image === uploadedUrl || formalMediaUrls.has(image)))].slice(0, 5);
}

export function applyShopPresentationLocale(
  baseStore: Store,
  locale: ShopPresentationLocalePayload,
  media: ShopPresentationWorkspacePayload["media"],
  services: ShopPresentationWorkspacePayload["services"]
): Store {
  const content = locale.content;
  const existingMenus = baseStore.presentation?.menuCards ?? [];
  const carousel = content.carousel.flatMap((item) => {
    const url = media[item.mediaAssetPublicId]?.url;
    return url ? [{ url, altText: item.altText }] : [];
  });
  const images = carousel.map((item) => item.url);
  const menuCards: StoreMenuConfig[] = content.serviceMenus.map((item) => {
    const serviceId = String(item.serviceId);
    const existing = existingMenus.find((menu) => menu.sourceServiceId === serviceId);
    const service = services.find((candidate) => candidate.id === item.serviceId);
    const price = service ? Number(service.priceAmount) : Number.NaN;
    return {
      id: existing?.id ?? `shop-service-${serviceId}`,
      sourceServiceId: serviceId,
      name: item.name,
      subtitle: item.description,
      duration: service ? `${service.durationMinutes} 分钟` : existing?.duration ?? "",
      priceLabel: service && Number.isFinite(price)
        ? new Intl.NumberFormat("ja-JP", { style: "currency", currency: service.currency, maximumFractionDigits: 0 }).format(price)
        : existing?.priceLabel ?? "",
      audience: item.audience,
      tags: item.tags,
      cover: item.coverMediaAssetPublicId ? media[item.coverMediaAssetPublicId]?.url ?? existing?.cover ?? baseStore.cover : existing?.cover ?? baseStore.cover,
      highlights: item.highlights
    };
  });
  const nextPresentation = normalizeStorePresentationConfig({
    ...baseStore.presentation,
    subtitle: content.subtitle,
    galleryCaptions: carousel.map((item) => item.altText),
    distance: content.distance,
    station: content.station,
    access: content.routeGuide,
    parking: content.parking,
    routeGuide: content.routeGuide,
    paymentMethods: content.paymentMethods,
    equipment: content.equipment,
    menuCards
  });
  return {
    ...baseStore,
    name: content.storeName,
    description: content.description,
    address: content.address,
    area: content.area,
    rankLabel: content.rankLabel,
    businessHours: content.businessHours,
    cover: images[0] ?? baseStore.cover,
    gallery: images.length ? images : baseStore.gallery,
    presentation: nextPresentation
  };
}

export function buildShopPresentationContent(
  store: Store,
  mediaPublicIdByUrl: ReadonlyMap<string, string>,
  fallbackImageUrls: ReadonlySet<string> = new Set()
): ShopPresentationContent {
  const presentation = normalizeStorePresentationConfig(store.presentation);
  const carousel = (store.gallery.length ? store.gallery : [store.cover]).slice(0, 5).flatMap((url, index) => {
    const mediaAssetPublicId = mediaPublicIdByUrl.get(url);
    if (!mediaAssetPublicId && fallbackImageUrls.has(url)) return [];
    if (!mediaAssetPublicId) throw new Error("error.shop_presentation.media_invalid");
    return [{ mediaAssetPublicId, altText: presentation.galleryCaptions?.[index]?.trim() || store.name }];
  });
  const serviceMenus = (presentation.menuCards ?? []).slice(0, 5).map((menu) => {
    const serviceId = Number(menu.sourceServiceId);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      throw new Error("error.shop_presentation.service_invalid");
    }
    const coverMediaAssetPublicId = mediaPublicIdByUrl.get(menu.cover) ?? null;
    return {
      serviceId,
      name: menu.name.trim(),
      description: menu.subtitle.trim(),
      audience: menu.audience.trim(),
      tags: menu.tags.map((item) => item.trim()).filter(Boolean).slice(0, 10),
      highlights: menu.highlights.map((item) => item.trim()).filter(Boolean).slice(0, 10),
      coverMediaAssetPublicId
    };
  });
  return {
    storeName: store.name.trim(),
    description: store.description.trim(),
    address: store.address.trim(),
    area: store.area.trim(),
    rankLabel: store.rankLabel.trim(),
    businessHours: store.businessHours.trim(),
    subtitle: presentation.subtitle.trim(),
    station: presentation.station.trim(),
    distance: presentation.distance.trim(),
    parking: presentation.parking.trim(),
    routeGuide: presentation.routeGuide.trim(),
    paymentMethods: presentation.paymentMethods.map((item) => item.trim()).filter(Boolean).slice(0, 10),
    equipment: presentation.equipment.map((item) => item.trim()).filter(Boolean).slice(0, 10),
    carousel,
    serviceMenus
  };
}
