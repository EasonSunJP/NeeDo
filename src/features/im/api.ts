import {
  acceptFriendRequestMutation,
  addContactMutation,
  buildBootstrapPayload,
  buildSearchResults,
  clearConversationMutation,
  cloneImDatabase,
  createConversationMutation,
  deleteContactMutation,
  deleteConversationMutation,
  ensureMessageCampaignCollections,
  estimateTagMessageCampaign,
  expireDisappearingMessagesMutation,
  forwardMessageMutation,
  getConversationById,
  getMessagesForConversation,
  getUserById,
  IM_ASSISTANT_CONTACT_ID,
  IM_ASSISTANT_CONVERSATION_ID,
  IM_ASSISTANT_GUIDE_MESSAGE_ID,
  IM_ASSISTANT_USER_ID,
  IM_ASSISTANT_WELCOME_MESSAGE_ID,
  makeSeedImDatabase,
  markConversationReadMutation,
  normalizeDisappearingCountdown,
  paginateMessages,
  recallMessageMutation,
  recomputeConversationSummary,
  rejectFriendRequestMutation,
  resendMessageMutation,
  sendMessageMutation,
  sendTagMessageCampaignMutation,
  setContactBlockedMutation,
  sortConversations,
  toggleConversationMuteMutation,
  toggleConversationPinMutation,
  updateConversationGroupInfoMutation,
  updateConversationPrivacyMutation,
  updateConversationTagsMutation,
  updateContactTagsMutation,
  type ContactRelation,
  type Conversation,
  type ConversationDisappearingCountdown,
  type ConversationDisappearingStartMode,
  type ConversationMember,
  type ConversationMessage,
  type CreateConversationPrivacyOptions,
  type FriendRequest,
  type ImBootstrapPayload,
  type ImDatabase,
  type ImMessageType,
  type ImRoleType,
  type ImRealtimeEvent,
  type ImUser,
  type MessageCampaignImageInput,
  type MessageExt,
  type TagMessageCampaignEstimate,
  type TagMessageCampaignInput,
  type TagMessageCampaignResult,
  type GroupInfoEditPolicy,
  type UpdateConversationGroupInfoOptions,
  type UpdateConversationPrivacyOptions
} from "./model";
import { imageBank } from "../../data/mock";
import { readBrowserStorage, writeBrowserStorage } from "../../lib/browserStorage";
import { syncImDatabaseWithAccountEntities } from "./account-sync";
import { makeScopedImDatabase } from "./seed";

const realtimeEventName = "needo.im.realtime";

let mockInstalled = false;
const databaseCache = new Map<ImRoleType, ImDatabase>();
let originalFetch: typeof window.fetch | null = null;

type AutoReplyPlan = {
  senderId: string;
  messages: string[];
};

function readCampaignImageInput(value: unknown): MessageCampaignImageInput | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const image = value as Partial<MessageCampaignImageInput>;

  if (typeof image.url !== "string" || !image.url) {
    return undefined;
  }

  return {
    url: image.url,
    thumbnailUrl: typeof image.thumbnailUrl === "string" && image.thumbnailUrl ? image.thumbnailUrl : image.url,
    fileName: typeof image.fileName === "string" && image.fileName ? image.fileName : "campaign-image.jpg",
    fileSize: typeof image.fileSize === "number" && Number.isFinite(image.fileSize) ? image.fileSize : 0,
    mimeType: typeof image.mimeType === "string" && image.mimeType ? image.mimeType : "image/jpeg",
    width: typeof image.width === "number" && Number.isFinite(image.width) ? image.width : undefined,
    height: typeof image.height === "number" && Number.isFinite(image.height) ? image.height : undefined
  };
}

type ReplyIntent =
  | "capability"
  | "greeting"
  | "thanks"
  | "choice"
  | "schedule"
  | "price"
  | "location"
  | "delay"
  | "cancel"
  | "casual"
  | "confirm"
  | "question"
  | "fallback";

type AssistantSeedBundle = {
  user: ImUser;
  contact: ContactRelation;
  conversation: Conversation;
  members: ConversationMember[];
  messages: ConversationMessage[];
};

const seededUserDatabase = makeSeedImDatabase();
const seededNonOwnerTestGroupId = "conversation-non-owner-test";
const seededDirectConversations = seededUserDatabase.conversations.filter(
  (conversation) => conversation.type !== "group" || conversation.id === seededNonOwnerTestGroupId
);
const seededDirectConversationIds = new Set(seededDirectConversations.map((conversation) => conversation.id));

const seededAssistantBundle = (() => {
  const seeded = seededUserDatabase;
  const user = getUserById(seeded, IM_ASSISTANT_USER_ID);
  const contact = seeded.contacts.find((item) => item.id === IM_ASSISTANT_CONTACT_ID);
  const conversation = getConversationById(seeded, IM_ASSISTANT_CONVERSATION_ID);
  const members = seeded.members.filter((item) => item.conversationId === IM_ASSISTANT_CONVERSATION_ID);
  const messages = getMessagesForConversation(seeded, IM_ASSISTANT_CONVERSATION_ID).filter((message) =>
    message.id === IM_ASSISTANT_WELCOME_MESSAGE_ID || message.id === IM_ASSISTANT_GUIDE_MESSAGE_ID
  );

  if (!user || !contact || !conversation || members.length === 0 || messages.length === 0) {
    return null;
  }

  return {
    user,
    contact,
    conversation,
    members,
    messages
  } satisfies AssistantSeedBundle;
})();

function getWindow() {
  return typeof window === "undefined" ? undefined : window;
}

function getImStorageKey(scope: ImRoleType) {
  return `needo.im.mock-database.v3.${scope}`;
}

function getRealtimeEventName(scope: ImRoleType) {
  return `${realtimeEventName}.${scope}`;
}

function resolveScope(value: string | null | undefined): ImRoleType {
  if (value === "merchant" || value === "technician") {
    return value;
  }

  return "user";
}

function loadDatabase(scope: ImRoleType) {
  const cached = databaseCache.get(scope);

  if (cached) {
    const prepared = prepareLoadedImDatabase(scope, cached);

    if (prepared.changed) {
      persistDatabase(scope, prepared.database);
    }

    return prepared.database;
  }

  const browserWindow = getWindow();

  if (!browserWindow) {
    const seeded = makeScopedImDatabase(scope);
    const prepared = prepareLoadedImDatabase(scope, seeded);
    databaseCache.set(scope, prepared.database);
    return prepared.database;
  }

  try {
    const raw = readBrowserStorage(getImStorageKey(scope), { silent: true });

    if (!raw) {
      const seeded = makeScopedImDatabase(scope);
      const prepared = prepareLoadedImDatabase(scope, seeded);
      databaseCache.set(scope, prepared.database);
      writeBrowserStorage(getImStorageKey(scope), JSON.stringify(prepared.database), { silent: true });
      return prepared.database;
    }

    const parsed = JSON.parse(raw) as ImDatabase;
    const prepared = prepareLoadedImDatabase(scope, parsed);
    databaseCache.set(scope, prepared.database);

    if (prepared.changed) {
      writeBrowserStorage(getImStorageKey(scope), JSON.stringify(prepared.database), { silent: true });
    }

    return prepared.database;
  } catch {
    const seeded = makeScopedImDatabase(scope);
    const prepared = prepareLoadedImDatabase(scope, seeded);
    databaseCache.set(scope, prepared.database);
    return prepared.database;
  }
}

function persistDatabase(scope: ImRoleType, database: ImDatabase) {
  databaseCache.set(scope, database);
  const browserWindow = getWindow();

  if (!browserWindow) {
    return;
  }

  writeBrowserStorage(getImStorageKey(scope), JSON.stringify(database), { silent: true });
}

function emitRealtime(scope: ImRoleType, event: ImRealtimeEvent) {
  const browserWindow = getWindow();

  if (!browserWindow) {
    return;
  }

  browserWindow.dispatchEvent(new CustomEvent(getRealtimeEventName(scope), { detail: event }));
}

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function notFound(message = "Not found") {
  return responseJson({ message }, 404);
}

function badRequest(message = "Bad request") {
  return responseJson({ message }, 400);
}

