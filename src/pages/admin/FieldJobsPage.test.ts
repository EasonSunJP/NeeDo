import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./FieldJobsPage.tsx", import.meta.url),
  "utf8",
);
const nav = readFileSync(
  new URL("../../components/admin/AdminLayout.tsx", import.meta.url),
  "utf8",
);

describe("FieldJobsPage formal read projection", () => {
  it("renders the paginated formal API and an audited detail drawer", () => {
    expect(source).toMatch(/fieldJobApi\s*\.list/u);
    expect(source).toMatch(/fieldJobApi\s*\.get/u);
    expect(source).toContain("DataTable<FieldJobSummary>");
    expect(source).toContain('paginationMode="server"');
    expect(source).toContain("服务器共");
    expect(source).toContain("履约地址");
    expect(source).toContain("状态时间线");
  });

  it("does not expose fake records or unsupported field-job mutations", () => {
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain(">派工<");
    expect(source).not.toContain(">改派<");
    expect(source).not.toContain(">拍照上传<");
    expect(source).not.toContain(">完工确认<");
    expect(source).toContain("to={`/admin/orders?orderId=${detail.id}`}");
  });

  it("permission-gates the navigation entry", () => {
    expect(nav).toContain(
      '{ label: "上门工单", to: "/admin/field-jobs", icon: "工", permission: "backoffice:field-jobs:read" }',
    );
  });
});
