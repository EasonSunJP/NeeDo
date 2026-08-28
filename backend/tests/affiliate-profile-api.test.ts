import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  AffiliateProfileChannelMutation,
  AffiliateProfileMutation,
  AffiliateProfilePayload,
  AffiliateProfileRepositoryPort
} from "../src/repositories/affiliate-profile.repository";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-28T09:00:00.000Z");

const permission = (code: string, id: number) => ({
  id,
  name: code,
  code,
  type: code.startsWith("page:") ? "page" : "button",
  module: "affiliate",
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createUser = (id: number, identityType: "scout" | "customer", permissionCodes: string[]) => {
  const permissions = permissionCodes.map(permission);
  const role = {
    id,
    name: `affiliate_profile_${id}`,
    code: `affiliate_profile_${id}`,
    description: "Affiliate profile API test role",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((item, index) => ({
      id: index + 1,
      roleId: id,
      permissionId: item.id,
      deletedAt: null,
      permission: item
    }))
  };
  return {
    id,
    needoId: `u${String(id).padStart(10, "0")}`,
    email: `affiliate-profile-${id}@example.test`,
    phone: null,
    passwordHash: "unused",
    username: `Affiliate ${id}`,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: 100 + id,
        userId: id,
        type: identityType,
        scopeType: "global",
        scopeId: null,
        displayName: `Affiliate ${id}`,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        id,
        userId: id,
        roleId: id,
        scopeType: "global",
        scopeId: null,
        deletedAt: null,
        role
      }
    ]
  };
};

const createProfile = (userId: number): AffiliateProfilePayload => ({
  profileId: 50 + userId,
  needoId: `u${String(userId).padStart(10, "0")}`,
  displayName: `Affiliate ${userId}`,
  avatarUrl: null,
  affiliateStatus: "active",
  cooperationStatus: "available",
  version: 3,
  bio: null,
  strengths: [],
  serviceAreas: [],
  channels: [
    {
      channelId: 71,
      platform: "instagram",
      customLabel: null,
      homepageUrl: "https://instagram.com/needo",
      sortOrder: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ],
  updatedAt: now.toISOString()
});

const createFixture = () => {
  const users = [
    createUser(7, "scout", ["page:affiliate-profile", "button:affiliate-profile-edit"]),
    createUser(8, "scout", ["page:affiliate-profile"]),
    createUser(9, "scout", ["button:affiliate-profile-edit"]),
    createUser(10, "customer", ["page:affiliate-profile", "button:affiliate-profile-edit"])
  ];
  const profiles = new Map(users.map((user) => [user.id, createProfile(user.id)]));

  const repository: jest.Mocked<AffiliateProfileRepositoryPort> = {
    findMine: jest.fn(async (userId) => profiles.get(userId) ?? null),
    updateMine: jest.fn(
      async (userId, expectedVersion, mutation: AffiliateProfileMutation, _auditLog) => {
        void _auditLog;
        const profile = profiles.get(userId);
        if (!profile || profile.version !== expectedVersion) throw new Error("unexpected version");
        const updated = { ...profile, ...mutation, version: profile.version + 1 };
        profiles.set(userId, updated);
        return updated;
      }
    ),
    createChannel: jest.fn(
      async (
        userId,
        expectedVersion,
        mutation: Required<AffiliateProfileChannelMutation>,
        _auditLog
      ) => {
        void _auditLog;
        const profile = profiles.get(userId);
        if (!profile || profile.version !== expectedVersion) throw new Error("unexpected version");
        const updated = {
          ...profile,
          version: profile.version + 1,
          channels: [
            ...profile.channels,
            {
              channelId: 72,
              platform: mutation.platform,
              customLabel: mutation.customLabel,
              homepageUrl: mutation.homepageUrl,
              sortOrder: mutation.sortOrder,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            }
          ]
        };
        profiles.set(userId, updated);
        return updated;
      }
    ),
    updateChannel: jest.fn(async (userId, channelId, expectedVersion, mutation, _auditLog) => {
      void _auditLog;
      const profile = profiles.get(userId);
      if (!profile || profile.version !== expectedVersion) throw new Error("unexpected version");
      const updated = {
        ...profile,
        version: profile.version + 1,
        channels: profile.channels.map((channel) =>
          channel.channelId === channelId ? { ...channel, ...mutation } : channel
        )
      };
      profiles.set(userId, updated);
      return updated;
    }),
    deleteChannel: jest.fn(async (userId, channelId, expectedVersion, _auditLog) => {
      void _auditLog;
      const profile = profiles.get(userId);
      if (!profile || profile.version !== expectedVersion) throw new Error("unexpected version");
      const updated = {
        ...profile,
        version: profile.version + 1,
        channels: profile.channels.filter((channel) => channel.channelId !== channelId)
      };
      profiles.set(userId, updated);
      return updated;
    })
  };

  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    affiliateProfileRepository: repository
  } as never);
  const tokens = Object.fromEntries(
    users.map((user) => [
      user.id,
      new AuthTokenService(env).issueAccessToken({
        id: user.id,
        email: user.email,
        currentIdentityId: user.identities[0].id
      }).token
    ])
  ) as Record<number, string>;

  return { app, profiles, repository, tokens };
};

