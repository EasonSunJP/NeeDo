import { createHash } from "node:crypto";
import { NeedoContractCatalogService } from "../src/services/needo-contract-catalog.service";
import {
  AFFILIATE_CONTRACT_TEXT,
  LEGAL_CONTRACT_EFFECTIVE_AT,
  MERCHANT_CONTRACT_TEXT
} from "../src/bootstrap/legal-document-bootstrap";

describe("NeedoContractCatalogService", () => {
  const catalog = new NeedoContractCatalogService({
    getCurrentBySlug: jest.fn(async (slug: string, locale: "zh-CN" | "ja" | "en") => {
      const type = slug === "merchant-agreement" ? "merchant" : "affiliate";
      const body = type === "merchant" ? MERCHANT_CONTRACT_TEXT[locale] : AFFILIATE_CONTRACT_TEXT[locale];
      return {
        publicId: "11111111-1111-4111-8111-111111111111",
        documentId: 1,
        slug,
        internalPath: `/me/settings/${slug}`,
        displayLocations: [],
        locale,
        version: 1,
        title: body.split("\n", 1)[0],
        body,
        contentHash: "stored-release-hash",
        publishedAt: LEGAL_CONTRACT_EFFECTIVE_AT,
        publishedByUserId: 1
      };
    })
  });

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

  it("fails closed when the requested persisted release is unavailable", async () => {
    const unavailable = new NeedoContractCatalogService({
      getCurrentBySlug: jest.fn(async () => null)
    });
    await expect(unavailable.getCurrent("merchant", "ja")).rejects.toMatchObject({
      message: "error.contract.unavailable",
      statusCode: 404
    });
  });
});
