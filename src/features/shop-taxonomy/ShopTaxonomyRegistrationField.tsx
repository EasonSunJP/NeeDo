import { useEffect, useMemo, useRef, useState } from "react";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { shopTaxonomyApi, type ShopTaxonomyApi, type ShopTaxonomyCategory, type ShopTaxonomyKeyword } from "./api";
import { shopTaxonomyCopy } from "./i18n";
import { languageToTaxonomyLocale, toggleTaxonomyCategory, toggleTaxonomyKeyword } from "./model";

export type ShopTaxonomyRegistrationValue = {
  serviceCategoryIds: number[];
  businessKeywordIds: number[];
};

const registrationChipClassName = "focus-ring inline-flex min-h-10 items-center rounded-full border px-3 py-2 text-[12px] font-black transition";

export function ShopTaxonomyRegistrationField({
  api = shopTaxonomyApi,
  categoryLimit = 5,
  description,
  keywordLimit = 5,
  language,
  onChange,
  onKeywordLabelsChange,
  value
}: {
  api?: ShopTaxonomyApi;
  categoryLimit?: number;
  description?: string;
  keywordLimit?: number;
  language: Language;
  onChange: (value: ShopTaxonomyRegistrationValue) => void;
  onKeywordLabelsChange?: (labels: string[]) => void;
  value: ShopTaxonomyRegistrationValue;
}) {
  const locale = languageToTaxonomyLocale[language];
  const copy = shopTaxonomyCopy[language];
  const [categories, setCategories] = useState<ShopTaxonomyCategory[]>([]);
  const [keywordsByCategory, setKeywordsByCategory] = useState<Record<number, ShopTaxonomyKeyword[]>>({});
  const [message, setMessage] = useState("");
  const reportedKeywordLabelSignature = useRef("");

  useEffect(() => {
    let active = true;
    api.listCategories(locale)
      .then((page) => {
        if (active) setCategories(page.list);
      })
      .catch(() => {
        if (active) setMessage(copy.loadFailed);
      });
    return () => {
      active = false;
    };
  }, [api, copy.loadFailed, locale]);

  useEffect(() => {
    let active = true;
    const missing = value.serviceCategoryIds.filter((categoryId) => !keywordsByCategory[categoryId]);
    if (missing.length === 0) return () => { active = false; };
    Promise.all(missing.map(async (categoryId) => [categoryId, (await api.listKeywords(categoryId, locale)).list] as const))
      .then((pages) => {
        if (active) setKeywordsByCategory((current) => ({ ...current, ...Object.fromEntries(pages) }));
      })
      .catch(() => {
        if (active) setMessage(copy.loadFailed);
      });
    return () => {
      active = false;
    };
  }, [api, copy.loadFailed, keywordsByCategory, locale, value.serviceCategoryIds]);

  const loadedKeywords = useMemo(() => Object.values(keywordsByCategory).flat(), [keywordsByCategory]);

  useEffect(() => {
    const labels = value.businessKeywordIds.flatMap((id) => {
      const matched = loadedKeywords.find((keyword) => keyword.id === id);
      return matched ? [matched.label] : [];
    });
    const signature = labels.join("\u0000");
    if (reportedKeywordLabelSignature.current !== signature) {
      reportedKeywordLabelSignature.current = signature;
      onKeywordLabelsChange?.(labels);
    }
  }, [loadedKeywords, onKeywordLabelsChange, value.businessKeywordIds]);

  const selectCategory = (categoryId: number) => {
    try {
      const next = toggleTaxonomyCategory({
        categoryId,
        categoryIds: value.serviceCategoryIds,
        categoryLimit,
        keywordIds: value.businessKeywordIds,
        keywords: loadedKeywords
      });
      onChange({ serviceCategoryIds: next.categoryIds, businessKeywordIds: next.keywordIds });
      setMessage(next.removedKeywordIds.length > 0 ? copy.removed(next.removedKeywordIds.length) : "");
    } catch {
      setMessage(copy.categoryLimit(categoryLimit));
    }
  };

  const selectKeyword = (keywordId: number) => {
    try {
      onChange({
        serviceCategoryIds: value.serviceCategoryIds,
        businessKeywordIds: toggleTaxonomyKeyword({ keywordId, keywordIds: value.businessKeywordIds, keywordLimit })
      });
      setMessage("");
    } catch {
      setMessage(copy.keywordLimit(keywordLimit));
    }
  };

  return (
    <section className="space-y-4 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_34%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] p-4">
      <div>
        <TitleWithInfo
          as="h2"
          info={description ?? copy.description}
          label={copy.infoLabel}
          title={copy.title}
          titleClassName="text-[17px] font-black text-[color:var(--client-text)]"
          variant="client"
        />
      </div>
      <div>
        <p className="mb-2 text-[11px] font-black text-[color:var(--client-muted)]">{copy.categoryCount(value.serviceCategoryIds.length, categoryLimit)}</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const selected = value.serviceCategoryIds.includes(category.id);
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  registrationChipClassName,
                  selected ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]" : "border-[color:var(--client-line)] text-[color:var(--client-text)]"
                )}
                key={category.id}
                onClick={() => selectCategory(category.id)}
                type="button"
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-black text-[color:var(--client-muted)]">{copy.keywordCount(value.businessKeywordIds.length, keywordLimit)}</p>
        <div className="grid gap-3">
          {value.serviceCategoryIds.map((categoryId) => (
            <div className="space-y-2" key={categoryId}>
              <p className="text-[11px] font-black text-[color:var(--client-text)]">{categories.find((category) => category.id === categoryId)?.label}</p>
              <div className="flex flex-wrap gap-2">
                {(keywordsByCategory[categoryId] ?? []).map((keyword) => {
                  const selected = value.businessKeywordIds.includes(keyword.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        registrationChipClassName,
                        selected ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)]"
                      )}
                      key={keyword.id}
                      onClick={() => selectKeyword(keyword.id)}
                      type="button"
                    >
                      {keyword.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {message ? <p className="text-[11px] font-black text-[color:var(--client-muted)]" role="status">{message}</p> : null}
    </section>
  );
}
