import { describe, expect, it } from "vitest";
import source from "./NeedoExchangePage.tsx?raw";

describe("NeedoExchangePage", () => {
  it("places the service search bar above the demand and intelligence tabs", () => {
    const headerStart = source.indexOf("<FloatingHomeHeader");
    const headerEnd = source.indexOf("</FloatingHomeHeader>", headerStart);
    const headerSource = source.slice(headerStart, headerEnd);

    expect(headerSource).toContain("<FloatingHeaderSearchBar");
    expect(headerSource).toContain('placeholder="搜索需要的服务"');
    expect(headerSource.indexOf("<FloatingHeaderSearchBar")).toBeLessThan(headerSource.indexOf("<FeatureSegmentedTabs"));
  });

  it("filters exchange cards through the submitted service search query", () => {
    expect(source).toContain("const [searchDraft, setSearchDraft] = useState(\"\");");
    expect(source).toContain("const [appliedSearchQuery, setAppliedSearchQuery] = useState(\"\");");
    expect(source).toContain("matchesNeedoExchangeSearch(post, appliedSearchTokens)");
    expect(source).toContain("onSubmit={() => setAppliedSearchQuery(searchDraft.trim())}");
  });

  it("keeps the demand and intelligence composer content behind the glass header", () => {
    const composerStart = source.indexOf("{showComposer && (");
    const composerEnd = source.indexOf("<ClientActionDialog", composerStart);
    const composerSource = source.slice(composerStart, composerEnd);

    expect(composerSource).toContain('<MobileFullscreenPage innerClassName="client-glass-page-surface">');
    expect(composerSource).toContain('className={cn(fullscreenHeaderClassName, "needo-composer-glass-header")}');
    expect(composerSource).toContain("showSpacer={false}");
    expect(composerSource.match(/pt-\[calc\(env\(safe-area-inset-top\)\+86px\)\]/g) ?? []).toHaveLength(3);
  });
});
