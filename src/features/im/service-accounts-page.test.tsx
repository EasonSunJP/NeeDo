/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ImScopeProvider } from "./scope";
import { translateImUiText } from "./ui-copy";

const harness = vi.hoisted(() => ({
  store: null as Record<string, unknown> | null,
}));

vi.mock("./store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store")>();

  return {
    ...actual,
    useImStore: () => harness.store,
  };
});

import { ImServiceAccountsPage } from "./pages";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const serviceAccount = {
  accountId: "service-account",
  avatar: "/service-account.png",
  id: "service-user",
  nickname: "NeeDo 正式服务号",
  profileKind: "service",
  searchableFields: ["NeeDo 正式服务号"],
  serviceAccount: true,
  sortKey: "N",
  status: "active",
  tags: [],
  userIdLabel: "NeeDo ID: service-user",
};

const serviceContact = {
  createdAt: "2026-09-12T00:00:00.000Z",
  id: "service-contact",
  isBlocked: false,
  isStarred: false,
  ownerUserId: "current-user",
  relationStatus: "active",
  source: "formal",
  tags: [],
  targetUserId: serviceAccount.id,
  updatedAt: "2026-09-12T00:00:00.000Z",
};

function buildStore(overrides: Record<string, unknown> = {}) {
  return {
    contacts: [],
    error: undefined,
    status: "ready",
    usersById: {},
    ...overrides,
  };
}

async function renderPage(store: Record<string, unknown>) {
  window.localStorage.setItem("needo.language", "zh");
  window.localStorage.setItem("needo.language.mode", "manual");
  harness.store = store;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/contacts/service-accounts"]}>
        <I18nProvider>
          <ClientThemeProvider>
            <ImScopeProvider scope="user">
              <ImServiceAccountsPage />
            </ImScopeProvider>
          </ClientThemeProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await Promise.resolve();
  });

  return { container, root };
}

afterEach(async () => {
  harness.store = null;
  window.localStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ImServiceAccountsPage", () => {
  it("explains that formal service accounts are not connected when no records exist", async () => {
    const view = await renderPage(buildStore());

    expect(view.container.textContent).toContain("暂无服务号");
    expect(view.container.textContent).toContain("正式服务号能力尚未接入，当前没有可展示的服务号。");
    expect(view.container.querySelector('[aria-label="Test 功能"]')).not.toBeNull();
    expect(view.container.querySelectorAll("a")).toHaveLength(0);

    await act(async () => view.root.unmount());
  });

  it("continues to render real service-account contacts", async () => {
    const view = await renderPage(buildStore({
      contacts: [serviceContact],
      usersById: { [serviceAccount.id]: serviceAccount },
    }));

    expect(view.container.textContent).toContain("NeeDo 正式服务号");
    expect(view.container.textContent).not.toContain("暂无服务号");
    expect(view.container.querySelector('a[href="/contacts/service-contact"]')).not.toBeNull();

    await act(async () => view.root.unmount());
  });

  it("shows a distinct failure state when the formal IM bootstrap fails", async () => {
    const view = await renderPage(buildStore({
      error: "error.network.timeout",
      status: "error",
    }));

    expect(view.container.textContent).toContain("服务号加载失败");
    expect(view.container.textContent).toContain("请稍后重试。");
    expect(view.container.textContent).not.toContain("暂无服务号");

    await act(async () => view.root.unmount());
  });

  it("does not report an empty formal capability while the bootstrap is still loading", async () => {
    const view = await renderPage(buildStore({ status: "loading" }));

    expect(view.container.textContent).toContain("正在加载服务号");
    expect(view.container.textContent).toContain("请稍候。");
    expect(view.container.textContent).not.toContain("暂无服务号");

    await act(async () => view.root.unmount());
  });

  it("provides complete five-language empty and failure copy", () => {
    const expected: Record<Language, readonly string[]> = {
      zh: ["暂无服务号", "正式服务号能力尚未接入，当前没有可展示的服务号。", "服务号加载失败", "请稍后重试。", "正在加载服务号", "请稍候。"],
      "zh-Hant": ["暫無服務號", "正式服務號功能尚未接入，目前沒有可顯示的服務號。", "服務號載入失敗", "請稍後再試。", "正在載入服務號", "請稍候。"],
      ja: ["サービスアカウントはありません", "正式なサービスアカウント機能はまだ接続されていないため、現在表示できるサービスアカウントはありません。", "サービスアカウントを読み込めませんでした", "しばらくしてからもう一度お試しください。", "サービスアカウントを読み込んでいます", "しばらくお待ちください。"],
      en: ["No service accounts", "Formal service accounts are not connected yet, so there are no service accounts to display.", "Couldn't load service accounts", "Please try again later.", "Loading service accounts", "Please wait."],
      ko: ["서비스 계정이 없습니다", "정식 서비스 계정 기능이 아직 연결되지 않아 현재 표시할 서비스 계정이 없습니다.", "서비스 계정을 불러오지 못했습니다", "잠시 후 다시 시도해 주세요.", "서비스 계정을 불러오는 중", "잠시만 기다려 주세요."],
    };
    const sources = expected.zh;

    (Object.keys(expected) as Language[]).forEach((language) => {
      expect(sources.map((source) => translateImUiText(source, language))).toEqual(expected[language]);
    });
  });
});
