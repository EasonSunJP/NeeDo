import { describe, expect, it } from "vitest";
import source from "./AdminLayout.tsx?raw";

describe("AdminLayout navigation", () => {
  it("does not expose the removed operations design module", () => {
    expect(source).not.toContain('key: "design"');
    expect(source).not.toContain('title: "设计"');
    expect(source).not.toContain('to: "/admin/decoration"');
    expect(source).not.toContain('label: "装修中心"');
  });
});
