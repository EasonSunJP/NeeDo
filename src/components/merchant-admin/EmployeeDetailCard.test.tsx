// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantEmployee } from "../../features/merchant-admin/employeeApi";
import { translateText } from "../../i18n/translations";
import { EmployeeDetailCard } from "./EmployeeDetailCard";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh", setLanguage: vi.fn() }),
}));

const employee: MerchantEmployee = {
  needoId: "NEEDO-S-47",
  displayName: "斉藤 健太",
  avatarUrl: null,
  email: "kenta@example.jp",
  phone: "+81 90 1234 5678",
  profileStatus: "verified",
  verifiedAt: "2026-08-20T00:00:00.000Z",
  profile: {
    bio: "リラクゼーション担当",
    city: "東京都渋谷区",
    serviceArea: "渋谷区・港区",
    yearsExperience: 8,
    updatedAt: "2026-08-28T00:00:00.000Z",
  },
  account: {
    isActive: true,
    lastLoginAt: "2026-08-28T01:00:00.000Z",
  },
  affiliation: {
    id: 987,
    relationshipType: "exclusive",
    workStatus: "active",
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: null,
    shop: {
      id: 654,
      publicId: "NEEDO-M-16",
      name: "LifeDance 渋谷店",
    },
  },
};

let container: HTMLDivElement;
let root: Root;

async function renderCard(
  props: Partial<Parameters<typeof EmployeeDetailCard>[0]> = {},
) {
  await act(async () => {
    root.render(
      <EmployeeDetailCard
        employee={employee}
        error=""
        onSaveAffiliation={vi.fn(async () => undefined)}
        onSaveProfile={vi.fn(async () => undefined)}
        saving={null}
        {...props}
      />,
    );
  });
}

function button(label: string) {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

async function setInput(testId: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-testid="${testId}"]`,
  );
  if (!input) throw new Error(`Input not found: ${testId}`);
  const prototype =
    input instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("EmployeeDetailCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows the NeeDo identity, current relationship, contact and account truth without internal ids", async () => {
    await renderCard();

    expect(container.textContent).toContain("NEEDO-S-47");
    expect(container.textContent).toContain("斉藤 健太");
    expect(container.textContent).toContain("专属技师");
    expect(container.textContent).toContain("在职");
    expect(container.textContent).toContain("LifeDance 渋谷店");
    expect(container.textContent).toContain("kenta@example.jp");
    expect(container.textContent).toContain("+81 90 1234 5678");
    expect(container.textContent).toContain("已验证");
    expect(container.textContent).toContain("启用");
    expect(container.textContent).not.toContain("987");
    expect(container.textContent).not.toContain("654");
    expect(container.textContent).not.toContain("薪酬设置");
    expect(container.textContent).not.toContain("时间线");
  });

  it("submits edited basic profile fields through the real mutation contract", async () => {
    const onSaveProfile = vi.fn(async () => undefined);
    await renderCard({ onSaveProfile });

    await act(async () => button("编辑").click());
    await setInput("employee-display-name", "斉藤 健太郎");
    await setInput("employee-city", "東京都港区");
    await setInput("employee-service-area", "港区");
    await setInput("employee-years-experience", "9");
    await setInput("employee-bio", "正式资料更新");
    await act(async () => button("保存变更").click());

    expect(onSaveProfile).toHaveBeenCalledWith({
      bio: "正式资料更新",
      city: "東京都港区",
      displayName: "斉藤 健太郎",
      serviceArea: "港区",
      yearsExperience: 9,
    });
  });

  it("keeps failed edits visible and cancel restores the server snapshot", async () => {
    const onSaveProfile = vi.fn(async () => {
      throw new Error("conflict");
    });
    await renderCard({ error: "保存失败，请检查后重试", onSaveProfile });

    await act(async () => button("编辑").click());
    await setInput("employee-display-name", "未保存姓名");
    await act(async () => button("保存变更").click());

    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="employee-display-name"]',
      )?.value,
    ).toBe("未保存姓名");
    expect(container.textContent).toContain("保存失败，请检查后重试");

    await act(async () => button("取消").click());
    expect(container.textContent).toContain("斉藤 健太");
    expect(container.textContent).not.toContain("未保存姓名");
  });

  it("updates the current shop relationship without exposing another shop schedule", async () => {
    const onSaveAffiliation = vi.fn(async () => undefined);
    await renderCard({ onSaveAffiliation });

    await act(async () => button("编辑从属关系").click());
    const relationship = container.querySelector<HTMLSelectElement>(
      '[data-testid="employee-relationship-type"]',
    )!;
    const workStatus = container.querySelector<HTMLSelectElement>(
      '[data-testid="employee-work-status"]',
    )!;
    await act(async () => {
      relationship.value = "partner";
      relationship.dispatchEvent(new Event("change", { bubbles: true }));
      workStatus.value = "on_leave";
      workStatus.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("保存从属关系").click());

    expect(onSaveAffiliation).toHaveBeenCalledWith({
      endsAt: null,
      relationshipType: "partner",
      startsAt: "2026-06-01T00:00:00.000Z",
      workStatus: "on_leave",
    });
  });

  it("provides exact merchant-card copy in every supported non-source language", () => {
    expect(translateText("专属技师", "zh-Hant")).toBe("專屬技師");
    expect(translateText("合作技师", "ja")).toBe("パートナースタッフ");
    expect(translateText("工作状态", "en")).toBe("Work Status");
    expect(translateText("保存从属关系", "ko")).toBe("소속 관계 저장");
  });
});
