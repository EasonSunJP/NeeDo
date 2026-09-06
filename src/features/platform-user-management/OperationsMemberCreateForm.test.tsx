// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { OperationsMemberCreateForm } from "./OperationsMemberCreateForm";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
const post = vi.hoisted(() => vi.fn());
vi.mock("../../api/httpClient", () => ({ httpClient: { request: post } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); vi.clearAllMocks(); });
it("submits the official account form and reports success only after creation", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  cleanup = () => { act(() => root.unmount()); host.remove(); };
  const onCreated = vi.fn();
  await act(async () => root.render(<OperationsMemberCreateForm onCreated={onCreated} onCancel={() => undefined} />));
  for (const [name, value] of Object.entries({ username: "New operator", email: "op@example.com", password: "Strong@1234", reason: "New colleague" })) {
    const field = host.querySelector(`[name="${name}"]`) as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  post.mockResolvedValueOnce({ needoId: "needo2059926868" });
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(post).toHaveBeenCalledWith("/users/operations-members", { method: "POST", body: { username: "New operator", email: "op@example.com", password: "Strong@1234", reason: "New colleague" } });
  expect(onCreated).toHaveBeenCalledWith("needo2059926868");
});
