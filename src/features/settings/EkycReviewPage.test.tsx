// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EkycReviewPage } from "./EkycReviewPage";
import { ekycApplicationsApi, type EkycApplicationDetail } from "./ekycApplicationsApi";
import { emptyEkycProfile } from "./ekycProfileModel";
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: { id: 2 }, hasPermission: () => true }) }));
vi.mock("../../components/admin/AdminLayout", () => ({ AdminLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("requires manual confirmation and a note before approval, then sends snapshot version", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const application = { id: 7, userId: 41, userPublicId: "u0000000041", status: "submitted", version: 3, createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z", reviewedAt: null, rejectionReason: null, reviewNote: null, profile: { ...emptyEkycProfile, familyName: "山田", givenName: "太郎" } } as EkycApplicationDetail & { userPublicId: string };
  vi.spyOn(ekycApplicationsApi, "listReviews").mockResolvedValue({ list: [application], total: 1, page: 1, page_size: 20 });
  vi.spyOn(ekycApplicationsApi, "getReview").mockResolvedValue(application);
  const approve = vi.spyOn(ekycApplicationsApi, "approve").mockResolvedValue({ ...application, status: "approved", version: 4 });
  const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
  try {
    await act(async () => root.render(<EkycReviewPage />));
    expect(el.textContent).toContain("u0000000041");
    expect(Array.from(el.querySelectorAll("td")).some(cell => cell.textContent === "41")).toBe(false);
    await act(async () => Array.from(el.querySelectorAll('button')).find(b => b.textContent === "查看申请")!.click());
    const approveButton = () => Array.from(el.querySelectorAll('button')).find(b => b.textContent === "审核通过")!;
    expect(approveButton().disabled).toBe(true);
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea[aria-label="核验说明"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "已人工核对本人提供的原始资料"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(approveButton().disabled).toBe(true);
    await act(async () => el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(approveButton().disabled).toBe(false);
    await act(async () => approveButton().click());
    expect(approve).toHaveBeenCalledWith(7, 3, "已人工核对本人提供的原始资料");
    expect(el.textContent).toContain("审核已通过");
  } finally { await act(async () => root.unmount()); el.remove(); }
});
