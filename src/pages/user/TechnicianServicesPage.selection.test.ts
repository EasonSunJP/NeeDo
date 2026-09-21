import { describe, expect, it } from "vitest";
import type { TechnicianServicePayload } from "../../features/pricing-mode/api";
import { findPrimaryTechnicianService } from "./TechnicianServicesPage";

function service(input: Partial<TechnicianServicePayload> & Pick<TechnicianServicePayload, "id" | "name">) {
  return {
    tags: [],
    isBookable: true,
    isRecommended: false,
    sortOrder: 0,
    ...input
  } as TechnicianServicePayload;
}

describe("technician primary service selection", () => {
  it("prefers a recommended main service without promoting an extension add-on", () => {
    const result = findPrimaryTechnicianService([
      service({ id: 1, isRecommended: true, name: "施術延長 30分", sortOrder: 0 }),
      service({ id: 2, name: "整体 60分", sortOrder: 1 }),
      service({ id: 3, isRecommended: true, name: "全身もみほぐし 60分", sortOrder: 2 })
    ]);

    expect(result?.id).toBe(3);
  });

  it("falls back to the first sorted bookable main service", () => {
    const result = findPrimaryTechnicianService([
      service({ id: 8, name: "アロマ 90分", sortOrder: 4 }),
      service({ id: 7, name: "ボディケア 60分", sortOrder: 2 }),
      service({ id: 6, isBookable: false, name: "非公開サービス", sortOrder: 0 })
    ]);

    expect(result?.id).toBe(7);
  });
});
