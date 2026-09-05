import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuthTokenService } from "../src/services/auth-token.service";
import type { ImVoiceDurationProbePort } from "../src/services/im-voice-duration-probe";
import { RealtimeService } from "../src/services/realtime.service";
import { AppError } from "../src/utils/app-error";

const validWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const validMp4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x0c]),
  Buffer.from("ftyp", "ascii"),
  Buffer.from("M4A ", "ascii")
]);
const validOgg = Buffer.from("OggS", "ascii");
const storedWebm = {
  fileKey: `${"a".repeat(64)}.webm`,
  mimeType: "audio/webm" as const,
  size: validWebm.length
};
const voiceVariants = [
  {
    label: "WebM with codecs parameter",
    bytes: validWebm,
    contentType: "audio/webm;codecs=opus",
    fileName: "voice.webm",
    mimeType: "audio/webm"
  },
  {
    label: "MP4",
    bytes: validMp4,
    contentType: "audio/mp4",
    fileName: "voice.mp4",
    mimeType: "audio/mp4"
  },
  {
    label: "Ogg",
    bytes: validOgg,
    contentType: "audio/ogg",
    fileName: "voice.ogg",
    mimeType: "audio/ogg"
  }
] as const;
const createdAt = new Date("2026-08-31T00:00:00.000Z");
const voiceMessage = {
  id: 501,
  conversationId: 91,
  senderUserId: 41,
  type: "text" as const,
  content: "语音",
  metadata: {
    needoMessageType: "voice",
    needoMessageExt: {
      duration: 59,
      fileName: "voice.webm",
      fileSize: validWebm.length,
      mimeType: "audio/webm",
      url: `/media/im/${"a".repeat(64)}.webm`
    }
  },
  reactions: [],
  expiresAt: null,
  recallDeadlineAt: new Date("2026-08-31T00:02:00.000Z"),
  recalledAt: null,
  recallMode: null,
  contentPurgedAt: null,
  privacyPolicyVersionAtSend: 1,
  lifecycleVersion: 1,
  reactionVersion: 0,
  availableRecallModes: ["standard" as const],
  createdAt
};

