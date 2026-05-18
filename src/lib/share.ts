import { emitShareFeedback, type ShareFeedbackEvent } from "./shareFeedback";

type ShareNavigatorLike = {
  share?: Navigator["share"];
  canShare?: Navigator["canShare"];
  clipboard?: {
    writeText: (text: string) => Promise<void>;
  };
};

type ShareWindowLike = {
  location: Pick<Location, "href">;
};

type ShareDocumentLike = Pick<Document, "body" | "createElement" | "execCommand" | "title">;

export type ShareRuntimeEnvironment = {
  navigator?: ShareNavigatorLike;
  window?: ShareWindowLike;
  document?: ShareDocumentLike;
  emitFeedback?: (event: ShareFeedbackEvent) => void;
  logger?: Pick<Console, "error" | "info">;
};

export type ShareContentInput = {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
  copiedMessage?: string;
  manualCopyTitle?: string;
  manualCopyMessage?: string;
};

export type ShareContentResult =
  | { status: "shared"; url: string }
  | { status: "cancelled"; url: string }
  | { status: "copied"; url: string }
  | { status: "manual-copy"; url: string }
  | { status: "unsupported"; url: string };

function readRuntimeEnvironment(overrides: ShareRuntimeEnvironment = {}): Required<ShareRuntimeEnvironment> {
  return {
    navigator: overrides.navigator ?? (typeof navigator !== "undefined" ? navigator : undefined),
    window: overrides.window ?? (typeof window !== "undefined" ? window : undefined),
    document: overrides.document ?? (typeof document !== "undefined" ? document : undefined),
    emitFeedback: overrides.emitFeedback ?? emitShareFeedback,
    logger: overrides.logger ?? console
  } as Required<ShareRuntimeEnvironment>;
}

function normalizeText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function isShareAbortError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return true;
    }

    const text = `${error.name} ${error.message}`.toLowerCase();
    return text.includes("aborterror") || text.includes("share canceled") || text.includes("share cancelled");
  }

  if (typeof error === "string") {
    const text = error.toLowerCase();
    return text.includes("aborterror") || text.includes("share canceled") || text.includes("share cancelled");
  }

  return false;
}

export function isOpaqueBrowserScriptError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const normalized = message.trim().toLowerCase();

  return normalized === "script error" || normalized === "script error.";
}

export function isNonFatalBrowserRuntimeError(error: Error) {
  const text = `${error.name} ${error.message} ${error.stack ?? ""}`.toLowerCase();

  if (isShareAbortError(error)) {
    return true;
  }

  if (isOpaqueBrowserScriptError(error)) {
    return true;
  }

  if (text.includes("clipboard") || text.includes("writetext") || text.includes("execcommand")) {
    return true;
  }

  if (text.includes("manifest") || text.includes("web app manifest")) {
    return true;
  }

  if (text.includes("a listener indicated an asynchronous response") && text.includes("message channel closed before a response was received")) {
    return true;
  }

  return text.includes("share") && (text.includes("gesture") || text.includes("notallowed") || text.includes("permission"));
}

export function buildAbsolutePortalUrl(target: string | undefined, envOverrides: ShareRuntimeEnvironment = {}) {
  const env = readRuntimeEnvironment(envOverrides);
  const currentHref = env.window?.location.href ?? target ?? "";

  if (!currentHref) {
    return target?.trim() || "";
  }

  const currentUrl = new URL(currentHref);
  const candidate = target?.trim();

  if (!candidate) {
    return currentUrl.toString();
  }

  if (/^(https?:)?\/\//i.test(candidate)) {
    return new URL(candidate, currentUrl).toString();
  }

  if (/^(blob:|data:)/i.test(candidate)) {
    return currentUrl.toString();
  }

  if (candidate.startsWith("#")) {
    currentUrl.hash = candidate.slice(1);
    return currentUrl.toString();
  }

  if (candidate.startsWith("/")) {
    currentUrl.search = "";
    currentUrl.hash = candidate;
    return currentUrl.toString();
  }

  try {
    return new URL(candidate, currentUrl).toString();
  } catch {
    return currentUrl.toString();
  }
}

export async function copyTextToClipboard(text: string, envOverrides: ShareRuntimeEnvironment = {}) {
  const value = text.trim();

  if (!value) {
    return false;
  }

  const env = readRuntimeEnvironment(envOverrides);

  if (env.navigator?.clipboard?.writeText) {
    try {
      await env.navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the legacy selection-based copy path.
    }
  }

  const doc = env.document;

  if (!doc?.body || typeof doc.createElement !== "function") {
    return false;
  }

  const input = doc.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "readonly");
  input.style.position = "fixed";
  input.style.opacity = "0";
  input.style.inset = "0";
  doc.body.appendChild(input);
  input.focus();
  input.select();
  input.setSelectionRange(0, value.length);

  try {
    return typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
  } catch {
    return false;
  } finally {
    doc.body.removeChild(input);
  }
}

function sanitizeShareData(input: ShareContentInput, envOverrides: ShareRuntimeEnvironment = {}) {
  const env = readRuntimeEnvironment(envOverrides);
  const title = normalizeText(input.title) ?? normalizeText(env.document?.title) ?? "NeeDo";
  const text = normalizeText(input.text);
  const url = buildAbsolutePortalUrl(normalizeText(input.url), envOverrides);
  const files = Array.isArray(input.files) && typeof File !== "undefined" ? input.files.filter((file): file is File => file instanceof File) : [];

  return { title, text, url, files };
}

export async function shareContent(input: ShareContentInput, envOverrides: ShareRuntimeEnvironment = {}) {
  const env = readRuntimeEnvironment(envOverrides);
  const { title, text, url, files } = sanitizeShareData(input, envOverrides);
  const basePayload: ShareData = {
    title,
    ...(text ? { text } : {}),
    ...(url ? { url } : {})
  };

  const fallbackToCopy = async (): Promise<ShareContentResult> => {
    if (url && (await copyTextToClipboard(url, envOverrides))) {
      env.emitFeedback({
        type: "toast",
        message: input.copiedMessage ?? "链接已复制，可以手动分享"
      });
      return { status: "copied", url };
    }

    if (url) {
      env.emitFeedback({
        type: "manual-copy",
        title: input.manualCopyTitle ?? title,
        message: input.manualCopyMessage ?? "当前浏览器暂时无法直接调用系统分享，请手动复制下面的链接。",
        url
      });
      return { status: "manual-copy", url };
    }

    env.emitFeedback({
      type: "toast",
      message: "当前浏览器暂时无法分享此内容",
      tone: "danger"
    });
    return { status: "unsupported", url };
  };

  if (env.navigator?.share) {
    let canShareFiles = false;

    if (files.length > 0 && typeof env.navigator.canShare === "function") {
      try {
        canShareFiles = env.navigator.canShare({ files });
      } catch (error) {
        env.logger.info("NeeDo file share capability check failed", { error });
      }
    }

    const sharePayload: ShareData = canShareFiles ? { ...basePayload, files } : basePayload;

    try {
      await env.navigator.share(sharePayload);
      return { status: "shared", url };
    } catch (error) {
      if (isShareAbortError(error)) {
        return { status: "cancelled", url };
      }

      env.logger.error("NeeDo share failed", { error, sharePayload });
      return fallbackToCopy();
    }
  }

  return fallbackToCopy();
}
