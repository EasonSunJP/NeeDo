import { describe, expect, it } from "vitest";
import { translateAffiliateAllianceText } from "../features/affiliate-alliance/i18n";
import { contentPublicationTranslations } from "../features/content-publication/i18n";
import { affiliateMarketplaceTranslations } from "../features/affiliate-marketplace/i18n";
import { translateImUiText } from "../features/im/ui-copy";
import type { Language } from "./translations";
import { getTranslationLookupCandidates, languages, registerTranslationEntries, translateText, translateTextForContext, translations } from "./translations";

describe("translations", () => {
  it("uses complete and natural Japanese throughout the visible user center", () => {
    const expected = {
      "个人中心": "マイページ",
      "个人中心说明": "マイページの説明",
      "账号资料、订单入口与服务权益都统一收在这里。": "アカウント情報、予約、各種特典をここでまとめて確認できます。",
      "账号与服务": "アカウント・各種設定",
      "账号设置": "アカウント設定",
      "手机号、邮箱、登录密码": "電話番号・メールアドレス・パスワード",
      "支付方式": "支払い方法",
      "现金、NDP 与外部渠道状态": "現金・NDP・外部決済の状況",
      "银行卡、PayPay、现金": "クレジットカード・PayPay・現金",
      "发票记录": "請求書履歴",
      "发票功能暂未开放": "請求書機能は現在利用できません",
      "企业抬头与历史发票": "請求先情報・過去の請求書",
      "通知设置": "通知設定",
      "订单、营销、客服提醒": "予約・キャンペーン・サポートからのお知らせ",
      "隐私与安全": "プライバシーとセキュリティ",
      "登录设备、数据授权": "ログイン端末・データ利用設定",
      "联系客服": "サポートに問い合わせる",
      "退款、改期、投诉风控": "返金・予約変更・トラブルの相談",
      "我的收藏": "お気に入り",
      "我的地址": "登録住所",
      "家庭、公司、常用地址": "自宅・勤務先・よく使う住所",
      "我的评价": "レビュー",
      "已评价与待回复": "投稿済み・返信待ちのレビュー",
      "eKYC本人确认": "本人確認（eKYC）",
      "实名、证件、本人确认": "氏名・本人確認書類・本人確認",
      "店铺会员": "店舗会員",
      "查看已加入店铺与会员卡状态": "加入中の店舗と会員証を確認できます",
      "我的订单": "予約",
      "全部订单": "すべての予約",
      "待服务": "サービス待ち",
      "进行中": "サービス中",
      "预约一览": "予約一覧",
      "查看全部预约、订单状态和详情跳转": "予約一覧とステータス、詳細を確認できます。",
      "更换头像": "プロフィール画像を変更",
      "头像裁剪预览": "プロフィール画像の調整プレビュー",
      "头像裁剪已套用，点击保存后生效。": "画像の調整を反映しました。保存すると変更が確定します。",
      "基础信息": "基本情報",
      "利用次数": "利用回数",
      "信用值": "信用度",
      "未设定": "未設定",
      "未设置": "未設定",
      "去认证": "本人確認へ",
      "查看账号设置说明": "アカウント設定の説明を表示",
      "查看支付方式说明": "支払い方法の説明を表示",
      "查看发票记录说明": "請求書履歴の説明を表示",
      "查看通知设置说明": "通知設定の説明を表示",
      "查看隐私与安全说明": "プライバシーとセキュリティの説明を表示",
      "查看联系客服说明": "お問い合わせの説明を表示",
      "查看预约一览说明": "予約一覧の説明を表示",
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      const actual = translateText(source, "ja");
      expect(actual, source).toBe(localized);
      expect(actual, source).not.toContain("…");
    }
  });

  it("uses natural Japanese throughout the profile privacy flow", () => {
    const expected = {
      "全员可见": "全員に表示",
      "公开可见": "全員に表示",
      "对所有人不可见": "全員に非表示",
      "仅好友可见": "友だちにのみ表示",
      "对好友可见": "友だちにのみ表示",
      "好友及关联人可见": "友だち・関係者に表示",
      "对好友以及关联人可见": "友だち・関係者に表示",
      "仅本人可见": "自分だけに表示",
      "仅好友可以看到该账号信息": "友だちのみ、このアカウント情報を確認できます。",
      "仅好友以及关联店铺和介绍关系中的关联人可见": "友だち、および関係する店舗・紹介関係者にのみ表示されます。",
      "隐私模式": "プライベートモード",
      "开启隐私模式": "プライベートモードをオンにする",
      "是否开启隐私模式": "プライベートモードをオンにする",
      "查看隐私范围说明": "公開範囲の説明を表示",
      "开启隐私模式后，你的账号将不会显示在搜索结果中。确定要开启吗？":
        "プライベートモードをオンにすると、あなたのアカウントは検索結果に表示されなくなります。オンにしますか？",
      "开启": "オンにする",
      "取消": "キャンセル",
      "隐私模式已关闭": "プライベートモードをオフにしました",
      "隐私模式设置已保存": "プライベートモード設定を保存しました",
      "隐私模式保存失败，请重试": "プライベートモードを保存できませんでした。もう一度お試しください",
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      expect(translateText(source, "ja"), source).toBe(localized);
    }
  });

  it("uses お気に入り consistently for every visible favorite action and label", () => {
    const expected = {
      "收藏": "お気に入り",
      "取消收藏": "お気に入りから削除",
      "已收藏": "お気に入り登録済み",
      "收藏门店": "店舗をお気に入りに追加",
      "收藏数": "お気に入り数",
      "收藏人数": "お気に入り登録者数",
      "查看收藏详细数字": "お気に入り登録数の詳細を表示",
      "收藏失败，请稍后重试": "お気に入りに追加できませんでした。しばらくしてからもう一度お試しください。",
      "家已收藏": "店舗をお気に入りに登録済み",
      "惠比寿居酒屋收藏榜": "恵比寿の居酒屋 お気に入りランキング",
      "按收入、收藏人气和订单量查看技师排名。": "売上、お気に入り登録数、注文数別にスタッフランキングを確認できます。",
      "回复、点赞、转发、引用和收藏需要对应正式数据合同、权限和审计记录，当前不会写入本地假数据。": "返信、いいね、再投稿、引用、お気に入り登録には正式なデータ契約、権限、監査記録が必要です。現在はローカルのサンプルデータに書き込みません。",
      "服务前提醒很有帮助，已经收藏了。": "サービス前のリマインダーがとても役立ったので、お気に入りに追加しました。",
      "可线上预约、可收藏、可查看担当者、支持平台内聊天沟通。": "オンライン予約、お気に入りへの追加、担当スタッフの確認、アプリ内チャットが利用できます。",
      "上次你发的那家店我也收藏了。": "前回送ってくれたお店もお気に入りに追加しておきました。",
      "我看你上次收藏的那家店这周末还有双人档，要不要一起去？": "前にお気に入りに追加したお店は、今週末も2名で予約できるよ。一緒に行かない？",
      "我收藏的服务卡，方便朋友直接了解价格、时长和可约时间。": "お気に入りに追加したサービスカードなら、友だちも料金・所要時間・予約可能時間をすぐ確認できます。",
      "限时动态 -> Swipe link -> App 注册 -> 店铺收藏": "ストーリーズ → スワイプリンク → アプリ登録 → 店舗をお気に入りに追加",
      "像朋友圈一样记录服务体验、收藏店铺和生活片段": "SNSのように、サービス体験やお気に入りの店舗、日常の出来事を記録できます。",
      "长短视频测评 -> 简介链接 -> 店铺页收藏 -> 首单支付": "動画レビュー → プロフィールリンク → 店舗をお気に入りに追加 → 初回注文の支払い",
      "这家我也收藏了，照片很有参考价值。": "このお店もお気に入りに追加しました。写真がとても参考になります。",
      "最近收藏了夜间护理": "最近、夜間ケアをお気に入りに追加しました。",
      "本次更新继续重做了前台三端共用的聊天底部输入模块。此前底部功能虽然已经可以发送图片、订单和位置，但整体位置偏低，输入区和加号面板也还不够像成熟的手机聊天工具。现在输入区已经改成更贴近参考图的结构：左边是独立的语音按钮，中间是主输入条，内部保留发送纸飞机图标，右边是表情和加号；整体底边也向上收了一些，更接近底部导航文字的基线位置。与此同时，加号面板从原来的 7 项改成了更完整的 8 宫格：保留照片、拍摄、视频通话、语音通话、位置、订单，并把“收藏”改成“介绍”，再新增“支付”入口，减少概念歧义。当前进入页版本号已同步更新为 ver：2604160836。": "今回の更新では、3つのユーザー向け画面で共通利用するチャット入力欄を刷新しました。左に音声、中央に入力欄と送信、右に絵文字と追加メニューを配置し、下端も調整しています。追加メニューは8項目に整理し、「お気に入り」を「紹介」に変更して「支払い」を追加しました。入口ページのバージョンは ver：2604160836 です。",
      "聊天输入区这次重新按手机 IM 的习惯做了收口：左侧保留语音入口，中间是输入条，右侧是表情与加号；加号面板里把收藏改成了介绍，并新增了支付入口。": "チャット入力欄をモバイル向けに整理しました。左に音声、中央に入力欄、右に絵文字と追加メニューを配置し、追加メニューの「お気に入り」を「紹介」に変更して「支払い」を追加しました。",
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      expect(translateText(source, "ja"), source).toBe(localized);
    }

    for (const [source, entry] of Object.entries(translations)) {
      if (source.includes("收藏")) {
        expect(entry.ja, source).not.toMatch(/コレクション|集める|ブックマーク|保存|…/u);
      }
    }
  });

  it("localizes authoritative server pagination summaries in every supported UI language", () => {
    const source = "服务器共 20476 条，第 1 / 1024 页";

    expect(translateText(source, "zh")).toBe(source);
    expect(translateText(source, "zh-Hant")).toBe("伺服器共 20,476 筆，第 1 / 1,024 頁");
    expect(translateText(source, "ja")).toBe("サーバー全 20,476 件、1 / 1,024 ページ");
    expect(translateText(source, "en")).toBe("20,476 server records, page 1 of 1,024");
    expect(translateText(source, "ko")).toBe("서버 전체 20,476건 · 1 / 1,024페이지");
  });
  it("keeps employee schedule booking states and accessibility labels as complete localized phrases", () => {
    const expected = {
      "待确认预约": { zh: "待确认预约", "zh-Hant": "待確認預約", ja: "確認待ちの予約", en: "Booking awaiting confirmation", ko: "확인 대기 예약" },
      "已确认预约": { zh: "已确认预约", "zh-Hant": "已確認預約", ja: "確定済みの予約", en: "Confirmed booking", ko: "확정된 예약" },
      "打开排班标签显示选项": { zh: "打开排班标签显示选项", "zh-Hant": "開啟排班標籤顯示選項", ja: "シフトラベルの表示設定を開く", en: "Open schedule label display options", ko: "근무표 라벨 표시 설정 열기" },
      "关闭排班标签遮罩": { zh: "关闭排班标签遮罩", "zh-Hant": "關閉排班標籤選項", ja: "シフトラベルの表示設定を閉じる", en: "Close schedule label display options", ko: "근무표 라벨 표시 설정 닫기" },
      "关闭显示标签": { zh: "关闭显示标签", "zh-Hant": "關閉顯示標籤", ja: "表示ラベル設定を閉じる", en: "Close label display settings", ko: "표시 라벨 설정 닫기" },
      "切换排班展示范围": { zh: "切换排班展示范围", "zh-Hant": "切換排班顯示範圍", ja: "シフト表示範囲を切り替える", en: "Change schedule view", ko: "근무표 표시 범위 전환" },
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      for (const { code } of languages) {
        expect(translateText(source, code), `${source}:${code}`).toBe(localized[code]);
      }
    }
  });

  it("localizes the disabled invoice feature explanation in all five App languages", () => {
    const expected = {
      zh: "发票功能暂未开放",
      "zh-Hant": "發票功能暫未開放",
      ja: "請求書機能は現在利用できません",
      en: "Invoice features are not available yet",
      ko: "청구서 기능은 아직 사용할 수 없습니다"
    } as const;

    for (const { code } of languages) {
      expect(translateText("发票功能暂未开放", code), code).toBe(expected[code]);
    }
  });

  it("localizes the merchant revenue custom-date option in all five App languages", () => {
    const expected = {
      zh: "自定义日期",
      "zh-Hant": "自訂日期",
      ja: "期間を指定",
      en: "Custom dates",
      ko: "사용자 지정 날짜"
    } as const;

    for (const { code } of languages) {
      expect(translateText("自定义日期", code), code).toBe(expected[code]);
    }
  });

  it("localizes merchant trend chart copy and count units in all supported languages", () => {
    const expected = {
      "订单趋势": { zh: "订单趋势", "zh-Hant": "訂單趨勢", ja: "注文トレンド", en: "Order trends", ko: "주문 추이" },
      "同一期间 · 双独立刻度": { zh: "同一期间 · 双独立刻度", "zh-Hant": "同一期間 · 雙獨立刻度", ja: "同じ期間 · 2つの独立した目盛", en: "Same period · two independent scales", ko: "같은 기간 · 두 개의 독립 눈금" },
      峰值: { zh: "峰值", "zh-Hant": "峰值", ja: "ピーク", en: "Peak", ko: "최고치" },
      单: { zh: "单", "zh-Hant": "單", ja: "件", en: "orders", ko: "건" },
      营业额: { zh: "营业额", "zh-Hant": "營業額", ja: "売上", en: "Revenue", ko: "매출" },
      订单数: { zh: "订单数", "zh-Hant": "訂單數", ja: "注文数", en: "Orders", ko: "주문 수" },
      "订单趋势图例": { zh: "订单趋势图例", "zh-Hant": "訂單趨勢圖例", ja: "注文トレンドの凡例", en: "Order trend legend", ko: "주문 추이 범례" },
      "隐藏营业额趋势": { zh: "隐藏营业额趋势", "zh-Hant": "隱藏營業額趨勢", ja: "売上トレンドを非表示", en: "Hide revenue trend", ko: "매출 추세 숨기기" },
      "显示营业额趋势": { zh: "显示营业额趋势", "zh-Hant": "顯示營業額趨勢", ja: "売上トレンドを表示", en: "Show revenue trend", ko: "매출 추세 표시" },
      "隐藏订单数趋势": { zh: "隐藏订单数趋势", "zh-Hant": "隱藏訂單數趨勢", ja: "注文数トレンドを非表示", en: "Hide order trend", ko: "주문 추세 숨기기" },
      "显示订单数趋势": { zh: "显示订单数趋势", "zh-Hant": "顯示訂單數趨勢", ja: "注文数トレンドを表示", en: "Show order trend", ko: "주문 추세 표시" }
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      expect(translations[source], source).toEqual({
        "zh-Hant": localized["zh-Hant"],
        ja: localized.ja,
        en: localized.en,
        ko: localized.ko
      });
      for (const { code } of languages) {
        expect(translateText(source, code), `${source}:${code}`).toBe(localized[code]);
      }
    }
  });

  it("localizes the admin operator pending summaries in all five App languages", () => {
    for (const source of [
      "运营后台成员",
      "暂无待处理订单",
      "暂无待审核申请",
      "待审核共",
      "正在加载…",
      "加载失败，请重试",
      "权限已变化，请刷新页面",
      "待确认",
      "申请编号"
    ]) {
      for (const { code } of languages) {
        const localized = translateText(source, code);
        expect(localized, `${source}:${code}`).toBeTruthy();
        if (code !== "zh") expect(localized, `${source}:${code}`).not.toBe(source);
      }
    }
  });

  it("localizes the formal travel-fare workflow in all five App languages", () => {
    for (const source of [
      "Geoapify 尚未配置",
      "发布不可变版本",
      "添加距离区间",
      "距离必须是大于 0、精确到米的数值。",
      "请输入有效的生效时间。",
      "邮政编码",
      "邮编 104-0061",
      "丁目、番地（可选）",
      "建筑物、房间号（可选）",
      "请先从上方时间栏选定一个可用时段，再估算交通费。",
      "为保护上门地址隐私，此处不加载第三方地图预览。",
      "估算交通费",
      "正式交通费",
      "交通费估价已过期，请重新估算。",
      "该地址超出店铺的上门服务范围。",
      "路线供应商尚未配置，暂时无法估算交通费。",
      "Geoapify 正常",
      "Geoapify 已限流",
      "Geoapify 不可用",
      "Geoapify 已配置，尚未探测",
      "供应商限流",
      "供应商不可用",
      "检测时间",
      "距离费率区间最多为 50 个。",
      "不可变发布历史",
      "尚无已发布版本。",
      "上一页历史",
      "下一页历史",
      "确认发布内容",
      "确认发布",
      "当前账号只有查看权限，不能发布新的交通费策略。",
      "估价有效至"
    ]) {
      for (const { code } of languages) {
        const localized = translateText(source, code);
        expect(localized, `${source}:${code}`).toBeTruthy();
        if (code !== "zh") expect(localized, `${source}:${code}`).not.toBe(source);
      }
    }
  });

  it("localizes media expiry and retry feedback in every App language", () => {
    for (const source of ["图片已过期", "视频已过期", "图片加载失败，点击重试", "视频加载失败，点击重试", "语音加载失败，点击重试"]) {
      for (const { code } of languages) {
        const localized = translateText(source, code);
        expect(localized, `${source}:${code}`).toBeTruthy();
        if (code !== "zh") expect(localized, `${source}:${code}`).not.toBe(source);
      }
    }
  });

  it("localizes the technician service cover editor in all five App languages", () => {
    const expected = {
      "服务封面": { "zh-Hant": "服務封面", ja: "サービスカバー", en: "Service cover", ko: "서비스 커버" },
      "上传服务封面": { "zh-Hant": "上傳服務封面", ja: "サービスカバーをアップロード", en: "Upload service cover", ko: "서비스 커버 업로드" },
      "更换图片": { "zh-Hant": "更換圖片", ja: "画像を変更", en: "Change image", ko: "이미지 변경" },
      "移除图片": { "zh-Hant": "移除圖片", ja: "画像を削除", en: "Remove image", ko: "이미지 삭제" },
      "恢复当前封面": { "zh-Hant": "恢復目前封面", ja: "現在のカバーを復元", en: "Restore current cover", ko: "현재 커버 복원" },
      "JPEG / PNG / WebP，最大 8 MiB": { "zh-Hant": "JPEG / PNG / WebP，最大 8 MiB", ja: "JPEG / PNG / WebP、最大 8 MiB", en: "JPEG / PNG / WebP, up to 8 MiB", ko: "JPEG / PNG / WebP, 최대 8 MiB" },
      "仅支持 JPEG、PNG 或 WebP 图片": { "zh-Hant": "僅支援 JPEG、PNG 或 WebP 圖片", ja: "JPEG、PNG、WebP 画像のみ対応しています", en: "Only JPEG, PNG, or WebP images are supported", ko: "JPEG, PNG 또는 WebP 이미지만 지원합니다" },
      "图片不能超过 8 MiB": { "zh-Hant": "圖片不能超過 8 MiB", ja: "画像は 8 MiB 以下にしてください", en: "The image must not exceed 8 MiB", ko: "이미지는 8 MiB를 초과할 수 없습니다" },
      "服务已保存，封面上传失败，请重试": { "zh-Hant": "服務已儲存，封面上傳失敗，請重試", ja: "サービスは保存されましたが、カバーのアップロードに失敗しました。再試行してください", en: "Service saved, but the cover upload failed. Please retry", ko: "서비스는 저장되었지만 커버 업로드에 실패했습니다. 다시 시도해 주세요" },
      "封面上传失败，请重试": { "zh-Hant": "封面上傳失敗，請重試", ja: "カバーのアップロードに失敗しました。再試行してください", en: "Cover upload failed. Please retry", ko: "커버 업로드에 실패했습니다. 다시 시도해 주세요" },
      "重试上传封面": { "zh-Hant": "重試上傳封面", ja: "カバーのアップロードを再試行", en: "Retry cover upload", ko: "커버 업로드 다시 시도" },
      "服务已保存，封面移除失败，请重试": { "zh-Hant": "服務已儲存，封面移除失敗，請重試", ja: "サービスは保存されましたが、カバーの削除に失敗しました。再試行してください", en: "Service saved, but cover removal failed. Please retry", ko: "서비스는 저장되었지만 커버 삭제에 실패했습니다. 다시 시도해 주세요" },
      "封面移除失败，请重试": { "zh-Hant": "封面移除失敗，請重試", ja: "カバーの削除に失敗しました。再試行してください", en: "Cover removal failed. Please retry", ko: "커버 삭제에 실패했습니다. 다시 시도해 주세요" },
      "重试移除封面": { "zh-Hant": "重試移除封面", ja: "カバーの削除を再試行", en: "Retry cover removal", ko: "커버 삭제 다시 시도" },
      "完成并关闭": { "zh-Hant": "完成並關閉", ja: "完了して閉じる", en: "Finish and close", ko: "완료 후 닫기" }
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      expect(translations[source], source).toEqual(localized);
      for (const { code } of languages) {
        expect(translateText(source, code), `${source}:${code}`).toBe(code === "zh" ? source : localized[code]);
      }
    }
  });

  it("registers lazy feature copy without overriding the global source of truth", () => {
    registerTranslationEntries({
      "lazy feature probe": { ja: "遅延機能", en: "Lazy feature", ko: "지연 기능" },
      "取消": { ja: "上書き禁止" },
    });

    expect(translateText("lazy feature probe", "ja")).toBe("遅延機能");
    expect(translateText("取消", "ja")).not.toBe("上書き禁止");
  });

  it("localizes automatic chat translation controls in all five App languages", () => {
    const expected = {
      "聊天内容自动翻译": {
        zh: "聊天内容自动翻译",
        "zh-Hant": "聊天內容自動翻譯",
        ja: "チャット内容を自動翻訳",
        en: "Automatically translate chat",
        ko: "채팅 내용 자동 번역",
      },
      "打开后按当前 App 语言显示；关闭后显示原文": {
        zh: "打开后按当前 App 语言显示；关闭后显示原文",
        "zh-Hant": "開啟後依目前 App 語言顯示；關閉後顯示原文",
        ja: "オンにすると現在のアプリ言語で表示し、オフにすると原文を表示します",
        en: "On: display in the current app language; Off: display the original text",
        ko: "켜면 현재 앱 언어로 표시하고, 끄면 원문을 표시합니다",
      },
      "聊天内容自动翻译设置失败，请稍后重试": {
        zh: "聊天内容自动翻译设置失败，请稍后重试",
        "zh-Hant": "聊天內容自動翻譯設定失敗，請稍後再試",
        ja: "チャット内容の自動翻訳設定に失敗しました。しばらくしてからもう一度お試しください",
        en: "Couldn't update automatic chat translation. Try again later.",
        ko: "채팅 내용 자동 번역 설정에 실패했습니다. 잠시 후 다시 시도해 주세요",
      },
    } as const;

    Object.entries(expected).forEach(([source, translationsByLanguage]) => {
      Object.entries(translationsByLanguage).forEach(([language, translated]) => {
        expect(translateText(source, language as keyof typeof translationsByLanguage)).toBe(translated);
      });
    });
  });

  it("keeps the complete IM translation action labels localized without split-key fallback", () => {
    const expected = {
      "隐藏译文": {
        zh: "隐藏译文",
        "zh-Hant": "隱藏譯文",
        ja: "翻訳を隠す",
        en: "Hide translation",
        ko: "번역 숨기기",
      },
      "显示译文": {
        zh: "显示译文",
        "zh-Hant": "顯示譯文",
        ja: "翻訳を表示",
        en: "Show translation",
        ko: "번역 보기",
      },
      "多选": {
        zh: "多选",
        "zh-Hant": "多選",
        ja: "複数選択",
        en: "Multi-select",
        ko: "다중 선택",
      },
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      for (const { code } of languages) {
        expect(translateText(source, code), `${source}:${code}`).toBe(localized[code]);
      }
      expect(translateText(source, "zh-Hant")).not.toBe(source);
      expect(translateText(source, "ja")).not.toBe(source);
      expect(translateText(source, "en")).not.toBe(source);
      expect(translateText(source, "ko")).not.toBe(source);
    }
  });

  it("localizes the complete IM voice recording confirmation flow", () => {
    const voiceKeys = [
      "录制语音",
      "正在连接麦克风",
      "后将停止录音",
      "取消录音",
      "停止录音",
      "删除录音",
      "重放录音",
      "发送录音",
      "录音预览",
      "正在播放录音",
      "正在发送录音",
      "录音失败，请重试",
      "请允许麦克风权限后重试",
      "没有检测到麦克风声音，请检查输入设备后重试",
      "当前设备不支持浏览器录音",
      "自动播放已暂停，请点击重放",
      "语音发送失败，请重试",
    ] as const;

    for (const key of voiceKeys) {
      expect(translations[key], key).toMatchObject({
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String),
      });
      expect(translateText(key, "zh-Hant")).not.toBe(key);
      expect(translateText(key, "ja")).not.toBe(key);
      expect(translateText(key, "en")).not.toBe(key);
      expect(translateText(key, "ko")).not.toBe(key);
    }
  });

  it("preserves complete voice error guidance in all five languages", () => {
    const expected = {
      "请允许麦克风权限后重试": {
        zh: "请允许麦克风权限后重试",
        "zh-Hant": String.fromCodePoint(
          0x8acb, 0x5141, 0x8a31, 0x9ea5, 0x514b, 0x98a8, 0x6b0a, 0x9650, 0x5f8c, 0x91cd, 0x8a66,
        ),
        ja: "マイクの使用を許可してから再試行してください",
        en: "Allow microphone access, then try again",
        ko: "마이크 권한을 허용한 후 다시 시도하세요",
      },
      "自动播放已暂停，请点击重放": {
        zh: "自动播放已暂停，请点击重放",
        "zh-Hant": String.fromCodePoint(
          0x81ea, 0x52d5, 0x64ad, 0x653e, 0x5df2, 0x66ab, 0x505c, 0xff0c, 0x8acb, 0x9ede, 0x64ca,
          0x91cd, 0x64ad,
        ),
        ja: "自動再生が一時停止しました。再生をタップしてください",
        en: "Autoplay paused. Tap replay",
        ko: "자동 재생이 일시 중지되었습니다. 다시 재생을 탭하세요",
      },
      "当前设备不支持浏览器录音": {
        zh: "当前设备不支持浏览器录音",
        "zh-Hant": String.fromCodePoint(
          0x76ee, 0x524d, 0x88dd, 0x7f6e, 0x4e0d, 0x652f, 0x63f4, 0x700f, 0x89bd, 0x5668, 0x9304,
          0x97f3,
        ),
        ja: "この端末ではブラウザ録音を利用できません",
        en: "Browser recording is not supported on this device",
        ko: "현재 기기에서는 브라우저 녹음을 지원하지 않습니다",
      },
      "没有检测到麦克风声音，请检查输入设备后重试": {
        zh: "没有检测到麦克风声音，请检查输入设备后重试",
        "zh-Hant": "沒有偵測到麥克風聲音，請檢查輸入裝置後重試",
        ja: "マイクから音声が検出されません。入力デバイスを確認してから再試行してください",
        en: "No microphone input detected. Check your input device and try again.",
        ko: "마이크 입력이 감지되지 않았습니다. 입력 장치를 확인한 후 다시 시도하세요",
      },
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      for (const { code } of languages) {
        expect(translateText(source, code), `${source}:${code}`).toBe(localized[code]);
      }
    }
  });

  it("localizes the complete friend-verification flow in all five languages", () => {
    const friendVerificationCopy = [
      "取消",
      "添加好友",
      "拒绝",
      "关闭",
      "等待对方验证",
      "待处理",
      "成功添加",
      "被拒绝",
      "已拒绝",
      "已过期",
      "对方不是你的好友，信息发送失败",
      "点击账号查看资料并发送好友申请",
    ];

    friendVerificationCopy.forEach((source) => {
      expect(translations[source], source).toMatchObject({
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String),
      });
    });
  });

  it("localizes every Affiliate marketplace chrome string in all five languages", () => {
    Object.values(affiliateMarketplaceTranslations).forEach((entry) => {
      expect(entry).toMatchObject({
        zh: expect.any(String),
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String)
      });
      expect(Object.values(entry).every((value) => value.trim().length > 0)).toBe(true);
    });

    [
      "推荐任务",
      "正在读取推荐任务",
      "剩余：{percent}%",
      "当前最高收益：{amount} NDP",
      "任务详细",
      "本次总预算",
      "目前剩余预算 {percent}%",
      "聊天咨询",
      "立即参加"
    ].forEach((source) => {
      expect(translations).toHaveProperty(source);
      expect(translations[source]).toMatchObject({
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String)
      });
    });
  });

  it("localizes every shared carousel state in all five supported languages", () => {
    Object.values(contentPublicationTranslations).forEach((entry) => {
      expect(entry).toMatchObject({
        zh: expect.any(String),
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String)
      });
      expect(Object.values(entry).every((value) => value.trim().length > 0)).toBe(true);
    });
  });

  it("keeps the shared language selector order aligned with product rules", () => {
    expect(languages.map((item) => item.code)).toEqual(["ja", "en", "ko", "zh-Hant", "zh"]);
    expect(languages.map((item) => item.label)).toEqual(["日本語", "English", "한국어", "繁中", "简中"]);
  });

  it("uses Traditional Chinese lookup candidates without cross-language fallback", () => {
    expect(getTranslationLookupCandidates("zh-Hant")).toEqual(["zh-Hant"]);
  });

  it("prioritizes Korean entries before fallback languages", () => {
    expect(getTranslationLookupCandidates("ko")).toEqual(["ko", "en", "ja"]);
  });

  it("returns the workbook-provided translation for configured keys", () => {
    const saveRow = translations["保存"];
    const englishRow = translations["English"];

    expect(translateText("保存", "zh-Hant")).toBe(saveRow["zh-Hant"] ?? "保存");
    expect(translateText("保存", "ko")).toBe(saveRow.ko ?? saveRow.en ?? saveRow.ja ?? "保存");
    expect(translateText("English", "ko")).toBe(englishRow.ko ?? englishRow.en ?? englishRow.ja ?? "English");
  });

  it("localizes the password-save control in every supported target language", () => {
    expect(translateText("保存密码", "zh-Hant")).toBe("儲存密碼");
    expect(translateText("保存密码", "ja")).toBe("パスワードを保存");
    expect(translateText("保存密码", "en")).toBe("Save password");
    expect(translateText("保存密码", "ko")).toBe("비밀번호 저장");
  });

  it("localizes the group privacy countdown maximum", () => {
    expect(translateText("时间上限最大为99小时59分钟", "zh-Hant")).toBe("時間上限最大為99小時59分鐘");
    expect(translateText("时间上限最大为99小时59分钟", "ja")).toBe("時間の上限は99時間59分です");
    expect(translateText("时间上限最大为99小时59分钟", "en")).toBe("The maximum time is 99 hours 59 minutes");
    expect(translateText("时间上限最大为99小时59分钟", "ko")).toBe("최대 시간은 99시간 59분입니다");
  });

  it("localizes the Social quick-reply sending state without obsolete full-composer copy", () => {
    expect(translations).not.toHaveProperty("打开完整回复");
    expect(translations).not.toHaveProperty("回复草稿");
    expect(translations).not.toHaveProperty("你可以从底部输入框直接回复，也可以进入完整发帖页继续补充文字、图片和引用内容。");
    expect(translations["回复中"]).toEqual({
      "zh-Hant": "回覆中",
      ja: "返信中",
      en: "Replying",
      ko: "답글 작성 중",
    });
  });

  it("localizes every Social quick-reply attachment state and action in all five languages", () => {
    const keys = [
      "图片上传中",
      "上传失败",
      "移除图片",
      "重试图片",
      "已选位置",
      "移除位置"
    ] as const;

    keys.forEach((key) => {
      expect(key.trim().length, `${key}:zh`).toBeGreaterThan(0);
      expect(translations[key], key).toMatchObject({
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String)
      });
      expect(Object.values(translations[key]).every((value) => value?.trim())).toBe(true);
    });
  });

  it("localizes the canonical Social post-detail reply header", () => {
    expect(translations["回复动态"]).toEqual({
      "zh-Hant": "回覆動態",
      ja: "投稿に返信",
      en: "Reply to Post",
      ko: "게시물에 답글"
    });
  });

  it("localizes the semantic Social post-detail link label", () => {
    expect(translations["查看动态详情"]).toEqual({
      "zh-Hant": "查看動態詳情",
      ja: "投稿の詳細を見る",
      en: "View post details",
      ko: "게시물 상세 보기"
    });
  });

  it("keeps truly unknown source text untouched", () => {
    const unknownText = "__test_unknown_translation_key__";
    expect(translateText(unknownText, "ko")).toBe(unknownText);
    expect(translateText(unknownText, "zh-Hant")).toBe(unknownText);
  });

  it("localizes every technician-ranking metric, state, and drawer label", () => {
    expect(translateText("平均客单价", "zh-Hant")).toBe("平均客單價");
    expect(translateText("平均客单价", "ja")).toBe("平均注文単価");
    expect(translateText("平均客单价", "en")).toBe("Average order value");
    expect(translateText("平均客单价", "ko")).toBe("평균 주문 금액");
    expect(translateText("已完成订单服务金额 ÷ 已完成订单数", "ja")).toBe("完了注文のサービス金額 ÷ 完了注文数");
    expect(translateText("榜单读取失败", "en")).toBe("Couldn't load ranking");
    expect(translateText("榜单读取失败", "ko")).toBe("순위를 불러오지 못했습니다");
    expect(translateText("榜单期间", "zh-Hant")).toBe("榜單期間");
    expect(translateText("榜单期间", "ja")).toBe("ランキング対象期間");
    expect(translateText("榜单期间", "en")).toBe("Ranking period");
    expect(translateText("榜单期间", "ko")).toBe("순위 집계 기간");
    expect(translateText("服务金额", "ja")).toBe("サービス金額");
    expect(translateText("完成订单", "en")).toBe("Completed orders");
    expect(translations).toMatchObject({
      "搜索技师、邮箱或店铺": { "zh-Hant": "搜尋技師、信箱或店鋪", ja: "スタッフ・メール・店舗を検索", en: "Search staff, email, or shop", ko: "기사, 이메일 또는 매장 검색" },
      "技师": { "zh-Hant": "技師", ja: "スタッフ", en: "Technician", ko: "기사" },
      "技师榜单": { "zh-Hant": "技師榜單", ja: "スタッフランキング", en: "Technician ranking", ko: "기사 순위" },
      "技师业绩排行": { "zh-Hant": "技師業績排行", ja: "スタッフパフォーマンスランキング", en: "Technician performance ranking", ko: "기사 실적 순위" },
      "位有完单技师": { "zh-Hant": "位有完單記錄的技師", ja: "名の完了実績があるスタッフ", en: "technicians with completed orders", ko: "명의 완료 실적이 있는 기사" },
      "位技师": { "zh-Hant": "位技師", ja: "人のスタッフ", en: "staff", ko: "명의 기사" },
      "个人技师": { "zh-Hant": "個人技師", ja: "個人スタッフ", en: "Personal staff", ko: "개인 기사" },
      "正在读取技师正式详情...": { "zh-Hant": "正在讀取技師正式詳情...", ja: "スタッフの正式詳細を読み込み中...", en: "Loading technician production details...", ko: "기사 정식 상세 정보를 불러오는 중..." },
      "技师正式详情读取失败": { "zh-Hant": "技師正式詳情讀取失敗", ja: "スタッフの正式詳細を読み込めませんでした", en: "Technician production details failed to load", ko: "기사 정식 상세 정보를 불러오지 못했습니다" },
      "技师集中详情": { "zh-Hant": "技師集中詳情", ja: "スタッフ詳細", en: "Technician details", ko: "기사 상세" },
      "近 30 天": { "zh-Hant": "近 30 天", ja: "直近 30 日間", en: "Last 30 days", ko: "최근 30일" },
      "自定义": { "zh-Hant": "自訂", ja: "カスタム", en: "Custom", ko: "사용자 지정" },
      "开始日期": { "zh-Hant": "開始日期", ja: "開始日", en: "Start date", ko: "시작일" },
      "筛选店铺": { "zh-Hant": "篩選店鋪", ja: "店舗で絞り込み", en: "Filter by shop", ko: "매장 필터" },
      "导出 CSV": { "zh-Hant": "匯出 CSV", ja: "CSVをエクスポート", en: "Export CSV", ko: "CSV 내보내기" },
      "当前期间暂无已完成订单": { "zh-Hant": "目前期間暫無已完成訂單", ja: "この期間に完了注文はありません", en: "No completed orders in this period", ko: "현재 기간에 완료된 주문이 없습니다" },
      "查看详情": { "zh-Hant": "看詳情", ja: "詳細を確認", en: "Check the details", ko: "상세 보기" }
    });
    expect(translateText("按已完成订单核算技师业绩；服务金额包含已记账的加钟金额，同一订单只计一单，至少完成一单计为一个工作日。", "ja")).toContain("スタッフの実績");
    expect(translateText("按已完成订单核算技师业绩；服务金额包含已记账的加钟金额，同一订单只计一单，至少完成一单计为一个工作日。", "ko")).toContain("기사 실적");
  });

  it("localizes every order-performance timeline and operations control in five languages", () => {
    const keys = [
      "订单绩效判定",
      "当前结果",
      "当前处理",
      "特殊取消（不计入）",
      "正常计入",
      "当前订单尚无技师绩效判定。",
      "订单时间线与判定修订",
      "公开原因",
      "内部备注（仅运营可见）",
      "会显示在订单时间线中",
      "证据、投诉工单或复核说明（可选）",
      "标记为技师未完单",
      "撤销特殊取消并恢复计入",
      "设为特殊取消并排除计算",
      "正在提交绩效判定",
      "技师原因取消",
      "技师未完单",
      "特殊取消已生效",
      "特殊取消已撤销",
      "本单已从接单率计算中排除",
      "本单已恢复计入接单率计算",
      "已计入技师原因取消记录",
      "已计入技师未完单记录",
      "无公开原因",
      "请填写公开原因后再提交",
      "请先查看最新版本并确认后再重新提交",
      "订单绩效版本已经变化。已保留填写内容，请查看最新记录后确认再提交。",
      "已查看最新版本，可以重新提交",
      "正在加载最新订单详情",
      "重新加载订单详情"
    ] as const;

    for (const key of keys) {
      expect(translations[key]).toMatchObject({
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String)
      });
    }
    expect(translateText("订单绩效判定", "ja")).toBe("注文パフォーマンス判定");
    expect(translateText("内部备注（仅运营可见）", "en")).toBe(
      "Internal note (operations only)"
    );
    expect(translateText("设为特殊取消并排除计算", "ko")).toBe(
      "특별 취소로 지정하고 집계 제외"
    );
    expect(translateText("特殊取消（不计入）", "zh-Hant")).toBe("特殊取消（不計入）");
  });

  it("localizes the IM start-chat CTA", () => {
    expect(translateText("开始聊天", "zh-Hant")).toBe("開始聊天");
    expect(translateText("开始聊天", "ja")).toBe("チャットを開始");
    expect(translateText("开始聊天", "en")).toBe("Start chat");
    expect(translateText("开始聊天", "ko")).toBe("채팅 시작");
  });

  it("localizes every static chat-record and favorites UI key exactly", () => {
    const expected = {
      "查看聊天记录": ["查看聊天記錄", "チャット履歴を表示", "View chat record", "채팅 기록 보기"],
      "关闭聊天记录": ["關閉聊天記錄", "チャット履歴を閉じる", "Close chat record", "채팅 기록 닫기"],
      "聊天记录说明": ["聊天記錄說明", "チャット履歴の説明", "About this chat record", "채팅 기록 안내"],
      "此页面展示创建时保存的只读消息快照，不会随原聊天资料变化。": ["此頁面顯示建立時儲存的唯讀訊息快照，不會隨原聊天資料變更。", "このページには作成時に保存された読み取り専用のメッセージスナップショットが表示され、元のチャット情報が変わっても更新されません。", "This page shows a read-only message snapshot saved when the record was created. It does not change with the original chat.", "이 페이지에는 기록 생성 시 저장된 읽기 전용 메시지 스냅샷이 표시되며 원본 채팅 정보가 바뀌어도 변경되지 않습니다."],
      "媒体读取失败": ["媒體讀取失敗", "メディアを読み込めませんでした", "Couldn't load media", "미디어를 불러오지 못했습니다"],
      "收藏读取失败": ["收藏讀取失敗", "お気に入りを読み込めませんでした", "Couldn't load favorites", "즐겨찾기를 불러오지 못했습니다"],
      "移除收藏": ["移除收藏", "お気に入りから削除", "Remove favorite", "즐겨찾기에서 삭제"],
      "暂无收藏的聊天记录": ["暫無收藏的聊天記錄", "お気に入りのチャット履歴はありません", "No favorite chat records yet", "즐겨찾기한 채팅 기록이 없습니다"],
      "保存的聊天记录": ["已儲存的聊天記錄", "お気に入りのチャット履歴", "Saved chat records", "저장된 채팅 기록"],
      "保存的服务与名片": ["已儲存的服務與名片", "お気に入りのサービス・カード", "Saved services and cards", "저장된 서비스와 카드"],
      "收藏失败，请稍后重试": ["收藏失敗，請稍後再試", "お気に入りに追加できませんでした。しばらくしてからもう一度お試しください。", "Couldn't add to favorites. Try again later.", "즐겨찾기에 추가하지 못했습니다. 잠시 후 다시 시도하세요"],
    } as const;
    for (const [source, values] of Object.entries(expected)) {
      expect(translateImUiText(source, "zh-Hant")).toBe(values[0]);
      expect(translateImUiText(source, "ja")).toBe(values[1]);
      expect(translateImUiText(source, "en")).toBe(values[2]);
      expect(translateImUiText(source, "ko")).toBe(values[3]);
    }
    const completeKeys = [
      "查看聊天记录", "聊天记录", "关闭聊天记录", "聊天记录说明", "此页面展示创建时保存的只读消息快照，不会随原聊天资料变化。",
      "聊天记录媒体", "媒体不可用", "媒体读取失败", "正在读取媒体", "正在读取聊天记录", "聊天记录不可用",
      "加载更早", "正在加载", "返回个人中心", "我的收藏", "保存的聊天记录", "正在读取收藏", "收藏读取失败",
      "暂无收藏的聊天记录", "移除失败", "正在移除", "移除收藏", "收藏分页", "上一页", "下一页", "重试",
    ];
    for (const key of completeKeys) {
      for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
        expect(translateImUiText(key, language)).not.toBe("");
      }
    }
  });

  it("uses the approved affiliate name in operations navigation", () => {
    expect(translateText("联盟营销", "zh")).toBe("联盟营销");
    expect(translateText("联盟营销", "en")).toBe("Affiliate");
    expect(translateText("联盟营销", "ja")).toBe("アフィリエイト");
  });

  it("localizes the complete affiliate profile experience", () => {
    expect(translateText("联盟营销个人资料", "en")).toBe("Affiliate profile");
    expect(translateText("联盟营销个人资料", "ja")).toBe("アフィリエイトプロフィール");
    expect(translateText("NeeDo用户ID", "en")).toBe("NeeDo user ID");
    expect(translateText("NeeDo用户ID", "ja")).toBe("NeeDoユーザーID");
    expect(translateText("外部社交平台主页", "en")).toBe("External social profiles");
    expect(translateText("外部社交平台主页", "ja")).toBe("外部SNSプロフィール");
    expect(translateText("用户填写的外部主页", "en")).toBe("User-provided external profile");
    expect(translateText("用户填写的外部主页", "ja")).toBe(
      "ユーザー入力の外部プロフィール"
    );
    expect(translateText("可接受合作", "en")).toBe("Available for collaborations");
    expect(translateText("可接受合作", "ja")).toBe("コラボレーション受付中");
    expect(translateText("选择性接受", "en")).toBe("Selective");
    expect(translateText("选择性接受", "ja")).toBe("条件付きで受付");
    expect(translateText("暂不接受", "en")).toBe("Unavailable");
    expect(translateText("暂不接受", "ja")).toBe("受付停止中");

    const completeKeys = [
      "管理联盟营销公开资料和用户填写的外部社交平台主页。",
      "正在读取联盟营销资料",
      "没有权限查看联盟营销资料",
      "联盟营销资料读取失败",
      "没有权限编辑联盟营销资料",
      "资料保存失败，请稍后重试",
      "资料已保存",
      "主页已更新",
      "主页已添加",
      "主页已删除",
      "外部主页保存失败，请检查链接后重试",
      "外部主页删除失败，请稍后重试",
      "合作资料",
      "商户和联盟组织会在合作前查看这些信息。",
      "联盟营销简介",
      "介绍擅长的内容、服务类型和合作方式",
      "优势领域",
      "添加优势",
      "服务区域",
      "添加地区",
      "合作状态",
      "保存资料",
      "只展示用户填写的链接，不代表 NeeDo 已验证外部数据。",
      "添加外部主页",
      "还没有添加外部主页",
      "可添加 X、Instagram、YouTube、TikTok 或自定义 HTTPS 主页。",
      "自定义平台",
      "自定义平台名称",
      "HTTPS主页链接",
      "显示顺序",
      "保存主页",
      "更新主页",
      "资料已在其他页面更新，请重新加载后继续。",
      "公开账号标识"
    ] as const;

    completeKeys.forEach((key) => {
      expect(translations[key]).toMatchObject({ en: expect.any(String), ja: expect.any(String) });
    });
  });

  it("localizes the complete affiliate alliance foundation experience", () => {
    expect(translateAffiliateAllianceText("联盟", "en")).toBe("Alliance");
    expect(translateAffiliateAllianceText("联盟", "ja")).toBe("アライアンス");
    expect(translateAffiliateAllianceText("创建联盟", "en")).toBe("Create alliance");
    expect(translateAffiliateAllianceText("创建联盟", "ja")).toBe("アライアンスを作成");

    const completeKeys = [
      "管理当前联盟、成员权限与独立联盟钱包。",
      "查看联盟说明",
      "正在读取联盟",
      "没有权限查看联盟",
      "联盟读取失败",
      "建立你的第一个联盟",
      "联盟名称",
      "联盟介绍",
      "实际推广者比例",
      "推广者",
      "联盟",
      "创建联盟",
      "联盟创建失败，请稍后重试",
      "联盟已创建",
      "联盟章程",
      "联盟所有者",
      "NeeDo用户ID",
      "所有者权限",
      "领取任务",
      "查看联盟概览",
      "查看成员详情",
      "管理自己的下级",
      "查看联盟钱包",
      "联盟钱包",
      "可用余额",
      "冻结余额",
      "最后更新"
    ] as const;

    completeKeys.forEach((key) => {
      (["zh-Hant", "ja", "en", "ko"] as const).forEach((language) => {
        expect(translateAffiliateAllianceText(key, language)).not.toBe(key);
      });
    });
  });

  it("keeps shared glossary entries unchanged by the alliance feature", () => {
    expect(translateText("有效", "en")).toBe("Valid");
    expect(translateText("暂停", "en")).toBe("Pause");
    expect(translateText("已关闭", "ja")).toBe("休業中");
    expect(translateText("推广者", "ja")).toBe("紹介パートナー");
    expect(translateText("冻结余额", "ja")).toBe("保留中残高");
  });

  it("localizes every standard recall and message-deletion status", () => {
    const keys = [
      "你撤回了一条消息",
      "对方撤回了一条消息",
      "发送超过3分钟后无法撤回",
      "撤回失败，请稍后重试",
      "删除失败，请稍后重试",
    ] as const;

    keys.forEach((key) => {
      expect(translations[key]).toMatchObject({
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String),
      });
      expect(Object.values(translations[key]).every((value) => value?.trim())).toBe(true);
    });
  });

  it("localizes the shared friend-deletion actions", () => {
    const expected = {
      "zh-Hant": {
        confirm: "確認刪除",
        deleting: "正在刪除…",
        failure: "刪除失敗，請稍後再試",
      },
      ja: {
        confirm: "削除する",
        deleting: "削除中…",
        failure: "削除できませんでした。しばらくしてからもう一度お試しください。",
      },
      en: {
        confirm: "Delete",
        deleting: "Deleting…",
        failure: "Delete failed. Please try again later.",
      },
      ko: {
        confirm: "삭제하기",
        deleting: "삭제 중…",
        failure: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
    } as const;

    for (const [language, values] of Object.entries(expected)) {
      const targetLanguage = language as keyof typeof expected;

      expect(translateText("确认删除", targetLanguage)).toBe(values.confirm);
      expect(translateText("正在删除…", targetLanguage)).toBe(values.deleting);
      expect(translateText("删除失败，请稍后重试", targetLanguage)).toBe(values.failure);
    }
  });

  it("localizes the inaccessible conversation prompt in every target language", () => {
    expect(translations["无效聊天，无法进入"]).toEqual({
      "zh-Hant": "無效的聊天，無法進入",
      ja: "無効なチャットのため開けません",
      en: "This chat can’t be opened",
      ko: "유효하지 않은 채팅이라 들어갈 수 없습니다"
    });
    expect(translations["该对话可能不存在、已被删除，或当前账号无权访问。"]).toEqual({
      "zh-Hant": "該對話可能不存在、已被刪除，或目前帳號沒有存取權限。",
      ja: "このチャットは存在しないか、削除されたか、現在のアカウントにアクセス権がない可能性があります。",
      en: "This chat may not exist, may have been deleted, or may not be accessible to this account.",
      ko: "이 채팅은 존재하지 않거나 삭제되었거나 현재 계정에 접근 권한이 없을 수 있습니다."
    });
    expect(translations["返回首页"]).toEqual({
      "zh-Hant": "返回首頁",
      ja: "ホームに戻る",
      en: "Return home",
      ko: "홈으로 돌아가기"
    });
  });

  it("uses tax-included wording for 税込 instead of after-tax wording", () => {
    expect(translateText("含税", "zh-Hant")).toBe("含稅");
    expect(translateText("含税", "ja")).toBe("税込");
    expect(translateText("含税", "en")).toBe("tax included");
    expect(translateText("含税", "ko")).toBe("세금 포함");
    expect(translateText("税込", "zh-Hant")).toBe("含稅");
    expect(translateText("税込", "en")).toBe("tax included");
    expect(translateText("税込", "ko")).toBe("세금 포함");
    expect(translateText("税后", "ja")).toBe("税引後");
    expect(translateText("税后", "en")).toBe("after tax");
  });

  it("ignores spreadsheet error placeholders and falls back safely", () => {
    expect(translateText("保存", "en")).not.toBe("#NAME?");
    expect(translateText("保存", "ko")).not.toBe("#VALUE!");
  });

  it("unwraps spreadsheet formula leftovers before rendering translations", () => {
    expect(translateText("设置", "zh-Hant")).toBe("設定");
    expect(translateText("语言", "en")).toBe("Language");
    expect(translateText("外观与系统", "ja")).toBe("外観とシステム");
    expect(translateText("设置", "zh-Hant")).not.toMatch(/^=|#NAME|__xludf/);
  });

  it("localizes the PWA install settings entry", () => {
    expect(translateText("安装APP", "ja")).toBe("アプリをインストール");
    expect(translateText("添加到主屏幕", "en")).toBe("Add to Home Screen");
    expect(translateText("打开安装提示", "ko")).toBe("설치 안내 열기");
    expect(translateText("关闭窗口", "en")).toBe("Close");
  });

  it("uses store naming for the merchant admin surface", () => {
    expect(translateText("商户后台", "ja")).toBe("店舗管理画面");
    expect(translateText("商户后台", "en")).toBe("Business Management");
    expect(translateText("商户后台", "ko")).toBe("사업자 관리 화면");
    expect(translateText("商家后台", "ja")).toBe("店舗管理画面");
    expect(translateText("商家后台", "en")).toBe("Business Management");
    expect(translateText("商家后台", "ko")).toBe("사업자 관리 화면");

    expect(translateText("商户后台导航", "ja")).toBe("店舗管理画面ナビゲーション");
    expect(translateText("商户后台导航", "en")).toBe("Business management navigation");
    expect(translateText("商户后台导航", "ko")).toBe("사업자 관리 화면 내비게이션");
  });

  it("keeps manually locked Japanese terminology for merchants, group chat, and schedule contexts", () => {
    expect(translateText("商户", "ja")).toBe("店舗");
    expect(translateText("商家", "ja")).toBe("店舗");
    expect(translateText("群", "ja")).toBe("グループ");
    expect(translateText("私密群消息已隐藏", "ja")).toBe("プライベートグループのメッセージは非表示");
    expect(translateText("プライベート 群情報隠れた", "ja")).toBe("プライベートグループのメッセージは非表示");
    expect(translateText("群情報", "ja")).toBe("グループ情報");
    expect(translateText("仅群主可编辑", "ja")).toBe("オーナーのみ編集可");
    expect(translateText("保存隐私设置", "ja")).toBe("設定を保存");
    expect(translateText("群主", "ja")).toBe("オーナー");
    expect(translateText("1分钟后对话消失 · 按发送时间开始倒计时", "ja")).toBe("送信後の1分後に会話が消えます");
    expect(translateText("消息免打扰", "ja")).toBe("通知をミュートする");
    expect(translateText("置顶聊天", "ja")).toBe("一番上に表示する");
    expect(translateText("查找聊天内容", "ja")).toBe("トークを検索");
    expect(translateText("解除黑名单", "ja")).toBe("ブラックリストを解除");
    expect(translateText("对方将你拉黑，信息发送失败", "en")).toBe("The recipient blocked you. Message failed to send.");
    expect(translateText("图片发送失败，请重试", "ko")).toBe("이미지 전송에 실패했습니다. 다시 시도해 주세요.");
    expect(translateText("音频", "zh-Hant")).toBe("音訊");
    expect(translateText("音频", "ja")).toBe("オーディオ");
    expect(translateText("音频", "en")).toBe("Audio");
    expect(translateText("音频", "ko")).toBe("오디오");
    expect(translateText("联系人信息", "zh-Hant")).toBe("聯絡人資訊");
    expect(translateText("联系人信息", "ja")).toBe("連絡先情報");
    expect(translateText("联系人信息", "en")).toBe("Contact information");
    expect(translateText("联系人信息", "ko")).toBe("연락처 정보");
    expect(translateText("正在进入联系人信息...", "ja")).toBe("連絡先情報を開いています…");
    expect(translateText("暂时无法打开联系人信息，请稍后再试。", "en")).toBe(
      "Can't open contact information right now. Try again later.",
    );
    expect(translateText("正在搜索账号…", "zh-Hant")).toBe("正在搜尋帳號…");
    expect(translateText("搜索失败，请稍后重试", "ja")).toContain("検索に失敗");
    expect(translateText("请输入昵称或 NeeDoID 搜索", "en")).toBe("Search by nickname or NeeDoID");
    expect(translateText("退出群聊", "ja")).toBe("グループ解散／退会");
    expect(translateText("完全隐私模式", "ja")).toBe("完全プライベートモード");
    expect(translateText("隐私模式设置已保存", "ja")).toBe("プライベートモード設定を保存しました");
    expect(translateText("隐私模式以外发送的信息不会被加入消失倒计时。", "ja")).toBe("プライベートモード以外で送信したメッセージは消失カウントダウンに入りません。");
    expect(translateText("只有群主可以开启或关闭隐私模式", "ja")).toBe("グループオーナーのみプライベートモードをオン/オフできます");
    expect(translateText("隐藏名称和资料", "ja")).toBe("名前とプロフィールを隠す");
    expect(translateText("名字会变为用户，个人资料将不再显示。", "ja")).toBe("名前はユーザーに変更され、プロフィールが表示されなくなります。");

    expect(translateTextForContext("行程", "ja", { portal: "user" })).toBe("スケジュール");
    expect(translateTextForContext("日程", "ja", { portal: "user" })).toBe("スケジュール");
    expect(translateTextForContext("行程", "ja", { portal: "technician" })).toBe("シフト");
    expect(translateTextForContext("日程", "ja", { portal: "technician" })).toBe("シフト");
    expect(translateTextForContext("行程", "ja", { portal: "merchant" })).toBe("シフト");
    expect(translateTextForContext("日程", "ja", { portal: "merchant" })).toBe("シフト");
  });

  it("uses management center naming for the merchant scheduling surface", () => {
    expect(translateText("调度中心", "ja")).toBe("管理センター");
    expect(translateText("调度中心", "en")).toBe("Management Center");
    expect(translateText("调度中心", "ko")).toBe("관리 센터");
    expect(translateText("管理中心", "ja")).toBe("管理センター");
    expect(translateText("管理中心", "en")).toBe("Management Center");
    expect(translateText("管理中心", "ko")).toBe("관리 센터");

    expect(translateText("调度中心 / 排班一览", "ja")).toBe("管理センター／シフト一覧");
    expect(translateText("调度中心 / 排班一览", "en")).toBe("Management Center / Shift Overview");
    expect(translateText("调度中心 / 排班一览", "ko")).toBe("관리 센터 / 근무표 개요");

    expect(translateText("去调度中心", "ja")).toBe("管理センターへ");
    expect(translateText("去调度中心", "en")).toBe("Go to Management Center");
    expect(translateText("去调度中心", "ko")).toBe("관리 센터로 이동");
  });

  it("uses status naming for merchant admin filters and tables", () => {
    expect(translateText("状态", "ja")).toBe("ステータス");
    expect(translateText("状态", "en")).toBe("Status");
    expect(translateText("状态", "ko")).toBe("상태");

    expect(translateText("状态摘要", "ja")).toBe("ステータス概要");
    expect(translateText("状态摘要", "en")).toBe("Status Summary");
    expect(translateText("状态摘要", "ko")).toBe("상태 요약");

    expect(translateText("切状态", "ja")).toBe("ステータス切替");
    expect(translateText("切状态", "en")).toBe("Switch Status");
    expect(translateText("切状态", "ko")).toBe("상태 전환");
  });

  it("uses localized labels for payment status badges", () => {
    expect(translateText("已支付", "ja")).toBe("支払い済み");
    expect(translateText("未支付", "en")).toBe("Unpaid");
    expect(translateText("定金已支付", "ko")).toBe("보증금 결제 완료");
    expect(translateText("已退款", "zh-Hant")).toBe("已退款");
  });

  it("uses approved Japanese labels for staff availability statuses", () => {
    expect(translateText("空闲", "ja")).toBe("待機中");
    expect(translateText("空闲", "en")).toBe("Standby");
    expect(translateText("待机", "ja")).toBe("待機中");
    expect(translateText("待机", "en")).toBe("Standby");
    expect(translateText("休息", "ja")).toBe("休憩中");
    expect(translateText("休息", "en")).toBe("On Break");
    expect(translateText("休息/缓冲", "ja")).toBe("休憩/バッファ");
    expect(translateText("休息/缓冲", "en")).toBe("Break/Buffer");
    expect(translateText("空闲", "ko")).toBe("대기 중");
    expect(translateText("休息", "ko")).toBe("휴식 중");
  });

  it("uses compact work status labels for the technician status buttons", () => {
    expect(translateText("出勤", "ja")).toBe("出勤");
    expect(translateText("出勤", "en")).toBe("On duty");
    expect(translateText("出勤", "ko")).toBe("출근");
    expect(translateText("移动中", "ja")).toBe("移動中");
    expect(translateText("移动中", "en")).toBe("In transit");
    expect(translateText("移动中", "ko")).toBe("이동 중");
    expect(translateText("服务中", "ja")).toBe("サービス中");
    expect(translateText("服务中", "en")).toBe("In service");
    expect(translateText("服务中", "ko")).toBe("서비스 중");
    expect(translateText("加钟", "ja")).toBe("延長");
    expect(translateText("加钟", "en")).toBe("Extension");
    expect(translateText("加钟", "ko")).toBe("연장");
    expect(translateText("退勤", "ja")).toBe("退勤");
    expect(translateText("退勤", "en")).toBe("Off duty");
    expect(translateText("退勤", "ko")).toBe("퇴근");
  });

  it("uses approved short Japanese labels on user-facing cards", () => {
    expect(translateText("可预约", "ja")).toBe("予約可");
    expect(translateText("当前可约", "ja")).toBe("予約可能");
    expect(translateText("东京站", "ja")).toBe("東京駅");
    expect(translateText("深度清洁", "ja")).toBe("大掃除");
    expect(translateText("深度保洁", "ja")).toBe("大掃除");
    expect(translateText("暂未接单", "ja")).toBe("待機中");
    expect(translateText("档期较满", "ja")).toBe("ほぼ満員");
    expect(translateText("空调清洗", "ja")).toBe("エアコン掃除");
    expect(translateText("热门可约", "ja")).toBe("超人気、予約可能");
    expect(translateText("深夜可约", "ja")).toBe("深夜予約可");
    expect(translateText("多商户可选", "ja")).toBe("複数店舗選択可");
    expect(translateText("可长期", "ja")).toBe("長期可");
    expect(translateText("可长期", "en")).toBe("Long-term available");
    expect(translateText("可长期", "ko")).toBe("장기 가능");
    expect(translations["可固定阿姨"]).toBeUndefined();
    expect(translateText("下水道维修", "ja")).toBe("水回り修理");
    expect(translateText("下水道维修", "en")).toBe("Drain repair");
    expect(translations["修水管重点"]).toBeUndefined();
    expect(translations["覆盖修水管重点污渍与收纳归位。"]).toBeUndefined();
    expect(translateText("美甲", "ja")).toBe("ネイルデザイン");
    expect(translateText("美甲", "en")).toBe("Nail design");
    expect(translateText("美睫", "ja")).toBe("まつ毛美容");
    expect(translateText("美睫", "en")).toBe("Lash beauty");
    expect(translateText("单色美甲 / 自然款美睫", "ja")).toBe("単色ネイルデザイン／ナチュラルまつ毛美容");
    expect(translateText("美甲、美睫、上门护理", "ja")).toBe("ネイルデザイン、まつ毛美容、訪問ケア");
    expect(translateText("自然款美睫", "en")).toBe("Natural lash beauty");
    expect(translateText("当日可约", "ja")).toBe("当日予約可");
    expect(translateText("当日可约", "en")).toBe("Same-day booking available");
    expect(translateText("最快 00 分钟", "ja")).toBe("最短00分");
    expect(translateText("最快 00 分钟", "en")).toBe("As fast as 00 min");
    expect(translateText("最快 45 分钟", "ja")).toBe("最短45分");
    expect(translateText("最快（45）分钟", "ja")).toBe("最短45分");
    expect(translateText("￥000,000 起", "ja")).toBe("￥000,000〜");
    expect(translateText("￥000,000 起", "en")).toBe("From ￥000,000");
    expect(translateText("￥6,800 起", "ja")).toBe("￥6,800〜");
    expect(translateText("¥6,800 起", "ja")).toBe("¥6,800〜");
    expect(translateText("修水管", "zh")).toBe("修水管");
    expect(translateText("修水管", "ja")).toBe("水回り");
  });

  it("localizes English core-read seed copy before rendering user cards", () => {
    expect(translateText("Move-out Deep Cleaning", "zh")).toBe("退房深度清洁");
    expect(translateText("Move-out Deep Cleaning", "ja")).toBe("退去時の徹底清掃");
    expect(translateText("Move-out deep cleaning for kitchen, bath, flooring, and final photo report.", "ja")).toBe("キッチン・浴室・床まで徹底清掃し、完了写真レポートをお送りします。");
    expect(translateText("Kitchen Bath Reset", "ja")).toBe("キッチン・浴室リセット清掃");
    expect(translateText("Focused cleaning for oil stains, bath scale, mirrors, and sink areas.", "ja")).toBe("油汚れ・浴室水垢・鏡・シンク周りを重点清掃。");
    expect(translateText("Roppongi Recovery Lounge", "ja")).toBe("六本木リカバリーラウンジ");
    expect(translateText("Tokyo", "ja")).toBe("東京");
    expect(translateText("6-8 Roppongi, Minato-ku", "ja")).toBe("東京都港区六本木 6-8");
    expect(translateText("nail", "ja")).toBe("ネイル");
    expect(translateText("repair", "ja")).toBe("修理");
    expect(translateText("recovery", "ja")).toBe("リカバリー");
    expect(translateText("private", "ja")).toBe("プライベート");
  });

  it("uses follow wording for social and contact relationships", () => {
    expect(translateText("关注", "ja")).toBe("フォロー");
    expect(translateText("关注", "en")).toBe("Follow");
    expect(translateText("关注", "ko")).toBe("팔로우");
    expect(translateText("已关注", "ja")).toBe("フォロー中");
    expect(translateText("已关注", "en")).toBe("Following");
    expect(translateText("已关注", "ko")).toBe("팔로우 중");
    expect(translateText("非关注", "ja")).toBe("未フォロー");
    expect(translateText("非关注", "en")).toBe("Not following");
    expect(translateText("非关注", "ko")).toBe("미팔로우");
    expect(translateText("推荐关注", "ja")).toBe("おすすめフォロー");
    expect(translateText("推荐关注", "en")).toBe("Suggested follows");
    expect(translateText("推荐关注", "ko")).toBe("추천 팔로우");
  });

  it("uses credit level naming for customer credit values", () => {
    expect(translateText("信用值", "ja")).toBe("信用度");
    expect(translateText("信用值 A+", "ja")).toBe("信用度 A+");
    expect(translateText("信用值 A+", "en")).toBe("Credit level A+");
    expect(translateText("信用值 A+", "ko")).toBe("신용도 A+");
  });

  it("formats customer credit review counts naturally across languages", () => {
    expect(translateText("28人评价", "ja")).toBe("28人の評価");
    expect(translateText("信用值 28人评价", "ja")).toBe("信用度 28人の評価");
    expect(translateText("信用值 28人评价", "en")).toBe("Credit level 28 reviews");
    expect(translateText("信用值 28人评价", "ko")).toBe("신용도 28명 평가");
    expect(translateText("信用度 28人评价", "en")).toBe("Credit level 28 reviews");
  });

  it("uses approved Japanese legal labels in shared settings", () => {
    expect(translateText("利用政策", "ja")).toBe("利用規約");
    expect(translateText("隐私政策", "ja")).toBe("個人情報保護方針");
    expect(translateText("注销账号", "ja")).toBe("退会");
    expect(translateText("利用政策", "en")).toBe("Terms of Use");
    expect(translateText("隐私政策", "ko")).toBe("개인정보 처리방침");
  });

  it("localizes every user settings home label and explanation naturally", () => {
    const expected = {
      "利用规约": { "zh-Hant": "利用規約", ja: "利用規約", en: "Terms of Use", ko: "이용약관" },
      "个人信息保护方针": { "zh-Hant": "個人資訊保護方針", ja: "個人情報保護方針", en: "Privacy Policy", ko: "개인정보 처리방침" },
      "清除当前登录会话并返回对应登录入口": { "zh-Hant": "結束目前的登入工作階段並返回對應的登入頁面", ja: "現在のログインセッションを終了し、該当するログイン画面に戻ります", en: "End the current session and return to the appropriate sign-in page", ko: "현재 로그인 세션을 종료하고 해당 로그인 화면으로 돌아갑니다" },
      "退出": { "zh-Hant": "登出", ja: "ログアウト", en: "Log out", ko: "로그아웃" },
      "实名、证件、本人确认": { "zh-Hant": "實名、身分證件、本人驗證", ja: "氏名・本人確認書類・本人確認", en: "Legal name, identity document, and identity verification", ko: "실명·신분증·본인 인증" },
      "个人资料与认证": { "zh-Hant": "個人資料與驗證", ja: "プロフィール・本人確認", en: "Profile and Verification", ko: "프로필 및 본인 인증" },
      "统一设置模块现在使用同一套首页、列表项和子页承载三端配置，仅通过身份决定显示哪些内容。": { "zh-Hant": "設定頁面在用戶、工作人員與店鋪 App 中使用相同架構，並依目前身分顯示所需內容。", ja: "設定画面はユーザー・スタッフ・店舗で共通の構成を使用し、現在の利用者区分に応じて表示内容が変わります。", en: "Settings use the same structure across the User, Staff, and Merchant apps, with content shown for the current identity.", ko: "설정 화면은 사용자, 스태프, 매장 앱에서 동일한 구조를 사용하며 현재 사용자 유형에 맞는 항목을 표시합니다." },
      "主题、语言和身份切换统一复用用户端设置模块，三端不再各自维护一套入口。": { "zh-Hant": "主題、語言與身分切換在用戶、工作人員與店鋪 App 中共用同一設定頁面。", ja: "テーマ、言語、利用者区分の切り替えは、ユーザー・スタッフ・店舗で共通の設定画面を使用します。", en: "Theme, language, and identity switching share one settings screen across the User, Staff, and Merchant apps.", ko: "테마, 언어, 사용자 유형 전환은 사용자, 스태프, 매장 앱에서 동일한 설정 화면을 사용합니다." },
      "统一复用同一组目录骨架，技师和店铺独有项也沿用用户端页面结构。": { "zh-Hant": "個人資料與身分驗證使用共用頁面架構，工作人員與店鋪專屬項目也以相同形式顯示。", ja: "プロフィールと本人確認は共通の画面構成を使用し、スタッフ・店舗固有の項目も同じ形式で表示します。", en: "Profile and identity verification share one page structure, including staff- and merchant-specific items.", ko: "프로필과 본인 인증은 공통 화면 구조를 사용하며 스태프와 매장 전용 항목도 같은 형식으로 표시합니다." },
      "账户、安全、绑定关系和权限入口统一收口到同一详细页。": { "zh-Hant": "帳號、安全、連結關係與權限設定集中在同一個詳細頁面。", ja: "アカウント、セキュリティ、連携情報、権限の設定を1つの画面にまとめています。", en: "Account, security, linked services, and permissions are managed on one details page.", ko: "계정, 보안, 연결 정보, 권한 설정을 하나의 상세 화면에서 관리합니다." },
      "通知与隐私同样复用统一页骨架，技师和商户的独有开关通过配置追加。": { "zh-Hant": "通知與隱私使用共用頁面架構，並依設定加入工作人員與店鋪專屬項目。", ja: "通知とプライバシーは共通の画面構成を使用し、スタッフ・店舗固有の項目は設定に応じて追加されます。", en: "Notifications and privacy share one page structure, with staff- and merchant-specific options added when configured.", ko: "알림과 개인정보 보호는 공통 화면 구조를 사용하며 설정에 따라 스태프와 매장 전용 항목이 추가됩니다." },
      "帮助、关于、注销账号和退出登录保持统一入口，不再散落在各端我的页。": { "zh-Hant": "說明、關於 NeeDo、註銷帳號與登出皆集中在此頁面。", ja: "ヘルプ、NeeDoについて、退会、ログアウトは、すべてこの画面から利用できます。", en: "Help, About NeeDo, account deletion, and logout are all available from this screen.", ko: "도움말, NeeDo 소개, 계정 삭제, 로그아웃을 모두 이 화면에서 이용할 수 있습니다." },
      "设置页面说明": { "zh-Hant": "查看設定頁面說明", ja: "設定画面の説明を表示", en: "View settings page information", ko: "설정 화면 설명 보기" },
      "查看外观与系统说明": { "zh-Hant": "查看外觀與系統說明", ja: "外観とシステムの説明を表示", en: "View appearance and system information", ko: "화면 및 시스템 설명 보기" },
      "查看个人资料与认证说明": { "zh-Hant": "查看個人資料與驗證說明", ja: "プロフィールと本人確認の説明を表示", en: "View profile and verification information", ko: "프로필 및 본인 인증 설명 보기" },
      "查看账户与安全说明": { "zh-Hant": "查看帳號與安全說明", ja: "アカウントとセキュリティの説明を表示", en: "View account and security information", ko: "계정 및 보안 설명 보기" },
      "查看通知与隐私说明": { "zh-Hant": "查看通知與隱私說明", ja: "通知とプライバシーの説明を表示", en: "View notification and privacy information", ko: "알림 및 개인정보 보호 설명 보기" },
      "查看其他说明": { "zh-Hant": "查看其他說明", ja: "その他の説明を表示", en: "View other settings information", ko: "기타 설정 설명 보기" },
      "UI 切换": { "zh-Hant": "介面主題", ja: "表示テーマ", en: "Theme", ko: "테마" },
      "语言": { "zh-Hant": "語言", ja: "言語", en: "Language", ko: "언어" },
      "身份切换": { "zh-Hant": "身分切換", ja: "利用者区分の切り替え", en: "Switch identity", ko: "사용자 유형 전환" },
      "服务范围": { "zh-Hant": "服務範圍", ja: "サービス提供エリア", en: "Service Area", ko: "서비스 지역" },
      "账户与安全": { "zh-Hant": "帳號與安全", ja: "アカウントとセキュリティ", en: "Account and Security", ko: "계정 및 보안" },
      "已完善": { "zh-Hant": "已完善", ja: "設定済み", en: "Completed", ko: "설정 완료" },
      "待完善": { "zh-Hant": "待補全", ja: "要設定", en: "Needs completion", ko: "보완 필요" },
      "未完善": { "zh-Hant": "未完善", ja: "未設定", en: "Incomplete", ko: "미완료" },
      "需要完善": { "zh-Hant": "需要補全", ja: "要設定", en: "Setup required", ko: "설정 필요" },
      "开启后由屏幕宠物承接提醒气泡，首页右下角预约悬浮按钮会自动隐藏。": { "zh-Hant": "開啟後由螢幕寵物顯示提醒氣泡，首頁右下角的預約懸浮按鈕會自動隱藏。", ja: "有効にすると、ニードペットが通知を表示し、ホーム画面右下の予約ボタンは自動的に非表示になります。", en: "When enabled, NeeDo Pet shows reminders and the floating booking button on the home screen is hidden automatically.", ko: "활성화하면 니도 펫이 알림을 표시하고 홈 화면 오른쪽 아래의 예약 버튼은 자동으로 숨겨집니다." },
      "正在下载小白资源，完成后才能开启。": { "zh-Hant": "正在下載小白資源，完成後即可開啟。", ja: "ニードペットのデータをダウンロードしています。完了後に有効にできます。", en: "Downloading NeeDo Pet assets. You can enable it when the download is complete.", ko: "니도 펫 리소스를 다운로드하고 있습니다. 완료되면 활성화할 수 있습니다." },
      "小白资源下载进度": { "zh-Hant": "小白資源下載進度", ja: "ニードペットのダウンロード進捗", en: "NeeDo Pet download progress", ko: "니도 펫 다운로드 진행률" },
      "关闭": { "zh-Hant": "關閉", ja: "閉じる", en: "Close", ko: "닫기" },
      "全部通知已开启": { "zh-Hant": "所有通知已開啟", ja: "通知はすべてオン", en: "All notifications on", ko: "모든 알림 켜짐" },
      "全部通知已关闭": { "zh-Hant": "所有通知已關閉", ja: "通知はすべてオフ", en: "All notifications off", ko: "모든 알림 꺼짐" },
      "部分通知已开启": { "zh-Hant": "部分通知已開啟", ja: "一部の通知がオン", en: "Some notifications on", ko: "일부 알림 켜짐" },
    } as const;

    for (const [source, localized] of Object.entries(expected)) {
      expect(translations[source], source).toEqual(localized);
      expect(translateText(source, "ja"), `${source}:ja`).toBe(localized.ja);
      expect(translateText(source, "en"), `${source}:en`).toBe(localized.en);
      expect(translateText(source, "ko"), `${source}:ko`).toBe(localized.ko);
      expect(translateText(source, "zh-Hant"), `${source}:zh-Hant`).toBe(localized["zh-Hant"]);
    }
  });

  it("keeps approved Japanese settings copy stable when the runtime translator sees it again", () => {
    expect(translateText("本人", "ja")).toBe("本人");
    expect(translateText("確認", "ja")).toBe("確認");
    expect(translateText("说明", "ja")).toBe("説明");
    expect(translateText(translateText("个人资料与认证", "ja"), "ja")).toBe("プロフィール・本人確認");
    expect(translateText(translateText("查看个人资料与认证说明", "ja"), "ja")).toBe("プロフィールと本人確認の説明を表示");
  });

  it("uses staff naming for people associated with a merchant", () => {
    expect(translateText("员工", "ja")).toBe("スタッフ");
    expect(translateText("员工", "en")).toBe("Staff");
    expect(translateText("员工", "ko")).toBe("스태프");
    expect(translateText("个人事业者/员工", "zh-Hant")).toBe("技師");
    expect(translateText("个人事业者/员工", "ja")).toBe("スタッフ");
    expect(translateText("个人事业者/员工", "en")).toBe("Technician");
    expect(translateText("个人事业者/员工", "ko")).toBe("기사");

    expect(translateText("员工列表", "ja")).toBe("スタッフリスト");
    expect(translateText("员工列表", "en")).toBe("Staff List");
    expect(translateText("员工列表", "ko")).toBe("스태프 목록");

    expect(translateText("与平台运营后台共用同一套员工列表模块，商户侧只展示当前商户可管理的员工数据。", "ja")).toContain("スタッフリスト");
    expect(translateText("店铺员工信息卡", "en")).toBe("Store Staff Info Card");
    expect(translateText("技师", "ja")).toBe("スタッフ");
    expect(translateText("技师", "en")).toBe("Technician");
    expect(translateText("技师", "ko")).toBe("기사");
  });

  it("uses noun labels for merchant scheduling cards", () => {
    expect(translateText("日程", "ja")).toBe("スケジュール");
    expect(translateText("日程", "en")).toBe("Schedule");
    expect(translateText("日程", "ko")).toBe("일정");
    expect(translateText("排班", "ja")).toBe("シフト");
    expect(translateText("排班", "en")).toBe("Shift");
    expect(translateText("排班", "ko")).toBe("근무표");
    expect(translateText("排班表", "ja")).toBe("シフト表");
    expect(translateText("保存到共享排班", "ja")).toBe("共有シフトに保存");
    expect(translateText("保存到共享排班", "en")).toBe("Save to shared shift");
    expect(translateText("保存到共享排班", "ko")).toBe("공유 근무표에 저장");

    expect(translateText("当前周期确认", "ja")).toBe("現状確認");
    expect(translateText("当前周期确认", "en")).toBe("Current Cycle Confirmation");
    expect(translateText("当前周期确认", "ko")).toBe("현재 주기 확인");
    expect(translateText("现状确认", "zh")).toBe("现状确认");
    expect(translateText("现状确认", "ja")).toBe("現状確認");
    expect(translateText("现状确认", "en")).toBe("Current Status");
    expect(translateText("现状确认", "ko")).toBe("현황 확인");
    expect(translateText("日视图", "ja")).toBe("単日表示");
    expect(translateText("周视图", "ja")).toBe("週間表示");
    expect(translateText("月视图", "ja")).toBe("月間表示");
    expect(translateText("日视图", "en")).toBe("Single-Day View");
    expect(translateText("周视图", "en")).toBe("Weekly View");
    expect(translateText("月视图", "en")).toBe("Monthly View");
    expect(translateText("日视图", "ko")).toBe("단일 날짜 표시");
    expect(translateText("周视图", "ko")).toBe("주간 표시");
    expect(translateText("月视图", "ko")).toBe("월간 표시");
    expect(translateText("预约", "ja")).toBe("予約");
    expect(translateText("申请件数", "ja")).toBe("申請件数");
    expect(translateText("申请", "ja")).toBe("申請");
    expect(translateText("预约", "en")).toBe("Reservation");
    expect(translateText("申请件数", "en")).toBe("Applications");
    expect(translateText("申请", "en")).toBe("Application");
    expect(translateText("5 个安排", "ja")).toBe("5 件の予定");
    expect(translateText("5 个冲突", "en")).toBe("5 conflicts");
    expect(translateText("手动修改班次", "ja")).toBe("シフトを手動編集");
    expect(translateText("取消班次", "en")).toBe("Cancel shift");
    expect(translateText("可排班 / 可预约", "en")).toBe("Shift available / Bookable");
    expect(translateText("添加行程", "ja")).toBe("予定追加");
    expect(translateText("添加行程", "en")).toBe("Add schedule");
    expect(translateText("添加行程", "ko")).toBe("일정 추가");
    expect(translateText("仅行程", "ja")).toBe("予定のみ");
    expect(translateText("仅行程", "en")).toBe("Schedule only");
    expect(translateText("仅行程", "ko")).toBe("일정만");
    expect(translateText("全时间", "ja")).toBe("全時間");
    expect(translateText("全时间", "en")).toBe("All times");
    expect(translateText("全时间", "ko")).toBe("전체 시간");
    expect(translateText("开放中", "ko")).toBe("개방 중");
    expect(translateText("周期", "ja")).toBe("周期");
    expect(translateText("循环", "ja")).toBe("周期");
    expect(translateText("冲突", "ja")).toBe("重複");
  });

  it("uses merchant staff action labels for special task cards", () => {
    expect(translateText("担当/员工交代", "ja")).toBe("担当/スタッフ交代");
    expect(translateText("切换技师", "ja")).toBe("担当/スタッフ交代");
    expect(translateText("指派技师", "ja")).toBe("担当/スタッフ交代");
    expect(translateText("完成", "ja")).toBe("完成");
    expect(translateText("取消", "ja")).toBe("キャンセル");
  });

  it("localizes the store-only technician data center copy", () => {
    expect(translateText("店铺工作", "ja")).toBe("店舗業務");
    expect(translateText("基础工资：¥684,000", "ja")).toBe("基本給：¥684,000");
    expect(translateText("集中查看店铺工作的趋势、结算和下一单安排。", "en")).toBe("View store-work trends, settlement, and the next assignment in one place.");
    expect(translateText("仅展示店铺工作的统计卡片，便于核对门店收入、排班和履约表现。", "ja")).toBe("店舗業務の統計カードのみを表示し、店舗収入、シフト、履行状況を確認しやすくします。");
    expect(translateText("最近的店铺工作会归档在这里，方便核对排班和收入记录。", "ko")).toContain("근무표");
  });

  it("uses the approved UI theme names across languages", () => {
    expect(translateText("活力黑白版", "ja")).toBe("活躍白黒");
    expect(translateText("冷酷黑灰版", "ja")).toBe("クールダーク");
    expect(translateText("白绿版", "ja")).toBe("白緑");
    expect(translateText("黑绿版", "ja")).toBe("黒緑");
    expect(translateText("霓虹粉紫版", "ja")).toBe("ピンク紫");
    expect(translateText("黑金版", "ja")).toBe("黒ゴールド");

    expect(translateText("活力黑白版", "en")).toBe("Active Black & White");
    expect(translateText("冷酷黑灰版", "en")).toBe("Cool Dark");
    expect(translateText("白绿版", "en")).toBe("White Green");
    expect(translateText("黑绿版", "en")).toBe("Black Green");
    expect(translateText("霓虹粉紫版", "en")).toBe("Pink Purple");
    expect(translateText("黑金版", "en")).toBe("Black Gold");

    expect(translateText("活力黑白版", "ko")).toBe("활력 블랙화이트");
    expect(translateText("冷酷黑灰版", "ko")).toBe("쿨 다크");
    expect(translateText("白绿版", "ko")).toBe("화이트 그린");
    expect(translateText("黑绿版", "ko")).toBe("블랙 그린");
    expect(translateText("霓虹粉紫版", "ko")).toBe("핑크 퍼플");
    expect(translateText("黑金版", "ko")).toBe("블랙 골드");

    expect(translateText("三端统一切换活力黑白 / 冷酷黑灰 / 白绿 / 黑绿 / 霓虹粉紫 / 黑金主题，由同一套 token 与组件承载。", "ja")).toContain(
      "活躍白黒／クールダーク／白緑／黒緑／ピンク紫／黒ゴールド"
    );
  });

  it("uses Need wording for NeeDo need labels", () => {
    expect(translateText("需求", "ja")).toBe("需要");
    expect(translateText("需求", "en")).toBe("Need");
    expect(translateText("需求", "ko")).toBe("필요");

    expect(translateText("发送需求", "ja")).toBe("需要を送信");
    expect(translateText("发送需求", "en")).toBe("Send Need");
    expect(translateText("发送需求", "ko")).toBe("필요 보내기");

    expect(translateText("需求详情", "ja")).toBe("需要の詳細");
    expect(translateText("需求详情", "en")).toBe("Need details");
    expect(translateText("需求详情", "ko")).toBe("필요 상세");
  });

  it("applies glossary terminology to NeeDo app names and publishing copy", () => {
    expect(translateText("NeeDo 用户端", "ja")).toBe("NeeDo ユーザーアプリ");
    expect(translateText("NeeDo 用户端", "en")).toBe("NeeDo User App");
    expect(translateText("NeeDo 用户端", "ko")).toBe("NeeDo 사용자 앱");

    expect(translateText("NeeDo 商户端", "ja")).toBe("NeeDo 店舗側");
    expect(translateText("NeeDo 商户端", "en")).toBe("NeeDo Merchant App");
    expect(translateText("NeeDo 商户端", "ko")).toBe("NeeDo 사업자 앱");

    expect(translateText("NeeDo 技师端", "ja")).toBe("NeeDo スタッフアプリ");
    expect(translateText("NeeDo 技师端", "en")).toBe("NeeDo Technician App");
    expect(translateText("NeeDo 技师端", "ko")).toBe("NeeDo 기사 앱");

    expect(translateText("NeeDo 商户后台", "ja")).toBe("NeeDo 店舗管理画面");
    expect(translateText("NeeDo 商户后台", "en")).toBe("NeeDo Business Management");
    expect(translateText("NeeDo 商户后台", "ko")).toBe("NeeDo 사업자 관리 화면");

    expect(
      translateText(
        "NeeDo 前台里的需求与情报现已显示剩余有效时间，详情页也会同步展示截止时间；过期内容会自动切换为已过期状态并禁用主要操作按钮。",
        "ja"
      )
    ).toContain("需要とオファー");
    expect(
      translateText(
        "NeeDo 页的发布链路这次补成了显式限制，不再只是依赖页面文案。现在客户端新发内容只会落成需求，技师端和店铺端新发内容只会落成情报。",
        "en"
      )
    ).toContain("User App");

    expect(translateText("进入 NeeDo 用户端", "ja")).toBe("NeeDo ユーザーアプリに入る");
    expect(translateText("新需求", "en")).toBe("New Need");
    expect(translateText("预约需求", "ja")).toBe("予約需要");
    expect(translateText("需求中心", "en")).toBe("Need Center");
    expect(translateText("需求流 / 可抢单列表", "ko")).toBe("필요 피드 / 수주 가능 목록");
    expect(translateText("用户提交的新需求，等待平台审核后进入需求流。", "ja")).toContain("新しい需要");

    expect(translateText("情报详情", "ja")).toBe("オファー詳細");
    expect(translateText("情报详情", "en")).toBe("Info details");
    expect(translateText("情报中心", "ko")).toBe("정보 센터");
    expect(translateText("商户情报", "ja")).toBe("店舗オファー");
    expect(translateText("新情报", "en")).toBe("New Info");
    expect(translateText("付费转发到 NeeDo 情报页", "ja")).toBe("NeeDo オファーページへ有料シェア");
    expect(translateText("技师详情", "en")).toBe("Technician Details");
    expect(translateText("发布你的情报", "en")).toBe("Publish your Info");
  });

  it("uses the manual Japanese terms from the xlsx glossary", () => {
    const manualJapaneseTerms: Array<[string, string]> = [
      ["电子宠物", "ニードペット"],
      ["更多技师", "もっと見る"],
      ["附近的技师", "付近のスタッフ"],
      ["查看", "もっと見る"],
      ["上门保洁", "家事代行"],
      ["需要", "リクエスト"],
      ["情报", "オファー"],
      ["转发", "シェア"],
      ["已选", "選択済"],
      ["自定义群名", "グループ名入力"],
      ["标签", "タグ"],
      ["公告", "告知"],
      ["显示", "表示モード"],
      ["提醒", "リマインダー"],
      ["开始", "開始"],
      ["结束", "終了"],
      ["地址", "住所を入力"],
      ["URL", "URLを入力"],
      ["备注", "メモ"],
      ["备注：", "メモ："],
      ["备注(输入时)", "メモを入力"],
      ["备注(浏览时)", "メモ"],
      ["参加者", "参加者"],
      ["服务套餐菜单", "サービスメニュー"],
      ["店内照片墙", "店内環境"],
      ["到店信息", "店舗情報"],
      ["套餐", "サービス"],
      ["服务方式", "サービス提供方法"],
      ["到店服务", "店内サービス"],
      ["上门服务", "デリバリサービス"],
      ["取消政策", "キャンセルポリシー"],
      ["服务号", "サービス"]
    ];

    for (const [source, expected] of manualJapaneseTerms) {
      expect(translateText(source, "ja")).toBe(expected);
    }
  });

  it("translates NeeDo detail content used by the translate action", () => {
    expect(translateText("临时预约", "ja")).toBe("臨時予約");
    expect(translateText("期限", "en")).toBe("Deadline");
    expect(translateText("品川 临时预约 深度保洁", "en")).toBe("Shinagawa short-notice booking Deep cleaning");
    expect(translateText("希望响应快、评价高，能提前确认交通和到达时间。接受平台担保和加急费用。", "en")).toContain("quick response");
    expect(translateText("商铺设置了预约定金，预约时预付，尾款到场支付。", "ko")).toBe("매장에서 예약 보증금을 설정했습니다. 예약 시 선결제하고 잔금은 도착 후 결제합니다.");
  });

  it("localizes merchant display module editor labels", () => {
    expect(translateText("第 1 张会同步为首图和店铺头像底图。", "ko")).toBe("첫 번째 이미지는 대표 이미지와 매장 아바타 배경으로 동기화됩니다.");
    expect(translateText("展示图片", "en")).toBe("Display images");
    expect(translateText("编辑图片", "ja")).toBe("画像を編集");
    expect(translateText("替换", "en")).toBe("Replace");
    expect(translateText("替换图片", "ja")).toBe("画像を差し替え");
    expect(translateText("编辑资料", "en")).toBe("Edit profile");
    expect(translateText("编辑展示", "ja")).toBe("表示を編集");
    expect(translateText("编辑展示文字", "en")).toBe("Edit display text");
    expect(translateText("编辑菜单", "ko")).toBe("메뉴 편집");
    expect(translateText("编辑位置", "ja")).toBe("位置情報を編集");
    expect(translateText("编辑说明", "en")).toBe("Edit notes");
    expect(translateText("完成修改", "ko")).toBe("수정 완료");
  });

  it("uses the approved glossary terms", () => {
    expect(translateText("首页", "ja")).toBe("ホーム");
    expect(translateText("首页", "en")).toBe("Home");
    expect(translateText("首页", "ko")).toBe("홈");

    expect(translateText("环境", "ja")).toBe("環境");
    expect(translateText("环境", "en")).toBe("Gallery");
    expect(translateText("环境", "ko")).toBe("환경");

    expect(translateText("菜单", "ja")).toBe("メニュー");
    expect(translateText("菜单", "en")).toBe("Menu");
    expect(translateText("菜单", "ko")).toBe("메뉴");

    expect(translateText("动态", "ja")).toBe("フィード");
    expect(translateText("动态", "en")).toBe("Feed");
    expect(translateText("动态", "ko")).toBe("피드");

    expect(translateText("数据", "ja")).toBe("データ");
    expect(translateText("数据", "en")).toBe("Data");
    expect(translateText("数据", "ko")).toBe("데이터");

    expect(translateText("情报", "ja")).toBe("オファー");
    expect(translateText("情报", "en")).toBe("Info");
    expect(translateText("情报", "ko")).toBe("정보");
    expect(translateText("个人情报", "ja")).toBe("個人オファー");
    expect(translateText("个人情报", "en")).toBe("Info");
    expect(translateText("个人情报", "ko")).toBe("정보");
    expect(translateText("店铺情报", "ja")).toBe("店舗オファー");
    expect(translateText("店铺情报", "en")).toBe("Info");
    expect(translateText("店铺情报", "ko")).toBe("정보");

    expect(translateText("地图", "ja")).toBe("地図");
    expect(translateText("地图", "en")).toBe("Map");
    expect(translateText("地图", "ko")).toBe("지도");
    expect(translateText("店铺信息", "en")).toBe("Store information");
    expect(translateText("店铺信息", "ja")).toBe("店舗情報");

    expect(translateText("预约・营业补充", "ja")).toBe("予約・営業時間の補足");
    expect(translateText("预约・营业补充", "en")).toBe("Reservation and hours details");
    expect(translateText("预约・营业补充", "ko")).toBe("예약 및 영업시간 보충 정보");
    expect(translateText("席位・服务补充", "ja")).toBe("席・サービスの補足");
    expect(translateText("营业规则", "en")).toBe("Hours and reservation rules");
    expect(translateText("营业与说明", "en")).toBe("Hours and arrival notes");
    expect(translateText("席位・设备", "ja")).toBe("席・設備");
    expect(translateText("店铺基础信息", "ja")).toBe("店舗基本情報");
    expect(translateText("店铺基础信息", "en")).toBe("Basic store information");
    expect(translateText("店铺详细信息", "en")).toBe("Store details");
    expect(translateText("预约・咨询", "en")).toBe("Reservations and inquiries");
    expect(translateText("预约可否", "en")).toBe("Reservation availability");
    expect(translateText("最大预约人数", "en")).toBe("Maximum reservation size");
    expect(translateText("服务费・其他费用", "en")).toBe("Service and other fees");
    expect(translateText("特点・相关信息", "ko")).toBe("특징 및 관련 정보");
    expect(translateText("特点・相关信息", "en")).toBe("Features and related information");
    expect(translateText("利用场景", "en")).toBe("Best for");
    expect(translateText("位置氛围", "ja")).toBe("ロケーション・雰囲気");
    expect(translateText("位置氛围", "en")).toBe("Location and atmosphere");
    expect(translateText("服务支持", "en")).toBe("Supported services");
    expect(translateText("可立即预约", "en")).toBe("Reserve now");
    expect(translateText("平台聊天咨询 / 立即预约", "ja")).toBe("プラットフォームチャット / 今すぐ予約");
    expect(translateText("平台聊天咨询 / 立即预约", "en")).toBe("Platform chat / Reserve now");
    expect(translateText("费用说明", "en")).toBe("Fee details");
    expect(translateText("官方联系", "ko")).toBe("공식 연락처");
    expect(translateText("电话咨询请以预约确认短信内联系方式为准。", "en")).toContain("reservation confirmation SMS");
    expect(translateText("可咨询。安静时段和团体护理请以店铺确认结果为准。", "en")).toContain("store confirmation");
    expect(translateText("到店后会确认作品相册、颜色样本和护理位准备情况。", "en")).toContain("treatment-seat readiness");
    expect(translateText("套餐、畅饮和多人席可预约。", "en")).toBe("Courses, all-you-can-drink, and group seats can be reserved.");
    expect(translateText("隐秘感餐厅，适合朋友小聚和商务会食。", "ja")).toBe("隠れ家レストランで、友人との集まりやビジネス会食に適しています。");
    expect(translations).not.toHaveProperty("套餐、饮み放题和多人席可预约。");
    expect(translations).not.toHaveProperty("隐れ家餐厅，适合朋友小聚和商务会食。");

    expect(translateText("店铺", "ja")).toBe("店舗");
    expect(translateText("店铺", "en")).toBe("Store");
    expect(translateText("店铺", "ko")).toBe("매장");

    expect(translateText("服务", "ja")).toBe("サービス");
    expect(translateText("服务", "en")).toBe("Service");
    expect(translateText("服务", "ko")).toBe("서비스");

    expect(translateText("附近", "ja")).toBe("付近");
    expect(translateText("附近", "en")).toBe("Nearby");
    expect(translateText("附近", "ko")).toBe("주변");

    expect(translateText("上门按摩", "ja")).toBe("出張マッサージ");
    expect(translateText("上门按摩", "en")).toBe("Outcall massage");
    expect(translateText("上门按摩", "ko")).toBe("출장 마사지");

    expect(translateText("我的动态", "ja")).toBe("マイフィード");
    expect(translateText("我的动态", "en")).toBe("My Feed");
    expect(translateText("我的动态", "ko")).toBe("마이 피드");

    expect(translateText("商务接待", "ja")).toBe("ビジネス接待");
    expect(translateText("商务接待", "en")).toBe("Business Hospitality");
    expect(translateText("商务接待", "ko")).toBe("비즈니스 접대");

    expect(translateText("评价", "ja")).toBe("評価");
    expect(translateText("评价", "en")).toBe("Review");
    expect(translateText("评价", "ko")).toBe("평가");

    expect(translateText("技师", "ja")).toBe("スタッフ");
    expect(translateText("技师", "en")).toBe("Technician");
    expect(translateText("技师", "ko")).toBe("기사");

    expect(translateText("其他", "ja")).toBe("その他");
    expect(translateText("其他", "en")).toBe("Other");
    expect(translateText("其他", "ko")).toBe("기타");

    expect(translateText("全部分类", "ja")).toBe("全て");
    expect(translateText("全部分类", "en")).toBe("All");
    expect(translateText("全部分类", "ko")).toBe("전체");

    expect(translateText("当前服务区域", "ja")).toBe("現在のサービスエリア");
    expect(translateText("当前服务区域", "en")).toBe("Current Service Area");
    expect(translateText("当前服务区域", "ko")).toBe("현재 서비스 지역");

    expect(translateText("已绑定", "ja")).toBe("紐付け済み");
    expect(translateText("已绑定", "en")).toBe("Linked");
    expect(translateText("已绑定", "ko")).toBe("연결됨");

    expect(translateText("已绑定手机", "ja")).toBe("紐付け済み");
    expect(translateText("已绑定手机", "en")).toBe("Linked");
    expect(translateText("已绑定手机", "ko")).toBe("연결됨");

    expect(translateText("帮助与反馈", "ja")).toBe("ヘルプセンター");
    expect(translateText("帮助与反馈", "en")).toBe("Help Center");
    expect(translateText("帮助与反馈", "ko")).toBe("도움말 센터");
  });

  it("localizes legacy-order labels", () => {
    expect(translations["历史只读预约"]).toMatchObject({
      "zh-Hant": "歷史唯讀預約",
      ja: "過去の閲覧専用予約",
      en: "Read-only booking history",
      ko: "읽기 전용 예약 내역"
    });
  });

  it("keeps service-search page copy natural across every supported non-source language", () => {
    const expected = {
      "zh-Hant": ["輸入搜尋關鍵字", "搜尋", "正在載入搜尋結果", "正在搜尋服務與分類。"],
      ja: ["キーワードを入力", "検索", "検索結果を読み込んでいます", "サービスとカテゴリを検索しています。"],
      en: ["Enter keywords", "Search", "Loading search results", "Searching services and categories."],
      ko: ["검색어 입력", "검색", "검색 결과를 불러오는 중", "서비스와 카테고리를 검색하고 있습니다."]
    } as const;

    for (const [language, values] of Object.entries(expected)) {
      expect(translateText("输入搜索关键词", language as Exclude<Language, "zh">)).toBe(values[0]);
      expect(translateText("搜索", language as Exclude<Language, "zh">)).toBe(values[1]);
      expect(translateText("正在载入真实数据", language as Exclude<Language, "zh">)).toBe(values[2]);
      expect(translateText("正在从 /api/v1/search 与 /api/v1/categories 读取分类和搜索结果。", language as Exclude<Language, "zh">)).toBe(values[3]);
    }
  });

});
