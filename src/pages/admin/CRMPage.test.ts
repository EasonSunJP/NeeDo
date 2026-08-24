import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CRMPage.tsx", import.meta.url), "utf8");

describe("CRMPage formal customer handoff", () => {
  it("routes the legacy CRM entry to the persisted customer workspace", () => {
    expect(source).toContain("Navigate");
    expect(source).toContain('/admin/users?view=customers');
    expect(source).toContain("replace");
  });

  it("does not load browser-local customer analytics or demo records", () => {
    expect(source).not.toContain("CustomerManagementModule");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("LTV");
    expect(source).not.toContain("流失预警");
  });
});
