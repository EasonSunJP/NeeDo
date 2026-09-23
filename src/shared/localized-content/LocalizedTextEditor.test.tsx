// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalizedTextEditor } from "./LocalizedTextEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];
afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

describe("LocalizedTextEditor", () => {
  it("shows the same quick locale rail used by the shop editor", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    await act(async () => root.render(<LocalizedTextEditor fields={[{ key: "bio", label: "自我介绍", maxLength: 2000, multiline: true }]} fallback={{ bio: "" }} onSave={async () => undefined} onSyncAll={async () => undefined} translations={{}} />));
    expect(container.querySelector('[data-testid="localized-content-locale-rail"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="localized-content-locale-rail"]')?.className).toContain("fixed right-");
    expect(container.querySelector('[data-testid="localized-content-locale-rail"] [role="tablist"]')?.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(container.querySelector('[data-testid="localized-content-locale-rail"] button[aria-label="同步到全部语言版本"]')).not.toBeNull();
  });
  it("copies Japanese text into every locale without checking its script", async () => {
    const onSyncAll = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    await act(async () => root.render(<LocalizedTextEditor fields={[{ key: "bio", label: "自我介绍", maxLength: 2000, multiline: true }]} fallback={{ bio: "" }} onSave={async () => undefined} onSyncAll={onSyncAll} translations={{ ja: { bio: "日本語でのみ対応します" } }} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"][aria-label="日本語"]')?.click());
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="同步到全部语言版本"]')?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[role="alertdialog"] button:last-child')?.click());
    expect(onSyncAll).toHaveBeenCalledWith("ja", { bio: "日本語でのみ対応します" });
  });
  it("saves the selected language and retains another language's authored draft", async () => {
    const onSave = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    await act(async () => root.render(<LocalizedTextEditor fields={[{ key: "bio", label: "自我介绍", maxLength: 2000, multiline: true }]} fallback={{ bio: "原文" }} onSave={onSave} translations={{ ja: { bio: "自己紹介" }, en: { bio: "About me" } }} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"][aria-label="English"]')?.click());
    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(input.value).toBe("About me");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(input, "New English bio");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"][aria-label="日本語"]')?.click());
    expect(container.querySelector("textarea")?.value).toBe("自己紹介");
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"][aria-label="English"]')?.click());
    expect(container.querySelector("textarea")?.value).toBe("New English bio");
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="localized-content-locale-rail"] button:not([role="tab"])')?.click());
    expect(onSave).toHaveBeenCalledWith("en", { bio: "New English bio" });
  });
});
