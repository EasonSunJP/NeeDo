// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { travelFareApi } from "../../api/travelFare";
import { useAuth } from "../../auth/AuthProvider";
import { ShopTravelFarePolicyPage } from "./ShopTravelFarePolicyPage";

vi.mock("../../api/travelFare", () => ({ travelFareApi: { getMerchantPolicy: vi.fn(), listMerchantPolicyVersions: vi.fn(), publishMerchantPolicy: vi.fn() } }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../../components/merchant-admin/MerchantAdminLayout", () => ({ MerchantAdminLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../components/admin/ModuleShell", () => ({ ModuleShell: ({ children, title }: { children: ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main> }));

let container: HTMLDivElement;
let root: Root;
const summary = { current: { publicId: "policy-1", version: 1, effectiveFrom: "2026-09-01T00:00:00.000Z", publishedByUserId: 7, reason: "Initial", bands: [{ ordinal: 0, maximumDistanceMeters: 5_000, fareAmountJpy: 500 }], createdAt: "2026-08-31T00:00:00.000Z" }, next: null };

async function settle() { await act(async () => new Promise((resolve) => setTimeout(resolve, 0))); }
async function click(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label)); expect(button).toBeTruthy(); await act(async () => button!.click()); }
async function input(label: string, value: string) { const element = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`); expect(element).toBeTruthy(); await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(element, value); element!.dispatchEvent(new Event("input", { bubbles: true })); }); }

beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); vi.mocked(useAuth).mockReturnValue({ hasPermission: (permission: string) => permission === "merchant-admin:travel-fare-policy:write" } as unknown as ReturnType<typeof useAuth>); vi.mocked(travelFareApi.getMerchantPolicy).mockResolvedValue(summary); vi.mocked(travelFareApi.listMerchantPolicyVersions).mockResolvedValue({ list: [summary.current], total: 1, page: 1, page_size: 20 }); vi.mocked(travelFareApi.publishMerchantPolicy).mockResolvedValue({ ...summary.current, version: 2 }); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe("ShopTravelFarePolicyPage", () => {
  it("loads current policy and adds/removes distance bands", async () => {
    await act(async () => root.render(<ShopTravelFarePolicyPage />)); await settle();
    expect(container.textContent).toContain("当前生效策略"); expect(container.textContent).toContain("v1");
    expect(container.textContent).toContain("不可变发布历史");
    expect(container.textContent).toContain("Initial");
    await click("添加距离区间"); expect(container.querySelectorAll('[aria-label^="距离上限 "]')).toHaveLength(2);
    const removeButtons = [...container.querySelectorAll("button")].filter((item) => item.textContent === "移除"); await act(async () => removeButtons[1]!.click());
    expect(container.querySelectorAll('[aria-label^="距离上限 "]')).toHaveLength(1);
  });

  it("publishes a validated immutable version with expected-version protection", async () => {
    vi.mocked(travelFareApi.listMerchantPolicyVersions).mockResolvedValue({
      list: [
        { ...summary.current, publicId: "policy-3", version: 3, reason: "Later future policy" },
        { ...summary.current, publicId: "policy-2", version: 2, reason: "Earlier future policy" },
        summary.current
      ],
      total: 3,
      page: 1,
      page_size: 20
    });
    await act(async () => root.render(<ShopTravelFarePolicyPage />)); await settle();
    await input("距离上限 1", "10"); await input("交通费 1", "900"); await input("生效时间", "2026-09-07T09:00"); await input("发布理由", "Updated range");
    await click("发布不可变版本"); await settle();
    expect(travelFareApi.publishMerchantPolicy).not.toHaveBeenCalled();
    expect(container.textContent).toContain("确认发布内容");
    expect(container.textContent).toContain("Updated range");
    await click("确认发布"); await settle();
    expect(travelFareApi.publishMerchantPolicy).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 3, reason: "Updated range", bands: [{ maximumDistanceMeters: 10_000, fareAmountJpy: 900 }] }));
  });

  it("pages through the complete immutable version history", async () => {
    vi.mocked(travelFareApi.listMerchantPolicyVersions).mockResolvedValueOnce({ list: [summary.current], total: 21, page: 1, page_size: 20 }).mockResolvedValueOnce({ list: [{ ...summary.current, publicId: "policy-older", version: 0, reason: "Older" }], total: 21, page: 2, page_size: 20 });
    await act(async () => root.render(<ShopTravelFarePolicyPage />)); await settle();
    await click("下一页历史"); await settle();
    expect(travelFareApi.listMerchantPolicyVersions).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
    expect(container.textContent).toContain("Older");
  });

  it("shows permission denial and retry instead of an editable fake state", async () => {
    vi.mocked(travelFareApi.getMerchantPolicy).mockRejectedValue(new ApiClientError("error.forbidden", 403, 403));
    await act(async () => root.render(<ShopTravelFarePolicyPage />)); await settle();
    expect(container.textContent).toContain("没有查看或发布出行费率策略的权限"); expect(container.textContent).toContain("重试"); expect(container.textContent).not.toContain("发布新版本");
  });

  it("keeps policy history readable but hides the publisher for read-only merchant identities", async () => {
    vi.mocked(useAuth).mockReturnValue({ hasPermission: () => false } as unknown as ReturnType<typeof useAuth>);
    await act(async () => root.render(<ShopTravelFarePolicyPage />)); await settle();
    expect(container.textContent).toContain("当前生效策略");
    expect(container.textContent).toContain("不可变发布历史");
    expect(container.textContent).toContain("当前账号只有查看权限");
    expect(container.textContent).not.toContain("发布新版本");
    expect(container.querySelector('[aria-label="生效时间"]')).toBeNull();
  });
});
