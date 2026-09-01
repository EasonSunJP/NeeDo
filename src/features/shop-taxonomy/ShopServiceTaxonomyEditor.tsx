import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  shopTaxonomyApi,
  type ShopTaxonomyApi,
  type ShopTaxonomyCategory,
  type ShopTaxonomyKeyword
} from "./api";
import { shopTaxonomyCopy } from "./i18n";
import {
  languageToTaxonomyLocale,
  toggleTaxonomyCategory,
  toggleTaxonomyKeyword
} from "./model";

const chipClassName = "focus-ring inline-flex min-h-10 items-center justify-center gap-1 rounded-full border px-3 py-2 text-[12px] font-black transition";

export function ShopServiceTaxonomyEditor({
  api = shopTaxonomyApi,
  language,
  onSavedKeywords
}: {
  api?: ShopTaxonomyApi;
  language: Language;
  onSavedKeywords?: (labels: string[]) => void;
}) {
  const locale = languageToTaxonomyLocale[language];
  const copy = shopTaxonomyCopy[language];
  const [categories, setCategories] = useState<ShopTaxonomyCategory[]>([]);
  const [keywordsByCategory, setKeywordsByCategory] = useState<Record<number, ShopTaxonomyKeyword[]>>({});
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [keywordIds, setKeywordIds] = useState<number[]>([]);
  const [categoryLimit, setCategoryLimit] = useState(5);
  const [keywordLimit, setKeywordLimit] = useState(5);
  const [revision, setRevision] = useState(0);
  const [removedKeywordIds, setRemovedKeywordIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    Promise.all([api.listCategories(locale), api.getMine(locale)])
      .then(async ([catalog, selection]) => {
        const selectedCategoryIds = selection.selectedCategories.map((category) => category.id);
        const keywordPages = await Promise.all(
          selectedCategoryIds.map(async (categoryId) => [categoryId, (await api.listKeywords(categoryId, locale)).list] as const)
        );
        if (!active) return;
        setCategories(catalog.list);
        setKeywordsByCategory(Object.fromEntries(keywordPages));
        setCategoryIds(selectedCategoryIds);
        setKeywordIds(selection.selectedKeywords.map((keyword) => keyword.id));
        setCategoryLimit(selection.categoryLimit);
        setKeywordLimit(selection.keywordLimit);
        setRevision(selection.revision);
        setRemovedKeywordIds([]);
      })
      .catch(() => {
        if (active) setMessage(copy.loadFailed);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, copy.loadFailed, locale]);

  useEffect(() => {
    let active = true;
    const missingCategoryIds = categoryIds.filter((categoryId) => !keywordsByCategory[categoryId]);
    if (missingCategoryIds.length === 0) return () => { active = false; };
    Promise.all(missingCategoryIds.map(async (categoryId) => [categoryId, (await api.listKeywords(categoryId, locale)).list] as const))
      .then((pages) => {
        if (!active) return;
        setKeywordsByCategory((current) => ({ ...current, ...Object.fromEntries(pages) }));
      })
      .catch(() => {
        if (active) setMessage(copy.loadFailed);
      });
    return () => {
      active = false;
    };
  }, [api, categoryIds, copy.loadFailed, keywordsByCategory, locale]);

  const loadedKeywords = useMemo(
    () => Object.values(keywordsByCategory).flat(),
    [keywordsByCategory]
  );

  const toggleCategory = (categoryId: number) => {
    try {
      const next = toggleTaxonomyCategory({
        categoryId,
        categoryIds,
        categoryLimit,
        keywordIds,
        keywords: loadedKeywords
      });
      setCategoryIds(next.categoryIds);
      setKeywordIds(next.keywordIds);
      setRemovedKeywordIds((current) => Array.from(new Set([...current, ...next.removedKeywordIds])));
      setMessage("");
    } catch {
      setMessage(copy.categoryLimit(categoryLimit));
    }
  };

  const toggleKeyword = (keywordId: number) => {
    try {
      const next = toggleTaxonomyKeyword({ keywordId, keywordIds, keywordLimit });
      setKeywordIds(next);
      if (next.includes(keywordId)) {
        setRemovedKeywordIds((current) => current.filter((id) => id !== keywordId));
      }
      setMessage("");
    } catch {
      setMessage(copy.keywordLimit(keywordLimit));
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await api.replaceMine(locale, {
        categoryIds: [...categoryIds].sort((a, b) => a - b),
        keywordIds: [...keywordIds].sort((a, b) => a - b),
        expectedRevision: revision,
        idempotencyKey: globalThis.crypto.randomUUID()
      });
      setRevision(result.revision);
      setCategoryLimit(result.categoryLimit);
      setKeywordLimit(result.keywordLimit);
      setCategoryIds(result.selectedCategories.map((category) => category.id));
      setKeywordIds(result.selectedKeywords.map((keyword) => keyword.id));
      setRemovedKeywordIds([]);
      setMessage(copy.saved);
      onSavedKeywords?.(result.selectedKeywords.map((keyword) => keyword.label));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        try {
          const current = await api.getMine(locale);
          setRevision(current.revision);
          setCategoryLimit(current.categoryLimit);
          setKeywordLimit(current.keywordLimit);
        } catch {
          // The draft remains local even when refreshing the revision fails.
        }
        setMessage(copy.conflict);
      } else {
        setMessage(copy.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[12px] font-semibold text-[color:var(--client-muted)]">{copy.loading}</p>;
  }

  return (
    <section className="space-y-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-primary)_38%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,transparent)] p-4">
      <div>
        <h3 className="text-sm font-black text-[color:var(--client-text)]">{copy.title}</h3>
        <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]">{copy.description}</p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-black text-[color:var(--client-muted)]">{copy.categoryCount(categoryIds.length, categoryLimit)}</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const selected = categoryIds.includes(category.id);
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  chipClassName,
                  selected
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
                    : "border-[color:var(--client-line)] bg-[color:var(--client-elevated)] text-[color:var(--client-text)]"
                )}
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                type="button"
              >
                {category.label}
                {category.qualificationPolicy !== "OPEN" ? <small className="opacity-70">· {copy.review}</small> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-black text-[color:var(--client-muted)]">{copy.keywordCount(keywordIds.length, keywordLimit)}</p>
        <div className="grid gap-3">
          {categoryIds.map((categoryId) => {
            const category = categories.find((item) => item.id === categoryId);
            const keywords = keywordsByCategory[categoryId] ?? [];
            return (
              <div className="space-y-2" key={categoryId}>
                <p className="text-[11px] font-black text-[color:var(--client-text)]">{category?.label}</p>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword) => {
                    const selected = keywordIds.includes(keyword.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className={cn(
                          chipClassName,
                          selected
                            ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                            : "border-[color:var(--client-line)] bg-transparent text-[color:var(--client-muted)]"
                        )}
                        key={keyword.id}
                        onClick={() => toggleKeyword(keyword.id)}
                        type="button"
                      >
                        {keyword.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {removedKeywordIds.length > 0 ? (
        <p className="rounded-[14px] border border-[#ffb454]/50 bg-[#ff9e2c]/10 px-3 py-2 text-[11px] font-black text-[#ffc573]">
          {copy.removed(removedKeywordIds.length)}
        </p>
      ) : null}
      {message ? <p className="text-[11px] font-black leading-5 text-[color:var(--client-muted)]" role="status">{message}</p> : null}
      <button
        className="focus-ring min-h-12 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-50"
        disabled={saving}
        onClick={() => void save()}
        type="button"
      >
        {saving ? copy.saving : copy.save}
      </button>
    </section>
  );
}
