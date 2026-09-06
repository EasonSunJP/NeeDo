import { describe, expect, it } from "vitest";
import { languageToLegalLocale } from "./publicLegalDocuments";

describe("public legal document locale mapping", () => {
  it("maps every UI language to its exact persisted locale without fallback", () => {
    expect(languageToLegalLocale("zh")).toBe("zh-CN");
    expect(languageToLegalLocale("zh-Hant")).toBe("zh-TW");
    expect(languageToLegalLocale("ja")).toBe("ja");
    expect(languageToLegalLocale("en")).toBe("en");
    expect(languageToLegalLocale("ko")).toBe("ko");
  });
});
