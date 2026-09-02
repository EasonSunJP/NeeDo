// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coreReadApi,
  type CoreCustomerProfile,
  type CoreShopDetail
} from "../../features/core-read/api";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ProfileDetailPage } from "./ProfileDetailPage";

vi.mock("../../features/social/pages/SocialProfilePage", () => ({
  SocialProfilePage: () => <main aria-label="社交资料页">社交资料页</main>
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reviewSummary = {
  ratingAverage: "4.9",
  reviewCount: 12,
  latestReviewAt: null,
  highlights: ["专业"]
};

const customer: CoreCustomerProfile = {
  id: 23,
  publicId: "u0000000023",
  displayName: "Aoi",
  city: "东京都",
  bio: "用户简介",
  avatarUrl: null,
  membershipLevel: "regular",
  reviewSummary,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const shop: CoreShopDetail = {
  id: 7,
  publicId: "m0000000007",
  name: "GINZA Calm Body Lab",
  city: "东京都",
  address: "东京都中央区银座 1-2-3",
  coverUrl: null,
  reviewSummary,
  favoriteCount: 4,
  shareCount: 2,
  serviceCategories: [],
  businessKeywords: [],
  description: "店铺简介",
  phone: null,
  latitude: null,
  longitude: null,
  mediaAssets: [],
  services: [],
  technicians: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
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

async function renderRoute(path: string) {
  await act(async () => {
    root.render(
      <ClientThemeProvider>
        <MemoryRouter initialEntries={[path]} key={path}>
          <Routes>
            <Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" />
          </Routes>
        </MemoryRouter>
      </ClientThemeProvider>
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("ProfileDetailPage routing behavior", () => {
  it.each([
    "/profiles/technician/17",
    "/profiles/technician/17?view=social"
  ])("keeps %s on the social profile without loading the explicit card API", async (path) => {
    const getTechnicianDetail = vi.spyOn(coreReadApi, "getTechnicianDetail");

    await renderRoute(path);

    expect(container.querySelector('main[aria-label="社交资料页"]')).not.toBeNull();
    expect(getTechnicianDetail).not.toHaveBeenCalled();
  });

  it("preserves customer and shop API profile routing", async () => {
    const getCustomerProfile = vi.spyOn(coreReadApi, "getCustomerProfile").mockResolvedValue(customer);
    const getShopDetail = vi.spyOn(coreReadApi, "getShopDetail").mockResolvedValue(shop);

    await renderRoute("/profiles/user/23");
    await waitFor(() => expect(getCustomerProfile).toHaveBeenCalledWith(23));
    expect(container.textContent).toContain("用户资料");

    await renderRoute("/profiles/shop/7");
    await waitFor(() => expect(getShopDetail).toHaveBeenCalledWith(7));
    expect(container.textContent).toContain("店铺资料");
  });
});
