// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calendarEventApi } from "../../features/scheduling/calendar-event-api";
import {
  CalendarParticipantFlow,
  getParticipantConflictIdentityIds,
  type CalendarParticipantDraft,
} from "./CalendarParticipantFlow";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../features/scheduling/calendar-event-api", () => ({
  calendarEventApi: { listParticipantBusy: vi.fn(), listAllParticipantBusy: vi.fn() },
}));
vi.mock("../mobile/MobileFullscreenPage", () => ({
  MobileFullscreenPage: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("../mobile/MobileFullscreenHeader", () => ({
  MobileFullscreenHeader: ({ center, footer, onBack, onClose, title }: { center?: ReactNode; footer?: ReactNode; onBack?: () => void; onClose?: () => void; title: ReactNode }) => (
    <header>
      <button aria-label="返回" onClick={onBack} type="button">back</button>
      <span>{title}</span>{center}{footer}
      <button aria-label="关闭" onClick={onClose} type="button">close</button>
    </header>
  ),
}));

const options = [
  { id: "21", identityId: 21, label: "佐藤美咲", description: "常用 · VIP", avatar: "", tags: ["VIP"], groupIds: ["91"], isCommon: true },
  { id: "22", identityId: 22, label: "田中健", description: "最近联系", avatar: "", tags: [], groupIds: [], isCommon: true },
];

function Harness({ onClose = vi.fn(), onComplete = vi.fn() }: { onClose?: () => void; onComplete?: (draft: CalendarParticipantDraft) => void }) {
  const [draft, setDraft] = useState<CalendarParticipantDraft>({
    date: "2026-09-09",
    endDate: "2026-09-09",
    startTime: "10:00",
    endTime: "11:00",
    syncContactIds: [],
  });
  return <CalendarParticipantFlow
    draft={draft}
    onClose={onClose}
    onComplete={onComplete}
    onDraftChange={setDraft}
    options={options}
    renderTimeline={({ busyRanges, conflictIdentityIds, onTimeChange, participants }) => <section>
      <span data-testid="lane-count">{participants.length}</span>
      <span data-testid="busy-count">{busyRanges.length}</span>
      <span data-testid="conflict-count">{conflictIdentityIds.size}</span>
      <button onClick={() => onTimeChange("10:30", "11:30")} type="button">adjust time</button>
    </section>}
  />;
}

function clickByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("CalendarParticipantFlow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calendarEventApi.listParticipantBusy).mockResolvedValue({
      list: [{ participantIdentityId: 21, startsAt: "2026-09-09T10:45:00.000Z", endsAt: "2026-09-09T11:15:00.000Z", status: "locked" }],
      total: 1,
      page: 1,
      page_size: 100,
    });
    vi.mocked(calendarEventApi.listAllParticipantBusy).mockResolvedValue([
      { participantIdentityId: 21, startsAt: "2026-09-09T10:45:00.000Z", endsAt: "2026-09-09T11:15:00.000Z", status: "locked" },
    ]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("requires a contact before moving to the shared multi-participant timeline", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => clickByText(container, "下一步"));
    expect(container.textContent).toContain("请至少选择一位联系人后再进入下一步。");

    await act(async () => clickByText(container, "佐藤美咲"));
    await act(async () => clickByText(container, "下一步"));
    expect(container.querySelector('[data-testid="lane-count"]')?.textContent).toBe("2");
    expect(container.textContent).toContain("完成选择");
  });

  it("filters real contact rows by tags and search", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => clickByText(container, "标签"));
    expect(container.textContent).toContain("佐藤美咲");
    expect(container.textContent).not.toContain("田中健");

    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索参加者"]');
    await act(async () => {
      if (!search) throw new Error("Missing participant search");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(search, "不存在");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("没有符合条件的联系人");
  });

  it("updates the one shared draft time and completes without creating an event", async () => {
    const onComplete = vi.fn();
    await act(async () => root.render(<Harness onComplete={onComplete} />));
    await act(async () => clickByText(container, "佐藤美咲"));
    await act(async () => clickByText(container, "下一步"));
    await act(async () => clickByText(container, "adjust time"));
    await act(async () => clickByText(container, "完成选择"));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      startTime: "10:30",
      endTime: "11:30",
      syncContactIds: ["21"],
    }));
    expect(calendarEventApi.listAllParticipantBusy).toHaveBeenCalledWith(expect.objectContaining({ participantIdentityIds: [21] }));
  });

  it("calculates strict per-participant conflicts without blocking completion", () => {
    const conflicts = getParticipantConflictIdentityIds(
      { startsAt: "2026-09-09T10:00:00.000Z", endsAt: "2026-09-09T11:00:00.000Z" },
      [
        { participantIdentityId: 21, startsAt: "2026-09-09T10:30:00.000Z", endsAt: "2026-09-09T11:30:00.000Z", status: "locked" },
        { participantIdentityId: 22, startsAt: "2026-09-09T11:00:00.000Z", endsAt: "2026-09-09T12:00:00.000Z", status: "locked" },
      ],
    );
    expect([...conflicts]).toEqual([21]);
  });

  it("keeps cross-day drafts out of the single-day participant timeline", async () => {
    const crossDayDraft: CalendarParticipantDraft = {
      date: "2026-09-09",
      endDate: "2026-09-10",
      startTime: "23:00",
      endTime: "01:00",
      syncContactIds: ["21"],
    };
    await act(async () => root.render(
      <CalendarParticipantFlow
        draft={crossDayDraft}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onDraftChange={vi.fn()}
        options={options}
        renderTimeline={() => null}
      />,
    ));
    await act(async () => clickByText(container, "下一步"));
    expect(container.textContent).toContain("多人日程确认仅支持同日时间");
    expect(calendarEventApi.listAllParticipantBusy).not.toHaveBeenCalled();
  });
});
