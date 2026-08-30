/** @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImVoiceRecordingOverlay, type ImVoiceRecordingOverlayCopy } from "./ImVoiceRecordingOverlay";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copy: ImVoiceRecordingOverlayCopy = {
  acquiringPermission: "正在连接麦克风",
  cancelAriaLabel: "取消录音",
  deleteAriaLabel: "删除录音",
  previewPaused: "录音预览",
  previewPlaying: "正在播放录音",
  replayAriaLabel: "重放录音",
  remainingRecording: (remainingSeconds) => `${remainingSeconds}″ 后将停止录音`,
  sendAriaLabel: "发送录音",
  sendingAriaLabel: "正在发送录音",
  stopAriaLabel: "停止录音",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ImVoiceRecordingOverlay", () => {
  it("shows the recording state as a focused accessible dialog without legacy voice controls", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImVoiceRecordingOverlay
          audioRef={createRef<HTMLAudioElement>()}
          copy={copy}
          durationSeconds={1}
          error={null}
          onCancel={vi.fn()}
          onDelete={vi.fn()}
          onPreviewEnded={vi.fn()}
          onReplay={vi.fn()}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onTimeUpdate={vi.fn()}
          phase="recording"
          previewUrl={null}
          remainingSeconds={59}
        />,
      );
    });

    const dialog = container.querySelector<HTMLElement>("[data-im-voice-recording-overlay='true']");
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.className).toContain("backdrop-blur");
    expect(container.querySelector("[data-im-voice-bubble='true']")?.className).toContain("bg-[#91ed63]");
    expect(container.textContent).toContain("59″ 后将停止录音");
    expect(container.querySelector("button[aria-label='取消录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='停止录音']")).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector("button[aria-label='取消录音']"));
    expect(container.textContent).not.toContain("转文字");
    expect(container.querySelector("[data-im-voice-semicircle]")).toBeNull();
    expect(container.querySelector("audio")?.getAttribute("src")).toBeNull();

    await act(async () => root.unmount());
  });

  it("changes preview controls by phase and sends keyboard escape to the active removal action", async () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const audioRef = createRef<HTMLAudioElement>();

    await act(async () => {
      root.render(
        <ImVoiceRecordingOverlay
          audioRef={audioRef}
          copy={copy}
          durationSeconds={8}
          error={null}
          onCancel={onCancel}
          onDelete={onDelete}
          onPreviewEnded={vi.fn()}
          onReplay={vi.fn()}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onTimeUpdate={vi.fn()}
          phase="recording"
          previewUrl={null}
          remainingSeconds={51}
        />,
      );
    });
    await act(async () => {
      container.querySelector<HTMLElement>("[role='dialog']")?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onCancel).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(
        <ImVoiceRecordingOverlay
          audioRef={audioRef}
          copy={copy}
          durationSeconds={8}
          error="无法发送录音"
          onCancel={onCancel}
          onDelete={onDelete}
          onPreviewEnded={vi.fn()}
          onReplay={vi.fn()}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onTimeUpdate={vi.fn()}
          phase="send_error"
          previewUrl="blob:voice-preview"
          remainingSeconds={51}
        />,
      );
    });

    expect(container.querySelector("button[aria-label='删除录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='重放录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='发送录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='停止录音']")).toBeNull();
    expect(container.textContent).toContain("无法发送录音");
    expect(document.activeElement).toBe(container.querySelector("button[aria-label='删除录音']"));
    expect(container.querySelector("audio")?.getAttribute("src")).toBe("blob:voice-preview");

    await act(async () => {
      container.querySelector<HTMLElement>("[role='dialog']")?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onDelete).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(
        <ImVoiceRecordingOverlay
          audioRef={audioRef}
          copy={copy}
          durationSeconds={8}
          error={null}
          onCancel={onCancel}
          onDelete={onDelete}
          onPreviewEnded={vi.fn()}
          onReplay={vi.fn()}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onTimeUpdate={vi.fn()}
          phase="sending"
          previewUrl="blob:voice-preview"
          remainingSeconds={51}
        />,
      );
    });

    for (const label of ["删除录音", "重放录音", "正在发送录音"]) {
      expect(container.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`)?.disabled).toBe(true);
    }
    expect(container.querySelector("button[aria-busy='true']")).not.toBeNull();

    await act(async () => root.unmount());
  });
});
