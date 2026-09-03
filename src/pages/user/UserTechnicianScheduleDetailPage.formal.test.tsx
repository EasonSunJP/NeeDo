// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapCoreCustomerToCustomer, coreReadApi, type CoreTechnicianDetail } from "../../features/core-read/api";
import type { CustomerSelfProfile } from "../../features/core-read/customerProfileApi";
import { useCustomerSelfProfile } from "../../features/core-read/useCustomerSelfProfile";
import { loadTechnicianAvailabilityWindow } from "../../features/booking/window-loaders";
import { UserTechnicianScheduleDetailPage } from "./UserTechnicianScheduleDetailPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  loadTechnicianAvailabilityWindow: vi.fn(),
  useCustomerSelfProfile: vi.fn()
}));

vi.mock("../../features/booking/window-loaders", () => ({
  loadTechnicianAvailabilityWindow: testState.loadTechnicianAvailabilityWindow
}));

vi.mock("../../features/core-read/useCustomerSelfProfile", () => ({
  useCustomerSelfProfile: testState.useCustomerSelfProfile
}));

vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

vi.mock("../../components/mobile/FloatingHomeHeader", () => ({
  FloatingHomeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  floatingHeaderGlassPanelClassName: "",
  floatingHeaderInnerClassName: ""
}));

vi.mock("../../components/mobile/SharedHomeHeader", () => ({
  SharedHomeHeader: ({ avatarAlt, locationLabel }: { avatarAlt: string; locationLabel: string }) => (
    <div>{avatarAlt} · {locationLabel}</div>
  )
}));

vi.mock("../../components/client-ui/AppScaffold", () => ({
  AppIcon: () => <span>icon</span>,
  IconButton: ({ label, onClick }: { label: string; onClick: () => void }) => <button onClick={onClick} type="button">{label}</button>,
  floatingHeaderControlButtonClassName: ""
}));

vi.mock("../../components/ui/AvatarImage", () => ({
  AvatarImage: ({ alt }: { alt: string }) => <span>{alt}</span>
}));

const customerProfile: CustomerSelfProfile = {
  id: 7,
  publicId: "u0000000007",
  userId: 70,
  displayName: "Formal Customer",
  city: "東京",
  bio: null,
  avatarUrl: null,
  membershipLevel: "free",
  level: 1,
  gender: "private",
  age: null,
  heightCm: null,
  languages: ["日本語"],
  visibility: "public",
  isPublic: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

const technicianDetailFixture = {
  id: 17,
  publicId: "s0000000017",
  displayName: "Formal Technician",
  city: "東京",
  avatarUrl: null,
  reviewSummary: {
    ratingAverage: "5.00",
    reviewCount: 1,
    latestReviewAt: null,
    highlights: []
  },
  age: null,
  favoriteCount: 0,
  shareCount: 0,
  completedOrderCount: 0,
  acceptanceRatePercent: 100,
  primaryService: null,
  shop: null,
  bio: null,
  serviceArea: "東京",
  yearsExperience: 3,
  reviewTagSummary: {
    special: [
      { code: "appeal_max", label: "魅力max", count: 0 },
      { code: "service_max", label: "服务max", count: 0 },
      { code: "emotion_max", label: "情绪max", count: 0 },
      { code: "energy_max", label: "元气max", count: 0 }
    ],
    custom: []
  },
  mediaAssets: [],
  services: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies CoreTechnicianDetail;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
}

let container: HTMLDivElement;
let root: Root;

describe("UserTechnicianScheduleDetailPage formal availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(technicianDetailFixture);
    vi.mocked(loadTechnicianAvailabilityWindow).mockResolvedValue([]);
    vi.mocked(useCustomerSelfProfile).mockReturnValue({
      profile: customerProfile,
      customer: mapCoreCustomerToCustomer(customerProfile),
      loading: false,
      error: null,
      reload: vi.fn()
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("requests the selected visible period and renders a true empty day", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/schedule/technicians/17?date=2026-09-01"]}>
          <Routes>
            <Route path="/schedule/technicians/:technicianId" element={<UserTechnicianScheduleDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(container.textContent).toContain("当前日期没有可预约的空档。"));
    expect(coreReadApi.getTechnicianDetail).toHaveBeenCalledWith(17);
    expect(loadTechnicianAvailabilityWindow).toHaveBeenCalledWith(
      17,
      new Date("2026-08-31T15:00:00.000Z"),
      new Date("2026-09-01T15:00:00.000Z")
    );
    expect(container.textContent).not.toContain("09:00-10:00");

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="切换技师可预约日程范围"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setValue?.call(select, "month");
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitFor(() => expect(loadTechnicianAvailabilityWindow).toHaveBeenLastCalledWith(
      17,
      new Date("2026-08-29T15:00:00.000Z"),
      new Date("2026-10-10T15:00:00.000Z")
    ));
  });
});
