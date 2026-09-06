import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { loadEveryScopedOrder } from "../scheduling/window-loader";

export async function loadFormalMerchantHome() {
  const dashboard = await backofficeRealDataApi.dashboard("merchant-admin", { period: "today" });
  const from = `${dashboard.filter.from}T00:00:00+09:00`;
  const to = new Date(new Date(`${dashboard.filter.to}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const orders = await loadEveryScopedOrder({ from, to, dateMode: "overlaps" });
  return { dashboard, orders: orders.filter((order) => order.status !== "cancelled") };
}
