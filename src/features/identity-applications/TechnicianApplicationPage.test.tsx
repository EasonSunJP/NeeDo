// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { TechnicianApplicationPage } from "./TechnicianApplicationPage";
import { identityApplicationsApi } from "./api";
vi.mock("../../theme/ClientThemeProvider", () => ({ useClientTheme: () => ({ isNight: true, theme: "dark" }) }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ refreshSession: vi.fn(), switchPortal: vi.fn() }) }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../components/client-ui/SettingsDirectory", () => ({ SettingsDetailPage: ({ children, navItems }: {children: ReactNode; navItems: unknown[]}) => <main data-navigation-count={navItems.length}>{children}</main> }));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(identityApplicationsApi, "listMine").mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
  vi.spyOn(identityApplicationsApi, "searchShops").mockResolvedValue({ list: [
    { id: 217, merchantId: "shop7507769538", name: "麻布十番", city: "東京", address: "港区", coverUrl: "/media/shop.jpg", rating: 4.7, keywords: ["肩颈调理"] },
    { id: 218, merchantId: "shop1234567890", name: "銀座", city: "東京", address: "中央区", rating: null }
  ], total: 2, page: 1, page_size: 20 });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
it("uses standalone formal shop cards, same-size single selectors and a floating next action without navigation", async () => {
  const create = vi.spyOn(identityApplicationsApi, "createTechnicianDraft");
  await act(async () => root.render(<MemoryRouter><TechnicianApplicationPage /></MemoryRouter>));
  const input = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "麻布十番"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  const search = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "搜索")!;
  expect(search.className).toContain("whitespace-nowrap"); expect(search.className).toContain("shrink-0");
  await act(async () => search.click());
  const cards = container.querySelectorAll("article"); expect(cards).toHaveLength(2); expect(cards[0].closest("section")).toBeNull();
  expect(cards[0].textContent).toContain("shop7507769538"); expect(cards[0].textContent).not.toContain("店铺 ID"); expect(cards[0].textContent).toContain("4.7"); expect(cards[0].textContent).toContain("肩颈调理");
  expect(cards[0].querySelector("img")?.getAttribute("src")).toBe("/media/shop.jpg");
  const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]'); expect(radios).toHaveLength(2); expect(radios[0].className).toContain("h-[29px]");
  await act(async () => radios[0].click()); expect(radios[0].getAttribute("aria-checked")).toBe("true");
  await act(async () => radios[1].click()); expect(radios[0].getAttribute("aria-checked")).toBe("false"); expect(radios[1].getAttribute("aria-checked")).toBe("true");
  const next = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "下一步")!;
  expect(next.closest(".fixed")).not.toBeNull(); expect(next.disabled).toBe(false); expect(container.querySelector("main")?.dataset.navigationCount).toBe("0");
  await act(async () => next.click()); expect(container.textContent).toContain("銀座"); expect(create).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLInputElement>("input[required]")).not.toBeNull();
  expect(container.querySelector("select")).toBeNull();
  expect(container.querySelector('[role="combobox"]')?.getAttribute("aria-label")).toBe("性别");
  const uploads = container.querySelectorAll('input[type="file"]'); expect(uploads).toHaveLength(2);
  uploads.forEach(upload => { expect(upload.className).toContain("sr-only"); expect(upload.parentElement?.textContent).toContain("上传图片"); });
});
