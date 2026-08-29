// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AffiliateAlliance,
  AffiliateAllianceInvitation,
  AffiliateAllianceMember,
  AffiliateAlliancePublicPerson
} from "../../api/affiliateAlliance";
import { ApiClientError } from "../../api/httpClient";
import { AffiliateAlliancePage } from "./AffiliateAlliancePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const apiMocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  create: vi.fn(),
  createInvitation: vi.fn(),
  getMine: vi.fn(),
  listEligibleContacts: vi.fn(),
  listMembers: vi.fn(),
  listReceivedInvitations: vi.fn(),
  listSentInvitations: vi.fn(),
  rejectInvitation: vi.fn()
}));

vi.mock("../../api/affiliateAlliance", () => ({
  affiliateAllianceApi: apiMocks
}));

vi.mock("../../features/realtime/useRealtimeUnreadCounts", () => ({
  useRealtimeUnreadCounts: () => ({ conversations: 0, friendRequests: 0, notifications: 0 })
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "light-green" })
}));

const alliance: AffiliateAlliance = {
  allianceId: 42,
  name: "东京美容联盟",
  description: "面向东京地区",
  status: "active",
  version: 1,
  defaultPromoterShareBps: 7550,
  owner: {
    needoId: "u0000000007",
    displayName: "山田 花",
    avatarUrl: null
  },
  membership: {
    memberId: 91,
    role: "owner",
    managerNeedoId: null,
    promoterShareBpsOverride: null,
    permissions: {
      canClaimTasks: true,
      canViewAllianceOverview: true,
      canViewMemberDetails: true,
      canManageOwnSubordinates: true,
      canViewAllianceWallet: true
    }
  },
  wallet: { currency: "NDP", availableBalance: 0, frozenBalance: 0 },
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-28T12:00:00.000Z"
};

const partnerMember: AffiliateAllianceMember = {
  memberId: 92,
  person: {
    needoId: "u0000000009",
    displayName: "佐藤 美咲",
    avatarUrl: null
  },
  role: "partner",
  parent: {
    memberId: 91,
    person: alliance.owner
  },
  promoterShareBpsOverride: null,
  permissions: {
    canClaimTasks: false,
    canViewAllianceOverview: false,
    canViewMemberDetails: false,
    canManageOwnSubordinates: false,
    canViewAllianceWallet: false
  },
  joinedAt: "2026-08-28T12:30:00.000Z"
};

const candidate: AffiliateAlliancePublicPerson = {
  needoId: "u0000000008",
  displayName: "鈴木 葵",
  avatarUrl: null
};

const pendingInvitation: AffiliateAllianceInvitation = {
  invitationId: 41,
  alliance: { allianceId: alliance.allianceId, name: alliance.name },
  inviter: alliance.owner,
  invitee: candidate,
  role: "partner",
  proposedParent: null,
  status: "pending",
  expiresAt: "2026-08-31T12:00:00.000Z",
  respondedAt: null,
  createdAt: "2026-08-28T12:00:00.000Z"
};

const page = <T,>(list: T[], currentPage = 1, total = list.length) => ({
  list,
  total,
  page: currentPage,
  page_size: 20
});

let container: HTMLDivElement;
let root: Root;
let storageSetItem: ReturnType<typeof vi.spyOn>;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
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

function findButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(label)
  );
  if (!button) throw new Error(`Could not find button: ${label}`);
  return button;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function setControlValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function renderPage() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/afirieito/organization"]}>
        <AffiliateAlliancePage />
      </MemoryRouter>
    );
  });
}

