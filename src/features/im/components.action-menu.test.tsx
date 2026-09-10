/** @vitest-environment jsdom */

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImMessageActionSheet, ImMessageSelectionHandles, ImQuotedMessagePreview, MessageBubble } from "./components";
import type { ImMessageActionSheetItem } from "./components";
import type { ConversationMessage } from "./model";
import { getRecentImReactionSnapshot, recordRecentImReaction } from "./reaction-catalog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

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
    reply: vi.fn(),
    translate: vi.fn(),
    multiselect: vi.fn(),
  };
  const actions: ImMessageActionSheetItem[] = [
    { icon: "reply", key: "reply", label: "回复", onClick: spies.reply },
    { icon: "forward", key: "forward", label: "转发", onClick: spies.forward },
    { icon: "copy", key: "copy", label: "复制", onClick: spies.copy },
    { icon: "translate", key: "translate", label: "翻译", onClick: spies.translate },
    { icon: "pin", key: "pin", label: "信息置顶", onClick: spies.pin },
    { icon: "delete", key: "recall", label: "撤回", onClick: spies.recall },
    { icon: "delete", key: "delete", label: "删除", onClick: spies.delete },
    { icon: "select", key: "multiselect", label: "多选", onClick: spies.multiselect },
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

describe("ImMessageSelectionHandles", () => {
  it("calls onDragStart before pointer capture and keeps preventing scroll during handle movement", async () => {
    const messageRoot = document.createElement("div");
    const textRoot = document.createElement("p");
    textRoot.dataset.imMessageSelectableText = "true";
    textRoot.append(document.createTextNode("hello"));
    messageRoot.append(textRoot);
    document.body.append(messageRoot);
    const range = document.createRange();
    range.selectNodeContents(textRoot);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [buildRect({ bottom: 40, height: 20, left: 10, top: 20, width: 60 })],
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => buildRect({ bottom: 40, height: 20, left: 10, top: 20, width: 60 }),
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const onDragStart = vi.fn();
    const setPointerCapture = vi.fn(() => expect(onDragStart).toHaveBeenCalledOnce());
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: setPointerCapture });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ImMessageSelectionHandles active messageRoot={messageRoot} onDragStart={onDragStart} />);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    const handle = container.querySelector<HTMLButtonElement>(".im-message-selection-handle--start");
    expect(handle).not.toBeNull();
    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
    Object.defineProperty(pointerDown, "pointerId", { value: 1 });
    await act(async () => handle?.dispatchEvent(pointerDown));
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(setPointerCapture).toHaveBeenCalledWith(1);

    const pointerMove = new MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: 20, clientY: 25 });
    Object.defineProperty(pointerMove, "pointerId", { value: 1 });
    window.dispatchEvent(pointerMove);
    expect(pointerMove.defaultPrevented).toBe(true);
    await act(async () => root.unmount());
  });
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
          { icon: "translate", key: "translate", label: "翻译", onClick: vi.fn() },
          { icon: "pin", key: "pin", label: "信息置顶", onClick: vi.fn() },
          { icon: "delete", key: "recall", label: "撤回", onClick: vi.fn() },
          { icon: "delete", key: "delete", label: "删除", onClick: vi.fn() },
          { icon: "select", key: "multiselect", label: "多选", onClick: vi.fn() },
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
    const backdrop = document.querySelector<HTMLButtonElement>('[aria-label="关闭消息操作菜单"]');
    const backdropRule = stylesSource.match(/\.im-message-action-backdrop\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(menu).not.toBeNull();
    expect(container.contains(menu)).toBe(false);
    expect(shell.contains(menu)).toBe(true);
    expect(menu?.classList.contains("client-liquid-glass-surface")).toBe(true);
    expect(menu?.className).not.toContain("var(--client-elevated)_98%");
    expect(backdrop?.classList.contains("im-message-action-backdrop")).toBe(true);
    expect(backdrop?.className).not.toContain("backdrop-blur");
    expect(backdropRule).toContain("-webkit-backdrop-filter: none");
    expect(backdropRule).toContain("backdrop-filter: none");
    expect(backdropRule).toContain("filter: none");
    expect(menuPositioner?.style.position).toBe("fixed");
    expect(menuPositioner?.style.left).toBe("12px");
    expect(menuPositioner?.style.top).toBe("210px");
    expect(arrow?.className).toContain("client-liquid-glass-arrow");
    expect(arrow?.className).toContain("-bottom-2");
    expect(actionGrid?.compareDocumentPosition(reactions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(actionGrid?.className).toContain("grid-cols-4");
    expect(actionGrid?.dataset.imMessageActionLayout).toBe("two-row");
    expect(actionGrid?.className).not.toContain("min-[480px]");
    expect(quickReactionGrid?.className).toContain("grid-cols-7");
    expect(quickReactionGrid?.className).not.toContain("min-[480px]");
    for (const emoji of ["🥹", "🙏"]) {
      const button = [...(quickReactionGrid?.querySelectorAll("button") ?? [])]
        .find((candidate) => candidate.textContent?.trim() === emoji);
      expect(button).toBeDefined();
    }
    expect(actionGrid?.querySelectorAll('[data-im-message-action-item="true"]')).toHaveLength(8);
    expect(actionGrid?.textContent).toContain("翻译");
    expect(actionGrid?.textContent).toContain("多选");
    expect(actionItem?.className).toContain("min-h-11");
    expect(actionItem?.className).toContain("py-1");
    expect(actionItem?.querySelector("span")?.className).toContain("h-7");
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
    { contentWidth: 360, expectedReactionDensity: "full", expectedReactionCount: 7 },
    { contentWidth: 280, expectedReactionDensity: "compact", expectedReactionCount: 5 }
  ])("derives its compact layout from the rendered menu width: $contentWidth", async ({
    contentWidth,
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

    expect(actionGrid?.dataset.imMessageActionLayout).toBe("two-row");
    expect(actionGrid?.className).toContain("grid-cols-4");
    expect(quickReactionGrid?.dataset.imMessageReactionDensity).toBe(expectedReactionDensity);
    expect(quickReactionGrid?.querySelectorAll("button")).toHaveLength(expectedReactionCount);
    expect(actionGrid?.className).not.toContain("min-[480px]");
    expect(quickReactionGrid?.className).not.toContain("min-[480px]");

    await act(async () => root.unmount());
  });

  it("keeps the common reaction snapshot stable until the menu is reopened", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });
    const anchor = document.createElement("div");
    anchor.dataset.imMessageSide = "left";
    document.body.append(anchor);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === anchor) return buildRect({ bottom: 560, height: 60, left: 0, top: 500, width: 640 });
      if (this.dataset.imMessageActionSheet === "true") return buildRect({ bottom: 292, height: 280, left: 40, top: 12, width: 376 });
      if (this.dataset.imMessageActionContent === "true") return buildRect({ bottom: 284, height: 264, left: 48, top: 20, width: 360 });
      return buildRect({ bottom: 0, height: 0, left: 0, top: 0, width: 0 });
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const { actions } = buildActionSpies();
    const renderMenu = async (open: boolean) => {
      await act(async () => root.render(open ? <ImMessageActionSheet actions={actions} anchorElement={anchor} expanded={false} isNight onClose={vi.fn()} onExpandedChange={vi.fn()} onReact={vi.fn()} /> : null));
    };
    const readQuickOrder = () => [...document.querySelectorAll<HTMLElement>('[data-im-message-reaction-row="quick"] [data-im-reaction-value]')].map((item) => item.dataset.imReactionValue);

    await renderMenu(true);
    const before = readQuickOrder();
    const next = getRecentImReactionSnapshot().find((reaction) => reaction !== before[0])!;
    recordRecentImReaction(next);
    expect(readQuickOrder()).toEqual(before);

    await renderMenu(false);
    await renderMenu(true);
    expect(readQuickOrder()[0]).toBe(next);
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
      for (const emoji of ["😀", "😂", "🥹", "👌", "👍", "🙏"]) {
        const reactionButton = [...(quickReactionRow?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
          .find((button) => button.textContent?.trim() === emoji);
        expect(reactionButton).toBeDefined();
        dispatchPointerActivation(reactionButton!);
      }

      const moreButton = quickReactionRow?.querySelector<HTMLButtonElement>('[aria-label="展开更多回复"]');
      expect(moreButton).not.toBeNull();
      dispatchPointerActivation(moreButton!);
    });

    expect(outerPointerDown).not.toHaveBeenCalled();
    for (const actionSpy of Object.values(spies)) {
      expect(actionSpy).toHaveBeenCalledTimes(1);
    }
    expect(onReact.mock.calls.map(([emoji]) => emoji)).toEqual(["😀", "😂", "🥹", "👌", "👍", "🙏"]);
    expect(onExpandedChange).toHaveBeenCalledOnce();
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    const menu = document.querySelector<HTMLElement>("[data-im-message-action-sheet='true']");
    const contextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    menu?.dispatchEvent(contextMenuEvent);
    expect(contextMenuEvent.defaultPrevented).toBe(true);

    const actionLayer = document.querySelector<HTMLElement>("[data-im-message-action-layer='true']");
    const layerContextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    actionLayer?.dispatchEvent(layerContextMenuEvent);
    expect(layerContextMenuEvent.defaultPrevented).toBe(true);

    const backdrop = document.querySelector<HTMLButtonElement>('[aria-label="关闭消息操作菜单"]');
    const backdropContextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    backdrop?.dispatchEvent(backdropContextMenuEvent);
    expect(backdropContextMenuEvent.defaultPrevented).toBe(true);

    await act(async () => root.unmount());
  });

  it("keeps selected replies active while natively disabling the other values in each occupied category", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });
    const anchor = document.createElement("div");
    anchor.dataset.imMessageSide = "left";
    document.body.append(anchor);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === anchor) return buildRect({ bottom: 560, height: 60, left: 0, top: 500, width: 360 });
      if (this.dataset.imMessageActionSheet === "true") return buildRect({ bottom: 292, height: 280, left: 20, top: 12, width: 376 });
      if (this.dataset.imMessageActionContent === "true") return buildRect({ bottom: 284, height: 264, left: 28, top: 20, width: 360 });
      return buildRect({ bottom: 0, height: 0, left: 0, top: 0, width: 0 });
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onReact = vi.fn();

    await act(async () => {
      root.render(
        <ImMessageActionSheet
          actions={[]}
          anchorElement={anchor}
          expanded
          isNight
          onClose={vi.fn()}
          onExpandedChange={vi.fn()}
          onReact={onReact}
          selectedEmoji="😂"
          selectedJudgement="OK"
        />
      );
    });

    let buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-im-reaction-value]")];
    expect(buttons.filter((button) => button.dataset.imReactionValue === "OK").every((button) => !button.disabled)).toBe(true);
    expect(buttons.filter((button) => button.dataset.imReactionValue === "😂").every((button) => !button.disabled)).toBe(true);
    expect(buttons.filter((button) => button.dataset.imReactionValue === "NO").every((button) => button.disabled)).toBe(true);
    expect(buttons.filter((button) => button.dataset.imReactionValue === "👍").every((button) => button.disabled)).toBe(true);
    expect(buttons.find((button) => button.dataset.imReactionValue === "OK")?.dataset.imReactionSelected).toBe("true");

    await act(async () => {
      buttons.find((button) => button.dataset.imReactionValue === "NO")?.click();
    });
    expect(onReact).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <ImMessageActionSheet
          actions={[]}
          anchorElement={anchor}
          expanded
          isNight
          onClose={vi.fn()}
          onExpandedChange={vi.fn()}
          onReact={onReact}
          pendingCategory="judgement"
        />
      );
    });

    buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-im-reaction-value]")];
    expect(buttons.filter((button) => button.dataset.imReactionCategory === "judgement").every((button) => button.disabled)).toBe(true);
    expect(buttons.filter((button) => button.dataset.imReactionCategory === "emoji").some((button) => !button.disabled)).toBe(true);

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
        reactions: [
          {
            emoji: "Thanks",
            people: [{ id: "user-1", name: "第一位", avatar: "/avatar-1.png" }]
          },
          {
            emoji: "😂",
            people: [{ id: "user-2", name: "第二位", avatar: "/avatar-2.png" }]
          }
        ]
      }));
    });

    expect(container.textContent).toContain("第一位");
    expect(container.textContent).toContain("第二位");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("第一位、第二位"))).toBe(false);
    expect(container.querySelector('img[alt="第一位"]')).toBeNull();
    expect(container.querySelector('img[alt="第二位"]')).toBeNull();
    const thanksImage = container.querySelector<HTMLImageElement>('button img[alt="Thanks"]');
    expect(thanksImage).not.toBeNull();
    const thanksImageClasses = thanksImage?.className.split(/\s+/) ?? [];
    expect(thanksImageClasses).toContain("h-[22px]");
    expect(thanksImageClasses).toContain("max-w-none");
    expect(thanksImageClasses).not.toContain("max-w-full");

    const ordinaryEmojiButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "😂"
    );
    expect(
      ordinaryEmojiButton?.querySelector("span")?.className.split(/\s+/) ?? []
    ).not.toContain("h-[22px]");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("😂"))).toBe(true);

    await act(async () => root.unmount());
  });
});

