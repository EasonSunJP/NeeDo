import { describe, expect, it, vi } from "vitest";
import { isNonFatalBrowserRuntimeError, isOpaqueBrowserScriptError, shareContent } from "./share";

function createEnvironment() {
  return {
    window: {
      location: {
        href: "https://needo.app/user.html#/moments"
      }
    },
    document: {
      title: "NeeDo 用户端",
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      createElement: vi.fn(),
      execCommand: vi.fn()
    } as unknown as Document,
    emitFeedback: vi.fn(),
    logger: {
      error: vi.fn(),
      info: vi.fn()
    }
  };
}

describe("shareContent", () => {
  it("uses navigator.share when available and the share succeeds", async () => {
    const env = createEnvironment();
    const share = vi.fn().mockResolvedValue(undefined);

    const result = await shareContent(
      {
        title: "NeeDo",
        text: "分享当前页面",
        url: "/moments/posts/post-1"
      },
      {
        ...env,
        navigator: {
          share
        }
      }
    );

    expect(result).toEqual({
      status: "shared",
      url: "https://needo.app/user.html#/moments/posts/post-1"
    });
    expect(share).toHaveBeenCalledWith({
      title: "NeeDo",
      text: "分享当前页面",
      url: "https://needo.app/user.html#/moments/posts/post-1"
    });
    expect(env.emitFeedback).not.toHaveBeenCalled();
  });

  it("treats AbortError as a user cancellation instead of surfacing an error", async () => {
    const env = createEnvironment();
    const share = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));

    const result = await shareContent(
      {
        title: "NeeDo",
        url: "/moments/posts/post-1"
      },
      {
        ...env,
        navigator: {
          share
        }
      }
    );

    expect(result.status).toBe("cancelled");
    expect(env.emitFeedback).not.toHaveBeenCalled();
    expect(env.logger.error).not.toHaveBeenCalled();
  });

  it("falls back to copying the link when navigator.share throws a non-AbortError", async () => {
    const env = createEnvironment();
    const share = vi.fn().mockRejectedValue(new Error("Share failed"));
    const writeText = vi.fn().mockResolvedValue(undefined);

    const result = await shareContent(
      {
        title: "NeeDo",
        url: "/moments/posts/post-1"
      },
      {
        ...env,
        navigator: {
          share,
          clipboard: {
            writeText
          }
        }
      }
    );

    expect(result.status).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://needo.app/user.html#/moments/posts/post-1");
    expect(env.emitFeedback).toHaveBeenCalledWith({
      type: "toast",
      message: "链接已复制，可以手动分享"
    });
    expect(env.logger.error).toHaveBeenCalled();
  });

  it("copies the link when Web Share API is unavailable", async () => {
    const env = createEnvironment();
    const writeText = vi.fn().mockResolvedValue(undefined);

    const result = await shareContent(
      {
        title: "NeeDo",
        url: "/moments/posts/post-1"
      },
      {
        ...env,
        navigator: {
          clipboard: {
            writeText
          }
        }
      }
    );

    expect(result.status).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://needo.app/user.html#/moments/posts/post-1");
  });

  it("drops files from the payload when navigator.canShare does not support them", async () => {
    const env = createEnvironment();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(false);
    const file = new File(["needo"], "card.png", { type: "image/png" });

    await shareContent(
      {
        title: "NeeDo",
        text: "分享名片",
        url: "/moments/posts/post-1",
        files: [file]
      },
      {
        ...env,
        navigator: {
          share,
          canShare
        }
      }
    );

    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({
      title: "NeeDo",
      text: "分享名片",
      url: "https://needo.app/user.html#/moments/posts/post-1"
    });
  });

  it("shares the link-only payload when navigator.canShare throws during file checks", async () => {
    const env = createEnvironment();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockImplementation(() => {
      throw new TypeError("Cannot inspect this share payload");
    });
    const file = new File(["needo"], "card.png", { type: "image/png" });

    const result = await shareContent(
      {
        title: "NeeDo",
        text: "分享名片",
        url: "/moments/posts/post-1",
        files: [file]
      },
      {
        ...env,
        navigator: {
          share,
          canShare
        }
      }
    );

    expect(result.status).toBe("shared");
    expect(env.logger.info).toHaveBeenCalledWith("NeeDo file share capability check failed", { error: expect.any(TypeError) });
    expect(share).toHaveBeenCalledWith({
      title: "NeeDo",
      text: "分享名片",
      url: "https://needo.app/user.html#/moments/posts/post-1"
    });
    expect(env.logger.error).not.toHaveBeenCalled();
  });
});

describe("isNonFatalBrowserRuntimeError", () => {
  it("ignores browser extension async message channel noise", () => {
    expect(
      isNonFatalBrowserRuntimeError(
        new Error("A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received")
      )
    ).toBe(true);
  });

  it("ignores opaque Safari script errors that do not expose the real source", () => {
    expect(isOpaqueBrowserScriptError("Script error.")).toBe(true);
    expect(isNonFatalBrowserRuntimeError(new Error("Script error."))).toBe(true);
  });
});
