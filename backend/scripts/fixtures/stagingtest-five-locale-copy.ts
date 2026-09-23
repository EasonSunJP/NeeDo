import type { ContentLocaleCode } from "../../src/constants/content-locales";

type TranslatedText = { name: string; description: string };
type TranslatedMenu = TranslatedText & {
  audience: string;
  tags: string[];
  highlights: string[];
};
type ShopCopy = {
  description: string;
  address: string;
  area: string;
  businessHours: string;
  subtitle: string;
  station: string;
  distance: string;
  parking: string;
  routeGuide: string;
  paymentMethods: string[];
  equipment: string[];
  menus: Record<string, TranslatedMenu>;
};

export const stagingTestShopPublicId = "shop6333731099";
export const stagingTestSourceShopName = "StagingTest";
export const stagingTestSourceDescription = "渋谷駅近くで、ボディケア・ヘッドケア・訪問リラクゼーションを提供する総合ウェルネスサロンです。";

export const stagingTestShopCopy = {
  "zh-CN": {
    description: "位于涩谷站附近的综合放松沙龙，提供身体护理、头部护理和上门放松服务。",
    address: "东京都涩谷区道玄坂1-12-1",
    area: "东京都",
    businessHours: "10:00–22:00（最晚受理 20:30）",
    subtitle: "根据当天的身体状态选择，提供到店和上门服务的放松沙龙",
    station: "涩谷站",
    distance: "从涩谷站步行约3分钟",
    parking: "请使用附近的收费停车场。",
    routeGuide: "从涩谷站西口朝道玄坂方向走，从涩谷 Mark City 旁的入口进入。",
    paymentMethods: ["现金", "信用卡", "NDP"],
    equipment: ["独立房间", "更衣用品", "Wi-Fi", "充电器"],
    menus: {
      "アロマボディケア 60分": {
        name: "芳香身体护理 60分钟",
        description: "选择喜欢的天然芳香，细致放松肩部、背部和双腿的60分钟到店服务。",
        audience: "希望放松全身疲劳的顾客",
        tags: ["芳香护理", "全身护理"],
        highlights: ["可选择香味", "仅限到店"]
      },
      "出張リラクゼーション 90分": {
        name: "上门放松护理 90分钟",
        description: "前往您家中或酒店，结合全身身体护理与头部护理的90分钟服务。",
        audience: "希望在家中或酒店接受服务的顾客",
        tags: ["上门服务", "90分钟"],
        highlights: ["到指定地点服务", "全身及头部护理"]
      },
      "ドライヘッドケア 45分": {
        name: "干式头部护理 45分钟",
        description: "无需水或精油，护理头部、眼周、颈部和肩部的45分钟到店放松服务。",
        audience: "感觉眼部、头部或颈肩疲劳的顾客",
        tags: ["头部护理", "45分钟"],
        highlights: ["不使用水或精油", "短时间放松"]
      }
    }
  },
  "zh-TW": {
    description: "位於澀谷站附近的綜合放鬆沙龍，提供身體護理、頭部護理和到府放鬆服務。",
    address: "東京都澀谷區道玄坂1-12-1",
    area: "東京都",
    businessHours: "10:00–22:00（最晚受理 20:30）",
    subtitle: "依當天的身體狀況選擇，提供到店和到府服務的放鬆沙龍",
    station: "澀谷站",
    distance: "從澀谷站步行約3分鐘",
    parking: "請使用附近的收費停車場。",
    routeGuide: "從澀谷站西口往道玄坂方向走，從澀谷 Mark City 旁的入口進入。",
    paymentMethods: ["現金", "信用卡", "NDP"],
    equipment: ["獨立房間", "更衣用品", "Wi-Fi", "充電器"],
    menus: {
      "アロマボディケア 60分": {
        name: "芳香身體護理 60分鐘",
        description: "選擇喜歡的天然芳香，細緻放鬆肩部、背部和雙腿的60分鐘到店服務。",
        audience: "希望舒緩全身疲勞的顧客",
        tags: ["芳香護理", "全身護理"],
        highlights: ["可選擇香味", "僅限到店"]
      },
      "出張リラクゼーション 90分": {
        name: "到府放鬆護理 90分鐘",
        description: "前往您家中或飯店，結合全身身體護理與頭部護理的90分鐘服務。",
        audience: "希望在家中或飯店接受服務的顧客",
        tags: ["到府服務", "90分鐘"],
        highlights: ["到指定地點服務", "全身及頭部護理"]
      },
      "ドライヘッドケア 45分": {
        name: "乾式頭部護理 45分鐘",
        description: "無需水或精油，護理頭部、眼周、頸部和肩部的45分鐘到店放鬆服務。",
        audience: "感覺眼部、頭部或頸肩疲勞的顧客",
        tags: ["頭部護理", "45分鐘"],
        highlights: ["不使用水或精油", "短時間放鬆"]
      }
    }
  },
  en: {
    description: "A wellness salon near Shibuya Station offering body care, head care, and relaxation visits.",
    address: "1-12-1 Dogenzaka, Shibuya, Tokyo",
    area: "Tokyo",
    businessHours: "10:00–22:00 (last appointment 20:30)",
    subtitle: "Relaxation at the salon or your location, tailored to how you feel today",
    station: "Shibuya Station",
    distance: "About a 3-minute walk from Shibuya Station",
    parking: "Please use a nearby paid parking lot.",
    routeGuide: "Leave Shibuya Station via the west exit, head toward Dogenzaka, and enter beside Shibuya Mark City.",
    paymentMethods: ["Cash", "Credit card", "NDP"],
    equipment: ["Private room", "Changing facilities", "Wi-Fi", "Charger"],
    menus: {
      "アロマボディケア 60分": {
        name: "Aroma Body Care · 60 min",
        description: "Choose a natural aroma and enjoy 60 minutes of attentive care for the shoulders, back, and legs at the salon.",
        audience: "Guests seeking relief from full-body fatigue",
        tags: ["Aromatherapy", "Full-body care"],
        highlights: ["Choose your aroma", "At the salon only"]
      },
      "出張リラクゼーション 90分": {
        name: "Relaxation Visit · 90 min",
        description: "A 90-minute visit to your home or hotel combining full-body care with head care.",
        audience: "Guests who prefer care at home or their hotel",
        tags: ["Mobile visit", "90 min"],
        highlights: ["Visit to your chosen location", "Body and head care"]
      },
      "ドライヘッドケア 45分": {
        name: "Dry Head Care · 45 min",
        description: "A 45-minute salon session for the head, eye area, neck, and shoulders, without water or oil.",
        audience: "Guests with tired eyes, head, neck, or shoulders",
        tags: ["Head care", "45 min"],
        highlights: ["No water or oil", "A short refresh"]
      }
    }
  },
  ko: {
    description: "시부야역 근처에서 바디 케어, 헤드 케어, 방문 릴랙세이션을 제공하는 종합 웰니스 살롱입니다.",
    address: "도쿄도 시부야구 도겐자카 1-12-1",
    area: "도쿄도",
    businessHours: "10:00–22:00 (마지막 접수 20:30)",
    subtitle: "그날의 컨디션에 맞춰 매장 방문 또는 출장 서비스를 선택할 수 있는 릴랙세이션 살롱",
    station: "시부야역",
    distance: "시부야역에서 도보 약 3분",
    parking: "인근 유료 주차장을 이용해 주세요.",
    routeGuide: "시부야역 서쪽 출구에서 도겐자카 방향으로 이동한 뒤 시부야 마크시티 옆 입구로 들어오세요.",
    paymentMethods: ["현금", "신용카드", "NDP"],
    equipment: ["개인실", "탈의 시설", "Wi-Fi", "충전기"],
    menus: {
      "アロマボディケア 60分": {
        name: "아로마 바디 케어 · 60분",
        description: "원하는 천연 아로마 향을 고르고 어깨, 등, 다리를 꼼꼼하게 관리하는 매장 전용 60분 코스입니다.",
        audience: "전신 피로를 풀고 싶은 고객",
        tags: ["아로마", "전신 케어"],
        highlights: ["향 선택 가능", "매장 전용"]
      },
      "出張リラクゼーション 90分": {
        name: "방문 릴랙세이션 · 90분",
        description: "자택이나 호텔로 방문해 전신 바디 케어와 헤드 케어를 함께 제공하는 90분 코스입니다.",
        audience: "자택이나 호텔에서 서비스를 받고 싶은 고객",
        tags: ["출장 서비스", "90분"],
        highlights: ["지정 장소 방문", "전신 및 헤드 케어"]
      },
      "ドライヘッドケア 45分": {
        name: "드라이 헤드 케어 · 45분",
        description: "물이나 오일 없이 머리, 눈가, 목과 어깨를 관리하는 매장 전용 45분 휴식 코스입니다.",
        audience: "눈, 머리, 목과 어깨가 피로한 고객",
        tags: ["헤드 케어", "45분"],
        highlights: ["물·오일 미사용", "짧은 휴식"]
      }
    }
  }
} satisfies Record<Exclude<ContentLocaleCode, "ja">, ShopCopy>;