describe("MessageBubble judgement message content", () => {
  it("keeps judgement values as sticker images in a failed outgoing bubble", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const message: ConversationMessage = {
      id: "message-rich-failed-1",
      localId: "message-rich-failed-1",
      conversationId: "conversation-1",
      senderId: "sender-1",
      type: "text",
      content: "NOThanks😁OK😊",
      status: "failed",
      failureReason: "not_friends",
      sentAt: "2026-08-30T10:38:00.000Z",
      clientSeq: 1,
      ext: {
        richText: {
          version: 1,
          parts: [
            { type: "judgement", value: "NO" },
            { type: "judgement", value: "Thanks" },
            { type: "text", value: "😁" },
            { type: "judgement", value: "OK" },
            { type: "text", value: "😊" }
          ]
        }
      } as ConversationMessage["ext"]
    };

    await act(async () => {
      root.render(createElement(MessageBubble, { message, isMine: true }));
    });

    const richText = container.querySelector<HTMLElement>('[data-im-message-rich-text="true"]');
    expect(richText).not.toBeNull();
    expect([...richText!.querySelectorAll("img")].map((image) => image.alt)).toEqual([
      "NO",
      "Thanks",
      "OK"
    ]);
    expect(richText!.textContent).toBe("😁😊");
    expect(richText!.textContent).not.toContain("NOThanks");
    expect(container.textContent).toContain("对方不是你的好友，信息发送失败");

    await act(async () => root.unmount());
  });
});

