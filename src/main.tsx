import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root")!;
const displayModeQuery = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

function isBrowserExtensionMessageChannelError(reason: unknown) {
  const message = reason instanceof Error
    ? `${reason.name} ${reason.message} ${reason.stack ?? ""}`
    : typeof reason === "string"
      ? reason
      : reason && typeof reason === "object" && "message" in reason
        ? String((reason as { message?: unknown }).message ?? "")
        : "";
  const normalized = message.toLowerCase();
  return normalized.includes("a listener indicated an asynchronous response") && normalized.includes("message channel closed before a response was received");
}

window.addEventListener("error", (event) => {
  if (isBrowserExtensionMessageChannelError(event.error ?? event.message)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

window.addEventListener("unhandledrejection", (event) => {
  if (isBrowserExtensionMessageChannelError(event.reason)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

function syncDisplayMode() {
  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };
  const isStandalone = Boolean(displayModeQuery?.matches) || iosNavigator.standalone === true;
  const mode = isStandalone ? "standalone" : "browser";

  document.documentElement.dataset.needoDisplayMode = mode;
  document.body.dataset.needoDisplayMode = mode;
}

syncDisplayMode();

if (displayModeQuery) {
  if (typeof displayModeQuery.addEventListener === "function") {
    displayModeQuery.addEventListener("change", syncDisplayMode);
  } else if (typeof (displayModeQuery as LegacyMediaQueryList).addListener === "function") {
    // iPhone Safari and standalone web apps can still expose the legacy MediaQueryList API only.
    (displayModeQuery as LegacyMediaQueryList).addListener?.(syncDisplayMode);
  }
}

window.addEventListener("pageshow", syncDisplayMode);

document.documentElement.dataset.needoBooted = "true";
document.body.dataset.needoBooted = "true";
rootElement.dataset.needoBooted = "true";

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
