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
    expect(markup).toContain('aria-label="查看A和B的聊天记录"');
    expect(markup).toContain("focus-visible:outline");
  });
});