describe("MessageBubble quoted media", () => {
  const message: ConversationMessage = {
    id: "reply-1",
    localId: "reply-1",
    conversationId: "conversation-1",
    senderId: "sender-1",
    type: "text",
    content: "收到",
    quotedMessageId: "image-1",
    status: "sent",
    sentAt: "2026-08-30T00:00:00.000Z",
    clientSeq: 2
  };

  it("renders a reduced media thumbnail and caption without exposing the media URL", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const quotedMessage: ConversationMessage = {
      id: "image-1",
      localId: "image-1",
      conversationId: "conversation-1",
      senderId: "sender-2",
      type: "image",
      content: "http://localhost:3000/media/im/original.jpg",
      status: "sent",
      sentAt: "2026-08-29T00:00:00.000Z",
      clientSeq: 1,
      ext: {
        caption: "活动海报",
        thumbnailUrl: "http://localhost:3000/media/im/thumbnail.jpg"
      }
    };

    await act(async () => {
      root.render(createElement(MessageBubble, {
        message,
        isMine: true,
        quotedMessage,
        quotedSenderName: "松本 琴音"
      }));
    });

    expect(container.textContent).toContain("活动海报");
    expect(container.textContent).not.toContain(quotedMessage.content);
    expect(container.querySelector('[data-im-quoted-media="image"] img')?.getAttribute("src")).toBe(quotedMessage.ext?.thumbnailUrl);

    await act(async () => root.unmount());
  });

  it("renders only the reduced media when the quoted media has no caption", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const quotedMessage: ConversationMessage = {
      id: "image-2",
      localId: "image-2",
      conversationId: "conversation-1",
      senderId: "sender-2",
      type: "image",
      content: "http://localhost:3000/media/im/only-media.jpg",
      status: "sent",
      sentAt: "2026-08-29T00:01:00.000Z",
      clientSeq: 1
    };

    await act(async () => {
      root.render(createElement(MessageBubble, {
        message,
        isMine: true,
        quotedMessage,
        quotedSenderName: "松本 琴音"
      }));
    });

    expect(container.querySelector('[data-im-quoted-media="image"] img')).not.toBeNull();
    expect(container.textContent).not.toContain(quotedMessage.content);
    expect(container.querySelector('[data-im-quoted-media-caption="true"]')).toBeNull();

    await act(async () => root.unmount());
  });
});

