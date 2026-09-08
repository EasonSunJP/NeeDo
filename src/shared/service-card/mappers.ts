import type { CoreServiceCard, CoreServiceDetail } from "../../features/core-read/api";
import type { TechnicianServicePayload } from "../../features/pricing-mode/api";
import type { ServiceItem, Store, StoreMenuConfig, Technician } from "../../types/domain";
import type { UnifiedServiceInfoCardData } from "./model";

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter((value): value is string => value !== null)));
}

function normalizeAmount(value: number | string) {
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function isStoreProvider(provider?: Store | Technician): provider is Store {
  return Boolean(provider && "address" in provider && "systemId" in provider);
}

function formalShopPublicId(provider?: Store | Technician) {
  if (!isStoreProvider(provider)) {
    return null;
  }

  return /^shop\d{10}$/.test(provider.systemId) ? provider.systemId : null;
}

export function mapCoreServiceCardToUnifiedData(service: CoreServiceCard | CoreServiceDetail): UnifiedServiceInfoCardData {
  return {
    id: String(service.id),
    coverUrl: normalizeText(service.coverUrl) ?? normalizeText(service.shop.coverUrl),
    name: service.name,
    priceAmount: normalizeAmount(service.priceAmount),
    currency: service.currency,
    durationMinutes: service.durationMinutes,
    usageCount: service.usageCount,
    shopPublicId: normalizeText(service.shop.publicId),
    shopAddress: normalizeText(service.shop.address),
    description: normalizeText(service.description),
    tags: uniqueStrings([
      service.category.name,
      service.city,
      ...service.reviewSummary.highlights
    ]).slice(0, 8)
  };
}

export function mapTechnicianServiceToUnifiedData(service: TechnicianServicePayload): UnifiedServiceInfoCardData {
  return {
    id: String(service.id),
    coverUrl: normalizeText(service.coverImageUrl) ?? normalizeText(service.images[0]),
    name: service.name,
    priceAmount: normalizeAmount(service.priceAmount),
    currency: service.currency,
    durationMinutes: service.durationMinutes,
    usageCount: service.usageCount,
    shopPublicId: normalizeText(service.shop?.publicId),
    shopAddress: normalizeText(service.shop?.address),
    description: normalizeText(service.description),
    tags: uniqueStrings(service.tags).slice(0, 8)
  };
}

export function mapServiceItemToUnifiedData(service: ServiceItem, provider?: Store | Technician): UnifiedServiceInfoCardData {
  return {
    id: service.id,
    coverUrl: normalizeText(service.cover),
    name: service.name,
    priceAmount: normalizeAmount(service.priceFrom),
    currency: service.formal?.currency ?? "JPY",
    durationMinutes: service.formal?.durationMinutes ?? service.packages[0]?.durationMinutes ?? null,
    usageCount: service.formal?.usageCount ?? null,
    shopPublicId: normalizeText(service.formal?.shopPublicId) ?? formalShopPublicId(provider),
    shopAddress: normalizeText(service.formal?.shopAddress) ?? (isStoreProvider(provider) ? normalizeText(provider.address) : null),
    description: normalizeText(service.summary),
    tags: uniqueStrings(service.tags).slice(0, 8)
  };
}

export function mapStoreMenuConfigToUnifiedData(menu: StoreMenuConfig, store: Store): UnifiedServiceInfoCardData {
  const priceMatch = menu.priceLabel.match(/\d[\d,]*/u)?.[0];
  const durationMatch = menu.duration.match(/\d+/u)?.[0];

  return {
    id: normalizeText(menu.sourceServiceId) ?? menu.id,
    coverUrl: normalizeText(menu.cover),
    name: menu.name,
    priceAmount: normalizeAmount(priceMatch?.replaceAll(",", "") ?? 0),
    currency: "JPY",
    durationMinutes: durationMatch ? Number(durationMatch) : null,
    usageCount: null,
    shopPublicId: formalShopPublicId(store),
    shopAddress: normalizeText(store.address),
    description: normalizeText(menu.subtitle),
    tags: uniqueStrings(menu.tags).slice(0, 8)
  };
}
