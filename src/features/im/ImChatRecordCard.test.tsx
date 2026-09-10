// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, I18nRuntime } from "../../i18n/I18nProvider";
import { ImChatRecordCard } from "./ImChatRecordCard";

const record = {
  publicId: "11111111-1111-4111-8111-111111111111",
  title: "后端标题不得显示",
  titleKind: "pair" as const,
  preview: "A: 第一行\nB: 第二行",
  senderNames: ["A", "B"],
  senderCount: 2,
  itemCount: 2,
  createdAt: "2026-08-31T10:00:00.000Z",
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.lang = "";
  localStorage.clear();
});

describe("ImChatRecordCard", () => {
  it("renders the immutable localized title, two-line preview, count, and caption", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ImChatRecordCard language="zh" record={record} />
      </MemoryRouter>,
    );

    expect(markup).toContain("A和B的聊天记录");
    expect(markup).not.toContain("后端标题不得显示");
    expect(markup).toContain("A: 第一行");
    expect(markup).toContain("B: 第二行");
    expect(markup).toContain("2条信息");
    expect(markup).toContain("聊天记录");
    expect(markup).toContain("line-clamp-2");
  });

  it("makes the complete record a keyboard-operable scoped link with opener state", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ImChatRecordCard language="zh" record={record} scope="merchant" />
      </MemoryRouter>,
    );

    expect(markup).toContain(
      'href="/merchant/messages/chat-records/11111111-1111-4111-8111-111111111111"',
    );
    expect(markup).toContain('data-im-chat-record-opener=');
    expect(markup).toContain('aria-label="查看聊天记录：A和B的聊天记录"');
    expect(markup).toContain("focus-visible:outline");
  });

  it.each([
    ["zh", "A和B的聊天记录", "2条信息", "聊天记录", "查看聊天记录：A和B的聊天记录"],
    ["zh-Hant", "A和B的聊天記錄", "2則訊息", "聊天記錄", "查看聊天記錄：A和B的聊天記錄"],
    ["ja", "AとBのチャット履歴", "2件のメッセージ", "チャット履歴", "チャット履歴を表示：AとBのチャット履歴"],
    ["en", "A and B&#x27;s chat history", "2 messages", "Chat history", "View chat record: A and B&#x27;s chat history"],
    ["ko", "A와 B의 채팅 기록", "메시지 2개", "채팅 기록", "채팅 기록 보기: A와 B의 채팅 기록"],
  ] as const)("renders complete %s card copy without mixed-language fragments", (language, title, count, caption, ariaLabel) => {
    const markup = renderToStaticMarkup(<MemoryRouter><ImChatRecordCard language={language} record={record} /></MemoryRouter>);
    expect(markup).toContain(title);
    expect(markup).toContain(count);
    expect(markup).toContain(caption);
    expect(markup).toContain(`aria-label="${ariaLabel}"`);
  });

  it.each([
    ["zh", "[图片]", "聊天记录", "1条信息"],
    ["zh-Hant", "[圖片]", "聊天記錄", "1則訊息"],
    ["ja", "[画像]", "チャット履歴", "1件のメッセージ"],
    ["en", "[Image]", "Chat history", "1 message"],
    ["ko", "[이미지]", "채팅 기록", "메시지 1개"],
  ] as const)("keeps authored card text immutable under the %s I18nRuntime while preserving pre-localized placeholders", async (language, placeholder, caption, count) => {
    localStorage.setItem("needo.language", language);
    localStorage.setItem("needo.language.mode", "manual");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const typedPreview = `needo-chat-record-preview:v1:${JSON.stringify({ lines: [{ sender: "東京駅", type: "image", text: "东京站" }] })}`;

    await act(async () => {
      root.render(
        <MemoryRouter>
          <I18nProvider>
            <I18nRuntime>
              <div>
                <ImChatRecordCard
                  language={language}
                  openerId="typed-record"
                  record={{ ...record, itemCount: 1, preview: typedPreview, senderCount: 1, senderNames: ["東京駅"], titleKind: "single" }}
                />
                <ImChatRecordCard
                  language={language}
                  openerId="legacy-record"
                  record={{ ...record, itemCount: 1, preview: "東京駅", senderCount: 1, senderNames: ["A"], titleKind: "single" }}
                />
              </div>
            </I18nRuntime>
          </I18nProvider>
        </MemoryRouter>,
      );
    });
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });

    const typed = container.querySelector<HTMLElement>('[data-im-chat-record-opener="typed-record"]');
    const legacy = container.querySelector<HTMLElement>('[data-im-chat-record-opener="legacy-record"]');
    expect.soft(typed?.getAttribute("data-no-i18n")).toBe("true");
    expect(typed?.textContent).toContain(`東京駅: ${placeholder} 东京站`);
    expect(typed?.textContent).toContain(caption);
    expect(typed?.textContent).toContain(count);
    expect(legacy?.textContent).toContain("東京駅");
    expect(legacy?.textContent).not.toContain("Tokyo Station");

    await act(async () => root.unmount());
  });
});