describe("affiliate profile HTTP API", () => {
  it("reads and mutates only the authenticated affiliate's formal profile", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .get("/api/v1/affiliate/profile")
      .set("Authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 0,
          message: "success",
          data: { needoId: "u0000000007", profileId: 57, version: 3 }
        });
        expect(JSON.stringify(body.data)).not.toContain("userId");
        expect(JSON.stringify(body.data)).not.toContain("identityId");
        expect(JSON.stringify(body.data)).not.toContain("scout");
      });

    await request(fixture.app)
      .patch("/api/v1/affiliate/profile")
      .set("Authorization", authorization)
      .send({
        expectedVersion: 3,
        bio: "東京の美容サービスを紹介します",
        strengths: ["美容"],
        serviceAreas: ["東京都"],
        cooperationStatus: "selective"
      })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({ version: 4, bio: "東京の美容サービスを紹介します" })
      );

    await request(fixture.app)
      .post("/api/v1/affiliate/profile/channels")
      .set("Authorization", authorization)
      .send({
        expectedProfileVersion: 4,
        platform: "custom",
        customLabel: "Blog",
        homepageUrl: "https://creator.example/profile",
        sortOrder: 2
      })
      .expect(200)
      .expect(({ body }) => expect(body.data).toMatchObject({ version: 5 }));

    await request(fixture.app)
      .patch("/api/v1/affiliate/profile/channels/72")
      .set("Authorization", authorization)
      .send({ expectedProfileVersion: 5, customLabel: "Official Blog", sortOrder: 1 })
      .expect(200)
      .expect(({ body }) => expect(body.data).toMatchObject({ version: 6 }));

    await request(fixture.app)
      .delete("/api/v1/affiliate/profile/channels/72?expected_profile_version=6")
      .set("Authorization", authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({ version: 7, channels: expect.any(Array) })
      );

    expect(fixture.repository.updateMine).toHaveBeenCalledWith(
      7,
      3,
      expect.objectContaining({ bio: "東京の美容サービスを紹介します" }),
      expect.objectContaining({ action: "affiliate_profile.updated" })
    );
    expect(fixture.repository.deleteChannel).toHaveBeenCalledWith(
      7,
      72,
      6,
      expect.objectContaining({ action: "affiliate_profile.channel_deleted" })
    );
  });

  it("enforces authentication, independent read/edit permissions, and affiliate identity", async () => {
    const fixture = createFixture();

    await request(fixture.app).get("/api/v1/affiliate/profile").expect(401);
    await request(fixture.app)
      .patch("/api/v1/affiliate/profile")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send({ expectedVersion: 3, bio: "forbidden" })
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/affiliate/profile")
      .set("Authorization", `Bearer ${fixture.tokens[9]}`)
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/affiliate/profile")
      .set("Authorization", `Bearer ${fixture.tokens[10]}`)
      .expect(403)
      .expect(({ body }) =>
        expect(body).toMatchObject({ message: "error.affiliate_profile.identity_required" })
      );
  });

  it("rejects strict-body violations, stale versions, missing channels, and channel overflow", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .patch("/api/v1/affiliate/profile")
      .set("Authorization", authorization)
      .send({ expectedVersion: 3, bio: "invalid", userId: 999 })
      .expect(400);
    await request(fixture.app)
      .patch("/api/v1/affiliate/profile")
      .set("Authorization", authorization)
      .send({ expectedVersion: 2, bio: "stale" })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ message: "error.affiliate_profile.version_conflict" })
      );
    await request(fixture.app)
      .patch("/api/v1/affiliate/profile/channels/999")
      .set("Authorization", authorization)
      .send({ expectedProfileVersion: 3, sortOrder: 1 })
      .expect(404);

    fixture.profiles.set(7, {
      ...fixture.profiles.get(7)!,
      channels: Array.from({ length: 10 }, (_, index) => ({
        ...fixture.profiles.get(7)!.channels[0],
        channelId: index + 1
      }))
    });
    await request(fixture.app)
      .post("/api/v1/affiliate/profile/channels")
      .set("Authorization", authorization)
      .send({
        expectedProfileVersion: 3,
        platform: "x",
        homepageUrl: "https://x.com/needo",
        sortOrder: 0
      })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ message: "error.affiliate_profile.channel_limit" })
      );
  });
});
