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
});
