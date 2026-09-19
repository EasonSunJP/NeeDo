import type {
  BackofficeServicePayload,
  PaginatedApiPayload
} from "../../api/backofficeRealData";

type MerchantShopServicePageLoader = (query: {
  page: number;
  pageSize: number;
}) => Promise<PaginatedApiPayload<BackofficeServicePayload>>;

function isCurrentShopService(service: BackofficeServicePayload) {
  return service.technicianProfileId === null && service.status !== "archived";
}

export async function loadCurrentMerchantShopServices(
  loadPage: MerchantShopServicePageLoader,
  pageSize = 100
): Promise<BackofficeServicePayload[]> {
  const services: BackofficeServicePayload[] = [];

  for (let page = 1; ; page += 1) {
    const response = await loadPage({ page, pageSize });
    services.push(...response.list.filter(isCurrentShopService));
    if (page * response.page_size >= response.total || response.list.length === 0) break;
  }

  return services;
}
