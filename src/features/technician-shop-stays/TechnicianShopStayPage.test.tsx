// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  technicianProfileApi,
  type TechnicianSelfProfile,
} from "../core-read/technicianProfileApi";
import { TechnicianShopStayPage } from "./TechnicianShopStayPage";

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "jade-light" }),
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" }),
}));

const profile = {
  shopAccessStatus: "active",
  shopAffiliations: [
    {
      id: 10,
      shopId: 71,
      publicId: "shop0000000071",
      name: "第一店铺",
      city: "东京",
      address: "港区",
      relationshipType: "partner",
      workStatus: "active",
      startsAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: 11,
      shopId: 72,
      publicId: "shop0000000072",
      name: "第二店铺",
      city: "东京",
      address: "中央区",
      relationshipType: "partner",
      workStatus: "active",
      startsAt: "2026-02-01T00:00:00.000Z",
    },
  ],
} as TechnicianSelfProfile;

describe("TechnicianShopStayPage", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("shows the first formal shop and routes the add action to a new shop application", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(profile);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/technician/shop-stays"]}>
          <Routes>
            <Route
              element={<TechnicianShopStayPage />}
              path="/technician/shop-stays"
            />
            <Route
              element={
                <div data-testid="additional-shop-application">申请页</div>
              }
              path="/technician/shop-stays/apply"
            />
          </Routes>
        </MemoryRouter>,
      ),
    );
    for (
      let attempt = 0;
      attempt < 20 && !container.textContent?.includes("第一店铺");
      attempt += 1
    ) {
      await act(
        async () => new Promise((resolve) => window.setTimeout(resolve, 0)),
      );
    }

    expect(container.textContent).toContain("入住店铺");
    expect(container.textContent).toContain("第一店铺");
    expect(container.textContent).toContain("shop0000000071");
    const add = Array.from(
      container.querySelectorAll<HTMLElement>("a,button"),
    ).find((item) => item.textContent?.trim() === "追加");
    expect(add).toBeDefined();
    await act(async () => add?.click());
    expect(
      container.querySelector('[data-testid="additional-shop-application"]'),
    ).not.toBeNull();
  });

  it("keeps a zero-shop technician inside the portal and requires the add flow", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue({
      ...profile,
      shopAccessStatus: "requires_shop",
      shopAffiliations: [],
    });
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TechnicianShopStayPage />
        </MemoryRouter>,
      ),
    );
    for (
      let attempt = 0;
      attempt < 20 && !container.textContent?.includes("需要入住店铺");
      attempt += 1
    ) {
      await act(
        async () => new Promise((resolve) => window.setTimeout(resolve, 0)),
      );
    }
    expect(container.textContent).toContain("需要入住店铺");
    expect(container.textContent).toContain("追加");
  });
});