async function parseBody(init?: RequestInit) {
  if (!init?.body) {
    return {};
  }

  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (init.body instanceof FormData) {
    return Object.fromEntries(init.body.entries());
  }

  return {};
}

function updateConversationAndEmit(scope: ImRoleType, database: ImDatabase, conversation: Conversation | undefined) {
  if (!conversation) {
    persistDatabase(scope, database);
    return;
  }

  persistDatabase(scope, database);
  emitRealtime(scope, {
    type: "conversation.updated",
    payload: { conversation }
  });
  emitRealtime(scope, {
    type: "unread.updated",
    payload: { conversationId: conversation.id, unreadCount: conversation.unreadCount }
  });
}

function persistExpiringMessages(scope: ImRoleType, database: ImDatabase, conversationId?: string) {
  const result = expireDisappearingMessagesMutation(database, conversationId);

  if (result.changed) {
    persistDatabase(scope, database);
  }

  return result;
}

function mergeUniqueStrings(...valueLists: Array<string[] | undefined>) {
  return Array.from(new Set(valueLists.flat().filter((value): value is string => Boolean(value))));
}

function prepareLoadedImDatabase(scope: ImRoleType, database: ImDatabase): { database: ImDatabase; changed: boolean } {
  const upgraded = upgradeLoadedImDatabase(scope, database);
  const synced = syncImDatabaseWithAccountEntities(scope, upgraded.database);
  const campaignCollectionsChanged = ensureMessageCampaignCollections(synced.database);

  return {
    database: synced.database,
    changed: upgraded.changed || synced.changed || campaignCollectionsChanged
  };
}

function pickVariant<T>(seed: string, options: T[]) {
  if (options.length === 0) {
    throw new Error("pickVariant requires at least one option");
  }

  let total = 0;

  for (let index = 0; index < seed.length; index += 1) {
    total = (total + seed.charCodeAt(index) * (index + 1)) >>> 0;
  }

  return options[total % options.length] ?? options[0];
}

function extractTimeReference(text: string) {
  return text.match(/(今天|明天|后天|今晚|今早|今下午|明早|明晚|下周[一二三四五六日天]?|这周[一二三四五六日天]?|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}\s*(?:[:：点]\s*\d{0,2})?)/)?.[0];
}

function detectReplyIntent(text: string): ReplyIntent {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();

  if (/(测试|联调|机器人|bot|陪聊|你是谁|你会什么|能做什么|会回什么)/i.test(trimmed)) {
    return "capability";
  }

  if (/(谢谢|辛苦了|麻烦了|thanks|thank you)/i.test(normalized)) {
    return "thanks";
  }

  if (/(第二个|后者|前面那个|后面那个|就这个|这个吧|那个吧)/i.test(trimmed)) {
    return "choice";
  }

  if (/(改期|改到|改成|时间|几点|档期|预约|预定|下周|这周|今天|明天|后天|今晚|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}\s*(?:[:：点]\s*\d{0,2})?)/i.test(trimmed)) {
    return "schedule";
  }

  if (/(多少钱|价格|报价|费用|预算|优惠|折扣|套餐|贵不贵)/i.test(trimmed)) {
    return "price";
  }

  if (/(地址|位置|在哪|怎么走|导航|到店|定位)/i.test(trimmed)) {
    return "location";
  }

  if (/(晚点|迟到|堵车|赶不上|会晚|要晚)/i.test(trimmed)) {
    return "delay";
  }

  if (/(取消|退款|退单|不去了|算了|改天)/i.test(trimmed)) {
    return "cancel";
  }

  if (/^(在吗|在不|你好|哈喽|hello|hi|嗨|嘿|早上好|晚上好|午安|早呀)/i.test(trimmed)) {
    return "greeting";
  }

  if (/(哈哈|hh|lol|笑死|周末|吃饭|天气|好累|好困|忙疯|最近)/i.test(trimmed)) {
    return "casual";
  }

  if (trimmed.length <= 18 && /^(好|好的|行|可以|ok|收到|那就|就这样|嗯|嗯嗯|没问题)/i.test(trimmed)) {
    return "confirm";
  }

  if (/[?？]$/.test(trimmed) || /(吗|呢|么)$/.test(trimmed)) {
    return "question";
  }

  return "fallback";
}

function buildAssistantAttachmentReply(message: ConversationMessage) {
  const seed = `${message.conversationId}:${message.type}:${message.content}`;

  if (message.type === "image") {
    return pickVariant(seed, [
      "图片我看到了，信息量刚好。你如果想按这张图继续聊风格、预约或确认口吻，我都能顺着接。",
      "这张图我已经接住了。你接下来要是继续发需求、改时间或补一句背景，我会顺着往下聊。"
    ]);
  }

  if (message.type === "voice") {
    return pickVariant(seed, [
      "语音这种我也能接。你要是愿意，再补一句文字重点，我会回得更贴你刚刚那种语气。",
      "语音我先按你已经说明白来接。你可以继续发下一句，我会顺着上下文往下回。"
    ]);
  }

  if (message.type === "file") {
    return pickVariant(seed, [
      "文件我收到了，这种场景我也能继续接。你想让我偏客服式、门店式，还是更像朋友一点的回法？",
      "文件这条链路也没问题。我会先按已收到来接，后面你继续补充一句，我就顺着往下聊。"
    ]);
  }

  if (message.type === "location") {
    return pickVariant(seed, [
      "位置我收到了。后面如果你要继续演到店、迟到或者路线确认，我都能自然往下接。",
      "定位这类消息我也接得住。你下一句如果补时间或门牌，我会继续按这个场景聊。"
    ]);
  }

  return "我收到了，你继续发就行。我会尽量顺着你上一句自然接下去。";
}

function buildAssistantTextReply(message: ConversationMessage) {
  const intent = detectReplyIntent(message.content);
  const timeRef = extractTimeReference(message.content);
  const seed = `${message.conversationId}:${message.sentAt}:${message.content}`;

  if (intent === "capability") {
    return pickVariant(seed, [
      "可以，我现在不会只回固定模板了。我会尽量顺着你上一句继续聊，闲聊、改期、问价、确认都能接。",
      "可以，我现在就是专门给你做聊天联调的。你随便抛一句，我会尽量按真人会话的节奏往下接。"
    ]);
  }

  if (intent === "greeting") {
    return pickVariant(seed, [
      "在的，你继续说。我会顺着上下文往下接，不会只给你模板句。",
      "在，我这边接得住。你随便丢一句具体的，我就继续往下聊。"
    ]);
  }

  if (intent === "thanks") {
    return pickVariant(seed, [
      "没事，你继续发就行。我会跟着你的节奏往下接。",
      "不用客气，我还在。你下一句接着来，我会继续顺着回。"
    ]);
  }

  if (intent === "choice") {
    return pickVariant(seed, [
      "好，我先按你选的这一档继续。要是你还想留一个备选，我也能顺手帮你把话补圆。",
      "行，那我就按你刚选的这个往下接。后面如果想改口径，也可以继续往回调。"
    ]);
  }

  if (intent === "schedule") {
    return timeRef
      ? pickVariant(seed, [
          `可以，我先按 ${timeRef} 这个方向继续。你更想直接定下来，还是先留两个备选？`,
          `好，我先把 ${timeRef} 接住。你要是愿意，我下一句可以继续像真人那样帮你往下确认细节。`
        ])
      : pickVariant(seed, [
          "可以，我先按你说的时间方向继续。你更想锁一个确定时段，还是先对比两个可选时间？",
          "行，时间这条线我能接。你再补一个具体日期或时段，我就能回得更自然。"
        ]);
  }

  if (intent === "price") {
    return pickVariant(seed, [
      "可以，预算这条线我能接。你更在意总价，还是想先看两档不同方案的差别？",
      "价格这种场景也好聊。你给我一个预算范围，我就能继续往下接得更像真人。"
    ]);
  }

  if (intent === "location") {
    return pickVariant(seed, [
      "位置这类我也接得住。你如果继续补到店时间或路线，我就顺着这个场景往下聊。",
      "可以，地址和路线这条线我能继续接。你下一句要是带上时间，我回起来会更自然。"
    ]);
  }

  if (intent === "delay") {
    return pickVariant(seed, [
      "没事，这种情况很常见。你大概会晚多久？我就按这个幅度继续把话接顺。",
      "可以，这种临时晚到的场景我能接。你说个大概时间，我就继续往下帮你圆。"
    ]);
  }

  if (intent === "cancel") {
    return pickVariant(seed, [
      "可以，我先按取消或改期来理解。你更像是想直接取消，还是只是想换到别的时间？",
      "行，这条线我接得住。你告诉我是取消、改天，还是先暂停一下，我就继续往下聊。"
    ]);
  }

  if (intent === "casual") {
    return pickVariant(seed, [
      "哈哈，我接得住这种氛围。你再往下给一句更具体的，我就顺着继续聊。",
      "懂，这句已经有聊天感了。你继续抛下一句，我会把节奏接住。"
    ]);
  }

  if (intent === "confirm") {
    return timeRef
      ? `好，我先按 ${timeRef} 这个方向继续。你如果还想补一句细节，我也能顺着接。`
      : pickVariant(seed, [
          "好，我先按你这句确认继续。你要是还想补个细节，我就顺着往下聊。",
          "行，我接住了。你下一句继续发，我会保持这个语气往下回。"
        ]);
  }

  if (intent === "question") {
    return pickVariant(seed, [
      "可以，你把最想确认的点再说具体一点，我会回得更贴近真人一点。",
      "这类问题我能接。你再给我一点细节，我就继续顺着这个方向往下回。"
    ]);
  }

  return pickVariant(seed, [
    "收到，我懂你的意思了。你要不要再补一句细一点的，我继续顺着聊。",
    "好，我先按这个方向理解。你下一句放具体一点，我就更好接住。"
  ]);
}

