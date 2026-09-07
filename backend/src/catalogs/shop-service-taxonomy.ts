export const TAXONOMY_LOCALES = ["zh-CN", "zh-TW", "ja", "en", "ko"] as const;
export type TaxonomyLocaleCode = (typeof TAXONOMY_LOCALES)[number];

export type BusinessQualificationPolicyCode =
  | "OPEN"
  | "PLATFORM_REVIEW"
  | "CONDITIONAL"
  | "QUALIFICATION_REVIEW";

export type ShopServiceCategorySeed = {
  code: string;
  labels: Record<TaxonomyLocaleCode, string>;
  qualificationPolicy: BusinessQualificationPolicyCode;
  sortOrder: number;
  keywords: Array<{
    code: string;
    labels: Record<TaxonomyLocaleCode, string>;
    qualificationPolicy: BusinessQualificationPolicyCode;
    sortOrder: number;
  }>;
};

type KeywordRow = readonly [string, string, string, string, string, string];
type CategoryRow = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  BusinessQualificationPolicyCode,
  readonly KeywordRow[]
];

const toLabels = (row: readonly [string, string, string, string, string]) => ({
  "zh-CN": row[0],
  "zh-TW": row[1],
  ja: row[2],
  en: row[3],
  ko: row[4]
});

const CATALOG_ROWS: readonly CategoryRow[] = [
  ["massage", "按摩服务", "按摩服務", "マッサージ", "Massage", "마사지", "PLATFORM_REVIEW", [
    ["massage_home_visit", "上门按摩", "到府按摩", "訪問マッサージ", "Home-visit Massage", "방문 마사지"],
    ["massage_shiatsu", "指压按摩", "指壓按摩", "指圧マッサージ", "Shiatsu Massage", "지압 마사지"],
    ["massage_aroma_oil", "精油按摩", "精油按摩", "アロマオイルマッサージ", "Aroma Oil Massage", "아로마 오일 마사지"],
    ["massage_neck_shoulders", "肩颈调理", "肩頸調理", "首・肩ケア", "Neck & Shoulder Care", "목·어깨 관리"],
    ["massage_foot", "足部按摩", "足部按摩", "フットマッサージ", "Foot Massage", "발 마사지"],
    ["massage_sports_recovery", "运动恢复按摩", "運動恢復按摩", "スポーツリカバリーマッサージ", "Sports Recovery Massage", "스포츠 회복 마사지"],
    ["massage_thai", "泰式按摩", "泰式按摩", "タイ古式マッサージ", "Thai Massage", "타이 마사지"],
    ["massage_tuina", "中式推拿", "中式推拿", "中国式推拿", "Chinese Tuina", "중국식 추나"],
    ["massage_lymphatic", "淋巴按摩", "淋巴按摩", "リンパマッサージ", "Lymphatic Massage", "림프 마사지"],
    ["massage_postpartum", "产后按摩", "產後按摩", "産後マッサージ", "Postpartum Massage", "산후 마사지"]
  ]],
  ["wellness", "放松疗愈", "放鬆療癒", "リラクゼーション", "Relaxation & Wellness", "릴랙세이션", "OPEN", [
    ["wellness_spa", "SPA护理", "SPA護理", "スパケア", "Spa Care", "스파 케어"],
    ["wellness_aromatherapy", "芳香疗愈", "芳香療癒", "アロマセラピー", "Aromatherapy", "아로마테라피"],
    ["wellness_head_relaxation", "头部放松", "頭部放鬆", "ヘッドリラクゼーション", "Head Relaxation", "두피 릴랙스"],
    ["wellness_sleep_relaxation", "睡眠放松", "睡眠放鬆", "睡眠リラクゼーション", "Sleep Relaxation", "수면 릴랙스"],
    ["wellness_meditation", "冥想引导", "冥想引導", "瞑想ガイド", "Guided Meditation", "명상 가이드"],
    ["wellness_heat_therapy", "温热护理", "溫熱護理", "温熱ケア", "Heat Therapy", "온열 케어"],
    ["wellness_fascia_relaxation", "筋膜放松", "筋膜放鬆", "筋膜リリース", "Fascial Release", "근막 이완"],
    ["wellness_stress_relief", "身心减压", "身心減壓", "ストレスケア", "Stress Relief", "스트레스 완화"],
    ["wellness_foot_bath", "足浴护理", "足浴護理", "足湯ケア", "Foot Bath Care", "족욕 케어"],
    ["wellness_recovery_program", "恢复调理方案", "恢復調理方案", "リカバリープログラム", "Recovery Program", "회복 프로그램"]
  ]],
  ["business", "商务接待", "商務接待", "ビジネス接遇", "Business Hospitality", "비즈니스 응대", "OPEN", [
    ["business_companion", "商务陪同", "商務陪同", "ビジネス同行", "Business Companion", "비즈니스 동행"],
    ["business_meeting_reception", "会议接待", "會議接待", "会議受付", "Meeting Reception", "회의 접대"],
    ["business_exhibition_reception", "展会接待", "展會接待", "展示会受付", "Exhibition Reception", "전시회 접대"],
    ["business_guest_guidance", "来宾引导", "來賓引導", "来賓案内", "Guest Guidance", "내빈 안내"],
    ["business_interpretation", "商务翻译", "商務翻譯", "ビジネス通訳", "Business Interpretation", "비즈니스 통역"],
    ["business_itinerary_support", "行程协助", "行程協助", "旅程サポート", "Itinerary Support", "일정 지원"],
    ["business_etiquette", "礼仪接待", "禮儀接待", "接遇・マナー", "Etiquette Reception", "의전 접대"],
    ["business_conference_assistant", "会务助理", "會務助理", "会務アシスタント", "Conference Assistant", "회의 도우미"],
    ["business_local_guide", "陪同导游", "陪同導遊", "同行ガイド", "Local Guide", "동행 가이드"],
    ["business_property_viewing", "看房陪同", "看房陪同", "物件内見同行", "Property Viewing Companion", "매물 견학 동행"]
  ]],
  ["pet", "宠物相关", "寵物相關", "ペットサービス", "Pet Services", "반려동물", "OPEN", [
    ["pet_home_feeding", "上门喂养", "到府餵養", "訪問給餌", "Home Pet Feeding", "방문 급식"],
    ["pet_dog_walking", "遛狗", "遛狗", "犬の散歩", "Dog Walking", "강아지 산책"],
    ["pet_boarding", "宠物寄养", "寵物寄養", "ペットホテル", "Pet Boarding", "반려동물 위탁"],
    ["pet_grooming", "宠物洗护美容", "寵物洗護美容", "ペットグルーミング", "Pet Grooming", "반려동물 미용"],
    ["pet_transport", "宠物接送", "寵物接送", "ペット送迎", "Pet Transport", "반려동물 이동"],
    ["pet_medical_companion", "宠物陪诊", "寵物陪診", "動物病院付き添い", "Veterinary Companion", "동물병원 동행"],
    ["pet_training", "宠物训练", "寵物訓練", "ペットトレーニング", "Pet Training", "반려동물 훈련"],
    ["pet_photography", "宠物摄影", "寵物攝影", "ペット撮影", "Pet Photography", "반려동물 촬영"],
    ["pet_home_cleaning", "宠物居家清洁", "寵物居家清潔", "ペット宅内清掃", "Pet Home Cleaning", "반려동물 집 청소"],
    ["pet_temporary_care", "宠物临时看护", "寵物臨時看護", "ペット一時預かり", "Temporary Pet Care", "반려동물 임시 돌봄"]
  ]],
  ["cleaning", "家政服务", "家政服務", "家事代行", "Home Services", "가사 서비스", "OPEN", [
    ["home_daily_cleaning", "日常保洁", "日常保潔", "日常清掃", "Regular Cleaning", "일상 청소"],
    ["home_deep_cleaning", "深度保洁", "深度保潔", "徹底清掃", "Deep Cleaning", "대청소"],
    ["home_kitchen_cleaning", "厨卫清洁", "廚衛清潔", "キッチン・水回り清掃", "Kitchen & Bath Cleaning", "주방·욕실 청소"],
    ["home_move_out_cleaning", "退房清扫", "退房清掃", "退去清掃", "Move-out Cleaning", "퇴거 청소"],
    ["home_appliance_cleaning", "家电清洗", "家電清洗", "家電クリーニング", "Appliance Cleaning", "가전 청소"],
    ["home_organization", "收纳整理", "收納整理", "整理収納", "Home Organization", "수납 정리"],
    ["home_laundry_ironing", "洗衣熨烫", "洗衣熨燙", "洗濯・アイロン", "Laundry & Ironing", "세탁·다림질"],
    ["home_cooking", "上门做饭", "到府做飯", "訪問料理", "Home Cooking", "방문 요리"],
    ["home_window_cleaning", "玻璃清洁", "玻璃清潔", "窓ガラス清掃", "Window Cleaning", "유리창 청소"],
    ["home_maintenance", "家居养护", "家居養護", "住まいのお手入れ", "Home Maintenance", "주거 관리"]
  ]],
  ["dining", "餐饮服务", "餐飲服務", "飲食サービス", "Dining Services", "외식 서비스", "CONDITIONAL", [
    ["dining_restaurant_reservation", "餐厅订位", "餐廳訂位", "レストラン予約", "Restaurant Reservation", "레스토랑 예약"],
    ["dining_private_room", "包间预订", "包廂預訂", "個室予約", "Private Room Reservation", "룸 예약"],
    ["dining_private_chef", "上门厨师", "到府廚師", "出張シェフ", "Private Chef", "출장 셰프"],
    ["dining_catering", "餐饮外烩", "餐飲外燴", "ケータリング", "Catering", "케이터링"],
    ["dining_banquet", "宴会预订", "宴會預訂", "宴会予約", "Banquet Reservation", "연회 예약"],
    ["dining_coffee_break", "茶歇服务", "茶歇服務", "コーヒーブレイク", "Coffee Break Service", "커피 브레이크"],
    ["dining_bento", "便当配送", "便當配送", "弁当配達", "Bento Delivery", "도시락 배송"],
    ["dining_bar_reservation", "酒吧预订", "酒吧預訂", "バー予約", "Bar Reservation", "바 예약"],
    ["dining_food_guide", "美食向导", "美食嚮導", "グルメガイド", "Food Guide", "맛집 가이드"],
    ["dining_reservation_concierge", "餐饮预约管家", "餐飲預約管家", "飲食予約コンシェルジュ", "Dining Concierge", "외식 예약 컨시어지"]
  ]],
  ["repair", "上门维修", "到府維修", "訪問修理", "On-site Repair", "방문 수리", "CONDITIONAL", [
    ["repair_aircon_cleaning", "空调清洗", "空調清洗", "エアコン清掃", "Air Conditioner Cleaning", "에어컨 청소"],
    ["repair_aircon", "空调维修", "空調維修", "エアコン修理", "Air Conditioner Repair", "에어컨 수리"],
    ["repair_plumbing_electrical", "水电维修", "水電維修", "水道・電気修理", "Plumbing & Electrical Repair", "수도·전기 수리"],
    ["repair_pipe_unblocking", "管道疏通", "管道疏通", "排水管詰まり除去", "Pipe Unblocking", "배관 뚫음"],
    ["repair_appliance", "家电维修", "家電維修", "家電修理", "Appliance Repair", "가전 수리"],
    ["repair_furniture_assembly", "家具安装", "家具安裝", "家具組み立て", "Furniture Assembly", "가구 조립"],
    ["repair_locksmith", "锁具维修", "鎖具維修", "鍵修理", "Locksmith", "열쇠 수리"],
    ["repair_phone_computer", "手机电脑维修", "手機電腦維修", "スマホ・PC修理", "Phone & Computer Repair", "휴대폰·컴퓨터 수리"],
    ["repair_doors_windows", "门窗维修", "門窗維修", "ドア・窓修理", "Door & Window Repair", "문·창문 수리"],
    ["repair_renovation", "装修翻新", "裝修翻新", "内装リフォーム", "Renovation", "인테리어 보수"]
  ]],
  ["medical_beauty", "医疗美容", "醫療美容", "美容医療", "Medical Aesthetics", "의료 미용", "QUALIFICATION_REVIEW", [
    ["medbeauty_skin_consultation", "医疗皮肤咨询", "醫療皮膚諮詢", "医療皮膚相談", "Medical Skin Consultation", "의료 피부 상담"],
    ["medbeauty_device_consultation", "光电项目咨询", "光電項目諮詢", "美容機器施術相談", "Aesthetic Device Consultation", "미용 장비 상담"],
    ["medbeauty_laser_hair_removal", "激光脱毛", "雷射脫毛", "医療レーザー脱毛", "Laser Hair Removal", "레이저 제모"],
    ["medbeauty_pigmentation", "医疗祛斑", "醫療祛斑", "医療シミ治療", "Medical Pigmentation Care", "의료 색소 치료"],
    ["medbeauty_acne", "医疗祛痘", "醫療祛痘", "医療ニキビ治療", "Medical Acne Care", "의료 여드름 치료"],
    ["medbeauty_injection_consultation", "注射美容咨询", "注射美容諮詢", "美容注射相談", "Aesthetic Injection Consultation", "미용 주사 상담"],
    ["medbeauty_postprocedure_care", "医美术后护理", "醫美術後護理", "美容医療術後ケア", "Post-procedure Care", "시술 후 관리"],
    ["medbeauty_skin_analysis", "医疗皮肤检测", "醫療皮膚檢測", "医療肌診断", "Medical Skin Analysis", "의료 피부 분석"],
    ["medbeauty_booking", "医疗美容预约", "醫療美容預約", "美容医療予約", "Medical Aesthetics Booking", "의료 미용 예약"],
    ["medbeauty_doctor_consultation", "医生面诊预约", "醫師面診預約", "医師診察予約", "Doctor Consultation Booking", "의사 상담 예약"]
  ]],
  ["photography", "约拍摄影", "約拍攝影", "出張撮影", "Photography", "출장 촬영", "OPEN", [
    ["photo_portrait", "人像写真", "人像寫真", "ポートレート撮影", "Portrait Photography", "인물 촬영"],
    ["photo_business_headshot", "商务形象照", "商務形象照", "ビジネスプロフィール撮影", "Business Headshot", "비즈니스 프로필 촬영"],
    ["photo_couple", "情侣约拍", "情侶約拍", "カップル撮影", "Couple Photography", "커플 촬영"],
    ["photo_family", "家庭摄影", "家庭攝影", "家族撮影", "Family Photography", "가족 촬영"],
    ["photo_wedding", "婚礼跟拍", "婚禮跟拍", "ウェディング撮影", "Wedding Photography", "웨딩 촬영"],
    ["photo_event", "活动摄影", "活動攝影", "イベント撮影", "Event Photography", "행사 촬영"],
    ["photo_product", "商品摄影", "商品攝影", "商品撮影", "Product Photography", "상품 촬영"],
    ["photo_food", "餐饮摄影", "餐飲攝影", "料理撮影", "Food Photography", "음식 촬영"],
    ["photo_property", "房产摄影", "房產攝影", "物件撮影", "Property Photography", "부동산 촬영"],
    ["photo_short_video", "短视频拍摄", "短影片拍攝", "ショート動画撮影", "Short Video Production", "숏폼 영상 촬영"]
  ]],
  ["secondhand_recycling", "二手回收", "二手回收", "リユース買取", "Second-hand & Recycling", "중고 매입", "CONDITIONAL", [
    ["recycle_appliance", "家电回收", "家電回收", "家電買取", "Appliance Recycling", "가전 매입"],
    ["recycle_furniture", "家具回收", "家具回收", "家具買取", "Furniture Recycling", "가구 매입"],
    ["recycle_digital", "手机数码回收", "手機數位回收", "スマホ・デジタル買取", "Digital Device Recycling", "디지털 기기 매입"],
    ["recycle_clothing", "衣物鞋包回收", "衣物鞋包回收", "衣類・靴・バッグ買取", "Clothing & Bag Recycling", "의류·신발·가방 매입"],
    ["recycle_books", "书籍回收", "書籍回收", "書籍買取", "Book Recycling", "도서 매입"],
    ["recycle_instruments", "乐器回收", "樂器回收", "楽器買取", "Instrument Recycling", "악기 매입"],
    ["recycle_precious_metals", "贵金属回收", "貴金屬回收", "貴金属買取", "Precious Metal Recycling", "귀금속 매입"],
    ["recycle_office_equipment", "办公设备回收", "辦公設備回收", "オフィス機器買取", "Office Equipment Recycling", "사무기기 매입"],
    ["recycle_home_valuation", "上门估价", "到府估價", "訪問査定", "Home Valuation", "방문 감정"],
    ["recycle_removal", "回收搬运", "回收搬運", "回収・搬出", "Recycling Removal", "회수·운반"]
  ]],
  ["luxury_goods", "奢侈品服务", "奢侈品服務", "ラグジュアリーサービス", "Luxury Goods Services", "명품 서비스", "CONDITIONAL", [
    ["luxury_authentication", "奢侈品鉴定", "奢侈品鑑定", "ブランド品鑑定", "Luxury Authentication", "명품 감정"],
    ["luxury_bag_care", "名包养护", "名包養護", "ブランドバッグケア", "Luxury Bag Care", "명품 가방 관리"],
    ["luxury_watch_care", "名表养护", "名錶養護", "高級時計ケア", "Luxury Watch Care", "명품 시계 관리"],
    ["luxury_jewelry_care", "珠宝养护", "珠寶養護", "ジュエリーケア", "Jewelry Care", "주얼리 관리"],
    ["luxury_cleaning", "奢侈品清洗", "奢侈品清洗", "ブランド品クリーニング", "Luxury Cleaning", "명품 세척"],
    ["luxury_repair", "奢侈品维修", "奢侈品維修", "ブランド品修理", "Luxury Repair", "명품 수리"],
    ["luxury_restoration", "奢侈品修复", "奢侈品修復", "ブランド品修復", "Luxury Restoration", "명품 복원"],
    ["luxury_buyback", "奢侈品回收", "奢侈品回收", "ブランド品買取", "Luxury Buyback", "명품 매입"],
    ["luxury_consignment", "奢侈品寄卖", "奢侈品寄賣", "ブランド品委託販売", "Luxury Consignment", "명품 위탁 판매"],
    ["luxury_valuation", "奢侈品估价", "奢侈品估價", "ブランド品査定", "Luxury Valuation", "명품 가치 평가"]
  ]],
  ["moving_delivery", "搬家配送", "搬家配送", "引越し・配送", "Moving & Delivery", "이사·배송", "CONDITIONAL", [
    ["moving_local", "同城搬家", "同城搬家", "近距離引越し", "Local Moving", "근거리 이사"],
    ["moving_small", "小型搬家", "小型搬家", "小規模引越し", "Small Move", "소형 이사"],
    ["moving_residential", "家庭搬家", "家庭搬家", "家族引越し", "Residential Moving", "가정 이사"],
    ["moving_office", "办公室搬迁", "辦公室搬遷", "オフィス移転", "Office Moving", "사무실 이전"],
    ["moving_packing", "打包整理", "打包整理", "梱包・整理", "Packing Service", "포장 정리"],
    ["moving_furniture_disassembly", "家具拆装", "家具拆裝", "家具分解・組立", "Furniture Disassembly", "가구 분해·조립"],
    ["moving_same_day_delivery", "同城配送", "同城配送", "当日配送", "Same-day Delivery", "당일 배송"],
    ["moving_storage", "临时仓储", "臨時倉儲", "一時保管", "Temporary Storage", "임시 보관"],
    ["moving_disposal", "搬家清运", "搬家清運", "引越し不用品処分", "Moving Disposal", "이사 폐기물 처리"],
    ["moving_large_item", "大件搬运", "大型物件搬運", "大型荷物運搬", "Large-item Moving", "대형 물품 운반"]
  ]],
  ["beauty", "美容美甲", "美容美甲", "美容・ネイル", "Beauty & Nails", "뷰티·네일", "CONDITIONAL", [
    ["beauty_home_service", "上门美业", "到府美業", "訪問美容", "Home Beauty Service", "방문 뷰티"],
    ["beauty_manicure", "美甲", "美甲", "ネイル", "Manicure", "네일"],
    ["beauty_eyelash", "美睫", "美睫", "まつげ施術", "Eyelash Service", "속눈썹"],
    ["beauty_makeup", "化妆造型", "化妝造型", "メイクアップ", "Makeup Styling", "메이크업"],
    ["beauty_hair_styling", "发型造型", "髮型造型", "ヘアセット", "Hair Styling", "헤어 스타일링"],
    ["beauty_haircut_color", "剪发染发", "剪髮染髮", "カット・カラー", "Haircut & Color", "커트·염색"],
    ["beauty_facial", "面部护理", "面部護理", "フェイシャルケア", "Facial Care", "페이셜 케어"],
    ["beauty_eyebrow", "眉形设计", "眉型設計", "眉デザイン", "Eyebrow Design", "눈썹 디자인"],
    ["beauty_bridal_makeup", "新娘跟妆", "新娘跟妝", "ブライダルメイク", "Bridal Makeup", "웨딩 메이크업"],
    ["beauty_image_consulting", "形象咨询", "形象諮詢", "イメージコンサルティング", "Image Consulting", "이미지 컨설팅"]
  ]],
  ["maternity_childcare", "母婴与月嫂", "母嬰與月嫂", "産後・育児ケア", "Maternity & Childcare", "산후·육아", "QUALIFICATION_REVIEW", [
    ["childcare_maternity_nurse", "月嫂服务", "月嫂服務", "産後ケアスタッフ", "Maternity Nurse", "산후 도우미"],
    ["childcare_newborn", "新生儿护理", "新生兒護理", "新生児ケア", "Newborn Care", "신생아 돌봄"],
    ["childcare_postpartum", "产妇护理", "產婦護理", "産婦ケア", "Postpartum Care", "산모 돌봄"],
    ["childcare_babysitting", "临时育儿", "臨時育兒", "一時保育", "Babysitting", "임시 육아"],
    ["childcare_lactation", "母乳喂养指导", "母乳餵養指導", "授乳サポート", "Lactation Guidance", "모유 수유 지도"],
    ["childcare_postpartum_recovery", "产后恢复", "產後恢復", "産後リカバリー", "Postpartum Recovery", "산후 회복"],
    ["childcare_baby_bath", "婴儿洗护", "嬰兒洗護", "ベビーバスケア", "Baby Bath Care", "아기 목욕 관리"],
    ["childcare_baby_food", "辅食制作", "副食品製作", "離乳食づくり", "Baby Food Preparation", "이유식 만들기"],
    ["childcare_overnight", "夜间照护", "夜間照護", "夜間育児ケア", "Overnight Childcare", "야간 돌봄"],
    ["childcare_family_support", "育儿家庭支持", "育兒家庭支援", "子育て家庭支援", "Family Childcare Support", "육아 가정 지원"]
  ]],
  ["care", "健康与护理", "健康與護理", "健康・介護", "Health & Care", "건강·돌봄", "QUALIFICATION_REVIEW", [
    ["care_wellness", "康养护理", "康養護理", "ウェルネスケア", "Wellness Care", "웰니스 케어"],
    ["care_elderly", "老年照护", "老年照護", "高齢者ケア", "Elderly Care", "노인 돌봄"],
    ["care_rehabilitation", "康复陪练", "康復陪練", "リハビリ練習支援", "Rehabilitation Coaching", "재활 동행"],
    ["care_medical_companion", "陪诊服务", "陪診服務", "通院付き添い", "Medical Appointment Companion", "병원 동행"],
    ["care_nutrition", "营养指导", "營養指導", "栄養指導", "Nutrition Guidance", "영양 지도"],
    ["care_health_management", "健康管理", "健康管理", "健康管理サポート", "Health Management", "건강 관리"],
    ["care_foot", "足部护理", "足部護理", "フットケア", "Foot Care", "발 관리"],
    ["care_sleep_management", "睡眠管理", "睡眠管理", "睡眠管理サポート", "Sleep Management", "수면 관리"],
    ["care_medication_reminder", "用药提醒", "用藥提醒", "服薬リマインド", "Medication Reminder", "복약 알림"],
    ["care_home_support", "居家照护", "居家照護", "在宅ケア", "Home Care Support", "재택 돌봄"]
  ]],
  ["education_coaching", "教育与陪练", "教育與陪練", "教育・レッスン", "Education & Coaching", "교육·레슨", "CONDITIONAL", [
    ["education_home_tutor", "家庭教师", "家庭教師", "家庭教師", "Home Tutor", "가정교사"],
    ["education_english", "英语辅导", "英語輔導", "英語レッスン", "English Tutoring", "영어 과외"],
    ["education_japanese", "日语辅导", "日語輔導", "日本語レッスン", "Japanese Tutoring", "일본어 과외"],
    ["education_chinese", "中文辅导", "中文輔導", "中国語レッスン", "Chinese Tutoring", "중국어 과외"],
    ["education_homework", "作业辅导", "作業輔導", "宿題サポート", "Homework Support", "숙제 지도"],
    ["education_exam", "考试辅导", "考試輔導", "試験対策", "Exam Tutoring", "시험 지도"],
    ["education_music", "音乐陪练", "音樂陪練", "音楽練習サポート", "Music Practice Coaching", "음악 연습 지도"],
    ["education_art", "美术指导", "美術指導", "美術レッスン", "Art Coaching", "미술 지도"],
    ["education_programming", "编程辅导", "程式設計輔導", "プログラミング指導", "Programming Tutoring", "프로그래밍 지도"],
    ["education_fitness_coaching", "健身陪练", "健身陪練", "フィットネス指導", "Fitness Coaching", "피트니스 코칭"]
  ]],
  ["legal_professional", "法律与专业咨询", "法律與專業諮詢", "法務・専門相談", "Legal & Professional Services", "법률·전문 상담", "QUALIFICATION_REVIEW", [
    ["professional_legal_consultation", "法务咨询", "法務諮詢", "法務相談", "Legal Consultation", "법률 상담"],
    ["professional_contract_review", "合同审查", "合約審查", "契約書レビュー", "Contract Review", "계약서 검토"],
    ["professional_visa", "签证咨询", "簽證諮詢", "ビザ相談", "Visa Consultation", "비자 상담"],
    ["professional_company_registration", "公司注册咨询", "公司註冊諮詢", "会社設立相談", "Company Registration Consultation", "회사 설립 상담"],
    ["professional_labor", "劳务咨询", "勞務諮詢", "労務相談", "Labor Consultation", "노무 상담"],
    ["professional_tax", "税务咨询", "稅務諮詢", "税務相談", "Tax Consultation", "세무 상담"],
    ["professional_accounting", "会计咨询", "會計諮詢", "会計相談", "Accounting Consultation", "회계 상담"],
    ["professional_notarized_translation", "公证翻译", "公證翻譯", "公証翻訳", "Notarized Translation", "공증 번역"],
    ["professional_administrative_procedure", "行政手续代办", "行政手續代辦", "行政手続き支援", "Administrative Procedure Support", "행정 절차 대행"],
    ["professional_intellectual_property", "知识产权咨询", "智慧財產權諮詢", "知的財産相談", "Intellectual Property Consultation", "지식재산 상담"]
  ]],
  ["events_conferences", "活动与会务", "活動與會務", "イベント・会務", "Events & Conferences", "행사·컨벤션", "CONDITIONAL", [
    ["event_planning", "活动策划", "活動策劃", "イベント企画", "Event Planning", "행사 기획"],
    ["event_venue", "场地预订", "場地預訂", "会場予約", "Venue Reservation", "행사장 예약"],
    ["event_host", "主持服务", "主持服務", "司会サービス", "Event Host", "행사 진행"],
    ["event_staff", "活动执行人员", "活動執行人員", "イベント運営スタッフ", "Event Staff", "행사 운영 인력"],
    ["event_audio_lighting", "灯光音响", "燈光音響", "照明・音響", "Lighting & Audio", "조명·음향"],
    ["event_stage", "舞台搭建", "舞台搭建", "ステージ設営", "Stage Setup", "무대 설치"],
    ["event_booth", "展位搭建", "展位搭建", "ブース設営", "Booth Setup", "부스 설치"],
    ["event_reception", "活动礼仪", "活動禮儀", "イベント受付", "Event Reception", "행사 의전"],
    ["event_livestream", "活动直播", "活動直播", "イベント配信", "Event Livestream", "행사 라이브 방송"],
    ["event_equipment_rental", "活动设备租赁", "活動設備租賃", "イベント機材レンタル", "Event Equipment Rental", "행사 장비 대여"]
  ]]
] as const;

export const SHOP_SERVICE_TAXONOMY: ShopServiceCategorySeed[] = CATALOG_ROWS.map(
  ([code, zhCN, zhTW, ja, en, ko, qualificationPolicy, keywords], categoryIndex) => ({
    code,
    labels: toLabels([zhCN, zhTW, ja, en, ko]),
    qualificationPolicy,
    sortOrder: categoryIndex + 1,
    keywords: keywords.map(([keywordCode, kZhCN, kZhTW, kJa, kEn, kKo], keywordIndex) => ({
      code: keywordCode,
      labels: toLabels([kZhCN, kZhTW, kJa, kEn, kKo]),
      qualificationPolicy,
      sortOrder: keywordIndex + 1
    }))
  })
);
