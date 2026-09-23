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
  it("saves the selected language and retains another language's authored draft", async () => {
    const onSave = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    await act(async () => root.render(<LocalizedTextEditor fields={[{ key: "bio", label: "自我介绍", maxLength: 2000, multiline: true }]} fallback={{ bio: "原文" }} onSave={onSave} translations={{ ja: { bio: "自己紹介" }, en: { bio: "About me" } }} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"]:nth-child(4)')?.click());
    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(input.value).toBe("About me");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(input, "New English bio");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"]:nth-child(3)')?.click());
    expect(container.querySelector("textarea")?.value).toBe("自己紹介");
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"]:nth-child(4)')?.click());
    expect(container.querySelector("textarea")?.value).toBe("New English bio");
    await act(async () => container.querySelector<HTMLButtonElement>("section > div:last-child > button")?.click());
    expect(onSave).toHaveBeenCalledWith("en", { bio: "New English bio" });
  });
});
