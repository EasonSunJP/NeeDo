import { describe, expect, it } from "vitest";
import source from "./NeedoExchangePage.tsx?raw";

describe("NeedoExchangePage", () => {
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
