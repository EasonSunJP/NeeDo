import { describe, expect, it } from "vitest";
import translationsSource from "../../../i18n/translations.ts?raw";
import draftsSource from "./SocialDraftsPage.tsx?raw";
import source from "./SocialComposerPage.tsx?raw";
import typesSource from "../types.ts?raw";
import {
  getSocialComposerErrorMessage,
  getSocialImageValidationError,
  isSocialComposerPublishReady
} from "../composer-media";
import type { SocialMediaItem } from "../types";

const uploadedImage: SocialMediaItem = {
  id: "media-ready",
  type: "image",
  url: "/media/social/ready.png",
  mediaAssetPublicId: "a".repeat(64)
};

describe("SocialComposerPage formal contacts and image uploads", () => {
  it("contains no reply-mode branch or reply-specific draft payload", () => {
    expect(source).not.toContain('searchParams.get("replyToPostId")');
    expect(source).not.toContain(["reply", "Post"].join(""));
    expect(source).not.toContain("replyToPostId,");
  });

  it("removes reply drafts from the draft type and keeps the drafts page generic", () => {
    const draftTypeSource = typesSource.slice(
      typesSource.indexOf("export interface SocialComposerDraft"),
      typesSource.indexOf("export interface SocialNotification")
    );

    expect(draftTypeSource).not.toContain("replyToPostId");
    expect(draftsSource).not.toContain("draft.replyToPostId");
    expect(draftsSource).toContain(".filter(([key]) => key.startsWith(`composer:${scope}:`))");
  });

  it("loads reminder candidates from the formal contact API instead of Social profiles", () => {
    expect(source).toContain("loadFormalSocialMentionCandidates");
    expect(source).toContain("mentionUserIds");
    expect(source).not.toContain("const mentionCandidates = useMemo(() => {\n    const normalized = mentionQuery.trim().toLowerCase();\n\n    return profileList");
  });

  it("keeps persisted reminder contacts and submits them when saving an edit", () => {
    expect(source).toContain("mentionUserIds: editPost?.mentionUserIds");
    expect(source).toMatch(/updatePost\(\{[\s\S]*?mentionUserIds,[\s\S]*?\}\)/u);
  });

  it("uploads selected images through the formal Social media route", () => {
    expect(source).toContain("realtimeApi.uploadSocialMedia");
    expect(source).not.toContain("createMediaFromFile");
  });

  it("blocks publishing until every selected image has a server asset reference", () => {
    expect(isSocialComposerPublishReady({ text: "发布", media: [uploadedImage] })).toBe(true);
    expect(
      isSocialComposerPublishReady({
        text: "发布",
        media: [{ ...uploadedImage, mediaAssetPublicId: undefined, url: "blob:preview" }]
      })
    ).toBe(false);
    expect(isSocialComposerPublishReady({ text: "", media: [] })).toBe(false);
  });

  it("accepts only formal image types up to eight MiB", () => {
    expect(getSocialImageValidationError(new File(["ok"], "photo.webp", { type: "image/webp" }))).toBeNull();
    expect(getSocialImageValidationError(new File(["bad"], "photo.gif", { type: "image/gif" }))).toBe(
      "图片格式无效，请选择 JPEG、PNG 或 WebP。"
    );
    expect(
      getSocialImageValidationError(
        new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })
      )
    ).toBe("图片不能超过 8 MiB。");
  });

  it("maps internal API error keys to readable composer copy", () => {
    expect(getSocialComposerErrorMessage(new Error("error.social.media_upload_unavailable"))).toBe(
      "图片上传失败，请重试。"
    );
    expect(getSocialComposerErrorMessage(new Error("error.social.invalid_mention_contact"))).toBe(
      "联系人状态已变化，请刷新后重试。"
    );
    expect(getSocialComposerErrorMessage(new Error("unexpected"))).toBe("发布失败，请重试。");
  });

  it("ships explicit translations for the new contact and upload states", () => {
    [
      "搜索联系人昵称、用户名或 NeeDoID",
      "联系人加载失败，请重试。",
      "当前没有可提醒的联系人。",
      "图片上传失败，请重试。",
      "最多 9 张图片；单张不超过 8 MiB。",
      "提醒你查看一条新动态。"
    ].forEach((copy) => expect(translationsSource).toContain(`\"${copy}\"`));
  });
});
