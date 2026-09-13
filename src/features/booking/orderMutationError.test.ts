import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { describeBookingOrderMutationError } from "./orderMutationError";

describe("describeBookingOrderMutationError", () => {
  it.each([
    ["error.order.invalid_transition", 40912, "订单状态已经变化，请重新加载后再操作"],
    [
      "error.exchange.match_cancellation_required",
      40941,
      "该订单必须通过 NeeDo Exchange 双方取消流程处理"
    ],
    ["error.payment.invalid_state", 40914, "当前支付状态不允许执行此操作"],
    ["error.payment.amount_mismatch", 40915, "收款金额与订单金额不一致，请重新核对"],
    ["error.payment.conflict", 40916, "支付记录已经变化，请重新加载后再操作"],
    [
      "error.wallet.insufficient_frozen",
      40908,
      "NDP 账本状态异常，订单未发生部分变更，请联系运营核对账本"
    ],
    [
      "error.wallet.insufficient_available",
      40907,
      "NDP 账本状态异常，订单未发生部分变更，请联系运营核对账本"
    ],
    ["error.schedule.conflict", 40911, "技师时间已冲突，当前订单无法确认"],
    ["error.order.acceptance_paused", 40937, "当前主体已暂停接单，暂时无法确认订单"],
    ["error.unknown_conflict", 40999, "订单操作发生冲突，请重新加载后重试或联系运营"]
  ])("preserves the meaning of 409 %s", (message, code, expected) => {
    expect(
      describeBookingOrderMutationError(new ApiClientError(message, code, 409), "zh")
    ).toBe(expected);
  });

  it.each([
    [400, "提交内容不符合要求，请检查后重试"],
    [401, "登录状态已失效，请重新登录"],
    [403, "当前身份没有处理该订单的权限"],
    [404, "订单不存在或已不可见"],
    [500, "订单服务暂时不可用，请稍后重试"]
  ])("maps HTTP %s without exposing an internal key", (status, expected) => {
    expect(
      describeBookingOrderMutationError(
        new ApiClientError("error.internal", status, status),
        "zh"
      )
    ).toBe(expected);
  });

  it("localizes exact financial and Exchange conflicts", () => {
    expect(
      describeBookingOrderMutationError(
        new ApiClientError("error.wallet.insufficient_frozen", 40908, 409),
        "ja"
      )
    ).toBe(
      "NDP台帳の状態に異常があります。注文には一部変更が保存されていません。運営に台帳確認を依頼してください"
    );
    expect(
      describeBookingOrderMutationError(
        new ApiClientError("error.exchange.match_cancellation_required", 40941, 409),
        "en"
      )
    ).toBe("This order must use the bilateral NeeDo Exchange cancellation flow");
  });

  it("uses an honest network fallback", () => {
    expect(describeBookingOrderMutationError(new TypeError("Failed to fetch"), "zh")).toBe(
      "订单操作失败，请检查网络后重试"
    );
  });
});
