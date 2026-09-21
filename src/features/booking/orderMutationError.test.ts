import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { describeBookingOrderMutationError } from "./orderMutationError";

describe("describeBookingOrderMutationError", () => {
  it.each([
    ["error.order.invalid_transition", 40912, "订单状态已经变化，请重新加载后再操作"],
    ["error.order.service_start_too_early", 41041, "尚未到可开始服务时间"],
    ["error.order.service_end_too_early", 41042, "尚未到预计结束时间"],
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

  it("explains an invalid service verification code without exposing the internal key", () => {
    expect(
      describeBookingOrderMutationError(
        new ApiClientError("error.order.verification_code_invalid", 40108, 400),
        "zh"
      )
    ).toBe("服务验证码错误，请向用户重新确认");
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

  it("distinguishes the unavailable identity dependency from the order service", () => {
    expect(
      describeBookingOrderMutationError(
        new ApiClientError("error.dependency.redis_unavailable", 50301, 503),
        "zh"
      )
    ).toBe("身份服务暂时不可用，请稍后重试");
  });

  it.each([
    ["error.user.not_found", 40401],
    ["error.wallet.not_found", 40405]
  ])("does not misreport account or wallet lookup failure %s as a missing order", (message, code) => {
    expect(
      describeBookingOrderMutationError(new ApiClientError(message, code, 404), "zh")
    ).toBe("账户与 NDP 钱包状态无法确认，请重新登录后重试");
  });
});
