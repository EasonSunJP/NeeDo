import { lazy, Suspense, type ComponentType } from "react";
import { isStaticDemoMode } from "../../api/staticDemo";
import { useAuth } from "../../auth/AuthProvider";
import { isFrontendBypassSession } from "../../auth/rbac";
import {
  FormalSocialCapabilityPage,
  FormalSocialComposerPage,
  FormalSocialNotificationsPage,
  FormalSocialPostDetailPage,
  FormalSocialSearchPage,
  FormalSocialTimelinePage
} from "./formal-pages";

const LegacySocialTimelinePage = lazy(() => import("./pages/SocialTimelinePage").then((module) => ({ default: module.SocialTimelinePage })));
const LegacySocialComposerPage = lazy(() => import("./pages/SocialComposerPage").then((module) => ({ default: module.SocialComposerPage })));
const LegacySocialDraftsPage = lazy(() => import("./pages/SocialDraftsPage").then((module) => ({ default: module.SocialDraftsPage })));
const LegacySocialMediaViewerPage = lazy(() => import("./pages/SocialMediaViewerPage").then((module) => ({ default: module.SocialMediaViewerPage })));
const LegacySocialNotificationsPage = lazy(() => import("./pages/SocialNotificationsPage").then((module) => ({ default: module.SocialNotificationsPage })));
const LegacySocialPostDetailPage = lazy(() => import("./pages/SocialPostDetailPage").then((module) => ({ default: module.SocialPostDetailPage })));
const LegacySocialRelationshipsPage = lazy(() => import("./pages/SocialRelationshipsPage").then((module) => ({ default: module.SocialRelationshipsPage })));
const LegacySocialRepostPage = lazy(() => import("./pages/SocialRepostPage").then((module) => ({ default: module.SocialRepostPage })));
const LegacySocialSearchPage = lazy(() => import("./pages/SocialSearchPage").then((module) => ({ default: module.SocialSearchPage })));

function SocialRouteSwitch({ formal: FormalPage, legacy: LegacyPage }: { formal: ComponentType; legacy: ComponentType }) {
  const { session } = useAuth();
  if (isStaticDemoMode() && isFrontendBypassSession(session)) {
    return <Suspense fallback={<div className="grid min-h-[100dvh] place-items-center text-sm font-black">正在加载静态动态演示...</div>}><LegacyPage /></Suspense>;
  }
  return <FormalPage />;
}

const FormalSocialDraftsPage = () => <FormalSocialCapabilityPage title="动态草稿" />;
const FormalSocialMediaViewerPage = () => <FormalSocialCapabilityPage title="媒体查看" />;
const FormalSocialRelationshipsPage = () => <FormalSocialCapabilityPage title="关注关系" />;
const FormalSocialRepostPage = () => <FormalSocialCapabilityPage title="转发动态" />;

export function SocialTimelinePage() { return <SocialRouteSwitch formal={FormalSocialTimelinePage} legacy={LegacySocialTimelinePage} />; }
export function SocialComposerPage() { return <SocialRouteSwitch formal={FormalSocialComposerPage} legacy={LegacySocialComposerPage} />; }
export function SocialDraftsPage() { return <SocialRouteSwitch formal={FormalSocialDraftsPage} legacy={LegacySocialDraftsPage} />; }
export function SocialMediaViewerPage() { return <SocialRouteSwitch formal={FormalSocialMediaViewerPage} legacy={LegacySocialMediaViewerPage} />; }
export function SocialNotificationsPage() { return <SocialRouteSwitch formal={FormalSocialNotificationsPage} legacy={LegacySocialNotificationsPage} />; }
export function SocialPostDetailPage() { return <SocialRouteSwitch formal={FormalSocialPostDetailPage} legacy={LegacySocialPostDetailPage} />; }
export function SocialRelationshipsPage() { return <SocialRouteSwitch formal={FormalSocialRelationshipsPage} legacy={LegacySocialRelationshipsPage} />; }
export function SocialRepostPage() { return <SocialRouteSwitch formal={FormalSocialRepostPage} legacy={LegacySocialRepostPage} />; }
export function SocialSearchPage() { return <SocialRouteSwitch formal={FormalSocialSearchPage} legacy={LegacySocialSearchPage} />; }
