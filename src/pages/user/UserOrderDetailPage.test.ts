import { describe, expect, it } from "vitest";
import source from "./UserOrderDetailPage.tsx?raw";

describe("UserOrderDetailPage header", () => {
  it("keeps a back button before the appointment detail title", () => {
    expect(source).toContain("const handleBack = () => {");
    expect(source).toContain("navigate(-1);");
    expect(source).toContain("onBack={handleBack}");
    expect(source).toContain('navigate("/", { replace: true });');
    expect(source).not.toContain('navigate("/orders", { replace: true });');
    expect(source).not.toContain("hideBackButton");
    expect(source).toContain('closeLabel="关闭预约详情"');
  });
});
