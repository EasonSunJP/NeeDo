/** @vitest-environment jsdom */

import { act, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  resolveInitialLanguageState,
  resolveRuntimeTranslationSource,
  resolveSupportedLanguage,
  resolveSystemLanguage,
  I18nProvider,
  I18nRuntime,
  useI18n,
  useOptionalI18n
} from "./I18nProvider";
import { translateText } from "./translations";

function OptionalLanguageProbe() {
  const { language } = useOptionalI18n();

  return createElement("span", null, language);
}

function SetJapaneseLanguage() {
  const { setLanguage } = useI18n();

  useEffect(() => {
    setLanguage("ja");
  }, [setLanguage]);

  return createElement("p", { "data-no-i18n": "true" }, "测试测试");
}

function LanguageCycle({ count }: { count: number }) {
  const { language, setLanguage } = useI18n();

  return createElement("div", null,
    createElement("button", { onClick: () => setLanguage(language === "zh" ? "ja" : "zh") }, "switch"),
    ...Array.from({ length: count }, (_, index) => createElement("p", { key: index }, `后台动态数据 ${index}: ${index * 7}`))
  );
}

function DynamicLanguageProbe() {
  const { language, setLanguage } = useI18n();
  const [updated, setUpdated] = useState(false);

  return createElement("div", null,
    createElement("button", { onClick: () => setLanguage(language === "zh" ? "ja" : "zh") }, "switch"),
    createElement("button", { onClick: () => setUpdated(true) }, "update"),
    createElement("p", null, updated ? "后一周" : "预约一览")
  );
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("i18n language detection", () => {
  it("maps supported locale prefixes to app languages", () => {
    expect(resolveSupportedLanguage("ja-JP")).toBe("ja");
    expect(resolveSupportedLanguage("en-US")).toBe("en");
    expect(resolveSupportedLanguage("ko-KR")).toBe("ko");
    expect(resolveSupportedLanguage("zh-TW")).toBe("zh-Hant");
    expect(resolveSupportedLanguage("zh-Hant")).toBe("zh-Hant");
    expect(resolveSupportedLanguage("zh-CN")).toBe("zh");
    expect(resolveSupportedLanguage("fr-FR")).toBeNull();
  });

  it("prefers navigator.languages before navigator.language", () => {
    expect(
      resolveSystemLanguage({
        languages: ["fr-FR", "zh-TW"],
        language: "ja-JP"
      })
    ).toBe("zh-Hant");
  });

  it("falls back to navigator.language when languages is missing", () => {
    expect(
      resolveSystemLanguage({
        language: "ko-KR"
      })
    ).toBe("ko");
  });

  it("respects a stored manual language preference over the detected system language", () => {
    expect(
      resolveInitialLanguageState({
        storedLanguage: "zh-Hant",
        storedMode: "manual",
        navigatorLike: {
          languages: ["ko-KR"],
          language: "ko-KR"
        }
      })
    ).toEqual({
      language: "zh-Hant",
      source: "manual"
    });
  });

  it("treats legacy stored language values as manual preferences", () => {
    expect(
      resolveInitialLanguageState({
        storedLanguage: "ko",
        storedMode: null,
        navigatorLike: {
          languages: ["en-US"],
          language: "en-US"
        }
      })
    ).toEqual({
      language: "ko",
      source: "manual"
    });
  });

  it("uses the detected system language when no manual preference exists", () => {
    expect(
      resolveInitialLanguageState({
        storedLanguage: null,
        storedMode: "system",
        navigatorLike: {
          languages: ["fr-FR", "ja-JP"],
          language: "en-US"
        }
      })
    ).toEqual({
      language: "ja",
      source: "system"
    });
  });

  it("keeps translated text sources while accepting React dynamic text updates", () => {
    const source = "预约一览";
    const translated = translateText(source, "ja");

    expect(resolveRuntimeTranslationSource(translated, source, "ja")).toBe(source);
    expect(resolveRuntimeTranslationSource(translated, source, "zh")).toBe(source);
    expect(resolveRuntimeTranslationSource("2026年5月7日", "2026年5月6日", "zh")).toBe("2026年5月7日");
    expect(resolveRuntimeTranslationSource("后一周", "后一天", "zh")).toBe("后一周");
  });

  it("allows global decorative components to read a fallback language before the provider is available", () => {
    vi.stubGlobal("window", undefined);
    expect(renderToString(createElement(OptionalLanguageProbe))).toContain(">zh<");
    vi.unstubAllGlobals();
  });

  it("does not runtime-translate message text marked data-no-i18n", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        null,
        createElement(
          I18nProvider,
          null,
          createElement(I18nRuntime, null, createElement(SetJapaneseLanguage))
        )
      ));
    });

    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    expect(container.querySelector("[data-no-i18n]")?.textContent).toBe("测试测试");

    await act(async () => root.unmount());
  });

  it("switches a data-heavy admin page from Chinese to Japanese and back without stalling", async () => {
    localStorage.setItem("needo.language", "zh");
    localStorage.setItem("needo.language.mode", "manual");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/admin"] }, createElement(
      I18nProvider, null, createElement(I18nRuntime, null, createElement(LanguageCycle, { count: 500 }))
    ))));
    const button = container.querySelector("button")!;

    await act(async () => button.click());
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(document.documentElement.lang).toBe("ja");

    await act(async () => button.click());
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(container.querySelectorAll("p")).toHaveLength(500);
    await act(async () => root.unmount());
  }, 5000);

  it("translates changed data in Japanese and restores its latest Chinese source", async () => {
    localStorage.setItem("needo.language", "zh");
    localStorage.setItem("needo.language.mode", "manual");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/admin"] }, createElement(
      I18nProvider, null, createElement(I18nRuntime, null, createElement(DynamicLanguageProbe))
    ))));
    const [switchButton, updateButton] = container.querySelectorAll("button");

    await act(async () => switchButton.click());
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(container.querySelector("p")?.textContent).toBe(translateText("预约一览", "ja"));

    await act(async () => updateButton.click());
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(container.querySelector("p")?.textContent).toBe(translateText("后一周", "ja"));

    await act(async () => switchButton.click());
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(container.querySelector("p")?.textContent).toBe("后一周");
    await act(async () => root.unmount());
  });
});
