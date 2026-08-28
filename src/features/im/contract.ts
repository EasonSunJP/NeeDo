import type {
  ContactRelation,
  Conversation,
  ConversationMember,
  ConversationMessage,
  CreateConversationPrivacyOptions,
  FriendRequest,
  ImBootstrapPayload,
  ImDatabase,
  ImMessageType,
  MessageExt,
  TagMessageCampaignEstimate,
  TagMessageCampaignInput,
  TagMessageCampaignResult,
  UpdateConversationGroupInfoOptions,
  UpdateConversationPrivacyOptions,
} from "./model";

export type ImApi = {
  bootstrap(): Promise<ImBootstrapPayload>;
  listContacts(): Promise<{ contacts: ContactRelation[]; users: ImDatabase["users"] }>;
  addContact(targetUserId: string, source?: string, description?: string): Promise<{ contact: ContactRelation }>;
  getContact(contactId: string): Promise<{ contact: ContactRelation; user?: ImDatabase["users"][number] }>;
  updateRemark(contactId: string, remarkName: string): Promise<{ contact: ContactRelation }>;
  updateContactTags(contactId: string, tags: string[]): Promise<{ contact: ContactRelation }>;
  blockContact(contactId: string): Promise<{ contact: ContactRelation }>;
  unblockContact(contactId: string): Promise<{ contact: ContactRelation }>;
  deleteContact(contactId: string): Promise<{ contact: ContactRelation }>;
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
  removeConversationMember(conversationId: string, userId: string): Promise<{ conversation: Conversation }>;
  pinConversation(conversationId: string, isPinned: boolean): Promise<{ conversation: Conversation }>;
  muteConversation(conversationId: string, isMuted: boolean): Promise<{ conversation: Conversation }>;
  markConversationRead(conversationId: string, markUnread?: boolean): Promise<{ conversation: Conversation }>;
  deleteConversation(conversationId: string): Promise<{ conversation: Conversation }>;
  clearConversation(conversationId: string): Promise<{ conversation: Conversation }>;
  sendMessage(
    type: ImMessageType,
    payload: { conversationId: string; content: string; quotedMessageId?: string; ext?: MessageExt },
  ): Promise<{ conversation: Conversation; message: ConversationMessage }>;
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
    mode: "standard";
  }>;
  resendMessage(messageId: string): Promise<{ conversation: Conversation; message: ConversationMessage }>;
  forwardMessage(messageId: string, conversationId: string): Promise<{
    conversation: Conversation;
    message: ConversationMessage;
  }>;
  search(query: string, conversationId?: string): Promise<{
    contacts: ContactRelation[];
    conversations: Conversation[];
    messages: ConversationMessage[];
  }>;
  uploadInit(kind: string): Promise<{ uploadId: string; uploadUrl: string; fileUrl: string }>;
  uploadComplete(uploadId: string): Promise<{ success: boolean }>;
};
