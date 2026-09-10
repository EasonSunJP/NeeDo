// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { pricingModeApi } from "../../features/pricing-mode/api";
import { merchantManualEmployeeStorageKey, merchantStaffRoleLabelStorageKey } from "../../lib/merchantStaffRoles";
import type { Store, Technician } from "../../types/domain";
import { MerchantPortalContent } from "./MerchantPortalPage";
import merchantSource from "./MerchantPortalPage.tsx?raw";

const source = merchantSource;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const merchantEmploymentTestState = vi.hoisted(() => ({
  session: {
    id: 1,
    portal: "merchant",
    linkedStoreId: "1",
    activePublicId: "m0000000001",
    primaryPublicId: "m0000000001",
    username: "merchant@example.com",
    avatarUrl: null
  },
  imStore: {
    contacts: [],
    usersById: {},
    updateContactTags: vi.fn()
  }
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
    session: merchantEmploymentTestState.session
  })
}));

vi.mock("../../state/entityStore", () => ({
  updateTechnicianEntity: vi.fn(),
  useEntityStore: () => ({ customers: [], stores: [], technicians: [] })
}));

vi.mock("../../features/im/store", () => ({
  useImStore: () => merchantEmploymentTestState.imStore
}));

vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: React.ReactNode }) => createElement("main", null, children)
}));

vi.mock("../../components/client-ui/AppScaffold", async () => {
  const actual = await vi.importActual<typeof import("../../components/client-ui/AppScaffold")>("../../components/client-ui/AppScaffold");
  return {
    ...actual,
    FeatureSegmentedTabs: ({ items, onChange }: { items: Array<{ label: React.ReactNode; value: string }>; onChange: (value: string) => void }) =>
      createElement("div", null, items.map((item) => createElement("button", { key: item.value, onClick: () => onChange(item.value), type: "button" }, item.label)))
  };
});

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "jade-light" })
}));

const testStore: Store = {
  id: "store-1",
  systemId: "store-system-1",
  merchantId: "merchant-1",
  name: "测试门店",
  area: "港区",
  address: "東京都港区",
  rating: 4.8,
  reviewCount: 20,
  priceLabel: "￥8,800起",
  tags: ["测试"],
  openStatus: "open",
  nextSlot: "今天 10:00",
  cover: "/store.jpg",
  gallery: [],
  description: "测试门店",
  rankLabel: "推荐",
  businessHours: "10:00-22:00",
  mode: "store",
  paymentMethods: ["platform"]
};

const testTechnicians: Technician[] = [
  {
    id: "28",
    systemId: "s0000000001",
    name: "技师甲",
    nickname: "甲",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    rating: 4.9,
    orderCount: 10,
    income: 100000,
    skills: ["技师"],
    serviceAreas: ["港区"],
    acceptRate: 98,
    cancelRate: 1,
    reviewCount: 10,
    languages: ["日本語"],
    avatar: "/tech-1.jpg"
  },
  {
    id: "29",
    systemId: "s0000000002",
    name: "技师乙",
    nickname: "乙",
    storeId: "store-1",
    role: "therapist",
    status: "busy",
    rating: 4.7,
    orderCount: 8,
    income: 80000,
    skills: ["技师"],
    serviceAreas: ["港区"],
    acceptRate: 96,
    cancelRate: 2,
    reviewCount: 8,
    languages: ["日本語"],
    avatar: "/tech-2.jpg"
  }
];

const formalTechnicians = testTechnicians.map((technician, index) => ({
  id: index + 28,
  userId: index + 11,
  needoId: technician.systemId,
  displayName: technician.name,
  email: `${technician.id}@example.com`,
  avatarUrl: technician.avatar,
  shopId: 1,
  shopName: testStore.name,
  city: "東京都",
  serviceArea: "港区",
  employmentType: index === 0 ? "full_time" as const : "temporary" as const,
  employmentStartedAt: "2026-01-01T00:00:00.000Z",
  status: "published",
  verifiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z"
}));

let container: HTMLDivElement;
let root: Root;

function buttonByLabel(label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === label);
}

function inputByLabel(label: string) {
  return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderPortalPage(initialEntry: string) {
  const element = createElement(MerchantPortalContent, { store: testStore, technicians: testTechnicians });

  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/merchant", element }),
          createElement(
            Route,
            { path: "/merchant/:view", element }
          )
        )
      )
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderStaffPage() {
  await renderPortalPage("/merchant/staff");
}

