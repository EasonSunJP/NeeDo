import { parseBrowserStorageJson, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { isMerchantGroup, type MerchantAccountCard } from "../features/merchant-saas-billing/model";

export const merchantAdminPreviewStorageKey = "needo.merchant-admin.read-only-preview";
export const merchantAdminPreviewShopHeader = "X-NeeDo-Merchant-Preview-Shop-Id";

export type MerchantAdminPreviewShop = {
  id: number;
  name: string;
};

export type MerchantAdminPreview = {
  version: 1;
  subjectType: "merchant_account" | "shop";
  subjectId: number;
  subjectName: string;
  selectedShopId: number;
  shops: MerchantAdminPreviewShop[];
  returnTo: string;
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/admin/") ? value : "/admin/merchants";
}

function normalizePreview(value: unknown): MerchantAdminPreview | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MerchantAdminPreview>;
  const shops = Array.isArray(candidate.shops)
    ? candidate.shops.filter(
        (shop): shop is MerchantAdminPreviewShop =>
          Boolean(shop && isPositiveInteger(shop.id) && typeof shop.name === "string" && shop.name.trim())
      )
    : [];

  if (
    candidate.version !== 1 ||
    (candidate.subjectType !== "merchant_account" && candidate.subjectType !== "shop") ||
    !isPositiveInteger(candidate.subjectId) ||
    typeof candidate.subjectName !== "string" ||
    !candidate.subjectName.trim() ||
    !isPositiveInteger(candidate.selectedShopId) ||
    !shops.some((shop) => shop.id === candidate.selectedShopId)
  ) {
    return null;
  }

  return {
    version: 1,
    subjectType: candidate.subjectType,
    subjectId: candidate.subjectId,
    subjectName: candidate.subjectName.trim(),
    selectedShopId: candidate.selectedShopId,
    shops,
    returnTo: normalizeReturnTo(candidate.returnTo)
  };
}

export function getMerchantAdminPreview(): MerchantAdminPreview | null {
  return normalizePreview(
    parseBrowserStorageJson<unknown>(merchantAdminPreviewStorageKey, null, {
      kind: "session",
      removeOnError: true,
      silent: true
    })
  );
}

export function startMerchantAdminPreview(
  card: MerchantAccountCard,
  returnTo = "/admin/merchants",
  selectedShopId?: number,
): MerchantAdminPreview | null {
  const shops = isMerchantGroup(card)
    ? card.shops.map((shop) => ({ id: shop.id, name: shop.name }))
    : [{ id: card.id, name: card.name }];
  const firstShop = shops[0];

  if (!firstShop) return null;

  const preview: MerchantAdminPreview = {
    version: 1,
    subjectType: isMerchantGroup(card) ? "merchant_account" : "shop",
    subjectId: card.id,
    subjectName: card.name,
    selectedShopId: shops.some((shop) => shop.id === selectedShopId) ? selectedShopId! : firstShop.id,
    shops,
    returnTo: normalizeReturnTo(returnTo)
  };

  writeBrowserStorage(merchantAdminPreviewStorageKey, JSON.stringify(preview), {
    kind: "session",
    silent: true
  });
  return preview;
}

export function openMerchantAdminPreviewWindow(
  openWindow: (url: string, target: string) => Window | null = (url, target) => window.open(url, target),
) {
  const opened = openWindow("/pf-admin.html#/merchant-admin", "_blank");
  if (!opened) return false;
  try {
    opened.opener = null;
  } catch {
    // The preview is already protected by its same-origin session and backend read-only guard.
  }
  return true;
}

export function setMerchantAdminPreviewShop(shopId: number): MerchantAdminPreview | null {
  const current = getMerchantAdminPreview();
  if (!current || !current.shops.some((shop) => shop.id === shopId)) return current;

  const next = { ...current, selectedShopId: shopId };
  writeBrowserStorage(merchantAdminPreviewStorageKey, JSON.stringify(next), {
    kind: "session",
    silent: true
  });
  return next;
}

export function clearMerchantAdminPreview() {
  removeBrowserStorage(merchantAdminPreviewStorageKey, { kind: "session", silent: true });
}
