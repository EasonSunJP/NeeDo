// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realtimeApi } from "../../features/realtime/api";
import { ChatRecordForwardDestinationSheet } from "./ChatRecordForwardDestinationSheet";

vi.mock("./useEntityShareDestinations", () => ({
  useEntityShareDestinations: () => ({
    destinations: [
      { key: "direct-20", kind: "direct", label: "Aoi", subtitle: "联系人", userId: 20 },
      { key: "group-91", kind: "group", label: "Team Spa", subtitle: "群聊", conversationId: 91 }
    ],
    error: null,
    loading: false
  })
}));

describe("ChatRecordForwardDestinationSheet", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(realtimeApi, "createConversation").mockResolvedValue({ id: 77 } as never);
    vi.spyOn(realtimeApi, "forwardChatRecord").mockResolvedValue({ replayed: false } as never);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    container.remove();
  });

  it("reuses the share destinations and forwards to every selected direct or group conversation", async () => {
    const onClose = vi.fn();
    await act(async () => root.render(
      <ChatRecordForwardDestinationSheet
        onClose={onClose}
        publicId="11111111-1111-4111-8111-111111111111"
        title="聊天记录"
      />
    ));

    const choices = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(choices).toHaveLength(2);
    await act(async () => choices.forEach((choice) => choice.click()));
    const send = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("转发（2）"))!;
    await act(async () => {
      send.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(realtimeApi.createConversation).toHaveBeenCalledWith({ participantUserIds: [20], type: "direct" });
    expect(realtimeApi.forwardChatRecord).toHaveBeenCalledTimes(2);
    expect(vi.mocked(realtimeApi.forwardChatRecord).mock.calls.map(([, input]) => input.targetConversationId).sort()).toEqual([77, 91]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
