import { describe, expect, it } from "vitest";
import { translateAffiliateAllianceText } from "../features/affiliate-alliance/i18n";
import { contentPublicationTranslations } from "../features/content-publication/i18n";
import { affiliateMarketplaceTranslations } from "../features/affiliate-marketplace/i18n";
import { translateImUiText } from "../features/im/ui-copy";
import { getTranslationLookupCandidates, languages, registerTranslationEntries, translateText, translateTextForContext, translations } from "./translations";

describe("translations", () => {
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
      "重试上传封面": { "zh-Hant": "重試上傳封面", ja: "カバーのアップロードを再試行", en: "Retry cover upload", ko: "커버 업로드 다시 시도" }
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
    expect(translateText("语言", "en")).toBe("language");
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

  it("localizes service-card unavailable duration and legacy-order labels", () => {
    expect(translations["时长未读取"]).toMatchObject({
      "zh-Hant": "時長未讀取",
      ja: "所要時間未取得",
      en: "Duration unavailable",
      ko: "소요 시간 불러오지 못함"
    });
    expect(translations["历史只读预约"]).toMatchObject({
      "zh-Hant": "歷史唯讀預約",
      ja: "過去の閲覧専用予約",
      en: "Read-only booking history",
      ko: "읽기 전용 예약 내역"
    });
  });

});
