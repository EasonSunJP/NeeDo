import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const validWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
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

const createFixture = async (permissionCodes = ["message:create"]) => {
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
  const voiceService = {
    send: jest.fn(async () => voiceMessage)
  };
  const app = createApp(
    { ...env, IM_MEDIA_STORAGE_DIR: directory },
    {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      testOnlyAllowLegacyAuthAdapters: true,
      authRepository: { findUserById: jest.fn(async () => user) },
      authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
      otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
      imVoiceMessageService: voiceService
    } as never
  );
  const token = new AuthTokenService(env).issueAccessToken({
    id: 41,
    email: user.email,
    currentIdentityId: 71
  }).token;

  return { app, directory, token, voiceService };
};

const sendVoice = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
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

describe("IM voice message HTTP API", () => {
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

  it("normalizes content-type parameters and returns the existing realtime message envelope", async () => {
    const fixture = await createFixture();
    const response = await sendVoice(fixture, {
      bytes: validWebm,
      contentType: "audio/webm;codecs=opus",
      durationSeconds: 59
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
        bytes: validWebm,
        conversationId: 91,
        durationSeconds: 59,
        fileName: "voice.webm",
        mimeType: "audio/webm"
      })
    );
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it("serves only strict IM audio hash paths without widening other media allowlists", async () => {
    const fixture = await createFixture();
    const fileName = `${"b".repeat(64)}.ogg`;
    await writeFile(join(fixture.directory, fileName), Buffer.from("OggS"));

    await request(fixture.app).get(`/media/im/${fileName}`).expect(200);
    await request(fixture.app).get(`/media/customer-avatars/${fileName}`).expect(404);
    await request(fixture.app).get(`/media/content/${fileName}`).expect(404);
    await request(fixture.app).get(`/media/im/${fileName}/extra`).expect(404);
    await rm(fixture.directory, { recursive: true, force: true });
  });
});
