import { lazy, Suspense, type ComponentType } from "react";

const FullSocialTimelinePage = lazy(() => import("./pages/SocialTimelinePage").then((module) => ({ default: module.SocialTimelinePage })));
const FullSocialComposerPage = lazy(() => import("./pages/SocialComposerPage").then((module) => ({ default: module.SocialComposerPage })));
const FullSocialDraftsPage = lazy(() => import("./pages/SocialDraftsPage").then((module) => ({ default: module.SocialDraftsPage })));
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
export function SocialComposerPage() { return <FullSocialRoute page={FullSocialComposerPage} />; }
export function SocialDraftsPage() { return <FullSocialRoute page={FullSocialDraftsPage} />; }
export function SocialMediaViewerPage() { return <FullSocialRoute page={FullSocialMediaViewerPage} />; }
export function SocialNotificationsPage() { return <FullSocialRoute page={FullSocialNotificationsPage} />; }
export function SocialPostDetailPage() { return <FullSocialRoute page={FullSocialPostDetailPage} />; }
export function SocialRelationshipsPage() { return <FullSocialRoute page={FullSocialRelationshipsPage} />; }
export function SocialRepostPage() { return <FullSocialRoute page={FullSocialRepostPage} />; }
export function SocialSearchPage() { return <FullSocialRoute page={FullSocialSearchPage} />; }
export function SocialAccountProfilePage() { return <FullSocialRoute page={FullSocialAccountProfilePage} />; }
