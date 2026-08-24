import { lazy, Suspense, type ComponentType } from "react";
import { isStaticDemoMode } from "../../api/staticDemo";
import { useAuth } from "../../auth/AuthProvider";
import { isFrontendBypassSession } from "../../auth/rbac";
import {
  FormalImCapabilityPage,
  FormalImContactDetailPage,
  FormalImContactsListPage,
  FormalImConversationInfoPage,
  FormalImConversationRoomRoutePage,
  FormalImFriendRequestsPage,
  FormalImMessagesEntryPage,
  FormalImNewConversationPage,
  FormalImSearchPage
} from "./formal-pages";

const legacyPage = (name: keyof typeof import("./pages")) => lazy(async () => {
  const module = await import("./pages");
  return { default: module[name] as ComponentType };
});

const LegacyImBlacklistPage = legacyPage("ImBlacklistPage");
const LegacyImContactDetailPage = legacyPage("ImContactDetailPage");
const LegacyImContactsListPage = legacyPage("ImContactsListPage");
const LegacyImContactTagsPage = legacyPage("ImContactTagsPage");
const LegacyImConversationInfoPage = legacyPage("ImConversationInfoPage");
const LegacyImConversationRoomRoutePage = legacyPage("ImConversationRoomRoutePage");
const LegacyImFriendRequestsPage = legacyPage("ImFriendRequestsPage");
const LegacyImMediaRecordsPage = legacyPage("ImMediaRecordsPage");
const LegacyImMessagesEntryPage = legacyPage("ImMessagesEntryPage");
const LegacyImNewConversationPage = legacyPage("ImNewConversationPage");
const LegacyImOrganizationContactsPage = legacyPage("ImOrganizationContactsPage");
const LegacyImSearchPage = legacyPage("ImSearchPage");
const LegacyImServiceAccountsPage = legacyPage("ImServiceAccountsPage");

function ImRouteSwitch({ legacy: LegacyPage, formal: FormalPage }: { legacy: ComponentType; formal: ComponentType }) {
  const { session } = useAuth();
  const useLegacyPage = isStaticDemoMode() && isFrontendBypassSession(session);

  if (useLegacyPage) {
    return <Suspense fallback={<div className="grid min-h-[100dvh] place-items-center text-sm font-black">正在加载静态通讯演示...</div>}><LegacyPage /></Suspense>;
  }

  return <FormalPage />;
}

const FormalImBlacklistPage = () => <FormalImCapabilityPage title="黑名单" />;
const FormalImContactTagsPage = () => <FormalImCapabilityPage title="联系人标签" />;
const FormalImMediaRecordsPage = () => <FormalImCapabilityPage title="媒体与文件" />;
const FormalImOrganizationContactsPage = () => <FormalImCapabilityPage title="组织通讯录" />;
const FormalImServiceAccountsPage = () => <FormalImCapabilityPage title="服务号" />;

export function ImMessagesEntryPage() { return <ImRouteSwitch formal={FormalImMessagesEntryPage} legacy={LegacyImMessagesEntryPage} />; }
export function ImConversationRoomRoutePage() { return <ImRouteSwitch formal={FormalImConversationRoomRoutePage} legacy={LegacyImConversationRoomRoutePage} />; }
export function ImContactsListPage() { return <ImRouteSwitch formal={FormalImContactsListPage} legacy={LegacyImContactsListPage} />; }
export function ImFriendRequestsPage() { return <ImRouteSwitch formal={FormalImFriendRequestsPage} legacy={LegacyImFriendRequestsPage} />; }
export function ImNewConversationPage() { return <ImRouteSwitch formal={FormalImNewConversationPage} legacy={LegacyImNewConversationPage} />; }
export function ImConversationInfoPage() { return <ImRouteSwitch formal={FormalImConversationInfoPage} legacy={LegacyImConversationInfoPage} />; }
export function ImContactDetailPage() { return <ImRouteSwitch formal={FormalImContactDetailPage} legacy={LegacyImContactDetailPage} />; }
export function ImSearchPage() { return <ImRouteSwitch formal={FormalImSearchPage} legacy={LegacyImSearchPage} />; }
export function ImBlacklistPage() { return <ImRouteSwitch formal={FormalImBlacklistPage} legacy={LegacyImBlacklistPage} />; }
export function ImContactTagsPage() { return <ImRouteSwitch formal={FormalImContactTagsPage} legacy={LegacyImContactTagsPage} />; }
export function ImMediaRecordsPage() { return <ImRouteSwitch formal={FormalImMediaRecordsPage} legacy={LegacyImMediaRecordsPage} />; }
export function ImOrganizationContactsPage() { return <ImRouteSwitch formal={FormalImOrganizationContactsPage} legacy={LegacyImOrganizationContactsPage} />; }
export function ImServiceAccountsPage() { return <ImRouteSwitch formal={FormalImServiceAccountsPage} legacy={LegacyImServiceAccountsPage} />; }