describe("AffiliateAlliancePage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.resetAllMocks();
    apiMocks.getMine.mockResolvedValue({ alliance: null });
    apiMocks.listMembers.mockResolvedValue(page([]));
    apiMocks.listEligibleContacts.mockResolvedValue(page([]));
    apiMocks.listSentInvitations.mockResolvedValue(page([]));
    apiMocks.listReceivedInvitations.mockResolvedValue(page([]));
    apiMocks.createInvitation.mockResolvedValue({ invitation: pendingInvitation });
    apiMocks.acceptInvitation.mockResolvedValue({
      invitation: { ...pendingInvitation, status: "accepted" },
      member: partnerMember
    });
    apiMocks.rejectInvitation.mockResolvedValue({
      invitation: { ...pendingInvitation, status: "rejected" }
    });
    storageSetItem = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    storageSetItem.mockRestore();
  });

  it("loads the empty state and creates only through the API with percent-to-BPS conversion", async () => {
    let resolveInitial!: (value: { alliance: null }) => void;
    apiMocks.getMine.mockReturnValueOnce(
      new Promise<{ alliance: null }>((resolve) => {
        resolveInitial = resolve;
      })
    );
    apiMocks.create.mockResolvedValue({ alliance });

    await renderPage();
    expect(container.textContent).toContain("正在读取联盟");
    await act(async () => resolveInitial({ alliance: null }));
    await waitFor(() => expect(container.textContent).toContain("建立你的第一个联盟"));

    expect(container.querySelector('button[aria-label="查看联盟说明"]')).not.toBeNull();
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="allianceName"]')!,
      "东京美容联盟"
    );
    await setControlValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="allianceDescription"]')!,
      "面向东京地区"
    );
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="promoterSharePercent"]')!,
      "75.5"
    );
    expect(container.textContent).toContain("联盟 24.5%");
    await click(findButton("创建联盟"));

    await waitFor(() =>
      expect(apiMocks.create).toHaveBeenCalledWith({
        name: "东京美容联盟",
        description: "面向东京地区",
        defaultPromoterShareBps: 7550
      })
    );
    await waitFor(() => expect(container.textContent).toContain("u0000000007"));
    expect(storageSetItem).not.toHaveBeenCalled();
  });

  it("shows the server owner, all five permissions, ratio, and separate zero wallet", async () => {
    apiMocks.getMine.mockResolvedValue({ alliance });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("东京美容联盟"));

    expect(container.textContent).toContain("推广者 75.5%");
    expect(container.textContent).toContain("联盟 24.5%");
    expect(container.textContent).toContain("u0000000007");
    expect(container.textContent).toContain("领取任务");
    expect(container.textContent).toContain("查看联盟概览");
    expect(container.textContent).toContain("查看成员详情");
    expect(container.textContent).toContain("管理自己的下级");
    expect(container.textContent).toContain("查看联盟钱包");
    expect(container.textContent).toContain("可用余额");
    expect(container.textContent).toContain("冻结余额");
    expect(container.textContent).toContain("0 NDP");
    expect(container.textContent).toContain("邀请成员");
    expect(container.textContent).not.toContain("转账");
    expect(container.textContent).not.toContain("GMV");
    expect(
      Array.from(container.querySelectorAll("nav a")).some(
        (link) => link.textContent === "联盟营销"
      )
    ).toBe(true);
  });

  it("loads owner management data and refreshes authoritative lists after an invitation", async () => {
    apiMocks.getMine.mockResolvedValue({ alliance });
    apiMocks.listMembers.mockResolvedValue(page([partnerMember]));
    apiMocks.listEligibleContacts.mockResolvedValue(page([candidate]));
    apiMocks.listSentInvitations.mockResolvedValue(page([pendingInvitation]));

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("成员名单"));

    expect(apiMocks.listMembers).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
    expect(apiMocks.listEligibleContacts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, q: "" })
    );
    expect(apiMocks.listSentInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
    expect(container.textContent).toContain("佐藤 美咲");
    expect(container.textContent).toContain("鈴木 葵");
    expect(container.textContent).toContain("等待回应");

    await click(findButton("选择鈴木 葵"));
    await click(findButton("发送邀请"));
    await waitFor(() =>
      expect(apiMocks.createInvitation).toHaveBeenCalledWith({
        inviteeNeedoId: candidate.needoId,
        role: "partner",
        proposedParentMemberId: null
      })
    );
    await waitFor(() => expect(apiMocks.listEligibleContacts).toHaveBeenCalledTimes(2));
    expect(apiMocks.listSentInvitations).toHaveBeenCalledTimes(2);
  });

  it("requires a parent only for subordinate invitations and clears it for partners", async () => {
    apiMocks.getMine.mockResolvedValue({ alliance });
    apiMocks.listMembers.mockResolvedValue(page([partnerMember]));
    apiMocks.listEligibleContacts.mockResolvedValue(page([candidate]));

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("邀请成员"));
    await click(findButton("选择鈴木 葵"));

    const roleSelect = container.querySelector<HTMLSelectElement>('select[name="invitationRole"]')!;
    await setControlValue(roleSelect, "subordinate");
    const parentSelect = container.querySelector<HTMLSelectElement>('select[name="proposedParentMemberId"]');
    expect(parentSelect).not.toBeNull();
    expect(findButton("发送邀请").hasAttribute("disabled")).toBe(true);

    await setControlValue(parentSelect!, String(partnerMember.memberId));
    expect(findButton("发送邀请").hasAttribute("disabled")).toBe(false);
    await setControlValue(roleSelect, "partner");
    expect(container.querySelector('select[name="proposedParentMemberId"]')).toBeNull();
    await click(findButton("发送邀请"));
    await waitFor(() =>
      expect(apiMocks.createInvitation).toHaveBeenCalledWith({
        inviteeNeedoId: candidate.needoId,
        role: "partner",
        proposedParentMemberId: null
      })
    );
  });

  it("shows received invitations before creation and refreshes both invitation and alliance state", async () => {
    apiMocks.getMine.mockReset();
    apiMocks.getMine
      .mockResolvedValueOnce({ alliance: null })
      .mockResolvedValueOnce({ alliance: null });
    apiMocks.listReceivedInvitations.mockReset();
    apiMocks.listReceivedInvitations
      .mockResolvedValueOnce(page([pendingInvitation]))
      .mockResolvedValueOnce(page([]));

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("收到的邀请"));
    expect(container.textContent!.indexOf("收到的邀请")).toBeLessThan(
      container.textContent!.indexOf("建立你的第一个联盟")
    );

    await click(findButton("拒绝邀请"));
    await waitFor(() => expect(apiMocks.rejectInvitation).toHaveBeenCalledWith(41));
    await waitFor(() => expect(apiMocks.getMine).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(container.textContent).toContain("建立你的第一个联盟"));
    await act(async () => root.unmount());
    root = createRoot(container);
    apiMocks.getMine.mockReset();
    apiMocks.getMine
      .mockResolvedValueOnce({ alliance: null })
      .mockResolvedValueOnce({ alliance });
    apiMocks.listReceivedInvitations.mockReset();
    apiMocks.listReceivedInvitations
      .mockResolvedValueOnce(page([pendingInvitation]))
      .mockResolvedValueOnce(page([]));
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("接受邀请"));
    await click(findButton("接受邀请"));
    await waitFor(() => expect(apiMocks.acceptInvitation).toHaveBeenCalledWith(41));
    await waitFor(() => expect(container.textContent).toContain("东京美容联盟"));
  });

  it("shows the proposed direct parent before a subordinate accepts", async () => {
    const subordinateInvitation: AffiliateAllianceInvitation = {
      ...pendingInvitation,
      role: "subordinate",
      proposedParent: {
        memberId: partnerMember.memberId,
        person: partnerMember.person
      }
    };
    apiMocks.listReceivedInvitations.mockResolvedValue(page([subordinateInvitation]));

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("直属上级"));

    expect(container.textContent).toContain(partnerMember.person.displayName);
    expect(container.textContent).toContain(partnerMember.person.needoId);
  });

  it("shows a joined non-owner's real permissions without owner controls or hidden wallet", async () => {
    const joinedAlliance: AffiliateAlliance = {
      ...alliance,
      membership: {
        ...alliance.membership,
        memberId: partnerMember.memberId,
        role: "partner",
        managerNeedoId: alliance.owner.needoId,
        permissions: partnerMember.permissions
      }
    };
    apiMocks.getMine.mockResolvedValue({ alliance: joinedAlliance });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("我的联盟身份"));

    expect(container.textContent).toContain("合作伙伴");
    expect(container.textContent).toContain("未授权");
    expect(container.textContent).not.toContain("邀请成员");
    expect(container.textContent).not.toContain("可用余额");
    expect(container.textContent).not.toContain("冻结余额");
    expect(apiMocks.listMembers).not.toHaveBeenCalled();
  });

  it("renders expired history, paged controls, recoverable owner errors, and one create label", async () => {
    const expiredInvitation = { ...pendingInvitation, invitationId: 43, status: "expired" as const };
    apiMocks.getMine.mockResolvedValue({ alliance });
    apiMocks.listMembers
      .mockRejectedValueOnce(new ApiClientError("error.forbidden", 40301, 403))
      .mockResolvedValueOnce(page([partnerMember], 1, 25));
    apiMocks.listEligibleContacts.mockResolvedValue(page([]));
    apiMocks.listSentInvitations.mockResolvedValue(page([expiredInvitation]));

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("成员数据读取失败"));
    expect(container.textContent).toContain("已过期");
    await click(findButton("重试成员名单"));
    await waitFor(() => expect(container.textContent).toContain("下一页"));

    expect(Array.from(container.querySelectorAll("button")).filter((button) => button.textContent === "创建联盟")).toHaveLength(0);
    expect(storageSetItem).not.toHaveBeenCalled();
  });

  it("recovers a 409 by reloading and shows permission failures without local fallback", async () => {
    apiMocks.create.mockRejectedValueOnce(
      new ApiClientError("error.affiliate_alliance.already_joined", 40932, 409)
    );
    apiMocks.getMine
      .mockResolvedValueOnce({ alliance: null })
      .mockResolvedValueOnce({ alliance });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("建立你的第一个联盟"));
    await setControlValue(
      container.querySelector<HTMLInputElement>('input[name="allianceName"]')!,
      "东京美容联盟"
    );
    await click(findButton("创建联盟"));
    await waitFor(() => expect(apiMocks.getMine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.textContent).toContain("u0000000007"));

    await act(async () => root.unmount());
    root = createRoot(container);
    apiMocks.getMine.mockRejectedValueOnce(new ApiClientError("error.forbidden", 40301, 403));
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("没有权限查看联盟"));
    expect(storageSetItem).not.toHaveBeenCalled();
  });
});