describe("MessageBubble translation display boundary", () => {
  const japaneseTranslation = (content: string) => ({ content, language: "ja", visible: true } as const);
  const messageBase = {
    conversationId: "conversation-translation-1",
    senderId: "sender-1",
    status: "sent" as const,
    sentAt: "2026-08-30T00:00:00.000Z",
    clientSeq: 1
  };

  it("translates only the other party's body text", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const message: ConversationMessage = {
      ...messageBase,
      id: "translation-body-1",
      localId: "translation-body-1",
      type: "text",
      content: "测试测试"
    };

    await act(async () => {
      root.render(createElement(MessageBubble, { message, isMine: true }));
    });
    expect(container.textContent).toContain("测试测试");

    await act(async () => {
      root.render(createElement(MessageBubble, { message, isMine: true, translation: japaneseTranslation("テストテスト") }));
    });
    expect(container.textContent).toContain("测试测试");
    expect(container.querySelector('[data-im-message-translation="true"]')?.textContent).toBe("テストテスト");

    await act(async () => {
      root.render(createElement(MessageBubble, { message, isMine: false, translation: japaneseTranslation("テストテスト") }));
    });
    expect(container.textContent).toContain("测试测试");
    expect(container.textContent).toContain("テストテスト");
    expect(container.querySelector('[data-no-i18n][data-im-message-selectable-text="true"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps judgement SVGs while translating only adjacent rich text", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const message: ConversationMessage = {
      ...messageBase,
      id: "translation-judgement-1",
      localId: "translation-judgement-1",
      type: "text",
      content: "Done测试OK",
      ext: {
        richText: {
          version: 1,
          parts: [
            { type: "judgement", value: "Done" },
            { type: "text", value: "测试" },
            { type: "judgement", value: "OK" }
          ]
        }
      }
    };

    await act(async () => {
      root.render(createElement(MessageBubble, { message, isMine: false, translation: japaneseTranslation("DoneテストOK") }));
    });

    const richText = container.querySelector<HTMLElement>('[data-im-message-rich-text="true"]');
    expect(richText?.textContent).toBe("测试");
    expect([...richText!.querySelectorAll("img")].map((image) => image.alt)).toEqual(["Done", "OK"]);
    expect(container.querySelector('[data-im-message-translation="true"]')?.textContent).toBe("DoneテストOK");

    await act(async () => root.unmount());
  });

  it("translates an incoming media caption but keeps quoted previews raw", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const mediaMessage: ConversationMessage = {
      ...messageBase,
      id: "translation-media-1",
      localId: "translation-media-1",
      type: "image",
      content: "/media/image.jpg",
      ext: { caption: "测试测试", thumbnailUrl: "/media/thumb.jpg" }
    };
    const quotedText: ConversationMessage = {
      ...messageBase,
      id: "translation-quoted-text-1",
      localId: "translation-quoted-text-1",
      type: "text",
      content: "测试测试"
    };
    const quotedMedia: ConversationMessage = {
      ...messageBase,
      id: "translation-quoted-media-1",
      localId: "translation-quoted-media-1",
      type: "video",
      content: "/media/video.mp4",
      ext: { caption: "测试测试", thumbnailUrl: "/media/video.jpg" }
    };

    await act(async () => {
      root.render(createElement("div", null,
        createElement("section", { "data-test-main-media-caption": "true" },
          createElement(MessageBubble, { message: mediaMessage, isMine: false, translation: japaneseTranslation("テストテスト") })
        ),
        createElement("section", { "data-test-quoted-text": "true" },
          createElement(ImQuotedMessagePreview, { message: quotedText })
        ),
        createElement("section", { "data-test-quoted-media-caption": "true" },
          createElement(ImQuotedMessagePreview, { message: quotedMedia })
        )
      ));
    });

    expect(container.querySelector('[data-test-main-media-caption] [data-no-i18n]')?.textContent).toBe("测试测试");
    expect(container.querySelector('[data-test-main-media-caption] [data-im-message-translation="true"]')?.textContent).toBe("テストテスト");
    expect(container.querySelector('[data-test-quoted-text] [data-no-i18n]')?.textContent).toBe("测试测试");
    expect(container.querySelector('[data-test-quoted-media-caption] [data-im-quoted-media-caption="true"] [data-no-i18n]')?.textContent).toBe("测试测试");

    await act(async () => root.unmount());
  });

  it("keeps actual file names raw and protected with translation enabled or disabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const fileMessage: ConversationMessage = {
      ...messageBase,
      id: "translation-file-name-1",
      localId: "translation-file-name-1",
      type: "file",
      content: "/media/file.bin",
      ext: { fileName: "文件" }
    };

    await act(async () => {
      root.render(createElement("div", null,
        createElement("section", { "data-test-main-file-name": "true" },
          createElement(MessageBubble, { message: fileMessage, isMine: true, translation: japaneseTranslation("ファイル") })
        ),
        createElement("section", { "data-test-quoted-file-name-enabled": "true" },
          createElement(ImQuotedMessagePreview, { message: fileMessage })
        ),
        createElement("section", { "data-test-quoted-file-name-disabled": "true" },
          createElement(ImQuotedMessagePreview, { message: fileMessage })
        )
      ));
    });

    for (const selector of [
      "[data-test-main-file-name]",
      "[data-test-quoted-file-name-enabled]",
      "[data-test-quoted-file-name-disabled]",
    ]) {
      const fileRoot = container.querySelector<HTMLElement>(selector);
      expect(fileRoot?.textContent).toContain("文件");
      expect(fileRoot?.textContent).not.toContain("ファイル");
      expect(fileRoot?.querySelector("[data-no-i18n]")?.textContent).toBe("文件");
    }

    await act(async () => root.unmount());
  });

  it("keeps quoted file captions raw even when bubble translation is enabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const fileMessage: ConversationMessage = {
      ...messageBase,
      id: "translation-file-caption-1",
      localId: "translation-file-caption-1",
      type: "file",
      content: "/media/file.bin",
      ext: { caption: "测试测试", fileName: "文件" }
    };

    await act(async () => {
      root.render(createElement("div", null,
        createElement("section", { "data-test-quoted-file-caption-enabled": "true" },
          createElement(ImQuotedMessagePreview, { message: fileMessage })
        ),
        createElement("section", { "data-test-quoted-file-caption-disabled": "true" },
          createElement(ImQuotedMessagePreview, { message: fileMessage })
        )
      ));
    });

    expect(container.querySelector("[data-test-quoted-file-caption-enabled]")?.textContent).toBe("测试测试");
    expect(container.querySelector("[data-test-quoted-file-caption-disabled]")?.textContent).toBe("测试测试");

    await act(async () => root.unmount());
  });

  it("leaves quoted and main fallback file labels on normal UI i18n", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const fileMessage: ConversationMessage = {
      ...messageBase,
      id: "translation-file-fallback-1",
      localId: "translation-file-fallback-1",
      type: "file",
      content: "/media/file.bin"
    };

    await act(async () => {
      root.render(createElement("div", null,
        createElement("section", { "data-test-main-file-fallback": "true" },
          createElement(MessageBubble, { message: fileMessage, isMine: true, translation: japaneseTranslation("ファイル") })
        ),
        createElement("section", { "data-test-quoted-file-fallback": "true" },
          createElement(ImQuotedMessagePreview, { message: fileMessage })
        )
      ));
    });

    for (const selector of ["[data-test-main-file-fallback]", "[data-test-quoted-file-fallback]"]) {
      const fallbackRoot = container.querySelector<HTMLElement>(selector);
      expect(fallbackRoot?.textContent).toContain("文件");
      expect(fallbackRoot?.querySelector("[data-no-i18n]")).toBeNull();
    }

    await act(async () => root.unmount());
  });

  it("keeps quoted system and recalled labels outside the user text translation boundary", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const systemMessage: ConversationMessage = {
      ...messageBase,
      id: "translation-quoted-system-1",
      localId: "translation-quoted-system-1",
      type: "system",
      content: "测试测试"
    };
    const recalledMessage: ConversationMessage = {
      ...messageBase,
      id: "translation-quoted-recalled-1",
      localId: "translation-quoted-recalled-1",
      senderId: "current-user",
      type: "text",
      content: "",
      status: "recalled"
    };

    await act(async () => {
      root.render(createElement("div", null,
        createElement("section", { "data-test-quoted-system": "true" },
          createElement(ImQuotedMessagePreview, { message: systemMessage })
        ),
        createElement("section", { "data-test-quoted-recalled": "true" },
          createElement(ImQuotedMessagePreview, { message: recalledMessage })
        )
      ));
    });

    const systemRoot = container.querySelector<HTMLElement>("[data-test-quoted-system]");
    const recalledRoot = container.querySelector<HTMLElement>("[data-test-quoted-recalled]");
    expect(systemRoot?.textContent).toBe("测试测试");
    expect(recalledRoot?.textContent).toBe("撤回消息");
    expect(systemRoot?.querySelector("[data-no-i18n]")).toBeNull();
    expect(recalledRoot?.querySelector("[data-no-i18n]")).toBeNull();
    expect(systemRoot?.querySelector("[data-im-message-rich-text]")).toBeNull();
    expect(recalledRoot?.querySelector("[data-im-message-rich-text]")).toBeNull();

    await act(async () => root.unmount());
  });
});
