import { translateText, type Language } from "../../i18n/translations";

type AffiliateAllianceTranslation = Partial<
  Record<"zh-Hant" | "ja" | "en" | "ko", string>
>;

export const affiliateAllianceTranslations: Record<string, AffiliateAllianceTranslation> = {
  联盟: { "zh-Hant": "聯盟", ja: "アライアンス", en: "Alliance", ko: "연합" },
  联盟营销: { "zh-Hant": "聯盟行銷", ja: "アフィリエイト", en: "Affiliate", ko: "제휴 마케팅" },
  "管理当前联盟、成员权限与独立联盟钱包。": {
    "zh-Hant": "管理目前聯盟、成員權限與獨立聯盟錢包。",
    ja: "現在のアライアンス、メンバー権限、専用ウォレットを管理します。",
    en: "Manage your current alliance, member permissions, and separate alliance wallet.",
    ko: "현재 연합, 회원 권한 및 독립 연합 지갑을 관리합니다."
  },
  查看联盟说明: {
    "zh-Hant": "查看聯盟說明",
    ja: "アライアンスの説明を表示",
    en: "View alliance information",
    ko: "연합 안내 보기"
  },
  正在读取联盟: {
    "zh-Hant": "正在讀取聯盟",
    ja: "アライアンスを読み込んでいます",
    en: "Loading alliance",
    ko: "연합을 불러오는 중"
  },
  没有权限查看联盟: {
    "zh-Hant": "沒有權限查看聯盟",
    ja: "アライアンスを表示する権限がありません",
    en: "You don't have permission to view the alliance",
    ko: "연합을 볼 권한이 없습니다"
  },
  联盟读取失败: {
    "zh-Hant": "聯盟讀取失敗",
    ja: "アライアンスを読み込めませんでした",
    en: "Couldn't load the alliance",
    ko: "연합을 불러오지 못했습니다"
  },
  重新加载: { "zh-Hant": "重新載入", ja: "再読み込み", en: "Reload", ko: "다시 불러오기" },
  联盟章程: { "zh-Hant": "聯盟章程", ja: "アライアンス規約", en: "Alliance charter", ko: "연합 규약" },
  建立你的第一个联盟: {
    "zh-Hant": "建立你的第一個聯盟",
    ja: "最初のアライアンスを作成",
    en: "Create your first alliance",
    ko: "첫 연합 만들기"
  },
  "创建后，你将成为所有者，并获得独立的联盟 NDP 钱包。": {
    "zh-Hant": "建立後，你將成為所有者，並取得獨立的聯盟 NDP 錢包。",
    ja: "作成するとオーナーになり、専用のアライアンスNDPウォレットが発行されます。",
    en: "You'll become the owner and receive a separate alliance NDP wallet.",
    ko: "생성 후 소유자가 되며 독립 연합 NDP 지갑을 받습니다."
  },
  联盟名称: { "zh-Hant": "聯盟名稱", ja: "アライアンス名", en: "Alliance name", ko: "연합 이름" },
  例如东京美容创作者联盟: {
    "zh-Hant": "例如東京美容創作者聯盟",
    ja: "例：東京ビューティークリエイターアライアンス",
    en: "For example: Tokyo Beauty Creator Alliance",
    ko: "예: 도쿄 뷰티 크리에이터 연합"
  },
  联盟介绍: { "zh-Hant": "聯盟介紹", ja: "アライアンス紹介", en: "Alliance description", ko: "연합 소개" },
  说明合作方向和联盟定位: {
    "zh-Hant": "說明合作方向和聯盟定位",
    ja: "提携方針とアライアンスの位置づけを説明",
    en: "Describe the collaboration focus and alliance positioning",
    ko: "협업 방향과 연합의 포지셔닝을 설명하세요"
  },
  实际推广者比例: {
    "zh-Hant": "實際推廣者比例",
    ja: "実際のプロモーター比率",
    en: "Actual promoter share",
    ko: "실제 프로모터 비율"
  },
  推广者: { "zh-Hant": "推廣者", ja: "プロモーター", en: "Promoter", ko: "프로모터" },
  "联盟创建无需 eKYC；联盟钱包提现时才需要完成 eKYC 并绑定同名银行账户。": {
    "zh-Hant": "建立聯盟無需 eKYC；聯盟錢包提現時才需要完成 eKYC 並綁定同名銀行帳戶。",
    ja: "アライアンス作成にeKYCは不要です。ウォレットからの出金時に、eKYCと同一名義の銀行口座が必要です。",
    en: "eKYC is not required to create an alliance. Withdrawal requires completed eKYC and a bank account in the same name.",
    ko: "연합 생성에는 eKYC가 필요하지 않습니다. 출금 시 eKYC 완료 및 동일 명의 은행 계좌가 필요합니다."
  },
  创建联盟: { "zh-Hant": "建立聯盟", ja: "アライアンスを作成", en: "Create alliance", ko: "연합 만들기" },
  创建中: { "zh-Hant": "建立中", ja: "作成中", en: "Creating", ko: "생성 중" },
  没有权限创建联盟: {
    "zh-Hant": "沒有權限建立聯盟",
    ja: "アライアンスを作成する権限がありません",
    en: "You don't have permission to create an alliance",
    ko: "연합을 만들 권한이 없습니다"
  },
  "联盟创建失败，请稍后重试": {
    "zh-Hant": "聯盟建立失敗，請稍後再試",
    ja: "アライアンスを作成できませんでした。後でもう一度お試しください",
    en: "Couldn't create the alliance. Try again later",
    ko: "연합을 만들지 못했습니다. 잠시 후 다시 시도하세요"
  },
  联盟已创建: { "zh-Hant": "聯盟已建立", ja: "アライアンスを作成しました", en: "Alliance created", ko: "연합을 만들었습니다" },
  联盟状态已刷新: {
    "zh-Hant": "聯盟狀態已重新整理",
    ja: "アライアンスの状態を更新しました",
    en: "Alliance status refreshed",
    ko: "연합 상태를 새로고침했습니다"
  },
  有效: { "zh-Hant": "有效", ja: "有効", en: "Active", ko: "활성" },
  暂停: { "zh-Hant": "暫停", ja: "停止中", en: "Suspended", ko: "일시 중지" },
  已关闭: { "zh-Hant": "已關閉", ja: "終了", en: "Closed", ko: "종료" },
  联盟所有者: { "zh-Hant": "聯盟所有者", ja: "アライアンスオーナー", en: "Alliance owner", ko: "연합 소유자" },
  所有者: { "zh-Hant": "所有者", ja: "オーナー", en: "Owner", ko: "소유자" },
  所有者权限: { "zh-Hant": "所有者權限", ja: "オーナー権限", en: "Owner permissions", ko: "소유자 권한" },
  领取任务: { "zh-Hant": "領取任務", ja: "案件を受け取る", en: "Claim tasks", ko: "작업 받기" },
  查看联盟概览: { "zh-Hant": "查看聯盟概覽", ja: "アライアンス概要を表示", en: "View alliance overview", ko: "연합 개요 보기" },
  查看成员详情: { "zh-Hant": "查看成員詳情", ja: "メンバー詳細を表示", en: "View member details", ko: "회원 상세 보기" },
  管理自己的下级: { "zh-Hant": "管理自己的下級", ja: "自分の配下を管理", en: "Manage own subordinates", ko: "자신의 하위 회원 관리" },
  查看联盟钱包: { "zh-Hant": "查看聯盟錢包", ja: "アライアンスウォレットを表示", en: "View alliance wallet", ko: "연합 지갑 보기" },
  已授权: { "zh-Hant": "已授權", ja: "許可済み", en: "Allowed", ko: "허용됨" },
  未授权: { "zh-Hant": "未授權", ja: "未許可", en: "Not allowed", ko: "허용되지 않음" },
  联盟钱包: { "zh-Hant": "聯盟錢包", ja: "アライアンスウォレット", en: "Alliance wallet", ko: "연합 지갑" },
  "与个人钱包分开记账，余额只来自正式联盟结算。": {
    "zh-Hant": "與個人錢包分開記帳，餘額只來自正式聯盟結算。",
    ja: "個人ウォレットとは別に記帳され、残高は正式なアライアンス精算のみから発生します。",
    en: "This is recorded separately from your personal wallet and receives only formal alliance settlements.",
    ko: "개인 지갑과 별도로 기록되며 잔액은 정식 연합 정산에서만 발생합니다."
  },
  可用余额: { "zh-Hant": "可用餘額", ja: "利用可能残高", en: "Available balance", ko: "사용 가능 잔액" },
  冻结余额: { "zh-Hant": "凍結餘額", ja: "凍結残高", en: "Frozen balance", ko: "동결 잔액" },
  我的联盟身份: { "zh-Hant": "我的聯盟身分", ja: "自分のアライアンス資格", en: "My alliance role", ko: "내 연합 역할" },
  我的权限: { "zh-Hant": "我的權限", ja: "自分の権限", en: "My permissions", ko: "내 권한" },
  合作伙伴: { "zh-Hant": "合作夥伴", ja: "パートナー", en: "Partner", ko: "파트너" },
  下级成员: { "zh-Hant": "下級成員", ja: "配下メンバー", en: "Subordinate", ko: "하위 회원" },
  成员名单: { "zh-Hant": "成員名單", ja: "メンバー一覧", en: "Members", ko: "회원 목록" },
  成员数据读取失败: { "zh-Hant": "成員資料讀取失敗", ja: "メンバーを読み込めませんでした", en: "Couldn't load members", ko: "회원 정보를 불러오지 못했습니다" },
  重试成员名单: { "zh-Hant": "重試成員名單", ja: "メンバーを再読み込み", en: "Retry members", ko: "회원 목록 다시 시도" },
  暂无成员: { "zh-Hant": "暫無成員", ja: "メンバーはいません", en: "No members yet", ko: "아직 회원이 없습니다" },
  上级: { "zh-Hant": "上級", ja: "上位メンバー", en: "Parent", ko: "상위 회원" },
  加入时间: { "zh-Hant": "加入時間", ja: "参加日時", en: "Joined", ko: "가입 시간" },
  邀请成员: { "zh-Hant": "邀請成員", ja: "メンバーを招待", en: "Invite member", ko: "회원 초대" },
  "在双方已互为联系人且均已开通联盟营销身份的账号中选择。": {
    "zh-Hant": "請從已互為聯絡人且雙方均已開通聯盟行銷身分的帳號中選擇。",
    ja: "相互に連絡先へ追加され、双方がアフィリエイト資格を開通済みのアカウントから選択します。",
    en: "Choose an account where both people are mutual contacts and have an active Affiliate identity.",
    ko: "서로 연락처로 등록되어 있고 양쪽 모두 제휴 마케팅 자격을 활성화한 계정에서 선택하세요."
  },
  搜索NeeDo用户ID或姓名: { "zh-Hant": "搜尋NeeDo用戶ID或姓名", ja: "NeeDoユーザーIDまたは名前で検索", en: "Search NeeDo user ID or name", ko: "NeeDo 사용자 ID 또는 이름 검색" },
  候选账号读取失败: { "zh-Hant": "候選帳號讀取失敗", ja: "招待候補を読み込めませんでした", en: "Couldn't load eligible contacts", ko: "초대 가능한 연락처를 불러오지 못했습니다" },
  重试候选账号: { "zh-Hant": "重試候選帳號", ja: "候補を再読み込み", en: "Retry eligible contacts", ko: "초대 후보 다시 시도" },
  没有符合条件的联系人: { "zh-Hant": "沒有符合條件的聯絡人", ja: "条件を満たす連絡先はありません", en: "No eligible contacts", ko: "조건에 맞는 연락처가 없습니다" },
  选择: { "zh-Hant": "選擇", ja: "選択", en: "Select", ko: "선택" },
  邀请角色: { "zh-Hant": "邀請角色", ja: "招待する役割", en: "Invitation role", ko: "초대 역할" },
  指定上级: { "zh-Hant": "指定上級", ja: "上位メンバーを指定", en: "Select parent", ko: "상위 회원 지정" },
  请选择所有者或合作伙伴: { "zh-Hant": "請選擇所有者或合作夥伴", ja: "オーナーまたはパートナーを選択", en: "Select an owner or partner", ko: "소유자 또는 파트너를 선택하세요" },
  已选择: { "zh-Hant": "已選擇", ja: "選択済み", en: "Selected", ko: "선택됨" },
  发送邀请: { "zh-Hant": "傳送邀請", ja: "招待を送信", en: "Send invitation", ko: "초대 보내기" },
  发送中: { "zh-Hant": "傳送中", ja: "送信中", en: "Sending", ko: "보내는 중" },
  邀请已发送: { "zh-Hant": "邀請已傳送", ja: "招待を送信しました", en: "Invitation sent", ko: "초대를 보냈습니다" },
  邀请发送失败: { "zh-Hant": "邀請傳送失敗", ja: "招待を送信できませんでした", en: "Couldn't send the invitation", ko: "초대를 보내지 못했습니다" },
  发出的邀请: { "zh-Hant": "發出的邀請", ja: "送信した招待", en: "Sent invitations", ko: "보낸 초대" },
  邀请记录读取失败: { "zh-Hant": "邀請記錄讀取失敗", ja: "招待履歴を読み込めませんでした", en: "Couldn't load invitation history", ko: "초대 기록을 불러오지 못했습니다" },
  重试邀请记录: { "zh-Hant": "重試邀請記錄", ja: "招待履歴を再読み込み", en: "Retry invitations", ko: "초대 기록 다시 시도" },
  暂无邀请记录: { "zh-Hant": "暫無邀請記錄", ja: "招待履歴はありません", en: "No invitations yet", ko: "아직 초대 기록이 없습니다" },
  等待回应: { "zh-Hant": "等待回應", ja: "返答待ち", en: "Pending", ko: "응답 대기" },
  已接受: { "zh-Hant": "已接受", ja: "承諾済み", en: "Accepted", ko: "수락됨" },
  已拒绝: { "zh-Hant": "已拒絕", ja: "辞退済み", en: "Rejected", ko: "거절됨" },
  已过期: { "zh-Hant": "已過期", ja: "期限切れ", en: "Expired", ko: "만료됨" },
  邀请对象: { "zh-Hant": "邀請對象", ja: "招待先", en: "Invitee", ko: "초대 대상" },
  到期时间: { "zh-Hant": "到期時間", ja: "有効期限", en: "Expires", ko: "만료 시간" },
  收到的邀请: { "zh-Hant": "收到的邀請", ja: "受信した招待", en: "Received invitations", ko: "받은 초대" },
  "你可以先处理邀请，再决定是否创建自己的联盟。": {
    "zh-Hant": "你可以先處理邀請，再決定是否建立自己的聯盟。",
    ja: "先に招待へ返答してから、自分のアライアンスを作成するか決められます。",
    en: "Respond to invitations before deciding whether to create your own alliance.",
    ko: "초대에 먼저 응답한 뒤 내 연합을 만들지 결정할 수 있습니다."
  },
  收到的邀请读取失败: { "zh-Hant": "收到的邀請讀取失敗", ja: "受信した招待を読み込めませんでした", en: "Couldn't load received invitations", ko: "받은 초대를 불러오지 못했습니다" },
  重试收到的邀请: { "zh-Hant": "重試收到的邀請", ja: "受信した招待を再読み込み", en: "Retry received invitations", ko: "받은 초대 다시 시도" },
  暂无待处理邀请: { "zh-Hant": "暫無待處理邀請", ja: "対応が必要な招待はありません", en: "No invitations need a response", ko: "처리할 초대가 없습니다" },
  邀请方: { "zh-Hant": "邀請方", ja: "招待者", en: "Invited by", ko: "초대한 사람" },
  接受邀请: { "zh-Hant": "接受邀請", ja: "招待を承諾", en: "Accept invitation", ko: "초대 수락" },
  拒绝邀请: { "zh-Hant": "拒絕邀請", ja: "招待を辞退", en: "Reject invitation", ko: "초대 거절" },
  处理中: { "zh-Hant": "處理中", ja: "処理中", en: "Processing", ko: "처리 중" },
  邀请已接受: { "zh-Hant": "邀請已接受", ja: "招待を承諾しました", en: "Invitation accepted", ko: "초대를 수락했습니다" },
  邀请已拒绝: { "zh-Hant": "邀請已拒絕", ja: "招待を辞退しました", en: "Invitation rejected", ko: "초대를 거절했습니다" },
  上一页: { "zh-Hant": "上一頁", ja: "前のページ", en: "Previous", ko: "이전" },
  下一页: { "zh-Hant": "下一頁", ja: "次のページ", en: "Next", ko: "다음" },
  当前页: { "zh-Hant": "目前頁", ja: "ページ", en: "Page", ko: "페이지" },
  "状态冲突，请刷新后重试": { "zh-Hant": "狀態衝突，請重新整理後再試", ja: "状態が更新されています。再読み込みしてお試しください", en: "The status changed. Refresh and try again", ko: "상태가 변경되었습니다. 새로고침 후 다시 시도하세요" },
  邀请已过期: { "zh-Hant": "邀請已過期", ja: "招待の有効期限が切れています", en: "The invitation has expired", ko: "초대가 만료되었습니다" },
  没有权限执行此操作: { "zh-Hant": "沒有權限執行此操作", ja: "この操作を行う権限がありません", en: "You don't have permission for this action", ko: "이 작업을 수행할 권한이 없습니다" },
  "操作失败，请稍后重试": { "zh-Hant": "操作失敗，請稍後再試", ja: "操作できませんでした。後でもう一度お試しください", en: "The action failed. Try again later", ko: "작업에 실패했습니다. 잠시 후 다시 시도하세요" },
  最后更新: { "zh-Hant": "最後更新", ja: "最終更新", en: "Last updated", ko: "마지막 업데이트" }
};

export function translateAffiliateAllianceText(source: string, language: Language): string {
  if (language === "zh") return source;
  return affiliateAllianceTranslations[source]?.[language] ?? translateText(source, language);
}
