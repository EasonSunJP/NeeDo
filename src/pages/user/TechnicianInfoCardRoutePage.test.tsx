// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreReadApi, type CoreTechnicianDetail } from "../../features/core-read/api";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ProfileDetailPage } from "./ProfileDetailPage";
import { TechnicianInfoCardRoutePage } from "./TechnicianInfoCardRoutePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const detail: CoreTechnicianDetail = {
  id: 17,
  publicId: "s0000000017",
  displayName: "Misaki",
  city: "东京都",
  avatarUrl: "/images/misaki.jpg",
  reviewSummary: { ratingAverage: "5.0", reviewCount: 1, latestReviewAt: null, highlights: ["服务精神"] },
  age: 28,
  favoriteCount: 0,
  shareCount: 0,
  completedOrderCount: 12,
  acceptanceRatePercent: 100,
  primaryService: { id: 31, name: "肩颈调理", priceAmount: "8800.00", currency: "JPY", durationMinutes: 60 },
  shop: null,
  bio: "专业肩颈护理。",
  serviceArea: "银座",
  gender: "female",
  heightCm: 165,
  languages: ["日本語", "中文"],
  yearsExperience: 5,
  reviewTagSummary: {
    special: [
      { code: "appeal_max", label: "魅力max", count: 0 },
      { code: "service_max", label: "服务max", count: 1 },
      { code: "emotion_max", label: "情绪max", count: 0 },
      { code: "energy_max", label: "元气max", count: 0 }
    ],
    custom: []
  },
  mediaAssets: [],
  services: [],
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{`${location.pathname}${location.search}`}</output>;
}

function TechnicianRouteTransitionControl() {
  const navigate = useNavigate();
  return <button aria-label="切换技师" onClick={() => navigate("/profiles/technician/18?view=card")} type="button" />;
}

function renderPage(initialEntries = ["/profiles/technician/17?view=card"], initialIndex?: number) {
  return act(async () => {
    root.render(
      <ClientThemeProvider>
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
          <LocationProbe />
          <TechnicianInfoCardRoutePage id={17} />
        </MemoryRouter>
      </ClientThemeProvider>
    );
  });
}

beforeEach(async () => {
  await persistentResourceCache.clearScope("public");
  window.history.replaceState({ idx: 0 }, "", "/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("TechnicianInfoCardRoutePage", () => {
  it("returns a checkout-origin card route to the selected checkout entry on close", async () => {
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(detail);
    window.history.replaceState({ idx: 1 }, "", "/profiles/technician/17?view=card");

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/checkout/31?time=10%3A00", "/profiles/technician/17?view=card"]} initialIndex={1}>
            <LocationProbe />
            <Routes>
              <Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(document.body.textContent).toContain("Misaki"));
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')?.click();
    });

    expect(document.body.querySelector('[data-testid="location-probe"]')?.textContent).toBe("/checkout/31?time=10%3A00");
  });

  it("loads formal public detail and renders the unified information card", async () => {
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(detail);
    await renderPage();

    await waitFor(() => expect(document.body.textContent).toContain("Misaki"));
    expect(coreReadApi.getTechnicianDetail).toHaveBeenCalledWith(17);
    expect(document.body.textContent).toContain("详细信息卡");
    expect(document.body.querySelector('button[aria-label="返回结算页"]')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="关闭详细信息卡"]')).not.toBeNull();
    expect(document.body.querySelector('[aria-label="打开技师设置"]')).toBeNull();
    expect(document.body.querySelector('[aria-label="KYC 已验证"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("Test NDP");
    expect(document.body.textContent).not.toContain("隐私模式");
    expect(document.body.textContent).toContain("身高");
    expect(document.body.textContent).toContain("语言能力");
    expect(document.body.textContent).not.toContain("接单预算");
    expect(document.body.textContent).not.toContain("支持支付方式");
    expect(document.body.textContent).toContain("特殊标签");
  });

  it("shows loading and falls back home when close has no browser history", async () => {
    let resolveInitialRequest!: (value: CoreTechnicianDetail) => void;
    const initialRequest = new Promise<CoreTechnicianDetail>((resolve) => {
      resolveInitialRequest = resolve;
    });
    const getTechnicianDetail = vi.spyOn(coreReadApi, "getTechnicianDetail");
    getTechnicianDetail.mockReturnValueOnce(initialRequest);
    await renderPage();

    expect(document.body.textContent).toContain("正在读取技师详细信息");
    await act(async () => resolveInitialRequest(detail));
    await waitFor(() => expect(document.body.textContent).toContain("Misaki"));

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭详细信息卡"]')?.click();
    });
    expect(document.body.querySelector('[data-testid="location-probe"]')?.textContent).toBe("/");
  });

  it("keeps retry and close available after a formal read failure", async () => {
    const getTechnicianDetail = vi.spyOn(coreReadApi, "getTechnicianDetail")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(detail);
    await renderPage();

    await waitFor(() => expect(document.body.textContent).toContain("技师详细信息读取失败"));
    expect(document.body.textContent).toContain("重新加载");
    expect(document.body.querySelector('button[aria-label="关闭详细信息卡"]')).not.toBeNull();

    await act(async () => {
      Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "重新加载")?.click();
    });
    await waitFor(() => expect(document.body.textContent).toContain("Misaki"));
    expect(getTechnicianDetail).toHaveBeenCalledTimes(2);
  });

  it("returns to the checkout history entry when browser history is available", async () => {
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(detail);
    window.history.replaceState({ idx: 1 }, "", "/profiles/technician/17?view=card");
    await renderPage(["/checkout/31", "/profiles/technician/17?view=card"], 1);
    await waitFor(() => expect(document.body.textContent).toContain("Misaki"));

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('button[aria-label="返回结算页"]')?.click();
    });
    expect(document.body.querySelector('[data-testid="location-probe"]')?.textContent).toBe("/checkout/31");
  });

  it("clears the previous technician while a changed route id is loading", async () => {
    let resolveSeventeen!: (value: CoreTechnicianDetail) => void;
    let resolveEighteen!: (value: CoreTechnicianDetail) => void;
    const seventeenRequest = new Promise<CoreTechnicianDetail>((resolve) => {
      resolveSeventeen = resolve;
    });
    const eighteenRequest = new Promise<CoreTechnicianDetail>((resolve) => {
      resolveEighteen = resolve;
    });
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockImplementation((id) => (
      id === 17 ? seventeenRequest : eighteenRequest
    ));

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/profiles/technician/17?view=card"]}>
            <TechnicianRouteTransitionControl />
            <Routes>
              <Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });
    await act(async () => resolveSeventeen(detail));
    await waitFor(() => expect(document.body.textContent).toContain("Misaki"));

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('button[aria-label="切换技师"]')?.click();
    });
    expect(coreReadApi.getTechnicianDetail).toHaveBeenCalledWith(18);
    expect(document.body.textContent).not.toContain("Misaki");
    expect(document.body.textContent).toContain("正在从正式资料服务读取技师信息");

    await act(async () => resolveEighteen({
      ...detail,
      id: 18,
      publicId: "s0000000018",
      displayName: "Haruka"
    }));
    await waitFor(() => expect(document.body.textContent).toContain("Haruka"));
    expect(document.body.textContent).not.toContain("Misaki");
  });
});
