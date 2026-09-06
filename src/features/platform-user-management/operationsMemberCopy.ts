import type { Language } from "../../i18n/translations";
const zh = {
  add: "添加运营成员", name: "成员姓名", email: "登录邮箱", password: "初始密码", reason: "创建原因",
  hint: "系统将生成 needo 开头的运营专用账号，并授予运营角色。", passwordHint: "8–128 位，包含大写、小写、数字和特殊字符 !@#$%^&*",
  create: "创建运营账号", saving: "创建中…", cancel: "取消", failed: "创建失败，请重试", duplicate: "该邮箱已被使用", created: "运营账号已创建", details: "详情",
  groupHint: "成员由正式会员资格或运营角色自动计算。运营专用账号可通过“添加运营成员”创建。", refreshFailed: "账号已创建，成员列表刷新失败，请重新打开分组。"
};
type Copy = Record<keyof typeof zh, string>;
export const operationsMemberCopy: Record<Language, Copy> = {
  zh,
  "zh-Hant": { add: "新增營運成員", name: "成員姓名", email: "登入信箱", password: "初始密碼", reason: "建立原因", hint: "系統將產生 needo 開頭的營運專用帳號，並授予營運角色。", passwordHint: "8–128 位，包含大小寫字母、數字及特殊字元 !@#$%^&*", create: "建立營運帳號", saving: "建立中…", cancel: "取消", failed: "建立失敗，請重試", duplicate: "此信箱已被使用", created: "營運帳號已建立", details: "詳情", groupHint: "成員依正式會員資格或營運角色自動計算。可透過「新增營運成員」建立專用帳號。", refreshFailed: "帳號已建立，成員清單更新失敗，請重新開啟分組。" },
  ja: { add: "運営メンバーを追加", name: "メンバー名", email: "ログインメール", password: "初期パスワード", reason: "作成理由", hint: "needo で始まる運営専用アカウントを自動発行し、運営ロールを付与します。", passwordHint: "8～128文字。大文字、小文字、数字、記号 !@#$%^&* を含めてください", create: "運営アカウントを作成", saving: "作成中…", cancel: "キャンセル", failed: "作成に失敗しました。再試行してください", duplicate: "このメールは既に使用されています", created: "運営アカウントを作成しました", details: "詳細", groupHint: "メンバーは会員資格や運営ロールから自動算出されます。「運営メンバーを追加」から専用アカウントを作成できます。", refreshFailed: "アカウントは作成済みですが、一覧の更新に失敗しました。グループを開き直してください。" },
  en: { add: "Add operations member", name: "Member name", email: "Login email", password: "Initial password", reason: "Creation reason", hint: "The system generates an official needo account and assigns the operator role.", passwordHint: "8–128 characters including uppercase, lowercase, digits and symbols !@#$%^&*", create: "Create operations account", saving: "Creating…", cancel: "Cancel", failed: "Creation failed. Please retry", duplicate: "This email is already in use", created: "Operations account created", details: "Details", groupHint: "Members are derived from membership or operations roles. Use Add operations member to create an official account.", refreshFailed: "Account created, but the member list could not refresh. Reopen the group." },
  ko: { add: "운영 구성원 추가", name: "구성원 이름", email: "로그인 이메일", password: "초기 비밀번호", reason: "생성 사유", hint: "needo로 시작하는 운영 전용 계정을 자동 생성하고 운영 역할을 부여합니다.", passwordHint: "8–128자. 대문자, 소문자, 숫자 및 특수 문자 !@#$%^&* 포함", create: "운영 계정 생성", saving: "생성 중…", cancel: "취소", failed: "생성하지 못했습니다. 다시 시도하세요", duplicate: "이미 사용 중인 이메일입니다", created: "운영 계정 생성 완료", details: "상세", groupHint: "구성원은 회원 자격 또는 운영 역할에 따라 자동 계산됩니다. 운영 구성원 추가로 전용 계정을 생성하세요.", refreshFailed: "계정은 생성되었으나 목록 갱신에 실패했습니다. 그룹을 다시 여세요." }
};
