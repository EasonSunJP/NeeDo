export const SHOP_SERVICE_LIMIT = 20;

export function canAddShopService(currentCount: number) {
  return currentCount < SHOP_SERVICE_LIMIT;
}
