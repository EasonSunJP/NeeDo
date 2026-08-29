/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installNativeContextMenuGuard } from "./nativeContextMenuGuard";

const portalEntrySource = readFileSync(resolve(process.cwd(), "portal-entry.js"), "utf8");

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("installNativeContextMenuGuard", () => {
  it("starts protecting every HTML portal before the React bundle loads", () => {
    expect(portalEntrySource).toContain('document.addEventListener("contextmenu"');
    expect(portalEntrySource).toContain("event.preventDefault()");
    expect(portalEntrySource.indexOf('document.addEventListener("contextmenu"')).toBeLessThan(
      portalEntrySource.indexOf('import("./src/main.tsx")'),
    );
  });

  it("prevents the browser menu without blocking NeeDo context-menu handlers", () => {
    const root = document.createElement("div");
    const message = document.createElement("button");
    root.append(message);
    document.body.append(root);
    const onNeedoContextMenu = vi.fn((event: Event) => event.defaultPrevented);
    message.addEventListener("contextmenu", onNeedoContextMenu);

    const uninstall = installNativeContextMenuGuard(root);
    const guardedEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    message.dispatchEvent(guardedEvent);

    expect(guardedEvent.defaultPrevented).toBe(true);
    expect(onNeedoContextMenu).toHaveBeenCalledOnce();
    expect(onNeedoContextMenu).toHaveReturnedWith(false);

    uninstall();
    const unguardedEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    message.dispatchEvent(unguardedEvent);

    expect(unguardedEvent.defaultPrevented).toBe(false);
    expect(onNeedoContextMenu).toHaveBeenCalledTimes(2);
  });
});
