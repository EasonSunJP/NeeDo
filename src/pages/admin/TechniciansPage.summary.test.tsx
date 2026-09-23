// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TechniciansPage } from "./TechniciansPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const api = vi.hoisted(() => ({ shops: vi.fn(), technicians: vi.fn(), technicianSummary: vi.fn(), inviteTechnicianApplicant: vi.fn() }));
vi.mock("../../api/backofficeRealData", async (original) => ({ ...await original<typeof import("../../api/backofficeRealData")>(), backofficeRealDataApi: api }));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));
vi.mock("../../components/admin/AdminLayout", () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/admin/TechnicianListModule", () => ({
  TechnicianListModule: ({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) =>
    <div data-testid="technician-list">{`${page}/${total}`}<button onClick={() => onPageChange(page + 1)}>下一页</button><button onClick={() => onPageChange(11)}>第11页</button></div>
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  api.shops.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
  api.technicians.mockImplementation(async (_scope, query: { page: number }) => ({ list: [], total: 137, page: query.page, page_size: 10 }));
  api.technicianSummary.mockResolvedValue({ total: 137, pendingReview: 4, activeToday: 9, date: "2026-09-23", timeZone: "Asia/Tokyo" });
  api.inviteTechnicianApplicant.mockResolvedValue({ id: 11, status: "draft" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});

it("opens a new technician invitation form and submits an existing user and shop", async () => {
  api.shops.mockResolvedValue({ list: [{ id: 7, name: "东京店", status: "published" }], total: 1, page: 1, page_size: 100 });
  const router = createMemoryRouter([{ path: "*", element: <TechniciansPage /> }], { initialEntries: ["/admin/technicians"] });
  await act(async () => root.render(<RouterProvider router={router} />));
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "新建技师");
  expect(button).toBeTruthy();
  await act(async () => button!.click());
  expect(container.textContent).toContain("技师申请邀请");
  const userInput = container.querySelector<HTMLInputElement>('input[name="userNeedoId"]')!;
  const shopSelect = container.querySelector<HTMLSelectElement>('select[name="targetShopId"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(userInput, "user0000000003");
    userInput.dispatchEvent(new Event("input", { bubbles: true }));
    shopSelect.value = "7";
    shopSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(userInput.value).toBe("user0000000003");
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "创建申请草稿")!.click());
  expect(api.inviteTechnicianApplicant).toHaveBeenCalledWith({ userNeedoId: "user0000000003", targetShopId: 7 });
  router.dispose();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it("shows authoritative cross-shop counts and requests the next ten technicians", async () => {
  const router = createMemoryRouter([{ path: "*", element: <TechniciansPage /> }], { initialEntries: ["/admin/technicians"] });
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(container.textContent).toContain("全部技师137");
  expect(container.textContent).toContain("待审核技师4");
  expect(container.textContent).toContain("今日活跃9");
  expect(container.textContent).toContain("自由排班日程");
  expect(api.technicians).toHaveBeenCalledWith("backoffice", expect.objectContaining({ page: 1, pageSize: 10 }));
  await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="technician-list"] button')!.click());
  expect(api.technicians).toHaveBeenCalledWith("backoffice", expect.objectContaining({ page: 2, pageSize: 10 }));
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[data-testid="technician-list"] button')][1]!.click());
  expect(api.technicians).toHaveBeenCalledWith("backoffice", expect.objectContaining({ page: 11, pageSize: 10 }));
  router.dispose();
});