describe("MerchantPortal formal employment data", () => {
  it("joins persisted technician employment types from the protected merchant API", () => {
    expect(source).toContain("loadEveryMerchantTechnicianPage");
    expect(source).toContain("toMerchantStaffEmploymentType");
    expect(source).toContain("formalStaffByNeedoId");
    expect(source).not.toContain("正式员工档案缺少雇佣类型");
  });

  it("does not infer employment from identity labels or array position", () => {
    expect(source).not.toContain("index % 4");
    expect(source).not.toContain("getMerchantStaffEmploymentType(technician, index)");
  });

  it("renders every staff role as a full-width top-level section", () => {
    const roleSectionSource = source.slice(
      source.indexOf("function MerchantStaffRoleSection"),
      source.indexOf("function getMerchantOrderProvider")
    );
    const staffPanelSource = source.slice(
      source.indexOf('{activeView === "staff" && ('),
      source.indexOf('{activeView === "schedule" && (')
    );

    expect(staffPanelSource).not.toContain('title="职务与员工"');
    expect(roleSectionSource).toContain('<section className="space-y-3">');
    expect(roleSectionSource).not.toContain("rounded-[28px]");
    expect(roleSectionSource).toContain("<h2");
    expect(roleSectionSource).toContain("{group.count} 人");
    expect(roleSectionSource).not.toContain("rounded-[24px]");
  });

  describe("rendered staff role layout", () => {
    beforeEach(() => {
      window.localStorage.clear();
      window.localStorage.setItem(merchantManualEmployeeStorageKey, JSON.stringify([
        { id: "manual-general", storeId: "store-1", name: "总务一", roleName: "总务", salaryMonthly: 100000, status: "在岗", employmentType: "fullTime" },
        { id: "manual-finance", storeId: "store-1", name: "财务一", roleName: "财务", salaryMonthly: 110000, status: "在岗", employmentType: "fullTime" },
        { id: "manual-driver", storeId: "store-1", name: "司机一", roleName: "司机", salaryMonthly: 120000, status: "在岗", employmentType: "fullTime" },
        { id: "manual-chef", storeId: "store-1", name: "厨师一", roleName: "厨师", salaryMonthly: 130000, status: "在岗", employmentType: "fullTime" }
      ]));
      window.localStorage.setItem(merchantStaffRoleLabelStorageKey, JSON.stringify({}));
      vi.spyOn(backofficeRealDataApi, "technicians").mockResolvedValue({ list: formalTechnicians, total: formalTechnicians.length, page: 1, page_size: 100 });
      vi.spyOn(pricingModeApi, "getShopPricingMode").mockResolvedValue({ shopId: 1, pricingMode: "merchant", technicianPricingRatePercent: 100, updatedAt: null, updatedBy: null });
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    });

    afterEach(async () => {
      await act(async () => root.unmount());
      container.remove();
      vi.restoreAllMocks();
    });

    it("renders five role sections as direct siblings with inline counts and an independent form", async () => {
      await renderStaffPage();

      expect(container.textContent).not.toContain("无法读取正式员工数据");
      expect(container.querySelector('img[src="/tech-1.jpg"]')).not.toBeNull();
      expect(container.querySelector('img[src="/tech-2.jpg"]')).not.toBeNull();

      const roleSections = ["技师", "总务", "财务", "司机", "厨师"].map((roleName) => {
        const heading = [...container.querySelectorAll("h2")].find((node) => node.textContent?.trim() === roleName);
        expect(heading).toBeDefined();
        return heading?.closest("section") as HTMLElement;
      });
      const roleList = roleSections[0].parentElement;
      expect(roleSections.every((section) => section.parentElement === roleList)).toBe(true);
      expect(roleSections.map((section) => section.textContent)).toEqual([
        expect.stringContaining("2 人"),
        expect.stringContaining("1 人"),
        expect.stringContaining("1 人"),
        expect.stringContaining("1 人"),
        expect.stringContaining("1 人")
      ]);
      roleSections.forEach((section) => {
        const heading = section.querySelector("h2") as HTMLElement;
        const count = [...section.querySelectorAll("span")].find((node) => node.textContent?.trim().startsWith("1 人") || node.textContent?.trim().startsWith("2 人"));
        expect(heading.parentElement?.parentElement?.contains(count ?? null)).toBe(true);
      });

      const formHeading = [...container.querySelectorAll("h2")].find((node) => node.textContent?.trim() === "添加员工");
      const formSection = formHeading?.closest("section") as HTMLElement;
      expect(formSection).toBeDefined();
      expect(formSection.previousElementSibling).toBe(roleList);
      expect(formSection.getAttribute("aria-labelledby")).toBe(formHeading?.id);
      expect(container.querySelector('label[for="merchant-staff-role-input"]')).not.toBeNull();
      expect(container.querySelector('label[for="merchant-staff-name-input"]')).not.toBeNull();
      expect(container.querySelector('label[for="merchant-staff-salary-input"]')).not.toBeNull();
    });

    it("loads every formal classification page before joining by canonical NeeDoID", async () => {
      vi.mocked(backofficeRealDataApi.technicians).mockImplementation(async (_scope, query) => {
        if (query?.page === 2) {
          return { list: [formalTechnicians[1]], total: 101, page: 2, page_size: 100 };
        }
        return { list: [formalTechnicians[0]], total: 101, page: 1, page_size: 100 };
      });

      await renderStaffPage();

      expect(backofficeRealDataApi.technicians).toHaveBeenCalledWith("merchant-admin", expect.objectContaining({ page: 2 }));
      expect(container.querySelector('img[src="/tech-1.jpg"]')).not.toBeNull();
      expect(container.querySelector('img[src="/tech-2.jpg"]')).not.toBeNull();
    });

    it("shows only formal current-shop employees in the dashboard employee status", async () => {
      vi.mocked(backofficeRealDataApi.technicians).mockResolvedValue({
        list: [formalTechnicians[0]],
        total: 1,
        page: 1,
        page_size: 100
      });

      await renderPortalPage("/merchant");

      expect(container.querySelector('img[src="/tech-1.jpg"]')).not.toBeNull();
      expect(container.querySelector('img[src="/tech-2.jpg"]')).toBeNull();
    });

    it("keeps temporary employees in All and separates them in the Temporary tab", async () => {
      await renderStaffPage();

      expect(container.querySelector('img[src="/tech-1.jpg"]')).not.toBeNull();
      expect(container.querySelector('img[src="/tech-2.jpg"]')).not.toBeNull();
      const temporaryTab = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "临时");
      expect(temporaryTab).toBeDefined();
      await act(async () => {
        temporaryTab?.click();
        await Promise.resolve();
      });

      expect(container.querySelector('img[src="/tech-1.jpg"]')).toBeNull();
      expect(container.querySelector('img[src="/tech-2.jpg"]')).not.toBeNull();
      expect(container.textContent).not.toContain("总务一");
    });

    it("keeps role rename, add, delete, and technician detail navigation interactive", async () => {
      await renderStaffPage();

      const renameButton = buttonByLabel("编辑总务职务名");
      expect(renameButton).toBeDefined();
      await act(async () => renameButton?.click());
      const renameInput = inputByLabel("编辑总务职务名");
      expect(renameInput).toBeDefined();
      await act(async () => {
        if (renameInput) {
          setInputValue(renameInput, "后台");
          renameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      });
      expect(container.textContent).toContain("后台");
      expect(container.textContent).not.toContain("编辑总务职务名");

      await act(async () => buttonByLabel("在后台下添加员工")?.click());
      expect(container.textContent).toContain("后台员工 2");

      const nameInput = container.querySelector<HTMLInputElement>("#merchant-staff-name-input");
      const salaryInput = container.querySelector<HTMLInputElement>("#merchant-staff-salary-input");
      const roleInput = container.querySelector<HTMLInputElement>("#merchant-staff-role-input");
      await act(async () => {
        if (nameInput && salaryInput && roleInput) {
          setInputValue(roleInput, "临时员工");
          setInputValue(nameInput, "新增员工");
          setInputValue(salaryInput, "88000");
        }
        [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("添加员工"))?.click();
      });
      expect(container.textContent).toContain("新增员工");

      await act(async () => buttonByLabel("删除新增员工")?.click());
      await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "删除")?.click());
      expect(container.textContent).not.toContain("新增员工");

      const detailLink = container.querySelector<HTMLAnchorElement>('a[href="/merchant/staff/s0000000001"]');
      expect(detailLink).not.toBeNull();
    });

    it("filters both formal technicians and manual employees from the shared header search", async () => {
      await renderStaffPage();

      const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索员工"]');
      expect(search).not.toBeNull();
      await act(async () => {
        if (search) setInputValue(search, "技师乙");
      });

      expect(container.textContent).toContain("乙");
      expect(container.textContent).not.toContain("甲");
      expect(container.textContent).not.toContain("总务一");
    });
  });
});
