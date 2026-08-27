// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthVerificationPanel,
  type AuthVerificationLabels,
} from "./AuthVerificationPanel";

const labels: AuthVerificationLabels = {
  back: "Back",
  codeLabel: "Six-digit code",
  cooldown: (seconds) => `Resend in ${seconds}s`,
  destination: (maskedEmail) => `Sent to ${maskedEmail}`,
  eyebrow: "Identity check",
  expired: "Code expired",
  expires: (seconds) => `Expires in ${seconds}s`,
  invalidLength: "Enter all six digits",
  resend: "Resend",
  submit: "Verify",
  submitting: "Verifying",
  title: "Verify your email",
};

const challenge = {
  challengeId: "challenge-11",
  cooldownSeconds: 2,
  expiresIn: 3,
  maskedEmail: "n***@example.com",
};

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AuthVerificationPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("normalizes pasted input and submits only a complete six-digit code", async () => {
    const onSubmit = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <AuthVerificationPanel
          challenge={challenge}
          labels={labels}
          onBack={vi.fn()}
          onResend={vi.fn()}
          onSubmit={onSubmit}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="auth-verification-code"]',
    );
    const submit = container.querySelector<HTMLButtonElement>(
      '[data-testid="auth-verification-submit"]',
    );
    expect(input?.inputMode).toBe("numeric");
    expect(input?.getAttribute("autocomplete")).toBe("one-time-code");

    await act(async () => setInputValue(input!, "12a 34567"));
    expect(input?.value).toBe("123456");

    await act(async () => submit?.click());
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("preserves ordinary Backspace editing and blocks incomplete submission", async () => {
    const onSubmit = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <AuthVerificationPanel
          challenge={challenge}
          labels={labels}
          onBack={vi.fn()}
          onResend={vi.fn()}
          onSubmit={onSubmit}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="auth-verification-code"]',
    )!;
    await act(async () => setInputValue(input, "123"));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" }),
    );
    await act(async () => setInputValue(input, "12"));

    expect(input.value).toBe("12");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="auth-verification-submit"]',
      )?.disabled,
    ).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("counts down deterministically, enables resend, expires, and clears its timer", async () => {
    const onResend = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <AuthVerificationPanel
          challenge={challenge}
          labels={labels}
          onBack={vi.fn()}
          onResend={onResend}
          onSubmit={vi.fn()}
        />,
      );
    });

    const resend = () =>
      container.querySelector<HTMLButtonElement>(
        '[data-testid="auth-verification-resend"]',
      );
    expect(container.textContent).toContain("Expires in 3s");
    expect(container.textContent).toContain("Resend in 2s");
    expect(resend()?.disabled).toBe(true);

    await act(async () => vi.advanceTimersByTime(2_000));
    expect(container.textContent).toContain("Expires in 1s");
    expect(resend()?.disabled).toBe(false);

    await act(async () => resend()?.click());
    expect(onResend).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(container.textContent).toContain("Code expired");
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="auth-verification-code"]',
      )?.disabled,
    ).toBe(true);

    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });

  it("announces errors and renders attempt guidance without using color alone", async () => {
    await act(async () => {
      root.render(
        <AuthVerificationPanel
          attemptFeedback="You can try up to 5 times"
          challenge={challenge}
          error="Incorrect code"
          labels={labels}
          onBack={vi.fn()}
          onResend={vi.fn()}
          onSubmit={vi.fn()}
          pending
        />,
      );
    });

    expect(container.textContent).toContain("You can try up to 5 times");
    expect(container.textContent).toContain("Identity check");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Incorrect code",
    );
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="auth-verification-back"]',
      )?.disabled,
    ).toBe(true);
  });
});
