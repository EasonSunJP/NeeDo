import { describe, expect, it } from "vitest";
import { getPortalEntryUrl } from "./portalEntry";

describe("getPortalEntryUrl", () => {
  it("opens the affiliate profile through the business portal HTML entry", () => {
    expect(
      getPortalEntryUrl(
        "business",
        "/afirieito/me",
        "http://127.0.0.1:5180/user.html#/me/identity/affiliate/contract",
      ),
    ).toBe("http://127.0.0.1:5180/afirieito.html#/afirieito/me");
  });
});
