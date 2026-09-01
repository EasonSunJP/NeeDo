// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceReviewPrompt } from "./ServiceSessionUi";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ServiceReviewPrompt formal order mode", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses integer stars, accepts a comment, and submits labels without fake counts", () => {
    const onSubmit = vi.fn();
    act(() => root.render(
      <ServiceReviewPrompt
        commentEnabled
        helperMessage="本次评价提交后不可修改"
        integerRating
        message="请评价本次服务"
        onSkip={vi.fn()}
        onSubmit={onSubmit}
        showTagCounts={false}
        tagOptions={["魅力值", "服务精神"]}
        title="评价技师"
      />
    ));
    expect(container.querySelector('[aria-label="4.5星"]')).toBeNull();
    expect(container.textContent).not.toContain("×0");
    expect(container.textContent).toContain("本次评价提交后不可修改");
    act(() => (container.querySelector('[aria-label="4星"]') as HTMLButtonElement).click());
    const tag = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "服务精神")!;
    act(() => tag.click());
    const comment = container.querySelector('textarea[aria-label="评价留言"]') as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(comment, "服务很好");
      comment.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "提交评价")!;
    act(() => submit.click());
    expect(onSubmit).toHaveBeenCalledWith({ rating: 4, tags: ["服务精神"], comment: "服务很好" });
  });

  it("shows retryable error and disables close, skip, editing, and double submit while pending", () => {
    const onSkip = vi.fn();
    const onSubmit = vi.fn();
    act(() => root.render(
      <ServiceReviewPrompt
        error="提交失败，请重试"
        integerRating
        message="请评价"
        onSkip={onSkip}
        onSubmit={onSubmit}
        pending
        showTagCounts={false}
        tagOptions={["礼貌友好"]}
        title="评价用户"
      />
    ));
    expect(container.textContent).toContain("提交失败，请重试");
    expect(container.querySelector('[aria-label="关闭评价"]')).toBeNull();
    const buttons = Array.from(container.querySelectorAll("button")).filter((button) =>
      button.textContent === "跳过不评价" ||
      button.textContent === "提交评价" ||
      button.textContent === "礼貌友好" ||
      button.getAttribute("aria-label")?.endsWith("星")
    );
    expect(buttons.every((button) => button.disabled)).toBe(true);
    buttons.forEach((button) => button.click());
    expect(onSkip).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
