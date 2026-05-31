export const approvedI18nSourceKeyReplacements = [
  ["可固定阿姨", "可长期"],
  ["修水管重点", "下水道维修"],
  ["覆盖修水管重点污渍与收纳归位。", "覆盖下水道周边重点污渍与收纳归位。"]
];

export const approvedI18nTranslationOverrides = [
  // Manual terminology lock: the product UI uses 店舗 for 商户 / 商家 in Japanese.
  // Keep these overrides so workbook imports cannot revert this wording to 事業者,
  // 販売業者, マーチャント, or 商人.
  [
    "商户",
    { ja: "店舗" }
  ],
  [
    "商家",
    { ja: "店舗" }
  ],
  [
    "商户端",
    { ja: "店舗側" }
  ],
  [
    "商户后台",
    { "zh-Hant": "商戶後台", ja: "店舗管理画面", en: "Business Management", ko: "사업자 관리 화면" }
  ],
  [
    "商家后台",
    { "zh-Hant": "商家後台", ja: "店舗管理画面", en: "Business Management", ko: "사업자 관리 화면" }
  ],
  [
    "商户后台导航",
    { "zh-Hant": "商戶後台導航", ja: "店舗管理画面ナビゲーション", en: "Business management navigation", ko: "사업자 관리 화면 내비게이션" }
  ],
  [
    "技师详情",
    { "zh-Hant": "技師詳情", ja: "スタッフ詳細", en: "Technician Details", ko: "기사 상세" }
  ],
  // Manual terminology lock: default/user-facing schedule labels use スケジュール.
  // Technician and merchant surfaces are context-locked to シフト in translations.ts.
  [
    "行程",
    { ja: "スケジュール" }
  ],
  [
    "日程",
    { ja: "スケジュール" }
  ],
  // Manual terminology lock: chat/privacy group wording uses グループ in Japanese.
  [
    "群",
    { ja: "グループ" }
  ],
  [
    "群信息",
    { "zh-Hant": "群組資訊", ja: "グループ情報", en: "Group info", ko: "그룹 정보" }
  ],
  [
    "群情報",
    { ja: "グループ情報", en: "Group info", ko: "그룹 정보" }
  ],
  [
    "私密群消息已隐藏",
    { "zh-Hant": "私密群訊息已隱藏", ja: "プライベートグループのメッセージは非表示", en: "Private group messages are hidden", ko: "비공개 그룹 메시지가 숨겨졌습니다" }
  ],
  [
    "プライベート 群情報隠れた",
    { ja: "プライベートグループのメッセージは非表示", en: "Private group messages are hidden", ko: "비공개 그룹 메시지가 숨겨졌습니다" }
  ],
  // Manual terminology lock: compact group permission labels use オーナー rather than グループオーナー.
  [
    "仅群主可编辑",
    { ja: "オーナーのみ編集可" }
  ],
  [
    "群主",
    { ja: "オーナー" }
  ],
  [
    "保存隐私设置",
    { ja: "設定を保存" }
  ],
  [
    "备注",
    { "zh-Hant": "備註", ja: "メモ", en: "Note", ko: "메모" }
  ],
  [
    "备注：",
    { "zh-Hant": "備註：", ja: "メモ：", en: "Note:", ko: "메모:" }
  ],
  // Manual terminology lock: IM disappearing conversations use プライベートモード.
  [
    "隐私模式",
    { ja: "プライベートモード" }
  ],
  [
    "完全隐私模式",
    { ja: "完全プライベートモード" }
  ],
  [
    "隐私模式设置已保存",
    { ja: "プライベートモード設定を保存しました" }
  ],
  [
    "隐私模式以外发送的信息不会被加入消失倒计时。",
    { ja: "プライベートモード以外で送信したメッセージは消失カウントダウンに入りません。" }
  ],
  [
    "只有群主可以开启或关闭隐私模式",
    { ja: "グループオーナーのみプライベートモードをオン/オフできます" }
  ],
  // Manual terminology lock: anonymous group privacy control copy.
  [
    "隐藏名称和资料",
    { ja: "名前とプロフィールを隠す" }
  ],
  [
    "名字会变为用户，个人资料将不再显示。",
    { ja: "名前はユーザーに変更され、プロフィールが表示されなくなります。" }
  ],
  [
    "是否隐藏成员名称和资料",
    { ja: "名前とプロフィールを隠すか" }
  ],
  [
    "查看隐藏名称和资料说明",
    { ja: "名前とプロフィール非表示の説明を見る" }
  ],
  [
    "消息免打扰",
    { ja: "通知をミュートする" }
  ],
  [
    "置顶聊天",
    { ja: "一番上に表示する" }
  ],
  [
    "查找聊天内容",
    { ja: "トークを検索" }
  ],
  [
    "退出群聊",
    { ja: "グループ解散／退会" }
  ],
  [
    "聊天快速搜索",
    { ja: "トークをクイック検索" }
  ],
  [
    "图片和视频",
    { ja: "画像および動画" }
  ],
  [
    "文件",
    { ja: "ファイル" }
  ],
  [
    "音乐和音频",
    { ja: "音楽とオーディオ" }
  ],
  [
    "交易",
    { ja: "取引" }
  ],
  [
    "小程序",
    { ja: "ミニプログラム" }
  ],
  [
    "频道",
    { ja: "チャンネル" }
  ],
  [
    "从联系人卡片添加",
    { ja: "連絡先カードから追加しました" }
  ],
  [
    "笔记",
    { ja: "ノート" }
  ],
  [
    "商品和店铺",
    { ja: "製品&ストア" }
  ],
  [
    "礼物",
    { ja: "ギフト" }
  ],
  [
    "贴纸",
    { ja: "ステッカー" }
  ],
  [
    "已支付",
    { "zh-Hant": "已支付", ja: "支払い済み", en: "Paid", ko: "결제 완료" }
  ],
  [
    "未支付",
    { "zh-Hant": "未支付", ja: "未払い", en: "Unpaid", ko: "미결제" }
  ],
  [
    "定金已支付",
    { "zh-Hant": "訂金已支付", ja: "予約金支払い済み", en: "Deposit paid", ko: "보증금 결제 완료" }
  ],
  [
    "已退款",
    { "zh-Hant": "已退款", ja: "返金済み", en: "Refunded", ko: "환불 완료" }
  ],
  [
    "关注",
    { "zh-Hant": "關注", ja: "フォロー", en: "Follow", ko: "팔로우" }
  ],
  [
    "已关注",
    { "zh-Hant": "已關注", ja: "フォロー中", en: "Following", ko: "팔로우 중" }
  ],
  [
    "未关注",
    { "zh-Hant": "未關注", ja: "未フォロー", en: "Not following", ko: "미팔로우" }
  ],
  [
    "非关注",
    { "zh-Hant": "非關注", ja: "未フォロー", en: "Not following", ko: "미팔로우" }
  ],
  [
    "推荐关注",
    { "zh-Hant": "推薦關注", ja: "おすすめフォロー", en: "Suggested follows", ko: "추천 팔로우" }
  ],
  // Manual terminology lock: 税込 means tax included for displayed prices, not after-tax income.
  [
    "含税",
    { "zh-Hant": "含稅", ja: "税込", en: "tax included", ko: "세금 포함" }
  ],
  [
    "(含税)",
    { "zh-Hant": "(含稅)", ja: "(税込)", en: "(tax included)", ko: "(세금 포함)" }
  ],
  [
    "税込",
    { "zh-Hant": "含稅", ja: "税込", en: "tax included", ko: "세금 포함" }
  ],
  [
    "商品小计（含税）",
    { "zh-Hant": "商品小計（含稅）", ja: "商品小計（税込）", en: "Item subtotal (tax included)", ko: "상품 소계(세금 포함)" }
  ],
  [
    "价格均以含税显示，可用加减按钮一次选择多个同一菜品。",
    { "zh-Hant": "價格均以含稅顯示，可用加減按鈕一次選擇多個同一菜品。", ja: "価格はすべて税込表示です。加減ボタンで同じ料理を複数選択できます。", en: "Prices are shown tax included. Use the plus and minus buttons to choose multiple quantities of the same item.", ko: "가격은 모두 세금 포함으로 표시됩니다. 더하기/빼기 버튼으로 같은 메뉴를 여러 개 선택할 수 있습니다." }
  ],
  [
    "税后",
    { "zh-Hant": "稅後", ja: "税引後", en: "after tax", ko: "세후" }
  ],
  [
    "关注关系",
    { "zh-Hant": "關注關係", ja: "フォロー関係", en: "Follow relationships", ko: "팔로우 관계" }
  ],
  [
    "上门肩颈舒缓",
    { "zh-Hant": "上門肩頸舒緩", ja: "訪問肩首リラクゼーション", en: "In-home neck and shoulder relief", ko: "방문 어깨·목 완화" }
  ],
  [
    "专业理疗师携带一次性用品到家服务，下班后也能快速预约。",
    {
      "zh-Hant": "專業理療師攜帶一次性用品到家服務，下班後也能快速預約。",
      ja: "専門セラピストが使い捨て用品を持参して訪問します。仕事帰りでもすぐに予約できます。",
      en: "Professional therapists bring disposable supplies to your home, so you can book quickly after work.",
      ko: "전문 테라피스트가 일회용품을 지참해 방문하며, 퇴근 후에도 빠르게 예약할 수 있습니다."
    }
  ],
  [
    "空调拆洗可拍照验收",
    { "zh-Hant": "空調拆洗可拍照驗收", ja: "エアコン分解洗浄は写真で確認可能", en: "Photo inspection for AC disassembly cleaning", ko: "에어컨 분해 청소 사진 검수 가능" }
  ],
  [
    "壁挂机拆盖清洗、防霉处理和完工记录，夏季前安排更省心。",
    {
      "zh-Hant": "壁掛機拆蓋清洗、防霉處理和完工記錄，夏季前安排更省心。",
      ja: "壁掛けエアコンのカバー分解洗浄、防カビ処理、完了記録まで対応。夏前の手配で安心です。",
      en: "Wall-mounted AC cover removal, cleaning, anti-mold treatment, and completion records make pre-summer care easier.",
      ko: "벽걸이 에어컨 커버 분해 청소, 곰팡이 방지 처리, 완료 기록까지 제공해 여름 전 관리가 더 안심됩니다."
    }
  ],
  [
    "查找服务",
    { "zh-Hant": "查找服務", ja: "サービス探し", en: "Find services", ko: "서비스 찾기" }
  ],
  [
    "附近技师",
    { "zh-Hant": "附近技師", ja: "スタッフ探し", en: "Find staff", ko: "주변 기사 찾기" }
  ],
  [
    "我的日程",
    { "zh-Hant": "我的行程", ja: "スケジュール", en: "My schedule", ko: "내 일정" }
  ],
  // Manual terminology lock: store detail map/profile copy uses Store,
  // Reservation, and treatment-seat wording consistently across imports.
  [
    "预约・营业补充",
    { "zh-Hant": "預約・營業補充", ja: "予約・営業時間の補足", en: "Reservation and hours details", ko: "예약 및 영업시간 보충 정보" }
  ],
  [
    "席位・服务补充",
    { "zh-Hant": "席位・服務補充", ja: "席・サービスの補足", en: "Seating and service details", ko: "좌석 및 서비스 상세 정보" }
  ],
  [
    "营业规则",
    { "zh-Hant": "營業規則", ja: "営業時間・予約ルール", en: "Hours and reservation rules", ko: "영업시간 및 예약 규칙" }
  ],
  [
    "营业与说明",
    { "zh-Hant": "營業與說明", ja: "営業時間・来店案内", en: "Hours and arrival notes", ko: "영업시간 및 방문 안내" }
  ],
  [
    "空间与服务",
    { "zh-Hant": "空間與服務", ja: "空間とサービス", en: "Space and services", ko: "공간 및 서비스" }
  ],
  [
    "席位信息",
    { "zh-Hant": "席位資訊", ja: "席情報", en: "Seat information", ko: "좌석 정보" }
  ],
  [
    "席位・设备",
    { "zh-Hant": "席位・設備", ja: "席・設備", en: "Seats and equipment", ko: "좌석 및 장비" }
  ],
  [
    "店铺基础信息",
    { "zh-Hant": "店鋪基礎資訊", ja: "店舗基本情報", en: "Basic store information", ko: "매장 기본 정보" }
  ],
  [
    "店铺信息",
    { "zh-Hant": "店鋪資訊", ja: "店舗情報", en: "Store information", ko: "매장 정보" }
  ],
  [
    "店铺详细信息",
    { "zh-Hant": "店鋪詳細資訊", ja: "店舗詳細情報", en: "Store details", ko: "매장 상세 정보" }
  ],
  [
    "预约・咨询",
    { "zh-Hant": "預約・諮詢", ja: "予約・問い合わせ", en: "Reservations and inquiries", ko: "예약 및 문의" }
  ],
  [
    "预约可否",
    { "zh-Hant": "可否預約", ja: "予約可否", en: "Reservation availability", ko: "예약 가능 여부" }
  ],
  [
    "最大预约人数",
    { "zh-Hant": "最大預約人數", ja: "最大予約人数", en: "Maximum reservation size", ko: "최대 예약 인원" }
  ],
  [
    "服务费・其他费用",
    { "zh-Hant": "服務費・其他費用", ja: "サービス料・その他費用", en: "Service and other fees", ko: "서비스 및 기타 요금" }
  ],
  [
    "费用说明",
    { "zh-Hant": "費用說明", ja: "料金詳細", en: "Fee details", ko: "요금 상세" }
  ],
  [
    "特点・相关信息",
    { "zh-Hant": "特色・相關資訊", ja: "特徴・関連情報", en: "Features and related information", ko: "특징 및 관련 정보" }
  ],
  [
    "利用场景",
    { "zh-Hant": "使用場景", ja: "利用シーン", en: "Best for", ko: "추천 상황" }
  ],
  [
    "位置氛围",
    { "zh-Hant": "位置氛圍", ja: "ロケーション・雰囲気", en: "Location and atmosphere", ko: "위치 및 분위기" }
  ],
  [
    "服务支持",
    { "zh-Hant": "服務支援", ja: "対応サービス", en: "Supported services", ko: "지원 서비스" }
  ],
  [
    "官方联系",
    { "zh-Hant": "官方聯絡", ja: "公式連絡先", en: "Official contact details", ko: "공식 연락처" }
  ],
  [
    "可立即预约",
    { "zh-Hant": "可立即預約", ja: "すぐ予約可", en: "Reserve now", ko: "즉시 예약 가능" }
  ],
  [
    "需确认时段",
    { "zh-Hant": "需確認時段", ja: "時間帯の確認が必要", en: "Time slot confirmation required", ko: "시간대 확인 필요" }
  ],
  [
    "约会准备",
    { "zh-Hant": "約會準備", ja: "お出かけ前の準備", en: "Pre-outing prep", ko: "외출 전 준비" }
  ],
  [
    "平台聊天咨询 / 立即预约",
    { "zh-Hant": "平台聊天諮詢 / 立即預約", ja: "プラットフォームチャット / 今すぐ予約", en: "Platform chat / Reserve now", ko: "플랫폼 채팅 / 즉시 예약" }
  ],
  [
    "电话咨询请以预约确认短信内联系方式为准。",
    { "zh-Hant": "電話諮詢請以預約確認簡訊內聯絡方式為準。", ja: "電話でのお問い合わせは、予約確認SMS内の連絡先を基準としてください。", en: "For phone inquiries, use the contact details in the reservation confirmation SMS.", ko: "전화 문의는 예약 확인 문자에 포함된 연락처를 기준으로 해 주세요." }
  ],
  [
    "平台预约确认后保留时段；延长、指名和房型追加费用以店铺确认为准。",
    { "zh-Hant": "平台預約確認後會保留時段；延長、指名和房型追加費用以店鋪確認為準。", ja: "プラットフォームで予約確定後に枠を確保します。延長、指名、部屋タイプの追加料金は店舗確認を基準とします。", en: "The time slot is held after platform confirmation; extensions, staff requests, and room surcharges are confirmed by the store.", ko: "플랫폼 예약 확정 후 시간대가 보류됩니다. 연장, 지명, 객실 추가 요금은 매장 확인 기준입니다." }
  ],
  [
    "平台预约确认后保留时段；追加设计、卸除和特殊材料费用以店铺确认为准。",
    { "zh-Hant": "平台預約確認後會保留時段；追加設計、卸除和特殊材料費用以店鋪確認為準。", ja: "プラットフォームで予約確定後に枠を確保します。追加デザイン、オフ、特殊材料費は店舗確認を基準とします。", en: "The time slot is held after platform confirmation; add-on design, removal, and special material fees are confirmed by the store.", ko: "플랫폼 예약 확정 후 시간대가 보류됩니다. 추가 디자인, 제거, 특수 재료 비용은 매장 확인 기준입니다." }
  ],
  [
    "可咨询。安静时段和团体护理请以店铺确认结果为准。",
    { "zh-Hant": "可諮詢。安靜時段和團體護理請以店鋪確認結果為準。", ja: "相談可。静かな時間帯やグループ施術は店舗確認を基準としてください。", en: "Available on request. Quiet slots and group treatments depend on store confirmation.", ko: "상담 가능합니다. 조용한 시간대와 단체 케어는 매장 확인 기준입니다." }
  ],
  [
    "可咨询。作品拍摄和多人护理请以店铺确认结果为准。",
    { "zh-Hant": "可諮詢。作品拍攝和多人護理請以店鋪確認結果為準。", ja: "相談可。作品撮影や複数名施術は店舗確認を基準としてください。", en: "Available on request. Photo shoots and group treatments depend on store confirmation.", ko: "상담 가능합니다. 작품 촬영과 다인 케어는 매장 확인 기준입니다." }
  ],
  [
    "到店后会确认作品相册、颜色样本和护理位准备情况。",
    { "zh-Hant": "到店後會確認作品相冊、顏色樣本和護理位準備情況。", ja: "来店後、作品アルバム、カラーサンプル、施術席の準備状況を確認します。", en: "After arrival, the portfolio, color samples, and treatment-seat readiness are confirmed.", ko: "도착 후 작품 앨범, 색상 샘플, 시술 좌석 준비 상태를 확인합니다." }
  ],
  [
    "单人护理位为主，适合午休补妆、下班整理和周末预约。",
    { "zh-Hant": "以單人護理位為主，適合午休補妝、下班整理和週末預約。", ja: "1名用の施術席が中心で、昼休みのメイク直し、仕事帰りのケア、週末予約に適しています。", en: "Mostly single treatment seats, suited for lunch touch-ups, after-work prep, and weekend reservations.", ko: "1인 시술 좌석 중심이며 점심시간 보정, 퇴근 후 정리, 주말 예약에 적합합니다." }
  ],
  [
    "套餐、畅饮和多人席可预约。",
    { "zh-Hant": "套餐、暢飲和多人席可預約。", ja: "コース、飲み放題、複数名席を予約できます。", en: "Courses, all-you-can-drink, and group seats can be reserved.", ko: "코스, 무제한 음료, 단체석 예약 가능." }
  ],
  [
    "隐秘感餐厅，适合朋友小聚和商务会食。",
    { "zh-Hant": "隱秘感餐廳，適合朋友小聚和商務會食。", ja: "隠れ家レストランで、友人との集まりやビジネス会食に適しています。", en: "A hideaway restaurant suited for friends and business dining.", ko: "숨은 맛집 분위기의 레스토랑으로 친구 모임과 비즈니스 회식에 적합합니다." }
  ],
  [
    "随时可约",
    { "zh-Hant": "隨時可約", ja: "いつでも予約可能", en: "Book anytime", ko: "언제든 예약 가능" }
  ],
  [
    "搜索推广链接、素材、数据",
    { "zh-Hant": "搜尋推廣連結、素材、資料", ja: "紹介リンク、素材、データを検索", en: "Search promotion links, creatives, and data", ko: "홍보 링크, 소재, 데이터 검색" }
  ],
  [
    "默认推广链接",
    { "zh-Hant": "預設推廣連結", ja: "デフォルト紹介リンク", en: "Default promotion link", ko: "기본 홍보 링크" }
  ],
  [
    "推广码",
    { "zh-Hant": "推廣碼", ja: "紹介コード", en: "Promotion code", ko: "홍보 코드" }
  ],
  [
    "QR码",
    { "zh-Hant": "QR 碼", ja: "QRコード", en: "QR code", ko: "QR 코드" }
  ],
  [
    "推广码：EASON2026　QR码：下载 / 复制 / 打印海报",
    {
      "zh-Hant": "推廣碼：EASON2026　QR 碼：下載 / 複製 / 列印海報",
      ja: "紹介コード：EASON2026　QRコード：ダウンロード / コピー / ポスター印刷",
      en: "Promotion code: EASON2026  QR code: download / copy / print poster",
      ko: "홍보 코드: EASON2026  QR 코드: 다운로드 / 복사 / 포스터 인쇄"
    }
  ],
  [
    "可结算",
    { "zh-Hant": "可結算", ja: "精算可能", en: "Available for settlement", ko: "정산 가능" }
  ],
  [
    "最近可结算",
    { "zh-Hant": "最近可結算", ja: "直近の精算可能額", en: "Recently available for settlement", ko: "최근 정산 가능" }
  ],
  [
    "确定天数",
    { "zh-Hant": "確定天數", ja: "確定日数", en: "Confirmed days", ko: "확정 일수" }
  ],
  [
    "已确定天数",
    { "zh-Hant": "已確定天數", ja: "確定済み日数", en: "Confirmed days", ko: "확정된 일수" }
  ],
  [
    "天数",
    { "zh-Hant": "天數", ja: "日数", en: "Days", ko: "일수" }
  ],
  [
    "4 单",
    { "zh-Hant": "4 單", ja: "4件", en: "4 orders", ko: "4건" }
  ],
  [
    "补充记录",
    { "zh-Hant": "補充記錄", ja: "補足記録", en: "Additional note", ko: "추가 기록" }
  ],
  [
    "临时请假",
    { "zh-Hant": "臨時請假", ja: "臨時休暇", en: "Temporary leave", ko: "임시 휴가" }
  ],
  [
    "申请 15:00-17:00 临时请假，等待店长确认。",
    {
      "zh-Hant": "申請 15:00-17:00 臨時請假，等待店長確認。",
      ja: "15:00-17:00の臨時休暇を申請しました。店長の確認待ちです。",
      en: "Requested temporary leave from 15:00 to 17:00, awaiting manager confirmation.",
      ko: "15:00-17:00 임시 휴가를 신청했으며 매니저 확인을 기다리고 있습니다."
    }
  ],
  [
    "迟到异常",
    { "zh-Hant": "遲到異常", ja: "遅刻例外", en: "Late exception", ko: "지각 예외" }
  ],
  [
    "请立即联系客人确认到达和开始服务。",
    {
      "zh-Hant": "請立即聯絡客人確認到達和開始服務。",
      ja: "すぐにお客様へ連絡し、到着とサービス開始を確認してください。",
      en: "Contact the customer immediately to confirm arrival and service start.",
      ko: "즉시 고객에게 연락해 도착 및 서비스 시작을 확인하세요."
    }
  ],
  [
    "搜索筛选",
    { "zh-Hant": "搜尋篩選", ja: "検索フィルター", en: "Search filters", ko: "검색 필터" }
  ],
  [
    "城市跟进",
    { "zh-Hant": "城市跟進", ja: "都市フォローアップ", en: "City follow-up", ko: "도시 후속 관리" }
  ],
  [
    "异常观察",
    { "zh-Hant": "異常觀察", ja: "例外監視", en: "Exception watch", ko: "예외 관찰" }
  ],
  [
    "定时发送",
    { "zh-Hant": "定時發送", ja: "予約送信", en: "Scheduled sending", ko: "예약 발송" }
  ],
  [
    "订单数",
    { "zh-Hant": "訂單數", ja: "注文数", en: "Order count", ko: "주문 수" }
  ],
  [
    "手续费",
    { "zh-Hant": "手續費", ja: "手数料", en: "Fee", ko: "수수료" }
  ],
  [
    "外国人対応",
    { "zh-Hant": "外國人対応", ja: "外国人対応", en: "Foreign guest support", ko: "외국인 응대" }
  ],
  [
    "🧳 外国人対応",
    { "zh-Hant": "🧳 外國人対応", ja: "🧳 外国人対応", en: "🧳 Foreign guest support", ko: "🧳 외국인 응대" }
  ],
  [
    "中文 / 外国人対応优先",
    { "zh-Hant": "中文 / 外國人対応優先", ja: "中国語 / 外国人対応優先", en: "Chinese / foreign guest support first", ko: "중국어 / 외국인 응대 우선" }
  ],
  [
    "5/3 可临时加开。",
    { "zh-Hant": "5/3 可臨時加開。", ja: "5/3は臨時追加できます。", en: "5/3 can be opened temporarily.", ko: "5/3에 임시 추가 운영이 가능합니다." }
  ],
  [
    "仅显示 confirmed slots",
    { "zh-Hant": "僅顯示 confirmed slots", ja: "confirmed slots のみ表示", en: "Show confirmed slots only", ko: "confirmed slots만 표시" }
  ],
  [
    "只读取最终 confirmed slots",
    { "zh-Hant": "只讀取最終 confirmed slots", ja: "最終 confirmed slots のみ読み取り", en: "Read final confirmed slots only", ko: "최종 confirmed slots만 읽기" }
  ],
  [
    "今日",
    { "zh-Hant": "今日", ja: "今日", en: "Today", ko: "오늘" }
  ],
  [
    "7日",
    { "zh-Hant": "7日", ja: "7日", en: "7d", ko: "7일" }
  ],
  [
    "点击",
    { "zh-Hant": "點擊", ja: "クリック", en: "Clicks", ko: "클릭" }
  ],
  [
    "注册",
    { "zh-Hant": "註冊", ja: "登録", en: "Signups", ko: "가입" }
  ],
  [
    "首单",
    { "zh-Hant": "首單", ja: "初回注文", en: "First orders", ko: "첫 주문" }
  ],
  [
    "待办提醒",
    { "zh-Hant": "待辦提醒", ja: "To-do reminders", en: "To-do reminders", ko: "할 일 알림" }
  ],
  [
    "复制",
    { "zh-Hant": "複製", ja: "コピー", en: "Copy", ko: "복사" }
  ],
  [
    "方案",
    { "zh-Hant": "方案", ja: "プラン", en: "Plan", ko: "플랜" }
  ],
  [
    "组织",
    { "zh-Hant": "組織", ja: "組織", en: "Organization", ko: "조직" }
  ],
  [
    "2 条佣金进入可结算",
    { "zh-Hant": "2 筆佣金進入可結算", ja: "2件のコミッションが精算可能になりました", en: "2 commissions are available for settlement", ko: "수수료 2건이 정산 가능 상태입니다" }
  ],
  [
    "1 个下级推广者待审核",
    { "zh-Hant": "1 位下級推廣者待審核", ja: "1名の下位紹介者が審査待ちです", en: "1 sub-promoter is pending review", ko: "하위 홍보자 1명이 심사 대기 중입니다" }
  ],
  [
    "素材「技师招募海报A」ROI 最高",
    { "zh-Hant": "素材「技師招募海報A」ROI 最高", ja: "素材「スタッフ募集ポスターA」のROIが最高です", en: "Creative \"Technician recruiting poster A\" has the highest ROI", ko: "소재 \"기사 모집 포스터 A\"의 ROI가 가장 높습니다" }
  ],
  [
    "活动预算消耗已达 82%",
    { "zh-Hant": "活動預算消耗已達 82%", ja: "キャンペーン予算の消化率が82%に達しました", en: "Campaign budget usage has reached 82%", ko: "캠페인 예산 사용률이 82%에 도달했습니다" }
  ],
  [
    "异常信息",
    { "zh-Hant": "異常資訊", ja: "異常情報", en: "Exception info", ko: "예외 정보" }
  ],
  [
    "休假申请",
    { "zh-Hant": "休假申請", ja: "休暇申請", en: "Leave requests", ko: "휴가 신청" }
  ],
  [
    "请假申请",
    { "zh-Hant": "請假申請", ja: "休暇申請", en: "Leave requests", ko: "휴가 신청" }
  ],
  [
    "已排班",
    { "zh-Hant": "已排班", ja: "シフト済み", en: "Scheduled", ko: "근무 배정됨" }
  ],
  [
    "店铺与商家",
    { "zh-Hant": "店鋪與商家", ja: "店舗と加盟店", en: "Stores and merchants", ko: "매장 및 사업자" }
  ],
  [
    "表现",
    { "zh-Hant": "表現", ja: "パフォーマンス", en: "Performance", ko: "성과" }
  ],
  [
    "组织表现",
    { "zh-Hant": "組織表現", ja: "組織パフォーマンス", en: "Organization performance", ko: "조직 성과" }
  ],
  [
    "代理",
    { "zh-Hant": "代理", ja: "代理", en: "Agent", ko: "대리" }
  ],
  [
    "稳定",
    { "zh-Hant": "穩定", ja: "安定", en: "Stable", ko: "안정" }
  ],
  [
    "店内周中加开席位",
    { "zh-Hant": "店內週間加開席位", ja: "店内の平日追加席", en: "Extra weekday in-store seats", ko: "평일 매장 내 추가 좌석" }
  ],
  [
    "周中预约增长，需要临时确认一名员工。",
    { "zh-Hant": "週間預約成長，需要臨時確認一名員工。", ja: "平日の予約が増えているため、スタッフ1名の臨時確認が必要です。", en: "Weekday reservations are increasing, so one staff member needs to be confirmed temporarily.", ko: "평일 예약이 증가해 직원 1명을 임시로 확인해야 합니다." }
  ],
  [
    "与当前已排时段重叠，需要立即改派或改时。",
    { "zh-Hant": "與目前已排時段重疊，需要立即改派或改時。", ja: "現在の割当済み時間帯と重複しています。すぐに再割当または時間変更が必要です。", en: "overlaps with the currently scheduled time slot and needs reassignment or rescheduling immediately.", ko: "현재 배정된 시간대와 겹치므로 즉시 재배정하거나 시간을 변경해야 합니다." }
  ],
  [
    "当前已排时段",
    { "zh-Hant": "目前已排時段", ja: "割当済み時間帯", en: "currently scheduled time slot", ko: "현재 배정된 시간대" }
  ],
  [
    "门店足底护理",
    { "zh-Hant": "店內足底護理", ja: "店内フットケア", en: "In-store foot care", ko: "매장 내 발 관리" }
  ],
  [
    "门店足底护理 60 分钟",
    { "zh-Hant": "店內足底護理 60 分鐘", ja: "店内フットケア 60分", en: "In-store foot care, 60 minutes", ko: "매장 내 발 관리 60분" }
  ],
  [
    "运动恢复",
    { "zh-Hant": "運動恢復", ja: "スポーツリカバリー", en: "Sports recovery", ko: "스포츠 회복" }
  ],
  [
    "上门运动恢复",
    { "zh-Hant": "上門運動恢復", ja: "訪問スポーツリカバリー", en: "In-home sports recovery", ko: "방문 스포츠 회복" }
  ],
  [
    "上门运动恢复 90 分钟",
    { "zh-Hant": "上門運動恢復 90 分鐘", ja: "訪問スポーツリカバリー 90分", en: "In-home sports recovery, 90 minutes", ko: "방문 스포츠 회복 90분" }
  ],
  [
    "改派",
    { "zh-Hant": "改派", ja: "再割当", en: "reassign", ko: "재배정" }
  ],
  [
    "改时",
    { "zh-Hant": "改時", ja: "時間変更", en: "reschedule", ko: "시간 변경" }
  ],
  [
    "日程视图",
    { "zh-Hant": "日程視圖", ja: "日程表示", en: "Schedule view", ko: "일정 보기" }
  ],
  [
    "预约详情",
    { "zh-Hant": "預約詳情", ja: "予約詳細", en: "Appointment details", ko: "예약 상세" }
  ],
  [
    "联系处理",
    { "zh-Hant": "聯絡處理", ja: "連絡対応", en: "Contact handling", ko: "연락 처리" }
  ],
  [
    "经典蓝黑",
    { "zh-Hant": "經典藍黑", ja: "ブルーブラック", en: "Blue-black", ko: "블루 블랙" }
  ],
  [
    "仍未安排技师",
    { "zh-Hant": "仍未安排技師", ja: "スタッフ未割り当て", en: "technician still unassigned", ko: "기사가 아직 배정되지 않음" }
  ],
  [
    "按店铺允许发布时段、店铺约束和个人偏好生成可发布上班时间。",
    {
      "zh-Hant": "按店鋪允許發布時段、店鋪約束和個人偏好生成可發布上班時間。",
      ja: "店舗で公開できる時間帯、店舗ルール、個人の希望に基づいて、公開可能な出勤時間を生成します。",
      en: "Generate publishable work hours from the store's allowed hours, store rules, and personal preferences.",
      ko: "매장에서 공개할 수 있는 시간대, 매장 규칙, 개인 선호를 기준으로 공개 가능한 근무 시간을 생성합니다."
    }
  ],
  [
    "按日、周、月查看全店预约，班次会作为时间轴背景辅助判断预约容量。",
    {
      "zh-Hant": "按日、週、月查看全店預約，班次會作為時間軸背景輔助判斷預約容量。",
      ja: "日別・週別・月別に店舗全体の予約を確認し、シフトをタイムライン背景として予約枠の判断に使います。",
      en: "View all store reservations by day, week, or month; shifts appear as a timeline background to help judge booking capacity.",
      ko: "일/주/월 단위로 매장 전체 예약을 보고, 근무표는 타임라인 배경으로 표시되어 예약 가능 용량 판단을 돕습니다."
    }
  ],
  [
    "按日期、按小时补充单日手动发布，结果会和模板一起发布。",
    {
      "zh-Hant": "按日期、按小時補充單日手動發布，結果會和範本一起發布。",
      ja: "日付と時間ごとに単日の手動公開分を追加し、テンプレートとあわせて公開します。",
      en: "Add one-day manual publishing by date and hour; the result will be published together with the template.",
      ko: "날짜와 시간별로 단일 날짜의 수동 게시 내용을 추가하고 템플릿과 함께 게시합니다."
    }
  ],
  [
    "按日期、按小时补充单日手动反馈，结果会和模板一起提交。",
    {
      "zh-Hant": "按日期、按小時補充單日手動回饋，結果會和範本一起提交。",
      ja: "日付と時間ごとに単日の手動フィードバックを追加し、テンプレートとあわせて送信します。",
      en: "Add one-day manual feedback by date and hour; the result will be submitted with the template.",
      ko: "날짜와 시간별로 단일 날짜의 수동 피드백을 추가하고 템플릿과 함께 제출합니다."
    }
  ],
  [
    "把特殊规则集中在一张卡里，和适用技师名单区分开，便于后续审计。",
    {
      "zh-Hant": "把特殊規則集中在一張卡裡，和適用技師名單區分開，便於後續稽核。",
      ja: "特別ルールを1枚のカードにまとめ、対象スタッフ一覧と分けて後から確認しやすくします。",
      en: "Keep special rules in one card, separate from the applicable technician list, so they are easier to audit later.",
      ko: "특수 규칙을 하나의 카드에 모으고 적용 대상 기사 목록과 분리해 이후 감사가 쉽도록 합니다."
    }
  ],
  [
    "班次背景用于辅助判断预约容量，请从排班页调整班次。",
    {
      "zh-Hant": "班次背景用於輔助判斷預約容量，請從排班頁調整班次。",
      ja: "シフト背景は予約枠の判断補助です。シフトの変更はシフトページで行ってください。",
      en: "Shift backgrounds help judge booking capacity. Adjust shifts from the scheduling page.",
      ko: "근무표 배경은 예약 가능 용량 판단을 돕기 위한 것입니다. 근무표 페이지에서 근무를 조정하세요."
    }
  ],
  [
    "保留当前排班，仅记录风险提示。",
    {
      "zh-Hant": "保留目前排班，僅記錄風險提示。",
      ja: "現在のシフトは維持し、リスク通知のみ記録します。",
      en: "Keep the current schedule and only record the risk notice.",
      ko: "현재 근무표는 유지하고 위험 알림만 기록합니다."
    }
  ],
  [
    "本次将由人工处理，长期智能规则保持不变。",
    {
      "zh-Hant": "本次將由人工處理，長期智能規則保持不變。",
      ja: "今回は手動で対応し、長期のスマートルールは変更しません。",
      en: "This case will be handled manually; long-term smart rules stay unchanged.",
      ko: "이번 건은 수동으로 처리하며 장기 스마트 규칙은 변경하지 않습니다."
    }
  ],
  [
    "本次将由人工处理，智能系统不会自动执行该异常的推荐方案。",
    {
      "zh-Hant": "本次將由人工處理，智能系統不會自動執行該異常的推薦方案。",
      ja: "今回は手動で対応します。スマートシステムはこの例外の推奨案を自動実行しません。",
      en: "This case will be handled manually. The smart system will not automatically apply the recommended fix for this exception.",
      ko: "이번 건은 수동으로 처리합니다. 스마트 시스템은 이 예외의 추천 방안을 자동 실행하지 않습니다."
    }
  ],
  [
    "不强制收集技师反馈，技师端只读查看、确认收到或申请更改。",
    {
      "zh-Hant": "不強制收集技師回饋，技師端只讀查看、確認收到或申請更改。",
      ja: "スタッフからのフィードバック収集は必須にせず、スタッフ側では閲覧、受領確認、変更申請のみ行えます。",
      en: "Technician feedback is not mandatory; technicians can only view, acknowledge receipt, or request changes.",
      ko: "기사 피드백 수집은 필수가 아니며, 기사 앱에서는 조회, 수신 확인, 변경 신청만 가능합니다."
    }
  ],
  [
    "处理前会保留商户取消本次自动处理的入口。",
    {
      "zh-Hant": "處理前會保留商戶取消本次自動處理的入口。",
      ja: "処理前に、事業者が今回の自動処理をキャンセルできる入口を残します。",
      en: "Before processing, keep an entry for the business to cancel this automated handling.",
      ko: "처리 전에 사업자가 이번 자동 처리를 취소할 수 있는 진입점을 유지합니다."
    }
  ],
  [
    "当前还没有可确认的排班周期，请先从“新建周期”开始。",
    {
      "zh-Hant": "目前還沒有可確認的排班週期，請先從「新建週期」開始。",
      ja: "確認できるシフト周期がまだありません。まず「新規周期」から始めてください。",
      en: "There is no scheduling cycle ready for confirmation yet. Start with \"New cycle\" first.",
      ko: "아직 확인할 수 있는 근무 주기가 없습니다. 먼저 \"새 주기\"에서 시작하세요."
    }
  ],
  [
    "当前还没有可显示的排班周期。",
    {
      "zh-Hant": "目前還沒有可顯示的排班週期。",
      ja: "表示できるシフト周期はまだありません。",
      en: "No scheduling cycles are available to display.",
      ko: "표시할 수 있는 근무 주기가 아직 없습니다."
    }
  ],
  [
    "当前活动流量使用平台 mock 基准。",
    {
      "zh-Hant": "目前活動流量使用平台 mock 基準。",
      ja: "現在のキャンペーン流入はプラットフォームのモック基準を使用しています。",
      en: "Current campaign traffic uses the platform mock baseline.",
      ko: "현재 캠페인 유입은 플랫폼 mock 기준값을 사용합니다."
    }
  ],
  [
    "当前没有可发布的店铺。",
    {
      "zh-Hant": "目前沒有可發布的店鋪。",
      ja: "公開できる店舗がありません。",
      en: "There are no stores available to publish.",
      ko: "게시할 수 있는 매장이 없습니다."
    }
  ],
  [
    "当前没有异常，智能排班结果可进入最终确认。",
    {
      "zh-Hant": "目前沒有異常，智能排班結果可進入最終確認。",
      ja: "例外はありません。スマートシフト結果を最終確認へ進められます。",
      en: "No exceptions found. The smart scheduling result can move to final confirmation.",
      ko: "예외가 없습니다. 스마트 근무표 결과를 최종 확인으로 진행할 수 있습니다."
    }
  ],
  [
    "当前日期没有 confirmed slots 可预约时间。",
    {
      "zh-Hant": "目前日期沒有 confirmed slots 可預約時間。",
      ja: "現在の日付には confirmed slots の予約可能時間がありません。",
      en: "There are no bookable confirmed slots for the selected date.",
      ko: "현재 날짜에는 예약 가능한 confirmed slots가 없습니다."
    }
  ],
  [
    "当前日期没有最终确认后的可预约时间，请重新选择日期。",
    {
      "zh-Hant": "目前日期沒有最終確認後的可預約時間，請重新選擇日期。",
      ja: "選択した日付には最終確認済みの予約可能時間がありません。日付を選び直してください。",
      en: "The selected date has no bookable time after final confirmation. Please choose another date.",
      ko: "선택한 날짜에는 최종 확인된 예약 가능 시간이 없습니다. 날짜를 다시 선택하세요."
    }
  ],
  [
    "当前已有执行周期和待执行周期，无法继续新建。",
    {
      "zh-Hant": "目前已有執行週期和待執行週期，無法繼續新建。",
      ja: "実行中または実行待ちの周期がすでにあるため、新規作成できません。",
      en: "An active or pending cycle already exists, so you cannot create another one.",
      ko: "실행 중 또는 실행 대기 중인 주기가 이미 있어 새로 만들 수 없습니다."
    }
  ],
  [
    "当天 24 小时明细说明",
    {
      "zh-Hant": "當天 24 小時明細說明",
      ja: "当日の24時間詳細説明",
      en: "24-hour detail notes for the day",
      ko: "당일 24시간 상세 설명"
    }
  ],
  [
    "当天没有开放时段或排班记录。",
    {
      "zh-Hant": "當天沒有開放時段或排班記錄。",
      ja: "当日は公開時間帯またはシフト記録がありません。",
      en: "No open hours or shift records for this day.",
      ko: "해당 날짜에는 공개 시간대나 근무 기록이 없습니다."
    }
  ],
  [
    "当天移动时间需要预留。",
    {
      "zh-Hant": "當天移動時間需要預留。",
      ja: "当日は移動時間の確保が必要です。",
      en: "Travel time needs to be reserved for this day.",
      ko: "해당 날짜에는 이동 시간을 확보해야 합니다."
    }
  ],
  [
    "店长、前台、当班员工、平台调度",
    {
      "zh-Hant": "店長、前台、當班員工、平台調度",
      ja: "店長、受付、当番スタッフ、プラットフォーム調整",
      en: "Store manager, front desk, on-duty staff, platform dispatch",
      ko: "매장 관리자, 프런트, 당번 직원, 플랫폼 배정"
    }
  ],
  [
    "调度中心 / 排班当前周期确认",
    {
      "zh-Hant": "調度中心 / 排班目前週期確認",
      ja: "管理センター / シフトの現在周期確認",
      en: "Management Center / Current scheduling cycle confirmation",
      ko: "관리 센터 / 현재 근무 주기 확인"
    }
  ],
  [
    "发布后会经过商户规则校验，通过的时间会直接进入最终可预约时间。",
    {
      "zh-Hant": "發布後會經過商戶規則校驗，通過的時間會直接進入最終可預約時間。",
      ja: "公開後に事業者ルールでチェックされ、通過した時間は最終的な予約可能時間に入ります。",
      en: "After publishing, business rules will validate the time. Approved times go directly into final bookable hours.",
      ko: "게시 후 사업자 규칙 검증을 거치며, 통과한 시간은 최종 예약 가능 시간에 바로 반영됩니다."
    }
  ],
  [
    "服务后缓冲 / 5分钟",
    {
      "zh-Hant": "服務後緩衝 / 5 分鐘",
      ja: "サービス後バッファ / 5分",
      en: "Post-service buffer / 5 min",
      ko: "서비스 후 버퍼 / 5분"
    }
  ],
  [
    "汇总门店今日预约、可派员工、流水、顾客变化和需要你处理的事项。",
    {
      "zh-Hant": "彙總門店今日預約、可派員工、流水、顧客變化和需要你處理的事項。",
      ja: "本日の店舗予約、派遣可能スタッフ、売上、顧客変化、対応事項をまとめます。",
      en: "Summarize today's store reservations, dispatchable staff, revenue, customer changes, and items needing your attention.",
      ko: "오늘의 매장 예약, 배정 가능한 직원, 매출, 고객 변화, 처리할 항목을 요약합니다."
    }
  ],
  [
    "加班申请已记录为待商户处理，最终确认时会进入冲突与容量校验。",
    {
      "zh-Hant": "加班申請已記錄為待商戶處理，最終確認時會進入衝突與容量校驗。",
      ja: "残業申請は事業者対応待ちとして記録され、最終確認時に重複と容量チェックに入ります。",
      en: "The overtime request is recorded for business handling and will enter conflict and capacity checks at final confirmation.",
      ko: "연장 근무 신청은 사업자 처리 대기로 기록되며 최종 확인 시 충돌 및 용량 검증에 포함됩니다."
    }
  ],
  [
    "进入本次人工处理，系统不自动迁移高风险班次。",
    {
      "zh-Hant": "進入本次人工處理，系統不自動遷移高風險班次。",
      ja: "今回の手動対応に進みます。システムは高リスクシフトを自動移動しません。",
      en: "Enter manual handling for this case. The system will not automatically move high-risk shifts.",
      ko: "이번 건의 수동 처리로 진행합니다. 시스템은 고위험 근무를 자동 이동하지 않습니다."
    }
  ],
  [
    "可能已被调整或不属于当前门店，请返回日程重新选择。",
    {
      "zh-Hant": "可能已被調整或不屬於目前門店，請返回日程重新選擇。",
      ja: "変更済み、または現在の店舗に属していない可能性があります。スケジュールへ戻って選び直してください。",
      en: "It may have been adjusted or may not belong to the current store. Return to the schedule and select again.",
      ko: "이미 조정되었거나 현재 매장에 속하지 않을 수 있습니다. 일정으로 돌아가 다시 선택하세요."
    }
  ],
  [
    "模式已确认，继续进入规则设定。",
    {
      "zh-Hant": "模式已確認，繼續進入規則設定。",
      ja: "モードを確認しました。続けてルール設定へ進みます。",
      en: "Mode confirmed. Continue to rule settings.",
      ko: "모드가 확인되었습니다. 규칙 설정으로 계속 진행합니다."
    }
  ],
  [
    "排班当前周期确认、手动/自动/智能排班",
    {
      "zh-Hant": "排班目前週期確認、手動/自動/智能排班",
      ja: "シフトの現在周期確認、手動/自動/スマートシフト",
      en: "Current scheduling cycle confirmation, manual/auto/smart scheduling",
      ko: "현재 근무 주기 확인, 수동/자동/스마트 근무표"
    }
  ],
  [
    "排班质量达标时可自动确认。",
    {
      "zh-Hant": "排班品質達標時可自動確認。",
      ja: "シフト品質が基準を満たすと自動確認できます。",
      en: "The schedule can be auto-confirmed when quality meets the standard.",
      ko: "근무표 품질이 기준을 충족하면 자동 확인할 수 있습니다."
    }
  ],
  [
    "排班周期最长 1 年，请缩短周期后再保存。",
    {
      "zh-Hant": "排班週期最長 1 年，請縮短週期後再儲存。",
      ja: "シフト周期は最長1年です。周期を短くしてから保存してください。",
      en: "A scheduling cycle can be at most 1 year. Shorten the cycle before saving.",
      ko: "근무 주기는 최대 1년입니다. 주기를 줄인 뒤 저장하세요."
    }
  ],
  [
    "平台同类商户高峰覆盖率上升。",
    {
      "zh-Hant": "平台同類商戶高峰覆蓋率上升。",
      ja: "プラットフォーム上の同種事業者でピーク時間帯のカバー率が上がっています。",
      en: "Peak-hour coverage is increasing among similar businesses on the platform.",
      ko: "플랫폼 내 유사 사업자의 피크 시간대 커버율이 상승하고 있습니다."
    }
  ],
  [
    "启用全智能无人值守排班，商户端和技师端进入智能排班状态",
    {
      "zh-Hant": "啟用全智能無人值守排班，商戶端和技師端進入智能排班狀態",
      ja: "完全スマート無人シフトを有効にし、事業者側とスタッフ側をスマートシフト状態にします",
      en: "Enable fully automated smart scheduling and put the merchant and technician apps into smart scheduling mode",
      ko: "완전 자동 스마트 근무표를 활성화하고 사업자 앱과 기사 앱을 스마트 근무표 상태로 전환합니다"
    }
  ],
  [
    "切换日期或视图后，可以继续查看全店预约、班次背景和待确认时段。",
    {
      "zh-Hant": "切換日期或視圖後，可以繼續查看全店預約、班次背景和待確認時段。",
      ja: "日付や表示を切り替えた後も、店舗全体の予約、シフト背景、確認待ち時間帯を確認できます。",
      en: "After switching dates or views, you can still view all store reservations, shift backgrounds, and pending time slots.",
      ko: "날짜나 보기를 전환한 뒤에도 매장 전체 예약, 근무 배경, 확인 대기 시간대를 계속 볼 수 있습니다."
    }
  ],
  [
    "请假申请已记录为待商户处理，商户确认前最终排班不会自动变更。",
    {
      "zh-Hant": "請假申請已記錄為待商戶處理，商戶確認前最終排班不會自動變更。",
      ja: "休暇申請は事業者対応待ちとして記録されました。事業者が確認するまで最終シフトは自動変更されません。",
      en: "The leave request is recorded for business handling. The final schedule will not change automatically before the business confirms it.",
      ko: "휴가 신청은 사업자 처리 대기로 기록되었습니다. 사업자가 확인하기 전까지 최종 근무표는 자동으로 변경되지 않습니다."
    }
  ],
  [
    "请先填写完整上门地址，再提交预约。",
    {
      "zh-Hant": "請先填寫完整上門地址，再提交預約。",
      ja: "訪問先住所をすべて入力してから予約を送信してください。",
      en: "Enter the full visit address before submitting the reservation.",
      ko: "방문 주소를 모두 입력한 뒤 예약을 제출하세요."
    }
  ],
  [
    "商户保存后的正式班表才会进入用户端可预约容量。",
    {
      "zh-Hant": "商戶儲存後的正式班表才會進入用戶端可預約容量。",
      ja: "事業者が保存した正式シフト表のみがユーザー側の予約可能枠に反映されます。",
      en: "Only the official schedule saved by the business will count toward user-side bookable capacity.",
      ko: "사업자가 저장한 공식 근무표만 사용자 앱의 예약 가능 용량에 반영됩니다."
    }
  ],
  [
    "商圈大型活动暂未接入实时数据。",
    {
      "zh-Hant": "商圈大型活動暫未接入即時資料。",
      ja: "商圏の大型イベントはまだリアルタイムデータに接続されていません。",
      en: "Large local-area events are not connected to real-time data yet.",
      ko: "상권 대형 이벤트는 아직 실시간 데이터와 연결되지 않았습니다."
    }
  ],
  [
    "上传新的头图，保存后会立即更新当前资料页头图。",
    {
      "zh-Hant": "上傳新的頭圖，儲存後會立即更新目前資料頁頭圖。",
      ja: "新しいヘッダー画像をアップロードすると、保存後すぐに現在のプロフィールページに反映されます。",
      en: "Upload a new header image; after saving, it updates the current profile page immediately.",
      ko: "새 헤더 이미지를 업로드하면 저장 후 현재 프로필 페이지에 바로 반영됩니다."
    }
  ],
  [
    "生成后会记录系统为什么做出每一步处理。",
    {
      "zh-Hant": "生成後會記錄系統為什麼做出每一步處理。",
      ja: "生成後、システムが各処理を行った理由を記録します。",
      en: "After generation, the system records why it took each step.",
      ko: "생성 후 시스템이 각 처리 단계를 수행한 이유를 기록합니다."
    }
  ],
  [
    "手动点选上班时间并发布，通过店铺校验后直接进入最终可预约投影。",
    {
      "zh-Hant": "手動點選上班時間並發布，通過店鋪校驗後直接進入最終可預約投影。",
      ja: "出勤時間を手動で選んで公開します。店舗チェックを通過すると最終予約可能見込みに直接反映されます。",
      en: "Manually select and publish work hours. After store validation, they go directly into the final bookable projection.",
      ko: "근무 시간을 수동으로 선택해 게시합니다. 매장 검증을 통과하면 최종 예약 가능 예측에 바로 반영됩니다."
    }
  ],
  [
    "手动发布会直接编辑本周期上班时间，发布后进入最终可预约投影。",
    {
      "zh-Hant": "手動發布會直接編輯本週期上班時間，發布後進入最終可預約投影。",
      ja: "手動公開ではこの周期の出勤時間を直接編集し、公開後に最終予約可能見込みへ反映します。",
      en: "Manual publishing directly edits work hours in this cycle; after publishing, they enter the final bookable projection.",
      ko: "수동 게시는 이 주기의 근무 시간을 직접 편집하며, 게시 후 최종 예약 가능 예측에 반영됩니다."
    }
  ],
  [
    "通知候补技师补位，并按距离、技能和工时均衡排序。",
    {
      "zh-Hant": "通知候補技師補位，並按距離、技能和工時均衡排序。",
      ja: "候補スタッフに補充依頼を通知し、距離・スキル・勤務時間バランスで並べ替えます。",
      en: "Notify standby technicians to fill the slot, sorted by distance, skill, and work-hour balance.",
      ko: "대기 기사에게 보충 요청을 알리고 거리, 기술, 근무 시간 균형 기준으로 정렬합니다."
    }
  ],
  [
    "晚间只接店内服务。",
    {
      "zh-Hant": "晚間只接店內服務。",
      ja: "夜間は店内サービスのみ対応します。",
      en: "Evening hours accept in-store service only.",
      ko: "야간에는 매장 내 서비스만 받습니다."
    }
  ],
  [
    "已发布到本店，用户端和商户手机端会读取同一份内容。",
    {
      "zh-Hant": "已發布到本店，用戶端和商戶手機端會讀取同一份內容。",
      ja: "この店舗に公開しました。ユーザー側と事業者モバイル側は同じ内容を読み込みます。",
      en: "Published to this store. The user app and merchant mobile app will read the same content.",
      ko: "이 매장에 게시되었습니다. 사용자 앱과 사업자 모바일 앱은 같은 내용을 읽습니다."
    }
  ],
  [
    "已取消本次自动处理，该异常会进入人工处理队列。",
    {
      "zh-Hant": "已取消本次自動處理，該異常會進入人工處理佇列。",
      ja: "今回の自動処理をキャンセルしました。この例外は手動対応キューに入ります。",
      en: "Automated handling for this case has been canceled. The exception will enter the manual handling queue.",
      ko: "이번 자동 처리가 취소되었습니다. 해당 예외는 수동 처리 대기열로 들어갑니다."
    }
  ],
  [
    "已确认收到本次商户直接排班，日程已合并到我的日程。",
    {
      "zh-Hant": "已確認收到本次商戶直接排班，日程已合併到我的日程。",
      ja: "事業者による今回の直接シフトを受領確認しました。スケジュールは自分の予定に統合されました。",
      en: "Direct scheduling from the business has been acknowledged. The schedule has been merged into My Schedule.",
      ko: "이번 사업자 직접 근무 배정을 확인했습니다. 일정이 내 일정에 병합되었습니다."
    }
  ],
  [
    "已预约订单优先；请假、加班、时间调整通过申请进入商户处理。",
    {
      "zh-Hant": "已預約訂單優先；請假、加班、時間調整透過申請進入商戶處理。",
      ja: "予約済み注文を優先します。休暇、残業、時間調整は申請として事業者対応に入ります。",
      en: "Booked orders take priority; leave, overtime, and time changes go to the business as requests.",
      ko: "예약된 주문을 우선합니다. 휴가, 연장 근무, 시간 조정은 신청으로 사업자 처리에 들어갑니다."
    }
  ],
  [
    "优先通知当前无冲突且接受临时补位的技师。",
    {
      "zh-Hant": "優先通知目前無衝突且接受臨時補位的技師。",
      ja: "現在重複がなく、臨時補充を受け入れるスタッフへ優先通知します。",
      en: "Prioritize technicians with no current conflicts who accept temporary coverage.",
      ko: "현재 충돌이 없고 임시 보충을 수락하는 기사에게 우선 알립니다."
    }
  ],
  [
    "确认收到 / 申请更改",
    {
      "zh-Hant": "確認收到 / 申請更改",
      ja: "受領確認 / 変更申請",
      en: "Acknowledge / request changes",
      ko: "수신 확인 / 변경 신청"
    }
  ],
  [
    "可确认收到 / 申请更改",
    {
      "zh-Hant": "可確認收到 / 申請更改",
      ja: "受領確認 / 変更申請可",
      en: "Can acknowledge / request changes",
      ko: "수신 확인 / 변경 신청 가능"
    }
  ],
  [
    "请先智能生成排班。",
    {
      "zh-Hant": "請先智能生成排班。",
      ja: "先にスマートシフトを生成してください。",
      en: "Generate the smart schedule first.",
      ko: "먼저 스마트 근무표를 생성하세요."
    }
  ],
  [
    "排班周期最长 1 年。",
    {
      "zh-Hant": "排班週期最長 1 年。",
      ja: "シフト周期は最長1年です。",
      en: "A scheduling cycle can be at most 1 year.",
      ko: "근무 주기는 최대 1년입니다."
    }
  ],
  [
    "最终确认 / 待执行周期",
    {
      "zh-Hant": "最終確認 / 待執行週期",
      ja: "最終確認 / 実行待ち周期",
      en: "Final confirmation / pending cycle",
      ko: "최종 확인 / 실행 대기 주기"
    }
  ],
  [
    "周期日期不完整，请先选择开始和结束日期。",
    {
      "zh-Hant": "週期日期不完整，請先選擇開始和結束日期。",
      ja: "周期の日付が未完成です。開始日と終了日を先に選択してください。",
      en: "Cycle dates are incomplete. Select the start and end dates first.",
      ko: "주기 날짜가 완전하지 않습니다. 먼저 시작일과 종료일을 선택하세요."
    }
  ],
  [
    "周期日期不完整。",
    {
      "zh-Hant": "週期日期不完整。",
      ja: "周期の日付が未完成です。",
      en: "Cycle dates are incomplete.",
      ko: "주기 날짜가 완전하지 않습니다."
    }
  ],
  [
    "周期开始日期不能晚于结束日期。",
    {
      "zh-Hant": "週期開始日期不能晚於結束日期。",
      ja: "周期の開始日は終了日より後にできません。",
      en: "The cycle start date cannot be later than the end date.",
      ko: "주기 시작일은 종료일보다 늦을 수 없습니다."
    }
  ],
  [
    "预测 + 自动优化 + 异常队列",
    {
      "zh-Hant": "預測 + 自動優化 + 異常佇列",
      ja: "予測 + 自動最適化 + 例外キュー",
      en: "Forecasting + auto optimization + exception queue",
      ko: "예측 + 자동 최적화 + 예외 대기열"
    }
  ],
  [
    "PC 智能控制台",
    {
      "zh-Hant": "PC 智能控制台",
      ja: "PCスマートコンソール",
      en: "PC Smart Console",
      ko: "PC 스마트 콘솔"
    }
  ],
  [
    "PC 智能控制台说明",
    {
      "zh-Hant": "PC 智能控制台說明",
      ja: "PCスマートコンソールの説明",
      en: "PC Smart Console notes",
      ko: "PC 스마트 콘솔 설명"
    }
  ],
  [
    "NeeDo 用户端",
    { "zh-Hant": "NeeDo 用戶端", ja: "NeeDo ユーザーアプリ", en: "NeeDo User App", ko: "NeeDo 사용자 앱" }
  ],
  [
    "NeeDo 用戶端",
    { "zh-Hant": "NeeDo 用戶端", ja: "NeeDo ユーザーアプリ", en: "NeeDo User App", ko: "NeeDo 사용자 앱" }
  ],
  [
    "NeeDo 商户端",
    { "zh-Hant": "NeeDo 商戶端", ja: "NeeDo 店舗側", en: "NeeDo Merchant App", ko: "NeeDo 사업자 앱" }
  ],
  [
    "NeeDo 店铺端",
    { "zh-Hant": "NeeDo 店鋪端", ja: "NeeDo 店舗側", en: "NeeDo Merchant App", ko: "NeeDo 사업자 앱" }
  ],
  [
    "NeeDo 店鋪端",
    { "zh-Hant": "NeeDo 店鋪端", ja: "NeeDo 店舗側", en: "NeeDo Merchant App", ko: "NeeDo 사업자 앱" }
  ],
  [
    "NeeDo 技师端",
    { "zh-Hant": "NeeDo 技師端", ja: "NeeDo スタッフアプリ", en: "NeeDo Technician App", ko: "NeeDo 기사 앱" }
  ],
  [
    "NeeDo 技师支持",
    { "zh-Hant": "NeeDo 技師支援", ja: "NeeDo スタッフサポート", en: "NeeDo Technician Support", ko: "NeeDo 기사 지원" }
  ],
  [
    "NeeDo 商户后台",
    { "zh-Hant": "NeeDo 商戶後台", ja: "NeeDo 店舗管理画面", en: "NeeDo Business Management", ko: "NeeDo 사업자 관리 화면" }
  ],
  [
    "NeeDo 员工端",
    { "zh-Hant": "NeeDo 員工端", ja: "NeeDo スタッフアプリ", en: "NeeDo Staff App", ko: "NeeDo 스태프 앱" }
  ],
  [
    "NeeDo 員工端",
    { "zh-Hant": "NeeDo 員工端", ja: "NeeDo スタッフアプリ", en: "NeeDo Staff App", ko: "NeeDo 스태프 앱" }
  ],
  [
    "进入 NeeDo 用户端",
    { "zh-Hant": "進入 NeeDo 用戶端", ja: "NeeDo ユーザーアプリに入る", en: "Enter NeeDo User App", ko: "NeeDo 사용자 앱으로 이동" }
  ],
  [
    "进入 NeeDo 商户端",
    { "zh-Hant": "進入 NeeDo 商戶端", ja: "NeeDo 店舗側に入る", en: "Enter NeeDo Merchant App", ko: "NeeDo 사업자 앱으로 이동" }
  ],
  [
    "进入 NeeDo 技师端",
    { "zh-Hant": "進入 NeeDo 技師端", ja: "NeeDo スタッフアプリに入る", en: "Enter NeeDo Technician App", ko: "NeeDo 기사 앱으로 이동" }
  ],
  [
    "新需求",
    { "zh-Hant": "新需求", ja: "新しい需要", en: "New Need", ko: "새 필요" }
  ],
  [
    "新用户预约需求",
    { "zh-Hant": "新用戶預約需求", ja: "新規ユーザーの予約需要", en: "New user reservation Need", ko: "신규 사용자 예약 필요" }
  ],
  [
    "预约需求",
    { "zh-Hant": "預約需求", ja: "予約需要", en: "Reservation Need", ko: "예약 필요" }
  ],
  [
    "新增需求",
    { "zh-Hant": "新增需求", ja: "需要を追加", en: "Add Need", ko: "필요 추가" }
  ],
  [
    "返回需求",
    { "zh-Hant": "返回需求", ja: "需要に戻る", en: "Back to Need", ko: "필요로 돌아가기" }
  ],
  [
    "需求编号",
    { "zh-Hant": "需求編號", ja: "需要番号", en: "Need ID", ko: "필요 번호" }
  ],
  [
    "需求编号、服务名、联系人...",
    { "zh-Hant": "需求編號、服務名、聯絡人...", ja: "需要番号／サービス名／連絡先...", en: "Need ID, service name, contact...", ko: "필요 번호, 서비스명, 연락처..." }
  ],
  [
    "需求大厅",
    { "zh-Hant": "需求大廳", ja: "需要ホール", en: "Need Hall", ko: "필요 홀" }
  ],
  [
    "需求发布",
    { "zh-Hant": "需求發布", ja: "需要投稿", en: "Publish Need", ko: "필요 게시" }
  ],
  [
    "需求发出人",
    { "zh-Hant": "需求發出人", ja: "需要投稿者", en: "Need poster", ko: "필요 게시자" }
  ],
  [
    "需求发出人动态",
    { "zh-Hant": "需求發出人動態", ja: "需要投稿者のフィード", en: "Need poster feed", ko: "필요 게시자 피드" }
  ],
  [
    "需求沟通",
    { "zh-Hant": "需求溝通", ja: "需要の相談", en: "Need discussion", ko: "필요 상담" }
  ],
  [
    "需求流 / 可抢单列表",
    { "zh-Hant": "需求流 / 可搶單列表", ja: "需要フィード／受付可能リスト", en: "Need feed / Claimable list", ko: "필요 피드 / 수주 가능 목록" }
  ],
  [
    "需求确认",
    { "zh-Hant": "需求確認", ja: "需要確認", en: "Need confirmation", ko: "필요 확인" }
  ],
  [
    "需求预测",
    { "zh-Hant": "需求預測", ja: "需要予測", en: "Need forecast", ko: "필요 예측" }
  ],
  [
    "需求中心",
    { "zh-Hant": "需求中心", ja: "需要センター", en: "Need Center", ko: "필요 센터" }
  ],
  [
    "用户需求",
    { "zh-Hant": "用戶需求", ja: "ユーザー需要", en: "User Need", ko: "사용자 필요" }
  ],
  [
    "暂无匹配的需求",
    { "zh-Hant": "暫無匹配的需求", ja: "一致する需要はありません", en: "No matching Needs", ko: "일치하는 필요 없음" }
  ],
  [
    "用户提交的新需求，等待平台审核后进入需求流。",
    {
      "zh-Hant": "用戶提交的新需求，等待平台審核後進入需求流。",
      ja: "ユーザーが投稿した新しい需要です。プラットフォーム審査後に需要フィードへ入ります。",
      en: "A new Need submitted by a user. It enters the Need feed after platform review.",
      ko: "사용자가 제출한 새 필요입니다. 플랫폼 심사 후 필요 피드에 들어갑니다."
    }
  ],
  ["编辑情报展示", { "zh-Hant": "編輯情報展示", ja: "オファー表示を編集", en: "Edit Info display", ko: "정보 표시 편집" }],
  ["付费转发到 NeeDo 情报页", { "zh-Hant": "付費轉發到 NeeDo 情報頁", ja: "NeeDo オファーページへ有料シェア", en: "Paid forwarding to NeeDo Info page", ko: "NeeDo 정보 페이지로 유료 전달" }],
  ["情报编号", { "zh-Hant": "情報編號", ja: "オファー番号", en: "Info ID", ko: "정보 번호" }],
  ["情报编号、服务名、发布方...", { "zh-Hant": "情報編號、服務名、發布方...", ja: "オファー番号／サービス名／投稿者...", en: "Info ID, service name, publisher...", ko: "정보 번호, 서비스명, 게시자..." }],
  ["情报大厅", { "zh-Hant": "情報大廳", ja: "オファーホール", en: "Info Hall", ko: "정보 홀" }],
  ["情报发布", { "zh-Hant": "情報發布", ja: "オファー投稿", en: "Publish Info", ko: "정보 게시" }],
  ["情报流 / 可预约列表", { "zh-Hant": "情報流 / 可預約列表", ja: "オファーフィード／予約可能リスト", en: "Info feed / Bookable list", ko: "정보 피드 / 예약 가능 목록" }],
  ["情报详情", { "zh-Hant": "情報詳情", ja: "オファー詳細", en: "Info details", ko: "정보 상세" }],
  ["情报预览", { "zh-Hant": "情報預覽", ja: "オファープレビュー", en: "Info preview", ko: "정보 미리보기" }],
  ["情报中心", { "zh-Hant": "情報中心", ja: "オファーセンター", en: "Info Center", ko: "정보 센터" }],
  ["商户情报", { "zh-Hant": "商戶情報", ja: "店舗オファー", en: "Business Info", ko: "사업자 정보" }],
  ["新情报", { "zh-Hant": "新情報", ja: "新しいオファー", en: "New Info", ko: "새 정보" }],
  ["新增情报", { "zh-Hant": "新增情報", ja: "オファーを追加", en: "Add Info", ko: "정보 추가" }],
  ["最新情报", { "zh-Hant": "最新情報", ja: "最新オファー", en: "Latest Info", ko: "최신 정보" }],
  ["最新情报：", { "zh-Hant": "最新情報：", ja: "最新オファー：", en: "Latest Info:", ko: "최신 정보:" }],
  ["当前积分不足 1000 point，暂时无法发送到 NeeDo 情报页。", { "zh-Hant": "目前積分不足 1000 point，暫時無法發送到 NeeDo 情報頁。", ja: "現在のポイントが1000ポイント未満のため、NeeDo オファーページへ送信できません。", en: "The current point balance is below 1000, so this cannot be sent to the NeeDo Info page yet.", ko: "현재 포인트가 1000점 미만이어서 아직 NeeDo 정보 페이지로 보낼 수 없습니다." }],
  ["发布你的情报", { "zh-Hant": "發佈你的情報", ja: "あなたのオファーを投稿", en: "Publish your Info", ko: "내 정보 게시" }],
  ["发送情报", { "zh-Hant": "發送情報", ja: "オファーを送信", en: "Send Info", ko: "정보 보내기" }],
  ["这条需求或情报暂时无法打开，返回 NeeDo 列表后可以继续浏览其他内容。", { "zh-Hant": "這條需求或情報暫時無法打開，返回 NeeDo 清單後可以繼續瀏覽其他內容。", ja: "この需要またはオファーは現在開けません。NeeDoリストに戻ると、他の内容を引き続き閲覧できます。", en: "This Need or Info item cannot be opened right now. Return to the NeeDo list to keep browsing other content.", ko: "이 필요 또는 정보 항목은 현재 열 수 없습니다. NeeDo 목록으로 돌아가 다른 내용을 계속 볼 수 있습니다." }],
  ["更新记录：后台需求 / 情报中心和共享表格继续增强横向拖拽、筛选排序与可读列宽", { "zh-Hant": "更新記錄：後台需求 / 情報中心和共享表格繼續增強橫向拖拽、篩選排序與可讀列寬", ja: "更新記録：管理画面の需要／オファーセンターと共通テーブルで横ドラッグ、絞り込み排序、読みやすい列幅を強化", en: "Update: Backend Need / Info centers and shared tables now improve horizontal drag, filtering, sorting, and readable column widths", ko: "업데이트: 백엔드 필요 / 정보 센터와 공통 테이블의 가로 드래그, 필터, 정렬, 읽기 쉬운 열 너비를 개선했습니다." }],
  ["更新记录：NeeDo 术语已进一步统一为情报", { "zh-Hant": "更新記錄：NeeDo 術語已進一步統一為情報", ja: "更新記録：NeeDoの用語をオファーに統一", en: "Update: NeeDo terminology has been unified as Info", ko: "업데이트: NeeDo 용어를 정보로 통일했습니다." }],
  ["更新记录：NeeDo 需求与情报卡片已加入前台倒计时与过期态", { "zh-Hant": "更新記錄：NeeDo 需求與情報卡已加入前台倒數計時與過期態", ja: "更新記録：NeeDoの需要／オファーカードにカウントダウンと期限切れ状態を追加", en: "Update: NeeDo Need and Info cards now include countdowns and expired states", ko: "업데이트: NeeDo 필요 및 정보 카드에 카운트다운과 만료 상태를 추가했습니다." }],
  ["需求中心、情报中心和共享 DataTable 继续优化表格列宽、横向拖拽滚动、表头筛选排序和详情入口，长字段在后台表格里更容易阅读。", { "zh-Hant": "需求中心、情報中心和共享 DataTable 繼續優化表格列寬、橫向拖拽滾動、表頭篩選排序和詳情入口，長字段在後台表格裡更容易閱讀。", ja: "需要センター、オファーセンター、共通 DataTable で列幅、横ドラッグスクロール、表頭の絞り込み排序、詳細入口を引き続き改善し、長い項目も管理画面の表で読みやすくしました。", en: "Need Center, Info Center, and the shared DataTable continue to improve column widths, horizontal drag scrolling, header filtering and sorting, and detail entry points so long fields are easier to read in backend tables.", ko: "필요 센터, 정보 센터와 공통 DataTable의 열 너비, 가로 드래그 스크롤, 표 헤더 필터와 정렬, 상세 진입을 계속 개선해 백엔드 표의 긴 항목을 더 쉽게 읽을 수 있습니다." }],
  ["需求中心、情报中心和同类运营后台表格已统一固定底部操作区，表头筛选排序不再挤压字段文字，点击列表信息可按同一方式打开详情。", { "zh-Hant": "需求中心、情報中心和同類營運後台表格已統一固定底部操作區，表頭篩選排序不再擠壓字段文字，點擊列表資訊可按同一方式打開詳情。", ja: "需要センター、オファーセンター、同系統の運営管理画面テーブルで底部操作エリアを統一して固定し、表頭の絞り込み排序が項目名を圧迫しないようにしました。リストオファーをクリックすると同じ方法で詳細を開けます。", en: "Need Center, Info Center, and similar operations backend tables now share a fixed bottom action area. Header filtering and sorting no longer squeeze field text, and clicking list info opens details in the same way.", ko: "필요 센터, 정보 센터와 같은 운영 백엔드 표는 하단 작업 영역을 고정하도록 통일했습니다. 표 헤더 필터와 정렬이 항목 문구를 누르지 않으며, 목록 정보를 클릭하면 같은 방식으로 상세를 열 수 있습니다." }],
  ["商户或技师提交的新情报，等待平台审核后进入情报流。", { "zh-Hant": "商戶或技師提交的新情報，等待平台審核後進入情報流。", ja: "店舗またはスタッフが投稿した新しいオファーです。プラットフォーム審査後にオファーフィードへ入ります。", en: "New Info submitted by a merchant or technician. It enters the Info feed after platform review.", ko: "사업자 또는 기사가 제출한 새 정보입니다. 플랫폼 심사 후 정보 피드에 들어갑니다." }],
  ["更新记录：NeeDo 发布权限已按端口锁定，客户端只能发送需求，技师端和店铺端只能发送情报", { "zh-Hant": "更新記錄：NeeDo 發布權限已依端口鎖定，用戶端只能發送需求，技師端和店鋪端只能發送情報", ja: "更新記録：NeeDoの投稿権限をポータル別に固定。ユーザーアプリは需要のみ、スタッフアプリと店舗側はオファーのみ送信できます。", en: "Update: NeeDo publishing permissions are locked by portal. The User App can only send Need posts, while the Technician App and Merchant App can only send Info posts.", ko: "업데이트: NeeDo 게시 권한이 포털별로 고정되었습니다. 사용자 앱은 필요만, 기사 앱과 사업자 앱은 정보만 보낼 수 있습니다." }],
  [
    "更新记录：NeeDo 默认筛选已按端口区分，客户端默认全部，技师端和店铺端默认需求",
    {
      "zh-Hant": "更新記錄：NeeDo 預設篩選已依端口區分，用戶端預設全部，技師端和店鋪端預設需求",
      ja: "更新記録：NeeDoの初期フィルターをポータル別に調整。ユーザーアプリはすべて、スタッフアプリと店舗側は需要を初期表示",
      en: "Update: NeeDo default filters now differ by portal; User App defaults to All, Technician App and Merchant App default to Need",
      ko: "업데이트: NeeDo 기본 필터가 포털별로 구분됩니다. 사용자 앱은 전체, 기사 앱과 사업자 앱은 필요를 기본으로 표시합니다."
    }
  ],
  ["NeeDo 前台里的需求与情报现已显示剩余有效时间，详情页也会同步展示截止时间；过期内容会自动切换为已过期状态并禁用主要操作按钮。", { "zh-Hant": "NeeDo 前台裡的需求與情報現已顯示剩餘有效時間，詳情頁也會同步顯示截止時間；過期內容會自動切換為已過期狀態並停用主要操作按鈕。", ja: "NeeDoのユーザー画面では、需要とオファーに残り有効時間を表示し、詳細ページにも締切時刻を同期して表示します。期限切れの内容は自動で期限切れ状態に切り替わり、主要操作ボタンは無効になります。", en: "Need and Info items in the NeeDo user-facing app now show remaining validity time, and the detail page also shows the deadline. Expired content automatically switches to the expired state and disables the primary action button.", ko: "NeeDo 사용자 화면의 필요와 정보에는 남은 유효 시간이 표시되고, 상세 페이지에도 마감 시간이 함께 표시됩니다. 만료된 내용은 자동으로 만료 상태로 전환되며 주요 작업 버튼은 비활성화됩니다." }],
  ["NeeDo 页的发布链路这次补成了显式限制，不再只是依赖页面文案。现在客户端新发内容只会落成需求，技师端和店铺端新发内容只会落成情报。", { "zh-Hant": "NeeDo 頁面的發布流程這次補上明確限制，不再只依賴頁面文案。現在用戶端新發內容只會成為需求，技師端和店鋪端新發內容只會成為情報。", ja: "NeeDoページの投稿フローに明示的な制限を追加しました。ページ文言だけには依存しません。ユーザーアプリで新規投稿した内容は需要として、スタッフアプリと店舗側で新規投稿した内容はオファーとして扱います。", en: "The NeeDo page publishing flow now has explicit restrictions instead of relying only on page copy. New posts from the User App become Need items, and new posts from the Technician App or Merchant App become Info items.", ko: "NeeDo 페이지의 게시 흐름에 명시적 제한을 추가해 더 이상 페이지 문구에만 의존하지 않습니다. 사용자 앱에서 새로 올린 내용은 필요로, 기사 앱과 사업자 앱에서 새로 올린 내용은 정보로 처리됩니다." }],
  [
    "NeeDo 页面现在会按端口默认落到不同筛选：客户端打开默认显示全部，技师端和店铺端默认优先显示需求。",
    {
      "zh-Hant": "NeeDo 頁面現在會依端口預設套用不同篩選：用戶端開啟時預設顯示全部，技師端和店鋪端預設優先顯示需求。",
      ja: "NeeDoページはポータルごとに初期フィルターを切り替えます。ユーザーアプリでは初期表示がすべて、スタッフアプリと店舗側では需要を優先表示します。",
      en: "The NeeDo page now applies different default filters by portal: the User App defaults to All, while the Technician App and Merchant App prioritize Need.",
      ko: "NeeDo 페이지는 포털별로 기본 필터를 다르게 적용합니다. 사용자 앱은 기본으로 전체를 표시하고, 기사 앱과 사업자 앱은 필요를 우선 표시합니다."
    }
  ],
  [
    "搜索服务、联系店铺、查看订单与继续聊天。",
    {
      "zh-Hant": "搜尋服務、聯絡店鋪、查看訂單並繼續聊天。",
      ja: "サービス検索、店舗連絡、注文確認、チャットをまとめて行えます。",
      en: "Search services, contact shops, check orders, and keep chatting.",
      ko: "서비스 검색, 매장 문의, 주문 확인, 채팅을 한곳에서 진행합니다."
    }
  ],
  [
    "同步订单、排班、门店通讯录与经营动态。",
    {
      "zh-Hant": "同步訂單、排班、門店通訊錄與經營動態。",
      ja: "注文、シフト、店舗連絡先、運営状況を同期します。",
      en: "Sync orders, schedules, store contacts, and operations.",
      ko: "주문, 근무표, 매장 연락처, 운영 현황을 동기화합니다."
    }
  ],
  [
    "正在进入",
    { "zh-Hant": "正在進入", ja: "読み込み中", en: "Loading", ko: "불러오는 중" }
  ],
  [
    "正在载入界面",
    { "zh-Hant": "正在載入介面", ja: "画面を読み込み中", en: "Loading", ko: "화면을 불러오는 중" }
  ],
  [
    "正在进入当前端口。",
    { "zh-Hant": "正在進入目前入口。", ja: "画面を準備しています。", en: "Preparing this view.", ko: "화면을 준비하고 있습니다." }
  ],
  [
    "启动页加载中",
    { "zh-Hant": "啟動頁載入中", ja: "読み込み中", en: "Loading", ko: "불러오는 중" }
  ],
  [
    "厨房、浴室、地面、除尘一站式整理，适合公寓日常维护。",
    {
      "zh-Hant": "廚房、浴室、地面與除塵一次整理，適合公寓日常維護。",
      ja: "キッチン、浴室、床、ほこりをまとめて整える日常清掃です。",
      en: "Kitchen, bathroom, floors, and dusting in one everyday apartment clean.",
      ko: "주방, 욕실, 바닥, 먼지 제거를 한 번에 정리하는 일상 청소입니다."
    }
  ],
  [
    "覆盖日常保洁、修水管、退房清扫和固定周期维护，适合长期居住家庭。",
    {
      "zh-Hant": "涵蓋日常清潔、水管維修、退房清掃與定期維護，適合長住家庭。",
      ja: "日常清掃、水回り修理、退去清掃、定期メンテまで対応。長期滞在のご家庭に。",
      en: "Routine cleaning, plumbing fixes, move-out cleaning, and recurring maintenance for long-term homes.",
      ko: "일상 청소, 배관 수리, 퇴실 청소, 정기 관리를 장기 거주 가정에 맞게 제공합니다."
    }
  ],
  [
    "覆盖下水道周边重点污渍与收纳归位。",
    {
      "zh-Hant": "涵蓋下水道周邊重點污漬與收納復位。",
      ja: "排水口まわりの重点汚れと収納の片付けまで対応。",
      en: "Covers key stains around drain areas and putting storage back in order.",
      ko: "하수구 주변 주요 오염과 수납 정리까지 처리합니다."
    }
  ],
  [
    "本周开放 20:30 后预约，护理、按摩和美甲项目都可以提前锁定担当者。",
    {
      "zh-Hant": "本週開放 20:30 後預約，護理、按摩和美甲項目都可以提前鎖定擔當者。",
      ja: "今週は20:30以降の予約も受付中。ケア、マッサージ、ネイルデザインの担当者を事前に確保できます。",
      en: "Appointments after 20:30 are open this week. You can reserve your preferred provider in advance for care, massage, and nail design.",
      ko: "이번 주에는 20:30 이후 예약도 가능합니다. 케어, 마사지, 네일 디자인 담당자를 미리 지정할 수 있습니다."
    }
  ],
  [
    "单色/跳色美甲",
    {
      "zh-Hant": "單色/跳色美甲",
      ja: "単色／差し色ネイルデザイン",
      en: "Solid color/accent-color nail design",
      ko: "단색/포인트 컬러 네일 디자인"
    }
  ],
  [
    "单色美甲 / 自然款美睫",
    {
      "zh-Hant": "單色美甲 / 自然款美睫",
      ja: "単色ネイルデザイン／ナチュラルまつ毛美容",
      en: "Single-color nail design / Natural lash beauty",
      ko: "단색 네일 디자인 / 내추럴 속눈썹 미용"
    }
  ],
  [
    "美甲、美睫、上门护理",
    {
      "zh-Hant": "美甲、美睫、上門護理",
      ja: "ネイルデザイン、まつ毛美容、訪問ケア",
      en: "Nail design, lash beauty, in-home care",
      ko: "네일 디자인, 속눈썹 미용, 방문 케어"
    }
  ],
  [
    "美甲、美睫、妆发、上门护理",
    {
      "zh-Hant": "美甲、美睫、妝髮、上門護理",
      ja: "ネイルデザイン、まつ毛美容、ヘアメイク、訪問ケア",
      en: "Nail design, lash beauty, hair and makeup, in-home care",
      ko: "네일 디자인, 속눈썹 미용, 헤어 메이크업, 방문 케어"
    }
  ],
  [
    "美甲、美睫和上门美业咨询响应快，适合通勤和短期活动前预约。",
    {
      "zh-Hant": "美甲、美睫和上門美業諮詢反應快，適合通勤和短期活動前預約。",
      ja: "ネイルデザイン、まつ毛美容、訪問美容相談は返信が早く、通勤前後や短期イベント前の予約に適しています。",
      en: "Nail design, lash beauty, and in-home beauty consultations respond quickly, making them suitable before commuting or short events.",
      ko: "네일 디자인, 속눈썹 미용, 방문 뷰티 상담은 응답이 빨라 출퇴근 전후나 짧은 행사 전 예약에 적합합니다."
    }
  ],
  [
    "美甲美睫",
    {
      "zh-Hant": "美甲美睫",
      ja: "ネイルデザイン・まつ毛美容",
      en: "Nail design and lash beauty",
      ko: "네일 디자인과 속눈썹 미용"
    }
  ],
  [
    "美睫自然款",
    {
      "zh-Hant": "美睫自然款",
      ja: "ナチュラルまつ毛美容",
      en: "Natural lash beauty",
      ko: "내추럴 속눈썹 미용"
    }
  ],
  [
    "美容美甲",
    {
      "zh-Hant": "美容美甲",
      ja: "美容・ネイルデザイン",
      en: "Beauty and nail design",
      ko: "뷰티 및 네일 디자인"
    }
  ],
  [
    "自然款美睫",
    {
      "zh-Hant": "自然款美睫",
      ja: "ナチュラルまつ毛美容",
      en: "Natural lash beauty",
      ko: "내추럴 속눈썹 미용"
    }
  ],
  [
    "¥18,000 起",
    { "zh-Hant": "¥18,000 起", ja: "¥18,000〜", en: "From ¥18,000", ko: "¥18,000부터" }
  ],
  [
    "¥6,500 起",
    { "zh-Hant": "¥6,500 起", ja: "¥6,500〜", en: "From ¥6,500", ko: "¥6,500부터" }
  ],
  [
    "¥6,800 起",
    { "zh-Hant": "¥6,800 起", ja: "¥6,800〜", en: "From ¥6,800", ko: "¥6,800부터" }
  ],
  [
    "¥8,000 起",
    { "zh-Hant": "¥8,000 起", ja: "¥8,000〜", en: "From ¥8,000", ko: "¥8,000부터" }
  ],
  [
    "最快 45 分钟",
    { "zh-Hant": "最快 45 分鐘", ja: "最短45分", en: "As fast as 45 min", ko: "최단 45분" }
  ],
  [
    "覆盖肩颈、腰背、腿部。",
    {
      "zh-Hant": "涵蓋肩頸、腰背與腿部。",
      ja: "肩首・腰背中・脚まで対応。",
      en: "Covers shoulders, neck, lower back, and legs.",
      ko: "어깨, 목, 허리, 등, 다리까지 케어합니다."
    }
  ],
  [
    "肩颈背部放松，适合久坐疲劳。",
    {
      "zh-Hant": "放鬆肩頸與背部，適合久坐疲勞。",
      ja: "肩首と背中をほぐします。長時間座る方におすすめです。",
      en: "Relieves the neck, shoulders, and back. Good for desk fatigue.",
      ko: "어깨, 목, 등을 풀어 장시간 앉아 생긴 피로에 좋습니다."
    }
  ],
  [
    "以肩颈调理、睡眠放松和轻芳疗为主。预约前会先确认压力点、力度偏好、语言和付款方式，让到店或指定上门服务都能保持稳定节奏。",
    {
      "zh-Hant": "以肩頸調理、睡眠放鬆和輕芳療為主。預約前會先確認壓力點、力度偏好、語言和付款方式，讓到店或指定上門服務都能保持穩定節奏。",
      ja: "肩首ケア、睡眠リラックス、軽いアロマが中心。予約前に気になる部位、力加減、言語、支払い方法を確認します。",
      en: "Focused on neck and shoulder care, sleep relaxation, and light aromatherapy. Pressure points, preferred strength, language, and payment are confirmed before booking.",
      ko: "어깨·목 케어, 수면 릴랙스, 가벼운 아로마가 중심입니다. 예약 전 압점, 강도, 언어, 결제 방법을 확인합니다."
    }
  ],
  [
    "我的同步日程",
    { "zh-Hant": "我的同步行程", ja: "スケジュール", en: "Schedule", ko: "내 일정" }
  ],
  [
    "评价入口未生成",
    { "zh-Hant": "尚未產生評價入口", ja: "レビュー入口がありません", en: "Review link unavailable", ko: "리뷰 입구가 아직 없습니다" }
  ],
  [
    "请先完成支付确认，再从账单页进入评价。",
    {
      "zh-Hant": "請先完成付款確認，再從帳單頁進入評價。",
      ja: "支払い確認後、会計ページからレビューしてください。",
      en: "Confirm payment first, then open the review from the bill page.",
      ko: "결제 확인 후 청구서 페이지에서 리뷰를 작성하세요."
    }
  ],
  [
    "无法打开二维码",
    { "zh-Hant": "無法開啟 QR 碼", ja: "QRコードを開けません", en: "Unable to open QR code", ko: "QR 코드를 열 수 없습니다" }
  ],
  [
    "二维码已失效或不存在。",
    { "zh-Hant": "QR 碼已失效或不存在。", ja: "QRコードが無効、または見つかりません。", en: "This QR code is inactive or unknown.", ko: "QR 코드가 만료되었거나 없습니다." }
  ],
  [
    "会话不存在",
    { "zh-Hant": "會話不存在", ja: "セッションが見つかりません", en: "Session not found", ko: "세션을 찾을 수 없습니다" }
  ],
  [
    "请重新扫码进入店内点单。",
    { "zh-Hant": "請重新掃碼進入店內點單。", ja: "もう一度スキャンして店内注文を開いてください。", en: "Scan again to open in-store ordering.", ko: "다시 스캔해 매장 주문을 열어 주세요." }
  ],
  [
    "账单",
    { "zh-Hant": "帳單", ja: "会計", en: "Bill", ko: "청구서" }
  ],
  [
    "点单进度",
    { "zh-Hant": "點單進度", ja: "注文状況", en: "Order status", ko: "주문 진행 상황" }
  ],
  [
    "商品不存在",
    { "zh-Hant": "商品不存在", ja: "商品が見つかりません", en: "Item not found", ko: "상품을 찾을 수 없습니다" }
  ],
  [
    "最大 9 张图片，或 1 个视频。",
    {
      "zh-Hant": "最多 9 張圖片，或 1 支影片。",
      ja: "画像は最大9枚、動画は1本まで。",
      en: "Up to 9 images or 1 video.",
      ko: "이미지는 최대 9장, 동영상은 1개까지 가능합니다."
    }
  ],
  [
    "谁可以看",
    { "zh-Hant": "誰可以看", ja: "公開範囲", en: "Who can see this", ko: "공개 범위" }
  ],
  [
    "谁可以评论",
    { "zh-Hant": "誰可以評論", ja: "コメントできる人", en: "Who can comment", ko: "댓글 허용 범위" }
  ],
  [
    "任何人",
    { "zh-Hant": "任何人", ja: "誰でも", en: "Anyone", ko: "누구나" }
  ],
  [
    "公共",
    { "zh-Hant": "公開", ja: "公開", en: "Public", ko: "공개" }
  ],
  [
    "暂无搜索结果",
    { "zh-Hant": "暫無搜尋結果", ja: "検索結果はありません", en: "No search results", ko: "검색 결과 없음" }
  ],
  [
    "当前范围暂时没有动态。可以切换到最新、关注或好友。",
    {
      "zh-Hant": "目前範圍暫無動態。可切換到最新、關注或好友。",
      ja: "現在の範囲には投稿がありません。最新、フォロー、友達に切り替えられます。",
      en: "No posts in this area yet. Try Latest, Following, or Friends.",
      ko: "현재 범위에 게시물이 없습니다. 최신, 팔로잉, 친구로 바꿔 보세요."
    }
  ],
  [
    "当前范围内还没有命中动态。可以换更短的关键词，或切到最新、关注、好友范围再试。",
    {
      "zh-Hant": "目前範圍內沒有命中的動態。可換更短的關鍵字，或切到最新、關注、好友再試。",
      ja: "該当する投稿はありません。短いキーワードにするか、最新・フォロー・友達で再検索してください。",
      en: "No matching posts. Try a shorter keyword or switch to Latest, Following, or Friends.",
      ko: "일치하는 게시물이 없습니다. 더 짧은 키워드나 최신, 팔로잉, 친구 범위로 다시 시도하세요."
    }
  ],
  [
    "关联商户",
    { "zh-Hant": "關聯商戶", ja: "関連店舗", en: "Linked shop", ko: "연결된 매장" }
  ],
  [
    "生日",
    { "zh-Hant": "生日", ja: "誕生日", en: "Birthday", ko: "생일" }
  ],
  [
    "加入日",
    { "zh-Hant": "加入日", ja: "登録日", en: "Joined", ko: "가입일" }
  ],
  [
    "提现审核",
    { "zh-Hant": "提現審核", ja: "出金審査", en: "Withdrawal review", ko: "출금 심사" }
  ],
  [
    "结算记录",
    { "zh-Hant": "結算記錄", ja: "精算履歴", en: "Settlement history", ko: "정산 내역" }
  ],
  [
    "管理和服务",
    { "zh-Hant": "管理與服務", ja: "管理・サービス", en: "Management & service", ko: "관리 및 서비스" }
  ],
  [
    "操作文档",
    { "zh-Hant": "操作文件", ja: "運用ドキュメント", en: "Operations docs", ko: "운영 문서" }
  ],
  [
    "推广计划管理",
    { "zh-Hant": "推廣計畫管理", ja: "紹介プラン", en: "Plans", ko: "프로모션 플랜" }
  ],
  [
    "客户服务支持",
    { "zh-Hant": "客服支援", ja: "サポート", en: "Support", ko: "고객 지원" }
  ],
  [
    "平台与商户总控",
    { "zh-Hant": "平台與商戶總控", ja: "プラットフォーム・店舗管理", en: "Platform and merchant control", ko: "플랫폼 및 매장 관리" }
  ],
  [
    "我的二维码",
    { "zh-Hant": "我的 QR 碼", ja: "自分のQRコード", en: "My QR code", ko: "내 QR 코드" }
  ],
  [
    "对方扫码后可以添加好友并开始聊天。",
    {
      "zh-Hant": "對方掃碼後可新增好友並開始聊天。",
      ja: "相手がスキャンすると、友だち追加とチャット開始ができます。",
      en: "The other person can scan this to add you and start chatting.",
      ko: "상대가 스캔하면 친구 추가 후 채팅을 시작할 수 있습니다."
    }
  ],
  [
    "对方扫码后可以向我付款或发起收款确认。",
    {
      "zh-Hant": "對方掃碼後可向我付款或發起收款確認。",
      ja: "相手がスキャンすると、支払いまたは支払い確認を開始できます。",
      en: "The other person can scan this to pay me or confirm a payment.",
      ko: "상대가 스캔하면 나에게 결제하거나 결제 확인을 시작할 수 있습니다."
    }
  ],
  [
    "付款用",
    { "zh-Hant": "付款用", ja: "支払い", en: "Payment", ko: "결제용" }
  ],
  [
    "去扫码",
    { "zh-Hant": "去掃碼", ja: "再スキャン", en: "Scan again", ko: "다시 스캔" }
  ],
  [
    "重新扫码",
    { "zh-Hant": "重新掃碼", ja: "再スキャン", en: "Scan again", ko: "다시 스캔" }
  ],
  [
    "最多 9 张图片，或 1 个视频。",
    {
      "zh-Hant": "最多 9 張圖片，或 1 支影片。",
      ja: "画像は最大9枚、動画は1本まで。",
      en: "Up to 9 images or 1 video.",
      ko: "이미지는 최대 9장, 동영상은 1개까지 가능합니다."
    }
  ],
  [
    "点单 / オーダー",
    { "zh-Hant": "點餐", ja: "注文", en: "Orders", ko: "주문" }
  ],
  [
    "菜单 / メニュー",
    { "zh-Hant": "菜單", ja: "メニュー", en: "Menu", ko: "메뉴" }
  ],
  [
    "菜单数",
    { "zh-Hant": "菜單數", ja: "メニュー数", en: "Menus", ko: "메뉴 수" }
  ],
  [
    "单品",
    { "zh-Hant": "單品", ja: "商品", en: "Items", ko: "단품" }
  ],
  [
    "可售",
    { "zh-Hant": "可售", ja: "販売中", en: "Available", ko: "판매 중" }
  ],
  [
    "售罄",
    { "zh-Hant": "售罄", ja: "売り切れ", en: "Sold out", ko: "품절" }
  ],
  [
    "饭菜分类",
    { "zh-Hant": "餐點分類", ja: "料理カテゴリ", en: "Food categories", ko: "음식 카테고리" }
  ],
  [
    "分类可修改、增减；单品会按当前插页和分类展示。",
    {
      "zh-Hant": "分類可修改、增減；單品會依目前分頁與分類顯示。",
      ja: "カテゴリは編集・追加できます。商品は現在のタブとカテゴリで表示されます。",
      en: "Edit or add categories. Items appear under the current tab and category.",
      ko: "카테고리를 수정하거나 추가할 수 있으며, 단품은 현재 탭과 카테고리에 따라 표시됩니다."
    }
  ],
  [
    "选择一个分类后，可以单独修改该分类名并追加新的单品。",
    {
      "zh-Hant": "選擇分類後，可單獨修改分類名稱並新增單品。",
      ja: "カテゴリを選ぶと、名称編集と商品の追加ができます。",
      en: "Select a category to rename it or add items.",
      ko: "카테고리를 선택하면 이름을 수정하거나 단품을 추가할 수 있습니다."
    }
  ],
  [
    "酒单",
    { "zh-Hant": "酒水單", ja: "ドリンク", en: "Drinks", ko: "음료" }
  ],
  [
    "服务单",
    { "zh-Hant": "服務單", ja: "サービス", en: "Services", ko: "서비스" }
  ],
  [
    "扫码核销",
    { "zh-Hant": "掃碼核銷", ja: "QR消込", en: "Scan to redeem", ko: "스캔 정산" }
  ],
  [
    "核销",
    { "zh-Hant": "核銷", ja: "消込", en: "Redeem", ko: "사용 처리" }
  ],
  [
    "会员中心",
    { "zh-Hant": "會員中心", ja: "会員センター", en: "Member center", ko: "회원 센터" }
  ],
  [
    "会员中心说明",
    { "zh-Hant": "會員中心說明", ja: "会員センターについて", en: "About member center", ko: "회원 센터 안내" }
  ],
  [
    "有效会员",
    { "zh-Hant": "有效會員", ja: "有効会員", en: "Active members", ko: "유효 회원" }
  ],
  [
    "今日新增",
    { "zh-Hant": "今日新增", ja: "本日の新規", en: "New today", ko: "오늘 신규" }
  ],
  [
    "今日核销",
    { "zh-Hant": "今日核銷", ja: "本日の消込", en: "Redeemed today", ko: "오늘 사용 처리" }
  ],
  [
    "即将到期",
    { "zh-Hant": "即將到期", ja: "期限間近", en: "Expiring soon", ko: "곧 만료" }
  ],
  [
    "今日开卡",
    { "zh-Hant": "今日開卡", ja: "本日の発行", en: "Cards opened today", ko: "오늘 카드 개설" }
  ],
  [
    "今日充值",
    { "zh-Hant": "今日儲值", ja: "本日のチャージ", en: "Top-ups today", ko: "오늘 충전" }
  ],
  [
    "快捷动作",
    { "zh-Hant": "快捷操作", ja: "クイック操作", en: "Quick actions", ko: "빠른 작업" }
  ],
  [
    "开通会员",
    { "zh-Hant": "開通會員", ja: "会員登録", en: "Open membership", ko: "회원 개설" }
  ],
  [
    "会员充值",
    { "zh-Hant": "會員儲值", ja: "会員チャージ", en: "Member top-up", ko: "회원 충전" }
  ],
  [
    "3 张会员卡将在 7 天内到期",
    {
      "zh-Hant": "3 張會員卡將在 7 天內到期",
      ja: "7日以内に期限切れになる会員カードが3件あります",
      en: "3 membership cards expire within 7 days",
      ko: "회원 카드 3장이 7일 이내 만료됩니다"
    }
  ],
  [
    "建议先通知高价值会员，并确认是否需要续卡或保留本金。",
    {
      "zh-Hant": "建議先通知高價值會員，並確認是否需要續卡或保留本金。",
      ja: "まず優良会員へ通知し、更新または残高維持が必要か確認してください。",
      en: "Notify high-value members first and confirm renewal or balance handling.",
      ko: "우선 고가치 회원에게 알리고 갱신 또는 원금 보관 여부를 확인하세요."
    }
  ],
  [
    "推广链接",
    { "zh-Hant": "推廣連結", ja: "紹介リンク", en: "Promotion links", ko: "홍보 링크" }
  ],
  [
    "推广链接列表",
    { "zh-Hant": "推廣連結列表", ja: "紹介リンク一覧", en: "Promotion links", ko: "홍보 링크 목록" }
  ],
  [
    "短链",
    { "zh-Hant": "短連結", ja: "短縮リンク", en: "Short link", ko: "단축 링크" }
  ],
  [
    "落地页",
    { "zh-Hant": "落地頁", ja: "LP", en: "Landing page", ko: "랜딩 페이지" }
  ],
  [
    "渠道",
    { "zh-Hant": "渠道", ja: "チャネル", en: "Channel", ko: "채널" }
  ],
  [
    "首单",
    { "zh-Hant": "首單", ja: "初回注文", en: "First order", ko: "첫 주문" }
  ],
  [
    "操作",
    { "zh-Hant": "操作", ja: "操作", en: "Actions", ko: "작업" }
  ],
  [
    "启用",
    { "zh-Hant": "啟用", ja: "有効化", en: "Enable", ko: "사용" }
  ],
  [
    "创建链接",
    { "zh-Hant": "建立連結", ja: "リンク作成", en: "Create link", ko: "링크 만들기" }
  ],
  [
    "创建邀请码",
    { "zh-Hant": "建立邀請碼", ja: "招待コード作成", en: "Create invite code", ko: "초대 코드 만들기" }
  ],
  [
    "添加下级",
    { "zh-Hant": "新增下級", ja: "下位追加", en: "Add downline", ko: "하위 추가" }
  ],
  [
    "查看组织",
    { "zh-Hant": "查看組織", ja: "組織を見る", en: "View organization", ko: "조직 보기" }
  ],
  [
    "查看佣金",
    { "zh-Hant": "查看佣金", ja: "手数料を見る", en: "View commissions", ko: "수수료 보기" }
  ],
  [
    "上传素材",
    { "zh-Hant": "上傳素材", ja: "素材アップロード", en: "Upload creatives", ko: "소재 업로드" }
  ],
  [
    "语言切换",
    { "zh-Hant": "語言切換", ja: "言語切替", en: "Language", ko: "언어 전환" }
  ],
  [
    "UI切换",
    { "zh-Hant": "UI 切換", ja: "UI切替", en: "UI theme", ko: "UI 전환" }
  ],
  [
    "平台与商户综合",
    { "zh-Hant": "平台與商戶綜合", ja: "プラットフォーム・店舗合算", en: "Platform + merchants", ko: "플랫폼 + 매장" }
  ],
  [
    "佣金成本",
    { "zh-Hant": "佣金成本", ja: "手数料コスト", en: "Commission cost", ko: "수수료 비용" }
  ],
  [
    "归因 GMV",
    { "zh-Hant": "歸因 GMV", ja: "帰属GMV", en: "Attributed GMV", ko: "귀속 GMV" }
  ],
  [
    "风险冻结金额",
    { "zh-Hant": "風險凍結金額", ja: "リスク凍結額", en: "Risk-frozen amount", ko: "리스크 동결 금액" }
  ],
  [
    "今日点击",
    { "zh-Hant": "今日點擊", ja: "本日のクリック", en: "Clicks today", ko: "오늘 클릭" }
  ],
  [
    "今日扫码",
    { "zh-Hant": "今日掃碼", ja: "本日のスキャン", en: "Scans today", ko: "오늘 스캔" }
  ],
  [
    "今日注册",
    { "zh-Hant": "今日註冊", ja: "本日の登録", en: "Registrations today", ko: "오늘 가입" }
  ],
  [
    "有效注册",
    { "zh-Hant": "有效註冊", ja: "有効登録", en: "Valid registrations", ko: "유효 가입" }
  ],
  [
    "今日首单",
    { "zh-Hant": "今日首單", ja: "本日の初回注文", en: "First orders today", ko: "오늘 첫 주문" }
  ],
  [
    "平台收入",
    { "zh-Hant": "平台收入", ja: "プラットフォーム収益", en: "Platform revenue", ko: "플랫폼 수익" }
  ],
  [
    "新增用户",
    { "zh-Hant": "新增用戶", ja: "新規ユーザー", en: "New users", ko: "신규 사용자" }
  ],
  [
    "新增商户",
    { "zh-Hant": "新增商戶", ja: "新規店舗", en: "New merchants", ko: "신규 매장" }
  ],
  [
    "新增技师",
    { "zh-Hant": "新增技師", ja: "新規スタッフ", en: "New staff", ko: "신규 기사" }
  ],
  [
    "佣金支出",
    { "zh-Hant": "佣金支出", ja: "手数料支出", en: "Commission spend", ko: "수수료 지출" }
  ],
  [
    "预估返佣",
    { "zh-Hant": "預估返佣", ja: "見込み手数料", en: "Estimated commission", ko: "예상 수수료" }
  ],
  [
    "可结算返佣",
    { "zh-Hant": "可結算返佣", ja: "精算可能手数料", en: "Payable commission", ko: "정산 가능 수수료" }
  ],
  [
    "已结算返佣",
    { "zh-Hant": "已結算返佣", ja: "精算済み手数料", en: "Settled commission", ko: "정산 완료 수수료" }
  ],
  [
    "预算消耗率",
    { "zh-Hant": "預算消耗率", ja: "予算消化率", en: "Budget used", ko: "예산 사용률" }
  ],
  [
    "目标完成率",
    { "zh-Hant": "目標完成率", ja: "目標達成率", en: "Target completion", ko: "목표 달성률" }
  ],
  [
    "异常推广者",
    { "zh-Hant": "異常推廣者", ja: "異常な紹介者", en: "Flagged promoters", ko: "이상 홍보자" }
  ],
  [
    "异常订单",
    { "zh-Hant": "異常訂單", ja: "異常注文", en: "Flagged orders", ko: "이상 주문" }
  ],
  [
    "链接码QR",
    { "zh-Hant": "連結碼 QR", ja: "リンク・コード・QR", en: "Links, codes & QR", ko: "링크/코드/QR" }
  ],
  [
    "归因结算",
    { "zh-Hant": "歸因結算", ja: "帰属・精算", en: "Attribution & settlement", ko: "귀속/정산" }
  ],
  [
    "NDP 钱包",
    { "zh-Hant": "NDP 錢包", ja: "NDPウォレット", en: "NDP wallet", ko: "NDP 지갑" }
  ],
  [
    "产运后台",
    { "zh-Hant": "產運後台", ja: "運用管理", en: "Ops admin", ko: "운영 관리" }
  ],
  [
    "今晚有空档，可随时预约",
    { "zh-Hant": "今晚有空檔，可隨時預約", ja: "今夜空きあり・すぐ予約可", en: "Open tonight; book anytime", ko: "오늘 밤 예약 가능" }
  ],
  [
    "临时预约",
    { "zh-Hant": "臨時預約", ja: "臨時予約", en: "short-notice booking", ko: "임시 예약" }
  ],
  [
    "双人按摩",
    { "zh-Hant": "雙人按摩", ja: "ペアマッサージ", en: "couples massage", ko: "2인 마사지" }
  ],
  [
    "深度保洁",
    { "zh-Hant": "深度清潔", ja: "大掃除", en: "Deep cleaning", ko: "심층 청소" }
  ],
  [
    "周边活动较多",
    { "zh-Hant": "周邊活動較多", ja: "周辺での利用が多く", en: "is my main area", ko: "주변 이용이 많고" }
  ],
  [
    "下单前会先看动态里的现场图和用户反馈",
    {
      "zh-Hant": "下單前會先看動態裡的現場圖和用戶回饋",
      ja: "予約前に投稿の写真とユーザーの声を確認します",
      en: "I check feed photos and user feedback before booking",
      ko: "예약 전 피드 사진과 사용자 후기를 먼저 확인합니다"
    }
  ],
  [
    "偏好在平台内保留完整记录。",
    {
      "zh-Hant": "偏好在平台內保留完整記錄。",
      ja: "やり取りはアプリ内に残したいです。",
      en: "I prefer to keep the full record in the app.",
      ko: "전체 기록은 앱 안에 남기는 것을 선호합니다."
    }
  ],
  [
    "退出登录",
    { "zh-Hant": "登出", ja: "ログアウト", en: "Log out", ko: "로그아웃" }
  ],
  [
    "注销账号",
    { "zh-Hant": "註銷帳號", ja: "退会", en: "Delete account", ko: "계정 삭제" }
  ],
  [
    "退会",
    { "zh-Hant": "退會", ja: "退会", en: "Close account", ko: "탈퇴" }
  ],
  [
    "登录账号",
    { "zh-Hant": "登入帳號", ja: "ログインアカウント", en: "Login account", ko: "로그인 계정" }
  ],
  [
    "演示账号",
    { "zh-Hant": "演示帳號", ja: "デモアカウント", en: "Demo account", ko: "데모 계정" }
  ],
  [
    "选择一个分类后，可以单独修改该分类名称并追加新的单品。",
    {
      "zh-Hant": "選擇分類後，可單獨修改分類名稱並新增單品。",
      ja: "カテゴリを選ぶと、名称編集と商品の追加ができます。",
      en: "Select a category to rename it or add items.",
      ko: "카테고리를 선택하면 이름을 수정하거나 단품을 추가할 수 있습니다."
    }
  ],
  [
    "类",
    { "zh-Hant": "類", ja: "カテゴリ", en: "categories", ko: "카테고리" }
  ],
  [
    "项",
    { "zh-Hant": "項", ja: "件", en: "items", ko: "개" }
  ],
  [
    "一个",
    { "zh-Hant": "一個", ja: "1つの", en: "a", ko: "하나" }
  ],
  [
    "可以",
    { "zh-Hant": "可以", ja: "できます", en: "can", ko: "가능" }
  ],
  [
    "炸鸡拼盘",
    { "zh-Hant": "炸雞拼盤", ja: "唐揚げ盛り合わせ", en: "Fried chicken plate", ko: "가라아게 플레이트" }
  ],
  [
    "适合 2-3 人共享，可描述酱汁。",
    {
      "zh-Hant": "適合 2-3 人共享，可描述醬汁。",
      ja: "2〜3人でのシェア向け。ソースの説明を追加できます。",
      en: "Serves 2-3. Add sauce notes if needed.",
      ko: "2~3인이 나눠 먹기 좋으며 소스 설명을 추가할 수 있습니다."
    }
  ],
  [
    "限量",
    { "zh-Hant": "限量", ja: "数量限定", en: "Limited", ko: "한정" }
  ],
  [
    "最多 4 人",
    { "zh-Hant": "最多 4 人", ja: "最大4名", en: "Up to 4 people", ko: "최대 4명" }
  ],
  [
    "厨房",
    { "zh-Hant": "廚房", ja: "キッチン", en: "Kitchen", ko: "주방" }
  ],
  [
    "和牛汉堡",
    { "zh-Hant": "和牛漢堡", ja: "和牛バーガー", en: "Wagyu burger", ko: "와규 버거" }
  ],
  [
    "招牌汉堡，可加芝士和薯条。",
    {
      "zh-Hant": "招牌漢堡，可加起司和薯條。",
      ja: "看板バーガー。チーズやポテトを追加できます。",
      en: "Signature burger with optional cheese and fries.",
      ko: "대표 버거이며 치즈와 감자튀김을 추가할 수 있습니다."
    }
  ],
  [
    "限时特价",
    { "zh-Hant": "限時特價", ja: "期間限定価格", en: "Limited-time offer", ko: "기간 한정 특가" }
  ],
  [
    "新增单品",
    { "zh-Hant": "新增單品", ja: "商品を追加", en: "Add item", ko: "단품 추가" }
  ],
  [
    "编辑单品",
    { "zh-Hant": "編輯單品", ja: "商品を編集", en: "Edit item", ko: "단품 편집" }
  ],
  [
    "保存单品",
    { "zh-Hant": "儲存單品", ja: "商品を保存", en: "Save item", ko: "단품 저장" }
  ],
  [
    "查看到期卡",
    { "zh-Hant": "查看到期卡", ja: "期限切れ間近のカード", en: "View expiring cards", ko: "만료 예정 카드 보기" }
  ],
  [
    "可按标签筛选沉默客，一键发送唤醒券。",
    {
      "zh-Hant": "可依標籤篩選沉默客，一鍵發送喚醒券。",
      ja: "タグで休眠顧客を絞り込み、再来店クーポンを一括送信できます。",
      en: "Filter inactive customers by tag and send win-back coupons in one tap.",
      ko: "태그로 휴면 고객을 필터링하고 재방문 쿠폰을 한 번에 보낼 수 있습니다."
    }
  ],
  [
    "筛选老客",
    { "zh-Hant": "篩選老客", ja: "既存客を絞り込む", en: "Filter returning customers", ko: "기존 고객 필터" }
  ],
  [
    "2 笔退款申请",
    { "zh-Hant": "2 筆退款申請", ja: "返金申請2件", en: "2 refund requests", ko: "환불 요청 2건" }
  ],
  [
    "生成链接",
    { "zh-Hant": "生成連結", ja: "リンク作成", en: "Create link", ko: "링크 생성" }
  ],
  [
    "生成 QR",
    { "zh-Hant": "生成 QR", ja: "QR作成", en: "Generate QR", ko: "QR 생성" }
  ],
  [
    "素材中心",
    { "zh-Hant": "素材中心", ja: "素材センター", en: "Creatives", ko: "소재 센터" }
  ],
  [
    "对象：用户/技师/商户",
    { "zh-Hant": "對象：用戶/技師/商戶", ja: "対象：ユーザー/スタッフ/店舗", en: "Audience: users/staff/merchants", ko: "대상: 사용자/기사/매장" }
  ],
  [
    "渠道：LINE/X/TikTok/线下",
    { "zh-Hant": "渠道：LINE/X/TikTok/線下", ja: "チャネル：LINE/X/TikTok/オフライン", en: "Channels: LINE/X/TikTok/offline", ko: "채널: LINE/X/TikTok/오프라인" }
  ],
  [
    "语言：日/中/英/韩",
    { "zh-Hant": "語言：日/中/英/韓", ja: "言語：日本語/中国語/英語/韓国語", en: "Language: JA/ZH/EN/KO", ko: "언어: 일본어/중국어/영어/한국어" }
  ],
  [
    "状态：启用/暂停",
    { "zh-Hant": "狀態：啟用/暫停", ja: "ステータス：有効/一時停止", en: "Status: active/paused", ko: "상태: 사용/일시 중지" }
  ],
  [
    "风险：正常/观察",
    { "zh-Hant": "風險：正常/觀察", ja: "リスク：通常/監視", en: "Risk: normal/watch", ko: "리스크: 정상/관찰" }
  ],
  [
    "港区新客 500 NDP 海报",
    { "zh-Hant": "港區新客 500 NDP 海報", ja: "港区新規向け500 NDPポスター", en: "Minato new-customer 500 NDP poster", ko: "미나토구 신규 고객 500 NDP 포스터" }
  ],
  [
    "用途：店铺新客活动、达人探店",
    {
      "zh-Hant": "用途：店鋪新客活動、達人探店",
      ja: "用途：店舗の新規集客、クリエイター来店紹介",
      en: "Use: new-customer campaign and creator shop visits",
      ko: "용도: 신규 고객 캠페인, 크리에이터 매장 방문"
    }
  ],
  [
    "规则命中明细",
    { "zh-Hant": "規則命中明細", ja: "ルール検出詳細", en: "Rule hits", ko: "규칙 적중 상세" }
  ],
  [
    "Afirieito 同步总览",
    { "zh-Hant": "Afirieito 同步總覽", ja: "Afirieito同期概要", en: "Afirieito sync overview", ko: "Afirieito 동기화 개요" }
  ],
  [
    "同步概要",
    { "zh-Hant": "同步概要", ja: "同期概要", en: "Sync overview", ko: "동기화 개요" }
  ],
  [
    "计划数据",
    { "zh-Hant": "計畫資料", ja: "プランデータ", en: "Plan data", ko: "플랜 데이터" }
  ],
  [
    "NDA管理后台",
    { "zh-Hant": "NDA 管理後台", ja: "NDA管理画面", en: "NDA admin", ko: "NDA 관리자" }
  ],
  [
    "商户自营",
    { "zh-Hant": "商戶自營", ja: "店舗運用", en: "Merchant-owned", ko: "매장 자체 운영" }
  ],
  [
    "状态同步",
    { "zh-Hant": "狀態同步", ja: "ステータス同期", en: "Status sync", ko: "상태 동기화" }
  ],
  [
    "配置镜像",
    { "zh-Hant": "配置鏡像", ja: "設定ミラー", en: "Config mirror", ko: "설정 미러" }
  ],
  [
    "计划规则",
    { "zh-Hant": "計畫規則", ja: "プランルール", en: "Plan rules", ko: "플랜 규칙" }
  ],
  [
    "佣金快照",
    { "zh-Hant": "佣金快照", ja: "手数料スナップショット", en: "Commission snapshot", ko: "수수료 스냅샷" }
  ],
  [
    "发布版本",
    { "zh-Hant": "發布版本", ja: "公開バージョン", en: "Release version", ko: "배포 버전" }
  ],
  [
    "组织层级",
    { "zh-Hant": "組織層級", ja: "組織階層", en: "Org levels", ko: "조직 단계" }
  ],
  [
    "权限",
    { "zh-Hant": "權限", ja: "権限", en: "Permissions", ko: "권한" }
  ],
  [
    "目标拆分",
    { "zh-Hant": "目標拆分", ja: "目標配分", en: "Target split", ko: "목표 배분" }
  ],
  [
    "素材渠道",
    { "zh-Hant": "素材渠道", ja: "素材・チャネル", en: "Creatives & channels", ko: "소재/채널" }
  ],
  [
    "素材库",
    { "zh-Hant": "素材庫", ja: "素材ライブラリ", en: "Creative library", ko: "소재 라이브러리" }
  ],
  [
    "线索",
    { "zh-Hant": "線索", ja: "リード", en: "Leads", ko: "리드" }
  ],
  [
    "入驻",
    { "zh-Hant": "入駐", ja: "加盟", en: "Onboarding", ko: "입점" }
  ],
  [
    "追踪记录",
    { "zh-Hant": "追蹤記錄", ja: "追跡ログ", en: "Tracking log", ko: "추적 기록" }
  ],
  [
    "曝光",
    { "zh-Hant": "曝光", ja: "表示", en: "Impressions", ko: "노출" }
  ],
  [
    "财务对账",
    { "zh-Hant": "財務對帳", ja: "財務照合", en: "Finance reconciliation", ko: "재무 대사" }
  ],
  [
    "结算批次",
    { "zh-Hant": "結算批次", ja: "精算バッチ", en: "Settlement batches", ko: "정산 배치" }
  ],
  [
    "冲正",
    { "zh-Hant": "沖正", ja: "取消訂正", en: "Reversals", ko: "정정" }
  ],
  [
    "钱包账本",
    { "zh-Hant": "錢包帳本", ja: "ウォレット台帳", en: "Wallet ledger", ko: "지갑 원장" }
  ],
  [
    "推广者收益",
    { "zh-Hant": "推廣者收益", ja: "紹介者収益", en: "Promoter earnings", ko: "홍보자 수익" }
  ],
  [
    "风控审计",
    { "zh-Hant": "風控審計", ja: "リスク監査", en: "Risk audit", ko: "리스크 감사" }
  ],
  [
    "风险事件",
    { "zh-Hant": "風險事件", ja: "リスクイベント", en: "Risk events", ko: "리스크 이벤트" }
  ],
  [
    "审计日志",
    { "zh-Hant": "審計日誌", ja: "監査ログ", en: "Audit log", ko: "감사 로그" }
  ],
  // Synced from exports/i18n/needo-terminology-glossary.xlsx. Keep this block at the end so workbook terms win.
  ["用户端", { "zh-Hant": "用戶端", "ja": "ユーザーアプリ", "en": "User App", "ko": "사용자 앱" }],
  ["商户端", { "zh-Hant": "商戶端", "ja": "店舗側", "en": "Merchant App", "ko": "사업자 앱" }],
  ["技师端", { "zh-Hant": "技師端", "ja": "スタッフアプリ", "en": "Technician App", "ko": "기사 앱" }],
  ["平台后台", { "zh-Hant": "平台後台", "ja": "プラットフォーム管理画面", "en": "Platform Admin", "ko": "플랫폼 관리자" }],
  ["商户后台", { "zh-Hant": "商戶後台", "ja": "店舗管理画面", "en": "Business Management", "ko": "사업자 관리 화면" }],
  ["调度中心", { "zh-Hant": "調度中心", "ja": "管理センター", "en": "Management Center", "ko": "관리 센터" }],
  ["管理中心", { "zh-Hant": "管理中心", "ja": "管理センター", "en": "Management Center", "ko": "관리 센터" }],
  ["技师", { "zh-Hant": "技師", "ja": "スタッフ", "en": "Technician", "ko": "기사" }],
  ["员工", { "zh-Hant": "員工", "ja": "スタッフ", "en": "Staff", "ko": "스태프" }],
  ["店铺", { "zh-Hant": "店鋪", "ja": "店舗", "en": "Store", "ko": "매장" }],
  ["商户", { "zh-Hant": "商戶", "ja": "店舗", "en": "Business", "ko": "사업자" }],
  ["预约", { "zh-Hant": "預約", "ja": "予約", "en": "Reservation", "ko": "예약" }],
  ["店铺预约", { "zh-Hant": "店家預約", "ja": "店舗予約", "en": "Store Reservation", "ko": "매장 예약" }],
  ["附近技师", { "zh-Hant": "附近技師", "ja": "スタッフ探し", "en": "Find staff", "ko": "주변 기사 찾기" }],
  ["查找服务", { "zh-Hant": "查找服務", "ja": "サービス探し", "en": "Find services", "ko": "서비스 찾기" }],
  ["我的日程", { "zh-Hant": "我的行程", "ja": "スケジュール", "en": "My schedule", "ko": "내 일정" }],
  ["可预约", { "zh-Hant": "可預約", "ja": "予約可能", "en": "Bookable", "ko": "예약 가능" }],
  ["日程 / 行程（用户端）", { "zh-Hant": "行程", "ja": "スケジュール", "en": "Schedule", "ko": "일정" }],
  ["日程 / 行程（技师端、商户端）", { "zh-Hant": "行程", "ja": "シフト", "en": "Shift", "ko": "근무표" }],
  ["排班", { "zh-Hant": "排班", "ja": "シフト", "en": "Shift", "ko": "근무표" }],
  ["班次", { "zh-Hant": "班次", "ja": "シフト", "en": "Shift", "ko": "근무" }],
  ["群（聊天/隐私）", { "zh-Hant": "群組", "ja": "グループ", "en": "Group", "ko": "그룹" }],
  ["上班时间", { "zh-Hant": "上班時間", "ja": "勤務時間", "en": "Work hours", "ko": "근무 시간" }],
  ["周期", { "zh-Hant": "週期", "ja": "周期", "en": "Cycle", "ko": "주기" }],
  ["当前周期确认", { "zh-Hant": "目前週期確認", "ja": "現状確認", "en": "Current Cycle Confirmation", "ko": "현재 주기 확인" }],
  ["最终确认", { "zh-Hant": "最終確認", "ja": "最終確認", "en": "Final Confirmation", "ko": "최종 확인" }],
  ["confirmed slots", { "zh-Hant": "confirmed slots", "ja": "confirmed slots", "en": "confirmed slots", "ko": "confirmed slots" }],
  ["派单", { "zh-Hant": "派單", "ja": "割当", "en": "Dispatch", "ko": "배정" }],
  ["候补", { "zh-Hant": "候補", "ja": "候補", "en": "Standby", "ko": "대기" }],
  ["冲突", { "zh-Hant": "衝突", "ja": "重複", "en": "Conflict", "ko": "충돌" }],
  ["缓冲", { "zh-Hant": "緩衝", "ja": "バッファ", "en": "Buffer", "ko": "버퍼" }],
  ["休息", { "zh-Hant": "休息", "ja": "休憩中", "en": "On Break", "ko": "휴식 중" }],
  ["空闲", { "zh-Hant": "空閒", "ja": "待機中", "en": "Standby", "ko": "대기 중" }],
  ["出勤", { "zh-Hant": "出勤", "ja": "出勤", "en": "On duty", "ko": "출근" }],
  ["移动中", { "zh-Hant": "移動中", "ja": "移動中", "en": "In transit", "ko": "이동 중" }],
  ["服务中", { "zh-Hant": "服務中", "ja": "サービス中", "en": "In service", "ko": "서비스 중" }],
  ["退勤", { "zh-Hant": "退勤", "ja": "退勤", "en": "Off duty", "ko": "퇴근" }],
  ["申请", { "zh-Hant": "申請", "ja": "申請", "en": "Application", "ko": "신청" }],
  ["申请更改", { "zh-Hant": "申請更改", "ja": "変更申請", "en": "Request changes", "ko": "변경 신청" }],
  ["确认收到", { "zh-Hant": "確認收到", "ja": "受取確認", "en": "Acknowledge", "ko": "수신 확인" }],
  ["处理", { "zh-Hant": "處理", "ja": "対応", "en": "Handling", "ko": "처리" }],
  ["人工处理", { "zh-Hant": "人工處理", "ja": "手動対応", "en": "Manual handling", "ko": "수동 처리" }],
  ["自动处理", { "zh-Hant": "自動處理", "ja": "自動対応", "en": "Automated handling", "ko": "자동 처리" }],
  ["智能排班", { "zh-Hant": "智能排班", "ja": "スマートシフト", "en": "Smart scheduling", "ko": "스마트 근무표" }],
  ["预测", { "zh-Hant": "預測", "ja": "予測", "en": "Forecast", "ko": "예측" }],
  ["异常队列", { "zh-Hant": "異常佇列", "ja": "例外キュー", "en": "Exception queue", "ko": "예외 대기열" }],
  ["质量评分", { "zh-Hant": "品質評分", "ja": "品質スコア", "en": "Quality score", "ko": "품질 점수" }],
  ["规则", { "zh-Hant": "規則", "ja": "規則", "en": "Rule", "ko": "규칙" }],
  ["模板", { "zh-Hant": "範本", "ja": "テンプレ", "en": "Template", "ko": "템플릿" }],
  ["通知", { "zh-Hant": "通知", "ja": "通知", "en": "Notification", "ko": "알림" }],
  ["资料", { "zh-Hant": "資料", "ja": "プロフィール", "en": "Profile", "ko": "프로필" }],
  ["头图", { "zh-Hant": "頭圖", "ja": "カバー画像", "en": "Header image", "ko": "헤더 이미지" }],
  ["关注", { "zh-Hant": "關注", "ja": "フォロー", "en": "Follow", "ko": "팔로우" }],
  ["已关注", { "zh-Hant": "已關注", "ja": "フォロー中", "en": "Following", "ko": "팔로우 중" }],
  ["推荐关注", { "zh-Hant": "推薦關注", "ja": "おすすめフォロー", "en": "Suggested follows", "ko": "추천 팔로우" }],
  ["信用值", { "zh-Hant": "信用值", "ja": "信用度", "en": "Credit level", "ko": "신용도" }],
  ["情报", { "zh-Hant": "情報", "ja": "オファー", "en": "Info", "ko": "정보" }],
  ["需求", { "zh-Hant": "需求", "ja": "需要", "en": "Need", "ko": "필요" }],
  ["利用政策", { "zh-Hant": "利用政策", "ja": "利用規約", "en": "Terms of Use", "ko": "이용약관" }],
  ["隐私政策", { "zh-Hant": "隱私政策", "ja": "個人情報保護方針", "en": "Privacy Policy", "ko": "개인정보 처리방침" }],
  ["注销账号", { "zh-Hant": "註銷帳號", "ja": "退会", "en": "Delete account", "ko": "계정 삭제" }],
  ["电子宠物", { "zh-Hant": "電子寵物", "ja": "ニードペット", "en": "NeeDo Pet", "ko": "니도 펫" }],
  ["更多技师", { "zh-Hant": "更多技師", "ja": "もっと見る", "en": "More technicians", "ko": "더 많은 기사" }],
  ["附近的技师", { "zh-Hant": "附近的技師", "ja": "付近のスタッフ", "en": "Nearby technicians", "ko": "주변 기사" }],
  ["查看", { "zh-Hant": "查看", "ja": "もっと見る", "en": "View", "ko": "보기" }],
  ["上门保洁", { "zh-Hant": "上門清潔", "ja": "家事代行", "en": "In-home cleaning", "ko": "방문 청소" }],
  ["需要", { "zh-Hant": "需要", "ja": "リクエスト", "en": "Request", "ko": "요청" }],
  ["转发", { "zh-Hant": "轉發", "ja": "シェア", "en": "Share", "ko": "공유" }],
  ["已选", { "zh-Hant": "已選", "ja": "選択済", "en": "Selected", "ko": "선택됨" }],
  ["自定义群名", { "zh-Hant": "自訂群組名稱", "ja": "グループ名入力", "en": "Custom group name", "ko": "사용자 지정 그룹명" }],
  ["标签", { "zh-Hant": "標籤", "ja": "タグ", "en": "Tag", "ko": "태그" }],
  ["公告", { "zh-Hant": "公告", "ja": "告知", "en": "Notice", "ko": "공지" }],
  ["显示", { "zh-Hant": "顯示", "ja": "表示モード", "en": "Display mode", "ko": "표시 모드" }],
  ["提醒", { "zh-Hant": "提醒", "ja": "リマインダー", "en": "Reminder", "ko": "리마인더" }],
  ["开始", { "zh-Hant": "開始", "ja": "開始", "en": "Start", "ko": "시작" }],
  ["结束", { "zh-Hant": "結束", "ja": "終了", "en": "End", "ko": "종료" }],
  ["地址", { "zh-Hant": "輸入地址", "ja": "住所を入力", "en": "Enter address", "ko": "주소 입력" }],
  ["URL", { "zh-Hant": "輸入 URL", "ja": "URLを入力", "en": "Enter URL", "ko": "URL 입력" }],
  ["备注(输入时)", { "zh-Hant": "輸入備註", "ja": "メモを入力", "en": "Enter note", "ko": "메모 입력" }],
  ["参加者", { "zh-Hant": "參加者", "ja": "参加者", "en": "Participants", "ko": "참가자" }],
  ["服务套餐菜单", { "zh-Hant": "服務菜單", "ja": "サービスメニュー", "en": "Service menu", "ko": "서비스 메뉴" }],
  ["店内照片墙", { "zh-Hant": "店內照片牆", "ja": "店内環境", "en": "Store gallery", "ko": "매장 사진 갤러리" }],
  ["到店信息", { "zh-Hant": "到店資訊", "ja": "店舗情報", "en": "Store visit information", "ko": "매장 방문 정보" }],
  ["套餐", { "zh-Hant": "服務套餐", "ja": "サービス", "en": "Service", "ko": "서비스" }],
  ["服务方式", { "zh-Hant": "服務方式", "ja": "サービス提供方法", "en": "Service method", "ko": "서비스 방식" }],
  ["到店服务", { "zh-Hant": "到店服務", "ja": "店内サービス", "en": "In-store service", "ko": "매장 서비스" }],
  ["上门服务", { "zh-Hant": "上門服務", "ja": "デリバリサービス", "en": "Home service", "ko": "방문 서비스" }],
  ["取消政策", { "zh-Hant": "取消政策", "ja": "キャンセルポリシー", "en": "Cancellation policy", "ko": "취소 정책" }],
  ["服务号", { "zh-Hant": "服務號", "ja": "サービス", "en": "Service account", "ko": "서비스 계정" }],
  ["备注(浏览时)", { "zh-Hant": "備註", "ja": "メモ", "en": "Note", "ko": "메모" }],
  ["￥000,000 起", { "zh-Hant": "￥000,000 起", "ja": "￥000,000〜", "en": "From ￥000,000", "ko": "￥000,000부터" }],
  ["家政", { "zh-Hant": "家政", "ja": "家事代行", "en": "Housekeeping", "ko": "가사 서비스" }],
  ["最快 00 分钟", { "zh-Hant": "最快 00 分鐘", "ja": "最短00分", "en": "As fast as 00 min", "ko": "최단 00분" }],
  ["可长期", { "zh-Hant": "可長期", "ja": "長期可", "en": "Long-term available", "ko": "장기 가능" }],
  ["下水道维修", { "zh-Hant": "下水道維修", "ja": "水回り修理", "en": "Drain repair", "ko": "하수도 수리" }],
  ["美甲", { "zh-Hant": "美甲", "ja": "ネイルデザイン", "en": "Nail design", "ko": "네일 디자인" }],
  ["美睫", { "zh-Hant": "美睫", "ja": "まつ毛美容", "en": "Lash beauty", "ko": "속눈썹 미용" }],
  ["当日可约", { "zh-Hant": "當日可約", "ja": "当日予約可", "en": "Same-day booking available", "ko": "당일 예약 가능" }],
  // End synced xlsx glossary terms.
];
