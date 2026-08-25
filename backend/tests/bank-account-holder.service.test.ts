import { BankAccountHolderService } from "../src/services/bank-account-holder.service";

describe("BankAccountHolderService", () => {
  const service = new BankAccountHolderService();

  it("normalizes half-width, hiragana, spacing, case, and bank-style large kana", () => {
    expect(service.normalizeKatakana(" やまもと　ﾀﾛｳ abc ")).toBe("ヤマモトタロウABC");
    expect(service.normalizeKatakana("ショウジ")).toBe("シヨウジ");
  });

  it.each([
    ["カ）ニード", "カブシキガイシャ ニード"],
    ["ニード（カ", "ニード カブシキガイシャ"],
    ["ド）ニード", "ゴウドウガイシャ ニード"],
    ["ニード（ユ", "ニード ユウゲンガイシャ"]
  ])("matches the official corporate abbreviation %s", (bankHolderName, legalNameKana) => {
    expect(
      service.matches({
        applicantKind: "corporate",
        bankHolderName,
        corporateLegalNameKana: legalNameKana
      })
    ).toBe(true);
  });

  it("does not accept a representative personal account for a corporate application", () => {
    expect(
      service.matches({
        applicantKind: "corporate",
        bankHolderName: "ヤマモト タロウ",
        corporateLegalNameKana: "カブシキガイシャ ニード"
      })
    ).toBe(false);
  });

  it("matches an individual account only to the verified eKYC kana name", () => {
    expect(
      service.matches({
        applicantKind: "individual",
        bankHolderName: "ﾔﾏﾓﾄ ﾀﾛｳ",
        eKycNameKana: "ヤマモト　タロウ"
      })
    ).toBe(true);
    expect(
      service.matches({
        applicantKind: "individual",
        bankHolderName: "ヤマモト ジロウ",
        eKycNameKana: "ヤマモト タロウ"
      })
    ).toBe(false);
  });

  it("blocks missing verification names and mismatches without a bypass", () => {
    expect(
      service.matches({
        applicantKind: "individual",
        bankHolderName: "ヤマモト タロウ"
      })
    ).toBe(false);
    expect(() =>
      service.assertMatches({
        applicantKind: "corporate",
        bankHolderName: "ヤマモト タロウ",
        corporateLegalNameKana: "カブシキガイシャ ニード"
      })
    ).toThrow("error.bank_account.holder_name_mismatch");
  });
});
