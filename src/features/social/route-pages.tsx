import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { getSocialScopeFromPathname, socialPaths, socialReplyFocusState } from "./paths";

async function loadSocialPage<TModule, TName extends keyof TModule>(
  loader: () => Promise<TModule>,
  name: TName
) {
  const [, module] = await Promise.all([import("./registerRouteI18n"), loader()]);
  return { default: module[name] as ComponentType<any> };
}

const FullSocialTimelinePage = lazy(() => loadSocialPage(() => import("./pages/SocialTimelinePage"), "SocialTimelinePage"));
const FullSocialComposerPage = lazy(() => loadSocialPage(() => import("./pages/SocialComposerPage"), "SocialComposerPage"));
const FullSocialDraftsPage = lazy(() => loadSocialPage(() => import("./pages/SocialDraftsPage"), "SocialDraftsPage"));
const FullSocialFavoritesPage = lazy(() => loadSocialPage(() => import("./pages/SocialFavoritesPage"), "SocialFavoritesPage"));
const FullSocialMediaViewerPage = lazy(() => loadSocialPage(() => import("./pages/SocialMediaViewerPage"), "SocialMediaViewerPage"));
const FullSocialNotificationsPage = lazy(() => loadSocialPage(() => import("./pages/SocialNotificationsPage"), "SocialNotificationsPage"));
const FullSocialPostDetailPage = lazy(() => loadSocialPage(() => import("./pages/SocialPostDetailPage"), "SocialPostDetailPage"));
const FullSocialRelationshipsPage = lazy(() => loadSocialPage(() => import("./pages/SocialRelationshipsPage"), "SocialRelationshipsPage"));
const FullSocialRepostPage = lazy(() => loadSocialPage(() => import("./pages/SocialRepostPage"), "SocialRepostPage"));
const FullSocialSearchPage = lazy(() => loadSocialPage(() => import("./pages/SocialSearchPage"), "SocialSearchPage"));
const FullSocialAccountProfilePage = lazy(() => loadSocialPage(() => import("./pages/SocialProfilePage"), "SocialAccountProfilePage"));

function FullSocialRoute({ page: Page }: { page: ComponentType }) {
  const { language } = useI18n();
  return <Suspense fallback={<div className="grid min-h-[100dvh] place-items-center bg-[color:var(--client-bg)] text-sm font-black text-[color:var(--client-text)]">{translateText("正在加载…", language)}</div>}><Page /></Suspense>;
}

export function SocialTimelinePage() { return <FullSocialRoute page={FullSocialTimelinePage} />; }
export function SocialComposerPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const scope = getSocialScopeFromPathname(location.pathname);

  if (searchParams.has("replyToPostId")) {
    const replyToPostId = searchParams.get("replyToPostId");
    return replyToPostId && /^\d+$/u.test(replyToPostId)
      ? <Navigate replace state={socialReplyFocusState} to={socialPaths.post(scope, replyToPostId)} />
      : <Navigate replace to={socialPaths.timeline(scope)} />;
  }

  return <FullSocialRoute page={FullSocialComposerPage} />;
}
export function SocialLegacyReplyRedirectPage() {
  const location = useLocation();
  const { postId } = useParams();
  const scope = getSocialScopeFromPathname(location.pathname);
  return postId
    ? <Navigate replace state={socialReplyFocusState} to={socialPaths.post(scope, postId)} />
    : <Navigate replace to={socialPaths.timeline(scope)} />;
}
export function SocialDraftsPage() { return <FullSocialRoute page={FullSocialDraftsPage} />; }
export function SocialFavoritesPage() { return <FullSocialRoute page={FullSocialFavoritesPage} />; }
export function SocialMediaViewerPage() { return <FullSocialRoute page={FullSocialMediaViewerPage} />; }
export function SocialNotificationsPage() { return <FullSocialRoute page={FullSocialNotificationsPage} />; }
export function SocialPostDetailPage() { return <FullSocialRoute page={FullSocialPostDetailPage} />; }
export function SocialRelationshipsPage() { return <FullSocialRoute page={FullSocialRelationshipsPage} />; }
export function SocialRepostPage() { return <FullSocialRoute page={FullSocialRepostPage} />; }
export function SocialSearchPage() { return <FullSocialRoute page={FullSocialSearchPage} />; }
export function SocialAccountProfilePage() { return <FullSocialRoute page={FullSocialAccountProfilePage} />; }
