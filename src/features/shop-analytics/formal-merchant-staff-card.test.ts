import { describe, expect, it } from "vitest";
import { buildFormalMerchantStaffCard } from "./formal-merchant-staff-card";
import source from "../../pages/mobile/MerchantPortalPage.tsx?raw";
import employeeDetailWorkspaceSource from "../../components/merchant-admin/MerchantEmployeeDetailWorkspace.tsx?raw";

describe("formal merchant staff cards", () => {
  const staff = { id: "tech-api-28", name: "佐藤", nickname: "佐藤 美咲", avatar: "/avatar.jpg", bio: "施術歴10年", serviceAreas: ["東京都"], rating: 4.6, reviewCount: 8, specialReviewTags: [{ code: "service_max", label: "服务max", count: 4 }] };
  it("uses persisted profile and review fields without generated verification or social claims", () => {
    expect(buildFormalMerchantStaffCard(staff)).toMatchObject({ id: staff.id, displayName: staff.nickname, avatar: staff.avatar, headline: staff.bio, regionLabel: "東京都", scoreValue: "4.6", kycVerified: false, levelLabel: "", followerCount: 0, followingCount: 0, specialReviewTags: staff.specialReviewTags });
  });
  it("does not present a default rating without reviews", () => {
    expect(buildFormalMerchantStaffCard({ ...staff, rating: 5, reviewCount: 0 }).scoreValue).toBe("—");
  });
  it("uses explicit formal data and hides unsupported level and social fields in home, staff lists and staff summary", () => {
    expect(source.match(/data=\{buildFormalMerchantStaffCard\(technician\)\}/g)).toHaveLength(2);
    expect(employeeDetailWorkspaceSource).toContain("<EmployeeDetailCard");
    expect(source).toContain("showSocialStats={false}");
    expect(source).toContain("showLevel={false}");
  });
});
