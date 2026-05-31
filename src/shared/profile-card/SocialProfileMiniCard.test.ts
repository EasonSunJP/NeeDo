import { describe, expect, it } from "vitest";
import cardSource from "./SocialProfileMiniCard.tsx?raw";

describe("SocialProfileMiniCard cover readability", () => {
  it("changes cover text colors without adding a title capsule container", () => {
    expect(cardSource).toContain("coverDark ? \"text-white");
    expect(cardSource).toContain("text-[#25282d]");
    expect(cardSource).toContain("bg-[#f3cf78]/22 text-[#7b560f]");
    expect(cardSource).toContain("bg-[#7662e8]/16 text-[#4b3ca5]");
    expect(cardSource).not.toContain("rounded-[14px] bg-black/48 px-2 py-1");
  });

  it("does not append the generic service type chip in service card titles", () => {
    expect(cardSource).toContain('if (data.entityType === "service")');
    expect(cardSource).toContain("return null;");
    expect(cardSource).toContain('data.entityType === "service" ? "max-w-full"');
  });

  it("uses the shared circle heart metric action for follow controls", () => {
    expect(cardSource).toContain("<IconMetricAction");
    expect(cardSource).toContain('icon="heart"');
    expect(cardSource).toContain("count={count}");
    expect(cardSource).toContain('size="sm"');
    expect(cardSource).toContain("absolute right-2 top-2 z-20");
    expect(cardSource).not.toContain('label === "关注"');
  });
});
