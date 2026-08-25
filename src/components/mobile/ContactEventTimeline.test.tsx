import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContactEventTimeline,
  ContactEventTimelinePanel,
  type ContactEventTimelineEntry
} from "./ContactEventTimeline";

const events: ContactEventTimelineEntry[] = [{
  id: "audit-1",
  atLabel: "2026-08-24 10:30",
  actorName: "运营管理员",
  actorRole: "资料更新",
  title: "资料更新",
  message: "更新了正式资料",
  tone: "green"
}];

describe("ContactEventTimeline comment composer visibility", () => {
  it("renders existing events without comment controls in audit-only mode", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimeline events={events} showCommentComposer={false} />
    );

    expect(markup).toContain("运营管理员");
    expect(markup).toContain("更新了正式资料");
    expect(markup).not.toContain('aria-label="评论"');
    expect(markup).not.toContain("写下留言");
    expect(markup).not.toContain("bottom-[-18px]");
  });

  it("keeps the comment composer enabled by default for existing consumers", () => {
    const markup = renderToStaticMarkup(<ContactEventTimeline events={events} />);

    expect(markup).toContain('aria-label="评论"');
    expect(markup).toContain(">评论</button>");
    expect(markup).toContain("bottom-[-18px]");
  });

  it("forwards audit-only mode through the shared panel wrapper", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimelinePanel events={events} showCommentComposer={false} title="时间线" />
    );

    expect(markup).toContain("更新了正式资料");
    expect(markup).not.toContain('aria-label="评论"');
  });
});
