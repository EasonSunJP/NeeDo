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
