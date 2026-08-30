import { describe, expect, it } from "vitest";
import source from "./pages.tsx?raw";

describe("ImNewConversationPage directory query handoff", () => {
  it("initializes the editable formal directory query from the URL", () => {
    expect(source).toContain(
      'const [query, setQuery] = useState(searchParams.get("q")?.trim() ?? "");'
    );
    expect(source).toContain("store.searchDirectory(keyword)");
    expect(source).toContain('value={query}');
  });

  it("opens an account profile instead of directly adding or starting chat", () => {
    const start = source.indexOf("export function ImNewConversationPage");
    const friendModeStart = source.indexOf("isFriendMode ?", start);
    const friendModeEnd = source.indexOf(": isCollectMode ?", friendModeStart);
    const friendModeSource = source.slice(friendModeStart, friendModeEnd);

    expect(friendModeSource).toContain("config.routes.directoryProfile(user.id)");
    expect(friendModeSource).toContain("点击账号查看资料并发送好友申请");
    expect(friendModeSource).not.toContain("addFriendAndOpen");
    expect(friendModeSource).not.toContain("ensureDirectConversation");
  });

  it("uses the shared fullscreen detail header for the directory profile", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain("<MobileFullscreenPage");
    expect(profileSource).toContain("<MobileFullscreenHeader");
    expect(profileSource).toContain('info={t("查看资料")}');
    expect(profileSource).toContain("onClose={fromRequests");
    expect(profileSource).not.toContain("subtitle=");
    expect(profileSource).not.toContain("gradient");
  });

  it("uses the formal identity information card on the directory profile", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain("<ConversationIdentityProfileCard");
    expect(profileSource).toContain("identityCard={profile.identityCard}");
    expect(profileSource).toContain("viewerScope={scope}");
    expect(profileSource).not.toContain("<ContactSummaryCard");
  });

  it("renders friend-request actions as independent buttons without a shared visual capsule", () => {
    const start = source.indexOf("function ImFriendProfileActionBar");
    const end = source.indexOf("export function ImDirectoryProfilePage", start);
    const actionBarSource = source.slice(start, end);

    expect(actionBarSource).toContain('className="pointer-events-auto flex gap-3"');
    expect(actionBarSource).not.toContain("rounded-[28px] border");
    expect(actionBarSource).not.toContain("backdrop-blur-xl");
  });

  it("promotes an accepted directory profile to the complete contact information page", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain('profile?.relationship !== "friend"');
    expect(profileSource).toContain("store.ensureDirectConversation(userId)");
    expect(profileSource).toContain("config.routes.conversationInfo(conversation.id)");
    expect(profileSource).toContain("navigate(config.routes.conversationInfo(conversation.id), { replace: true })");
    expect(profileSource).toContain("contactInfoRedirectAttempt");
    expect(profileSource).toContain("contactInfoRedirectFailed");
  });

  it("uses contact information naming for contact pages while retaining group settings naming", () => {
    const profileStart = source.indexOf("export function ImDirectoryProfilePage");
    const contactDetailStart = source.indexOf("export function ImContactDetailPage", profileStart);
    const conversationInfoStart = source.indexOf("export function ImConversationInfoPage", contactDetailStart);
    const conversationInfoEnd = source.indexOf("export function ImConversationSearchPage", conversationInfoStart);
    const profileSource = source.slice(profileStart, contactDetailStart);
    const contactDetailSource = source.slice(contactDetailStart, conversationInfoStart);
    const conversationInfoSource = source.slice(conversationInfoStart, conversationInfoEnd);

    expect(profileSource).toContain('title={t("联系人信息")}');
    expect(profileSource).not.toContain('title={t("账号信息")}');
    expect(contactDetailSource.match(/title=\{t\("联系人信息"\)\}/g)).toHaveLength(2);
    expect(conversationInfoSource).toContain(
      'title={t(conversation.type === "single" ? "联系人信息" : "信息设置")}',
    );
  });

  it("uses the formal identity profile card in one-to-one conversation settings", () => {
    const start = source.indexOf("export function ImConversationInfoPage");
    const end = source.indexOf("export function ImConversationSearchPage", start);
    const infoSource = source.slice(start, end);

    expect(infoSource).toContain("store.getDirectoryProfile");
    expect(infoSource).toContain("<ConversationIdentityProfileCard");
    expect(infoSource).not.toContain("infoMiniCard");
    expect(infoSource).not.toContain("<SocialProfileMiniCard");
    expect(infoSource).not.toContain("<ContactSummaryCard");
  });

  it("routes both friend-deletion entry points through the shared confirmation flow", () => {
    const contactsStart = source.indexOf("export function ImContactsListPage");
    const contactsEnd = source.indexOf("export function ImFriendRequestsPage", contactsStart);
    const contactsSource = source.slice(contactsStart, contactsEnd);
    const infoStart = source.indexOf("export function ImConversationInfoPage");
    const infoEnd = source.indexOf("export function ImMediaRecordsPage", infoStart);
    const infoSource = source.slice(infoStart, infoEnd);

    expect(source).toContain('from "./FriendDeletionConfirmDialog"');
    expect(source.match(/<FriendDeletionConfirmDialog/g)).toHaveLength(2);

    expect(contactsSource).toContain("useFriendDeletionConfirmation<ContactRelation>");
    expect(contactsSource).toContain("contactDeletion.requestDeletion(contact)");
    expect(contactsSource).not.toContain("onClick: () => void store.deleteContact(contact.id)");

    expect(infoSource).toContain("useFriendDeletionConfirmation<ContactRelation>");
    expect(infoSource).toContain("contactDeletion.requestDeletion(contact)");
    expect(infoSource).toContain("navigate(config.routes.contacts, { replace: true })");
    expect(infoSource).not.toContain("onClick={() => void store.deleteContact(contact.id)}");
  });

  it("replaces friend-only settings actions with a formal add-friend action after the relationship is removed", () => {
    const start = source.indexOf("export function ImConversationInfoPage");
    const end = source.indexOf("export function ImConversationSearchPage", start);
    const infoSource = source.slice(start, end);

    expect(infoSource).toContain("resolveDirectoryProfileActions(");
    expect(infoSource).toContain('conversationFriendActions.includes("send_request")');
    expect(infoSource).toContain('conversationFriendActions.includes("accept")');
    expect(infoSource).toContain("store.sendFriendRequest");
    expect(infoSource).toContain("store.acceptFriendRequest");
    expect(infoSource).toContain('contact?.id, formalActivityTargetUserId');
    expect(infoSource).toContain('{t("添加好友")}');
  });
});
