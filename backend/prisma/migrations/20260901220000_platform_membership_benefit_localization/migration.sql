ALTER TABLE `platform_membership_benefits`
  ADD COLUMN `name_translations` JSON NULL AFTER `is_globally_enabled`,
  ADD COLUMN `description_translations` JSON NULL AFTER `name_translations`;

UPDATE `platform_membership_benefits`
SET
  `name_translations` = CASE `code`
    WHEN 'NDP_EXPERIENCE' THEN JSON_OBJECT('zh','NDP消费经验','zh-Hant','NDP消費經驗','ja','NDP利用経験値','en','NDP experience','ko','NDP 경험치')
    WHEN 'MEMBER_SIGN_IN' THEN JSON_OBJECT('zh','会员签到','zh-Hant','會員簽到','ja','会員チェックイン','en','Member check-in','ko','회원 체크인')
    WHEN 'PRIORITY_REQUEST' THEN JSON_OBJECT('zh','优先下单','zh-Hant','優先下單','ja','優先リクエスト','en','Priority request','ko','우선 요청')
    WHEN 'SUPPORT_SERVICE' THEN JSON_OBJECT('zh','专属客服','zh-Hant','專屬客服','ja','専用サポート','en','Dedicated support','ko','전담 지원')
    WHEN 'EXCLUSIVE_DISCOUNT' THEN JSON_OBJECT('zh','专属优惠','zh-Hant','專屬優惠','ja','会員限定割引','en','Exclusive discounts','ko','전용 할인')
    WHEN 'MEMBER_DAY' THEN JSON_OBJECT('zh','会员日','zh-Hant','會員日','ja','会員デー','en','Member day','ko','회원의 날')
    ELSE JSON_OBJECT('zh','生日礼','zh-Hant','生日禮','ja','誕生日ギフト','en','Birthday gift','ko','생일 선물')
  END,
  `description_translations` = CASE `code`
    WHEN 'NDP_EXPERIENCE' THEN JSON_OBJECT('zh','消费NDP可获得基础经验，并按会员倍率计算。','zh-Hant','消費NDP可獲得基礎經驗，並依會員倍率計算。','ja','NDP利用で基礎経験値を獲得し、会員倍率を適用します。','en','Earn base EXP from NDP spending with the membership multiplier applied.','ko','NDP 사용으로 기본 경험치를 얻고 회원 배율을 적용합니다.')
    WHEN 'MEMBER_SIGN_IN' THEN JSON_OBJECT('zh','每日成功登录后获得签到经验。','zh-Hant','每日成功登入後獲得簽到經驗。','ja','毎日のログイン成功時にチェックイン経験値を獲得します。','en','Earn check-in EXP after a successful daily login.','ko','매일 로그인 성공 시 체크인 경험치를 받습니다.')
    WHEN 'PRIORITY_REQUEST' THEN JSON_OBJECT('zh','Request时在符合条件的候选中优先排序。','zh-Hant','Request時在符合條件的候選中優先排序。','ja','Request時に条件を満たす候補内で優先表示します。','en','Prioritize eligible candidates when placing a Request.','ko','Request 시 조건에 맞는 후보에서 우선 정렬합니다.')
    WHEN 'SUPPORT_SERVICE' THEN JSON_OBJECT('zh','会员有效期间提供NeeDo专属客服入口。','zh-Hant','會員有效期間提供NeeDo專屬客服入口。','ja','会員期間中にNeeDo専用サポート窓口を提供します。','en','Provides a NeeDo dedicated support entry while membership is active.','ko','회원 기간 동안 NeeDo 전담 지원 창구를 제공합니다.')
    WHEN 'EXCLUSIVE_DISCOUNT' THEN JSON_OBJECT('zh','不定期由专属客服发放会员优惠券。','zh-Hant','不定期由專屬客服發放會員優惠券。','ja','専用サポートから会員限定クーポンを不定期配布します。','en','Dedicated support may issue member-only coupons from time to time.','ko','전담 지원에서 회원 전용 쿠폰을 비정기적으로 지급합니다.')
    WHEN 'MEMBER_DAY' THEN JSON_OBJECT('zh','会员日可获得当期公布的专属福利。','zh-Hant','會員日可獲得當期公佈的專屬福利。','ja','会員デーに当期告知された限定特典を利用できます。','en','Receive the exclusive benefits announced for each member day.','ko','회원의 날에 공지된 전용 혜택을 받을 수 있습니다.')
    ELSE JSON_OBJECT('zh','生日可获得当期规则规定的专属礼品。','zh-Hant','生日可獲得當期規則規定的專屬禮品。','ja','誕生日に当期ルールで定めた限定ギフトを受け取れます。','en','Receive the birthday gift defined by the current program rules.','ko','생일에 해당 기간 규정에 따른 전용 선물을 받을 수 있습니다.')
  END;

ALTER TABLE `platform_membership_benefits`
  MODIFY COLUMN `name_translations` JSON NOT NULL,
  MODIFY COLUMN `description_translations` JSON NOT NULL;
