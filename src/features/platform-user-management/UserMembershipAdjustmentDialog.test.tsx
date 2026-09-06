// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserMembershipAdjustmentDialog } from "./UserMembershipAdjustmentDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ adjustMembership: vi.fn() }));
vi.mock("./api", () => ({
  platformUserManagementApi: { adjustMembership: state.adjustMembership },
}));

function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) throw new Error("missing element");
  act(() => element.click());
}

describe("UserMembershipAdjustmentDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    state.adjustMembership.mockReset().mockResolvedValue({});
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("renders a separate right-side action for tier and multiplier", () => {
    act(() => root.render(<>
      <UserMembershipAdjustmentDialog currentValue="gold" expectedLockVersion={2} kind="tier" onSaved={vi.fn()} userId={41} />
      <UserMembershipAdjustmentDialog currentValue={1.25} expectedLockVersion={2} kind="multiplier" onSaved={vi.fn()} userId={41} />
    </>));
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "修改会员类型",
      "修改会员倍率",
    ]);
  });

  it("requires a reason and submits only the selected field", async () => {
    const onSaved = vi.fn();
    act(() => root.render(
      <UserMembershipAdjustmentDialog currentValue={1.25} expectedLockVersion={2} kind="multiplier" onSaved={onSaved} userId={41} />,
    ));
    click(container.querySelector("button"));
    click([...container.querySelectorAll("button")].find((button) => button.textContent === "保存调整") ?? null);
    expect(container.textContent).toContain("请填写调整理由");
    expect(state.adjustMembership).not.toHaveBeenCalled();

    const reason = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!reason) throw new Error("missing reason input");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(reason, "Approved retention adjustment");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click([...container.querySelectorAll("button")].find((button) => button.textContent === "保存调整") ?? null);
    await act(async () => { await Promise.resolve(); });
    expect(state.adjustMembership).toHaveBeenCalledWith(41, {
      multiplier: 1.25,
      reason: "Approved retention adjustment",
      expectedLockVersion: 2,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
