import type { ContractType } from "../services/contract-acceptance.service";

export type SupportedContractLanguage = "zh-CN" | "ja" | "en";

export const LEGAL_CONTRACT_EFFECTIVE_AT = new Date("2026-08-26T00:00:00.000Z");
export const MERCHANT_CONTRACT_EFFECTIVE_AT = new Date("2026-09-08T00:00:00.000Z");
export const LEGAL_CONTRACT_VERSIONS: Readonly<Record<ContractType, string>> = {
  merchant: "merchant-2026-09-08-v2",
  affiliate: "affiliate-2026-08-26-v1"
};

export const AFFILIATE_CONTRACT_TEXT: Readonly<Record<SupportedContractLanguage, string>> = {
  "zh-CN": `NeeDo 联盟营销规则及合同

生效日：2026 年 9 月 8 日

本合同由使用 NeeDo 联盟营销服务的注册用户（以下简称“联盟营销者”）与 NeeDo 服务运营方（以下简称“NeeDo”）订立。联盟营销者在已登录状态下完整阅读本规则及合同，分别确认“已阅读”和“同意”，并点击“同意合同并确认开启联盟营销”或同等含义的按钮后，视为以电子方式作出同意。

第一条（服务内容）
联盟营销者可以使用 NeeDo 提供的正式推广链接、内容和归因工具介绍平台内服务。不得冒充商户、技师或 NeeDo，不得发布虚假、误导、歧视、骚扰、违法或侵犯第三方权利的内容，也不得通过自成交、机器人、批量虚假账号或其他不正当方式获取报酬。

第二条（NDP 报酬）
符合当期活动规则且经 NeeDo 正式归因、确认的成果，可以产生 NDP 报酬。展示中的预计报酬不等于最终结算；取消、退款、欺诈、重复归因、违反活动条件或系统纠错时，NeeDo 可以依规则撤销或调整相关 NDP，并保留可审计记录。

第三条（提现、eKYC 与银行账户）
赚取 NDP 不以完成 eKYC 为前提，但创建提现申请前必须完成有效且未过期的 eKYC，并绑定本人银行账户。银行账户名义人必须与 eKYC 核验姓名按全角片假名标准化后完全一致；不一致时不得人工绕过。联盟营销者应保证银行资料真实、准确并及时更新。

第四条（内容与知识产权）
联盟营销者保留其原创内容依法享有的权利，并授予 NeeDo 为提供、展示、审核、归因和防止滥用所必需的非独占许可。联盟营销者仅可在活动规则允许的范围内使用 NeeDo、商户或技师的名称、商标和素材。

第五条（个人信息与记录）
NeeDo 按适用隐私政策处理账号、合同确认、eKYC、银行验证和交易记录。合同证据记录版本、文本快照、哈希、确认时间、语言、登录会话标识和收据编号，不保存 IP 地址。

第六条（暂停与终止）
联盟营销者可以停止使用本服务。出现违法、欺诈、重大违约、安全风险或监管要求时，NeeDo 可以暂停或终止联盟营销权限，并依法处理尚未结算或需追回的金额。

第七条（责任）
各方对其故意或重大过失造成的损害依法承担责任。对于不可抗力、通信运营商或金融机构故障等合理控制范围外的事件，责任依适用法律判断。本条不排除法律不得限制的消费者权利或责任。

第八条（规则变更）
NeeDo 可以因法律、监管、服务或费率变化发布新版本。需要重新同意的重大变更不会覆盖本次合同证据；新版本生效前将按适用法律提供通知和确认机会。

第九条（适用法律与争议）
本合同适用日本法。争议应先诚信协商；依法需要约定管辖时，以日本有管辖权的法院为第一审专属合意管辖法院，但消费者保护法等强制性规定优先适用。

最终确认：本人已完整阅读并理解上述规则与 NeeDo 合同，同意以电子方式订立，并确认开启联盟营销。`,
  ja: `NeeDo アフィリエイトマーケティング規約・契約

効力発生日：2026年8月26日

本契約は、NeeDo の登録利用者（以下「アフィリエイター」）と NeeDo サービス運営者との間で締結されます。ログイン済みの画面で全文を読み、「閲覧済み」と「同意する」を個別に確認し、「契約に同意してアフィリエイトを有効化」するボタンを押すことで、電子的に同意します。

1. 正式なリンクと帰属計測を用い、虚偽表示、なりすまし、不正な自己取引、ボットその他の不正行為をしてはなりません。
2. NDP 報酬は、対象キャンペーンの条件と正式な帰属・確定に従います。取消、返金、不正、重複又は訂正がある場合、監査記録を残して調整又は取消しを行うことがあります。
3. NDP の獲得自体に eKYC は不要ですが、出金申請には有効な eKYC と本人名義の銀行口座が必要です。口座名義は eKYC 氏名と全角カタカナ正規化後に完全一致しなければならず、手動例外はありません。
4. 原創作物の権利は法令に従い保持され、サービス提供、表示、審査、帰属及び不正防止に必要な非独占的利用を NeeDo に許諾します。
5. 契約証跡には版、本文スナップショット、ハッシュ、同意時刻、言語、認証済みセッション識別子及び受領番号を保存し、IP アドレスは保存しません。
6. 違法、不正、重大な違反、安全上の危険又は法令上の要請がある場合、権限を停止又は終了できます。
7. 強行法規上制限できない権利・責任を除き、責任は日本法に従います。
8. 重要な変更は新しい版として通知し、必要な再同意を求めます。過去の同意証跡は上書きしません。
9. 本契約は日本法に準拠し、強行的な消費者保護規定を優先します。

最終確認：全文を読み理解し、電子契約に同意してアフィリエイトを有効化します。`,
  en: `NeeDo Affiliate Marketing Rules and Agreement

Effective date: 26 August 2026

This agreement is between the registered affiliate and the operator of NeeDo. The affiliate electronically agrees after reading the complete text, separately confirming that it was read and accepted, and selecting the action to agree and enable affiliate marketing.

1. Affiliates must use official links and attribution tools and must not misrepresent parties, create deceptive content, self-deal fraudulently, use bots, or infringe applicable law or third-party rights.
2. NDP rewards arise only after the applicable campaign conditions and formal attribution are satisfied. NeeDo may audibly reverse or adjust rewards for cancellation, refund, fraud, duplicate attribution, rule violations, or correction.
3. eKYC is not required to earn NDP. Before any withdrawal request, however, the affiliate must hold a valid eKYC verification and bind a bank account in the same name. The normalized full-width katakana account holder must exactly match the eKYC name; there is no manual override.
4. Original-content rights remain subject to law, with a non-exclusive licence to NeeDo as necessary to operate, display, review, attribute, and protect the service.
5. Contract evidence records the version, exact text snapshot, hash, time, language, authenticated session identifier, and receipt identifier. It does not store an IP address.
6. NeeDo may suspend or terminate access for illegality, fraud, material breach, security risk, or regulatory requirement.
7. Liability and non-excludable consumer rights are governed by applicable law.
8. Material changes are issued as a new version and do not overwrite earlier evidence; renewed consent is requested where required.
9. This agreement is governed by Japanese law, subject to mandatory consumer-protection rules.

Final confirmation: I have read and understood the complete rules and NeeDo agreement, agree electronically, and confirm activation of affiliate marketing.`
};

