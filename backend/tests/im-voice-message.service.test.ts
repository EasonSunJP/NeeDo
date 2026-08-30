import { describe, expect, it, jest } from "@jest/globals";
import { ERROR_CODES } from "../src/constants/error-codes";
import {
  ImVoiceMessageService,
  type SendImVoiceMessageInput
} from "../src/services/im-voice-message.service";
import { AppError } from "../src/utils/app-error";

const validInput: SendImVoiceMessageInput = {
  bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  conversationId: 91,
  durationSeconds: 6,
  fileName: "voice.webm",
  mimeType: "audio/webm"
};

const auth = { userId: 41 } as never;

const storedWebm = {
  fileKey: `${"a".repeat(64)}.webm`,
  mimeType: "audio/webm" as const,
  size: 128
};

const collectObjectKeys = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectObjectKeys);
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectObjectKeys(child)]);
};

describe("ImVoiceMessageService", () => {
  it("preflights, stores once, and creates one formal voice message", async () => {
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => ({ identityId: 71 })),
      createMessage: jest.fn(async () => ({ id: 501 }))
    };
    const storage = {
      save: jest.fn(async () => storedWebm),
      remove: jest.fn()
    };
    const service = new ImVoiceMessageService(
      realtime as never,
      storage as never,
      "https://media.needo.test/media/im/"
    );

    await expect(
      service.send(auth, {
        ...validInput,
        fileName: "../../spoof.mp4"
      })
    ).resolves.toEqual({ id: 501 });

    expect(realtime.assertMessageSendAllowed).toHaveBeenCalledWith(auth, 91);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledWith(validInput.bytes, validInput.mimeType);
    expect(realtime.assertMessageSendAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      storage.save.mock.invocationCallOrder[0]!
    );
    expect(realtime.createMessage).toHaveBeenCalledTimes(1);
    expect(storage.save.mock.invocationCallOrder[0]).toBeLessThan(
      realtime.createMessage.mock.invocationCallOrder[0]!
    );
    expect(realtime.createMessage).toHaveBeenCalledWith(auth, {
      conversationId: 91,
      type: "text",
      content: "语音",
      metadata: {
        needoMessageType: "voice",
        needoMessageExt: {
          duration: 6,
          fileName: "spoof.webm",
          fileSize: 128,
          mimeType: "audio/webm",
          url: `https://media.needo.test/media/im/${storedWebm.fileKey}`
        }
      }
    });

    const calls = realtime.createMessage.mock.calls as unknown as Array<
      [unknown, Record<string, unknown>]
    >;
    const payload = calls[0]?.[1];
    expect(collectObjectKeys(payload)).not.toEqual(
      expect.arrayContaining(["bytes", "data", "blob", "base64"])
    );
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([1, 59])("accepts duration at valid boundary %s", async (durationSeconds) => {
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => ({ identityId: 71 })),
      createMessage: jest.fn(async () => ({ id: 501 }))
    };
    const storage = {
      save: jest.fn(async () => storedWebm),
      remove: jest.fn()
    };
    const service = new ImVoiceMessageService(realtime as never, storage as never, "/media/im");

    await expect(service.send(auth, { ...validInput, durationSeconds })).resolves.toEqual({
      id: 501
    });
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(realtime.createMessage).toHaveBeenCalledTimes(1);
  });

  it.each([0, 60, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid duration %s before preflight or storage",
    async (durationSeconds) => {
      const realtime = {
        assertMessageSendAllowed: jest.fn(),
        createMessage: jest.fn()
      };
      const storage = { save: jest.fn(), remove: jest.fn() };
      const service = new ImVoiceMessageService(realtime as never, storage as never, "/media/im");

      await expect(service.send(auth, { ...validInput, durationSeconds })).rejects.toMatchObject({
        code: ERROR_CODES.VALIDATION,
        message: "error.im.voice_duration_invalid",
        statusCode: 400
      });
      expect(realtime.assertMessageSendAllowed).not.toHaveBeenCalled();
      expect(storage.save).not.toHaveBeenCalled();
      expect(realtime.createMessage).not.toHaveBeenCalled();
    }
  );

  it("does not save when preflight rejects", async () => {
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => {
        throw new Error("error.im.not_friends");
      }),
      createMessage: jest.fn()
    };
    const storage = { save: jest.fn(), remove: jest.fn() };
    const service = new ImVoiceMessageService(realtime as never, storage as never, "/media/im");

    await expect(service.send(auth, validInput)).rejects.toThrow("error.im.not_friends");
    expect(storage.save).not.toHaveBeenCalled();
    expect(realtime.createMessage).not.toHaveBeenCalled();
  });

  it("removes the stored file when authoritative message creation fails at the transaction gate", async () => {
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => ({ identityId: 71 })),
      createMessage: jest.fn(async () => {
        throw new Error("error.im.not_friends");
      })
    };
    const storage = {
      save: jest.fn(async () => ({
        fileKey: `${"b".repeat(64)}.ogg`,
        mimeType: "audio/ogg" as const,
        size: 64
      })),
      remove: jest.fn(async () => undefined)
    };
    const service = new ImVoiceMessageService(realtime as never, storage as never, "/media/im");

    await expect(service.send(auth, validInput)).rejects.toThrow("error.im.not_friends");
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(`${"b".repeat(64)}.ogg`);
  });

  it("retries cleanup once and preserves the original create error when cleanup then succeeds", async () => {
    const originalError = new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.im.not_friends",
      statusCode: 403
    });
    const cleanupError = new Error("transient cleanup failure");
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => ({ identityId: 71 })),
      createMessage: jest.fn(async () => {
        throw originalError;
      })
    };
    const remove = jest.fn(async (_fileKey: string) => undefined);
    remove.mockImplementationOnce(async () => {
      throw cleanupError;
    });
    const storage = {
      save: jest.fn(async () => storedWebm),
      remove
    };
    const service = new ImVoiceMessageService(realtime as never, storage as never, "/media/im");

    await expect(service.send(auth, validInput)).rejects.toBe(originalError);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, storedWebm.fileKey);
    expect(remove).toHaveBeenNthCalledWith(2, storedWebm.fileKey);
    expect(originalError).not.toHaveProperty("cleanupError");
  });

  it("preserves the original create error and attaches final cleanup failure diagnostically", async () => {
    const originalError = new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.im.not_friends",
      statusCode: 403
    });
    const firstCleanupError = new Error("first cleanup failure");
    const finalCleanupError = new Error("final cleanup failure");
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => ({ identityId: 71 })),
      createMessage: jest.fn(async () => {
        throw originalError;
      })
    };
    const remove = jest.fn(async (_fileKey: string) => undefined);
    remove.mockImplementationOnce(async () => {
      throw firstCleanupError;
    });
    remove.mockImplementationOnce(async () => {
      throw finalCleanupError;
    });
    const storage = {
      save: jest.fn(async () => storedWebm),
      remove
    };
    const service = new ImVoiceMessageService(realtime as never, storage as never, "/media/im");

    let caught: unknown;
    try {
      await service.send(auth, validInput);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(originalError);
    expect(caught).toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.im.not_friends",
      statusCode: 403
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect((caught as { cleanupError?: unknown }).cleanupError).toBe(finalCleanupError);
    expect(Object.prototype.propertyIsEnumerable.call(caught, "cleanupError")).toBe(false);
    expect(Object.keys(caught as object)).not.toContain("cleanupError");
  });
});
