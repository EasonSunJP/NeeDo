// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import portalEntrySource from "../portal-entry.js?raw";

const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

function setUrlWithoutNavigationEvent(url: string) {
  originalReplaceState.call(window.history, null, "", url);
}

describe("portal document title synchronization", () => {
  beforeAll(() => {
    document.head.innerHTML = [
      '<meta name="needo-hash" content="#/" />',
      '<meta name="needo-title" content="NeeDo 用户端" />'
    ].join("");
    document.title = "stale title";
    setUrlWithoutNavigationEvent("/user.html#/");
    (window as typeof window & { __vite_plugin_react_preamble_installed__?: boolean })
      .__vite_plugin_react_preamble_installed__ = true;

    const executableSource = portalEntrySource.replace(
      'import("./src/main.tsx")',
      "Promise.resolve()"
    );
    Function(executableSource)();
  });

  afterAll(() => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    delete (window as typeof window & { __vite_plugin_react_preamble_installed__?: boolean })
      .__vite_plugin_react_preamble_installed__;
  });

  it.each([
    ["user", "/user.html#/", "NeeDo 用户端"],
    ["technician", "/user.html#/technician", "NeeDo 技师端"],
    ["merchant", "/user.html#/merchant", "NeeDo 商户端"],
    ["affiliate", "/user.html#/afirieito", "NeeDoAfirieito"]
  ])("updates the title after a React Router %s identity replacement", (_portal, url, title) => {
    window.history.replaceState({ idx: 1 }, "", url);

    expect(document.title).toBe(title);
  });

  it.each([
    ["merchant route", "/user.html#/merchant/services", "NeeDo 商户端"],
    ["technician route", "/user.html#/technician/orders", "NeeDo 技师端"],
    ["operations admin route", "/pf-admin.html#/admin/users", "NeeDo 运营后台"],
    ["merchant admin route", "/store-admin.html#/merchant-admin/orders", "NeeDo 商户后台"],
    ["affiliate admin route", "/afirieito-admin.html#/NDA-admin/tasks", "NDA管理后台"]
  ])("keeps the %s title mapped by portal-entry", (_route, url, title) => {
    window.history.pushState({ idx: 2 }, "", url);

    expect(document.title).toBe(title);
  });

  it("resynchronizes the title when browser history traversal emits popstate", () => {
    document.title = "NeeDo 商户端";
    setUrlWithoutNavigationEvent("/user.html#/");

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(document.title).toBe("NeeDo 用户端");
  });

  it("keeps native hash navigation synchronized", () => {
    document.title = "NeeDo 用户端";
    setUrlWithoutNavigationEvent("/user.html#/technician/profile");

    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(document.title).toBe("NeeDo 技师端");
  });
});
