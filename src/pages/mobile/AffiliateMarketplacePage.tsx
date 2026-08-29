import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { AffiliateMarketplaceSection } from "../../features/affiliate-marketplace/AffiliateMarketplaceSection";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

const readPage = (value: string | null) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

export function AffiliateMarketplacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const keyword = searchParams.get("q")?.trim() ?? "";
  const page = readPage(searchParams.get("page"));
  const [draftKeyword, setDraftKeyword] = useState(keyword);

  useEffect(() => setDraftKeyword(keyword), [keyword]);

  const updatePage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (keyword) next.set("q", keyword);
    else next.delete("q");
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setSearchParams(next);
  };

  return (
    <MobileShell className="affiliate-marketplace-shell" navItems={businessNavItems}>
      <MobileFullscreenHeader
        backLabel={t("返回")}
        info={t("只展示 NeeDo 可验证任务数据")}
        onBack={() => navigate(-1)}
        title={t("推荐任务")}
      />
      <main className="space-y-5 px-4 pb-28 pt-3">
        <form
          className="flex min-h-13 items-center gap-2 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-2 pl-4 shadow-[0_14px_34px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]"
          onSubmit={(event) => {
            event.preventDefault();
            const next = new URLSearchParams();
            const nextKeyword = draftKeyword.trim();
            if (nextKeyword) next.set("q", nextKeyword);
            setSearchParams(next);
          }}
        >
          <input
            aria-label={t("搜索推荐任务")}
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
            name="affiliate-task-search"
            onChange={(event) => setDraftKeyword(event.target.value)}
            placeholder={t("搜索任务名称或简介")}
            type="search"
            value={draftKeyword}
          />
          <button
            className="min-h-10 shrink-0 rounded-[16px] bg-[color:var(--client-primary)] px-5 text-sm font-black text-[#07100b]"
            type="submit"
          >
            {t("搜索")}
          </button>
        </form>

        <AffiliateMarketplaceSection
          keyword={keyword || undefined}
          onPageChange={updatePage}
          page={page}
          pageSize={12}
          showHeading={false}
        />
      </main>
    </MobileShell>
  );
}
