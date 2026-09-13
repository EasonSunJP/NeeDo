import { describe, expect, it } from "vitest";
import source from "./SocialFavoritesPage.tsx?raw";

describe("SocialFavoritesPage Japanese copy", () => {
  it("uses the お気に入り term for the title, count, and explanation", () => {
    expect(source).toContain("お気に入りの投稿 ${value}件");
    expect(source).toContain("投稿をお気に入りに追加すると、ここに表示されます。お気に入りから削除すると一覧からも消えます。");
    expect(source).not.toContain("投稿のブックマークを押す");
  });
});
