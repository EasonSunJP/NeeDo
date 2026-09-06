// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AccountUserLog } from "./AccountUserLog";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const getTechnicianUserLog = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ platformUserManagementApi: { getTechnicianUserLog } }));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));
it("loads a merchant technician by profile id and filters the same LOG without a usage list", async () => {
  getTechnicianUserLog.mockResolvedValue({ id: 41, displayName: "Staff", avatarUrl: null, createdAt: "2026-09-01T00:00:00.000Z", audit: { page: 1, page_size: 10, total: 1, list: [{ id: "account-created-41", action: "account.created", actorName: "Staff", actorAvatarUrl: null, createdAt: "2026-09-01T00:00:00.000Z", metadata: null }] } });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<AccountUserLog scope="merchant" technicianId={8} />));
    expect(getTechnicianUserLog).toHaveBeenCalledWith("merchant", 8);
    expect(host.textContent).toContain("账号生成");
    expect(host.textContent).not.toContain("利用详细列表");
    expect(host.textContent).not.toContain("工作时间线");
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "近7天")!.click());
    expect(getTechnicianUserLog).toHaveBeenLastCalledWith("merchant", 8, expect.objectContaining({ audit_page: 1, audit_from: expect.any(String), audit_to: expect.any(String) }));
  } finally { act(() => root.unmount()); host.remove(); }
});
