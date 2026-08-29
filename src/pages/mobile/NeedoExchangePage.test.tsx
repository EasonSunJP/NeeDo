import { describe, expect, it } from "vitest";
import source from "./NeedoExchangePage.tsx?raw";

describe("NeedoExchangePage formal entry", () => {
  it("mounts only the formal Exchange feature in each existing portal shell", () => {
    expect(source).toContain("<ExchangeFeedPage context={context} />");
    expect(source).toContain("userNavItems");
    expect(source).toContain("merchantNavItems");
    expect(source).toContain("technicianNavItems");
  });

  it("contains no retired browser business implementation or capability stub", () => {
    expect(source).not.toMatch(
      /localStorage|needoExchangeBridge|hashSystemId|getSeedPosts|getExtraPosts|getNeedoFeedPosts|findNeedoPost|getDemandDetail|error\.feature_unavailable|正式需求与情报功能尚未启用/u
    );
  });
});
