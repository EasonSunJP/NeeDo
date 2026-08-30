import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { DirectoryIdentityCard, ImUser } from "./model";
import { ConversationIdentityProfileCard } from "./ConversationIdentityProfileCard";

const user: ImUser = {
  id: "167",
  accountId: "u0000000167",
  nickname: "Mia",
  avatar: "/mia.png",
  status: "active",
  searchableFields: ["Mia", "u0000000167"],
  sortKey: "Mia",
  profileKind: "person",
  entityType: "user",
  tags: [],
  userIdLabel: "u0000000167",
};

const identityCard: DirectoryIdentityCard = {
  entityType: "user",
  profileId: "73",
  displayName: "Mia",
  identityLabel: "premium",
  verified: false,
  creditValue: 5,
  creditReviewCount: 28,
  gender: "female",
  age: 25,
  heightCm: 164,
  languages: ["日本語", "中文"],
  city: "东京",
  bio: "预约前请先确认时间、语言和付款方式。",
};

describe("ConversationIdentityProfileCard", () => {
  it("keeps user basic fields but removes city and credit from user-side conversation settings", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter>
          <ConversationIdentityProfileCard
            detailTo="/profile/user/73"
            identityCard={identityCard}
            user={user}
            viewerScope="user"
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("Mia");
    expect(markup).toContain("ID u0000000167");
    expect(markup).not.toContain("信用值");
    expect(markup).not.toContain("5.0");
    expect(markup).not.toContain("28人评价");
    expect(markup).toContain("基础信息");
    expect(markup).toContain("性别");
    expect(markup).toContain("女性");
    expect(markup).toContain("年龄");
    expect(markup).toContain("25");
    expect(markup).toContain("身高（cm）");
    expect(markup).toContain("164");
    expect(markup).toContain("grid-cols-3");
    expect(markup).not.toContain("城市");
    expect(markup).not.toContain("东京");
    expect(markup).toContain("语言能力");
    expect(markup).toContain("自我介绍");
    expect(markup).not.toContain("积分");
    expect(markup).not.toContain("利用次数");
    expect(markup).not.toContain("隐私模式");
    expect(markup).not.toContain("type=\"checkbox\"");
  });

  it.each(["technician", "merchant"] as const)(
    "keeps the conversation-settings credit summary for the %s portal",
    (viewerScope) => {
      const markup = renderToStaticMarkup(
        <I18nProvider>
          <MemoryRouter>
            <ConversationIdentityProfileCard
              identityCard={identityCard}
              user={user}
              viewerScope={viewerScope}
            />
          </MemoryRouter>
        </I18nProvider>,
      );

      expect(markup).toContain("信用值");
      expect(markup).toContain("5.0");
      expect(markup).toContain("28人评价");
    },
  );

  it("shows an explicit unrated state instead of inventing a zero credit score in an allowed portal", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter>
          <ConversationIdentityProfileCard
            identityCard={{
              ...identityCard,
              creditValue: undefined,
              creditReviewCount: 0,
            }}
            user={user}
            viewerScope="technician"
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("—");
    expect(markup).toContain("暂无评价");
    expect(markup).not.toContain("0.0/5");
  });

  it("always renders gender, age, and height placeholders for a user identity", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter>
          <ConversationIdentityProfileCard
            identityCard={{
              ...identityCard,
              gender: undefined,
              age: undefined,
              heightCm: undefined,
            }}
            user={user}
            viewerScope="user"
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("性别");
    expect(markup).toContain("不公开");
    expect(markup).toContain("年龄");
    expect(markup.match(/未设置/g)).toHaveLength(2);
    expect(markup).toContain("身高（cm）");
    expect(markup).not.toContain("城市");
    expect(markup).not.toContain("东京");
  });

  it.each([
    {
      entityType: "technician" as const,
      displayName: "Mia 技师",
      city: "东京",
      serviceArea: "涩谷区、港区",
      yearsExperience: 7,
      expected: ["技师", "从业年限", "7", "服务区域", "涩谷区、港区"],
    },
    {
      entityType: "shop" as const,
      displayName: "NeeDo 银座店",
      city: "东京",
      serviceArea: "中央区银座 1-1",
      expected: ["店铺", "店铺地址", "中央区银座 1-1"],
    },
  ])("renders $entityType-specific formal fields", ({ expected, ...overrides }) => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter>
          <ConversationIdentityProfileCard
            identityCard={{
              ...identityCard,
              ...overrides,
              profileId: "88",
              identityLabel: undefined,
              gender: undefined,
              age: undefined,
              heightCm: undefined,
              languages: [],
            }}
            user={user}
            viewerScope="merchant"
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    expected.forEach((text) => expect(markup).toContain(text));
    expect(markup).not.toContain("城市");
    expect(markup).not.toContain("东京");
    expect(markup).not.toContain("积分");
    expect(markup).not.toContain("利用次数");
    expect(markup).not.toContain("隐私模式");
  });
});
