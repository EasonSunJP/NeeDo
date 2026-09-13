// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { AdminLayout } from "./AdminLayout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  orders: vi.fn(),
  shops: vi.fn(),
  technicians: vi.fn()
}));
const authState = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("../../api/backofficeRealData", () => ({
  backofficeRealDataApi: {
    orders: apiMocks.orders,
    shops: apiMocks.shops,
    technicians: apiMocks.technicians
  }
}));

vi.mock("../../features/platform-user-management/api", () => ({
  platformUserManagementApi: { listUsers: apiMocks.listUsers }
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    canAccessMenu: () => true,
    hasPermission: (permission: string) => authState.permissions.has(permission),
    session: null
  })
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function changeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitSearch(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>(".admin-sidebar-search input");
  expect(input).not.toBeNull();
  await act(async () => changeValue(input!, value));
  await act(async () => {
    input!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement;
let root: Root;

describe("AdminLayout global search", () => {
  beforeEach(() => {
    localStorage.setItem("needo.language", "zh");
    localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    authState.permissions = new Set([
      "backoffice:orders:list",
      "backoffice:users:read",
      "backoffice:shops:list",
      "backoffice:technicians:list"
    ]);
    apiMocks.orders.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 5 });
    apiMocks.listUsers.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 5 });
    apiMocks.shops.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 5 });
    apiMocks.technicians.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 5 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens the existing order detail route when an exact order number is submitted", async () => {
    apiMocks.orders.mockResolvedValue({
      list: [{ id: 3926, orderNo: "ND202609101341243926", customerName: "山田葵", shopName: "Need Salon" }],
      total: 1,
      page: 1,
      page_size: 5
    });
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/admin/orders?status=inService"]}>
        <I18nProvider><AdminLayout><LocationProbe /></AdminLayout></I18nProvider>
      </MemoryRouter>
    ));

    await submitSearch(container, " ND202609101341243926 ");

    expect(apiMocks.orders).toHaveBeenCalledWith("backoffice", {
      keyword: "ND202609101341243926",
      page: 1,
      pageSize: 5
    });
    expect(apiMocks.listUsers).toHaveBeenCalledWith("operations", {
      keyword: "ND202609101341243926",
      page: 1,
      page_size: 5
    });
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/admin/orders?keyword=ND202609101341243926&orderId=3926"
    );
  });

  it("shows grouped formal results and opens the existing shop detail flow", async () => {
    apiMocks.listUsers.mockResolvedValue({
      list: [{ id: 41, needoId: "u0000000041", displayName: "青山 花", email: "aoyama@example.test" }],
      total: 1,
      page: 1,
      page_size: 5
    });
    apiMocks.shops.mockResolvedValue({
      list: [{ id: 17, name: "青山ケア", city: "東京都港区", ownerEmail: "owner@example.test" }],
      total: 1,
      page: 1,
      page_size: 5
    });
    apiMocks.technicians.mockResolvedValue({
      list: [{ id: 29, needoId: "s0000000029", displayName: "青山 太郎", email: "tech@example.test", shopName: "青山ケア" }],
      total: 1,
      page: 1,
      page_size: 5
    });
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/admin"]}>
        <I18nProvider><AdminLayout><LocationProbe /></AdminLayout></I18nProvider>
      </MemoryRouter>
    ));

    await submitSearch(container, "青山");

    expect(container.textContent).toContain("搜索结果");
    expect(container.textContent).toContain("青山 花");
    expect(container.textContent).toContain("青山ケア");
    expect(container.textContent).toContain("青山 太郎");
    const shopResult = container.querySelector<HTMLButtonElement>('[data-global-search-kind="shop"]');
    expect(shopResult).not.toBeNull();
    await act(async () => shopResult!.click());
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/admin/merchants?keyword=%E9%9D%92%E5%B1%B1&detailShopId=17"
    );
  });

  it("does not query result categories the operator cannot read", async () => {
    authState.permissions = new Set(["backoffice:orders:list"]);
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/admin"]}>
        <I18nProvider><AdminLayout><LocationProbe /></AdminLayout></I18nProvider>
      </MemoryRouter>
    ));

    await submitSearch(container, "青山");

    expect(apiMocks.orders).toHaveBeenCalledTimes(1);
    expect(apiMocks.listUsers).not.toHaveBeenCalled();
    expect(apiMocks.shops).not.toHaveBeenCalled();
    expect(apiMocks.technicians).not.toHaveBeenCalled();
  });
});
