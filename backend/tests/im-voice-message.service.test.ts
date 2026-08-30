import { describe, expect, it, jest } from "@jest/globals";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  ImVoiceDurationMetadata,
  ImVoiceDurationProbePort
} from "../src/services/im-voice-duration-probe";
import {
  ImVoiceMessageService,
  type SendImVoiceMessageInput
} from "../src/services/im-voice-message.service";
import { RealtimeService } from "../src/services/realtime.service";
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

const createProbe = (
  result: ImVoiceDurationMetadata = {
    durationSeconds: validInput.durationSeconds,
    hasAudio: true,
    hasVideo: false
  }
) => ({ probe: jest.fn(async () => result) });

const constructServiceWithProbe = (
  realtime: unknown,
  storage: unknown,
  probe: ImVoiceDurationProbePort,
  publicBaseUrl = "/media/im"
): ImVoiceMessageService =>
  new ImVoiceMessageService(realtime as never, storage as never, probe, publicBaseUrl);

const collectObjectKeys = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectObjectKeys);
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectObjectKeys(child)]);
};

describe("ImVoiceMessageService", () => {
  it("orders eligibility, real-duration probe, storage, and transaction-time creation", async () => {
    const calls: string[] = [];
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => {
        calls.push("preflight");
      }),
      createMessage: jest.fn(async () => {
        calls.push("create");
        return { id: 501 };
      })
    };
    const probe = {
      probe: jest.fn(async () => {
        calls.push("probe");
        return { durationSeconds: 5.1, hasAudio: true, hasVideo: false };
      })
    };
    const storage = {
      save: jest.fn(async () => {
        calls.push("storage");
        return storedWebm;
      }),
      remove: jest.fn()
    };
    const service = constructServiceWithProbe(realtime, storage, probe);

    await expect(service.send(auth, { ...validInput, durationSeconds: 6 })).resolves.toEqual({
      id: 501
    });

    expect(calls).toEqual(["preflight", "probe", "storage", "create"]);
    expect(realtime.createMessage).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        metadata: expect.objectContaining({
          needoMessageExt: expect.objectContaining({ duration: 6 })
        })
      })
    );
  });

  it("accepts an exact 59.5-second recording and clamps authoritative metadata to 59", async () => {
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => undefined),
      createMessage: jest.fn(async () => ({ id: 501 }))
    };
    const storage = { save: jest.fn(async () => storedWebm), remove: jest.fn() };
    const probe = createProbe({ durationSeconds: 59.5, hasAudio: true, hasVideo: false });
    const service = constructServiceWithProbe(realtime, storage, probe);

    await expect(service.send(auth, { ...validInput, durationSeconds: 59 })).resolves.toEqual({
      id: 501
    });
    expect(probe.probe).toHaveBeenCalledTimes(1);
    expect(realtime.createMessage).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        metadata: expect.objectContaining({
          needoMessageExt: expect.objectContaining({ duration: 59 })
        })
      })
    );
  });

  it("accepts a compatibility hint that differs from authoritative duration by exactly one", async () => {
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => undefined),
      createMessage: jest.fn(async () => ({ id: 501 }))
    };
    const storage = { save: jest.fn(async () => storedWebm), remove: jest.fn() };
    const probe = createProbe({ durationSeconds: 5.1, hasAudio: true, hasVideo: false });
    const service = constructServiceWithProbe(realtime, storage, probe);

    await expect(service.send(auth, { ...validInput, durationSeconds: 5 })).resolves.toEqual({
      id: 501
    });
    expect(realtime.createMessage).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        metadata: expect.objectContaining({
          needoMessageExt: expect.objectContaining({ duration: 6 })
        })
      })
    );
  });

  it.each([
    {
      label: "just over the real-duration limit",
      hint: 59,
      result: { durationSeconds: 59.500001, hasAudio: true, hasVideo: false }
    },
    {
      label: "a hint difference greater than one",
      hint: 4,
      result: { durationSeconds: 5.1, hasAudio: true, hasVideo: false }
    },
    {
      label: "missing audio",
      hint: 6,
      result: { durationSeconds: 6, hasAudio: false, hasVideo: false }
    },
    {
      label: "a video track",
      hint: 6,
      result: { durationSeconds: 6, hasAudio: true, hasVideo: true }
    },
    {
      label: "a missing video flag",
      hint: 6,
      result: { durationSeconds: 6, hasAudio: true }
    },
    {
      label: "a malformed video flag from an injected probe",
      hint: 6,
      result: { durationSeconds: 6, hasAudio: true, hasVideo: "no" }
    },
    {
      label: "null metadata from an injected probe",
      hint: 6,
      result: null
    },
    {
      label: "a non-finite duration from an injected probe",
      hint: 6,
      result: { durationSeconds: Number.NaN, hasAudio: true, hasVideo: false }
    },
    {
      label: "a non-positive duration from an injected probe",
      hint: 1,
      result: { durationSeconds: 0, hasAudio: true, hasVideo: false }
    },
    {
      label: "a malformed audio flag from an injected probe",
      hint: 6,
      result: { durationSeconds: 6, hasAudio: "yes", hasVideo: false }
    }
  ])("rejects $label before storage and message publication", async ({ hint, result }) => {
    const repository = {
      checkMessageSendEligibility: jest.fn(async () => "allowed" as const),
      createMessage: jest.fn(async () => ({ status: "created" as const, message: { id: 501 } })),
      listConversationRecipients: jest.fn(async () => [])
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const realtime = new RealtimeService(repository as never, gateway as never);
    const storage = { save: jest.fn(async () => storedWebm), remove: jest.fn() };
    const probe = { probe: jest.fn(async () => result) } as unknown as ImVoiceDurationProbePort;
    const service = constructServiceWithProbe(realtime, storage, probe);

    await expect(
      service.send(auth, { ...validInput, durationSeconds: hint })
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.voice_duration_invalid",
      statusCode: 400
    });
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(repository.createMessage).not.toHaveBeenCalled();
    expect(gateway.publish).not.toHaveBeenCalled();
  });

  it("maps an injected probe failure to the stable validation error without side effects", async () => {
    const realtime = {
      assertMessageSendAllowed: jest.fn(async () => undefined),
      createMessage: jest.fn(async () => ({ id: 501 }))
    };
    const storage = { save: jest.fn(async () => storedWebm), remove: jest.fn() };
    const probe = {
      probe: jest.fn(async () => {
        throw new Error("parser exploded");
      })
    };
    const service = constructServiceWithProbe(realtime, storage, probe);

    await expect(service.send(auth, validInput)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.voice_duration_invalid",
      statusCode: 400
    });
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(realtime.createMessage).not.toHaveBeenCalled();
  });

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
      createProbe(),
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
    const service = new ImVoiceMessageService(
      realtime as never,
      storage as never,
      createProbe({ durationSeconds, hasAudio: true, hasVideo: false }),
      "/media/im"
    );

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
      const probe = createProbe();
      const service = new ImVoiceMessageService(
        realtime as never,
        storage as never,
        probe,
        "/media/im"
      );

      await expect(service.send(auth, { ...validInput, durationSeconds })).rejects.toMatchObject({
        code: ERROR_CODES.VALIDATION,
        message: "error.im.voice_duration_invalid",
        statusCode: 400
      });
      expect(realtime.assertMessageSendAllowed).not.toHaveBeenCalled();
      expect(probe.probe).not.toHaveBeenCalled();
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
    const probe = createProbe();
    const service = new ImVoiceMessageService(
      realtime as never,
      storage as never,
      probe,
      "/media/im"
    );

    await expect(service.send(auth, validInput)).rejects.toThrow("error.im.not_friends");
    expect(probe.probe).not.toHaveBeenCalled();
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
    const service = new ImVoiceMessageService(
      realtime as never,
      storage as never,
      createProbe(),
      "/media/im"
    );

    await expect(service.send(auth, validInput)).rejects.toThrow("error.im.not_friends");
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(`${"b".repeat(64)}.ogg`);
  });

  it("removes the stored file when a recipient block appears after the allowed preflight", async () => {
    const repository = {
      checkMessageSendEligibility: jest.fn(async () => "allowed" as const),
      createMessage: jest.fn(async () => ({ status: "recipient_blocked" as const }))
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const realtime = new RealtimeService(repository as never, gateway as never);
    const storage = {
      save: jest.fn(async () => storedWebm),
      remove: jest.fn(async () => undefined)
    };
    const service = new ImVoiceMessageService(
      realtime,
      storage as never,
      createProbe(),
      "/media/im"
    );

    await expect(service.send(auth, validInput)).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.im.recipient_blocked",
      statusCode: 403
    });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(storedWebm.fileKey);
    expect(gateway.publish).not.toHaveBeenCalled();
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
    const remove = jest.fn(async () => undefined);
    remove.mockImplementationOnce(async () => {
      throw cleanupError;
    });
    const storage = {
      save: jest.fn(async () => storedWebm),
      remove
    };
    const service = new ImVoiceMessageService(
      realtime as never,
      storage as never,
      createProbe(),
      "/media/im"
    );

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
    const remove = jest.fn(async () => undefined);
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
    const service = new ImVoiceMessageService(
      realtime as never,
      storage as never,
      createProbe(),
      "/media/im"
    );

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
