// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TechnicianServicesPage } from "./TechnicianServicesPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pricingModeMock = vi.hoisted(() => ({ listPublicTechnicianServices: vi.fn() }));
const coreReadMock = vi.hoisted(() => ({ getShopDetail: vi.fn(), getTechnicianDetail: vi.fn() }));

vi.mock("../../features/pricing-mode/api", () => ({ pricingModeApi: pricingModeMock }));
vi.mock("../../features/core-read/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../features/core-read/api")>(),
  coreReadApi: coreReadMock
}));
vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../../components/mobile/MobileFullscreenPage", () => ({
  MobileFullscreenPage: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../../components/mobile/MobileFullscreenHeader", () => ({
  MobileFullscreenHeader: ({ title }: { title: string }) => <header>{title}</header>
}));
vi.mock("../../components/mobile/MobileBottomActionBar", () => ({
  MobileBottomActionBar: ({ children }: { children: ReactNode }) => <footer>{children}</footer>
}));
vi.mock("../../features/core-read/hooks", () => ({
  useCoreReadQuery: () => ({
    data: { displayName: "佐藤 美咲", socialAccountUserId: 70, socialIdentityId: 80 },
    error: null,
    loading: false
  })
}));
vi.mock("../../state/entityStore", () => ({
  useEntityStore: () => ({
    stores: [{ id: "11", name: "StagingTest" }],
    technicians: [{ id: "23", name: "佐藤 美咲" }]
  })
}));

let container: HTMLDivElement;
let root: Root;
const serviceResult = {
  list: [{
    id: 202,
    publicId: "service-202",
    shopId: 11,
    technicianId: 23,
    sourceShopServiceId: 80,
    name: "アロマオイルトリートメント 60分",
    description: "技师主服务",
    categoryId: 4,
    priceAmount: 6600,
    currency: "JPY",
    durationMinutes: 60,
    usageCount: 23,
    taxIncluded: true,
    coverImageUrl: null,
    images: [],
    tags: ["アロマ"],
    shop: { publicId: "shop-11", name: "StagingTest", address: "渋谷区" },
    isActive: true,
    isBookable: true,
    isRecommended: true,
    sortOrder: 10,
    reviewStatus: "APPROVED",
    rejectionReason: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  }],
  total: 1,
  page: 1,
  page_size: 20
};

beforeEach(() => {
  pricingModeMock.listPublicTechnicianServices.mockReset();
  coreReadMock.getShopDetail.mockReset();
  coreReadMock.getTechnicianDetail.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

it.each(["user", "merchant", "technician"] as const)(
  "resolves public shop and technician IDs before loading %s service list",
  async (scope) => {
    coreReadMock.getShopDetail.mockResolvedValue({ id: 11, publicId: "shop6333731099" });
    coreReadMock.getTechnicianDetail.mockResolvedValue({ id: 23, publicId: "s5148317836" });
    pricingModeMock.listPublicTechnicianServices.mockResolvedValue(serviceResult);
    const prefix = scope === "user" ? "" : `/${scope}`;

    await act(async () => root.render(
      <MemoryRouter initialEntries={[`${prefix}/stores/shop6333731099/technicians/s5148317836/services`]}>
        <Routes>
          <Route path={`${prefix}/stores/:shopId/technicians/:technicianId/services`} element={<TechnicianServicesPage scope={scope} />} />
        </Routes>
      </MemoryRouter>
    ));

    await vi.waitFor(() => expect(pricingModeMock.listPublicTechnicianServices)
      .toHaveBeenCalledWith(11, 23, { page: 1, pageSize: 20 }));
    expect(coreReadMock.getShopDetail).toHaveBeenCalledWith("shop6333731099");
    expect(coreReadMock.getTechnicianDetail).toHaveBeenCalledWith("s5148317836");
    expect(container.textContent).toContain("アロマオイルトリートメント 60分");
    expect(container.textContent).not.toContain("该技师暂未开放可预约服务");
  }
);

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it("loads the selected available technician's services and preserves the chosen date and time", async () => {
  pricingModeMock.listPublicTechnicianServices.mockResolvedValue(serviceResult);

  await act(async () => root.render(
    <MemoryRouter initialEntries={["/stores/11/technicians/23/services?date=2026-09-22&people=1%E5%90%8D&time=10%3A00"]}>
      <Routes>
        <Route path="/stores/:shopId/technicians/:technicianId/services" element={<TechnicianServicesPage />} />
      </Routes>
    </MemoryRouter>
  ));

  await vi.waitFor(() => expect(container.textContent).toContain("アロマオイルトリートメント 60分"));
  expect(pricingModeMock.listPublicTechnicianServices).toHaveBeenCalledWith(11, 23, { page: 1, pageSize: 20 });
  expect(container.textContent).not.toContain("暂时无法读取技师服务");
  const checkoutLink = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
    .find((link) => link.textContent?.includes("预约已选服务"));
  expect(checkoutLink?.getAttribute("href")).toContain("/checkout/technician-service/202");
  expect(checkoutLink?.getAttribute("href")).toContain("date=2026-09-22");
  expect(checkoutLink?.getAttribute("href")).toContain("time=10%3A00");
});
