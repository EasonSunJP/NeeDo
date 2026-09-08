// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EkycSettingsTab } from "./EkycSettingsTab";
import { platformUserManagementApi } from "../platform-user-management/api";
import type { UserGlobalPolicy } from "../platform-user-management/types";
const auth = vi.hoisted(() => ({ canPublish: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission.endsWith(":read") || auth.canPublish }) }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
const current: UserGlobalPolicy = { versionPublicId: "v1", version: 1, status: "published", lockVersion: 1, requirePhone: true, requireEmail: false, requireMerchantApplicationEkyc: false, requireTechnicianApplicationEkyc: false, requireHomeServiceEkyc: true, requireStoreServiceEkyc: false, ndpPerBaseExp: 100, baseExpUnitsPerThreshold: 10000, effectiveFrom: "2026-09-01T00:00:00+09:00", effectiveTo: null, publishedAt: "2026-09-01T00:00:00+09:00" };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const dirty = vi.fn();
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); auth.canPublish = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); vi.spyOn(platformUserManagementApi, "getGlobalSettings").mockResolvedValue({ current, draft: null }); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const render = () => act(async () => root.render(<EkycSettingsTab onDirtyChange={dirty} />));
it("loads four independent switches and publishes only their edits with version locks", async () => {
 const save = vi.spyOn(platformUserManagementApi, "saveGlobalSettingsDraft").mockResolvedValue({ ...current, version: 2, lockVersion: 2, status: "draft", requireMerchantApplicationEkyc: true });
 const publish = vi.spyOn(platformUserManagementApi, "publishGlobalSettings").mockResolvedValue({ ...current, version: 2, requireMerchantApplicationEkyc: true });
 await render(); const switches = container.querySelectorAll<HTMLButtonElement>('[role="switch"]'); expect(Array.from(switches).map(value => value.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false"]);
 await act(async () => switches[0].click()); await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "保存并发布")!.click());
 expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedCurrentVersion: 1, expectedDraftLockVersion: null, requirePhone: true, requireMerchantApplicationEkyc: true, requireTechnicianApplicationEkyc: false, requireHomeServiceEkyc: true, requireStoreServiceEkyc: false }));
 expect(publish).toHaveBeenCalledWith({ expectedVersion: 2, expectedLockVersion: 2, effectiveImmediately: true }); expect(container.textContent).toContain("已发布新版本");
});
it("respects publish permission", async () => { auth.canPublish = false; await render(); expect(Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]')).every(button => button.disabled)).toBe(true); });
it("blocks publication of unrelated policy drafts", async () => { vi.mocked(platformUserManagementApi.getGlobalSettings).mockResolvedValue({ current, draft: { ...current, status: "draft", version: 2, requirePhone: false } }); await render(); expect(container.textContent).toContain("已有其他全局策略草稿"); expect(Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]')).every(button => button.disabled)).toBe(true); });
it("shows a load error without substituting defaults", async () => { vi.mocked(platformUserManagementApi.getGlobalSettings).mockRejectedValue(new Error("unavailable")); await render(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("设置读取失败"); expect(container.querySelectorAll('[role="switch"]')).toHaveLength(0); });
