import { describe, expect, it } from "vitest";
import customerPagesSource from "./customer-pages.tsx?raw";

describe("dine-in customer pages tax labels", () => {
  it("uses Chinese tax-included wording instead of raw Japanese 税込 in Chinese source UI", () => {
    expect(customerPagesSource).toContain("(含税)");
    expect(customerPagesSource).toContain("商品小计（含税）");
    expect(customerPagesSource).toContain("价格均以含税显示");
    expect(customerPagesSource).not.toContain("(税込)");
    expect(customerPagesSource).not.toContain("商品小计（税込）");
    expect(customerPagesSource).not.toContain("价格均以税込显示");
  });
});
