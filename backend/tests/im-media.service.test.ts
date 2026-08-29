import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImMediaFileStorage } from "../src/services/im-media.storage";
import { ImMediaService } from "../src/services/im-media.service";

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("ImMediaService", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "needo-im-media-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("stores validated image bytes for a conversation participant and returns an opaque URL", async () => {
    const repository = {
      getConversationForUser: jest.fn(async () => ({ id: 91 }))
    };
    const service = new ImMediaService(
      repository as never,
      new ImMediaFileStorage(directory),
      "https://media.needo.test/media/im",
      {
        resolve: jest.fn(async () => ({ identityId: 71, userId: 41, identityType: "technician" }))
      } as never
    );

    const result = await service.upload(
      { userId: 41, currentIdentityId: 71, currentIdentityType: "technician" } as never,
      {
      bytes: pngBytes,
      conversationId: 91,
      fileName: "album.png",
      mimeType: "image/png"
      }
    );

    expect(repository.getConversationForUser).toHaveBeenCalledWith(91, 71, 41);
    expect(result).toMatchObject({
      fileName: "album.png",
      fileSize: pngBytes.length,
      mimeType: "image/png",
      url: expect.stringMatching(/^https:\/\/media\.needo\.test\/media\/im\/[a-f0-9]{64}\.png$/)
    });
    await expect(readFile(join(directory, result.url.split("/").at(-1)!))).resolves.toEqual(
      pngBytes
    );
  });

  it("rejects uploads from users outside the conversation before writing", async () => {
    const service = new ImMediaService(
      { getConversationForUser: jest.fn(async () => null) } as never,
      new ImMediaFileStorage(directory),
      "https://media.needo.test/media/im"
    );

    await expect(
      service.upload({ userId: 99 } as never, {
        bytes: pngBytes,
        conversationId: 91,
        fileName: "album.png",
        mimeType: "image/png"
      })
    ).rejects.toMatchObject({
      message: "error.realtime.conversation_not_found",
      statusCode: 404
    });
  });

  it("rejects spoofed image content", async () => {
    const service = new ImMediaService(
      { getConversationForUser: jest.fn(async () => ({ id: 91 })) } as never,
      new ImMediaFileStorage(directory),
      "https://media.needo.test/media/im"
    );

    await expect(
      service.upload({ userId: 41 } as never, {
        bytes: Buffer.from("not-an-image"),
        conversationId: 91,
        fileName: "album.png",
        mimeType: "image/png"
      })
    ).rejects.toMatchObject({
      message: "error.im.media_invalid",
      statusCode: 400
    });
  });
});
