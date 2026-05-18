import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { languages, translateText, type Language } from "./translations";

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const storageKey = "needo.language";
const storageModeKey = "needo.language.mode";
const textNodeSources = new WeakMap<Text, string>();
const translatedAttributes = ["placeholder", "title", "aria-label", "alt"];

type LanguagePreferenceSource = "manual" | "system";

type LanguageState = {
  language: Language;
  source: LanguagePreferenceSource;
};

type NavigatorLanguageSource = {
  language?: string;
  languages?: readonly string[];
};

function normalizeStoredLanguage(value: string | null | undefined): Language | null {
  if (value === "zh" || value === "zh-Hant" || value === "ja" || value === "en" || value === "ko") {
    return value;
  }

  return null;
}

function normalizeStoredMode(value: string | null | undefined): LanguagePreferenceSource | null {
  if (value === "manual" || value === "system") {
    return value;
  }

  return null;
}

function readStorageValue(key: string) {
  return readBrowserStorage(key, { silent: true });
}

function writeStorageValue(key: string, value: string) {
  writeBrowserStorage(key, value, { silent: true });
}

function getNavigatorLocales(navigatorLike?: NavigatorLanguageSource) {
  const locales = navigatorLike?.languages?.filter((value): value is string => typeof value === "string" && value.trim().length > 0) ?? [];

  if (navigatorLike?.language?.trim()) {
    locales.push(navigatorLike.language);
  }

  return Array.from(new Set(locales));
}

export function resolveSupportedLanguage(locale: string | null | undefined): Language | null {
  if (!locale?.trim()) {
    return null;
  }

  const normalized = locale.toLowerCase();

  if (normalized === "zh-hant" || normalized.includes("-hant") || normalized.startsWith("zh-tw") || normalized.startsWith("zh-hk") || normalized.startsWith("zh-mo")) {
    return "zh-Hant";
  }

  if (normalized.startsWith("ja")) {
    return "ja";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  if (normalized.startsWith("ko")) {
    return "ko";
  }

  if (normalized.startsWith("zh")) {
    return "zh";
  }

  return null;
}

export function resolveSystemLanguage(navigatorLike?: NavigatorLanguageSource): Language {
  for (const locale of getNavigatorLocales(navigatorLike)) {
    const matched = resolveSupportedLanguage(locale);

    if (matched) {
      return matched;
    }
  }

  return "zh";
}

export function resolveInitialLanguageState(options?: {
  storedLanguage?: string | null;
  storedMode?: string | null;
  navigatorLike?: NavigatorLanguageSource;
}): LanguageState {
  const storedLanguage = normalizeStoredLanguage(options?.storedLanguage);
  const storedMode = normalizeStoredMode(options?.storedMode);

  if (storedLanguage && (storedMode === "manual" || storedMode === null)) {
    return {
      language: storedLanguage,
      source: "manual"
    };
  }

  return {
    language: resolveSystemLanguage(options?.navigatorLike),
    source: "system"
  };
}

function getInitialLanguageState(): LanguageState {
  if (typeof window === "undefined") {
    return {
      language: "zh",
      source: "system"
    };
  }

  return resolveInitialLanguageState({
    storedLanguage: readStorageValue(storageKey),
    storedMode: readStorageValue(storageModeKey),
    navigatorLike: window.navigator
  });
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;

  if (!parent) {
    return true;
  }

  if (parent.closest("[data-no-i18n]")) {
    return true;
  }

  return ["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"].includes(parent.tagName);
}

export function resolveRuntimeTranslationSource(
  currentValue: string,
  storedSource: string | undefined,
  language: Language
) {
  if (storedSource === undefined) {
    return currentValue;
  }

  const knownRuntimeValue = languages.some((item) => currentValue === translateText(storedSource, item.code));

  return knownRuntimeValue || currentValue === translateText(storedSource, language) ? storedSource : currentValue;
}

function translateTextNodes(root: ParentNode, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }

      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const nodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  nodes.forEach((node) => {
    const currentValue = node.nodeValue ?? "";
    const source = resolveRuntimeTranslationSource(currentValue, textNodeSources.get(node), language);
    textNodeSources.set(node, source);
    const next = translateText(source, language);

    if (currentValue !== next) {
      node.nodeValue = next;
    }
  });
}

function translateAttributes(root: ParentNode, language: Language) {
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    if (element.closest("[data-no-i18n]")) {
      return;
    }

    translatedAttributes.forEach((attribute) => {
      const currentValue = element.getAttribute(attribute);

      if (!currentValue?.trim()) {
        return;
      }

      const sourceAttribute = `data-i18n-source-${attribute}`;
      const source = resolveRuntimeTranslationSource(currentValue, element.getAttribute(sourceAttribute) ?? undefined, language);
      element.setAttribute(sourceAttribute, source);

      const next = translateText(source, language);

      if (currentValue !== next) {
        element.setAttribute(attribute, next);
      }
    });
  });
}

function translateDocument(language: Language) {
  const htmlLang = languages.find((item) => item.code === language)?.htmlLang ?? "zh-CN";
  document.documentElement.lang = htmlLang;
  translateTextNodes(document.body, language);
  translateAttributes(document.body, language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LanguageState>(getInitialLanguageState);
  const language = state.language;

  useEffect(() => {
    if (typeof window === "undefined" || state.source === "manual") {
      return;
    }

    const syncSystemLanguage = () => {
      const nextLanguage = resolveSystemLanguage(window.navigator);

      setState((current) => {
        if (current.source === "manual" || current.language === nextLanguage) {
          return current;
        }

        return {
          language: nextLanguage,
          source: "system"
        };
      });
    };

    window.addEventListener("languagechange", syncSystemLanguage);
    return () => window.removeEventListener("languagechange", syncSystemLanguage);
  }, [state.source]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage(nextLanguage) {
        setState({
          language: nextLanguage,
          source: "manual"
        });
        writeStorageValue(storageKey, nextLanguage);
        writeStorageValue(storageModeKey, "manual");
      }
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function I18nRuntime({ children }: { children: ReactNode }) {
  const { language } = useI18n();
  const location = useLocation();

  useEffect(() => {
    let frame = 0;

    const scheduleTranslate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => translateDocument(language));
    };

    scheduleTranslate();

    const observer = new MutationObserver(scheduleTranslate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttributes
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [language, location.pathname, location.search]);

  return children;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