function buildServiceReply(message: ConversationMessage, user: ImUser) {
  const intent = detectReplyIntent(message.content);
  const timeRef = extractTimeReference(message.content);
  const seed = `${user.id}:${message.sentAt}:${message.content}`;

  if (intent === "thanks") {
    return pickVariant(seed, ["不客气，这边继续帮你跟进。", "收到，有进展我会继续同步你。"]);
  }

  if (intent === "schedule") {
    return timeRef
      ? pickVariant(seed, [
          `可以，我先按 ${timeRef} 帮你继续确认。方便的话再把订单时间也一起发我。`,
          `收到，我先按 ${timeRef} 往下处理。新的确认结果出来后我会第一时间回你。`
        ])
      : pickVariant(seed, [
          "可以，我先继续帮你确认时间安排。你再发一个更具体的时段，我处理起来会更快。",
          "收到，改期这条线我先记下了。你方便的话再补一个想要的时间段给我。"
        ]);
  }

  if (intent === "cancel") {
    return pickVariant(seed, [
      "可以，我先按取消或退款流程帮你记录。你如果有订单编号，也可以一起发我。",
      "收到，我先把取消诉求记下来。后续需要确认的细节我会继续在这里同步。"
    ]);
  }

  if (intent === "price") {
    return pickVariant(seed, [
      "价格这边我可以继续帮你核。你更在意总价，还是想先看有没有当前活动？",
      "可以，我先按费用问题继续跟进。你如果有目标预算，也可以直接告诉我。"
    ]);
  }

  if (intent === "location") {
    return pickVariant(seed, [
      "位置我收到了，我会按这个地址继续同步。后面有路线或到达问题也可以继续说。",
      "收到，我先把地址信息带进处理里。你如果要改到店地点，也可以一并告诉我。"
    ]);
  }

  if (intent === "delay") {
    return pickVariant(seed, [
      "可以，我先按迟到场景帮你同步。你大概会晚多久，我这边也一起备注上。",
      "收到，我会先帮你说明可能晚到。你方便的话再发一个大概到达时间。"
    ]);
  }

  return pickVariant(seed, [
    "收到，我先帮你记下来，处理进度会继续同步。",
    "这边已经收到，我会沿着这条线继续处理。"
  ]);
}

function buildStoreReply(message: ConversationMessage, user: ImUser) {
  const intent = detectReplyIntent(message.content);
  const timeRef = extractTimeReference(message.content);
  const seed = `${user.id}:${message.sentAt}:${message.content}`;

  if (intent === "thanks") {
    return pickVariant(seed, ["不客气，门店这边继续帮你跟进。", "收到，你有新的想法随时回我就行。"]);
  }

  if (intent === "schedule") {
    return timeRef
      ? pickVariant(seed, [
          `可以，门店这边先按 ${timeRef} 继续看档期。你更想直接锁定，还是先留一个备选？`,
          `收到，我先按 ${timeRef} 往下确认。时段一旦确定，我会立刻告诉你。`
        ])
      : pickVariant(seed, [
          "可以，门店这边先继续帮你看时间。你再给我一个更具体的时段，我会更好安排。",
          "收到，我先按改时间处理。你如果方便，把想去的日期和时间段一起发我。"
        ]);
  }

  if (intent === "price") {
    return pickVariant(seed, [
      "价格这边可以细说。你更想看单次项目，还是套餐会更合适一点？",
      "可以，我这边可以继续给你拆费用。你如果有预算，也可以直接告诉我。"
    ]);
  }

  if (intent === "location") {
    return pickVariant(seed, [
      "地址这边我可以继续发你更详细的到店说明，到了附近找不到也能直接回我。",
      "收到，位置这边我先帮你接住。你如果需要路线建议，也可以继续发我。"
    ]);
  }

  if (intent === "delay") {
    return pickVariant(seed, [
      "没问题，我先帮你备注可能晚到。你大概晚多久，我这边一起同步前台。",
      "收到，如果会晚到的话直接把预计时间发我，门店这边会先帮你留意。"
    ]);
  }

  return pickVariant(seed, [
    "这边收到，我先帮你往下确认。",
    "收到，我继续跟门店这边同步，有结果马上回你。"
  ]);
}

function buildTechnicianReply(message: ConversationMessage, user: ImUser) {
  const intent = detectReplyIntent(message.content);
  const timeRef = extractTimeReference(message.content);
  const seed = `${user.id}:${message.sentAt}:${message.content}`;

  if (intent === "thanks") {
    return pickVariant(seed, ["不客气，你有变动直接和我说就行。", "收到，我这边继续帮你盯着安排。"]);
  }

  if (intent === "schedule") {
    return timeRef
      ? pickVariant(seed, [
          `可以，我先看看 ${timeRef} 怎么排更顺。你更偏向早点还是晚一点？`,
          `收到，我先按 ${timeRef} 继续帮你留意。确认下来后我会直接回你。`
        ])
      : pickVariant(seed, [
          "可以，时间这边我先帮你看。你再给我一个更具体的时段，我就继续往下排。",
          "收到，我先按改时间理解。你如果方便，把想去的日期和大概时段发我。"
        ]);
  }

  if (intent === "price") {
    return pickVariant(seed, [
      "报价这边我能先给你一个范围。你更在意基础项目，还是加项后的总价？",
      "可以，我先按费用这条线继续。你如果有目标预算，也可以直接告诉我。"
    ]);
  }

  if (intent === "delay") {
    return pickVariant(seed, [
      "没事，你大概会晚多久告诉我一下，我这边好顺着调整。",
      "收到，如果会晚到我先帮你把时间留松一点，你回我一个大概到达时间就行。"
    ]);
  }

  return pickVariant(seed, [
    "收到，我先沿着这条线帮你继续看。",
    "可以，我这边接住了，有需要我会继续问你具体细节。"
  ]);
}

