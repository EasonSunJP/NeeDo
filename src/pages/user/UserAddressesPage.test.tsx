// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingApi } from "../../features/booking/api";
import { customerAddressApi, type CustomerAddress } from "../../features/customer-address/api";
import { UserAddressesPage } from "./UserAddressesPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/mobile/MobileShell", () => ({ MobileShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/mobile/MobileFullscreenHeader", () => ({ MobileFullscreenHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));

const home: CustomerAddress = {
  id: 81,
  publicId: "00000000-0000-4000-8000-000000000081",
  label: "自宅",
  countryCode: "JP",
  postalCode: "1600022",
  admin1Code: "13",
  prefecture: "東京都",
  admin2Code: "13104",
  city: "新宿区",
  addressLine1: "新宿1-1-1",
  addressLine2: null,
  building: "NeeDo 801",
  isDefault: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

async function renderPage() {
  await act(async () => root.render(<MemoryRouter><UserAddressesPage /></MemoryRouter>));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(customerAddressApi, "list").mockResolvedValue({ list: [home], page: 1, page_size: 100, total: 1 });
  vi.spyOn(customerAddressApi, "update").mockResolvedValue(home);
  vi.spyOn(customerAddressApi, "remove").mockResolvedValue({ deleted: true });
  vi.spyOn(bookingApi, "listAdministrativeRegions").mockImplementation(async ({ parent }) => ({
    list: parent
      ? [{ code: "13104", parentCode: "13", level: "admin2", name: "新宿区", centroid: null }]
      : [{ code: "13", parentCode: null, level: "admin1", name: "東京都", centroid: null }]
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("UserAddressesPage", () => {
  it("reloads the server-owned address after a page remount", async () => {
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("自宅"));
    expect(container.textContent).toContain("〒160-0022 東京都 新宿区 新宿1-1-1 NeeDo 801");
    expect(bookingApi.listAdministrativeRegions).toHaveBeenCalledWith({ country: "JP", locale: "ja" });

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderPage();
    await waitFor(() => expect(customerAddressApi.list).toHaveBeenCalledTimes(2));
    expect(container.textContent).toContain("自宅");
  });

  it("edits without attempting to unset the existing default", async () => {
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("自宅"));
    const edit = [...container.querySelectorAll("button")].find((button) => button.textContent === "编辑")!;
    await act(async () => edit.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const save = [...container.querySelectorAll("button")].find((button) => button.textContent === "保存地址")!;
    await act(async () => save.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await waitFor(() => expect(customerAddressApi.update).toHaveBeenCalled());
    expect(customerAddressApi.update).toHaveBeenCalledWith(home.publicId, expect.not.objectContaining({ isDefault: false }));
  });

  it("requires a second click before deleting the owned address", async () => {
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("自宅"));
    const remove = [...container.querySelectorAll("button")].find((button) => button.textContent === "删除")!;
    await act(async () => remove.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(customerAddressApi.remove).not.toHaveBeenCalled();
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "确定删除")!;
    await act(async () => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await waitFor(() => expect(customerAddressApi.remove).toHaveBeenCalledWith(home.publicId));
  });
});
