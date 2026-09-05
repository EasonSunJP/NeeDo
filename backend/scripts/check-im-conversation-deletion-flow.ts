import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

type ApiEnvelope<T> = { code: number; data: T; message: string };
type Tokens = { accessToken: string; refreshToken: string };
type Conversation = {
  id: number;
  type: "direct" | "group";
  directPeer?: { userId: number } | null;
  lastMessage?: { id: number } | null;
};
type MessagePage = { list: Array<{ content: string; id: number }>; total: number };

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const seedConfig = getSimulationSeedConfig(process.env);
  const baseUrl = (process.env.IM_ACCEPTANCE_BASE_URL || "http://127.0.0.1:3000/api/v1")
    .replace(/\/$/u, "");
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const startedAt = new Date();
  const marker = `im-delete-acceptance-${startedAt.getTime()}`;
  let actorTokens: Tokens | null = null;
  let peerTokens: Tokens | null = null;
  let actorId: number | null = null;
  let directConversationId: number | null = null;
  let directParticipantSnapshot: Awaited<ReturnType<typeof prisma.conversationParticipant.findUnique>> = null;
  let groupConversationId: number | null = null;
  let acceptancePassed = false;

  const request = async <T>(
    path: string,
    options: { body?: unknown; method?: string; token?: string } = {}
  ): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });
    const envelope = (await response.json()) as ApiEnvelope<T>;
    assert(response.ok && envelope.code === 0, `${options.method || "GET"} ${path}: ${envelope.message}`);
    return envelope.data;
  };

  const login = (loginIdentifier: string) =>
    request<Tokens>("/auth/login", {
      method: "POST",
      body: { loginIdentifier, password: seedConfig.defaultPassword }
    });

  try {
    const actor = await prisma.user.findFirst({
      where: { email: "sim.customer.100@needo.local", deletedAt: null, isActive: true },
      select: { id: true }
    });
    assert(actor, "formal simulation customer is missing");
    actorId = actor.id;
    actorTokens = await login("sim.customer.100@needo.local");
    const me = await request<{ activeIdentityId: number }>("/auth/me", {
      token: actorTokens.accessToken
    });

    const conversations = await request<{ list: Conversation[] }>(
      "/im/conversations?page=1&pageSize=100",
      { token: actorTokens.accessToken }
    );
    const direct = conversations.list.find(
      (conversation) => conversation.type === "direct" && conversation.directPeer && conversation.lastMessage
    );
    assert(direct?.directPeer, "no populated direct conversation is available for acceptance");
    directConversationId = direct.id;
    directParticipantSnapshot = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_identityId: {
          conversationId: direct.id,
          identityId: me.activeIdentityId
        }
      }
    });
    assert(directParticipantSnapshot, "direct conversation participant is missing");
    const directBefore = await request<MessagePage>(
      `/im/conversations/${direct.id}/messages?pageSize=100`,
      { token: actorTokens.accessToken }
    );
    assert(directBefore.total > 0, "direct conversation has no visible history before deletion");

    await request<Conversation>(`/im/conversations/${direct.id}`, {
      method: "DELETE",
      token: actorTokens.accessToken
    });
    const afterDelete = await request<{ list: Conversation[] }>(
      "/im/conversations?page=1&pageSize=100",
      { token: actorTokens.accessToken }
    );
    assert(!afterDelete.list.some((conversation) => conversation.id === direct.id), "deleted direct conversation remains listed");
    const reopenedDirect = await request<Conversation>("/im/conversations", {
      method: "POST",
      token: actorTokens.accessToken,
      body: { type: "direct", participantUserIds: [direct.directPeer.userId] }
    });
    assert(reopenedDirect.id === direct.id, "direct conversation did not reopen the existing pair");
    const directAfter = await request<MessagePage>(
      `/im/conversations/${direct.id}/messages?pageSize=100`,
      { token: actorTokens.accessToken }
    );
    assert(directAfter.total === 0 && directAfter.list.length === 0, "old direct history returned after reopening");

    const contacts = await prisma.contact.findMany({
      where: { ownerIdentityId: me.activeIdentityId, deletedAt: null },
      select: {
        contactUserId: true,
        contactUser: { select: { email: true, isActive: true, deletedAt: true } }
      },
      take: 10
    });
    const peers = contacts.filter(
      (contact) =>
        contact.contactUser.isActive &&
        contact.contactUser.deletedAt === null &&
        contact.contactUser.email.endsWith("@needo.local")
    );
    assert(peers.length >= 2, "two active simulation contacts are required for group acceptance");
    const group = await request<Conversation>("/im/conversations", {
      method: "POST",
      token: actorTokens.accessToken,
      body: {
        type: "group",
        title: marker,
        participantUserIds: [peers[0]!.contactUserId, peers[1]!.contactUserId]
      }
    });
    groupConversationId = group.id;
    await request(`/im/conversations/${group.id}/messages`, {
      method: "POST",
      token: actorTokens.accessToken,
      body: { type: "text", content: `${marker}-old` }
    });
    await request<Conversation>(`/im/conversations/${group.id}`, {
      method: "DELETE",
      token: actorTokens.accessToken
    });

    peerTokens = await login(peers[0]!.contactUser.email);
    await request(`/im/conversations/${group.id}/messages`, {
      method: "POST",
      token: peerTokens.accessToken,
      body: { type: "text", content: `${marker}-new` }
    });
    const groupAfter = await request<MessagePage>(
      `/im/conversations/${group.id}/messages?pageSize=100`,
      { token: actorTokens.accessToken }
    );
    assert(groupAfter.total === 1, "reopened group did not expose exactly the new history");
    assert(groupAfter.list[0]?.content === `${marker}-new`, "old group history returned after reopening");

    acceptancePassed = true;
  } finally {
    if (groupConversationId !== null) {
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({
          where: {
            action: "im.conversation.deleted_for_user",
            targetType: "Conversation",
            targetId: groupConversationId,
            createdAt: { gte: startedAt }
          }
        });
        await tx.message.deleteMany({ where: { conversationId: groupConversationId } });
        await tx.conversationParticipant.deleteMany({ where: { conversationId: groupConversationId } });
        await tx.conversation.deleteMany({ where: { id: groupConversationId } });
      });
      const [conversationCount, participantCount, messageCount, auditCount] = await Promise.all([
        prisma.conversation.count({ where: { id: groupConversationId } }),
        prisma.conversationParticipant.count({ where: { conversationId: groupConversationId } }),
        prisma.message.count({ where: { conversationId: groupConversationId } }),
        prisma.auditLog.count({
          where: {
            action: "im.conversation.deleted_for_user",
            targetType: "Conversation",
            targetId: groupConversationId,
            createdAt: { gte: startedAt }
          }
        })
      ]);
      assert(
        conversationCount + participantCount + messageCount + auditCount === 0,
        "temporary group acceptance data was not fully removed"
      );
    }
    if (directConversationId !== null && directParticipantSnapshot) {
      await prisma.$transaction([
        prisma.conversationParticipant.update({
          where: { id: directParticipantSnapshot.id },
          data: {
            unreadCount: directParticipantSnapshot.unreadCount,
            isPinned: directParticipantSnapshot.isPinned,
            isMuted: directParticipantSnapshot.isMuted,
            autoTranslateMessages: directParticipantSnapshot.autoTranslateMessages,
            hiddenAt: directParticipantSnapshot.hiddenAt,
            clearedThroughMessageId: directParticipantSnapshot.clearedThroughMessageId,
            lastReadMessageId: directParticipantSnapshot.lastReadMessageId,
            lastReadAt: directParticipantSnapshot.lastReadAt,
            updatedAt: directParticipantSnapshot.updatedAt
          }
        }),
        prisma.auditLog.deleteMany({
          where: {
            actorId,
            action: "im.conversation.deleted_for_user",
            targetType: "Conversation",
            targetId: directConversationId,
            createdAt: { gte: startedAt }
          }
        })
      ]);
      const restored = await prisma.conversationParticipant.findUnique({
        where: { id: directParticipantSnapshot.id }
      });
      const sameDate = (left: Date | null, right: Date | null) =>
        left?.getTime() === right?.getTime();
      assert(
        restored !== null &&
          restored.unreadCount === directParticipantSnapshot.unreadCount &&
          restored.isPinned === directParticipantSnapshot.isPinned &&
          restored.isMuted === directParticipantSnapshot.isMuted &&
          restored.autoTranslateMessages === directParticipantSnapshot.autoTranslateMessages &&
          restored.clearedThroughMessageId === directParticipantSnapshot.clearedThroughMessageId &&
          restored.lastReadMessageId === directParticipantSnapshot.lastReadMessageId &&
          sameDate(restored.hiddenAt, directParticipantSnapshot.hiddenAt) &&
          sameDate(restored.lastReadAt, directParticipantSnapshot.lastReadAt) &&
          sameDate(restored.updatedAt, directParticipantSnapshot.updatedAt),
        "direct conversation participant state was not restored"
      );
      const residualAuditCount = await prisma.auditLog.count({
        where: {
          actorId,
          action: "im.conversation.deleted_for_user",
          targetType: "Conversation",
          targetId: directConversationId,
          createdAt: { gte: startedAt }
        }
      });
      assert(residualAuditCount === 0, "direct conversation acceptance audit was not removed");
    }
    const logout = async (tokens: Tokens | null) => {
      if (!tokens) return;
      try {
        await request("/auth/logout", {
          method: "POST",
          token: tokens.accessToken,
          body: { refreshToken: tokens.refreshToken }
        });
      } catch {
        // Cleanup should continue even if a short-lived acceptance token already expired.
      }
    };
    await Promise.all([logout(actorTokens), logout(peerTokens)]);
    if (acceptancePassed) {
      console.log(
        "IM conversation deletion acceptance passed: direct history cleared; group reopened with new history only; fixture state restored."
      );
    }
    await disconnectPrisma();
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
