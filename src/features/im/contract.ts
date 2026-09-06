import type {
  ContactRelation,
  Conversation,
  ConversationMember,
  ConversationMessage,
  CreateConversationPrivacyOptions,
  DirectoryProfile,
  FriendRequest,
  ImBootstrapPayload,
  ImContactCardCandidate,
  ImDatabase,
  ImMessageType,
  MessageExt,
  TagMessageCampaignEstimate,
  TagMessageCampaignInput,
  TagMessageCampaignResult,
  UpdateConversationGroupInfoOptions,
  UpdateConversationPrivacyOptions,
} from "./model";
import type { ImChatRecordCommand, ImChatRecordFavorite, ImChatRecordFavoritePage, ImChatRecordItemPage, ImChatRecordMedia, ImChatRecordSummary, ImMessageTranslationResult } from "./chat-records";

export type ImApi = {
  bootstrap(): Promise<ImBootstrapPayload>;
  listContacts(): Promise<{ contacts: ContactRelation[]; users: ImDatabase["users"] }>;
  searchDirectory(query: string): Promise<{ users: ImDatabase["users"] }>;
  getDirectoryProfile(userId: string): Promise<DirectoryProfile>;
  sendFriendRequest(targetUserId: string, message?: string): Promise<{ friendRequest: FriendRequest; created: boolean }>;
  getContact(contactId: string): Promise<{ contact: ContactRelation; user?: ImDatabase["users"][number] }>;
  updateRemark(contactId: string, remarkName: string): Promise<{ contact: ContactRelation }>;
  updateContactTags(contactId: string, tags: string[]): Promise<{ contact: ContactRelation }>;
  blockContact(contactId: string): Promise<{ contact: ContactRelation }>;
  unblockContact(contactId: string): Promise<{ contact: ContactRelation }>;
  deleteContact(contactId: string): Promise<{
    contactId: string;
    counterpartUserId: string;
    deletedConversationId?: string;
  }>;
  listFriendRequests(): Promise<{ friendRequests: FriendRequest[]; users: ImDatabase["users"] }>;
  acceptFriendRequest(requestId: string): Promise<{ request: FriendRequest; contact?: ContactRelation }>;
  rejectFriendRequest(requestId: string): Promise<{ friendRequest: FriendRequest }>;
  listConversations(): Promise<{ conversations: Conversation[]; users: ImDatabase["users"] }>;
  getConversation(conversationId: string): Promise<{
    conversation: Conversation;
    members: ImDatabase["members"];
    users: ImDatabase["users"];
  }>;
  listMessages(conversationId: string, cursor?: string | null, limit?: number): Promise<{
    messages: ConversationMessage[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
  listContactCardCandidates(
    conversationId: string,
    query?: { page?: number; pageSize?: number; query?: string },
  ): Promise<{
    list: ImContactCardCandidate[];
    total: number;
    page: number;
    page_size: number;
  }>;
  sendContactCard(
    conversationId: string,
    targetUserId: string,
    idempotencyKey: string,
  ): Promise<{ message: ConversationMessage; replayed: boolean }>;
  createConversation(
    memberIds: string[],
    title?: string,
    privacyOptions?: CreateConversationPrivacyOptions,
  ): Promise<{ conversation: Conversation }>;
  updateConversationPrivacy(
    conversationId: string,
    privacyOptions: UpdateConversationPrivacyOptions,
  ): Promise<{ conversation: Conversation }>;
  updateConversationGroupInfo(
    conversationId: string,
    groupInfoOptions: UpdateConversationGroupInfoOptions,
  ): Promise<{ conversation: Conversation; members: ConversationMember[] }>;
  updateConversationTags(conversationId: string, tags: string[]): Promise<{ conversation: Conversation }>;
  addConversationMembers(conversationId: string, userIds: string[]): Promise<{ conversation: Conversation }>;
  removeConversationMember(
    conversationId: string,
    userId: string,
    transferOwnerUserId?: string,
  ): Promise<{ conversation?: Conversation; conversationId: string; removedUserId: string; dissolved: boolean }>;
  dissolveConversation(
    conversationId: string,
  ): Promise<{ conversationId: string; dissolved: true }>;
  pinConversation(conversationId: string, isPinned: boolean): Promise<{ conversation: Conversation }>;
  muteConversation(conversationId: string, isMuted: boolean): Promise<{ conversation: Conversation }>;
  setConversationAutoTranslateMessages(
    conversationId: string,
    enabled: boolean,
  ): Promise<{ conversation: Conversation }>;
  markConversationRead(conversationId: string, markUnread?: boolean): Promise<{ conversation: Conversation }>;
  deleteConversation(conversationId: string): Promise<{ conversation: Conversation }>;
  clearConversation(conversationId: string): Promise<{ conversation: Conversation }>;
  deleteMessage(
    conversationId: string,
    messageId: string,
  ): Promise<{ conversationId: string; messageId: string; deleted: true }>;
  batchDeleteMessages(conversationId: string, input: { idempotencyKey: string; messageIds: string[] }): Promise<{ conversationId: string; messageIds: string[]; count: number; deleted: true; replayed: boolean }>;
  translateMessages(conversationId: string, input: { messageIds: string[]; targetLanguage: "zh" | "zh-Hant" | "ja" | "en" | "ko" }): Promise<ImMessageTranslationResult[]>;
  createChatRecordDelivery(targetConversationId: string, command: ImChatRecordCommand): Promise<{ replayed: boolean; bundle: ImChatRecordSummary; message: ConversationMessage }>;
  getChatRecord(publicId: string): Promise<ImChatRecordSummary>;
  listChatRecordItems(publicId: string, query?: { beforePosition?: number; pageSize?: number }): Promise<ImChatRecordItemPage>;
  getChatRecordMedia(publicId: string, checksumSha256: string): Promise<ImChatRecordMedia>;
  createChatRecordFavorite(command: ImChatRecordCommand): Promise<{ replayed: boolean; favorite: ImChatRecordFavorite }>;
  listChatRecordFavorites(query?: { page?: number; pageSize?: number }): Promise<ImChatRecordFavoritePage>;
  removeChatRecordFavorite(favoriteId: string): Promise<{ deleted: true }>;
  sendMessage(
    type: ImMessageType,
    payload: { conversationId: string; content: string; quotedMessageId?: string; ext?: MessageExt },
  ): Promise<{ conversation?: Conversation; message: ConversationMessage }>;
  sendVoiceMessage(
    conversationId: string,
    voice: Blob,
    metadata: { durationSeconds: number; fileName: string },
  ): Promise<{ message: ConversationMessage }>;
  setMessageReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    reacted: boolean,
  ): Promise<{ message: ConversationMessage }>;
  estimateTagMessageCampaign(input: TagMessageCampaignInput): Promise<TagMessageCampaignEstimate>;
  sendTagMessageCampaign(input: TagMessageCampaignInput): Promise<TagMessageCampaignResult>;
  recallMessage(
    conversationId: string,
    messageId: string,
    mode: "standard",
  ): Promise<{
    conversationId: string;
    messageId: string;
    message: ConversationMessage;
    mode: "standard" | "traceless";
  }>;
  resendMessage(messageId: string): Promise<{ conversation: Conversation; message: ConversationMessage }>;
  forwardMessage(messageId: string, conversationId: string): Promise<{
    conversation: Conversation;
    message: ConversationMessage;
  }>;
  uploadImage(conversationId: string, file: File): Promise<{
    fileName: string;
    fileSize: number;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    url: string;
  }>;
};
