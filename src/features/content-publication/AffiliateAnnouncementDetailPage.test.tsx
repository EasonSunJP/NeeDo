// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ContentLocaleCode,
  PublishedAnnouncementPayload,
} from "../../api/contentPublication";
import { ApiClientError } from "../../api/httpClient";
import type { Language } from "../../i18n/translations";
import { AffiliateAnnouncementDetailPage } from "./AffiliateAnnouncementDetailPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getAffiliateAnnouncement: vi.fn(),
}));

const i18nMock = vi.hoisted(() => ({ language: "zh" as Language }));

vi.mock("../../api/contentPublication", async () => {
  const actual = await vi.importActual<typeof import("../../api/contentPublication")>(
    "../../api/contentPublication",
  );
  return { ...actual, contentPublicationApi: apiMocks };
});

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: i18nMock.language, setLanguage: vi.fn() }),
}));

vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/mobile/MobileFullscreenHeader", () => ({
  MobileFullscreenHeader: ({
    backLabel,
    onBack,
    title,
  }: {
    backLabel: string;
    onBack: () => void;
    title: React.ReactNode;
  }) => (
    <header>
      <button aria-label={backLabel} onClick={onBack} type="button">
        back
      </button>
      <h1>{title}</h1>
    </header>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function NavigationProbe() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/afirieito/announcements/notice-new")} type="button">
      open-next
    </button>
  );
}

const announcement = (
  overrides: Partial<PublishedAnnouncementPayload> = {},
): PublishedAnnouncementPayload => ({
  publicId: "notice-one",
  version: 4,
  locale: "zh-CN",
  title: "夏季联盟公告",
  summary: "本次活动的重要说明",
  body: "第一行\n<script>不能执行</script>\n第三行",
  visibleFrom: "2026-08-29T02:00:00.000Z",
  visibleUntil: "2026-09-05T02:00:00.000Z",
  activatedAt: "2026-08-29T01:30:00.000Z",
  taskAction: null,
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
}

async function renderDetail(
  initialEntries: string[] = ["/afirieito/announcements/notice-one"],
) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
        <NavigationProbe />
        <Routes>
          <Route path="/afirieito" element={<p>affiliate-home</p>} />
          <Route
            path="/afirieito/announcements/:announcementPublicId"
            element={<AffiliateAnnouncementDetailPage />}
          />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
  });
}

describe("AffiliateAnnouncementDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    i18nMock.language = "zh";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the localized server title, summary, safe line breaks, and release timing", async () => {
    apiMocks.getAffiliateAnnouncement.mockResolvedValue(announcement());

    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("夏季联盟公告"));

    expect(container.textContent).toContain("本次活动的重要说明");
    expect(container.textContent).toContain("第一行");
    expect(container.textContent).toContain("<script>不能执行</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("article")?.hasAttribute("data-no-i18n")).toBe(true);
    expect(container.querySelector("[data-testid='announcement-body']")?.className).toContain(
      "whitespace-pre-wrap",
    );
    expect(
      container.querySelector('time[datetime="2026-08-29T01:30:00.000Z"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('time[datetime="2026-08-29T02:00:00.000Z"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('time[datetime="2026-09-05T02:00:00.000Z"]'),
    ).not.toBeNull();
  });

  it("reloads all five formal content locales when the current language changes", async () => {
    const cases: Array<[Language, ContentLocaleCode]> = [
      ["zh", "zh-CN"],
      ["zh-Hant", "zh-TW"],
      ["en", "en"],
      ["ja", "ja"],
      ["ko", "ko"],
    ];
    apiMocks.getAffiliateAnnouncement.mockImplementation(
      async (_publicId: string, locale: ContentLocaleCode) =>
        announcement({ locale, title: `title-${locale}` }),
    );

    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("title-zh-CN"));

    for (const [language, locale] of cases.slice(1)) {
      i18nMock.language = language;
      await renderDetail();
      await waitFor(() => expect(container.textContent).toContain(`title-${locale}`));
    }

    expect(apiMocks.getAffiliateAnnouncement.mock.calls).toEqual(
      cases.map(([, locale]) => ["notice-one", locale]),
    );
  });

  it("ignores an older public-id response after navigation", async () => {
    let resolveOld!: (payload: PublishedAnnouncementPayload) => void;
    apiMocks.getAffiliateAnnouncement
      .mockReturnValueOnce(
        new Promise<PublishedAnnouncementPayload>((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce(
        announcement({ publicId: "notice-new", title: "新公告" }),
      );

    await renderDetail();
    const next = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "open-next",
    );
    await act(async () => next?.click());
    await waitFor(() => expect(container.textContent).toContain("新公告"));

    await act(async () => resolveOld(announcement({ title: "过期旧公告" })));

    expect(container.textContent).toContain("新公告");
    expect(container.textContent).not.toContain("过期旧公告");
    expect(apiMocks.getAffiliateAnnouncement).toHaveBeenNthCalledWith(
      2,
      "notice-new",
      "zh-CN",
    );
  });

  it("shows the formal task action only when the server marks it claimable", async () => {
    apiMocks.getAffiliateAnnouncement.mockResolvedValue(
      announcement({
        taskAction: {
          taskCode: "AFF-PUBLIC-29",
          label: "参加夏季推广任务",
          claimable: true,
        },
      }),
    );

    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("参加夏季推广任务"));

    const taskLink = Array.from(container.querySelectorAll("a")).find((link) =>
      link.textContent?.includes("参加夏季推广任务"),
    );
    expect(taskLink?.getAttribute("href")).toBe(
      "/afirieito/plan?taskCode=AFF-PUBLIC-29",
    );
    await act(async () =>
      taskLink?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/afirieito/plan?taskCode=AFF-PUBLIC-29",
    );
  });

  it.each([
    null,
    { taskCode: "AFF-CLOSED", label: "已结束任务", claimable: false },
  ])("omits an unavailable task action returned as %j", async (taskAction) => {
    apiMocks.getAffiliateAnnouncement.mockResolvedValue(announcement({ taskAction }));

    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("夏季联盟公告"));

    expect(container.querySelector('a[href*="taskCode="]')).toBeNull();
    expect(container.textContent).not.toContain("已结束任务");
  });

  it("renders a stable unavailable state for a 404", async () => {
    apiMocks.getAffiliateAnnouncement.mockRejectedValue(
      new ApiClientError("error.content.not_found", 404, 404),
    );

    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("公告暂不可用"));

    expect(container.querySelector('[data-testid="announcement-unavailable"]')).not.toBeNull();
    expect(container.textContent).not.toContain("重试");
  });

  it("isolates transient failures and retries without leaving the detail page", async () => {
    apiMocks.getAffiliateAnnouncement
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(announcement());

    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("公告读取失败"));

    const retry = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("重试"),
    );
    await act(async () => retry?.click());
    await waitFor(() => expect(container.textContent).toContain("夏季联盟公告"));

    expect(apiMocks.getAffiliateAnnouncement).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/afirieito/announcements/notice-one",
    );
  });

  it("returns through browser history from the shared full-screen header", async () => {
    apiMocks.getAffiliateAnnouncement.mockResolvedValue(announcement());

    await renderDetail(["/afirieito", "/afirieito/announcements/notice-one"]);
    await waitFor(() => expect(container.textContent).toContain("夏季联盟公告"));

    const back = container.querySelector<HTMLButtonElement>('button[aria-label="返回"]');
    await act(async () => back?.click());
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/afirieito",
    );
  });
});