export const MERCHANT_CONTRACT_TEXT: Readonly<Record<SupportedContractLanguage, string>> = {
  "zh-CN": `NeeDo 商户服务规则及合同

生效日：2026 年 8 月 26 日

本合同由申请开通 NeeDo 店铺身份的法人或个人经营者（以下简称“商户”）与 NeeDo 服务运营方订立。商户确认店铺展示、申请主体、代表者、证件、银行账户及联系方式真实准确，并在已登录状态下完成阅读、同意和最终提交。

第一条（店铺服务）
商户负责合法提供店铺服务、维护真实的服务展示、价格、预约、人员和营业信息，并遵守日本适用的消费者保护、广告、劳动、税务、支付和个人信息法律。NeeDo 提供平台与商户 SaaS 功能，不替代商户对实际服务承担的责任。

第二条（申请主体与银行账户）
法人名义申请必须提交法人登记资料和代表者身份证明；个人名义申请必须按照平台当前政策完成 eKYC。银行账户资料按申请人填写内容登记，平台不将账户名义与申请人、代表者或法人名称进行一致性判断。商户应保证银行资料真实、准确并及时更新。

第三条（收费与试用）
当前标准月费为每月 9,800 日元；最终应付金额、计费对象及免收费条件以运营后台确认的正式计费资料和届时有效费率为准。运营批准日为权限开启日。若开启当月剩余少于 15 天，该月剩余天数作为额外免费期，之后三个完整自然月为试用期；若剩余正好 15 天或多于 15 天，当月计作试用第一个月，试用至第三个计入月份的月末。

例一：8 月 20 日开启，8 月剩余期间为额外免费期，9 月、10 月、11 月为三个完整试用月，12 月 1 日起计费。
例二：8 月 10 日开启，8 月、9 月、10 月为三个试用月，11 月 1 日起计费。
边界规则：开启当月正好剩余 15 天时，当月算试用第一个月。

第四条（资料、审核与通知）
NeeDo 可以核验申请资料并批准或拒绝。批准后创建店铺身份、商户账户和计费资料；拒绝时提供原因并允许重新编辑提交。申请证件和详细资料按隐私及保留规则处理。

第五条（合同证据）
系统保存合同版本、完整文本快照、内容哈希、确认时间、语言、认证会话标识和收据编号，不保存 IP 地址。后续版本不覆盖本次证据。

第六条（暂停、终止与责任）
违法、欺诈、重大违约、安全风险、欠费或监管要求可能导致限制、暂停或终止。各方依法承担其责任；不得排除的消费者权利和故意或重大过失责任不受限制。

第七条（适用法律）
本合同适用日本法。争议先诚信协商，并在强制性消费者保护规定优先的前提下，由日本有管辖权的法院处理。

最终确认：本人有权代表申请主体，已完整阅读并理解收费规则及 NeeDo 合同，确认资料真实，同意以电子方式订立并提交店铺申请。`,
  ja: `NeeDo 加盟店サービス規約・契約

効力発生日：2026年9月8日

申請者は、店舗表示、法人又は個人の申請主体、代表者、証明書類、銀行口座及び連絡先が正確であることを表明します。法人申請には法人登記資料と代表者の本人確認資料が必要で、個人申請には現行ポリシーに従った eKYC が必要です。口座名義は入力内容どおりに登録し、申請者名、代表者名又は法人名との一致判定は行いません。

標準月額料金は 9,800 円です。運営承認日を権限開始日とし、開始月の残日数が15日未満の場合は当該残期間を追加無料期間として、その後3暦月を試用期間とします。残日数がちょうど15日又は15日を超える場合は開始月を試用第1月として数えます。8月20日開始なら9月から11月が3か月の試用で12月1日から課金、8月10日開始なら8月から10月が試用で11月1日から課金です。

加盟店は法令を守り、正確なサービス、価格、予約、従業者及び営業情報を維持します。NeeDo は申請を審査し、承認時に店舗、加盟店アカウント、権限及び課金情報を作成します。契約証跡には版、本文、ハッシュ、時刻、言語、認証済みセッション識別子及び受領番号を保存し、IP アドレスは保存しません。違法、不正、重大違反、安全上の危険、未払い又は法令上の要請がある場合、利用を制限、停止又は終了できます。本契約は日本法に準拠し、強行的消費者保護規定を優先します。

最終確認：申請主体を代表する権限を有し、料金規則と NeeDo 契約を全文確認し、電子契約及び店舗申請の提出に同意します。`,
  en: `NeeDo Merchant Service Rules and Agreement

Effective date: 8 September 2026

The applicant represents that the shop display, legal or individual applicant, representative, documents, bank account, and contact details are accurate. Corporate applications require corporate registration and representative identity evidence, while individual applications require eKYC under the current platform policy. The account holder is recorded as entered and is not compared with the applicant, representative, or legal entity name.

The standard monthly fee is JPY 9,800. Operations approval is the activation date. If fewer than 15 days remain in that month, the remainder is an extra free period and the following three full calendar months are the trial. If exactly 15 or more days remain, the activation month is trial month one. An activation on 20 August is followed by full trial months September to November and billing from 1 December. An activation on 10 August counts August to October and bills from 1 November.

The merchant must comply with applicable law and maintain accurate service, pricing, booking, workforce, and business information. NeeDo may review, approve, or reject the application and creates the shop, merchant account, identity, role, and billing records only after approval. Evidence records the version, exact text, hash, time, language, authenticated session identifier, and receipt identifier, but no IP address. Access may be restricted, suspended, or terminated for illegality, fraud, material breach, security risk, non-payment, or regulatory requirement. Japanese law applies, subject to mandatory consumer protections.

Final confirmation: I am authorized to represent the applicant, have read and understood the fee rules and complete NeeDo agreement, confirm the information is accurate, and agree electronically to submit the merchant application.`
};

