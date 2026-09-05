import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { canCancelOfficialNotice, canRetryOfficialNotice, describeOfficialNoticeError, isOfficialNoticeReasonValid } from "./OfficialNoticeWorkspace";

describe("official notice lifecycle presentation", () => {
  it("offers cancel only for backend-cancellable states", () => {
    expect(["draft", "pending_review", "approved", "scheduled"].filter((status) => canCancelOfficialNotice(status as never))).toEqual([
      "draft", "pending_review", "approved", "scheduled"
    ]);
    for (const status of ["sending", "sent", "cancelled", "archived"] as const) {
      expect(canCancelOfficialNotice(status)).toBe(false);
    }
  });

  it("offers retry only for sent or sending notices with failures", () => {
    expect(canRetryOfficialNotice("sent", 1)).toBe(true);
    expect(canRetryOfficialNotice("sending", 2)).toBe(true);
    expect(canRetryOfficialNotice("sent", 0)).toBe(false);
    expect(canRetryOfficialNotice("scheduled", 1)).toBe(false);
  });

  it("matches the backend minimum reason length", () => {
    expect(isOfficialNoticeReasonValid("a")).toBe(false);
    expect(isOfficialNoticeReasonValid(" 操作 ")).toBe(true);
  });

  it("localizes formal authorization errors instead of exposing API keys", () => {
    expect(describeOfficialNoticeError(new ApiClientError("error.identity.forbidden", 40301, 403), "ja")).toBe(
      "現在のIDにはこの通知操作を実行する権限がありません。"
    );
  });
});
