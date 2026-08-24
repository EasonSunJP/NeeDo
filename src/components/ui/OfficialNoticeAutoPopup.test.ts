import { describe, expect, it } from "vitest";
import popupSource from "./OfficialNoticeAutoPopup.tsx?raw";

describe("OfficialNoticeAutoPopup storage synchronization", () => {
  it("ignores unrelated NeeDo storage traffic from other open tabs", () => {
    expect(popupSource).toContain("event: StorageEvent");
    expect(popupSource).toContain("officialNoticeStorageKey");
    expect(popupSource).toContain("event.key !== dismissedStorageKey");
    expect(popupSource).toContain("event.key !== officialNoticeStorageKey");
  });
});