const createFixture = async (
  permissionCodes = ["message:create"],
  send = jest.fn(async () => voiceMessage)
) => {
  const directory = await mkdtemp(join(tmpdir(), "needo-im-voice-api-"));
  const user = {
    id: 41,
    email: "voice@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Voice user",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 71,
        userId: 41,
        type: "customer",
        scopeType: "self",
        scopeId: 41,
        displayName: "Voice user",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    identityApplications: [],
    userRoles: [
      {
        deletedAt: null,
        role: {
          code: "customer",
          deletedAt: null,
          rolePermissions: permissionCodes.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const voiceService = { send };
  const app = createApp({ ...env, IM_MEDIA_STORAGE_DIR: directory }, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    imVoiceMessageService: voiceService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 41,
    email: user.email,
    currentIdentityId: 71
  }).token;

  return { app, directory, token, voiceService };
};

const sendVoice = (
  fixture: { app: ReturnType<typeof createApp>; token: string },
  input: {
    bytes?: Buffer;
    contentType?: string;
    conversationId?: number | string;
    durationSeconds?: number | string;
    fileName?: string;
  } = {}
) =>
  request(fixture.app)
    .post(
      `/api/v1/im/conversations/${input.conversationId ?? 91}/voice?fileName=${encodeURIComponent(
        input.fileName ?? "voice.webm"
      )}&durationSeconds=${input.durationSeconds ?? 59}`
    )
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Content-Type", input.contentType ?? "audio/webm;codecs=opus")
    .send(input.bytes ?? validWebm);

const createRealRouteFixture = async (options: {
  durationProbe?: ImVoiceDurationProbePort;
  useDefaultStorage?: boolean;
}) => {
  const directory = await mkdtemp(join(tmpdir(), "needo-im-voice-real-route-"));
  const user = {
    id: 41,
    email: "voice-real-route@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Voice real route user",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 71,
        userId: 41,
        type: "customer",
        scopeType: "self",
        scopeId: 41,
        displayName: "Voice real route user",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    identityApplications: [],
    userRoles: [
      {
        deletedAt: null,
        role: {
          code: "customer",
          deletedAt: null,
          rolePermissions: [
            {
              deletedAt: null,
              permission: { code: "message:create", type: "api", deletedAt: null }
            }
          ]
        }
      }
    ]
  };
  const repository = {
    checkMessageSendEligibility: jest.fn(async () => "allowed" as const),
    createMessage: jest.fn(async (input: { metadata?: unknown }) => ({
      status: "created" as const,
      message: { ...voiceMessage, metadata: input.metadata }
    })),
    listConversationRecipients: jest.fn(async () => [])
  };
  const gateway = { publish: jest.fn(), subscribe: jest.fn() };
  const realtimeService = new RealtimeService(repository as never, gateway as never);
  const storage = {
    save: jest.fn(async () => storedWebm),
    remove: jest.fn(async () => undefined)
  };
  const dependencies = {
    redisHealthCheck: async () => ({ status: "ok" as const, latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    realtimeService,
    imVoiceDurationProbe: options.durationProbe,
    ...(options.useDefaultStorage ? {} : { imVoiceStorage: storage })
  };
  const app = createApp({ ...env, IM_MEDIA_STORAGE_DIR: directory }, dependencies as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 41,
    email: user.email,
    currentIdentityId: 71
  }).token;

  return { app, directory, gateway, repository, storage, token };
};

describe("IM voice message HTTP API", () => {
  it("wires the injected duration probe and persists server-derived metadata", async () => {
    const durationProbe = {
      probe: jest.fn(async () => ({
        durationSeconds: 1.2,
        hasAudio: true,
        hasVideo: false
      }))
    };
    const fixture = await createRealRouteFixture({ durationProbe });

    const response = await sendVoice(fixture, { durationSeconds: 3 });

    expect(response.status).toBe(201);
    expect(durationProbe.probe).toHaveBeenCalledWith(validWebm, "audio/webm");
    expect(fixture.repository.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          needoMessageExt: expect.objectContaining({ duration: 2 })
        })
      })
    );
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it("rejects a real over-limit WebM through the default worker before storage or creation", async () => {
    const fixture = await createRealRouteFixture({ useDefaultStorage: true });
    const bytes = await readFile(join(__dirname, "fixtures", "im-voice", "silence-60s.webm"));

    const response = await sendVoice(fixture, { bytes, durationSeconds: 59 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("error.im.voice_duration_invalid");
    expect(fixture.repository.createMessage).not.toHaveBeenCalled();
    expect(await readdir(fixture.directory)).toEqual([]);
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it("validates duration, conversation, filename, MIME, and the 8 MiB raw body limit", async () => {
    const fixture = await createFixture();
    const responses = await Promise.all([
      sendVoice(fixture, { durationSeconds: 0 }),
      sendVoice(fixture, { durationSeconds: 60 }),
      sendVoice(fixture, { conversationId: 0 }),
      sendVoice(fixture, { fileName: "" }),
      sendVoice(fixture, { contentType: "audio/mpeg" }),
      sendVoice(fixture, { bytes: Buffer.alloc(8 * 1024 * 1024 + 1) })
    ]);

    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400, 400, 415, 413]);
    expect(fixture.voiceService.send).not.toHaveBeenCalled();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it("authorizes message:create before parsing or sending audio", async () => {
    const fixture = await createFixture([]);
    const response = await sendVoice(fixture);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("error.forbidden");
    expect(fixture.voiceService.send).not.toHaveBeenCalled();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it.each(voiceVariants)(
    "accepts $label raw audio and passes normalized $mimeType to the service",
    async ({ bytes, contentType, fileName, mimeType }) => {
      const fixture = await createFixture();
      const response = await sendVoice(fixture, {
        bytes,
        contentType,
        durationSeconds: 59,
        fileName
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        code: 0,
        message: "success",
        data: { id: 501, conversationId: 91 }
      });
      expect(fixture.voiceService.send).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 41 }),
        expect.objectContaining({
          bytes,
          conversationId: 91,
          durationSeconds: 59,
          fileName,
          mimeType
        })
      );
      await rm(fixture.directory, { recursive: true, force: true });
    }
  );

  it("preserves a downstream AppError status and message", async () => {
    const serviceError = new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.im.not_friends",
      statusCode: 403
    });
    const send = jest.fn(async () => {
      throw serviceError;
    });
    const fixture = await createFixture(["message:create"], send);
    const response = await sendVoice(fixture);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("error.im.not_friends");
    expect(send).toHaveBeenCalledTimes(1);
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it("serves only strict IM audio hash paths without widening other media allowlists", async () => {
    const fixture = await createFixture();
    const fileName = `${"b".repeat(64)}.ogg`;
    await writeFile(join(fixture.directory, fileName), Buffer.from("OggS"));

    const media = await request(fixture.app).get(`/media/im/${fileName}`).expect(200);
    expect(media.headers["cache-control"]).toBe("private, no-store");
    await request(fixture.app).get(`/media/customer-avatars/${fileName}`).expect(404);
    await request(fixture.app).get(`/media/content/${fileName}`).expect(404);
    await request(fixture.app).get(`/media/im/${fileName}/extra`).expect(404);
    await rm(fixture.directory, { recursive: true, force: true });
  });
});
