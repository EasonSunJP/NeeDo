// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantsPage } from "./MerchantsPage";
import { TechniciansPage } from "./TechniciansPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const api = vi.hoisted(() => ({ services: vi.fn(), shops: vi.fn(), technicians: vi.fn(), technician: vi.fn() }));
const categories = vi.hoisted(() => vi.fn());
vi.mock("../../api/backofficeRealData", async (original) => ({ ...await original<typeof import("../../api/backofficeRealData")>(), backofficeRealDataApi: api }));
vi.mock("../../features/core-read/api", async (original) => ({ ...await original<typeof import("../../features/core-read/api")>(), coreReadApi: { listCategories: categories } }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }), useOptionalI18n: () => ({ language: "zh" }) }));
vi.mock("../../components/admin/FormalProfileDetailPanels", () => ({ FormalTechnicianDetailPanel: ({ detail }: { detail: { displayName: string } }) => <div data-technician-detail>{detail.displayName}</div> }));

const service = { id: 51, shopId: 7, categoryId: 1, name: "正式服务", city: "Tokyo", serviceMode: "store", status: "published", priceAmount: 8000, durationMinutes: 60, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
const page = (list: unknown[], current = 1, total = list.length) => ({ list, page: current, total, page_size: 100 });

describe("ranking embedded detail drawers", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    categories.mockResolvedValue(page([{ id: 1, name: "正式分类", isActive: true }]));
    api.shops.mockResolvedValue(page([]));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("loads a service beyond the first page into the existing drawer without mounting the merchant workspace", async () => {
    api.services.mockResolvedValueOnce(page([{ ...service, id: 99 }], 1, 101)).mockResolvedValueOnce(page([service], 2, 101));
    const close = vi.fn();
    const router = createMemoryRouter([{ path: "*", element: <MerchantsPage embeddedDetail={{ id: 51, type: "service", onClose: close }} /> }], { initialEntries: ["/admin?city=Tokyo"] });
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(api.services).toHaveBeenNthCalledWith(2, "backoffice", { page: 2, pageSize: 100 });
    expect(api.shops).not.toHaveBeenCalled();
    expect(container.textContent).toContain("服务项目详情");
    expect(container.textContent).not.toContain("店铺与商家管理");
    expect([...container.querySelectorAll("input")].some((input) => input.value === service.name)).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click());
    expect(close).toHaveBeenCalledOnce();
    expect(router.state.location.search).toBe("?city=Tokyo");
    router.dispose();
  });

  it("keeps a failed service request visible and retries in the drawer", async () => {
    api.services.mockRejectedValueOnce(new Error("没有查看服务的权限")).mockResolvedValueOnce(page([service]));
    const router = createMemoryRouter([{ path: "*", element: <MerchantsPage embeddedDetail={{ id: 51, type: "service", onClose: vi.fn() }} /> }], { initialEntries: ["/admin"] });
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("没有查看服务的权限");
    await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect([...container.querySelectorAll("input")].some((input) => input.value === service.name)).toBe(true);
    router.dispose();
  });

  it("loads technician detail directly and closes without modifying the dashboard URL", async () => {
    api.technician.mockResolvedValue({ id: 31, displayName: "正式技师", city: "Tokyo", status: "published" });
    const close = vi.fn();
    const router = createMemoryRouter([{ path: "*", element: <TechniciansPage embeddedDetail={{ id: 31, onClose: close }} /> }], { initialEntries: ["/admin?city=Tokyo"] });
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(api.technician).toHaveBeenCalledWith("backoffice", 31);
    expect(api.technicians).not.toHaveBeenCalled();
    expect(container.querySelector('[data-technician-detail]')?.textContent).toBe("正式技师");
    expect(container.textContent).not.toContain("技师管理");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click());
    expect(close).toHaveBeenCalledOnce();
    expect(router.state.location.search).toBe("?city=Tokyo");
    router.dispose();
  });
});
