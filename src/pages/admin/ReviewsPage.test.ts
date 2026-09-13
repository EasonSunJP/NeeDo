import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ReviewsPage.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../../components/admin/AdminLayout.tsx", import.meta.url), "utf8");

describe("ReviewsPage formal review center", () => {
  it("does not present legacy review fixtures or invented review metrics", () => {
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain('"4.72"');
    expect(source).not.toContain('"128"');
    expect(source).not.toContain('"17"');
    expect(source).not.toContain('"6"');
  });

  it("loads the formal paginated API and renders immutable review facts", () => {
    expect(source).toContain("listOperationsReviews");
    expect(source).toContain("getOperationsReview");
    expect(source).toContain('paginationMode="server"');
    expect(source).toContain("不可变修订历史");
    expect(source).toContain("关联正式记录");
    expect(source).not.toContain("正式评价功能尚未启用");
  });

  it("uses the same formal read permission for the route and navigation item", () => {
    expect(appSource).toContain(
      'path="/admin/reviews" element={protectPermission("admin", "backoffice:users:read", <ReviewsPage />)}'
    );
    expect(layoutSource).toContain(
      '{ label: "评价管理", to: "/admin/reviews", icon: "评", permission: "backoffice:users:read"'
    );
  });
});
