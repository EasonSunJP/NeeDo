// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PermissionTagDisclosure } from "./PermissionTagDisclosure";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PermissionTagDisclosure", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("shows role tags and keeps permission fields unmounted until expanded", () => {
    act(() => root.render(<PermissionTagDisclosure roles={[{
      code: "operator",
      name: "运营管理员",
      scopeType: "shop",
      scopeId: 9,
      permissions: ["backoffice:users:read", "backoffice:users:write"]
    }]} />));

    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "展开权限");
    expect(container.textContent).toContain("运营管理员");
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("backoffice:users:read");

    act(() => button?.click());

    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("backoffice:users:read");
    expect(container.textContent).toContain("shop:9");
  });
});