export interface LegalDocumentBootstrapRecord {
  slug: "merchant-agreement" | "affiliate-agreement";
  name: string;
  internalPath: string;
  displayLocations: string[];
  isEnabled: true;
  contractType: ContractType;
  titles: Readonly<Record<SupportedContractLanguage, string>>;
  bodies: Readonly<Record<SupportedContractLanguage, string>>;
  version: number;
  publishedAt: Date;
}

export const LEGAL_DOCUMENT_BOOTSTRAP: readonly LegalDocumentBootstrapRecord[] = [
  {
    slug: "merchant-agreement",
    name: "NeeDo Merchant Service Rules and Agreement",
    internalPath: "/me/settings/merchant-agreement",
    displayLocations: ["merchant-application"],
    isEnabled: true,
    contractType: "merchant",
    titles: {
      "zh-CN": "NeeDo 商户服务规则及合同",
      ja: "NeeDo 加盟店サービス規約・契約",
      en: "NeeDo Merchant Service Rules and Agreement"
    },
    bodies: MERCHANT_CONTRACT_TEXT,
    version: 2,
    publishedAt: MERCHANT_CONTRACT_EFFECTIVE_AT
  },
  {
    slug: "affiliate-agreement",
    name: "NeeDo Affiliate Marketing Rules and Agreement",
    internalPath: "/me/settings/affiliate-agreement",
    displayLocations: ["affiliate-activation"],
    isEnabled: true,
    contractType: "affiliate",
    titles: {
      "zh-CN": "NeeDo 联盟营销规则及合同",
      ja: "NeeDo アフィリエイトマーケティング規約・契約",
      en: "NeeDo Affiliate Marketing Rules and Agreement"
    },
    bodies: AFFILIATE_CONTRACT_TEXT,
    version: 1,
    publishedAt: LEGAL_CONTRACT_EFFECTIVE_AT
  }
];
