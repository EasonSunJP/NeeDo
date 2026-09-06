// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ApplicationDropdown } from "./ApplicationDropdown";
import { japanBanks } from "./japanBanks";
import { MerchantAccountTypeSelect } from "./MerchantAccountTypeSelect";
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));

it("anchors the account menu to its trigger and supports keyboard selection and dismissal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  try {
    await act(async () => root.render(<MerchantAccountTypeSelect onChange={onChange} value="ordinary" />));
    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    await act(async () => trigger.click());
    const list = container.querySelector('[role="listbox"]')!;
    expect(list.parentElement).toBe(trigger.parentElement);
    expect(list.className).toContain("absolute");
    expect(trigger.parentElement?.className).toContain("relative");
    expect([...list.querySelectorAll('[role="option"]')].map(e => e.textContent)).toEqual(["普通預金", "当座預金", "貯蓄預金", "その他"]);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onChange).toHaveBeenCalledWith("current");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});


it("caps the bank menu at ten rows and lets keyboard navigation reach the final bank", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  try {
    await act(async () => root.render(<ApplicationDropdown label="银行名称" onChange={onChange} options={japanBanks.map(bank => ({ value: bank.code, label: bank.name }))} value="" />));
    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    await act(async () => trigger.click());
    const list = container.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(list.style.maxHeight).toBe("454px");
    expect(list.className).toContain("overflow-y-auto");
    expect(list.className).toContain("touch-pan-y");
    expect(list.style.backgroundColor).toBe("var(--client-bg, #ffffff)");
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(japanBanks.length);
    const last = list.lastElementChild!;
    const lastTop = (japanBanks.length - 1) * 44 + 6;
    Object.defineProperty(last, "offsetTop", { value: lastTop });
    Object.defineProperty(last, "offsetHeight", { value: 44 });
    Object.defineProperty(list, "offsetTop", { value: 56 });
    Object.defineProperty(list, "clientHeight", { value: 440 });
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(list.scrollTop).toBe(lastTop + 44 - 440);
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onChange).toHaveBeenCalledWith(japanBanks.at(-1)!.code);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
