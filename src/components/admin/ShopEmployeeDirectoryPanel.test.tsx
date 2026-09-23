// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { merchantEmployeeApi } from "../../features/merchant-admin/employeeApi";
import { ShopEmployeeDirectoryPanel } from "./ShopEmployeeDirectoryPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));
vi.mock("../../features/merchant-admin/employeeApi", () => ({
  merchantEmployeeApi: { listDirectory: vi.fn(), createDirectoryEmployee: vi.fn() }
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(merchantEmployeeApi.listDirectory).mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it("opens a real employee form and creates an employee for the current merchant shop", async () => {
  await act(async () => root.render(<ShopEmployeeDirectoryPanel scope="merchant" />));
  const createButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "新建员工");
  expect(createButton).toBeDefined();
  expect(container.querySelector("aside")?.getAttribute("aria-hidden")).toBe("true");
  await act(async () => createButton!.click());
  expect(container.querySelector("aside")?.getAttribute("aria-hidden")).toBe("false");
  const needoId = container.querySelector<HTMLInputElement>('input[aria-label="员工 NeeDoID"]');
  expect(needoId?.value).toBe("");
  expect(needoId?.readOnly).toBe(true);
  expect(container.querySelector('input[aria-label="员工姓名"]')).not.toBeNull();
  expect(container.querySelector('input[aria-label="邮箱"]')).not.toBeNull();
  expect(container.querySelector('input[aria-label="初始密码"]')).not.toBeNull();
  expect(container.querySelector('select[aria-label="职务"]')).not.toBeNull();
});
