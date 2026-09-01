import { createHash } from "node:crypto";
import {
  UNICODE_16_DEFAULT_CASE_FOLD_OVERRIDE_COUNT,
  unicodeDefaultCaseFoldKey
} from "../src/utils/unicode-default-case-fold";

describe("Unicode 16 default case folding", () => {
  it.each([
    ["Straße", "strasse"],
    ["STRASSE", "strasse"],
    ["Σ", "σ"],
    ["ς", "σ"],
    ["ẞ", "ss"]
  ])("folds %s to %s", (input, expected) => {
    expect(unicodeDefaultCaseFoldKey(input)).toBe(expected);
  });

  it("does not merge dotless i with latin i", () => {
    expect(unicodeDefaultCaseFoldKey("ı")).toBe("ı");
    expect(unicodeDefaultCaseFoldKey("i")).toBe("i");
  });

  it("matches the exhaustive Unicode 16 NFKC plus default-casefold fixture", () => {
    const digest = createHash("sha256");
    let scalarCount = 0;
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
      const folded = Buffer.from(unicodeDefaultCaseFoldKey(String.fromCodePoint(codePoint)), "utf8");
      const recordHeader = Buffer.allocUnsafe(8);
      recordHeader.writeUInt32BE(codePoint, 0);
      recordHeader.writeUInt32BE(folded.length, 4);
      digest.update(recordHeader);
      digest.update(folded);
      scalarCount += 1;
    }

    expect(UNICODE_16_DEFAULT_CASE_FOLD_OVERRIDE_COUNT).toBe(297);
    expect(scalarCount).toBe(1_112_064);
    expect(digest.digest("hex")).toBe("d813ce37a89a97ce4106b0cf0b6dd414f9a7f9ae36eebb6c4c35aac6efa77ddf");
  });
});