export const stagingTestBioCopy = {
  "お客様の体調やご希望を丁寧に伺い、安心できる施術を心がけています。": {
    "zh-CN": "我会认真了解您的身体状态和需求，细心提供让您安心的护理。",
    "zh-TW": "我會仔細了解您的身體狀況和需求，用心提供讓您安心的護理。",
    en: "I listen carefully to your condition and preferences and aim to provide care you can feel comfortable with.",
    ko: "고객님의 컨디션과 원하시는 점을 세심하게 듣고 안심할 수 있는 케어를 제공하겠습니다."
  },
  "LifeDance の権限切替確認専用プロフィールです。予約受付には使用しません。": {
    "zh-CN": "此资料仅用于验证 LifeDance 身份权限切换，不用于接受预约。",
    "zh-TW": "此資料僅用於驗證 LifeDance 身分權限切換，不用於接受預約。",
    en: "This profile is for LifeDance identity and permission switching checks only. It is not used to accept bookings.",
    ko: "이 프로필은 LifeDance 신분 및 권한 전환 확인 전용이며 예약 접수에는 사용하지 않습니다."
  }
} satisfies Record<string, Record<Exclude<ContentLocaleCode, "ja">, string>>;

export const stagingTestEmptyBioPublicIds = ["s0000000003", "s0000000004", "s0000000005", "s1172921934", "s4954086098"] as const;
export const stagingTestEmptyBioCopy = {
  ja: "多言語表示とサービスカードの確認に使用するテスト用プロフィールです。サービス内容は各メニューをご確認ください。",
  "zh-CN": "此为用于验证多语言显示和服务卡的测试资料。服务内容请查看各项目说明。",
  "zh-TW": "此為用於驗證多語言顯示和服務卡的測試資料。服務內容請查看各項目說明。",
  en: "This is a test profile for checking multilingual display and service cards. See each service for details.",
  ko: "다국어 표시와 서비스 카드 확인을 위한 테스트용 프로필입니다. 자세한 내용은 각 서비스 메뉴를 확인해 주세요."
} satisfies Record<ContentLocaleCode, string>;

