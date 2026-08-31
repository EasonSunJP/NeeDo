import { AppTopBar, PageScaffold, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { useOptionalI18n } from "../../../i18n/I18nProvider";
import type { Language } from "../../../i18n/translations";
import { useSocial } from "../context";
import { socialPaths } from "../paths";
import { navItemsForSocialScope, SocialEmptyState, SocialPostItem, SocialTopActions } from "../components/SocialUi";

const favoritesCopy: Record<Language, {
  count: (value: number) => string;
  description: string;
  emptyTitle: string;
  explore: string;
  title: string;
}> = {
  zh: { count: (value) => `${value} 条已收藏动态`, description: "在动态中点击书签后，会保存到这里；取消收藏会同步移除。", emptyTitle: "还没有收藏动态", explore: "去看动态", title: "我的收藏" },
  "zh-Hant": { count: (value) => `${value} 則已收藏動態`, description: "在動態中點擊書籤後，會儲存到這裡；取消收藏會同步移除。", emptyTitle: "還沒有收藏動態", explore: "去看動態", title: "我的收藏" },
  ja: { count: (value) => `お気に入り投稿 ${value}件`, description: "投稿のブックマークを押すとここに保存され、解除すると一覧からも削除されます。", emptyTitle: "お気に入りの投稿はまだありません", explore: "投稿を見る", title: "お気に入り" },
  en: { count: (value) => `${value} bookmarked posts`, description: "Bookmark a post to save it here; removing the bookmark removes it from this list.", emptyTitle: "No bookmarked posts yet", explore: "Browse posts", title: "My bookmarks" },
  ko: { count: (value) => `즐겨찾기 게시물 ${value}개`, description: "게시물에서 북마크를 누르면 여기에 저장되며, 북마크를 해제하면 목록에서도 제거됩니다.", emptyTitle: "아직 즐겨찾기한 게시물이 없습니다", explore: "게시물 보기", title: "내 즐겨찾기" }
};

export function SocialFavoritesPage() {
  const { language } = useOptionalI18n();
  const copy = favoritesCopy[language];
  const scope = "user" as const;
  const { getActorForScope, getUnreadNotificationCount, state } = useSocial();
  const actorKey = getActorForScope(scope);
  const interactions = state.interactions[actorKey] ?? {};
  const bookmarkedPosts = state.posts.filter((post) => interactions[post.id]?.bookmarked);

  return (
    <PageScaffold contentClassName="space-y-5 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        info={copy.count(bookmarkedPosts.length)}
        title={copy.title}
      />
      {bookmarkedPosts.length === 0 ? (
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.timeline(scope)}>{copy.explore}</PrimaryButton>}
          description={copy.description}
          title={copy.emptyTitle}
        />
      ) : (
        <div className="space-y-4">
          {bookmarkedPosts.map((post) => (
            <SocialPostItem actorKey={actorKey} key={post.id} post={post} scope={scope} />
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
