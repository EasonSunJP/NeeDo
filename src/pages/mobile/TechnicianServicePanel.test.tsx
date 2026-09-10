// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreReadApi, type CoreCategory } from "../../features/core-read/api";
import { pricingModeApi, type TechnicianServicePayload } from "../../features/pricing-mode/api";
import { FormalTechnicianServicesPanel } from "./TechnicianPortalPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const category: CoreCategory = {
  id: 7,
  code: "body-care",
  name: "身体护理",
  nameJa: "ボディケア",
  nameEn: "Body care",
  parentId: null,
  iconUrl: null,
  sortOrder: 1,
  isActive: true,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z"
};

const createdService: TechnicianServicePayload = {
  id: 91,
  publicId: "00000000-0000-4000-8000-000000000091",
  shopId: 12,
  technicianId: 31,
  sourceShopServiceId: null,
  name: "肩颈护理",
  description: null,
  categoryId: category.id,
  priceAmount: 8800,
  currency: "JPY",
  durationMinutes: 60,
  taxIncluded: true,
  coverImageUrl: null,
  images: [],
  tags: [],
  shop: { publicId: "shop0000000012", name: "测试店铺", address: "东京都" },
  isActive: true,
  isBookable: true,
  isRecommended: false,
  sortOrder: 0,
  reviewStatus: "APPROVED",
  rejectionReason: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  usageCount: 0
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function setControlValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("FormalTechnicianServicesPanel", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(coreReadApi, "listCategories").mockResolvedValue({
      list: [category],
      total: 1,
      page: 1,
      page_size: 100
    });
    vi.spyOn(pricingModeApi, "listMyTechnicianServices").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 5
    });
    vi.spyOn(pricingModeApi, "getShopPricingMode").mockResolvedValue({
      shopId: 12,
      pricingMode: "technician",
      technicianPricingRatePercent: 100,
      updatedAt: null,
      updatedBy: null
    });
    vi.spyOn(pricingModeApi, "createTechnicianService").mockResolvedValue(createdService);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("creates the first service with a category from the formal active catalog", async () => {
    await act(async () => {
      root.render(<FormalTechnicianServicesPanel defaultCategoryId={null} defaultShopId={12} />);
    });
    await waitFor(() => expect(container.textContent).toContain("添加服务 0/5"));

    expect(coreReadApi.listCategories).toHaveBeenCalledWith({ page: 1, pageSize: 100 });

    const addButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("添加服务")
    );
    if (!addButton) throw new Error("Add service button was not rendered");
    await click(addButton);

    const categorySelect = container.querySelector<HTMLSelectElement>('select[aria-label="服务分类"]');
    if (!categorySelect) throw new Error("Formal category selector was not rendered");
    expect(categorySelect.value).toBe("0");
    await setControlValue(categorySelect, String(category.id));

    const inputs = container.querySelectorAll<HTMLInputElement>('input:not([type="file"])');
    await setControlValue(inputs[0], "肩颈护理");
    await setControlValue(inputs[1], "8800");

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent === "保存"
    );
    if (!saveButton) throw new Error("Save service button was not rendered");
    await click(saveButton);

    await waitFor(() => expect(pricingModeApi.createTechnicianService).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        categoryId: category.id,
        name: "肩颈护理",
        priceAmount: 8800,
        durationMinutes: 60,
        sortOrder: 0
      })
    ));
    expect(container.textContent).not.toContain("当前没有可用的正式服务分类");
  });
});