export const stagingTestServiceCopy = {
  "全身もみほぐし 60分": {
    "zh-CN": { name: "全身放松按摩 60分钟", description: "重点照顾肩、背、腰和双腿，细致放松全身疲劳的60分钟服务。适合下班后或日常保养。" },
    "zh-TW": { name: "全身放鬆按摩 60分鐘", description: "重點照顧肩、背、腰和雙腿，細緻舒緩全身疲勞的60分鐘服務。適合下班後或日常保養。" },
    en: { name: "Full-Body Massage · 60 min", description: "A careful 60-minute massage focused on the shoulders, back, lower back, and legs. Ideal after work or for regular maintenance." },
    ko: { name: "전신 마사지 · 60분", description: "어깨, 등, 허리, 다리를 중심으로 전신의 피로를 꼼꼼하게 풀어주는 60분 코스입니다. 퇴근 후나 일상 관리에 좋습니다." }
  },
  "施術延長 30分": {
    "zh-CN": { name: "护理延长 30分钟", description: "可加在常规项目后的30分钟延长服务。重点照顾在意的部位，让护理时间更加充裕。" },
    "zh-TW": { name: "護理延長 30分鐘", description: "可加在一般項目後的30分鐘延長服務。重點照顧在意的部位，讓護理時間更加充裕。" },
    en: { name: "Session Extension · 30 min", description: "Add 30 minutes to a regular session to spend extra time on the areas that need attention." },
    ko: { name: "관리 시간 연장 · 30분", description: "기본 코스에 30분을 추가해 신경 쓰이는 부위를 집중적으로 관리할 수 있는 연장 메뉴입니다." }
  },
  "アロマオイルトリートメント 60分": {
    "zh-CN": { name: "芳香精油护理 60分钟", description: "选择喜欢的香味，以芳香精油缓缓护理全身的60分钟服务，适合希望深度放松的顾客。" },
    "zh-TW": { name: "芳香精油護理 60分鐘", description: "選擇喜歡的香味，以芳香精油緩緩護理全身的60分鐘服務，適合希望深度放鬆的顧客。" },
    en: { name: "Aroma Oil Treatment · 60 min", description: "Choose your preferred aroma and enjoy a slow, full-body oil treatment for 60 minutes. Ideal for deeper relaxation." },
    ko: { name: "아로마 오일 트리트먼트 · 60분", description: "원하는 향을 고르고 아로마 오일로 전신을 천천히 관리하는 60분 코스입니다. 깊은 휴식을 원하는 분께 좋습니다." }
  },
  "ドライヘッドスパ 45分": {
    "zh-CN": { name: "干式头部护理 45分钟", description: "无需水或精油，细致放松头部、眼周和颈肩的45分钟服务。适合久坐办公或睡眠不足后的疲劳。" },
    "zh-TW": { name: "乾式頭部護理 45分鐘", description: "無需水或精油，細緻放鬆頭部、眼周和頸肩的45分鐘服務。適合久坐辦公或睡眠不足後的疲勞。" },
    en: { name: "Dry Head Spa · 45 min", description: "A 45-minute session for the head, eye area, neck, and shoulders without water or oil. Suited to desk-work fatigue or poor sleep." },
    ko: { name: "드라이 헤드 스파 · 45분", description: "물이나 오일 없이 머리, 눈가, 목과 어깨를 꼼꼼히 관리하는 45분 코스입니다. 사무 업무나 수면 부족으로 피로한 분께 좋습니다." }
  },
  "肩・首集中ケア 50分": {
    "zh-CN": { name: "肩颈重点护理 50分钟", description: "重点放松因久坐办公而容易疲劳的肩部和颈部，提供50分钟集中护理。" },
    "zh-TW": { name: "肩頸重點護理 50分鐘", description: "重點放鬆因久坐辦公而容易疲勞的肩部和頸部，提供50分鐘集中護理。" },
    en: { name: "Shoulder & Neck Care · 50 min", description: "A focused 50-minute session for shoulders and neck tired from desk work." },
    ko: { name: "어깨·목 집중 케어 · 50분", description: "사무 업무로 쉽게 피로해지는 어깨와 목을 집중적으로 풀어주는 50분 코스입니다." }
  },
  "フットリフレクソロジー 60分": {
    "zh-CN": { name: "足部反射护理 60分钟", description: "使用精油护理足底至小腿，帮助放松久站或长时间步行后的疲劳。" },
    "zh-TW": { name: "足部反射護理 60分鐘", description: "使用精油護理足底至小腿，幫助舒緩久站或長時間步行後的疲勞。" },
    en: { name: "Foot Reflexology · 60 min", description: "Oil care from the soles to the calves, designed for tired feet after standing or walking." },
    ko: { name: "풋 리플렉솔로지 · 60분", description: "발바닥부터 종아리까지 오일로 관리해 오래 서 있거나 걸어서 쌓인 피로를 풀어주는 코스입니다." }
  },
  "出張リラクゼーション 90分": {
    "zh-CN": { name: "上门放松护理 90分钟", description: "前往指定地点，结合全身身体护理与头部护理的90分钟服务。" },
    "zh-TW": { name: "到府放鬆護理 90分鐘", description: "前往指定地點，結合全身身體護理與頭部護理的90分鐘服務。" },
    en: { name: "Relaxation Visit · 90 min", description: "A 90-minute visit to your chosen location combining full-body care with head care." },
    ko: { name: "방문 릴랙세이션 · 90분", description: "지정하신 장소로 방문해 전신 바디 케어와 헤드 케어를 함께 제공하는 90분 코스입니다." }
  },
  "姿勢バランス調整 60分": {
    "zh-CN": { name: "姿势平衡护理 60分钟", description: "在了解身体活动习惯后，重点照顾背部和骨盆周围平衡的60分钟服务。" },
    "zh-TW": { name: "姿勢平衡護理 60分鐘", description: "了解身體活動習慣後，重點照顧背部和骨盆周圍平衡的60分鐘服務。" },
    en: { name: "Posture Balance Care · 60 min", description: "A 60-minute session focused on the back and pelvic area after discussing how you use your body." },
    ko: { name: "자세 균형 케어 · 60분", description: "몸을 사용하는 습관을 확인하면서 등과 골반 주변의 균형을 관리하는 60분 코스입니다." }
  },
  "ストレッチボディケア 70分": {
    "zh-CN": { name: "伸展身体护理 70分钟", description: "结合放松按摩与温和伸展，照顾全身活动范围的70分钟服务。" },
    "zh-TW": { name: "伸展身體護理 70分鐘", description: "結合放鬆按摩與溫和伸展，照顧全身活動範圍的70分鐘服務。" },
    en: { name: "Stretch & Body Care · 70 min", description: "A 70-minute session combining massage with gentle stretches to support comfortable full-body movement." },
    ko: { name: "스트레칭 바디 케어 · 70분", description: "마사지와 무리 없는 스트레칭을 함께해 전신의 움직임을 관리하는 70분 코스입니다." }
  },
  "睡眠サポートヘッドケア 50分": {
    "zh-CN": { name: "助眠头部护理 50分钟", description: "以平缓的节奏放松头部、眼周和颈肩，帮助您享受更舒适的休息时间。" },
    "zh-TW": { name: "舒眠頭部護理 50分鐘", description: "以平緩的節奏放鬆頭部、眼周和頸肩，幫助您享受更舒適的休息時間。" },
    en: { name: "Rest-Support Head Care · 50 min", description: "Gentle, steady care for the head, eye area, neck, and shoulders to support your time to rest." },
    ko: { name: "휴식 지원 헤드 케어 · 50분", description: "차분한 리듬으로 머리, 눈가, 목과 어깨를 관리해 편안한 휴식 시간을 돕는 코스입니다." }
  },
  "プレミアム全身ケア 90分": {
    "zh-CN": { name: "尊享全身护理 90分钟", description: "可根据当天的身体状态商量重点护理部位，享受充裕的90分钟全身服务。" },
    "zh-TW": { name: "尊享全身護理 90分鐘", description: "可依當天的身體狀況討論重點護理部位，享受充裕的90分鐘全身服務。" },
    en: { name: "Premium Full-Body Care · 90 min", description: "A relaxed 90-minute full-body session with focus areas discussed according to how you feel that day." },
    ko: { name: "프리미엄 전신 케어 · 90분", description: "당일 컨디션에 맞춰 집중 관리 부위를 상담하고 여유롭게 받는 90분 전신 케어입니다." }
  },
  "訪問リラクゼーション 90分": {
    "zh-CN": { name: "上门放松护理 90分钟", description: "由负责技师根据自身经验和护理方式提供的预约项目。" },
    "zh-TW": { name: "到府放鬆護理 90分鐘", description: "由負責技師依自身經驗和護理方式提供的預約項目。" },
    en: { name: "Relaxation Visit · 90 min", description: "A bookable service based on the assigned technician's experience and approach to care." },
    ko: { name: "방문 릴랙세이션 · 90분", description: "담당 테크니션의 경험과 관리 방식에 따라 제공되는 예약 메뉴입니다." }
  },
  "ヘッドケア 45分": {
    "zh-CN": { name: "头部护理 45分钟", description: "由负责技师根据自身经验和护理方式提供的预约项目。" },
    "zh-TW": { name: "頭部護理 45分鐘", description: "由負責技師依自身經驗和護理方式提供的預約項目。" },
    en: { name: "Head Care · 45 min", description: "A bookable service based on the assigned technician's experience and approach to care." },
    ko: { name: "헤드 케어 · 45분", description: "담당 테크니션의 경험과 관리 방식에 따라 제공되는 예약 메뉴입니다." }
  },
  "ボディケア 60分": {
    "zh-CN": { name: "身体护理 60分钟", description: "由负责技师根据自身经验和护理方式提供的预约项目。" },
    "zh-TW": { name: "身體護理 60分鐘", description: "由負責技師依自身經驗和護理方式提供的預約項目。" },
    en: { name: "Body Care · 60 min", description: "A bookable service based on the assigned technician's experience and approach to care." },
    ko: { name: "바디 케어 · 60분", description: "담당 테크니션의 경험과 관리 방식에 따라 제공되는 예약 메뉴입니다." }
  },
  "指圧・整体ボディケア 60分": {
    "zh-CN": { name: "指压与整体身体护理 60分钟", description: "结合指压与伸展，重点照顾颈部、肩部、背部、腰部和双腿的60分钟服务。可在涩谷地区到店接受护理。" },
    "zh-TW": { name: "指壓與整體身體護理 60分鐘", description: "結合指壓與伸展，重點照顧頸部、肩部、背部、腰部和雙腿的60分鐘服務。可在澀谷地區到店接受護理。" },
    en: { name: "Shiatsu & Body Care · 60 min", description: "A 60-minute session combining shiatsu and stretching for the neck, shoulders, back, lower back, and legs. Available at the Shibuya-area salon." },
    ko: { name: "지압·전신 바디 케어 · 60분", description: "지압과 스트레칭을 함께해 목, 어깨, 등, 허리, 다리를 관리하는 60분 코스입니다. 시부야 지역 매장에서 받을 수 있습니다." }
  },
  "アロマボディケア 60分": {
    "zh-CN": { name: "芳香身体护理 60分钟", description: "选择喜欢的天然芳香，细致放松肩部、背部和双腿的60分钟到店服务。" },
    "zh-TW": { name: "芳香身體護理 60分鐘", description: "選擇喜歡的天然芳香，細緻放鬆肩部、背部和雙腿的60分鐘到店服務。" },
    en: { name: "Aroma Body Care · 60 min", description: "Choose a natural aroma and enjoy 60 minutes of attentive care for the shoulders, back, and legs at the salon." },
    ko: { name: "아로마 바디 케어 · 60분", description: "원하는 천연 아로마 향을 고르고 어깨, 등, 다리를 꼼꼼하게 관리하는 매장 전용 60분 코스입니다." }
  }
} satisfies Record<string, Record<Exclude<ContentLocaleCode, "ja">, TranslatedText>>;
