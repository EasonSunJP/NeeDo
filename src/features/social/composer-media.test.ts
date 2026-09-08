import { describe, expect, it, vi } from "vitest";
import {
  areSocialComposerMediaUploadsComplete,
  resolveSocialComposerMediaUploads
} from "./composer-media";
import type { SocialMediaItem } from "./types";

const uploaded = (id: string): SocialMediaItem => ({
  id,
  type: "image",
  url: `/media/social/${id}.png`,
  mediaAssetPublicId: "a".repeat(64)
});

const pending = (id: string): SocialMediaItem => ({
  id,
  type: "image",
  url: `blob:${id}`
});

describe("Social composer background media resolution", () => {
  it("keeps selected media order while awaiting already-started uploads", async () => {
    const first = pending("first");
    const second = uploaded("second");
    const uploadTasks = new Map<string, Promise<SocialMediaItem>>([
      [first.id, Promise.resolve(uploaded(first.id))]
    ]);

    await expect(resolveSocialComposerMediaUploads([first, second], uploadTasks)).resolves.toEqual([
      uploaded("first"),
      second
    ]);
  });

  it("rejects before publish when a pending image has no active upload task", async () => {
    await expect(resolveSocialComposerMediaUploads([pending("missing")], new Map())).rejects.toThrow(
      "error.social.media_upload_unavailable"
    );
  });

  it("rejects before publish when an upload fails", async () => {
    const publish = vi.fn();
    const image = pending("failed");
    const failedUpload = Promise.reject<SocialMediaItem>(new Error("error.social.media_upload_unavailable"));
    void failedUpload.catch(() => undefined);
    const uploadTasks = new Map<string, Promise<SocialMediaItem>>([[image.id, failedUpload]]);

    await expect(
      resolveSocialComposerMediaUploads([image], uploadTasks).then(publish)
    ).rejects.toThrow("error.social.media_upload_unavailable");
    expect(publish).not.toHaveBeenCalled();
  });

  it("accepts only media with formal asset references as upload-complete", () => {
    expect(areSocialComposerMediaUploadsComplete([uploaded("ready")])).toBe(true);
    expect(areSocialComposerMediaUploadsComplete([pending("pending")])).toBe(false);
  });
});
