import { describe, expect, it } from "vitest";
import { buildNeedoPostTags, extractNeedoRemarkTags, stripNeedoRemarkTags } from "./NeedoExchangePage";
import offerCardSource from "../../components/mobile/OfferInfoCard.tsx?raw";
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

  it("keeps only demand and intelligence without an all-feed state", () => {
    const headerStart = source.indexOf("<FloatingHomeHeader");
    const headerEnd = source.indexOf("</FloatingHomeHeader>", headerStart);
    const headerSource = source.slice(headerStart, headerEnd);

    expect(headerSource).toContain('{ label: "需求", value: "demand" }');
    expect(headerSource).toContain('{ label: "情报", value: "reverse" }');
    expect(headerSource).not.toContain('{ label: "全部", value: "all" }');
    expect(source).not.toContain('primaryTab: "all"');
    expect(source).not.toContain('requestedTab === "all"');
    expect(source).not.toContain('activeType === "all"');
    expect(source).not.toContain('"all" | "demand" | "reverse"');
    expect(source).toMatch(
      /setActiveType\(\s*requestedTab === "demand" \|\| requestedTab === "reverse"\s*\? requestedTab\s*: copy\.primaryTab\s*\)/u,
    );
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

  it("extracts only remark hashtags without system or title tags", () => {
    const remark = "肩颈、足部都可以约 #肩颈调理 20:30 后还有空档，#双人护理，会员 8 折 #中文OK";

    expect(extractNeedoRemarkTags(remark)).toEqual(["肩颈调理", "双人护理", "中文OK"]);
    expect(stripNeedoRemarkTags(remark)).toBe("肩颈、足部都可以约 20:30 后还有空档，会员 8 折");
    expect(buildNeedoPostTags(["新需求", "等待抢单", "平台担保"], "#标题里不应该是标签", remark)).toEqual(["肩颈调理", "双人护理", "中文OK"]);
  });

  it("passes remark tags into the card remark component instead of prefixing the title", () => {
    const noteSurfaceIndex = offerCardSource.indexOf("toneClasses.noteSurface");
    const tagComponentIndex = offerCardSource.indexOf('aria-label="标签"');

    expect(source).toContain("tags={post.tags}");
    expect(source).not.toContain("titlePrefix={serviceLabel");
    expect(source).toContain("tags: buildNeedoPostTags([], nextPostTitle, nextPostDetailSource)");
    expect(source).not.toContain('"新需求", "等待抢单", "平台担保"');
    expect(source).not.toContain('tags: demand ? ["急单", "评价优先", "平台担保"]');
    expect(tagComponentIndex).toBeGreaterThan(noteSurfaceIndex);
    expect(offerCardSource).not.toContain("#{tag}");
  });

  it("renders the new state as a compact red dot instead of a large NEW badge", () => {
    expect(offerCardSource).toContain('aria-label="新内容"');
    expect(offerCardSource).toContain("h-3 w-3 rounded-full bg-[#ff5a5a]");
    expect(offerCardSource).not.toContain("tracking-[0.08em] text-white");
  });
});
