/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageBubble } from "./components";
import type { ConversationMessage } from "./model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chatRecordMessage: ConversationMessage = {
  id: "record-1",
  localId: "record-1",
  conversationId: "conversation-1",
  senderId: "partner-1",
  type: "chat-record",
  content: "聊天记录",
  status: "sent",
  sentAt: "2026-09-10T00:00:00.000Z",
  clientSeq: 1,
  ext: {
    chatRecord: {
      publicId: "11111111-1111-4111-8111-111111111111",
      itemCount: 2,
      preview: "第一条\n第二条",
      senderNames: ["A", "B"],
      titleKind: "pair",
    },
  },
};

const socialPostMessage: ConversationMessage = {
  id: "social-1",
  localId: "social-1",
  conversationId: "conversation-1",
  senderId: "current-user",
  type: "social-post-card",
  content: "动态",
  status: "sent",
  sentAt: "2026-09-10T00:00:00.000Z",
  clientSeq: 2,
  ext: {
    socialPostCard: {
      postId: "post-1",
      authorName: "Aoi",
      authorAvatar: "/aoi.png",
      text: "主题令牌动态",
    },
  },
};

describe("MessageBubble forwarded cards", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("gives forwarded chat records and social posts the same themed full-width shell", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MessageBubble isMine={false} message={chatRecordMessage} />
          <MessageBubble isMine={true} message={socialPostMessage} />
        </MemoryRouter>,
      );
    });

    const [chatBubble, socialBubble] = Array.from(
      container.querySelectorAll<HTMLElement>("[data-im-message-bubble='true']"),
    );
    const chatColumn = chatBubble?.parentElement;
    const socialColumn = socialBubble?.parentElement;
    const socialCard = socialBubble?.querySelector<HTMLButtonElement>("button");

    expect(chatColumn?.className).toContain("w-[calc(100%-3.25rem)]");
    expect(chatColumn?.className).toContain("max-w-[320px]");
    expect(socialColumn?.className).toContain("w-[calc(100%-3.25rem)]");
    expect(socialColumn?.className).toContain("max-w-[320px]");
    [chatBubble, socialBubble].forEach((bubble) => {
      expect(bubble?.className).toContain("w-full");
      expect(bubble?.className).toContain("max-w-full");
    });
    expect(socialBubble?.className).toContain("bg-[color:var(--client-primary)]");
    expect(socialBubble?.className).toContain("text-[color:var(--client-primary-contrast)]");
    expect(socialCard?.className).toContain("w-full");
    expect(socialCard?.className).toContain("border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]");
    expect(socialCard?.className).toContain("bg-[color:var(--client-surface)]");
    expect(socialCard?.className).toContain("text-[color:var(--client-text)]");
    expect(socialCard?.innerHTML).toContain("text-[color:var(--client-muted)]");
    expect(socialCard?.innerHTML).toContain("text-[color:var(--client-primary)]");
    expect(socialCard?.className).not.toContain("w-[292px]");
  });
});
