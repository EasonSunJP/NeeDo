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

  it("keeps the previous primary visual when tone is omitted", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimeline
        events={[{ ...events[0], id: "omitted-tone", tone: undefined }]}
        showCommentComposer={false}
      />
    );

    expect(markup).toContain('data-tone="default"');
    expect(markup).toContain("bg-[color:var(--client-primary)]");
  });

  it("renders an explicitly neutral tone with the neutral gray visual", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimeline
        events={[{ ...events[0], id: "explicit-neutral", tone: "neutral" }]}
        showCommentComposer={false}
      />
    );

    expect(markup).toContain('data-tone="neutral"');
    expect(markup).toContain("bg-[color:var(--client-line)]");
  });

  it("stacks the timestamp above a compact rail on narrow screens while retaining desktop geometry", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimeline events={events} showCommentComposer={false} />
    );

    expect(markup).toContain("grid-cols-[18px,minmax(0,1fr)]");
    expect(markup).toContain("sm:grid-cols-[96px,22px,minmax(0,1fr)]");
    expect(markup).toContain("col-span-2");
    expect(markup).toContain("sm:col-span-1");
    expect(markup).toContain("grid-cols-[32px,minmax(0,1fr)]");
    expect(markup).toContain("sm:grid-cols-[40px,minmax(0,1fr)]");
  });

  it("wraps long audit metadata safely instead of clipping the timeline", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimeline
        events={[{
          ...events[0],
          message: "merchant_account_scope_identifier_without_safe_breaks_1234567890"
        }]}
        showCommentComposer={false}
      />
    );

    expect(markup).toContain("[overflow-wrap:anywhere]");
  });

  it.each([
    ["en-US", "America/New_York"],
    ["ja-JP", "Asia/Tokyo"],
    ["ko-KR", "Asia/Seoul"]
  ])("preserves an already-localized %s audit timestamp without Chinese reparsing", (locale, timeZone) => {
    const atLabel = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "numeric",
      second: "2-digit",
      timeZone,
      year: "numeric"
    }).format(new Date("2026-08-24T20:30:00.000Z"));
    const markup = renderToStaticMarkup(
      <ContactEventTimeline
        events={[{ ...events[0], atLabel, id: `localized-${locale}`, preserveAtLabel: true }]}
        showCommentComposer={false}
      />
    );

    expect(markup).toContain(atLabel);
    expect(markup).not.toContain("2026年8月24日");
    if (locale === "en-US") expect(markup).toContain("PM");
  });

  it("keeps the default composer on the same responsive timeline grid", () => {
    const markup = renderToStaticMarkup(<ContactEventTimeline events={events} />);
    const responsiveGrid = "grid-cols-[18px,minmax(0,1fr)]";

    expect(markup.split(responsiveGrid)).toHaveLength(3);
    expect(markup).toContain('class="hidden sm:block"');
  });

  it("can preserve the deployed three-column mobile geometry for technician status records", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimeline events={events} layout="three-column" />
    );

    expect(markup).toContain("grid-cols-[96px,22px,minmax(0,1fr)]");
    expect(markup).not.toContain("grid-cols-[18px,minmax(0,1fr)]");
    expect(markup).toContain("text-right");
    expect(markup).not.toContain("col-span-2");
    expect(markup).toContain("grid-cols-[40px,minmax(0,1fr)]");
    expect(markup).toContain('class="block"');
  });

  it("keeps the deployed comment row while allowing a formal navigation action", () => {
    const markup = renderToStaticMarkup(
      <ContactEventTimeline
        events={events}
        layout="three-column"
        onCommentButtonClick={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="评论"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("grid-cols-[96px,22px,minmax(0,1fr)]");
  });
});
