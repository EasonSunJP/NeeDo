import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { getSocialScopeFromPathname, socialPaths, socialReplyFocusState } from "./paths";

const FullSocialTimelinePage = lazy(() => import("./pages/SocialTimelinePage").then((module) => ({ default: module.SocialTimelinePage })));
const FullSocialComposerPage = lazy(() => import("./pages/SocialComposerPage").then((module) => ({ default: module.SocialComposerPage })));
const FullSocialDraftsPage = lazy(() => import("./pages/SocialDraftsPage").then((module) => ({ default: module.SocialDraftsPage })));
const FullSocialFavoritesPage = lazy(() => import("./pages/SocialFavoritesPage").then((module) => ({ default: module.SocialFavoritesPage })));
const FullSocialMediaViewerPage = lazy(() => import("./pages/SocialMediaViewerPage").then((module) => ({ default: module.SocialMediaViewerPage })));
const FullSocialNotificationsPage = lazy(() => import("./pages/SocialNotificationsPage").then((module) => ({ default: module.SocialNotificationsPage })));
const FullSocialPostDetailPage = lazy(() => import("./pages/SocialPostDetailPage").then((module) => ({ default: module.SocialPostDetailPage })));
const FullSocialRelationshipsPage = lazy(() => import("./pages/SocialRelationshipsPage").then((module) => ({ default: module.SocialRelationshipsPage })));
const FullSocialRepostPage = lazy(() => import("./pages/SocialRepostPage").then((module) => ({ default: module.SocialRepostPage })));
const FullSocialSearchPage = lazy(() => import("./pages/SocialSearchPage").then((module) => ({ default: module.SocialSearchPage })));
const FullSocialAccountProfilePage = lazy(() => import("./pages/SocialProfilePage").then((module) => ({ default: module.SocialAccountProfilePage })));

function FullSocialRoute({ page: Page }: { page: ComponentType }) {
  return <Suspense fallback={<div className="grid min-h-[100dvh] place-items-center text-sm font-black">正在加载动态...</div>}><Page /></Suspense>;
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
