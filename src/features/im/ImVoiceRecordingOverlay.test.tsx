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
  sending: "正在发送录音",
  sendingAriaLabel: "正在发送录音",
  stopAriaLabel: "停止录音",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ImVoiceRecordingOverlay", () => {
  it("does not render while idle and makes microphone acquisition cancelable without exposing a no-op stop action", async () => {
    const onCancel = vi.fn();
    const onStop = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ImVoiceRecordingOverlay
          audioRef={createRef<HTMLAudioElement>()}
          copy={copy}
          durationSeconds={0}
          error={null}
          onCancel={onCancel}
          onDelete={vi.fn()}
          onPreviewEnded={vi.fn()}
          onReplay={vi.fn()}
          onSend={vi.fn()}
          onStop={onStop}
          onTimeUpdate={vi.fn()}
          phase="idle"
          previewUrl={null}
          remainingSeconds={59}
        />,
      );
    });
    expect(container.querySelector("[data-im-voice-recording-overlay='true']")).toBeNull();

    await act(async () => {
      root.render(
        <ImVoiceRecordingOverlay
          audioRef={createRef<HTMLAudioElement>()}
          copy={copy}
          durationSeconds={0}
          error={null}
          onCancel={onCancel}
          onDelete={vi.fn()}
          onPreviewEnded={vi.fn()}
          onReplay={vi.fn()}
          onSend={vi.fn()}
          onStop={onStop}
          onTimeUpdate={vi.fn()}
          phase="acquiring_permission"
          previewUrl={null}
          remainingSeconds={59}
        />,
      );
    });

    const cancel = container.querySelector<HTMLButtonElement>("button[aria-label='取消录音']")!;
    const stop = container.querySelector<HTMLButtonElement>("button[aria-label='停止录音']")!;
    expect(cancel).toBe(document.activeElement);
    expect(stop.disabled).toBe(true);
    expect(stop.className).toContain("disabled:opacity-50");
    await act(async () => {
      cancel.click();
      stop.click();
    });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("wires recording and both preview phases to real controls and audio events", async () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const onReplay = vi.fn();
    const onSend = vi.fn();
    const onStop = vi.fn();
    const onPreviewEnded = vi.fn();
    const onTimeUpdate = vi.fn();
    const audioRef = createRef<HTMLAudioElement>();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const render = async (phase: "recording" | "preview_paused" | "preview_playing") => {
      await act(async () => {
        root.render(
          <ImVoiceRecordingOverlay
            audioRef={audioRef}
            copy={copy}
            durationSeconds={8}
            error={null}
            onCancel={onCancel}
            onDelete={onDelete}
            onPreviewEnded={onPreviewEnded}
            onReplay={onReplay}
            onSend={onSend}
            onStop={onStop}
            onTimeUpdate={onTimeUpdate}
            phase={phase}
            previewUrl="blob:voice-preview"
            remainingSeconds={51}
          />,
        );
      });
    };

    await render("recording");
    const dialog = container.querySelector<HTMLElement>("[data-im-voice-recording-overlay='true']");
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.className).toContain("backdrop-blur");
    expect(container.querySelector("[data-im-voice-bubble='true']")?.className).toContain("bg-[#91ed63]");
    expect(container.textContent).toContain("51″ 后将停止录音");
    expect(container.textContent).not.toContain("转文字");
    expect(container.querySelector("[data-im-voice-semicircle]")).toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='取消录音']")?.click();
      container.querySelector<HTMLButtonElement>("button[aria-label='停止录音']")?.click();
    });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();

    await render("preview_paused");
    const audio = container.querySelector<HTMLAudioElement>("audio")!;
    expect(audioRef.current).toBe(audio);
    expect(audio.getAttribute("src")).toBe("blob:voice-preview");
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='删除录音']")?.click();
      container.querySelector<HTMLButtonElement>("button[aria-label='重放录音']")?.click();
      container.querySelector<HTMLButtonElement>("button[aria-label='发送录音']")?.click();
      audio.dispatchEvent(new Event("ended", { bubbles: true }));
      audio.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onReplay).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledOnce();
    expect(onPreviewEnded).toHaveBeenCalledOnce();
    expect(onTimeUpdate).toHaveBeenCalledOnce();

    await render("preview_playing");
    expect(container.textContent).toContain("正在播放录音");
    expect(container.querySelector("button[aria-label='停止录音']")).toBeNull();

    await act(async () => root.unmount());
  });

  it("traps dialog focus and makes a sending overlay busy but not destructively escapable", async () => {
    const onDelete = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const render = async (phase: "preview_paused" | "sending") => {
      await act(async () => {
        root.render(
          <ImVoiceRecordingOverlay
            audioRef={createRef<HTMLAudioElement>()}
            copy={copy}
            durationSeconds={8}
            error={null}
            onCancel={vi.fn()}
            onDelete={onDelete}
            onPreviewEnded={vi.fn()}
            onReplay={vi.fn()}
            onSend={vi.fn()}
            onStop={vi.fn()}
            onTimeUpdate={vi.fn()}
            phase={phase}
            previewUrl="blob:voice-preview"
            remainingSeconds={51}
          />,
        );
      });
    };

    await render("preview_paused");
    const dialog = container.querySelector<HTMLElement>("[role='dialog']")!;
    const deleteButton = container.querySelector<HTMLButtonElement>("button[aria-label='删除录音']")!;
    const sendButton = container.querySelector<HTMLButtonElement>("button[aria-label='发送录音']")!;
    sendButton.focus();
    const tab = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });
    await act(async () => dialog.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(deleteButton);
    const reverseTab = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab", shiftKey: true });
    await act(async () => deleteButton.dispatchEvent(reverseTab));
    expect(reverseTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(sendButton);

    await render("sending");
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("正在发送录音");
    expect(document.activeElement).toBe(dialog);
    for (const button of container.querySelectorAll<HTMLButtonElement>("[data-im-voice-recording-actions='true'] button")) {
      expect(button.disabled).toBe(true);
    }
    const busyTab = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });
    await act(async () => dialog.dispatchEvent(busyTab));
    expect(busyTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
