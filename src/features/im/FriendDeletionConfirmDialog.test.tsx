// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import {
  FriendDeletionConfirmDialog,
  useFriendDeletionConfirmation,
} from "./FriendDeletionConfirmDialog";
import { getFriendDeletionCopy } from "./friend-deletion-i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function Harness({
  deleteContact,
  onDeleted,
}: {
  deleteContact: (contactId: string) => Promise<unknown>;
  onDeleted?: (target: { id: string }) => void;
}) {
  const deletion = useFriendDeletionConfirmation({ deleteContact, onDeleted });

  return (
    <>
      <button onClick={() => deletion.requestDeletion({ id: "contact-1" })} type="button">
        打开删除确认
      </button>
      <FriendDeletionConfirmDialog
        deleting={deletion.deleting}
        errorMessage={deletion.errorMessage}
        onCancel={deletion.cancelDeletion}
        onConfirm={deletion.confirmDeletion}
        open={deletion.open}
      />
    </>
  );
}

describe("FriendDeletionConfirmDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.setItem("needo.language", "zh");
    localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  const renderHarness = async (
    deleteContact: (contactId: string) => Promise<unknown>,
    onDeleted?: (target: { id: string }) => void,
  ) => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <Harness deleteContact={deleteContact} onDeleted={onDeleted} />
        </I18nProvider>,
      );
    });
  };

  const button = (label: string) => {
    const matched = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.trim() === label);

    if (!matched) {
      throw new Error(`Missing button: ${label}`);
    }

    return matched;
  };

  it("keeps the destructive warning complete in every supported language", () => {
    expect(getFriendDeletionCopy("zh").title).toBe("确认删除好友？");
    expect(getFriendDeletionCopy("zh-Hant").title).toBe("確認刪除好友？");
    expect(getFriendDeletionCopy("ja").title).toBe("友だちを削除しますか？");
    expect(getFriendDeletionCopy("en").title).toBe("Delete this friend?");
    expect(getFriendDeletionCopy("ko").title).toBe("친구를 삭제할까요?");
    expect(getFriendDeletionCopy("zh").description).toContain("你的聊天记录");
    expect(getFriendDeletionCopy("zh-Hant").description).toContain("你的聊天記錄");
    expect(getFriendDeletionCopy("ja").description).toContain("あなたのチャット履歴");
    expect(getFriendDeletionCopy("en").description).toContain("Your chat history");
    expect(getFriendDeletionCopy("ko").description).toContain("내 채팅 기록");
  });

  it("opens without deleting and keeps confirm on the left of cancel", async () => {
    const deleteContact = vi.fn(async () => undefined);
    await renderHarness(deleteContact);

    await act(async () => button("打开删除确认").click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const actions = Array.from(dialog?.querySelectorAll("button") ?? []);

    expect(deleteContact).not.toHaveBeenCalled();
    expect(dialog?.textContent).toContain("确认删除好友？");
    expect(dialog?.textContent).toContain("你的聊天记录");
    expect(actions.map((item) => item.textContent?.trim())).toEqual(["确认删除", "取消"]);
  });

  it("cancels without calling the deletion function", async () => {
    const deleteContact = vi.fn(async () => undefined);
    await renderHarness(deleteContact);

    await act(async () => button("打开删除确认").click());
    await act(async () => button("取消").click());

    expect(deleteContact).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("submits once, disables dismissal while pending, and closes after success", async () => {
    const deferred = createDeferred();
    const deleteContact = vi.fn(() => deferred.promise);
    const onDeleted = vi.fn();
    await renderHarness(deleteContact, onDeleted);

    await act(async () => button("打开删除确认").click());
    await act(async () => {
      button("确认删除").click();
      await Promise.resolve();
    });

    expect(deleteContact).toHaveBeenCalledTimes(1);
    expect(deleteContact).toHaveBeenCalledWith("contact-1");
    expect(button("正在删除…").disabled).toBe(true);
    expect(button("取消").disabled).toBe(true);

    await act(async () => {
      container.querySelector<HTMLElement>('[role="dialog"]')?.click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onDeleted).toHaveBeenCalledWith({ id: "contact-1" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the dialog open with an alert after failure and clears it on cancel", async () => {
    const deleteContact = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    await renderHarness(deleteContact);

    await act(async () => button("打开删除确认").click());
    await act(async () => {
      button("确认删除").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("删除失败，请稍后重试");
    expect(button("确认删除").disabled).toBe(false);

    await act(async () => button("取消").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => button("打开删除确认").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
