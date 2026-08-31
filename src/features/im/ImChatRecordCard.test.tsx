import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
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
    ["en", "Chat record with A and B", "2 messages", "Chat history", "View chat record: Chat record with A and B"],
    ["ko", "A, B님의 채팅 기록", "메시지 2개", "채팅 기록", "채팅 기록 보기: A, B님의 채팅 기록"],
  ] as const)("renders complete %s card copy without mixed-language fragments", (language, title, count, caption, ariaLabel) => {
    const markup = renderToStaticMarkup(<MemoryRouter><ImChatRecordCard language={language} record={record} /></MemoryRouter>);
    expect(markup).toContain(title);
    expect(markup).toContain(count);
    expect(markup).toContain(caption);
    expect(markup).toContain(`aria-label="${ariaLabel}"`);
  });
});
