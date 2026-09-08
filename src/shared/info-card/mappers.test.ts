import { describe, expect, it } from "vitest";
import type { Technician } from "../../types/domain";
import { buildTechnicianInfoCardData } from "./mappers";

const technician: Technician = {
  id: "186",
  systemId: "s0000000002",
  name: "LifeDance 管理员 2",
  storeId: "217",
  role: "therapist",
  status: "available",
  rating: 5,
  orderCount: 3,
  income: 0,
  skills: ["ボディケア"],
  serviceAreas: ["東京都"],
  acceptRate: 100,
  cancelRate: 0,
  reviewCount: 3,
  languages: ["日本語"],
  avatar: "/images/generated/profiles/ai-profile-29.jpg"
};

describe("technician information-card links", () => {
  it("uses the canonical public ID instead of the internal technician profile key", () => {
    expect(buildTechnicianInfoCardData(technician).detailPath).toBe(
      "/profiles/technician/s0000000002"
    );
  });
});
