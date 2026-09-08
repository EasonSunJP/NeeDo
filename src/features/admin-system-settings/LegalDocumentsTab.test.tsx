import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./LegalDocumentsTab.tsx", import.meta.url), "utf8");

describe("LegalDocumentsTab", () => {
  it("offers five quick locale switches with independent draft keys", () => {
    for (const label of ["简体中文", "繁體中文", "日本語", "English", "한국어"]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("`${selectedId}:${locale}`");
    expect(source).toContain("current[key]?.dirty");
  });

  it("keeps draft save and publication as separate formal actions", () => {
    expect(source).toContain("adminSystemSettingsApi.saveLegalDraft");
    expect(source).toContain("adminSystemSettingsApi.publishLegalDraft");
    expect(source).toContain("expectedDraftLockVersion: editor.serverLockVersion");
    expect(source).toContain("publishedAt: timestamp.toISOString()");
    expect(source).toContain("editor.dirty || !editor.serverLockVersion");
  });

  it("supports metadata, safe related links, new documents, and paginated history", () => {
    expect(source).toContain("isSafeInternalPath");
    expect(source).toContain("adminSystemSettingsApi.createLegalDocument");
    expect(source).toContain("adminSystemSettingsApi.updateLegalDocument");
    expect(source).toContain("adminSystemSettingsApi.listLegalReleases");
    expect(source).toContain("版本发布日期");
  });

  it("retains drafts on conflicts and never inserts another locale as fallback", () => {
    expect(source).toContain("当前语言草稿已保留");
    expect(source).toContain("不会使用其他语言替代");
    expect(source).not.toContain("fallbackLocale");
  });
});
