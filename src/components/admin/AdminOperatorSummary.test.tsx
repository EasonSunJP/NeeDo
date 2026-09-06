// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../auth/rbac";
import { AdminOperatorSummary } from "./AdminOperatorSummary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  listMerchantReviews: vi.fn(),
  orders: vi.fn()
}));

vi.mock("../../api/backofficeRealData", () => ({
  backofficeRealDataApi: { orders: apiMocks.orders }
}));

vi.mock("../../features/identity-applications/api", () => ({
  identityApplicationsApi: { listMerchantReviews: apiMocks.listMerchantReviews }
}));

const identity = {
  id: 9,
  publicId: null,
  scopeId: null,
  scopeType: "global",
  type: "platform",
  displayName: "东京运营组"
};

const session: AuthSession = {
  authVersion: 7,
  id: 7,
  needoId: "u0000000007",
  primaryPublicId: "u0000000007",
  activeIdentityId: 9,
  activePublicId: null,
  username: "admin_user",
  email: "admin@example.com",
  emailVerifiedAt: "2026-09-01T00:00:00.000Z",
  hasPassword: true,
  avatarUrl: "https://cdn.example.com/admin.jpg",
  profileDisplayName: "管理员用户端姓名",
  portal: "admin",
  allowedPortals: ["admin"],
  loginMethod: "password",
  loggedInAt: "2026-09-06T00:00:00.000Z",
  linkedCustomerId: "cus-7",
  linkedTechnicianId: "",
  linkedStoreId: "",
  roles: ["operator"],
  permissions: ["backoffice:orders:list", "ops:merchant-application:read"],
  menus: [],
  currentIdentity: identity,
  identities: [identity],
  identityAvailability: []
};

const order = {
  id: 12,
  orderNo: "ND-12",
  status: "pending",
  paymentStatus: "pending",
  customerUserId: 2,
  customerProfileId: 2,
  customerName: "Mia",
  serviceId: 3,
  serviceName: "精油按摩",
  shopId: 4,
  shopName: "银座店",
  technicianProfileId: null,
  technicianNeedoId: null,
  technicianName: null,
  fulfillmentMode: "store",
  priceAmount: 12000,
  currency: "JPY",
  startsAt: "2026-09-06T03:00:00.000Z",
  endsAt: "2026-09-06T04:00:00.000Z",
  note: null,
  cancelReason: null,
  createdAt: "2026-09-05T03:00:00.000Z",
  updatedAt: "2026-09-05T03:00:00.000Z"
};

const review = {
  applicationId: 31,
  applicantUserId: 5,
  status: "submitted",
  version: 1,
  submittedAt: "2026-09-06T01:00:00.000Z",
  createdAt: "2026-09-05T01:00:00.000Z",
  applicantKind: "individual",
  corporateLegalName: null,
  corporateLegalNameKana: null,
  representativeName: "申请人",
  representativeNameKana: "シンセイニン",
  shopName: "新宿店",
  businessAddress: "Tokyo",
  contactPhone: "+819000000000",
  responsiblePersonName: "申请人",
  showcaseDraft: null,
  serviceCategories: [],
  businessKeywords: [],
  bankAccount: null,
  eKycVerified: true,
  contractAcceptance: null,
  media: []
};

let container: HTMLDivElement;
let root: Root;

async function renderSummary(permissions = session.permissions) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AdminOperatorSummary
          hasPermission={(permission) => permissions.includes(permission)}
          language="zh"
          session={{ ...session, permissions }}
        />
      </MemoryRouter>
    );
  });
}

describe("AdminOperatorSummary", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiMocks.orders.mockResolvedValue({ list: [order], total: 8, page: 1, page_size: 5 });
    apiMocks.listMerchantReviews.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve({
        list: status === "submitted" ? [review] : [],
        total: status === "submitted" ? 3 : 2,
        page: 1,
        page_size: 5
      })
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("uses the linked user profile and expands each formal queue with deep links", async () => {
    await renderSummary();

    expect(container.textContent).toContain("管理员用户端姓名");
    expect(container.textContent).toContain("东京运营组");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(session.avatarUrl);
    expect(apiMocks.orders).toHaveBeenCalledWith("backoffice", {
      page: 1,
      pageSize: 5,
      status: "pending"
    });
    expect(apiMocks.listMerchantReviews).toHaveBeenCalledTimes(2);

    const pendingButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("待处理")
    )!;
    await act(async () => pendingButton.click());
    expect(container.textContent).toContain("ND-12");
    expect(Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"))).toContain(
      "/admin/orders?status=pending&orderId=12"
    );
    expect(container.querySelector('a[href="/admin/orders?status=pending"]')?.textContent).toContain("查看全部");

    const reviewButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("审核")
    )!;
    await act(async () => reviewButton.click());
    expect(container.textContent).not.toContain("ND-12");
    expect(container.textContent).toContain("新宿店");
    expect(Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"))).toContain(
      "/admin/merchant-applications?status=pending&applicationId=31"
    );
  });

  it("does not fetch or render queues that the session cannot read", async () => {
    await renderSummary([]);

    expect(container.textContent).toContain("管理员用户端姓名");
    expect(container.textContent).not.toContain("待处理");
    expect(container.textContent).not.toContain("审核");
    expect(apiMocks.orders).not.toHaveBeenCalled();
    expect(apiMocks.listMerchantReviews).not.toHaveBeenCalled();
  });

  it("falls back to an initial when the profile avatar cannot be displayed", async () => {
    await renderSummary();
    await act(async () => container.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-testid="admin-avatar-fallback"]')?.textContent).toBe("管");
  });
});
