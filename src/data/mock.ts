import type {
  Campaign,
  City,
  Coupon,
  CpsReferral,
  Customer,
  FieldJob,
  InventoryItem,
  Merchant,
  Metric,
  Order,
  OrderStatus,
  Review,
  Schedule,
  ServiceCategory,
  ServiceItem,
  Settlement,
  Store,
  Technician
} from "../types/domain";
import { demoAuthAccount } from "../auth/demoAccount";
import { formatSystemId } from "../lib/systemIds";

export type TechnicianMomentComment = {
  id: string;
  userName: string;
  content: string;
  at: string;
};

export type TechnicianMomentPost = {
  id: string;
  technicianId: string;
  technicianName: string;
  role: string;
  postedAt: string;
  location: string;
  visibility: "公开" | "仅关注者" | "仅预约客户";
  content: string;
  images: string[];
  serviceTitle: string;
  servicePrice: number;
  likes: number;
  likedUsers: string[];
  comments: TechnicianMomentComment[];
  status: "visible" | "reviewing" | "hidden";
};

export const imageBank = {
  cleaning: "/images/generated/services/service-home-cleaning.jpg",
  cleaningAlt: "/images/generated/services/service-kitchen-deep-clean.jpg",
  cleaningPortrait: "/images/generated/stores/store-clean-base.jpg",
  massage: "/images/generated/services/service-massage-setup.jpg",
  massageAlt: "/images/generated/stores/store-calm-body-room.jpg",
  nail: "/images/generated/services/service-beauty-workstation.jpg",
  restaurant: "/images/generated/stores/store-izakaya-counter.jpg",
  cafe: "/images/generated/stores/store-cafe-consult.jpg",
  repair: "/images/generated/services/service-plumbing-repair.jpg",
  repairAlt: "/images/generated/stores/store-repair-moving-office.jpg",
  appliance: "/images/generated/services/service-ac-cleaning.jpg",
  moving: "/images/generated/services/service-moving-boxes.jpg",
  pet: "/images/generated/services/service-pet-care.jpg",
  care: "/images/generated/services/service-wellness-care.jpg",
  salon: "/images/generated/stores/store-beauty-reception.jpg",
  home: "/images/generated/services/service-home-organization.jpg",
  laundry: "/images/generated/services/service-laundry-care.jpg",
  tutor: "/images/generated/services/service-tutor-cafe.jpg",
  nailAtelier: "/images/generated/stores/store-nail-atelier.jpg",
  cleanBase: "/images/generated/stores/store-clean-base.jpg",
  petGrooming: "/images/generated/stores/store-pet-grooming.jpg"
};

const generatedProfileAvatars = Array.from(
  { length: 16 },
  (_, index) => `/images/generated/profiles/profile-${String(index + 1).padStart(2, "0")}.jpg`
);

const generatedAiProfileAvatars = Array.from(
  { length: 48 },
  (_, index) => `/images/generated/profiles/ai-profile-${String(index + 1).padStart(2, "0")}.jpg`
);

export const demoTechnicianAvatar = "/images/generated/profiles/demo-technician-misaki.jpg";

const technicianPhotoAvatars = generatedAiProfileAvatars.slice(0, 29);
const customerPhotoAvatars = [...generatedAiProfileAvatars.slice(29), ...generatedProfileAvatars];

function pickCustomerAvatar(index: number, _label: string) {
  return customerPhotoAvatars[index] ?? generatedAiProfileAvatars[(index + 29) % generatedAiProfileAvatars.length] ?? generatedProfileAvatars[index % generatedProfileAvatars.length];
}

function pickTechnicianAvatar(index: number, _label: string) {
  if (index === 0) {
    return demoTechnicianAvatar;
  }

  return technicianPhotoAvatars[index - 1] ?? generatedAiProfileAvatars[(index - 1) % generatedAiProfileAvatars.length] ?? generatedProfileAvatars[index % generatedProfileAvatars.length];
}

function pickProfileAvatar(index: number) {
  return pickTechnicianAvatar(index, `tech-${index + 1}`);
}

function buildTechnicianGallery(role: Technician["role"], index: number) {
  const pools: Record<Technician["role"], string[]> = {
    storeManager: [imageBank.cafe, imageBank.cleanBase, imageBank.salon],
    staff: [imageBank.nail, imageBank.salon, imageBank.cafe, imageBank.restaurant],
    therapist: [imageBank.massageAlt, imageBank.massage, imageBank.care, imageBank.salon],
    driver: [imageBank.moving, imageBank.repairAlt, imageBank.home],
    cleaner: [imageBank.cleanBase, imageBank.cleaning, imageBank.cleaningAlt, imageBank.appliance]
  };
  const pool = pools[role] ?? [imageBank.home];

  return [pool[index % pool.length], pool[(index + 1) % pool.length], pool[(index + 2) % pool.length]];
}

export const cities: City[] = [
  { id: "tokyo", name: "东京", prefecture: "東京都", activeStores: 328, activeTechnicians: 1240 },
  { id: "osaka", name: "大阪", prefecture: "大阪府", activeStores: 188, activeTechnicians: 690 },
  { id: "yokohama", name: "横滨", prefecture: "神奈川県", activeStores: 96, activeTechnicians: 315 },
  { id: "nagoya", name: "名古屋", prefecture: "愛知県", activeStores: 74, activeTechnicians: 221 }
];

export const serviceCategories: ServiceCategory[] = [
  { id: "cleaning", name: "家庭保洁", icon: "清", mode: "home", hot: true },
  { id: "massage", name: "上门按摩", icon: "按", mode: "home", hot: true },
  { id: "recycle", name: "上门回收", icon: "收", mode: "home", hot: false },
  { id: "pet", name: "宠物相关", icon: "宠", mode: "home", hot: true },
  { id: "business", name: "商务", icon: "商", mode: "both", hot: true },
  { id: "dining", name: "餐饮预约", icon: "食", mode: "store", hot: true },
  { id: "repair", name: "上门维修", icon: "修", mode: "home", hot: true },
  { id: "laundry", name: "衣物洗护", icon: "洗", mode: "home", hot: false },
  { id: "moving", name: "搬家", icon: "搬", mode: "home", hot: false },
  { id: "appliance", name: "家电清洗", icon: "电", mode: "home", hot: true },
  { id: "install", name: "上门安装", icon: "装", mode: "home", hot: false },
  { id: "beauty", name: "上门美业", icon: "美", mode: "both", hot: true },
  { id: "nanny", name: "保姆月嫂", icon: "育", mode: "home", hot: false },
  { id: "care", name: "康养护理", icon: "护", mode: "home", hot: false },
  { id: "deep", name: "深度保洁", icon: "深", mode: "home", hot: true },
  { id: "storage", name: "收纳整理", icon: "纳", mode: "home", hot: false },
  { id: "homecare", name: "家居养护", icon: "养", mode: "home", hot: false },
  { id: "guide", name: "导游", icon: "游", mode: "both", hot: false },
  { id: "property", name: "不动产", icon: "产", mode: "both", hot: false },
  { id: "tutor", name: "家庭教师", icon: "教", mode: "both", hot: false },
  { id: "sports", name: "运动", icon: "动", mode: "both", hot: false },
  { id: "legal", name: "法律支援", icon: "法", mode: "both", hot: false },
  { id: "renovation", name: "装修", icon: "修", mode: "home", hot: false },
  { id: "other", name: "其他", icon: "其", mode: "both", hot: false }
];

export const technicians: Technician[] = [
  {
    id: "tech-1",
    systemId: formatSystemId("b", 1),
    name: "佐藤 美咲",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    rating: 4.96,
    orderCount: 1280,
    income: 684000,
    skills: ["肩颈调理", "女性可选", "中文 OK"],
    serviceAreas: ["新宿", "涩谷", "中野"],
    acceptRate: 96,
    cancelRate: 1.8,
    reviewCount: 968,
    languages: ["日本語", "中文"],
    accountUsername: demoAuthAccount.username,
    nickname: "Misaki",
    bio: "以肩颈调理、睡眠放松和轻芳疗为主。预约前会先确认压力点、力度偏好、语言和付款方式，让到店或指定上门服务都能保持稳定节奏。",
    gender: "female",
    age: "25",
    height: "164cm",
    identityLabel: "店铺所属技师",
    profileTags: ["💆 肩颈调理", "🪷 睡眠放松", "🌿 轻芳疗", "🤝 温和沟通", "🗾 日本語", "🀄 中文"],
    canServeForeigners: true,
    bidBudgetMin: "12000",
    bidBudgetMax: "28000",
    paymentMethods: ["platform", "prepay", "offline"],
    avatar: pickTechnicianAvatar(0, "佐藤 美咲"),
    gallery: [demoTechnicianAvatar, ...buildTechnicianGallery("therapist", 0)]
  },
  {
    id: "tech-2",
    systemId: formatSystemId("b", 2),
    name: "田中 翔太",
    storeId: "store-2",
    role: "cleaner",
    status: "busy",
    rating: 4.88,
    orderCount: 932,
    income: 512000,
    skills: ["空调清洗", "修水管", "当日预约"],
    serviceAreas: ["品川", "目黑", "港区"],
    acceptRate: 93,
    cancelRate: 2.4,
    reviewCount: 742,
    languages: ["日本語", "English"],
    gender: "male",
    paymentMethods: ["paypay", "paypal", "cash"],
    avatar: pickTechnicianAvatar(1, "田中 翔太"),
    gallery: buildTechnicianGallery("cleaner", 1)
  },
  {
    id: "tech-3",
    systemId: formatSystemId("b", 3),
    name: "王 静",
    storeId: "store-3",
    role: "staff",
    status: "available",
    rating: 4.91,
    orderCount: 760,
    income: 438000,
    skills: ["美甲", "美睫", "上门美业"],
    serviceAreas: ["池袋", "上野", "文京"],
    acceptRate: 98,
    cancelRate: 1.2,
    reviewCount: 615,
    languages: ["中文", "日本語"],
    gender: "female",
    paymentMethods: ["wechatpay", "alipay", "platform"],
    avatar: pickTechnicianAvatar(2, "王 静"),
    gallery: buildTechnicianGallery("staff", 2)
  }
];

const technicianExpansionSeeds: Array<
  Pick<Technician, "name" | "storeId" | "role" | "status" | "skills" | "serviceAreas" | "languages" | "avatar">