function buildFriendReply(message: ConversationMessage, user: ImUser) {
  const intent = detectReplyIntent(message.content);
  const timeRef = extractTimeReference(message.content);
  const seed = `${user.id}:${message.sentAt}:${message.content}`;

  if (intent === "greeting") {
    return pickVariant(seed, ["在呀，你说。", "在，我刚好在线。"]);
  }

  if (intent === "thanks") {
    return pickVariant(seed, ["客气什么，继续说。", "没事呀，你后面想到什么再发我。"]);
  }

  if (intent === "schedule" || intent === "choice") {
    return timeRef
      ? pickVariant(seed, [
          `可以啊，我先按 ${timeRef} 想着。你是想直接定，还是再比一下两个方案？`,
          `行，我先把 ${timeRef} 记住。你要不要顺手再留一个备选？`
        ])
      : pickVariant(seed, [
          "可以呀，我先按这个时间方向想。你更想直接定，还是再看看别的选择？",
          "好啊，我先沿着这个时间继续。你要不要再留一个备选更稳一点？"
        ]);
  }

  if (intent === "casual") {
    return pickVariant(seed, [
      "哈哈我懂，那你继续说，我接着听。",
      "这句很有生活感，我已经跟上了。你下一句继续来。"
    ]);
  }

  if (intent === "price") {
    return pickVariant(seed, [
      "价格我觉得可以先比两档。你现在心里大概想控制在多少？",
      "可以呀，先看预算也行。你更在意便宜一点，还是体验更稳一点？"
    ]);
  }

  return pickVariant(seed, [
    "收到，我大概懂你意思了。你再补一句具体点的，我更好接。",
    "好呀，你继续说，我跟着这个话题往下聊。"
  ]);
}

function buildAttachmentReply(user: ImUser, message: ConversationMessage) {
  if (user.id === IM_ASSISTANT_USER_ID) {
    return buildAssistantAttachmentReply(message);
  }

  const seed = `${user.id}:${message.type}:${message.content}`;

  if (message.type === "image") {
    if (user.profileKind === "store") {
      return pickVariant(seed, [
        "图片收到了，这个风格我先记下。你如果想按这个方向预约，继续把时间发我就行。",
        "这张图我看到了，门店这边会按这个参考理解。你后面想改时间或补要求都可以继续发。"
      ]);
    }

    if (user.profileKind === "technician") {
      return pickVariant(seed, [
        "图片我看到了，参考方向挺清楚的。你如果按这个做，我这边可以提前准备。",
        "收到，这张图的信息已经够用了。你后面想补时间或要求，直接继续发我。"
      ]);
    }

    return pickVariant(seed, [
      "图片收到了，我看懂你想表达的方向了。你接着说，我继续跟。",
      "这张图我接住了，后面你想继续聊安排还是感受都可以。"
    ]);
  }

  if (message.type === "voice") {
    return pickVariant(seed, [
      "语音收到了，我先按你刚说的重点继续接。",
      "这条语音我接住了，你如果方便再补一句文字，我会更好往下回。"
    ]);
  }

  if (message.type === "file") {
    return pickVariant(seed, [
      "文件我收到了，我先按这个内容继续往下处理。",
      "收到，文件这边我先看着。后面如果有新的要求，继续发我就行。"
    ]);
  }

  if (message.type === "location") {
    return pickVariant(seed, [
      "定位收到，我先按这个地点继续往下安排。",
      "位置我拿到了，后面如果时间也确定了，直接继续回我就行。"
    ]);
  }

  return "收到，我继续跟着这条线往下看。";
}

export function buildAutoReplyPlan(scope: ImRoleType, database: ImDatabase, conversation: Conversation): AutoReplyPlan | undefined {
  if (conversation.type !== "single" && conversation.type !== "system") {
    return undefined;
  }

  if (!conversation.contactUserId) {
    return undefined;
  }

  const messages = getMessagesForConversation(database, conversation.id);
  const lastMessage = messages.at(-1);

  if (!lastMessage || lastMessage.senderId !== database.currentUserId || lastMessage.type === "recalled") {
    return undefined;
  }

  const user = getUserById(database, conversation.contactUserId);

  if (!user) {
    return undefined;
  }

  const textReply =
    lastMessage.type === "text" || lastMessage.type === "emoji"
      ? user.id === IM_ASSISTANT_USER_ID
        ? buildAssistantTextReply(lastMessage)
        : user.profileKind === "service"
          ? buildServiceReply(lastMessage, user)
          : user.profileKind === "store"
            ? buildStoreReply(lastMessage, user)
            : user.profileKind === "technician"
              ? buildTechnicianReply(lastMessage, user)
              : buildFriendReply(lastMessage, user)
      : buildAttachmentReply(user, lastMessage);

  return {
    senderId: conversation.contactUserId,
    messages: [textReply]
  };
}

