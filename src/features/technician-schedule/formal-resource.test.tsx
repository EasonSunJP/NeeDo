// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type { AuthSession } from "../../auth/rbac";
import type { BookingOrder, BookingScheduleSlot } from "../booking/api";
import type { CoreTechnicianDetail } from "../core-read/api";
import type { TechnicianSelfProfile } from "../core-read/technicianProfileApi";
import type { TechnicianServicePayload } from "../pricing-mode/api";

const apiMocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getMine: vi.fn(),
  getTechnicianDetail: vi.fn(),
  getTechnicianSlot: vi.fn(),
  listTechnicianServices: vi.fn()
}));

vi.mock("../booking/api", () => ({ bookingApi: { getOrder: apiMocks.getOrder } }));
vi.mock("../core-read/api", () => ({
  coreReadApi: { getTechnicianDetail: apiMocks.getTechnicianDetail }
}));
vi.mock("../core-read/technicianProfileApi", () => ({
  technicianProfileApi: { getMine: apiMocks.getMine }
}));
vi.mock("../pricing-mode/api", () => ({
  pricingModeApi: { listTechnicianServices: apiMocks.listTechnicianServices }
}));
vi.mock("../scheduling/api", () => ({
  schedulingApi: { getTechnicianSlot: apiMocks.getTechnicianSlot }
}));

import {
  getActiveTechnicianProfileId,
  loadAllTechnicianServices,
  parsePositiveRouteId,
  useFormalTechnicianOrderResource,
  useFormalTechnicianScheduleResource
} from "./formal-resource";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const technicianSession = {
  portal: "technician",
  currentIdentity: {
    id: 13,
    publicId: "s0000000031",
    scopeId: 31,
    scopeType: "technician_profile",
    type: "technician"
  }
} as AuthSession;

const customerSession = {
  ...technicianSession,
  portal: "user",
  currentIdentity: {
    id: 14,
    publicId: "u0000000031",
    scopeId: 41,
    scopeType: "customer_profile",
    type: "customer"
  }
} as AuthSession;

