/** @vitest-environment jsdom */

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImMessageActionSheet, MessageBubble } from "./components";
import type { ImMessageActionSheetItem } from "./components";
import type { ConversationMessage } from "./model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildRect({
  bottom,
  height,
  left,
  top,
  width
}: {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

function buildActionSpies() {
  const spies = {
    copy: vi.fn(),
    delete: vi.fn(),
    forward: vi.fn(),
    pin: vi.fn(),
    recall: vi.fn(),
    reply: vi.fn()
  };
  const actions: ImMessageActionSheetItem[] = [
    { icon: "reply", key: "reply", label: "回复", onClick: spies.reply },
    { icon: "forward", key: "forward", label: "转发", onClick: spies.forward },
    { icon: "copy", key: "copy", label: "复制", onClick: spies.copy },
    { icon: "pin", key: "pin", label: "信息置顶", onClick: spies.pin },
    { icon: "delete", key: "recall", label: "撤回", onClick: spies.recall },
    { icon: "delete", key: "delete", label: "删除", onClick: spies.delete }
  ];

  return { actions, spies };
}

function dispatchPointerActivation(target: HTMLElement) {
  target.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
  target.dispatchEvent(new Event("pointerup", { bubbles: true, cancelable: true }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("ImMessageActionSheet", () => {
  it("portals above its message anchor and flips below only when the upper space is insufficient", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });

    const anchor = document.createElement("div");
    anchor.dataset.imMessageSide = "left";
    let anchorRect = buildRect({ bottom: 560, height: 60, left: 0, top: 500, width: 640 });
    document.body.append(anchor);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === anchor) {
        return anchorRect;
      }

      if (this.dataset.imMessageActionSheet === "true") {
        return buildRect({ bottom: 292, height: 280, left: 40, top: 12, width: 560 });
      }

      if (this.dataset.imMessageActionContent === "true") {
        return buildRect({ bottom: 284, height: 264, left: 48, top: 20, width: 544 });
      }

      return buildRect({ bottom: 0, height: 0, left: 0, top: 0, width: 0 });
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.imMessageActionSheet === "true" ? 280 : 0;
    });

    const shell = document.createElement("div");
    shell.className = "client-shell client-theme-night";
    const container = document.createElement("div");
    shell.append(container);
    document.body.append(shell);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(ImMessageActionSheet, {
        actions: [
          { icon: "reply", key: "reply", label: "回复", onClick: vi.fn() },
          { icon: "forward", key: "forward", label: "转发", onClick: vi.fn() },
          { icon: "copy", key: "copy", label: "复制", onClick: vi.fn() },
          { icon: "pin", key: "pin", label: "信息置顶", onClick: vi.fn() },
          { icon: "delete", key: "recall", label: "撤回", onClick: vi.fn() },
          { icon: "delete", key: "delete", label: "删除", onClick: vi.fn() }
        ],
        anchorElement: anchor,
        expanded: false,
        isNight: true,
        onClose: vi.fn(),
        onExpandedChange: vi.fn(),
        onReact: vi.fn()
      }));
    });

    const menu = document.querySelector<HTMLElement>("[data-im-message-action-sheet='true']");
    const menuPositioner = menu?.parentElement;
    const arrow = menuPositioner?.querySelector<HTMLElement>("[aria-hidden='true']");
    const reactions = menu?.querySelector<HTMLElement>('[data-im-message-action-section="reactions"]');
    const quickReactionGrid = reactions?.querySelector<HTMLElement>('[data-im-message-reaction-row="quick"]');
    const actionGrid = menu?.querySelector<HTMLElement>('[data-im-message-action-section="actions"]');
    const actionItem = menu?.querySelector<HTMLElement>('[data-im-message-action-item="true"]');

    expect(menu).not.toBeNull();
    expect(container.contains(menu)).toBe(false);
    expect(shell.contains(menu)).toBe(true);
    expect(menuPositioner?.style.position).toBe("fixed");
    expect(menuPositioner?.style.left).toBe("12px");
    expect(menuPositioner?.style.top).toBe("210px");
    expect(arrow?.className).toContain("-bottom-2");
    expect(actionGrid?.compareDocumentPosition(reactions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(actionGrid?.className).toContain("grid-cols-6");
    expect(actionGrid?.className).not.toContain("min-[480px]");
    expect(quickReactionGrid?.className).toContain("grid-cols-7");
    expect(quickReactionGrid?.className).not.toContain("min-[480px]");
    for (const emoji of ["🥹", "😭"]) {
      const button = [...(quickReactionGrid?.querySelectorAll("button") ?? [])]
        .find((candidate) => candidate.textContent?.trim() === emoji);
      expect(button).toBeDefined();
    }
    expect(actionGrid?.querySelectorAll('[data-im-message-action-item="true"]')).toHaveLength(6);
    expect(actionItem?.className).toContain("py-2");
    expect(actionItem?.querySelector("span")?.className).toContain("h-8");
    expect(
      [...menu!.querySelectorAll("button")].some((button) => button.textContent?.trim() === "收起")
    ).toBe(false);

    anchor.dataset.imMessageSide = "right";
    anchorRect = buildRect({ bottom: 84, height: 60, left: 0, top: 24, width: 640 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(menuPositioner?.style.left).toBe("68px");
    expect(menuPositioner?.style.top).toBe("94px");
    expect(arrow?.className).toContain("-top-2");
    expect(reactions?.compareDocumentPosition(actionGrid!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => root.unmount());
  });

  it.each([
    { contentWidth: 360, expectedActionLayout: "single-row", expectedReactionDensity: "full", expectedReactionCount: 7 },
    { contentWidth: 280, expectedActionLayout: "two-row", expectedReactionDensity: "compact", expectedReactionCount: 5 }
  ])("derives its compact layout from the rendered menu width: $contentWidth", async ({
    contentWidth,
    expectedActionLayout,
    expectedReactionCount,
    expectedReactionDensity
  }) => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });

    const anchor = document.createElement("div");
    anchor.dataset.imMessageSide = "right";
    document.body.append(anchor);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === anchor) {
        return buildRect({ bottom: 560, height: 60, left: 0, top: 500, width: 640 });
      }

      if (this.dataset.imMessageActionSheet === "true") {
        return buildRect({ bottom: 292, height: 280, left: 40, top: 12, width: contentWidth + 16 });
      }

      if (this.dataset.imMessageActionContent === "true") {
        return buildRect({ bottom: 284, height: 264, left: 48, top: 20, width: contentWidth });
      }

      return buildRect({ bottom: 0, height: 0, left: 0, top: 0, width: 0 });
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.imMessageActionSheet === "true" ? 280 : 0;
    });

    const shell = document.createElement("div");
    shell.className = "client-shell client-theme-night";
    const container = document.createElement("div");
    shell.append(container);
    document.body.append(shell);
    const root = createRoot(container);
    const { actions } = buildActionSpies();

    await act(async () => {
      root.render(createElement(ImMessageActionSheet, {
        actions,
        anchorElement: anchor,
        expanded: false,
        isNight: true,
        onClose: vi.fn(),
        onExpandedChange: vi.fn(),
        onReact: vi.fn()
      }));
    });

    const menu = document.querySelector<HTMLElement>("[data-im-message-action-sheet='true']");
    const actionGrid = menu?.querySelector<HTMLElement>('[data-im-message-action-section="actions"]');
    const quickReactionGrid = menu?.querySelector<HTMLElement>('[data-im-message-reaction-row="quick"]');

    expect(actionGrid?.dataset.imMessageActionLayout).toBe(expectedActionLayout);
    expect(quickReactionGrid?.dataset.imMessageReactionDensity).toBe(expectedReactionDensity);
    expect(quickReactionGrid?.querySelectorAll("button")).toHaveLength(expectedReactionCount);
    expect(actionGrid?.className).not.toContain("min-[480px]");
    expect(quickReactionGrid?.className).not.toContain("min-[480px]");

    await act(async () => root.unmount());
  });

  it("ignores the release click from the long-press that opened the backdrop", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });

    const anchor = document.createElement("div");
    anchor.dataset.imMessageSide = "left";
    document.body.append(anchor);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === anchor) {
        return buildRect({ bottom: 560, height: 60, left: 0, top: 500, width: 640 });
      }
      if (this.dataset.imMessageActionSheet === "true") {
        return buildRect({ bottom: 292, height: 280, left: 40, top: 12, width: 376 });
      }
      if (this.dataset.imMessageActionContent === "true") {
        return buildRect({ bottom: 284, height: 264, left: 48, top: 20, width: 360 });
      }
      return buildRect({ bottom: 0, height: 0, left: 0, top: 0, width: 0 });
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.imMessageActionSheet === "true" ? 280 : 0;
    });

    const shell = document.createElement("div");
    shell.className = "client-shell client-theme-night";
    const container = document.createElement("div");
    shell.append(container);
    document.body.append(shell);
    const root = createRoot(container);
    const onClose = vi.fn();
    const { actions } = buildActionSpies();

    await act(async () => {
      root.render(
        <ImMessageActionSheet
          actions={actions}
          anchorElement={anchor}
          expanded={false}
          isNight
          onClose={onClose}
          onExpandedChange={vi.fn()}
          onReact={vi.fn()}
        />
      );
    });

    const backdrop = document.querySelector<HTMLButtonElement>('[aria-label="关闭消息操作菜单"]');
    expect(backdrop).not.toBeNull();

    await act(async () => {
      backdrop!.dispatchEvent(new Event("pointerup", { bubbles: true, cancelable: true }));
      backdrop!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      backdrop!.blur();
      backdrop!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      dispatchPointerActivation(backdrop!);
    });
    expect(onClose).not.toHaveBeenCalled();

    now.mockReturnValue(1_400);
    await act(async () => {
      dispatchPointerActivation(backdrop!);
    });
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("keeps every action and quick reaction alive through a full pointer sequence", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });

    const anchor = document.createElement("div");
    anchor.dataset.imMessageSide = "left";
    document.body.append(anchor);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === anchor) {
        return buildRect({ bottom: 560, height: 60, left: 0, top: 500, width: 640 });
      }

      if (this.dataset.imMessageActionSheet === "true") {
        return buildRect({ bottom: 292, height: 280, left: 40, top: 12, width: 376 });
      }

      if (this.dataset.imMessageActionContent === "true") {
        return buildRect({ bottom: 284, height: 264, left: 48, top: 20, width: 360 });
      }

      return buildRect({ bottom: 0, height: 0, left: 0, top: 0, width: 0 });
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.imMessageActionSheet === "true" ? 280 : 0;
    });

    const shell = document.createElement("div");
    shell.className = "client-shell client-theme-night";
    const container = document.createElement("div");
    shell.append(container);
    document.body.append(shell);
    const root = createRoot(container);
    const outerPointerDown = vi.fn();
    const onExpandedChange = vi.fn();
    const onReact = vi.fn();
    const { actions, spies } = buildActionSpies();

    function ClosingHarness() {
      const [open, setOpen] = useState(true);
      return (
        <div
          onPointerDown={() => {
            outerPointerDown();
            setOpen(false);
          }}
        >
          {open ? (
            <ImMessageActionSheet
              actions={actions}
              anchorElement={anchor}
              expanded={false}
              isNight
              onClose={vi.fn()}
              onExpandedChange={onExpandedChange}
              onReact={onReact}
            />
          ) : null}
        </div>
      );
    }

    await act(async () => {
      root.render(<ClosingHarness />);
    });

    await act(async () => {
      for (const button of document.querySelectorAll<HTMLElement>('[data-im-message-action-item="true"]')) {
        dispatchPointerActivation(button);
      }

      const quickReactionRow = document.querySelector<HTMLElement>('[data-im-message-reaction-row="quick"]');
      for (const emoji of ["OK", "😂", "🤣", "👍", "🥹", "😭"]) {
        const reactionButton = [...(quickReactionRow?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
          .find((button) => button.textContent?.trim() === emoji);
        expect(reactionButton).toBeDefined();
        dispatchPointerActivation(reactionButton!);
      }

      const moreButton = quickReactionRow?.querySelector<HTMLButtonElement>('[aria-label="展开默认表情"]');
      expect(moreButton).not.toBeNull();
      dispatchPointerActivation(moreButton!);
    });

    expect(outerPointerDown).not.toHaveBeenCalled();
    for (const actionSpy of Object.values(spies)) {
      expect(actionSpy).toHaveBeenCalledTimes(1);
    }
    expect(onReact.mock.calls.map(([emoji]) => emoji)).toEqual(["OK", "😂", "🤣", "👍", "🥹", "😭"]);
    expect(onExpandedChange).toHaveBeenCalledOnce();
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    const menu = document.querySelector<HTMLElement>("[data-im-message-action-sheet='true']");
    const contextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    menu?.dispatchEvent(contextMenuEvent);
    expect(contextMenuEvent.defaultPrevented).toBe(true);

    await act(async () => root.unmount());
  });
});

describe("MessageBubble reactions", () => {
  it("keeps every reactor name inline without opening a separate avatar overlay", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const message: ConversationMessage = {
      id: "message-1",
      localId: "message-1",
      conversationId: "conversation-1",
      senderId: "sender-1",
      type: "text",
      content: "收到",
      status: "sent",
      sentAt: "2026-08-29T00:00:00.000Z",
      clientSeq: 1
    };

    await act(async () => {
      root.render(createElement(MessageBubble, {
        message,
        isMine: true,
        reactions: [{
          emoji: "😂",
          people: [
            { id: "user-1", name: "第一位", avatar: "/avatar-1.png" },
            { id: "user-2", name: "第二位", avatar: "/avatar-2.png" }
          ]
        }]
      }));
    });

    expect(container.textContent).toContain("第一位、第二位");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("第一位、第二位"))).toBe(false);
    expect(container.querySelector('img[alt="第一位"]')).toBeNull();
    expect(container.querySelector('img[alt="第二位"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