export function upgradeLoadedImDatabase(scope: ImRoleType, database: ImDatabase): { database: ImDatabase; changed: boolean } {
  if (scope !== "user" || !seededAssistantBundle) {
    return { database, changed: false };
  }

  const next = cloneImDatabase(database);
  let changed = false;
  const touchedConversationIds = new Set<string>();
  const insertedConversationIds = new Set<string>();
  const insertedMessageCountByConversation = new Map<string, number>();
  const seedUsersById = new Map(seededUserDatabase.users.map((user) => [user.id, user]));
  const assistantContactSeed = seededUserDatabase.contacts.find((item) => item.id === IM_ASSISTANT_CONTACT_ID);

  const existingAssistantUser = next.users.find((item) => item.id === IM_ASSISTANT_USER_ID);

  if (!existingAssistantUser) {
    next.users.push({ ...seededAssistantBundle.user });
    changed = true;
  } else {
    const nextSearchableFields = mergeUniqueStrings(existingAssistantUser.searchableFields, seededAssistantBundle.user.searchableFields);
    const nextTags = mergeUniqueStrings(existingAssistantUser.tags, seededAssistantBundle.user.tags);

    if (
      existingAssistantUser.nickname !== seededAssistantBundle.user.nickname ||
      existingAssistantUser.avatar !== seededAssistantBundle.user.avatar ||
      existingAssistantUser.region !== seededAssistantBundle.user.region ||
      existingAssistantUser.bio !== seededAssistantBundle.user.bio ||
      existingAssistantUser.signature !== seededAssistantBundle.user.signature ||
      existingAssistantUser.sortKey !== seededAssistantBundle.user.sortKey ||
      existingAssistantUser.source !== seededAssistantBundle.user.source ||
      existingAssistantUser.userIdLabel !== seededAssistantBundle.user.userIdLabel ||
      existingAssistantUser.serviceAccount !== seededAssistantBundle.user.serviceAccount ||
      existingAssistantUser.searchableFields.join("|") !== nextSearchableFields.join("|") ||
      existingAssistantUser.tags.join("|") !== nextTags.join("|")
    ) {
      Object.assign(existingAssistantUser, seededAssistantBundle.user, {
        searchableFields: nextSearchableFields,
        tags: nextTags
      });
      changed = true;
    }
  }

  const existingAssistantContact = next.contacts.find((item) => item.id === IM_ASSISTANT_CONTACT_ID);

  if (!existingAssistantContact && assistantContactSeed) {
    next.contacts.push({ ...assistantContactSeed });
    changed = true;
  } else {
    const nextTags = mergeUniqueStrings(existingAssistantContact?.tags, assistantContactSeed?.tags);
    const nextStarred = Boolean(existingAssistantContact?.isStarred || assistantContactSeed?.isStarred);

    if (
      existingAssistantContact &&
      assistantContactSeed &&
      (existingAssistantContact.targetUserId !== assistantContactSeed.targetUserId ||
        existingAssistantContact.source !== assistantContactSeed.source ||
        existingAssistantContact.description !== assistantContactSeed.description ||
        existingAssistantContact.tags.join("|") !== nextTags.join("|") ||
        existingAssistantContact.isStarred !== nextStarred)
    ) {
      Object.assign(existingAssistantContact, assistantContactSeed, {
        remarkName: existingAssistantContact.remarkName,
        isBlocked: existingAssistantContact.isBlocked,
        isStarred: nextStarred,
        tags: nextTags,
        createdAt: existingAssistantContact.createdAt
      });
      changed = true;
    }
  }

  seededDirectConversations.forEach((seedConversation) => {
    const existingConversation = next.conversations.find((item) => item.id === seedConversation.id);

    if (!existingConversation) {
      next.conversations.push({ ...seedConversation });
      insertedConversationIds.add(seedConversation.id);
      touchedConversationIds.add(seedConversation.id);
      changed = true;
      return;
    }

    if (seedConversation.id !== IM_ASSISTANT_CONVERSATION_ID) {
      return;
    }

    const nextMemberIds = mergeUniqueStrings(existingConversation.memberIds, seedConversation.memberIds);
    const shouldPinAssistant = existingConversation.isPinned || seedConversation.isPinned;

    if (
      existingConversation.title !== seedConversation.title ||
      existingConversation.avatar !== seedConversation.avatar ||
      existingConversation.type !== seedConversation.type ||
      existingConversation.contactUserId !== seedConversation.contactUserId ||
      existingConversation.memberIds.join("|") !== nextMemberIds.join("|") ||
      existingConversation.isPinned !== shouldPinAssistant ||
      existingConversation.isDeleted
    ) {
      Object.assign(existingConversation, seedConversation, {
        memberIds: nextMemberIds,
        isPinned: shouldPinAssistant,
        isMuted: existingConversation.isMuted,
        draftText: existingConversation.draftText,
        draftUpdatedAt: existingConversation.draftUpdatedAt,
        unreadCount: existingConversation.unreadCount,
        lastMessageId: existingConversation.lastMessageId,
        lastMessagePreview: existingConversation.lastMessagePreview,
        lastMessageTime: existingConversation.lastMessageTime,
        updatedAt: existingConversation.updatedAt,
        isDeleted: false
      });
      touchedConversationIds.add(seedConversation.id);
      changed = true;
    }
  });

  seededDirectConversations.forEach((conversation) => {
    conversation.memberIds.forEach((userId) => {
      const seedUser = seedUsersById.get(userId);

      if (!seedUser || next.users.some((item) => item.id === userId)) {
        return;
      }

      next.users.push({ ...seedUser });
      changed = true;
    });
  });

  seededUserDatabase.contacts
    .filter((contact) => !contact.isBlocked)
    .forEach((contact) => {
      if (next.contacts.some((item) => item.id === contact.id || item.targetUserId === contact.targetUserId)) {
        return;
      }

      next.contacts.push({ ...contact });
      changed = true;
    });

  seededUserDatabase.members
    .filter((member) => seededDirectConversationIds.has(member.conversationId))
    .forEach((member) => {
      if (!next.members.some((item) => item.id === member.id || (item.conversationId === member.conversationId && item.userId === member.userId))) {
        next.members.push({ ...member });
        changed = true;
      }
    });

  seededUserDatabase.messages
    .filter(
      (message) =>
        insertedConversationIds.has(message.conversationId) ||
        (message.conversationId === IM_ASSISTANT_CONVERSATION_ID &&
          (message.id === IM_ASSISTANT_WELCOME_MESSAGE_ID || message.id === IM_ASSISTANT_GUIDE_MESSAGE_ID))
    )
    .forEach((message) => {
      if (
        next.messages.some(
          (item) =>
            item.id === message.id ||
            (item.conversationId === message.conversationId &&
              item.senderId === message.senderId &&
              item.type === message.type &&
              item.content === message.content)
        )
      ) {
        return;
      }

      next.messages.push({ ...message });
      touchedConversationIds.add(message.conversationId);
      insertedMessageCountByConversation.set(message.conversationId, (insertedMessageCountByConversation.get(message.conversationId) ?? 0) + 1);
      changed = true;
    });

  if (changed) {
    touchedConversationIds.forEach((conversationId) => {
      const conversation = getConversationById(next, conversationId);

      if (!conversation) {
        return;
      }

      recomputeConversationSummary(next, conversationId);

      const insertedCount = insertedMessageCountByConversation.get(conversationId) ?? 0;

      if (insertedCount > 0 && conversationId === IM_ASSISTANT_CONVERSATION_ID) {
        conversation.unreadCount = Math.max(conversation.unreadCount, insertedCount);
        conversation.isPinned = true;
      }

      if (insertedConversationIds.has(conversationId)) {
        const seedConversation = getConversationById(seededUserDatabase, conversationId);

        if (seedConversation) {
          conversation.unreadCount = seedConversation.unreadCount;
          conversation.isPinned = conversation.isPinned || seedConversation.isPinned;
          conversation.isMuted = conversation.isMuted || seedConversation.isMuted;
        }
      }
    });

    next.conversations = sortConversations(next.conversations);
  }

  return {
    database: changed ? next : database,
    changed
  };
}

function scheduleAutoReply(scope: ImRoleType, conversation: Conversation) {
  const browserWindow = getWindow();
  const database = loadDatabase(scope);
  const replyPlan = buildAutoReplyPlan(scope, database, conversation);

  if (!browserWindow || !replyPlan) {
    return;
  }

  replyPlan.messages.forEach((content, index) => {
    const delayMs = 900 + Math.round(Math.random() * 420) + index * 520 + Math.min(900, content.length * 12);

    browserWindow.setTimeout(() => {
      const latestDatabase = cloneImDatabase(loadDatabase(scope));
      const latestConversation = getConversationById(latestDatabase, conversation.id);

      if (!latestConversation || latestConversation.isDeleted) {
        return;
      }

      const result = sendMessageMutation(latestDatabase, {
        conversationId: conversation.id,
        senderId: replyPlan.senderId,
        type: "text",
        content
      });

      persistDatabase(scope, latestDatabase);
      emitRealtime(scope, {
        type: "message.created",
        payload: {
          conversation: result.conversation,
          message: result.message
        }
      });
      emitRealtime(scope, {
        type: "unread.updated",
        payload: {
          conversationId: result.conversation.id,
          unreadCount: result.conversation.unreadCount
        }
      });
    }, delayMs);
  });
}

function buildUploadResult(kind: string) {
  return {
    uploadId: `${kind}-${Date.now()}`,
    uploadUrl: "https://example.com/upload/mock",
    fileUrl: kind === "image" ? imageBank.cleaningPortrait : imageBank.massageAlt
  };
}

