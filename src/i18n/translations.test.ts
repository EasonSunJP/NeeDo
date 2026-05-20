import { describe, expect, it } from "vitest";
import { getTranslationLookupCandidates, languages, translateText, translations } from "./translations";

describe("translations", () => {
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

  it("keeps truly unknown source text untouched", () => {
    const unknownText = "__test_unknown_translation_key__";
    expect(translateText(unknownText, "ko")).toBe(unknownText);
    expect(translateText(unknownText, "zh-Hant")).toBe(unknownText);
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

  it("joins split string literals from exported spreadsheet formulas", () => {
    const source = "为进一步定位前后台启动后一闪即白屏的问题，系统已暂时旁路登录输入页，统一改为测试账号 admin / 123456 自动进入各端口。";
    const translated = translateText(source, "en");

    expect(translated).toContain("which will automatically enter each port");
    expect(translated).not.toContain("\"&\"");
  });

  it("uses business management naming for the merchant admin surface", () => {
    expect(translateText("商户后台", "ja")).toBe("事業者管理画面");
    expect(translateText("商户后台", "en")).toBe("Business Management");
    expect(translateText("商户后台", "ko")).toBe("사업자 관리 화면");
    expect(translateText("商家后台", "ja")).toBe("事業者管理画面");
    expect(translateText("商家后台", "en")).toBe("Business Management");
    expect(translateText("商家后台", "ko")).toBe("사업자 관리 화면");

    expect(translateText("商户后台导航", "ja")).toBe("事業者管理画面ナビゲーション");
    expect(translateText("商户后台导航", "en")).toBe("Business management navigation");
    expect(translateText("商户后台导航", "ko")).toBe("사업자 관리 화면 내비게이션");
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
    expect(translateText("多商户可选", "ja")).toBe("複数事業者選択可");
    expect(translateText("可固定阿姨", "ja")).toBe("長期契約可");
    expect(translateText("修水管", "zh")).toBe("修水管");
    expect(translateText("修水管", "ja")).toBe("水回り");
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
    expect(translateText("集中查看店铺工作的趋势、结算和下一单安排。", "en")).toBe("View store-work trends, settlement, and the next assignment in one place.");
    expect(translateText("仅展示店铺工作的统计卡片，便于核对门店收入、排班和履约表现。", "ja")).toBe("店舗業務の統計カードのみを表示し、店舗収入、シフト、履行状況を確認しやすくします。");
    expect(translateText("最近的店铺工作会归档在这里，方便核对排班和收入记录。", "ko")).toContain("근무표");
  });

  it("uses UI decoration naming for the merchant design surface", () => {
    expect(translateText("UI装修", "ja")).toBe("UI装飾");
    expect(translateText("UI装修", "en")).toBe("UI Decoration");
    expect(translateText("UI装修", "ko")).toBe("UI 꾸미기");
    expect(translateText("店铺 UI 装修", "en")).toBe("Store UI Decoration");
    expect(translateText("信息卡装修", "ja")).toBe("情報カード装飾");
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

    expect(translateText("情报", "ja")).toBe("情報");
    expect(translateText("情报", "en")).toBe("Info");
    expect(translateText("情报", "ko")).toBe("정보");
    expect(translateText("个人情报", "ja")).toBe("情報");
    expect(translateText("个人情报", "en")).toBe("Info");
    expect(translateText("个人情报", "ko")).toBe("정보");
    expect(translateText("店铺情报", "ja")).toBe("情報");
    expect(translateText("店铺情报", "en")).toBe("Info");
    expect(translateText("店铺情报", "ko")).toBe("정보");

    expect(translateText("地图", "ja")).toBe("地図");
    expect(translateText("地图", "en")).toBe("Map");
    expect(translateText("地图", "ko")).toBe("지도");

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
});
