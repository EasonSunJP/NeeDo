import type { TranslationEntry } from "../../i18n/translations";

const entry = (
  zhHant: string,
  ja: string,
  en: string,
  ko: string,
): TranslationEntry => ({ "zh-Hant": zhHant, ja, en, ko });

export const fieldJobTranslations: Record<string, TranslationEntry> = {
  "从正式 BookingOrder 中投影上门履约订单；本页只读，派工、状态流转、支付和异常处置继续由已有正式模块完成。":
    entry(
      "從正式 BookingOrder 投影到府履約訂單；本頁唯讀，派工、狀態流轉、付款與異常處置仍由既有正式模組完成。",
      "正式な BookingOrder から訪問サービスを投影します。この画面は参照専用で、割り当て、状態遷移、支払い、例外処理は既存の正式モジュールで行います。",
      "Projects home-service orders from formal BookingOrder data. This page is read-only; assignment, state changes, payments, and exception handling remain in the existing production modules.",
      "정식 BookingOrder에서 방문 서비스 주문을 투영합니다. 이 화면은 읽기 전용이며 배정, 상태 변경, 결제 및 예외 처리는 기존 정식 모듈에서 수행합니다.",
    ),
  正式数据: entry("正式資料", "正式データ", "Formal data", "정식 데이터"),
  搜索上门工单: entry(
    "搜尋到府工單",
    "訪問作業を検索",
    "Search field jobs",
    "방문 작업 검색",
  ),
  "订单号、服务、门店或技师": entry(
    "訂單號、服務、店鋪或技師",
    "注文番号、サービス、店舗、スタッフ",
    "Order number, service, shop, or technician",
    "주문 번호, 서비스, 매장 또는 테크니션",
  ),
  工单状态: entry("工單狀態", "作業状態", "Job status", "작업 상태"),
  技师分配: entry(
    "技師分配",
    "スタッフ割り当て",
    "Technician assignment",
    "테크니션 배정",
  ),
  全部分配状态: entry(
    "全部分配狀態",
    "すべての割り当て状態",
    "All assignment states",
    "모든 배정 상태",
  ),
  正在读取正式上门工单: entry(
    "正在讀取正式到府工單",
    "正式な訪問作業を読み込んでいます",
    "Loading formal field jobs",
    "정식 방문 작업을 불러오는 중",
  ),
  上门工单读取失败: entry(
    "到府工單讀取失敗",
    "訪問作業を読み込めませんでした",
    "Failed to load field jobs",
    "방문 작업을 불러오지 못했습니다",
  ),
  当前没有符合条件的正式上门工单: entry(
    "目前沒有符合條件的正式到府工單",
    "条件に一致する正式な訪問作業はありません",
    "No formal field jobs match the filters",
    "조건에 맞는 정식 방문 작업이 없습니다",
  ),
  履约区域: entry("履約區域", "訪問エリア", "Service region", "이행 지역"),
  服务凭证: entry(
    "服務憑證",
    "サービス開始認証",
    "Service credential",
    "서비스 인증",
  ),
  未签发: entry("未簽發", "未発行", "Not issued", "미발급"),
  已签发: entry("已簽發", "発行済み", "Issued", "발급됨"),
  正式上门工单详情: entry(
    "正式到府工單詳情",
    "正式な訪問作業の詳細",
    "Formal field-job details",
    "정식 방문 작업 상세",
  ),
  正在读取最新工单详情: entry(
    "正在讀取最新工單詳情",
    "最新の作業詳細を読み込んでいます",
    "Loading the latest job details",
    "최신 작업 상세를 불러오는 중",
  ),
  开始证据: entry("開始證據", "開始記録", "Start evidence", "시작 증빙"),
  结束证据: entry("結束證據", "終了記録", "End evidence", "종료 증빙"),
  收据确认: entry("收據確認", "受領確認", "Receipt confirmation", "수령 확인"),
  异常计数: entry("異常計數", "例外件数", "Exception count", "예외 건수"),
  履约地址: entry("履約地址", "訪問先住所", "Service address", "이행 주소"),
  "当前权限仅允许查看行政区域。": entry(
    "目前權限僅允許查看行政區域。",
    "現在の権限では行政区分のみ表示できます。",
    "Your current permission allows regional disclosure only.",
    "현재 권한으로는 행정 구역만 볼 수 있습니다.",
  ),
  状态时间线: entry(
    "狀態時間線",
    "状態タイムライン",
    "Status timeline",
    "상태 타임라인",
  ),
  暂无状态记录: entry(
    "暫無狀態記錄",
    "状態履歴はまだありません",
    "No status history",
    "상태 기록 없음",
  ),
  前往正式订单中心: entry(
    "前往正式訂單中心",
    "正式注文センターへ",
    "Open formal order center",
    "정식 주문 센터로 이동",
  ),
};
