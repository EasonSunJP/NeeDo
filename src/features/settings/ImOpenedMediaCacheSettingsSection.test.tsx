import { describe, expect, it } from "vitest";
import {
  formatImOpenedMediaCacheBytes,
  getNextImOpenedMediaCacheClearState,
} from "./ImOpenedMediaCacheSettingsSection";
import accountSettingsSource from "./UnifiedSettingsPages.tsx?raw";
import cacheSettingsSource from "./ImOpenedMediaCacheSettingsSection.tsx?raw";

describe("opened IM media cache settings", () => {
  it("formats encrypted device usage without overstating precision", () => {
    expect(formatImOpenedMediaCacheBytes(0)).toBe("0 B");
    expect(formatImOpenedMediaCacheBytes(1536)).toBe("1.5 KB");
    expect(formatImOpenedMediaCacheBytes(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("requires two deliberate actions before clearing the current account cache", () => {
    expect(getNextImOpenedMediaCacheClearState("idle")).toBe("confirming");
    expect(getNextImOpenedMediaCacheClearState("confirming")).toBe("clearing");
    expect(getNextImOpenedMediaCacheClearState("clearing")).toBe("idle");
  });

  it("places current-account media cache controls on the non-affiliate account page", () => {
    expect(accountSettingsSource).toContain(
      'import { ImOpenedMediaCacheSettingsSection } from "./ImOpenedMediaCacheSettingsSection";',
    );
    expect(accountSettingsSource).toContain(
      'portal !== "business" && session ? (',
    );
    expect(accountSettingsSource).toContain(
      '<ImOpenedMediaCacheSettingsSection accountId={String(session.id)} />',
    );
  });

  it("guards late usage and clear completions after account changes", () => {
    expect(cacheSettingsSource).toContain(
      "const generation = ++requestGenerationRef.current",
    );
    expect(cacheSettingsSource).toContain(
      "requestGenerationRef.current !== generation",
    );
    expect(cacheSettingsSource).toContain(
      "activeAccountIdRef.current !== targetAccountId",
    );
  });
});
