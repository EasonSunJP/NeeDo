// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationReviewActions } from "./ApplicationReviewActions";
import { identityApplicationsApi, type IdentityApplication } from "./api";
const auth = vi.hoisted(() => ({ refreshSession: vi.fn(), switchPortal: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
const navigate = vi.fn();
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const callbacks = { onError: vi.fn(), onReapply: vi.fn(), onWithdrawn: vi.fn() };
const application = { id: 19, userId: 41, version: 8, type: "merchant", status: "submitted" } as IdentityApplication;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); vi.clearAllMocks(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const render = async (status: IdentityApplication["status"]) => act(async () => root.render(<ApplicationReviewActions application={{ ...application, status }} {...callbacks} />));
it("renders exactly one red retry button on rejection", async () => {
  await render("rejected"); const buttons = container.querySelectorAll("button");
  expect(buttons).toHaveLength(1); expect(buttons[0].textContent).toBe("审核未通过，再次申请"); expect(buttons[0].className).toContain("client-danger");
  await act(async () => buttons[0].click()); expect(callbacks.onReapply).toHaveBeenCalledOnce();
});
it("withdraws the current version and leaves pending only after success", async () => {
  const withdraw = vi.spyOn(identityApplicationsApi, "withdraw").mockResolvedValue({ ...application, status: "withdrawn", version: 9 });
  auth.refreshSession.mockResolvedValue({ ok: true, session: { id: 41, portal: "user" } });
  await render("under_review"); const buttons = container.querySelectorAll("button"); expect(buttons[0].textContent).toBe("撤回"); expect(buttons[1].disabled).toBe(true); expect(buttons[1].textContent).toBe("审核中");
  await act(async () => buttons[0].click());
  expect(withdraw).toHaveBeenCalledWith(19, 8);
  expect(auth.refreshSession).toHaveBeenCalledWith();
  expect(auth.refreshSession.mock.invocationCallOrder[0]).toBeLessThan(callbacks.onWithdrawn.mock.invocationCallOrder[0]);
  expect(callbacks.onWithdrawn).toHaveBeenCalledOnce();
});
it("does not navigate or lose pending state when withdrawal conflicts", async () => {
  vi.spyOn(identityApplicationsApi, "withdraw").mockRejectedValue(new Error("conflict")); await render("submitted");
  await act(async () => container.querySelector("button")!.click()); expect(callbacks.onWithdrawn).not.toHaveBeenCalled(); expect(callbacks.onError).toHaveBeenCalledWith("conflict");
});
it("refreshes identities and switches formally before navigation", async () => {
  auth.refreshSession.mockResolvedValue({ ok: true, session: { id: 41, portal: "merchant" } }); await render("approved");
  await act(async () => container.querySelector("button")!.click()); expect(auth.refreshSession).toHaveBeenCalledOnce(); expect(auth.refreshSession).toHaveBeenCalledWith("merchant"); expect(auth.switchPortal).not.toHaveBeenCalled(); expect(navigate).toHaveBeenCalledWith("/merchant", { replace: true });
});
it("keeps the application visible when the formal switch fails", async () => {
  auth.refreshSession.mockResolvedValue({ ok: false, message: "denied" }); await render("approved");
  await act(async () => container.querySelector("button")!.click()); expect(navigate).not.toHaveBeenCalled(); expect(callbacks.onError).toHaveBeenCalledWith("denied");
});

it("does not enter a different account returned during a concurrent session change", async () => {
  auth.refreshSession.mockResolvedValue({ ok: true, session: { id: 99, portal: "merchant" } }); await render("approved");
  await act(async () => container.querySelector("button")!.click()); expect(navigate).not.toHaveBeenCalled(); expect(auth.switchPortal).not.toHaveBeenCalled(); expect(callbacks.onError).toHaveBeenCalledWith("error.auth.operation_superseded");
});