async function handleContactsRequest(scope: ImRoleType, url: URL, method: string, body: Record<string, unknown>) {
  const database = cloneImDatabase(loadDatabase(scope));
  const segments = url.pathname.split("/");
  const contactId = segments[4];
  const action = segments[5];

  if (method === "GET" && !contactId) {
    return responseJson({
      contacts: database.contacts,
      users: database.users
    });
  }

  if (method === "POST" && !contactId) {
    const targetUserId = String(body.targetUserId ?? "");
    const contact = addContactMutation(
      database,
      targetUserId,
      String(body.source ?? "聊天页添加好友"),
      String(body.description ?? "通过聊天页手动添加")
    );

    if (!contact) {
      return notFound("Target user not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, { type: "contact.updated", payload: { contact } });
    return responseJson({ contact }, 201);
  }

  if (method === "GET" && contactId) {
    const contact = database.contacts.find((item) => item.id === contactId);

    if (!contact) {
      return notFound("Contact not found");
    }

    return responseJson({
      contact,
      user: getUserById(database, contact.targetUserId)
    });
  }

  if (method === "PATCH" && contactId && action === "remark") {
    const contact = updateContactRemark(database, contactId, String(body.remarkName ?? ""));

    if (!contact) {
      return notFound("Contact not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, { type: "contact.updated", payload: { contact } });
    return responseJson({ contact });
  }

  if (method === "PATCH" && contactId && action === "tags") {
    const tags = Array.isArray(body.tags) ? body.tags.map((item) => String(item)) : [];
    const contact = updateContactTagsMutation(database, contactId, tags);

    if (!contact) {
      return notFound("Contact not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, { type: "contact.updated", payload: { contact } });
    return responseJson({ contact });
  }

  if (method === "POST" && contactId && action === "block") {
    const contact = setContactBlockedMutation(database, contactId, true);

    if (!contact) {
      return notFound("Contact not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, { type: "contact.updated", payload: { contact } });
    return responseJson({ contact });
  }

  if (method === "DELETE" && contactId && action === "block") {
    const contact = setContactBlockedMutation(database, contactId, false);

    if (!contact) {
      return notFound("Contact not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, { type: "contact.updated", payload: { contact } });
    return responseJson({ contact });
  }

  if (method === "DELETE" && contactId && !action) {
    const contact = deleteContactMutation(database, contactId);

    if (!contact) {
      return notFound("Contact not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, { type: "contact.updated", payload: { contact } });
    return responseJson({ contact });
  }

  return badRequest();
}

function updateContactRemark(database: ImDatabase, contactId: string, remarkName: string) {
  const contact = database.contacts.find((item) => item.id === contactId);

  if (!contact) {
    return undefined;
  }

  contact.remarkName = remarkName.trim() || undefined;
  contact.updatedAt = new Date().toISOString();
  return contact;
}

async function handleFriendRequest(scope: ImRoleType, url: URL, method: string, body: Record<string, unknown>) {
  const database = cloneImDatabase(loadDatabase(scope));
  const segments = url.pathname.split("/");
  const requestId = segments[4];
  const action = segments[5];

  if (method === "GET" && !requestId) {
    return responseJson({
      friendRequests: database.friendRequests,
      users: database.users
    });
  }

  if (method === "POST" && !requestId) {
    const nextRequest: FriendRequest = {
      id: `friend-request-${Date.now()}`,
      fromUserId: String(body.fromUserId ?? ""),
      toUserId: database.currentUserId,
      source: String(body.source ?? "未知来源"),
      requestMessage: String(body.requestMessage ?? "你好，想加你为联系人。"),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    database.friendRequests.unshift(nextRequest);
    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "friend_request.created",
      payload: { friendRequest: nextRequest }
    });
    return responseJson({ friendRequest: nextRequest }, 201);
  }

  if (method === "POST" && requestId && action === "accept") {
    const result = acceptFriendRequestMutation(database, requestId);

    if (!result.request) {
      return notFound("Friend request not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "friend_request.updated",
      payload: { friendRequest: result.request, contact: result.contact }
    });
    return responseJson(result);
  }

  if (method === "POST" && requestId && action === "reject") {
    const request = rejectFriendRequestMutation(database, requestId);

    if (!request) {
      return notFound("Friend request not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "friend_request.updated",
      payload: { friendRequest: request }
    });
    return responseJson({ friendRequest: request });
  }

  return badRequest();
}

function addConversationMembers(database: ImDatabase, conversationId: string, userIds: string[]) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  const nextMemberIds = Array.from(new Set([...conversation.memberIds, ...userIds]));
  conversation.memberIds = nextMemberIds;
  if (conversation.type === "group") {
    conversation.title = nextMemberIds
      .slice(0, 3)
      .map((userId) => getUserById(database, userId)?.nickname ?? "")
      .filter(Boolean)
      .join("、");
  }

  userIds.forEach((userId) => {
    database.members.push({
      id: `member-${Date.now()}-${userId}`,
      conversationId,
      userId,
      role: "member",
      joinedAt: new Date().toISOString()
    });
  });

  return conversation;
}

function removeConversationMember(database: ImDatabase, conversationId: string, userId: string) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  conversation.memberIds = conversation.memberIds.filter((memberId) => memberId !== userId);
  database.members = database.members.filter((member) => !(member.conversationId === conversationId && member.userId === userId));

  if (conversation.type === "group") {
    conversation.title = conversation.memberIds
      .filter((memberId) => memberId !== database.currentUserId)
      .slice(0, 3)
      .map((memberId) => getUserById(database, memberId)?.nickname ?? "")
      .filter(Boolean)
      .join("、") || "新的群聊";
  }

  return conversation;
}

async function handleConversationRequest(scope: ImRoleType, url: URL, method: string, body: Record<string, unknown>) {
  const database = cloneImDatabase(loadDatabase(scope));
  const segments = url.pathname.split("/");
  const conversationId = segments[4];
  const action = segments[5];
  const subAction = segments[6];
  persistExpiringMessages(scope, database, conversationId);

  if (method === "GET" && !conversationId) {
    return responseJson({
      conversations: database.conversations,
      users: database.users
    });
  }

  if (method === "POST" && !conversationId) {
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map((item) => String(item)) : [];
    const title = typeof body.title === "string" ? body.title : undefined;
    const disappearingCountdown = typeof body.disappearingCountdown === "object" && body.disappearingCountdown !== null
      ? body.disappearingCountdown as Partial<ConversationDisappearingCountdown>
      : undefined;
    const disappearingStartMode = body.disappearingStartMode === "read_by_all" ? "read_by_all" as ConversationDisappearingStartMode : "sent";
    const conversation = createConversationMutation(database, memberIds, title, {
      forceGroup: body.forceGroup === true,
      privacyModeEnabled: body.privacyModeEnabled === true,
      disappearingCountdown,
      disappearingStartMode
    });
    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "conversation.updated",
      payload: { conversation }
    });
    return responseJson({ conversation }, 201);
  }

  if (method === "GET" && conversationId && action !== "messages") {
    const conversation = getConversationById(database, conversationId);

    if (!conversation) {
      return notFound("Conversation not found");
    }

    return responseJson({
      conversation,
      members: database.members.filter((member) => member.conversationId === conversationId),
      users: database.users
    });
  }

  if (method === "PATCH" && conversationId && action === "pin") {
    const conversation = toggleConversationPinMutation(database, conversationId, Boolean(body.isPinned));

    if (!conversation) {
      return notFound("Conversation not found");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({ conversation });
  }

  if (method === "PATCH" && conversationId && action === "mute") {
    const conversation = toggleConversationMuteMutation(database, conversationId, Boolean(body.isMuted));

    if (!conversation) {
      return notFound("Conversation not found");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({ conversation });
  }

  if (method === "PATCH" && conversationId && action === "privacy") {
    const targetConversation = getConversationById(database, conversationId);

    if (!targetConversation) {
      return notFound("Conversation not found");
    }

    if (targetConversation.type !== "group") {
      return badRequest("Privacy mode is only available for group conversations");
    }

    const privacyModeEnabled = body.privacyModeEnabled === true;
    const disappearingCountdown = typeof body.disappearingCountdown === "object" && body.disappearingCountdown !== null
      ? body.disappearingCountdown as Partial<ConversationDisappearingCountdown>
      : undefined;
    const disappearingStartMode = body.disappearingStartMode === "read_by_all" ? "read_by_all" as ConversationDisappearingStartMode : "sent";

    if (privacyModeEnabled && !normalizeDisappearingCountdown(disappearingCountdown)) {
      return badRequest("Missing disappearing countdown");
    }

    const conversation = updateConversationPrivacyMutation(database, conversationId, {
      privacyModeEnabled,
      disappearingCountdown,
      disappearingStartMode
    });

    if (!conversation) {
      return badRequest("Unable to update privacy mode");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({ conversation });
  }

  if (method === "PATCH" && conversationId && action === "group-info") {
    const targetConversation = getConversationById(database, conversationId);

    if (!targetConversation) {
      return notFound("Conversation not found");
    }

    if (targetConversation.type !== "group") {
      return badRequest("Group info is only available for group conversations");
    }

    const groupInfoOptions: UpdateConversationGroupInfoOptions = {};

    if (typeof body.title === "string") {
      groupInfoOptions.title = body.title;
    }

    if (typeof body.announcement === "string") {
      groupInfoOptions.announcement = body.announcement;
    }

    if (typeof body.nicknameInGroup === "string") {
      groupInfoOptions.nicknameInGroup = body.nicknameInGroup;
    }

    if (body.titleEditPolicy === "members" || body.titleEditPolicy === "owner") {
      groupInfoOptions.titleEditPolicy = body.titleEditPolicy as GroupInfoEditPolicy;
    }

    if (body.announcementEditPolicy === "members" || body.announcementEditPolicy === "owner") {
      groupInfoOptions.announcementEditPolicy = body.announcementEditPolicy as GroupInfoEditPolicy;
    }

    const conversation = updateConversationGroupInfoMutation(database, conversationId, groupInfoOptions);

    if (!conversation) {
      return badRequest("Unable to update group info");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({
      conversation,
      members: database.members.filter((member) => member.conversationId === conversationId)
    });
  }

  if (method === "PATCH" && conversationId && action === "tags") {
    const tags = Array.isArray(body.tags) ? body.tags.map((item) => String(item)) : [];
    const conversation = updateConversationTagsMutation(database, conversationId, tags);

    if (!conversation) {
      return notFound("Conversation not found");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({ conversation });
  }

  if (method === "PATCH" && conversationId && action === "read") {
    const conversation = markConversationReadMutation(database, conversationId);

    if (!conversation) {
      return notFound("Conversation not found");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({ conversation });
  }

  if (method === "DELETE" && conversationId && !action) {
    const conversation = deleteConversationMutation(database, conversationId);

    if (!conversation) {
      return notFound("Conversation not found");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({ conversation });
  }

  if (method === "POST" && conversationId && action === "clear") {
    const conversation = clearConversationMutation(database, conversationId);

    if (!conversation) {
      return notFound("Conversation not found");
    }

    updateConversationAndEmit(scope, database, conversation);
    return responseJson({ conversation });
  }

  if (method === "GET" && conversationId && action === "messages") {
    const limit = Number(url.searchParams.get("limit") ?? 30);
    const cursor = url.searchParams.get("cursor");
    const messages = getMessagesForConversation(database, conversationId);
    const page = paginateMessages(messages, limit, cursor);
    return responseJson(page);
  }

  if (method === "POST" && conversationId && action === "members") {
    const userIds = Array.isArray(body.userIds) ? body.userIds.map((item) => String(item)) : [];

    if (userIds.length === 0) {
      return badRequest("Missing members");
    }

    const conversation = addConversationMembers(database, conversationId, userIds);

    if (!conversation) {
      return notFound("Conversation not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "conversation.updated",
      payload: { conversation }
    });
    return responseJson({ conversation });
  }

  if (method === "DELETE" && conversationId && action === "members" && subAction) {
    const conversation = removeConversationMember(database, conversationId, subAction);

    if (!conversation) {
      return notFound("Conversation not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "conversation.updated",
      payload: { conversation }
    });
    return responseJson({ conversation });
  }

  return badRequest();
}

async function handleMessagesRequest(scope: ImRoleType, url: URL, method: string, body: Record<string, unknown>) {
  const database = cloneImDatabase(loadDatabase(scope));
  const segments = url.pathname.split("/");
  const action = segments[4];
  const subAction = segments[5];
  const scopedConversationId =
    typeof body.conversationId === "string"
      ? body.conversationId
      : url.searchParams.get("conversationId") ?? undefined;
  persistExpiringMessages(scope, database, scopedConversationId);

  if (method === "GET" && action === "search") {
    const query = url.searchParams.get("q") ?? "";
    const conversationId = url.searchParams.get("conversationId") ?? undefined;
    return responseJson(buildSearchResults(database, query, conversationId));
  }

  if (method === "POST" && action === "search") {
    const query = String(body.query ?? "");
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
    return responseJson(buildSearchResults(database, query, conversationId));
  }

  if (method === "POST" && action === "campaigns" && subAction === "estimate") {
    const input: TagMessageCampaignInput = {
      tagIds: Array.isArray(body.tagIds) ? body.tagIds.map((item) => String(item)) : [],
      targetUserIds: Array.isArray(body.targetUserIds) ? body.targetUserIds.map((item) => String(item)) : [],
      content: typeof body.content === "string" ? body.content : undefined,
      messageType: typeof body.messageType === "string" ? body.messageType as TagMessageCampaignInput["messageType"] : undefined,
      image: readCampaignImageInput(body.image)
    };

    return responseJson(estimateTagMessageCampaign(database, input));
  }

  if (method === "POST" && action === "campaigns" && !subAction) {
    const input: TagMessageCampaignInput = {
      tagIds: Array.isArray(body.tagIds) ? body.tagIds.map((item) => String(item)) : [],
      targetUserIds: Array.isArray(body.targetUserIds) ? body.targetUserIds.map((item) => String(item)) : [],
      content: typeof body.content === "string" ? body.content : "",
      messageType: typeof body.messageType === "string" ? body.messageType as TagMessageCampaignInput["messageType"] : undefined,
      image: readCampaignImageInput(body.image)
    };

    try {
      const result = sendTagMessageCampaignMutation(database, input);
      persistDatabase(scope, database);
      result.deliveries.forEach(({ conversation, message }) => {
        emitRealtime(scope, {
          type: "message.created",
          payload: {
            conversation,
            message
          }
        });
      });
      return responseJson(result, 201);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Campaign send failed");
    }
  }

  if (method === "POST" && ["text", "image", "voice", "video", "file", "location", "contact-card"].includes(action ?? "")) {
    const type = action as ImMessageType;
    const conversationId = String(body.conversationId ?? "");

    if (!conversationId) {
      return badRequest("Missing conversation id");
    }

    if (getWindow()?.navigator && getWindow()?.navigator.onLine === false) {
      return responseJson({ message: "Network offline" }, 503);
    }

    const content = String(body.content ?? "");
    const quotedMessageId = typeof body.quotedMessageId === "string" ? body.quotedMessageId : undefined;
    const ext = (body.ext ?? undefined) as MessageExt | undefined;
    const result = sendMessageMutation(database, {
      conversationId,
      senderId: database.currentUserId,
      type,
      content,
      quotedMessageId,
      ext
    });

    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "message.created",
      payload: {
        conversation: result.conversation,
        message: result.message
      }
    });
    scheduleAutoReply(scope, result.conversation);

    return responseJson(result, 201);
  }

  if (method === "POST" && action && subAction === "recall") {
    const result = recallMessageMutation(database, action);

    if (!result) {
      return notFound("Message not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "message.recalled",
      payload: result
    });
    return responseJson(result);
  }

  if (method === "POST" && action && subAction === "resend") {
    const result = resendMessageMutation(database, action);

    if (!result) {
      return notFound("Message not found");
    }

    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "message.updated",
      payload: result
    });
    return responseJson(result);
  }

  if (method === "POST" && action === "forward") {
    const sourceMessageId = String(body.messageId ?? "");
    const conversationId = String(body.conversationId ?? "");

    if (!sourceMessageId || !conversationId) {
      return badRequest("Missing source or target");
    }

    const result = forwardMessageMutation(database, sourceMessageId, conversationId);
    persistDatabase(scope, database);
    emitRealtime(scope, {
      type: "message.created",
      payload: {
        conversation: result.conversation,
        message: result.message
      }
    });
    return responseJson(result, 201);
  }

  return badRequest();
}

async function handleSearchRequest(scope: ImRoleType, url: URL) {
  const database = cloneImDatabase(loadDatabase(scope));
  const query = url.searchParams.get("q") ?? "";
  const conversationId = url.searchParams.get("conversationId") ?? undefined;
  return responseJson(buildSearchResults(database, query, conversationId));
}

async function handleImRequest(url: URL, method: string, init?: RequestInit) {
  const body = await parseBody(init);
  const scope = resolveScope(url.searchParams.get("scope"));

  if (url.pathname === "/api/im/bootstrap" && method === "GET") {
    return responseJson(buildBootstrapPayload(cloneImDatabase(loadDatabase(scope))));
  }

  if (url.pathname.startsWith("/api/im/contacts")) {
    return handleContactsRequest(scope, url, method, body);
  }

  if (url.pathname.startsWith("/api/im/friend-requests")) {
    return handleFriendRequest(scope, url, method, body);
  }

  if (url.pathname.startsWith("/api/im/conversations")) {
    return handleConversationRequest(scope, url, method, body);
  }

  if (url.pathname.startsWith("/api/im/messages")) {
    return handleMessagesRequest(scope, url, method, body);
  }

  if (url.pathname === "/api/im/search" && method === "GET") {
    return handleSearchRequest(scope, url);
  }

  if (url.pathname === "/api/im/upload/init" && method === "POST") {
    return responseJson(buildUploadResult(String(body.kind ?? "file")));
  }

  if (url.pathname === "/api/im/upload/complete" && method === "POST") {
    return responseJson({ success: true });
  }

  return notFound();
}

export function installImMockServer() {
  const browserWindow = getWindow();

  if (!browserWindow || mockInstalled) {
    return;
  }

  mockInstalled = true;
  originalFetch = browserWindow.fetch.bind(browserWindow);

  browserWindow.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, browserWindow.location.origin);

    if (!url.pathname.startsWith("/api/im")) {
      return originalFetch ? originalFetch(input, init) : fetch(input, init);
    }

    const method = (init?.method ?? (typeof input === "string" || input instanceof URL ? "GET" : input.method) ?? "GET").toUpperCase();
    return handleImRequest(url, method, init);
  }) as typeof window.fetch;
}

export function subscribeImRealtime(scope: ImRoleType, listener: (event: ImRealtimeEvent) => void) {
  const browserWindow = getWindow();

  if (!browserWindow) {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ImRealtimeEvent>;
    listener(customEvent.detail);
  };

  const eventName = getRealtimeEventName(scope);
  browserWindow.addEventListener(eventName, handler as EventListener);
  return () => browserWindow.removeEventListener(eventName, handler as EventListener);
}

async function requestIm<T>(scope: ImRoleType, path: string, init?: RequestInit): Promise<T> {
  installImMockServer();
  const url = new URL(path, "http://localhost");
  url.searchParams.set("scope", scope);

  const response = await fetch(`${url.pathname}${url.search}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(String(error.message ?? "Request failed"));
  }

  return (await response.json()) as T;
}

export function createImApi(scope: ImRoleType) {
  return {
  bootstrap() {
      return requestIm<ImBootstrapPayload>(scope, "/api/im/bootstrap");
  },
  listContacts() {
      return requestIm<{ contacts: ContactRelation[]; users: ImDatabase["users"] }>(scope, "/api/im/contacts");
  },
  addContact(targetUserId: string, source?: string, description?: string) {
      return requestIm<{ contact: ContactRelation }>(scope, "/api/im/contacts", {
      method: "POST",
      body: JSON.stringify({ targetUserId, source, description })
    });
  },
  getContact(contactId: string) {
      return requestIm<{ contact: ContactRelation; user?: ImDatabase["users"][number] }>(scope, `/api/im/contacts/${contactId}`);
  },
  updateRemark(contactId: string, remarkName: string) {
      return requestIm<{ contact: ContactRelation }>(scope, `/api/im/contacts/${contactId}/remark`, {
      method: "PATCH",
      body: JSON.stringify({ remarkName })
    });
  },
  updateContactTags(contactId: string, tags: string[]) {
      return requestIm<{ contact: ContactRelation }>(scope, `/api/im/contacts/${contactId}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tags })
    });
  },
  blockContact(contactId: string) {
      return requestIm<{ contact: ContactRelation }>(scope, `/api/im/contacts/${contactId}/block`, {
      method: "POST"
    });
  },
  unblockContact(contactId: string) {
      return requestIm<{ contact: ContactRelation }>(scope, `/api/im/contacts/${contactId}/block`, {
      method: "DELETE"
    });
  },
  deleteContact(contactId: string) {
      return requestIm<{ contact: ContactRelation }>(scope, `/api/im/contacts/${contactId}`, {
      method: "DELETE"
    });
  },
  listFriendRequests() {
      return requestIm<{ friendRequests: FriendRequest[]; users: ImDatabase["users"] }>(scope, "/api/im/friend-requests");
  },
  acceptFriendRequest(requestId: string) {
      return requestIm<{ request: FriendRequest; contact?: ContactRelation }>(scope, `/api/im/friend-requests/${requestId}/accept`, {
      method: "POST"
    });
  },
  rejectFriendRequest(requestId: string) {
      return requestIm<{ friendRequest: FriendRequest }>(scope, `/api/im/friend-requests/${requestId}/reject`, {
      method: "POST"
    });
  },
  listConversations() {
      return requestIm<{ conversations: Conversation[]; users: ImDatabase["users"] }>(scope, "/api/im/conversations");
  },
  getConversation(conversationId: string) {
      return requestIm<{ conversation: Conversation; members: ImDatabase["members"]; users: ImDatabase["users"] }>(
        scope,
        `/api/im/conversations/${conversationId}`
      );
  },
  listMessages(conversationId: string, cursor?: string | null, limit = 30) {
    const params = new URLSearchParams();
    params.set("limit", String(limit));

    if (cursor) {
      params.set("cursor", cursor);
    }

      return requestIm<{ messages: ConversationMessage[]; nextCursor: string | null; hasMore: boolean }>(
        scope,
      `/api/im/conversations/${conversationId}/messages?${params.toString()}`
    );
  },
  createConversation(memberIds: string[], title?: string, privacyOptions?: CreateConversationPrivacyOptions) {
    return requestIm<{ conversation: Conversation }>(scope, "/api/im/conversations", {
      method: "POST",
      body: JSON.stringify({ memberIds, title, ...privacyOptions })
    });
  },
  updateConversationPrivacy(conversationId: string, privacyOptions: UpdateConversationPrivacyOptions) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/privacy`, {
      method: "PATCH",
      body: JSON.stringify(privacyOptions)
    });
  },
  updateConversationGroupInfo(conversationId: string, groupInfoOptions: UpdateConversationGroupInfoOptions) {
      return requestIm<{ conversation: Conversation; members: ConversationMember[] }>(scope, `/api/im/conversations/${conversationId}/group-info`, {
      method: "PATCH",
      body: JSON.stringify(groupInfoOptions)
    });
  },
  updateConversationTags(conversationId: string, tags: string[]) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tags })
    });
  },
  addConversationMembers(conversationId: string, userIds: string[]) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds })
    });
  },
  removeConversationMember(conversationId: string, userId: string) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/members/${userId}`, {
      method: "DELETE"
    });
  },
  pinConversation(conversationId: string, isPinned: boolean) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ isPinned })
    });
  },
  muteConversation(conversationId: string, isMuted: boolean) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/mute`, {
      method: "PATCH",
      body: JSON.stringify({ isMuted })
    });
  },
  markConversationRead(conversationId: string) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/read`, {
      method: "PATCH",
      body: JSON.stringify({})
    });
  },
  deleteConversation(conversationId: string) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}`, {
      method: "DELETE"
    });
  },
  clearConversation(conversationId: string) {
      return requestIm<{ conversation: Conversation }>(scope, `/api/im/conversations/${conversationId}/clear`, {
      method: "POST"
    });
  },
  sendMessage(type: ImMessageType, payload: { conversationId: string; content: string; quotedMessageId?: string; ext?: MessageExt }) {
      return requestIm<{ conversation: Conversation; message: ConversationMessage }>(scope, `/api/im/messages/${type}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  estimateTagMessageCampaign(input: TagMessageCampaignInput) {
      return requestIm<TagMessageCampaignEstimate>(scope, "/api/im/messages/campaigns/estimate", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  sendTagMessageCampaign(input: TagMessageCampaignInput) {
      return requestIm<TagMessageCampaignResult>(scope, "/api/im/messages/campaigns", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  recallMessage(messageId: string) {
      return requestIm<{ conversation: Conversation; message: ConversationMessage }>(scope, `/api/im/messages/${messageId}/recall`, {
      method: "POST"
    });
  },
  resendMessage(messageId: string) {
      return requestIm<{ conversation: Conversation; message: ConversationMessage }>(scope, `/api/im/messages/${messageId}/resend`, {
      method: "POST"
    });
  },
  forwardMessage(messageId: string, conversationId: string) {
      return requestIm<{ conversation: Conversation; message: ConversationMessage }>(scope, "/api/im/messages/forward", {
      method: "POST",
      body: JSON.stringify({ messageId, conversationId })
    });
  },
  search(query: string, conversationId?: string) {
    const params = new URLSearchParams({ q: query });

    if (conversationId) {
      params.set("conversationId", conversationId);
    }

      return requestIm<{
      contacts: ContactRelation[];
      conversations: Conversation[];
      messages: ConversationMessage[];
      }>(scope, `/api/im/search?${params.toString()}`);
  },
  uploadInit(kind: string) {
      return requestIm<{ uploadId: string; uploadUrl: string; fileUrl: string }>(scope, "/api/im/upload/init", {
      method: "POST",
      body: JSON.stringify({ kind })
    });
  },
  uploadComplete(uploadId: string) {
      return requestIm<{ success: boolean }>(scope, "/api/im/upload/complete", {
      method: "POST",
      body: JSON.stringify({ uploadId })
    });
  }
  };
}

export const imApi = createImApi("user");