const profile = {
  id: 31,
  publicId: "s0000000031",
  displayName: "Formal Technician",
  city: "東京",
  avatarUrl: null,
  reviewSummary: { ratingAverage: "5.0", reviewCount: 2, latestReviewAt: null, highlights: [] },
  shop: {
    id: 11,
    publicId: "b0000000011",
    name: "Formal Shop",
    city: "東京",
    address: "東京都港区",
    coverUrl: null,
    reviewSummary: { ratingAverage: "4.8", reviewCount: 10, latestReviewAt: null, highlights: [] }
  },
  bio: null,
  serviceArea: "東京",
  yearsExperience: 4,
  mediaAssets: [],
  services: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies CoreTechnicianDetail;

const selfProfile = {
  id: 31,
  publicId: "s0000000031",
  userId: 31,
  shopId: 11,
  displayName: "Formal Technician",
  avatarUrl: null,
  bio: null,
  city: "東京",
  age: null,
  heightCm: null,
  languages: ["日本語"],
  serviceAreas: ["東京"],
  specialTags: [],
  profileTags: [],
  canServeForeigners: false,
  bidBudgetMinJpy: null,
  bidBudgetMaxJpy: null,
  paymentMethods: ["platform"],
  serviceBase: null,
  visibility: "public",
  employmentType: "independent",
  yearsExperience: 4,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies TechnicianSelfProfile;

const makeService = (
  id: number,
  sortOrder: number,
  overrides: Partial<TechnicianServicePayload> = {}
): TechnicianServicePayload => ({
  id,
  shopId: 11,
  technicianId: 31,
  sourceShopServiceId: null,
  name: `Service ${id}`,
  description: null,
  categoryId: 1,
  priceAmount: 10000,
  currency: "JPY",
  durationMinutes: 60,
  taxIncluded: true,
  coverImageUrl: null,
  images: [],
  tags: [],
  isActive: true,
  isBookable: true,
  isRecommended: false,
  sortOrder,
  reviewStatus: "approved",
  rejectionReason: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides
});

const slot = {
  id: 17,
  serviceId: null,
  technicianServiceId: 102,
  shopId: 11,
  technicianProfileId: 31,
  startsAt: "2026-09-01T01:00:00.000Z",
  endsAt: "2026-09-01T02:00:00.000Z",
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "Service 102",
  shopName: "Formal Shop",
  technicianName: "Formal Technician",
  priceAmount: "10000.00",
  currency: "JPY",
  durationMinutes: 60
} satisfies BookingScheduleSlot;

const order = { id: 29, orderNo: "ND202608280029" } as BookingOrder;

function ScheduleProbe({ session = technicianSession, slotId = 17 }: { session?: AuthSession | null; slotId?: number | null }) {
  const resource = useFormalTechnicianScheduleResource(session, slotId);
  return (
    <div>
      <span data-testid="loading">{String(resource.loading)}</span>
      <span data-testid="slot">{resource.data?.slot?.id ?? "null"}</span>
      <span data-testid="services">{resource.data?.services.map((service) => service.id).join(",") ?? "null"}</span>
      <span data-testid="error">{resource.error ?? "null"}</span>
      <button type="button" onClick={resource.retry}>retry</button>
    </div>
  );
}

function OrderProbe({ session = technicianSession, orderId = 29 }: { session?: AuthSession | null; orderId?: number | null }) {
  const resource = useFormalTechnicianOrderResource(session, orderId);
  return (
    <div>
      <span data-testid="loading">{String(resource.loading)}</span>
      <span data-testid="order">{resource.data?.id ?? "null"}</span>
      <span data-testid="error">{resource.error ?? "null"}</span>
      <button type="button" onClick={resource.retry}>retry</button>
    </div>
  );
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

let container: HTMLDivElement;
let root: Root;

describe("formal technician schedule resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getMine.mockResolvedValue(selfProfile);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("accepts only positive numeric route IDs and the active technician identity", () => {
    expect(parsePositiveRouteId("17")).toBe(17);
    expect(parsePositiveRouteId("slot-17")).toBeNull();
    expect(parsePositiveRouteId("0")).toBeNull();
    expect(getActiveTechnicianProfileId(technicianSession)).toBe(31);
    expect(getActiveTechnicianProfileId(customerSession)).toBeNull();
  });

  it("loads every technician-service page, filters inactive rows, and sorts deterministically", async () => {
    apiMocks.listTechnicianServices
      .mockResolvedValueOnce({
        list: [makeService(103, 2), makeService(101, 1), makeService(999, 0, { isBookable: false })],
        total: 101,
        page: 1,
        page_size: 100
      })
      .mockResolvedValueOnce({
        list: [makeService(102, 1), makeService(998, 0, { isActive: false })],
        total: 101,
        page: 2,
        page_size: 100
      });

    await expect(loadAllTechnicianServices(11)).resolves.toEqual([
      makeService(101, 1),
      makeService(102, 1),
      makeService(103, 2)
    ]);
    expect(apiMocks.listTechnicianServices).toHaveBeenNthCalledWith(1, 11, {
      activeOnly: true,
      page: 1,
      pageSize: 100
    });
    expect(apiMocks.listTechnicianServices).toHaveBeenNthCalledWith(2, 11, {
      activeOnly: true,
      page: 2,
      pageSize: 100
    });
  });

  it("loads a formal technician profile, services, and owned slot without fallback data", async () => {
    let resolveProfile!: (value: CoreTechnicianDetail) => void;
    apiMocks.getTechnicianDetail.mockReturnValue(
      new Promise<CoreTechnicianDetail>((resolve) => {
        resolveProfile = resolve;
      })
    );
    apiMocks.listTechnicianServices.mockResolvedValue({
      list: [makeService(102, 1)], total: 1, page: 1, page_size: 100
    });
    apiMocks.getTechnicianSlot.mockResolvedValue(slot);

    await act(async () => root.render(<ScheduleProbe />));
    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe("true");
    await act(async () => resolveProfile(profile));
    await waitFor(() => expect(container.querySelector('[data-testid="slot"]')?.textContent).toBe("17"));

    expect(container.querySelector('[data-testid="services"]')?.textContent).toBe("102");
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("null");
    expect(apiMocks.getTechnicianDetail).toHaveBeenCalledWith(31);
    expect(apiMocks.getMine).toHaveBeenCalledTimes(1);
    expect(apiMocks.getTechnicianSlot).toHaveBeenCalledWith(17);
  });

  it("reports the persisted missing-shop state without querying the public technician directory", async () => {
    apiMocks.getMine.mockResolvedValue({ ...selfProfile, shopId: null });

    await act(async () => root.render(<ScheduleProbe slotId={null} />));
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("error.technician.shop_required"));

    expect(apiMocks.getMine).toHaveBeenCalledTimes(1);
    expect(apiMocks.getTechnicianDetail).not.toHaveBeenCalled();
    expect(apiMocks.listTechnicianServices).not.toHaveBeenCalled();
    expect(apiMocks.getTechnicianSlot).not.toHaveBeenCalled();
  });

  it("keeps schedule data empty after an API error and retries the formal request", async () => {
    apiMocks.getTechnicianDetail
      .mockRejectedValueOnce(new ApiClientError("error.network.timeout", 408, 408))
      .mockResolvedValueOnce(profile);
    apiMocks.listTechnicianServices.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
    apiMocks.getTechnicianSlot.mockResolvedValue(slot);

    await act(async () => root.render(<ScheduleProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("error.network.timeout"));
    expect(container.querySelector('[data-testid="slot"]')?.textContent).toBe("null");

    await act(async () => container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await waitFor(() => expect(container.querySelector('[data-testid="slot"]')?.textContent).toBe("17"));
    expect(apiMocks.getTechnicianDetail).toHaveBeenCalledTimes(2);
  });

  it("loads a formal order and retries after a rejected order request", async () => {
    apiMocks.getOrder
      .mockRejectedValueOnce(new ApiClientError("error.forbidden", 403, 403))
      .mockResolvedValueOnce(order);

    await act(async () => root.render(<OrderProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("error.forbidden"));
    expect(container.querySelector('[data-testid="order"]')?.textContent).toBe("null");

    await act(async () => container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await waitFor(() => expect(container.querySelector('[data-testid="order"]')?.textContent).toBe("29"));
    expect(apiMocks.getOrder).toHaveBeenCalledTimes(2);
    expect(apiMocks.getOrder).toHaveBeenLastCalledWith(29);
  });

  it("does not call any formal API when the active identity is not a technician", async () => {
    await act(async () => root.render(<ScheduleProbe session={customerSession} />));
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("error.auth.identity_forbidden"));
    await act(async () => root.render(<OrderProbe session={customerSession} />));
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("error.auth.identity_forbidden"));

    expect(apiMocks.getTechnicianDetail).not.toHaveBeenCalled();
    expect(apiMocks.getMine).not.toHaveBeenCalled();
    expect(apiMocks.listTechnicianServices).not.toHaveBeenCalled();
    expect(apiMocks.getTechnicianSlot).not.toHaveBeenCalled();
    expect(apiMocks.getOrder).not.toHaveBeenCalled();
  });
});
