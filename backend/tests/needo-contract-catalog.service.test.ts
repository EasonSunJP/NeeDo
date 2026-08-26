import { createHash } from "node:crypto";
import { NeedoContractCatalogService } from "../src/services/needo-contract-catalog.service";

describe("NeedoContractCatalogService", () => {
  const catalog = new NeedoContractCatalogService();

  it("serves a complete affiliate rules-and-contract snapshot with a stable content hash", async () => {
    const contract = await catalog.getCurrent("affiliate", "zh-CN");
    expect(contract.version).toBe("affiliate-2026-08-26-v1");
    expect(contract.text).toContain("NeeDo 联盟营销规则及合同");
    expect(contract.text).toContain("eKYC");
    expect(contract.text).toContain("银行账户名义人");
    expect(contract.text).toContain("日本法");
    expect(contract.text).toContain("确认开启");
    expect(contract.contentHash).toBe(
      createHash("sha256").update(contract.text, "utf8").digest("hex")
    );
  });

  it("includes the merchant fee, exact 15-day boundary, and all examples in its contract", async () => {
    const contract = await catalog.getCurrent("merchant", "zh-CN");
    expect(contract.version).toBe("merchant-2026-08-26-v1");
    expect(contract.text).toContain("9,800");
    expect(contract.text).toContain("正好剩余 15 天");
    expect(contract.text).toContain("8 月 20 日");
    expect(contract.text).toContain("12 月 1 日");
    expect(contract.text).toContain("8 月 10 日");
    expect(contract.text).toContain("11 月 1 日");
  });

  it("supports Japanese and English without falling back to a different requested language", async () => {
    await expect(catalog.getCurrent("affiliate", "ja")).resolves.toMatchObject({
      language: "ja",
      type: "affiliate"
    });
    await expect(catalog.getCurrent("affiliate", "en")).resolves.toMatchObject({
      language: "en",
      type: "affiliate"
    });
    await expect(catalog.getCurrent("affiliate", "fr")).rejects.toMatchObject({
      message: "error.contract.language_not_supported",
      statusCode: 400
    });
  });
});
