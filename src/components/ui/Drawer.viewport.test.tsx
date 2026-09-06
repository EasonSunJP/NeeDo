// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Drawer } from "./Drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
it("covers the viewport even inside a vertically spaced backoffice shell", async () => {
  const style = document.createElement("style");
  style.textContent = ".space-y-5 > :not([hidden]) ~ :not([hidden]) { margin-top: 20px; }";
  document.head.append(style);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  cleanup = () => { act(() => root.unmount()); host.remove(); style.remove(); };
  await act(async () => root.render(<div className="space-y-5"><p>Backoffice content</p><Drawer open title="Members" onClose={() => undefined}>Members</Drawer></div>));
  const overlay = host.querySelector(".fixed.inset-0") as HTMLElement;
  expect(getComputedStyle(overlay).marginTop).toBe("0px");
});