> = [
  {
    name: "高桥 莉子",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["深夜按摩", "肩颈调理", "酒店上门"],
    serviceAreas: ["六本木", "赤坂", "麻布十番"],
    languages: ["日本語", "中文"],
    avatar: pickProfileAvatar(3)
  },
  {
    name: "山本 健太",
    storeId: "store-4",
    role: "cleaner",
    status: "busy",
    skills: ["家庭保洁", "修水管", "退去清扫"],
    serviceAreas: ["目黑", "品川", "大崎"],
    languages: ["日本語"],
    avatar: pickProfileAvatar(4)
  },
  {
    name: "林 佳怡",
    storeId: "store-2",
    role: "staff",
    status: "available",
    skills: ["美甲", "美睫", "中文预约"],
    serviceAreas: ["涩谷", "原宿", "表参道"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(5)
  },
  {
    name: "鈴木 真央",
    storeId: "store-1",
    role: "therapist",
    status: "off",
    skills: ["足底护理", "全身放松", "女性可选"],
    serviceAreas: ["银座", "东京站", "日本桥"],
    languages: ["日本語", "English"],
    avatar: pickProfileAvatar(6)
  },
  {
    name: "陈 浩然",
    storeId: "store-4",
    role: "cleaner",
    status: "available",
    skills: ["空调分解清洗", "家电清洗", "维修辅助"],
    serviceAreas: ["新宿", "中野", "杉并"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(7)
  },
  {
    name: "田村 彩花",
    storeId: "store-2",
    role: "staff",
    status: "busy",
    skills: ["美业护理", "妆前护理", "当日预约"],
    serviceAreas: ["惠比寿", "代官山", "广尾"],
    languages: ["日本語"],
    avatar: pickProfileAvatar(8)
  },
  {
    name: "Park Minho",
    storeId: "store-3",
    role: "staff",
    status: "available",
    skills: ["餐饮接待", "包间服务", "韩语 OK"],
    serviceAreas: ["惠比寿", "涩谷", "新大久保"],
    languages: ["한국어", "日本語", "English"],
    avatar: pickProfileAvatar(9)
  },
  {
    name: "小林 優奈",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["产后护理", "睡眠舒缓", "女性可选"],
    serviceAreas: ["池袋", "上野", "文京"],
    languages: ["日本語", "中文"],
    avatar: pickProfileAvatar(10)
  },
  {
    name: "王 明",
    storeId: "store-4",
    role: "cleaner",
    status: "busy",
    skills: ["搬家清扫", "大件回收", "现场报价"],
    serviceAreas: ["横滨", "川崎", "武藏小杉"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(11)
  },
  {
    name: "中村 亮",
    storeId: "store-4",
    role: "driver",
    status: "available",
    skills: ["搬家拉货", "家具搬运", "路线规划"],
    serviceAreas: ["大阪市", "梅田", "难波"],
    languages: ["日本語"],
    avatar: pickProfileAvatar(12)
  },
  {
    name: "Mia Lawson",
    storeId: "store-2",
    role: "staff",
    status: "available",
    skills: ["英文接待", "美睫", "旅游客预约"],
    serviceAreas: ["银座", "有乐町", "筑地"],
    languages: ["English", "日本語"],
    avatar: pickProfileAvatar(13)
  },
  {
    name: "森田 春",
    storeId: "store-1",
    role: "therapist",
    status: "busy",
    skills: ["运动放松", "腰背护理", "男性技师"],
    serviceAreas: ["涩谷", "三轩茶屋", "下北泽"],
    languages: ["日本語", "English"],
    avatar: pickProfileAvatar(14)
  },
  {
    name: "刘 欣怡",
    storeId: "store-2",
    role: "staff",
    status: "available",
    skills: ["上门美业", "皮肤管理", "中文 OK"],
    serviceAreas: ["池袋", "高田马场", "早稻田"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(15)
  },
  {
    name: "伊藤 直树",
    storeId: "store-4",
    role: "cleaner",
    status: "off",
    skills: ["深度保洁", "窗户清洁", "办公室清扫"],
    serviceAreas: ["东京站", "丸之内", "日本桥"],
    languages: ["日本語"],
    avatar: pickProfileAvatar(0)
  },
  {
    name: "张 雨菲",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["精油护理", "女性可选", "深夜可约"],
    serviceAreas: ["新宿", "歌舞伎町", "四谷"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(1)
  },
  {
    name: "渡边 莲",
    storeId: "store-3",
    role: "staff",
    status: "available",
    skills: ["餐厅排班", "外语接待", "投诉处理"],
    serviceAreas: ["惠比寿", "目黑", "白金台"],
    languages: ["日本語", "English"],
    avatar: pickProfileAvatar(2)
  },
  {
    name: "Kim Sooah",
    storeId: "store-2",
    role: "staff",
    status: "busy",
    skills: ["美甲设计", "韩式款式", "拍照返图"],
    serviceAreas: ["新大久保", "新宿", "原宿"],
    languages: ["한국어", "日本語"],
    avatar: pickProfileAvatar(3)
  },
  {
    name: "Sofia Chen",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["英文服务", "旅行客护理", "芳疗"],
    serviceAreas: ["六本木", "银座", "东京站"],
    languages: ["English", "中文", "日本語"],
    avatar: pickProfileAvatar(4)
  },
  {
    name: "松本 大地",
    storeId: "store-4",
    role: "cleaner",
    status: "busy",
    skills: ["宠物家庭保洁", "除味除菌", "定期服务"],
    serviceAreas: ["丰洲", "台场", "月岛"],
    languages: ["日本語"],
    avatar: pickProfileAvatar(5)
  },
  {
    name: "赵 安琪",
    storeId: "store-4",
    role: "cleaner",
    status: "available",
    skills: ["收纳整理", "衣橱规划", "照片验收"],
    serviceAreas: ["吉祥寺", "三鹰", "荻窪"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(6)
  },
  {
    name: "河合 玲奈",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["热石护理", "肩颈舒缓", "商务接待"],
    serviceAreas: ["银座", "有乐町", "新桥"],
    languages: ["日本語", "English"],
    avatar: pickProfileAvatar(7)
  },
  {
    name: "周 子涵",
    storeId: "store-1",
    role: "therapist",
    status: "busy",
    skills: ["足底护理", "中文服务", "深夜可约"],
    serviceAreas: ["新宿", "大久保", "高田马场"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(8)
  },
  {
    name: "Allen Brooks",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["运动恢复", "英文服务", "男性技师"],
    serviceAreas: ["六本木", "赤坂", "虎之门"],
    languages: ["English", "日本語"],
    avatar: pickProfileAvatar(9)
  },
  {
    name: "白石 奈央",
    storeId: "store-1",
    role: "therapist",
    status: "off",
    skills: ["芳疗", "睡眠舒缓", "女性可选"],
    serviceAreas: ["表参道", "青山", "涩谷"],
    languages: ["日本語"],
    avatar: pickProfileAvatar(10)
  },
  {
    name: "李 晨",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["经络护理", "中文服务", "长时间套餐"],
    serviceAreas: ["东京站", "日本桥", "丸之内"],
    languages: ["中文", "日本語"],
    avatar: pickProfileAvatar(11)
  },
  {
    name: "桐生 悠",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    skills: ["腰背护理", "上门酒店", "安全同行"],
    serviceAreas: ["池袋", "目白", "文京"],
    languages: ["日本語", "English"],
    avatar: pickProfileAvatar(12)
  }
];

technicians.push(
  ...technicianExpansionSeeds.map((seed, index): Technician => ({
    id: `tech-grown-${String(index + 1).padStart(2, "0")}`,
    systemId: formatSystemId("b", index + 4),
    ...seed,
    avatar: pickTechnicianAvatar(index + 3, seed.name),
    gallery: buildTechnicianGallery(seed.role, index + 3),
    rating: Number((4.74 + (index % 19) / 100).toFixed(2)),
    orderCount: 320 + index * 67 + (index % 4) * 28,
    income: 248000 + index * 36000 + (index % 5) * 15000,
    acceptRate: 89 + (index % 10),
    cancelRate: Number((1.1 + (index % 6) * 0.35).toFixed(1)),
    reviewCount: 180 + index * 37 + (index % 4) * 12
  }))
);

const technicianMomentContentSeeds = [
  "今天把肩颈调理的服务前确认流程重新整理了一遍：压力点、力度偏好、语言和付款方式都提前确认，现场会顺很多。",
  "保洁前后对比已经上传，厨房油污和浴室水垢处理完以后，客户说下个月还会固定预约。",
  "晚间空档开放中，银座和新宿附近 21:30 后还可以接一单，第一次预约建议先发一下希望重点放松的位置。",
  "宠物家庭服务完成，进门前确认猫咪位置真的很重要，照片已经回传给客户。",
  "新客第一次预约建议先选标准套餐，服务后再根据身体状态追加时间。",
  "今天有客户通过动态里的服务照片预约，真实记录比广告更容易建立信任。",
  "雨天移动时间会变长，已经把今晚的可预约时间往后预留 20 分钟。",
  "上门前会再次确认付款方式和服务内容，平台内沟通记录对双方都更安心。"
];

const technicianMomentServiceSeeds = [
  ["肩颈深层舒缓", 12800],
  ["两小时家庭保洁", 6800],
  ["空调分解清洗", 16800],
  ["宠物喂养陪伴", 5200],
  ["上门美业护理", 9800],
  ["深夜酒店按摩", 15800]
] as const;

const technicianMomentCommentSeeds = [
  ["林 小雨", "上次服务很准时，看到照片以后更放心。"],
  ["Mia Chen", "请问周五晚上还能约同一个担当吗？"],
  ["佐藤 健", "说明写得很清楚，适合第一次预约的人。"],
  ["高桥 由美", "服务前提醒很有帮助，已经收藏了。"],
  ["王 可欣", "照片对比很直观，下次想试深度套餐。"],
  ["Daniel Smith", "English support is very helpful."],
  ["山田 莉奈", "夜间预约信息更新得很及时。"],
  ["陈 明浩", "预算和时间写清楚以后派单确实更快。"]
] as const;

export const technicianMoments: TechnicianMomentPost[] = technicians.flatMap((technician, technicianIndex) =>
  Array.from({ length: 2 }, (_, postIndex): TechnicianMomentPost => {
    const sequence = technicianIndex * 2 + postIndex;
    const service = technicianMomentServiceSeeds[sequence % technicianMomentServiceSeeds.length];
    const commentStart = sequence % technicianMomentCommentSeeds.length;
    const comments = Array.from({ length: 2 + (sequence % 3) }, (_, commentIndex): TechnicianMomentComment => {
      const commentSeed = technicianMomentCommentSeeds[(commentStart + commentIndex) % technicianMomentCommentSeeds.length];

      return {
        id: `${technician.id}-moment-${postIndex + 1}-comment-${commentIndex + 1}`,
        userName: commentSeed[0],
        content: commentSeed[1],
        at: commentIndex === 0 ? "今天 18:20" : `${commentIndex + 1}小时前`
      };
    });
    const imagePool = [
      technician.avatar,
      imageBank.massageAlt,
      imageBank.massage,
      imageBank.care,
      imageBank.cleaning,
      imageBank.cleaningAlt,
      imageBank.appliance,
      imageBank.repair,
      imageBank.pet,
      imageBank.salon
    ];

    return {
      id: `${technician.id}-moment-${postIndex + 1}`,
      technicianId: technician.id,
      technicianName: technician.name,
      role: technician.role === "therapist" ? "护理技师" : technician.role === "cleaner" ? "清洁技师" : "门店员工",
      postedAt: postIndex === 0 ? "今天 16:30" : `${2 + (technicianIndex % 9)}天前`,
      location: technician.serviceAreas[postIndex % technician.serviceAreas.length] ?? "东京",
      visibility: postIndex === 0 ? "公开" : technicianIndex % 3 === 0 ? "仅预约客户" : "仅关注者",
      content: technicianMomentContentSeeds[sequence % technicianMomentContentSeeds.length],
      images: [
        imagePool[sequence % imagePool.length],
        imagePool[(sequence + 2) % imagePool.length],
        imagePool[(sequence + 4) % imagePool.length]
      ].slice(0, postIndex === 0 ? 3 : 2),
      serviceTitle: service[0],
      servicePrice: service[1],
      likes: 36 + sequence * 7 + (technician.orderCount % 21),
      likedUsers: technicianMomentCommentSeeds
        .slice(0, 4 + (sequence % 3))
        .map((commentSeed) => commentSeed[0]),
      comments,
      status: sequence === 0 ? "visible" : sequence % 17 === 0 ? "reviewing" : "visible"
    };
  })
);

export const services: ServiceItem[] = [
  {
    id: "svc-clean-1",
    categoryId: "cleaning",
    name: "两小时家庭日常保洁",
    mode: "home",
    priceFrom: 6800,
    rating: 4.86,
    sales: 18420,
    summary: "厨房、浴室、地面、除尘一站式整理，适合公寓日常维护。",
    tags: ["最快 45 分钟", "可中文沟通", "女性技师可选"],
    fastestArrival: "45 分钟",
    serviceAreas: ["东京 23 区", "横滨核心区", "大阪市"],
    technicianCount: 238,
    cover: imageBank.cleaning,
    packages: [
      {
        id: "pkg-clean-2h",
        name: "标准 2 小时",
        price: 6800,
        durationMinutes: 120,
        description: "1 人上门，适合 1LDK-2LDK 日常维护。",
        includes: ["厨房台面", "浴室洗面台", "地面吸尘拖洗", "垃圾分类协助"]
      },
      {
        id: "pkg-clean-3h",
        name: "深度 3 小时",
        price: 9800,
        durationMinutes: 180,
        description: "覆盖修水管重点污渍与收纳归位。",
        includes: ["油污清理", "浴室水垢", "柜面擦拭", "阳台地面"]
      }
    ],
    notice: ["请提前准备停车信息", "不包含高空玻璃外侧", "宠物家庭请备注"],
    flow: ["下单预约", "平台确认", "技师到达", "现场验收", "评价售后"]
  },
  {
    id: "svc-massage-1",
    categoryId: "massage",
    name: "上门肩颈舒缓按摩",
    mode: "home",
    priceFrom: 8800,
    rating: 4.93,
    sales: 12680,
    summary: "专业理疗师携带一次性用品到家服务，支持深夜与女性技师。",
    tags: ["深夜可约", "女性可选", "日中英服务"],
    fastestArrival: "60 分钟",
    serviceAreas: ["新宿", "涩谷", "港区", "中野"],
    technicianCount: 92,
    cover: imageBank.massage,
    packages: [
      {
        id: "pkg-massage-60",
        name: "舒缓 60 分钟",
        price: 8800,
        durationMinutes: 60,
        description: "肩颈背部放松，适合久坐疲劳。",
        includes: ["肩颈调理", "背部放松", "热敷", "一次性床单"]
      },
      {
        id: "pkg-massage-90",
        name: "全身 90 分钟",
        price: 12800,
        durationMinutes: 90,
        description: "覆盖肩颈、腰背、腿部。",
        includes: ["全身经络", "腿部拉伸", "头部放松", "护理建议"]
      }
    ],
    notice: ["孕期、术后请先咨询客服", "服务人员不提供医疗诊断", "请准备安静空间"],
    flow: ["选择技师", "确认时间", "到家准备", "服务中", "完成评价"]
  },
  {
    id: "svc-appliance-1",
    categoryId: "appliance",
    name: "空调分解清洗",
    mode: "home",
    priceFrom: 11800,
    rating: 4.79,
    sales: 8904,
    summary: "壁挂式空调拆盖清洗，包含防霉处理与作业前后拍照。",
    tags: ["拍照验收", "修水管保护", "企业可开票"],
    fastestArrival: "今日 18:00",
    serviceAreas: ["东京 23 区", "川崎", "埼玉南部"],
    technicianCount: 74,
    cover: imageBank.appliance,
    packages: [
      {
        id: "pkg-ac-basic",
        name: "普通壁挂式",
        price: 11800,
        durationMinutes: 90,
        description: "普通壁挂空调分解清洗。",
        includes: ["外壳拆洗", "蒸发器冲洗", "防霉喷涂", "作业保护"]
      },
      {
        id: "pkg-ac-robot",
        name: "自动清扫机型",
        price: 16800,
        durationMinutes: 150,
        description: "带自动清扫功能机型专用。",
        includes: ["控制部保护", "分体拆洗", "排水检查", "完工拍照"]
      }
    ],
    notice: ["高处外机另行报价", "请确认电源可用", "10 年以上机型需现场确认"],
    flow: ["机型确认", "预约上门", "保护施工", "清洗试机", "验收付款"]
  },
  {
    id: "svc-beauty-1",
    categoryId: "beauty",
    name: "上门美甲美睫护理",
    mode: "home",
    priceFrom: 7600,
    rating: 4.9,
    sales: 6420,
    summary: "精选美业老师上门，支持通勤前、下班后与周末预约。",
    tags: ["作品可看", "可选款式", "女性技师"],
    fastestArrival: "明日 10:00",
    serviceAreas: ["池袋", "上野", "文京", "丰岛"],
    technicianCount: 43,
    cover: imageBank.nail,
    packages: [
      {
        id: "pkg-nail",
        name: "单色/跳色美甲",
        price: 7600,
        durationMinutes: 90,
        description: "基础护理与单色设计。",
        includes: ["卸甲", "修型", "甲面护理", "凝胶上色"]
      },
      {
        id: "pkg-eyelash",
        name: "自然款美睫",
        price: 9800,
        durationMinutes: 120,
        description: "自然浓密度设计。",
        includes: ["眼型评估", "材质选择", "嫁接", "护理卡"]
      }
    ],
    notice: ["请确认桌面与照明", "复杂款式需提前发图", "敏感体质请备注"],
    flow: ["选择款式", "技师确认", "上门服务", "护理说明", "晒单评价"]
  }
];

const serviceExpansionSeeds = [
  {
    categoryId: "cleaning",
    name: "家政保洁",
    summary: "覆盖日常保洁、修水管、退房清扫和固定周期维护，适合长期居住家庭。",
    tags: ["可固定阿姨", "修水管重点", "中文沟通"],
    cover: imageBank.cleaning,
    basePrice: 6200,
    duration: 120,
    includes: ["厨房清洁", "浴室洗面台", "地面吸尘拖洗", "垃圾分类协助"]
  },
  {
    categoryId: "massage",
    name: "上门按摩",
    summary: "认证理疗师上门服务，支持肩颈、腰背、全身放松和深夜预约。",
    tags: ["深夜可约", "女性可选", "日中英服务"],
    cover: imageBank.massage,
    basePrice: 8600,
    duration: 60,
    includes: ["肩颈调理", "腰背放松", "热敷护理", "护理建议"]
  },
  {
    categoryId: "recycle",
    name: "上门回收",
    summary: "旧家电、家具、纸箱和搬家杂物预约回收，报价透明，可拍照预估。",
    tags: ["拍照估价", "当日可约", "可开收据"],
    cover: imageBank.moving,
    basePrice: 4800,
    duration: 45,
    includes: ["上门搬出", "分类回收", "楼梯搬运确认", "回收记录"]
  },
  {
    categoryId: "pet",
    name: "宠物相关",
    summary: "宠物喂养、遛狗、猫砂清理、洗护接送和短时陪伴，支持多宠家庭。",
    tags: ["猫狗友好", "到家打卡", "照片回传"],
    cover: imageBank.pet,
    basePrice: 5200,
    duration: 60,
    includes: ["上门喂养", "环境整理", "照片回传", "异常提醒"]
  },
  {
    categoryId: "business",
    name: "商务服务",
    summary: "办公室保洁、商旅按摩、接待预约和团队福利服务，支持企业月结与发票。",
    tags: ["企业可开票", "月结", "团队预约"],
    cover: imageBank.home,
    basePrice: 12800,
    duration: 90,
    includes: ["需求确认", "人员安排", "现场履约", "发票记录"]
  },
  {
    categoryId: "guide",
    name: "导游服务",
    summary: "城市陪同、景点讲解、路线规划和多语言接待，适合访日旅客与商务来宾。",
    tags: ["本地路线", "多语言", "行程规划"],
    cover: imageBank.restaurant,
    basePrice: 9800,
    duration: 120,
    includes: ["行程沟通", "集合陪同", "景点讲解", "路线调整"]
  },
  {
    categoryId: "property",
    name: "不动产服务",
    summary: "看房陪同、租住咨询、短住落地支持和区域介绍，适合新来日本的客户。",
    tags: ["看房陪同", "租住咨询", "区域介绍"],
    cover: imageBank.home,
    basePrice: 15600,
    duration: 90,
    includes: ["需求确认", "区域建议", "现场陪同", "资料整理"]
  },
  {
    categoryId: "tutor",
    name: "家庭教师",
    summary: "语言、数学、升学辅导和陪读支持，可上门或约定地点授课。",
    tags: ["一对一", "语言辅导", "课后答疑"],
    cover: imageBank.cafe,
    basePrice: 7200,
    duration: 90,
    includes: ["课前沟通", "定制内容", "上门授课", "学习反馈"]
  },
  {
    categoryId: "sports",
    name: "运动指导",
    summary: "健身陪练、拉伸放松、跑步陪同和基础体能训练，适合个人与小团体。",
    tags: ["陪练", "拉伸", "体能训练"],
    cover: imageBank.care,
    basePrice: 8400,
    duration: 60,
    includes: ["热身评估", "动作指导", "训练陪同", "结束拉伸"]
  },
  {
    categoryId: "legal",
    name: "法律支援",
    summary: "合同咨询、基础法务说明、纠纷整理和转介绍支持，适合个人与小型店铺。",
    tags: ["合同说明", "法务咨询", "转介绍"],
    cover: imageBank.repair,
    basePrice: 18800,
    duration: 60,
    includes: ["情况整理", "初步建议", "资料确认", "后续转介"]
  },
  {
    categoryId: "renovation",
    name: "装修服务",
    summary: "局部翻新、家具安装、墙面修补和小型改造，支持住宅与门店空间。",
    tags: ["局部翻新", "上门勘察", "门店可约"],
    cover: imageBank.repair,
    basePrice: 13800,
    duration: 120,
    includes: ["现场勘察", "报价建议", "施工安排", "完工确认"]
  },
  {
    categoryId: "moving",
    name: "搬家服务",
    summary: "小型搬家、箱包搬运、同城转运和临时人手支持，适合学生与单身搬迁。",
    tags: ["同城转运", "小时计费", "临时加人"],
    cover: imageBank.moving,
    basePrice: 6800,
    duration: 90,
    includes: ["上门搬运", "装车协助", "路线移动", "卸货归位"]
  },
  {
    categoryId: "other",
    name: "其他服务",
    summary: "临时陪同、代办跑腿、生活协助和非标准化服务需求，可先沟通再确认。",
    tags: ["灵活协商", "生活协助", "先沟通"],
    cover: imageBank.home,
    basePrice: 5600,
    duration: 60,
    includes: ["需求沟通", "服务确认", "现场执行", "结果回传"]
  }
];

const serviceCoverPools: Record<string, string[]> = {
  cleaning: [imageBank.cleaning, imageBank.cleaningAlt, imageBank.cleaningPortrait, imageBank.home],
  massage: [imageBank.massage, imageBank.massageAlt, imageBank.care],
  recycle: [imageBank.moving, imageBank.repairAlt, imageBank.home],
  pet: [imageBank.pet, imageBank.petGrooming],
  business: [imageBank.cleanBase, imageBank.cafe, imageBank.tutor],
  dining: [imageBank.restaurant, imageBank.cafe],
  repair: [imageBank.repair, imageBank.appliance, imageBank.repairAlt],
  laundry: [imageBank.laundry, imageBank.cleaningAlt],
  moving: [imageBank.moving, imageBank.repairAlt],
  appliance: [imageBank.appliance, imageBank.repair],
  beauty: [imageBank.nail, imageBank.nailAtelier, imageBank.salon],
  nanny: [imageBank.care, imageBank.home],
  care: [imageBank.care, imageBank.massage],
  deep: [imageBank.cleaningAlt, imageBank.cleaning],
  storage: [imageBank.home, imageBank.laundry],
  homecare: [imageBank.home, imageBank.repair],
  guide: [imageBank.tutor, imageBank.cafe, imageBank.restaurant],
  property: [imageBank.home, imageBank.cafe],
  tutor: [imageBank.tutor, imageBank.cafe],
  sports: [imageBank.care, imageBank.massage],
  legal: [imageBank.tutor, imageBank.cafe],
  renovation: [imageBank.repairAlt, imageBank.repair],
  other: [imageBank.cafe, imageBank.home]
};

function pickServiceCover(categoryId: string, index: number, fallback: string) {
  const pool = serviceCoverPools[categoryId] ?? [fallback];

  return pool[index % pool.length] ?? fallback;
}

services.push(
  ...Array.from({ length: 100 }, (_, index): ServiceItem => {
    const seed = serviceExpansionSeeds[index % serviceExpansionSeeds.length];
    const sequence = index + 1;
    const price = seed.basePrice + (index % 9) * 600;
    const duration = seed.duration + (index % 3) * 30;
    const cityAreas = [
      ["东京 23 区", "横滨核心区", "川崎"],
      ["新宿", "涩谷", "中野", "杉并"],
      ["目黑", "品川", "港区"],
      ["池袋", "上野", "文京", "丰岛"]
    ][index % 4];

    return {
      id: `svc-grown-${String(sequence).padStart(3, "0")}`,
      categoryId: seed.categoryId,
      name: `${seed.name} ${sequence} 号套餐`,
      mode: "home",
      priceFrom: price,
      rating: Number((4.62 + (index % 33) / 100).toFixed(2)),
      sales: 820 + index * 137,
      summary: seed.summary,
      tags: [...seed.tags, sequence % 2 === 0 ? "本周热订" : "复购高"],
      fastestArrival: sequence % 3 === 0 ? "今日 18:00" : sequence % 3 === 1 ? "最快 45 分钟" : "明日 10:00",
      serviceAreas: cityAreas,
      technicianCount: 18 + (index % 42),
      cover: pickServiceCover(seed.categoryId, index, seed.cover),
      packages: [
        {
          id: `pkg-grown-${String(sequence).padStart(3, "0")}-basic`,
          name: "安心标准",
          price,
          durationMinutes: duration,
          description: "适合日常预约，平台会按区域和评分自动推荐合适服务人员。",
          includes: seed.includes
        },
        {
          id: `pkg-grown-${String(sequence).padStart(3, "0")}-plus`,
          name: "深度加强",
          price: price + 3200,
          durationMinutes: duration + 45,
          description: "适合重点需求、长期维护或需要更完整验收记录的家庭。",
          includes: [...seed.includes.slice(0, 3), "完工拍照验收"]
        }
      ],
      notice: ["请提前确认地址与门禁", "如需指定性别或语言请备注", "超出标准范围会现场确认报价"],
      flow: ["选择服务", "确认时间", "平台派单", "上门服务", "完成评价"]
    };
  })
);

export const stores: Store[] = [
  {
    id: "store-1",
    systemId: formatSystemId("s", 1),
    merchantId: "merchant-1",
    name: "GINZA Calm Body Lab",
    accountUsername: demoAuthAccount.username,
    area: "银座",
    address: "東京都中央区銀座3-4-12",
    rating: 4.72,
    reviewCount: 1286,
    priceLabel: "¥8,000-¥15,000",
    tags: ["随时可约", "肩颈调理", "女性友好", "中文预约"],
    openStatus: "open",
    nextSlot: "今日 19:30",
    alwaysBookable: true,
    cover: imageBank.massageAlt,
    gallery: [imageBank.massageAlt, imageBank.massage, imageBank.care, imageBank.salon],
    description: "安静私密的身体护理门店，适合下班后放松与长期调理。",
    rankLabel: "银座放松护理 TOP 3",
    businessHours: "11:00-23:00",
    mode: "store",
    paymentMethods: ["platform", "prepay", "paypay"]
  },
  {
    id: "store-2",
    systemId: formatSystemId("s", 2),
    merchantId: "merchant-2",
    name: "Shibuya Nail Atelier",
    area: "涩谷",
    address: "東京都渋谷区神南1-18-2",
    rating: 4.65,
    reviewCount: 872,
    priceLabel: "¥6,500-¥12,000",
    tags: ["美甲", "美睫", "当日可约"],
    openStatus: "open",
    nextSlot: "明日 12:00",
    cover: imageBank.nailAtelier,
    gallery: [imageBank.nailAtelier, imageBank.nail, imageBank.salon, imageBank.cafe],
    description: "年轻设计师团队，款式更新快，适合通勤与周末约会前护理。",
    rankLabel: "涩谷美甲热门",
    businessHours: "10:00-21:00",
    mode: "store",
    paymentMethods: ["prepay", "paypay", "cash"]
  },
  {
    id: "store-3",
    systemId: formatSystemId("s", 3),
    merchantId: "merchant-3",
    name: "恵比寿 炭火と旬菜",
    area: "惠比寿",
    address: "東京都渋谷区恵比寿南2-7-8",
    rating: 4.18,
    reviewCount: 1940,
    priceLabel: "人均 ¥5,000",
    tags: ["居酒屋", "包间", "中文菜单"],
    openStatus: "resting",
    nextSlot: "今日 20:15",
    cover: imageBank.restaurant,
    gallery: [imageBank.restaurant, imageBank.cafe, imageBank.tutor],
    description: "炭火串烧与季节小菜，支持小型聚会和商务预约。",
    rankLabel: "惠比寿居酒屋收藏榜",
    businessHours: "17:00-24:00",
    mode: "store",
    paymentMethods: ["offline", "cash"]
  },
  {
    id: "store-4",
    systemId: formatSystemId("s", 4),
    merchantId: "merchant-4",
    name: "Meguro Home Clean Base",
    area: "目黑",
    address: "東京都目黒区下目黒2-14-5",
    rating: 4.58,
    reviewCount: 622,
    priceLabel: "¥6,800 起",
    tags: ["家庭保洁", "修水管", "企业清扫"],
    openStatus: "open",
    nextSlot: "今日 17:00",
    cover: imageBank.cleanBase,
    gallery: [imageBank.cleanBase, imageBank.cleaning, imageBank.cleaningAlt, imageBank.appliance, imageBank.repairAlt],
    description: "覆盖家庭与小型办公室的清洁团队，支持固定周期服务。",
    rankLabel: "目黑保洁复购榜",
    businessHours: "08:00-20:00",
    mode: "store",
    paymentMethods: ["platform", "offline"]
  }
];

export const customers: Customer[] = [
  {
    id: "cus-1",
    systemId: formatSystemId("u", 1),
    name: "林 小雨",
    avatar: pickCustomerAvatar(0, "林 小雨"),
    phone: "+81 80-2345-7812",
    accountUsername: demoAuthAccount.username,
    nickname: "Mia",
    age: "25",
    height: "164cm",
    gender: "female",
    languages: ["日本語", "中文"],
    bio: "偏好在预约前先确认时间、语言和付款方式。日常主要在东京活动，喜欢把行程和备注写清楚，方便快速匹配合适的店铺或技师。",
    creditRating: "A+",
    points: 18420,
    couponCount: 6,
    memberLevel: "黑卡会员",
    tags: ["高频", "中文", "夜间服务", "酒店上门", "平台预付", "按摩复购"],
    ltv: 286000,
    orderCount: 38,
    lastOrderAt: "2026-04-11 20:10",
    nextBookingAt: "2026-04-16 19:00",
    activeScore: 100,
    churnRisk: "low"
  },
  {
    id: "cus-2",
    systemId: formatSystemId("u", 2),
    name: "佐藤 健",
    avatar: pickCustomerAvatar(1, "佐藤 健"),
    phone: "+81 90-1188-2300",
    nickname: "Ken",
    age: "32",
    height: "178cm",
    gender: "male",
    languages: ["日本語", "English"],
    bio: "偏好周末和朋友聚餐预约，喜欢看到店铺环境、菜单图片和支付方式后再确认下单。",
    creditRating: "A",
    points: 6200,
    couponCount: 2,
    memberLevel: "黄金会员",
    tags: ["居酒屋", "周末", "线下支付", "涩谷", "朋友聚餐"],
    ltv: 98000,
    orderCount: 12,
    lastOrderAt: "2026-04-08 18:40",
    activeScore: 64,
    churnRisk: "medium"
  },
  {
    id: "cus-3",
    systemId: formatSystemId("u", 3),
    name: "Mia Chen",
    avatar: pickCustomerAvatar(2, "Mia Chen"),
    phone: "+81 70-8812-4301",
    nickname: "Mia",
    age: "28",
    height: "167cm",
    gender: "female",
    languages: ["中文", "English", "日本語"],
    bio: "常用到店美业和指名技师预约，出差期间也会优先选择支持英语沟通和平台支付的服务。",
    creditRating: "AA",
    points: 26400,
    couponCount: 9,
    memberLevel: "钻石会员",
    tags: ["英文", "美业", "复购", "银座", "指名技师", "高客单"],
    ltv: 418000,
    orderCount: 54,
    lastOrderAt: "2026-04-12 11:30",
    nextBookingAt: "2026-04-19 13:00",
    activeScore: 96,
    churnRisk: "low"
  }
];

customers.push(
  ...Array.from({ length: 30 }, (_, index): Customer => {
    const names = [
      "高桥 由美", "山田 莉奈", "陈 明浩", "Kim Hana", "鈴木 一郎", "王 可欣",
      "田村 直子", "Lucas Park", "小林 美月", "中村 翔", "Emily Wong", "赵 晨",
      "森田 彩", "伊藤 亮", "周 佳怡", "Daniel Smith", "林 俊介", "加藤 真央",
      "黄 诗语", "渡边 蓮", "Aiko Tan", "石井 優", "刘 佳", "佐々木 凛",
      "Marina Lee", "张 宇", "松本 葵", "Kenta Mori", "许 静", "Noah Chen"
    ];
    const levels = ["黄金会员", "黄金会员", "钻石会员", "黑卡会员"] as const;
    const tagPool = [
      ["保洁", "复购", "白天", "修水管", "家庭客户"],
      ["按摩", "夜间", "中文", "酒店上门", "平台担保", "女性可选"],
      ["宠物", "周末", "新宿", "猫狗照护", "照片回传"],
      ["到店", "美容", "英文", "银座", "指名员工", "高评分"],
      ["企业", "月结", "银座", "发票", "团队预约", "长期客户"],
      ["回收", "搬家", "急单", "现金偏好", "大件处理"]
    ];
    const languagePool = [
      ["日本語"],
      ["日本語", "中文"],
      ["日本語", "English"],
      ["中文", "English", "日本語"],
      ["한국어", "日本語"]
    ];
    const activityAreas = [
      "东京 · 新宿", "东京 · 涩谷", "东京 · 银座", "东京 · 麻布十番", "东京 · 品川", "东京 · 惠比寿",
      "东京 · 池袋", "东京 · 中野", "东京 · 目黑", "东京 · 六本木", "横滨 · 港未来", "大阪 · 梅田"
    ];
    const bookingFocus = [
      "固定周期家政和结果验收",
      "夜间放松护理和女性担当可选",
      "宠物照护、照片回传和入室规则",
      "到店美容、款式沟通和指名预约",
      "企业预约、发票和多人时间协调",
      "搬家回收、现场报价和大件处理"
    ];
    const communicationFocus = [
      "希望服务前确认到达时间、付款方式和注意事项",
      "习惯提前发照片或备注，减少现场反复沟通",
      "重视语言支持、取消规则和平台内留痕",
      "会优先选择回复稳定、说明清楚的店铺或技师",
      "下单前会先看动态里的现场图和用户反馈"
    ];
    const creditPool = ["A", "A+", "AA", "B+"] as const;
    const day = 1 + (index % 12);
    const nextDay = 14 + (index % 12);
    const risk: Customer["churnRisk"] = index % 11 === 0 ? "high" : index % 5 === 0 ? "medium" : "low";
    const name = names[index];
    const isLatinName = /^[A-Za-z]+(?:\s+[A-Za-z]+)+$/.test(name);
    const nickname = isLatinName ? name.split(" ")[0] : name.replace(/\s+/g, "");
    const tags = tagPool[index % tagPool.length];

    return {
      id: `cus-grown-${String(index + 1).padStart(2, "0")}`,
      systemId: formatSystemId("u", index + 4),
      name,
      avatar: pickCustomerAvatar(index + 3, name),
      phone: `+81 80-${String(3300 + index * 17).padStart(4, "0")}-${String(6100 + index * 23).padStart(4, "0")}`,
      nickname,
      age: `${23 + (index % 13)}`,
      height: `${158 + (index % 17)}cm`,
      gender: index % 3 === 1 ? "male" : "female",
      languages: languagePool[index % languagePool.length],
      bio: `${activityAreas[index % activityAreas.length]}周边活动较多，主要关注${bookingFocus[index % bookingFocus.length]}。${communicationFocus[index % communicationFocus.length]}，偏好在平台内保留完整记录。`,
      creditRating: risk === "high" ? "B+" : creditPool[index % creditPool.length],
      points: 2400 + index * 380,
      couponCount: 1 + (index % 6),
      memberLevel: levels[index % levels.length],
      tags,
      ltv: 68000 + index * 13800,
      orderCount: 5 + (index % 18) * 3,
      lastOrderAt: `2026-04-${String(day).padStart(2, "0")} ${String(9 + (index % 12)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`,
      nextBookingAt: index % 4 === 0 ? undefined : `2026-04-${String(nextDay).padStart(2, "0")} ${String(10 + (index % 10)).padStart(2, "0")}:00`,
      activeScore: 58 + (index * 7) % 42,
      churnRisk: risk
    };
  })
);

export const orders: Order[] = [
  {
    id: "ord-1",
    orderNo: "ND202604120001",
    mode: "home",
    status: "scheduled",
    customerId: "cus-1",
    customerName: "林 小雨",
    itemName: "上门肩颈舒缓按摩 90 分钟",
    technicianName: "佐藤 美咲",
    city: "东京",
    area: "新宿",
    amount: 12800,
    paymentStatus: "paid",
    bookedAt: "2026-04-12 21:00",
    createdAt: "2026-04-12 18:35",
    source: "app",
    remark: "需要女性技师，公寓有门禁。"
  },
  {
    id: "ord-2",
    orderNo: "ND202604120002",
    mode: "store",
    status: "confirmed",
    customerId: "cus-2",
    customerName: "佐藤 健",
    itemName: "双人居酒屋席位预约",
    storeName: "恵比寿 炭火と旬菜",
    city: "东京",
    area: "惠比寿",
    amount: 2000,
    paymentStatus: "depositPaid",
    bookedAt: "2026-04-12 20:15",
    createdAt: "2026-04-12 16:08",
    source: "web"
  },
  {
    id: "ord-3",
    orderNo: "ND202604110014",
    mode: "home",
    status: "inService",
    customerId: "cus-3",
    customerName: "Mia Chen",
    itemName: "空调分解清洗",
    technicianName: "田中 翔太",
    city: "东京",
    area: "品川",
    amount: 16800,
    paymentStatus: "paid",
    bookedAt: "2026-04-12 15:30",
    createdAt: "2026-04-11 22:20",
    source: "line",
    remark: "自动清扫机型。"
  },
  {
    id: "ord-4",
    orderNo: "ND202604100023",
    mode: "store",
    status: "refunding",
    customerId: "cus-1",
    customerName: "林 小雨",
    itemName: "美睫自然款",
    storeName: "Shibuya Nail Atelier",
    city: "东京",
    area: "涩谷",
    amount: 9800,
    paymentStatus: "paid",
    bookedAt: "2026-04-13 12:00",
    createdAt: "2026-04-10 09:18",
    source: "app",
    remark: "用户申请改期失败后退款。"
  }
];

const orderStatuses = ["pending", "unpaid", "confirmed", "scheduled", "inService", "completed", "cancelled", "refunding", "refunded"] as const;
const paymentStatuses = ["paid", "unpaid", "depositPaid", "refunded"] as const;
const orderSources = ["app", "web", "line", "partner"] as const;
const orderAreas = ["新宿", "涩谷", "银座", "目黑", "品川", "池袋", "上野", "中野", "横滨", "大阪"];

orders.push(
  ...Array.from({ length: 100 }, (_, index): Order => {
    const sequence = index + 5;
    const customer = customers[index % customers.length];
    const service = services[index % services.length];
    const store = stores[index % stores.length];
    const technician = technicians[index % technicians.length];
    const mode = service.mode;
    const day = 1 + (index % 28);
    const hour = 8 + (index % 14);
    const minute = index % 2 === 0 ? "00" : "30";
    const status = orderStatuses[index % orderStatuses.length];
    const paymentStatus = status === "refunded" ? "refunded" : paymentStatuses[index % paymentStatuses.length];

    return {
      id: `ord-grown-${String(sequence).padStart(3, "0")}`,
      orderNo: `ND202603${String(day).padStart(2, "0")}${String(1000 + sequence)}`,
      mode,
      status,
      customerId: customer.id,
      customerName: customer.name,
      itemName: service.name,
      storeName: mode === "store" ? store.name : undefined,
      technicianName: mode === "home" ? technician.name : undefined,
      city: index % 9 === 0 ? "大阪" : index % 7 === 0 ? "横滨" : "东京",
      area: orderAreas[index % orderAreas.length],
      amount: service.priceFrom + (index % 5) * 1200,
      paymentStatus,
      bookedAt: `2026-03-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${minute}`,
      createdAt: `2026-03-${String(Math.max(1, day - 1)).padStart(2, "0")} ${String(Math.max(7, hour - 2)).padStart(2, "0")}:${minute}`,
      source: orderSources[index % orderSources.length],
      remark: index % 4 === 0 ? "老客复购，偏好同一位服务人员。" : index % 4 === 1 ? "需要提前电话确认门禁。" : undefined
    };
  })
);

function formatMockDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addMockDays(date: string, days: number) {
  const [year = "2026", month = "1", day = "1"] = date.split("-");
  const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  next.setUTCDate(next.getUTCDate() + days);

  return formatMockDate(next);
}

const calmBodyLabAnalyticsDates = Array.from({ length: 60 }, (_, index) => addMockDays("2026-02-12", index));
const calmBodyLabAnalyticsHours = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00", "22:30"];
const calmBodyLabAnalyticsServices = [
  "门店肩颈深层舒缓 60 分钟",
  "上门肩颈舒缓按摩 90 分钟",
  "门店睡眠放松护理 75 分钟",
  "上门经络护理 120 分钟",
  "门店芳疗放松 60 分钟",
  "上门运动恢复 90 分钟",
  "门店足底护理 60 分钟",
  "上门睡眠舒缓 120 分钟",
  "门店热石护理 75 分钟",
  "上门腰背护理 90 分钟"
];
const calmBodyLabAnalyticsTechnicians = ["佐藤 美咲", "高桥 莉子", "白石 奈央", "李 晨", "桐生 悠"];
const calmBodyLabAnalyticsAreas = ["银座", "新宿", "涩谷", "日本桥", "丸之内"];
const calmBodyLabAnalyticsStatuses: OrderStatus[] = ["completed", "completed", "completed", "inService", "confirmed", "scheduled", "completed", "cancelled", "refunding", "refunded"];

orders.push(
  ...calmBodyLabAnalyticsDates.flatMap((date, dateIndex) =>
    calmBodyLabAnalyticsHours.map((time, slotIndex): Order => {
      const sequence = dateIndex * calmBodyLabAnalyticsHours.length + slotIndex + 1;
      const mode: Order["mode"] = slotIndex % 2 === 0 ? "store" : "home";
      const status = calmBodyLabAnalyticsStatuses[(dateIndex + slotIndex) % calmBodyLabAnalyticsStatuses.length] ?? "completed";
      const amount = 9800 + ((dateIndex + slotIndex) % 6) * 1400 + (date >= "2026-04-01" ? 1200 : date >= "2026-03-01" ? 700 : 0);
      const technicianName = calmBodyLabAnalyticsTechnicians[(dateIndex + slotIndex) % calmBodyLabAnalyticsTechnicians.length] ?? calmBodyLabAnalyticsTechnicians[0];

      return {
        id: `ord-calm-analytics-${String(sequence).padStart(3, "0")}`,
        orderNo: `ND${date.replace(/-/g, "")}${String(30000 + sequence)}`,
        mode,
        status,
        customerId: customers[(dateIndex + slotIndex) % customers.length]?.id ?? "cus-1",
        customerName: customers[(dateIndex + slotIndex) % customers.length]?.name ?? "林 小雨",
        itemName: calmBodyLabAnalyticsServices[slotIndex] ?? calmBodyLabAnalyticsServices[0],
        storeName: mode === "store" ? "GINZA Calm Body Lab" : undefined,
        technicianName,
        city: "东京",
        area: calmBodyLabAnalyticsAreas[(dateIndex + slotIndex) % calmBodyLabAnalyticsAreas.length] ?? "银座",
        amount,
        paymentStatus: status === "cancelled" || status === "refunded" ? "refunded" : "paid",
        bookedAt: `${date} ${time}`,
        createdAt: `${date} ${String(Math.max(8, Number(time.slice(0, 2)) - 2)).padStart(2, "0")}:${time.slice(3, 5)}`,
        source: slotIndex % 5 === 3 ? "line" : slotIndex % 5 === 4 ? "partner" : slotIndex % 3 === 0 ? "web" : "app",
        remark: date >= "2026-04-01" ? "数据中心趋势测试订单：当前周期。" : "数据中心趋势测试订单：前一周期。"
      };
    })
  )
);

export const fieldJobs: FieldJob[] = [
  {
    id: "job-1",
    orderId: "ord-1",
    status: "dispatched",
    address: "東京都新宿区西新宿7-9-12",
    serviceTime: "2026-04-12 21:00",
    serviceContent: "肩颈舒缓按摩 90 分钟",
    technicianName: "佐藤 美咲",
    phone: "+81 80-2345-7812",
    quote: 12800
  },
  {
    id: "job-2",
    orderId: "ord-3",
    status: "inService",
    address: "東京都品川区大崎1-5-1",
    serviceTime: "2026-04-12 15:30",
    serviceContent: "自动清扫空调分解清洗",
    technicianName: "田中 翔太",
    phone: "+81 70-8812-4301",
    quote: 16800
  },
  {
    id: "job-3",
    orderId: "ord-5",
    status: "pendingDispatch",
    address: "大阪府大阪市北区梅田1-2-2",
    serviceTime: "2026-04-13 10:00",
    serviceContent: "搬家拉货 小型货车",
    phone: "+81 90-4412-5511",
    quote: 22000,
    exceptionNote: "需要确认停车位"
  }
];

export const merchants: Merchant[] = [
  {
    id: "merchant-1",
    name: "Calm Wellness 株式会社",
    status: "active",
    categories: ["上门按摩", "门店护理"],
    city: "东京",
    commissionRate: 16,
    settlementCycle: "T+7",
    documents: ["营业执照", "保险证明", "技师资质"]
  },
  {
    id: "merchant-2",
    name: "Urban Beauty Partners",
    status: "active",
    categories: ["美甲美睫"],
    city: "东京",
    commissionRate: 14,
    settlementCycle: "周结",
    documents: ["营业执照", "卫生许可"]
  },
  {
    id: "merchant-3",
    name: "関東 Dining Group",
    status: "pending",
    categories: ["餐饮预约"],
    city: "东京",
    commissionRate: 8,
    settlementCycle: "月结",
    documents: ["营业执照", "食品经营许可"]
  }
];

export const inventoryItems: InventoryItem[] = [
  {
    id: "inv-1",
    storeName: "GINZA Calm Body Lab",
    name: "一次性床单",
    category: "耗材",
    image: imageBank.massageAlt,
    stock: 86,
    warningLine: 120,
    unit: "张",
    lastChangedAt: "2026-04-12 09:12"
  },
  {
    id: "inv-2",
    storeName: "Shibuya Nail Atelier",
    name: "凝胶甲油 048",
    category: "美业耗材",
    image: imageBank.nail,
    stock: 18,
    warningLine: 10,
    unit: "瓶",
    lastChangedAt: "2026-04-11 20:30"
  },
  {
    id: "inv-3",
    storeName: "Meguro Home Clean Base",
    name: "空调清洗罩",
    category: "清洁工具",
    image: imageBank.appliance,
    stock: 7,
    warningLine: 12,
    unit: "套",
    lastChangedAt: "2026-04-12 13:44"
  }
];

export const coupons: Coupon[] = [
  {
    id: "coupon-1",
    name: "东京新用户 ¥1,000 OFF",
    type: "newUser",
    value: "满 ¥6,000 减 ¥1,000",
    issued: 18000,
    claimed: 9420,
    redeemed: 3180,
    gmv: 42800000
  },
  {
    id: "coupon-2",
    name: "周三回流券",
    type: "return",
    value: "8 折，最高 ¥2,000",
    issued: 6200,
    claimed: 2100,
    redeemed: 680,
    gmv: 9600000
  }
];

export const campaigns: Campaign[] = [
  {
    id: "camp-1",
    name: "LINE 好友裂变预约",
    channel: "LINE",
    roi: 3.8,
    attribution: "邀请码 + 首单券",
    status: "active"
  },
  {
    id: "camp-2",
    name: "东京站周边深夜按摩",
    channel: "SEO",
    roi: 2.4,
    attribution: "落地页 + 地区词",
    status: "active"
  },
  {
    id: "camp-3",
    name: "大阪家电清洗季",
    channel: "Google Ads",
    roi: 1.7,
    attribution: "关键词组",
    status: "paused"
  }
];

const cpsCycleLabel = "2026-04-01 - 2026-04-30";

function createCpsCycle(index: number, payoutAmount: number): CpsReferral["currentCycle"] {
  const conversionCount = 8 + (index % 7) * 3;
  const orderCount = conversionCount + 4 + (index % 5);
  const grossAmount = 138000 + index * 16800;
  const estimatedIncome = payoutAmount > 0
    ? orderCount * Math.min(payoutAmount, 1200)
    : Math.round(grossAmount * ([0.08, 0.2, 0.03, 0.12][index % 4] ?? 0.08));

  return {
    label: cpsCycleLabel,
    estimatedIncome,
    grossAmount,
    orderCount,
    conversionCount
  };
}

function createCpsAcquisition(index: number): CpsReferral["acquisition"] {
  const channels = ["Instagram Reels", "LINE OpenChat", "Google Ads", "YouTube Shorts", "小红书探店"];
  const routes = [
    "短视频口播 -> 个人主页推广链接 -> NeeDo 落地页 -> App 注册",
    "社群固定公告 -> 专属邀请码 -> App 注册 -> 首单支付",
    "关键词广告 -> 城市服务页 -> 优惠券领取 -> 预约支付",
    "长短视频测评 -> 简介链接 -> 店铺页收藏 -> 首单支付",
    "图文笔记 -> 私信自动回复链接 -> App 注册 -> 预约支付"
  ];
  const code = ["aya-fit", "line-ken", "tokyo-spa", "video-bd", "note-beauty"][index % 5];

  return {
    sourceChannel: channels[index % channels.length],
    route: routes[index % routes.length],
    promotionLink: `https://needo.jp/ref/${code}-${String(index + 1).padStart(2, "0")}`,
    attributionNote: "按首次访问 UTM、注册设备、专属链接和首单支付记录做归因"
  };
}

function createCpsReferredUsers(index: number, acquisition: CpsReferral["acquisition"], payoutAmount: number): CpsReferral["referredUsers"] {
  const statusList: Array<CpsReferral["referredUsers"][number]["status"]> = ["ordered", "settled", "registered"];

  return Array.from({ length: 3 }, (_, userIndex) => {
    const firstOrderAmount = 9800 + index * 520 + userIndex * 1800;

    return {
      id: `cps-user-${index + 1}-${userIndex + 1}`,
      name: ["高桥 由美", "田中 美绪", "王 佳怡", "山本 莉奈", "佐藤 健"][((index + userIndex) % 5)],
      acquiredAt: `2026-04-${String(3 + ((index + userIndex * 4) % 24)).padStart(2, "0")} ${String(10 + userIndex * 3).padStart(2, "0")}:20`,
      sourceChannel: acquisition.sourceChannel,
      route: acquisition.route,
      firstOrderAmount,
      estimatedIncome: payoutAmount > 0 ? payoutAmount : Math.round(firstOrderAmount * ([0.08, 0.2, 0.03][(index + userIndex) % 3] ?? 0.08)),
      status: statusList[(index + userIndex) % statusList.length]
    };
  });
}

export const cpsReferrals: CpsReferral[] = [
  {
    id: "cps-1",
    referrerName: "分销员 A（Aya Tokyo Fit）",
    referrerType: "partner",
    referrerProfile: "美容探店网红 / Instagram 12.8 万粉",
    introducedType: "customer",
    introducedName: "推广链接获客包",
    introducedAt: "2026-04-01 12:20",
    assignedTo: "东京用户增长组",
    commissionRule: "本周期净实收 8%",
    payoutAmount: 0,
    payoutDuration: "按月",
    condition: "推广链接归因用户完成支付订单后计入",
    currentCycle: {
      label: cpsCycleLabel,
      estimatedIncome: 38600,
      grossAmount: 482500,
      orderCount: 19,
      conversionCount: 31
    },
    acquisition: {
      sourceChannel: "Instagram / TikTok",
      route: "短视频口播 -> 个人主页推广链接 -> NeeDo 落地页 -> App 注册",
      promotionLink: "https://needo.jp/ref/aya-fit",
      attributionNote: "UTM source=instagram，campaign=aya-spring；首次访问、注册设备、首单支付链路一致"
    },
    referredUsers: [
      {
        id: "cps-user-aya-1",
        name: "高桥 由美",
        acquiredAt: "2026-04-03 12:20",
        sourceChannel: "Instagram Reels",
        route: "短视频口播 -> 个人主页推广链接 -> NeeDo 落地页 -> App 注册",
        firstOrderAmount: 16800,
        estimatedIncome: 1344,
        status: "settled"
      },
      {
        id: "cps-user-aya-2",
        name: "田中 美绪",
        acquiredAt: "2026-04-08 19:10",
        sourceChannel: "TikTok",
        route: "探店短视频 -> bio 链接 -> 优惠券领取 -> 首单支付",
        firstOrderAmount: 23800,
        estimatedIncome: 1904,
        status: "ordered"
      },
      {
        id: "cps-user-aya-3",
        name: "王 佳怡",
        acquiredAt: "2026-04-17 21:45",
        sourceChannel: "Instagram Story",
        route: "限时动态 -> Swipe link -> App 注册 -> 店铺收藏",
        firstOrderAmount: 0,
        estimatedIncome: 0,
        status: "registered"
      }
    ],
    status: "active"
  },
  {
    id: "cps-2",
    referrerName: "佐藤 美咲",
    referrerType: "technician",
    referrerProfile: "头部技师 / 固定客转介绍",
    introducedType: "technician",
    introducedName: "山口 彩",
    introducedAt: "2026-03-28 18:10",
    assignedTo: "技师运营组",
    commissionRule: "百年内 20%",
    payoutAmount: 0,
    payoutDuration: "100 年",
    condition: "新技师个人订单平台佣金的 20%",
    currentCycle: {
      label: cpsCycleLabel,
      estimatedIncome: 26800,
      grossAmount: 134000,
      orderCount: 8,
      conversionCount: 1
    },
    acquisition: {
      sourceChannel: "技师专属邀请码",
      route: "技师 IM 分享 -> 邀请码注册 -> 资质审核 -> 首单完成",
      promotionLink: "https://needo.jp/ref/misaki-tech",
      attributionNote: "邀请码与新技师实名资料绑定，首单完成后开始计佣"
    },
    referredUsers: [
      {
        id: "cps-user-misaki-1",
        name: "山口 彩",
        acquiredAt: "2026-04-02 14:10",
        sourceChannel: "技师 IM 分享",
        route: "IM 名片 -> 邀请码注册 -> 资质审核 -> 首单完成",
        firstOrderAmount: 134000,
        estimatedIncome: 26800,
        status: "ordered"
      }
    ],
    status: "pending"
  },
  {
    id: "cps-3",
    referrerName: "Calm Wellness 株式会社",
    referrerType: "merchant",
    referrerProfile: "连锁商家 / 店铺拓展伙伴",
    introducedType: "store",
    introducedName: "Aoyama Aroma Room",
    introducedAt: "2026-03-16 09:45",
    assignedTo: "商家拓展组",
    commissionRule: "永久支付 3%",
    payoutAmount: 0,
    payoutDuration: "永久",
    condition: "被介绍门店实收流水的 3%",
    currentCycle: {
      label: cpsCycleLabel,
      estimatedIncome: 18900,
      grossAmount: 630000,
      orderCount: 42,
      conversionCount: 1
    },
    acquisition: {
      sourceChannel: "商家 BD 转介绍",
      route: "商家后台邀请 -> 资料提交 -> 门店审核 -> 上架营业",
      promotionLink: "https://needo.jp/ref/calm-chain",
      attributionNote: "门店主体与邀请商家绑定，上架后按实收流水计入"
    },
    referredUsers: [
      {
        id: "cps-user-calm-1",
        name: "Aoyama Aroma Room",
        acquiredAt: "2026-04-05 11:30",
        sourceChannel: "商家后台邀请",
        route: "后台邀请 -> 资料提交 -> 门店审核 -> 上架营业",
        firstOrderAmount: 630000,
        estimatedIncome: 18900,
        status: "settled"
      }
    ],
    status: "active"
  },
  {
    id: "cps-4",
    referrerName: "LINE 社群合伙人 Ken",
    referrerType: "partner",
    referrerProfile: "社群运营合伙人 / LINE OpenChat",
    introducedType: "business",
    introducedName: "六本木酒店合作线索",
    introducedAt: "2026-02-21 22:30",
    assignedTo: "BD 夜间服务组",
    commissionRule: "签约后一次性 ¥80,000",
    payoutAmount: 80000,
    payoutDuration: "一次性",
    condition: "酒店合作完成首月 30 单后支付",
    currentCycle: {
      label: cpsCycleLabel,
      estimatedIncome: 80000,
      grossAmount: 910000,
      orderCount: 36,
      conversionCount: 1
    },
    acquisition: {
      sourceChannel: "LINE OpenChat",
      route: "社群固定公告 -> 私聊 BD -> 合作表单 -> 合同签约",
      promotionLink: "https://needo.jp/ref/line-ken",
      attributionNote: "社群专属链接与 BD 线索单一致，首月达成条件后一次性发放"
    },
    referredUsers: [
      {
        id: "cps-user-ken-1",
        name: "六本木酒店合作线索",
        acquiredAt: "2026-04-09 22:30",
        sourceChannel: "LINE OpenChat",
        route: "社群固定公告 -> 私聊 BD -> 合作表单 -> 合同签约",
        firstOrderAmount: 910000,
        estimatedIncome: 80000,
        status: "ordered"
      }
    ],
    status: "active"
  }
];

cpsReferrals.push(
  ...Array.from({ length: 24 }, (_, index): CpsReferral => {
    const types: CpsReferral["introducedType"][] = ["customer", "business", "technician", "store"];
    const refTypes: CpsReferral["referrerType"][] = ["user", "technician", "merchant", "partner"];
    const statuses: CpsReferral["status"][] = ["active", "pending", "paused", "ended"];
    const targetType = types[index % types.length];
    const referrer = index % 3 === 0 ? customers[index % customers.length].name : index % 3 === 1 ? technicians[index % technicians.length].name : merchants[index % merchants.length].name;
    const payoutAmount = index % 4 === 0 ? 500 : index % 4 === 3 ? 30000 : 0;
    const acquisition = createCpsAcquisition(index);
    const introducedName = targetType === "customer"
      ? customers[(index + 5) % customers.length].name
      : targetType === "technician"
        ? `推荐技师 ${index + 1}`
        : targetType === "store"
          ? `推荐门店 ${index + 1}`
          : `企业合作 ${index + 1}`;

    return {
      id: `cps-grown-${index + 1}`,
      referrerName: referrer,
      referrerType: refTypes[index % refTypes.length],
      referrerProfile: ["普通用户转介绍", "技师合作人", "商家渠道伙伴", "外部推广合伙人"][index % 4],
      introducedType: targetType,
      introducedName,
      introducedAt: `2026-03-${String(1 + (index % 28)).padStart(2, "0")} ${String(9 + (index % 12)).padStart(2, "0")}:00`,
      assignedTo: ["东京增长组", "商家拓展组", "技师运营组", "客服转介绍组"][index % 4],
      commissionRule: index % 4 === 0 ? "1 年内每单 ¥500" : index % 4 === 1 ? "百年内 20%" : index % 4 === 2 ? "永久支付 3%" : "一次性 ¥30,000",
      payoutAmount,
      payoutDuration: index % 4 === 0 ? "1 年" : index % 4 === 1 ? "100 年" : index % 4 === 2 ? "永久" : "一次性",
      condition: index % 2 === 0 ? "完成支付订单后自动计算" : "通过审核并完成首单后生效",
      currentCycle: createCpsCycle(index, payoutAmount),
      acquisition,
      referredUsers: createCpsReferredUsers(index, acquisition, payoutAmount),
      status: statuses[index % statuses.length]
    };
  })
);

export const reviews: Review[] = [
  {
    id: "rev-1",
    customerName: "林 小雨",
    targetName: "佐藤 美咲",
    rating: 5,
    tone: "positive",
    content: "沟通很顺畅，肩颈放松效果明显，下次还会约。",
    createdAt: "2026-04-11 22:20",
    replied: true
  },
  {
    id: "rev-2",
    customerName: "佐藤 健",
    targetName: "恵比寿 炭火と旬菜",
    rating: 4,
    tone: "neutral",
    content: "菜品不错，但预约时间仍然等了 10 分钟。",
    createdAt: "2026-04-10 21:18",
    replied: false
  },
  {
    id: "rev-3",
    customerName: "Mia Chen",
    targetName: "空调分解清洗",
    rating: 2,
    tone: "negative",
    content: "师傅迟到，客服补偿处理及时，但体验需要改进。",
    createdAt: "2026-04-09 16:44",
    replied: false
  }
];

export const settlements: Settlement[] = [
  {
    id: "set-1",
    merchantName: "Calm Wellness 株式会社",
    period: "2026-04-01 - 2026-04-07",
    grossAmount: 3284000,
    platformFee: 525440,
    refundAmount: 48000,
    payableAmount: 2710560,
    status: "reviewing"
  },
  {
    id: "set-2",
    merchantName: "Urban Beauty Partners",
    period: "2026-04-01 - 2026-04-07",
    grossAmount: 1128000,
    platformFee: 157920,
    refundAmount: 9800,
    payableAmount: 960280,
    status: "pending"
  }
];

export const schedules: Schedule[] = [
  { id: "sch-1", staffId: "tech-1", date: "2026-04-12", startTime: "18:00", endTime: "20:00", status: "free" },
  { id: "sch-2", staffId: "tech-1", date: "2026-04-12", startTime: "21:00", endTime: "22:30", status: "booked", orderId: "ord-1" },
  { id: "sch-3", staffId: "tech-2", date: "2026-04-12", startTime: "15:30", endTime: "18:00", status: "booked", orderId: "ord-3" },
  { id: "sch-4", staffId: "tech-3", date: "2026-04-13", startTime: "10:00", endTime: "12:00", status: "free" }
];

schedules.push(
  ...technicians.flatMap((technician, technicianIndex) =>
    Array.from({ length: 5 }, (_, slotIndex): Schedule => {
      const month = slotIndex === 0 ? 3 : slotIndex === 4 ? 5 : 4;
      const day = 2 + ((technicianIndex * 3 + slotIndex * 5) % 25);
      const startHour = 9 + ((technicianIndex + slotIndex * 2) % 11);
      const statusPool: Schedule["status"][] = ["free", "booked", "blocked", "free", "booked"];
      const status = statusPool[(technicianIndex + slotIndex) % statusPool.length];

      return {
        id: `sch-grown-${technician.id}-${slotIndex + 1}`,
        staffId: technician.id,
        date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        startTime: `${String(startHour).padStart(2, "0")}:00`,
        endTime: `${String(Math.min(23, startHour + 2)).padStart(2, "0")}:00`,
        status,
        orderId: status === "booked" ? orders[(technicianIndex + slotIndex) % orders.length]?.id : undefined
      };
    })
  )
);

export const dashboardMetrics: Metric[] = [
  { label: "今日营收", value: "¥8,426,000", change: "+18.4%", tone: "good" },
  { label: "订单数", value: "1,284", change: "+9.2%", tone: "good" },
  { label: "新用户数", value: "428", change: "+12.8%", tone: "good" },
  { label: "活跃用户数", value: "18,920", change: "+6.1%", tone: "good" },
  { label: "复购率", value: "41.8%", change: "+3.4%", tone: "good" },
  { label: "取消率", value: "4.6%", change: "-0.8%", tone: "good" },
  { label: "退款率", value: "2.1%", change: "+0.3%", tone: "warn" },
  { label: "客单价", value: "¥6,562", change: "+5.7%", tone: "good" },
  { label: "员工利用率", value: "78.5%", change: "+4.2%", tone: "good" },
  { label: "库存预警数", value: "12", change: "+3", tone: "warn" },
  { label: "待处理工单", value: "36", change: "-8", tone: "neutral" },
  { label: "待审核商家", value: "19", change: "+5", tone: "warn" }
];

export const trendData = [
  { label: "4/6", revenue: 62, orders: 48, users: 35 },
  { label: "4/7", revenue: 76, orders: 55, users: 44 },
  { label: "4/8", revenue: 69, orders: 51, users: 42 },
  { label: "4/9", revenue: 88, orders: 67, users: 54 },
  { label: "4/10", revenue: 96, orders: 72, users: 61 },
  { label: "4/11", revenue: 102, orders: 84, users: 66 },
  { label: "4/12", revenue: 118, orders: 91, users: 73 }
];

export const platformOperatingStats = [
  { label: "累计服务订单", value: "386,420", caption: "上线 18 个月，东京复购占比最高" },
  { label: "认证商家", value: "1,284", caption: "本月新增 86 家，通过率 71%" },
  { label: "认证技师", value: "5,960", caption: "资质、保险、评价三重校验" },
  { label: "覆盖城市", value: "12", caption: "东京、大阪、横滨、名古屋优先运营" }
];

export const serviceGuarantees = [
  { title: "迟到自动补偿", caption: "超过承诺到达时间 15 分钟自动发券", metric: "本月触发 128 次" },
  { title: "资质与保险留档", caption: "商家营业资质、技师身份与保险到期前提醒", metric: "98.6% 已更新" },
  { title: "服务后 24h 售后", caption: "保洁、维修、家电清洗支持图片复核", metric: "平均响应 7m" }
];

export const userStories = [
  {
    name: "林 小雨",
    city: "东京 · 新宿",
    content: "固定保洁已经用了 5 个月，客服会提前提醒节假日排班，换人也能看到评分记录。",
    service: "家庭保洁",
    saved: 8200
  },
  {
    name: "佐藤 健",
    city: "东京 · 惠比寿",
    content: "餐饮预约和到店美容都在一个账号里，临时改期比以前打电话方便很多。",
    service: "到店预约",
    saved: 3600
  },
  {
    name: "Mia Chen",
    city: "品川 · 目黑",
    content: "空调清洗前后照片会留档，企业报销需要发票也能直接从订单里下载。",
    service: "家电清洗",
    saved: 12800
  }
];

export const cityOperatingStats = [
  {
    city: "东京",
    activeOrders: 1284,
    gmv: 8426000,
    repeatRate: "41.8%",
    avgResponse: "6m 40s",
    hotCategory: "上门按摩",
    supplyHealth: "充足"
  },
  {
    city: "大阪",
    activeOrders: 642,
    gmv: 3862000,
    repeatRate: "36.2%",
    avgResponse: "8m 12s",
    hotCategory: "家电清洗",
    supplyHealth: "补技师"
  },
  {
    city: "横滨",
    activeOrders: 328,
    gmv: 1940000,
    repeatRate: "32.9%",
    avgResponse: "7m 58s",
    hotCategory: "家庭保洁",
    supplyHealth: "稳定"
  },
  {
    city: "名古屋",
    activeOrders: 206,
    gmv: 1128000,
    repeatRate: "29.4%",
    avgResponse: "9m 35s",
    hotCategory: "维修安装",
    supplyHealth: "新城冷启"
  }
];

export const operationTimeline = [
  {
    at: "2026-05-15 21:40",
    title: "东京深夜按摩供给扩容",
    owner: "运营 / 东京城市组",
    city: "东京",
    category: "供给",
    priority: "P1",
    impact: "等待 -11 分钟",
    detail: "新宿、涩谷 21:00 后可接单技师增加 18 人，预计等待时间下降 11 分钟。",
    status: "done"
  },
  {
    at: "2026-05-15 19:15",
    title: "LINE 回流券完成第一轮复盘",
    owner: "增长 / CRM",
    city: "东京",
    category: "增长",
    priority: "P2",
    impact: "ROI 3.8",
    detail: "领取 2,100 张，核销 680 张，复购用户占 46%，ROI 3.8。",
    status: "done"
  },
  {
    at: "2026-05-15 16:30",
    title: "大阪空调清洗季库存预警",
    owner: "供应链 / 库存",
    city: "大阪",
    category: "库存",
    priority: "P1",
    impact: "2 张采购单",
    detail: "清洗罩低于安全库存，已生成 2 张采购单并推送门店确认。",
    status: "processing"
  },
  {
    at: "2026-05-15 12:05",
    title: "餐饮预约候位投诉回访",
    owner: "客服 / 风控",
    city: "东京",
    category: "服务质量",
    priority: "P2",
    impact: "3 起回访",
    detail: "惠比寿商圈 3 起等待超时已完成回访，1 家店铺进入服务质量观察。",
    status: "watching"
  },
  {
    at: "2026-05-14 22:20",
    title: "商家入驻审核批次归档",
    owner: "平台运营",
    city: "全平台",
    category: "审核",
    priority: "P3",
    impact: "通过 42 家",
    detail: "本周通过 42 家，拒绝 9 家，主要拒绝原因是资质照片不完整。",
    status: "done"
  },
  {
    at: "2026-05-14 18:10",
    title: "横滨家庭保洁晚高峰补班",
    owner: "运营 / 横滨城市组",
    city: "横滨",
    category: "排班",
    priority: "P2",
    impact: "补班 9 人",
    detail: "18:00-22:00 追加 9 名可接单人员，港北区与西区可预约时段恢复到 30 分钟粒度。",
    status: "done"
  },
  {
    at: "2026-05-14 15:35",
    title: "名古屋新城冷启门店陪跑",
    owner: "商家成功 / 名古屋",
    city: "名古屋",
    category: "冷启",
    priority: "P2",
    impact: "7 家门店",
    detail: "7 家新门店完成首轮资料补全，正在跟进首单转化与店内工位照片质量。",
    status: "processing"
  },
  {
    at: "2026-05-14 11:20",
    title: "复购短信 A/B 实验暂停观察",
    owner: "增长 / 数据",
    city: "全平台",
    category: "增长",
    priority: "P3",
    impact: "投诉率 +0.4%",
    detail: "B 组短链点击提升 6.1%，但退订与投诉率略高，先暂停新批次发送并复核文案。",
    status: "watching"
  },
  {
    at: "2026-05-13 20:45",
    title: "东京技师证件过期批量提醒",
    owner: "审核 / 技师资料",
    city: "东京",
    category: "审核",
    priority: "P2",
    impact: "提醒 31 人",
    detail: "对 31 名证件 14 天内到期的技师发送站内信，避免自动下架影响夜间供给。",
    status: "done"
  },
  {
    at: "2026-05-13 17:05",
    title: "大阪差评关键词升级复盘",
    owner: "客服 / 风控",
    city: "大阪",
    category: "风控",
    priority: "P1",
    impact: "命中率 +18%",
    detail: "新增 12 个服务态度与迟到相关关键词，P1 评价预警命中率提升 18%。",
    status: "done"
  },
  {
    at: "2026-05-13 13:50",
    title: "横滨商家结算异常核对",
    owner: "财务 / 结算",
    city: "横滨",
    category: "财务",
    priority: "P1",
    impact: "5 笔异常",
    detail: "5 笔渠道手续费口径不一致，已冻结自动结算并等待支付渠道回传明细。",
    status: "processing"
  },
  {
    at: "2026-05-12 23:10",
    title: "全平台夜间求救通知演练",
    owner: "安全 / 平台运营",
    city: "全平台",
    category: "安全",
    priority: "P1",
    impact: "响应 42 秒",
    detail: "模拟夜间服务异常通知链路，客服、城市组、商家管理员平均确认响应 42 秒。",
    status: "done"
  }
];

export const riskTickets = [
  {
    id: "risk-1",
    level: "P1",
    type: "差评预警",
    target: "空调分解清洗",
    city: "东京",
    owner: "客服组",
    sla: "剩余 18m",
    status: "处理中"
  },
  {
    id: "risk-2",
    level: "P2",
    type: "退款审核",
    target: "Shibuya Nail Atelier",
    city: "东京",
    owner: "财务组",
    sla: "剩余 2h",
    status: "待审核"
  },
  {
    id: "risk-3",
    level: "P2",
    type: "迟到补偿",
    target: "上门肩颈舒缓按摩",
    city: "大阪",
    owner: "运营组",
    sla: "剩余 4h",
    status: "待回访"
  },
  {
    id: "risk-4",
    level: "P3",
    type: "资质到期",
    target: "Calm Wellness 株式会社",
    city: "东京",
    owner: "商家运营",
    sla: "3 天",
    status: "已提醒"
  }
];

export const merchantHealthScores = [
  {
    merchant: "Calm Wellness 株式会社",
    score: 92,
    orders30d: 4820,
    replyRate: "98%",
    complaintRate: "1.2%",
    settlementStatus: "正常",
    action: "加大曝光"
  },
  {
    merchant: "Urban Beauty Partners",
    score: 84,
    orders30d: 2186,
    replyRate: "91%",
    complaintRate: "2.4%",
    settlementStatus: "待结算",
    action: "补充排班"
  },
  {
    merchant: "関東 Dining Group",
    score: 68,
    orders30d: 760,
    replyRate: "78%",
    complaintRate: "4.8%",
    settlementStatus: "审核中",
    action: "服务观察"
  }
];

export const permissionModules = [
  "Dashboard",
  "Operation Timeline",
  "Analytics",
  "Orders",
  "Field Jobs",
  "CRM",
  "Marketing",
  "Finance",
  "Reviews",
  "Merchants",
  "Store Scheduling Overview",
  "Store Scheduling Automation",
  "Store Dispatch",
  "Store Inventory",
  "Store Stage Layout"
];
