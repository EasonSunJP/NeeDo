import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppIcon, FeatureSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { FloatingHomeHeader } from "../../components/mobile/FloatingHomeHeader";
import { merchantNavItems } from "../../components/mobile/navItems";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { cn, yen } from "../../lib/utils";
import { MEMBER_ANALYTICS_DIMENSIONS, getMemberAnalyticsGroup, getShopMemberAnalytics, getShopMemberOverview } from "./analytics";
import { FEATURE_SHOP_MEMBER_SYSTEM } from "./config";
import { filterShopMembers, getCardLedgerTotal, getMemberActiveCards, getTemplateIssuedCount } from "./service";
import {
  consumeShopMemberCardRecord,
  createShopMemberRecord,
  freezeShopMemberCardRecord,
  issueShopMemberCardRecord,
  requestShopMemberCardRefundRecord,
  topupShopMemberCardRecord,
  unfreezeShopMemberCardRecord,
  updateShopMemberCardTemplateRecord,
  useShopMemberStore
} from "./store";
import type {
  ShopMember,
  ShopMemberAnalyticsDimension,
  ShopMemberCard,
  ShopMemberCardTemplate,
  ShopMemberLedgerType,
  ShopMemberListFilters,
  ShopMemberSnapshot,
  ShopMemberSource
} from "./types";

type MemberSection = "overview" | "members" | "cards" | "verify" | "analytics";
type ToastState = { tone: "green" | "red" | "blue"; message: string } | null;
type IssueEntryMode = "id" | "qr" | "contacts";
type TemplateEditDraft = {
  name: string;
  note: string;
  principalAmount: string;
  bonusAmount: string;
};

const shopId = "store-1";
const operatorId = "merchant-admin";
const basePath = "/shop/member";

const sectionTabs: Array<{ label: string; value: MemberSection }> = [
  { label: "概览", value: "overview" },
  { label: "会员", value: "members" },
  { label: "会员卡", value: "cards" },
  { label: "核销", value: "verify" },
  { label: "分析", value: "analytics" }
];

const sourceLabels: Record<ShopMemberSource, string> = {
  walk_in: "上门客",
  staff_referral: "员工转介绍",
  member_referral: "会员转介绍",
  store_acquisition: "门店拓客",
  platform: "平台导入",
  line: "LINE",
  legacy_meiyi: "美矣",
  other: "其他",
  unknown: "未知"
};

const cardStatusLabels: Record<ShopMemberCard["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "有效", tone: "green" },
  frozen: { label: "冻结", tone: "blue" },
  expired: { label: "过期", tone: "yellow" },
  used_up: { label: "已用完", tone: "neutral" },
  refunding: { label: "退款中", tone: "red" },
  refunded: { label: "已退款", tone: "neutral" },
  cancelled: { label: "已取消", tone: "neutral" }
};

const ledgerTypeLabels: Record<ShopMemberLedgerType, string> = {
  OPEN_CARD: "开卡",
  TOP_UP: "充值",
  BONUS_GRANT: "赠送",
  CONSUME_PRINCIPAL: "扣本金",
  CONSUME_BONUS: "扣赠送",
  CONSUME_TIMES: "扣次数",
  REFUND_REQUEST: "退款申请",
  REFUND_APPROVE: "退款审批",
  REFUND_REJECT: "退款拒绝",
  EXPIRE: "过期",
  ADJUST_ADD: "手动调增",
  ADJUST_DEDUCT: "手动调减",
  FREEZE: "冻结",
  UNFREEZE: "解冻",
  TRANSFER_OUT: "转出",
  TRANSFER_IN: "转入",
  CANCEL_CONSUME: "撤销核销"
};

function resolveSection(value?: string): MemberSection {
  if (value === "members" || value === "cards" || value === "verify" || value === "analytics") {
    return value;
  }

  return "overview";
}

function sectionPath(section: MemberSection) {
  return section === "overview" ? basePath : `${basePath}/${section}`;
}

function MemberCenterHeaderTabs({
  value,
  onChange
}: {
  value: MemberSection;
  onChange: (value: MemberSection) => void;
}) {
  return (
    <FloatingHomeHeader
      className="relative z-10"
      panelClassName="relative overflow-hidden border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_92%,transparent),color-mix(in_srgb,var(--client-bg)_72%,var(--client-primary)_12%))] shadow-[0_18px_40px_rgba(0,0,0,0.1)]"
    >
      <FeatureSegmentedTabs items={sectionTabs} onChange={onChange} value={value} variant="header" />
    </FloatingHomeHeader>
  );
}

function formatDateMinute(value?: string) {
  if (!value) {
    return "未记录";
  }

  return value.replace("2026-", "").replace(" ", " · ");
}

function getMemberLevel(snapshot: ShopMemberSnapshot, member: ShopMember) {
  return snapshot.levels.find((level) => level.id === member.levelId)?.name ?? "普通会员";
}

function getCardTemplate(snapshot: ShopMemberSnapshot, card: ShopMemberCard) {
  return snapshot.templates.find((template) => template.id === card.templateId);
}

function getCardTemplateLabel(template?: ShopMemberCardTemplate) {
  if (!template) {
    return "会员卡";
  }

  if (template.cardType === "times") {
    return `${template.name} · ${template.totalTimes} 次`;
  }

  if (template.cardType === "stored_value") {
    return `${template.name} · 储值`;
  }

  return template.name;
}

function getTemplateNote(template: ShopMemberCardTemplate) {
  return template.note?.trim() || template.serviceScope.join(" / ");
}

function getTemplateTotalAmount(template: ShopMemberCardTemplate) {
  return template.principalAmount + template.bonusAmount;
}

function createTemplateEditDraft(template: ShopMemberCardTemplate): TemplateEditDraft {
  return {
    name: template.name,
    note: getTemplateNote(template),
    principalAmount: String(template.principalAmount),
    bonusAmount: String(template.bonusAmount)
  };
}

function parseAmount(value: string) {
  const normalized = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(normalized) ? Math.round(normalized) : Number.NaN;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function getMemberSearchTarget(member: ShopMember) {
  return [
    member.id,
    member.needoUserId,
    member.name,
    member.nickname,
    member.phoneEncrypted,
    member.phoneHash,
    member.lineId,
    ...member.tags
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findMemberForIssue(snapshot: ShopMemberSnapshot, query: string) {
  const normalized = normalizeSearchText(query);

  if (!normalized) {
    return undefined;
  }

  return snapshot.members.find((member) => !member.deletedAt && getMemberSearchTarget(member).includes(normalized));
}

function getCardMemberName(snapshot: ShopMemberSnapshot, card: ShopMemberCard) {
  const member = snapshot.members.find((item) => item.id === card.memberId);
  const metadataName = typeof card.metadata.issuedMemberName === "string" ? card.metadata.issuedMemberName : undefined;

  return member?.name ?? metadataName ?? "未知会员";
}

function getCardAssetLabel(card: ShopMemberCard) {
  if (card.cardType === "times" || card.cardType === "trial") {
    return `剩余 ${card.remainingTimes} 次`;
  }

  if (card.cardType === "discount" || card.cardType === "benefit") {
    return `本金 ${yen(card.principalBalance)}`;
  }

  return `余额 ${yen(card.principalBalance + card.bonusBalance)}`;
}

function runAction(setToast: (toast: ToastState) => void, action: () => string) {
  try {
    setToast({ tone: "green", message: action() });
  } catch (error) {
    setToast({ tone: "red", message: error instanceof Error ? error.message : "操作失败" });
  }
}

function ToastDialog({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(onClose, toast.tone === "red" ? 2600 : 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [onClose, toast]);

  if (!toast) {
    return null;
  }

  const toneClass =
    toast.tone === "red"
      ? "border-coral/55 text-coral"
      : toast.tone === "blue"
      ? "border-sky/55 text-sky"
      : "border-mint/55 text-mint";

  return (
    <div
      aria-live="polite"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/58 px-6 backdrop-blur-md"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "w-full max-w-[320px] rounded-[28px] border bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-primary)_12%)] px-5 py-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.42)]",
          toneClass
        )}
        onClick={(event) => event.stopPropagation()}
        role="status"
      >
        <p className="text-[17px] font-black leading-7 text-[color:var(--client-text)]">{toast.message}</p>
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "dark" }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[18px] border border-transparent px-2.5 py-3",
        tone === "dark"
          ? "bg-white/[0.048] text-white shadow-[0_3px_7px_rgba(0,0,0,0.018)]"
          : "border-transparent bg-paper text-ink"
      )}
    >
      <p className={cn("truncate text-[11px] font-black leading-4", tone === "dark" ? "text-white/72" : "text-ink/45")}>{label}</p>
      <strong className="mt-1 block truncate text-base font-black leading-5">{value}</strong>
    </div>
  );
}

function MemberRow({
  member,
  snapshot,
  selected,
  onSelect,
  onIssue
}: {
  member: ShopMember;
  snapshot: ShopMemberSnapshot;
  selected?: boolean;
  onSelect: () => void;
  onIssue: () => void;
}) {
  const activeCards = getMemberActiveCards(snapshot, member.id);

  return (
    <article className={cn("rounded-[24px] border bg-white p-3 shadow-panel", selected ? "border-[color:var(--client-primary)]" : "border-line")}>
      <button className="flex w-full items-start gap-3 text-left" onClick={onSelect} type="button">
        <AvatarImage alt={member.name} className="h-14 w-14 shrink-0 rounded-[20px]" src={member.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-black text-ink">{member.name}</h3>
            <Badge tone={member.riskStatus === "watch" ? "yellow" : "green"}>{member.riskStatus === "watch" ? "关注" : "正常"}</Badge>
          </div>
          <p className="mt-1 text-xs font-bold text-ink/50">{getMemberLevel(snapshot, member)} · {sourceLabels[member.source]}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {member.tags.slice(0, 3).map((tag) => (
              <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[11px] font-bold text-ink/55" key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <strong className="block text-sm font-black text-[color:var(--client-primary)]">{activeCards.length} 卡</strong>
          <span className="mt-1 block text-[11px] font-bold text-ink/45">{formatDateMinute(member.lastVisitAt)}</span>
        </div>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" onClick={onIssue}>开卡</Button>
        <Button size="sm" variant="secondary" onClick={onSelect}>查看详情</Button>
      </div>
    </article>
  );
}

function CardRow({
  card,
  snapshot,
  onTopup,
  onFreeze,
  onRefund,
  selected,
  onSelect
}: {
  card: ShopMemberCard;
  snapshot: ShopMemberSnapshot;
  onTopup?: () => void;
  onFreeze?: () => void;
  onRefund?: () => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const template = getCardTemplate(snapshot, card);
  const status = cardStatusLabels[card.status];

  return (
    <article className={cn("rounded-[24px] border bg-white p-3 shadow-panel", selected ? "border-[color:var(--client-primary)]" : "border-line")}>
      <button className="w-full text-left" onClick={onSelect} type="button">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-black text-ink">{getCardTemplateLabel(template)}</h3>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-xs font-bold text-ink/50">{getCardMemberName(snapshot, card)} · {card.cardNo}</p>
          </div>
          <strong className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">{getCardAssetLabel(card)}</strong>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <KpiTile label="本金" value={yen(card.principalBalance)} />
          <KpiTile label="赠送" value={yen(card.bonusBalance)} />
          <KpiTile label="有效期" value={formatDateMinute(card.expireAt)} />
        </div>
      </button>
      {(onTopup || onFreeze || onRefund) ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {onTopup ? <Button size="sm" variant="secondary" onClick={onTopup}>充值</Button> : <span />}
          {onFreeze ? <Button size="sm" variant="secondary" onClick={onFreeze}>{card.status === "frozen" ? "解冻" : "冻结"}</Button> : <span />}
          {onRefund ? <Button size="sm" variant="secondary" onClick={onRefund}>退款申请</Button> : <span />}
        </div>
      ) : null}
    </article>
  );
}

function LedgerList({ snapshot, cardId, memberId }: { snapshot: ShopMemberSnapshot; cardId?: string; memberId?: string }) {
  const ledgers = snapshot.ledgers
    .filter((ledger) => (!cardId || ledger.cardId === cardId) && (!memberId || ledger.memberId === memberId))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  if (ledgers.length === 0) {
    return <div className="rounded-[20px] bg-paper px-4 py-5 text-center text-sm font-bold text-ink/45">暂无账本流水。</div>;
  }

  return (
    <div className="space-y-2">
      {ledgers.map((ledger) => (
        <div className="flex items-center justify-between gap-3 rounded-[18px] bg-paper px-3 py-3" key={ledger.id}>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-ink">{ledgerTypeLabels[ledger.type]}</p>
            <p className="mt-1 truncate text-xs font-bold text-ink/45">{ledger.reason} · {formatDateMinute(ledger.createdAt)}</p>
          </div>
          <div className="shrink-0 text-right">
            <strong className={cn("text-sm font-black", ledger.amountDelta < 0 || ledger.timesDelta < 0 ? "text-coral" : "text-[color:var(--client-primary)]")}>
              {ledger.timesDelta !== 0 ? `${ledger.timesDelta > 0 ? "+" : ""}${ledger.timesDelta} 次` : `${ledger.amountDelta > 0 ? "+" : ""}${yen(ledger.amountDelta)}`}
            </strong>
            <p className="mt-1 text-[11px] font-bold text-ink/40">{ledger.operatorId}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberDetailPanel({ member, snapshot, setToast }: { member: ShopMember; snapshot: ShopMemberSnapshot; setToast: (toast: ToastState) => void }) {
  const cards = snapshot.cards.filter((card) => card.memberId === member.id);
  const coupons = snapshot.coupons.filter((coupon) => coupon.memberId === member.id);

  return (
    <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
      <SectionTitle caption="基础资料、当前持卡、优惠券、核销流水和敏感备注集中在同一页。" title="会员详情">
        <Badge tone="blue">{member.phoneEncrypted}</Badge>
      </SectionTitle>
      <div className="flex items-start gap-3">
        <AvatarImage alt={member.name} className="h-16 w-16 shrink-0 rounded-[22px]" src={member.avatarUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-black text-ink">{member.name}</h3>
          <p className="mt-1 text-sm font-bold text-ink/55">{getMemberLevel(snapshot, member)} · 最近到店 {formatDateMinute(member.lastVisitAt)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {member.tags.map((tag) => (
              <span className="rounded-full bg-mint/15 px-2 py-1 text-[11px] font-bold text-[#2f6846]" key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      </div>
      {member.notePrivate ? <div className="mt-3 rounded-[18px] bg-lemon/18 px-3 py-3 text-xs font-bold leading-5 text-[#795b00]">内部备注：{member.notePrivate}</div> : null}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <KpiTile label="消费次数" value={`${member.totalOrders} 次`} />
        <KpiTile label="累计消费" value={yen(member.totalSpend)} />
        <KpiTile label="优惠券" value={`${coupons.length} 张`} />
      </div>
      <div className="mt-4 space-y-3">
        {cards.map((card) => (
          <CardRow
            card={card}
            key={card.id}
            onTopup={card.cardType === "stored_value" ? () => runAction(setToast, () => {
              topupShopMemberCardRecord({
                cardId: card.id,
                principalAmount: 10000,
                bonusAmount: 1000,
                operatorId,
                paymentMethod: "offline_pos",
                paymentRef: `POS-${Date.now()}`,
                reason: "会员详情快捷充值"
              });
              return `${member.name} 已充值 10,000 円，赠送 1,000 円。`;
            }) : undefined}
            snapshot={snapshot}
          />
        ))}
      </div>
      <div className="mt-4">
        <SectionTitle caption="所有余额、次数和状态变化都会写入 CardLedger。" title="核销流水" />
        <LedgerList memberId={member.id} snapshot={snapshot} />
      </div>
    </section>
  );
}

function OverviewScreen({ snapshot, setToast, openSection }: { snapshot: ShopMemberSnapshot; setToast: (toast: ToastState) => void; openSection: (section: MemberSection) => void }) {
  const overview = getShopMemberOverview(snapshot, shopId);
  const primaryTemplate = snapshot.templates.find((template) => template.status === "active");
  const primaryMember = snapshot.members[0];

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[radial-gradient(circle_at_20%_18%,rgba(124,109,242,0.36),transparent_34%),linear-gradient(145deg,#17172d_0%,#22214a_54%,#11121e_100%)] p-4 text-white shadow-panel">
        <TitleWithInfo
          as="h2"
          info="店铺私域会员、会员卡账本、核销和经营提醒集中在这里；平台 NDP 主账本不会被这里的卡余额抵扣。"
          label="会员中心说明"
          title="会员中心"
          titleClassName="text-[28px] font-black tracking-[-0.04em] text-white"
          variant="dark"
        />
        <div className="mt-4 grid grid-cols-4 gap-2">
          <KpiTile label="有效会员" tone="dark" value={`${overview.activeMemberCount}`} />
          <KpiTile label="今日新增" tone="dark" value={`${overview.todayNewMemberCount}`} />
          <KpiTile label="今日核销" tone="dark" value={`${overview.todayVerifyCount}`} />
          <KpiTile label="即将到期" tone="dark" value={`${overview.expiringSoonCards}`} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <KpiTile label="今日开卡" tone="dark" value={yen(overview.todayOpenIncome)} />
          <KpiTile label="今日充值" tone="dark" value={yen(overview.todayTopupIncome)} />
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="手机端常用动作保持一屏可达，方便店长、前台和财务每天使用。" title="快捷动作" />
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "扫码核销", icon: "search" as const, onClick: () => openSection("verify") },
            { label: "开通会员", icon: "plus" as const, onClick: () => openSection("members") },
            {
              label: "会员充值",
              icon: "star" as const,
              onClick: () => {
                const card = snapshot.cards.find((item) => item.cardType === "stored_value" && item.status === "active");
                if (!card) {
                  setToast({ tone: "red", message: "暂无可充值的储值卡。" });
                  return;
                }
                runAction(setToast, () => {
                  topupShopMemberCardRecord({
                    cardId: card.id,
                    principalAmount: 10000,
                    bonusAmount: 1000,
                    operatorId,
                    paymentMethod: "offline_pos",
                    paymentRef: `POS-${Date.now()}`,
                    reason: "首页快捷充值"
                  });
                  return "已完成储值卡快捷充值，并写入 TOP_UP / BONUS_GRANT 流水。";
                });
              }
            },
            { label: "发优惠券", icon: "bell" as const, onClick: () => setToast({ tone: "blue", message: "已生成优惠券提醒任务，V1 会进入一键发送流程。" }) }
          ].map((item) => (
            <button
              className="focus-ring grid min-h-[88px] content-center justify-items-center gap-2 rounded-[20px] border border-line bg-paper px-2 py-3 text-center transition hover:border-[color:var(--client-primary)]"
              key={item.label}
              onClick={item.onClick}
              type="button"
            >
              <span className="grid h-10 w-10 place-items-center rounded-[16px] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
                <AppIcon className="h-5 w-5" name={item.icon} />
              </span>
              <span className="text-[12px] font-black leading-4 text-ink">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="到期、低余额、沉默客和退款申请会先生成提醒任务。" title="智能提醒" />
        <div className="space-y-2">
          {snapshot.reminders.map((reminder) => (
            <div className="flex items-start justify-between gap-3 rounded-[20px] bg-paper px-3 py-3" key={reminder.id}>
              <div className="min-w-0">
                <p className="text-sm font-black text-ink">{reminder.title}</p>
                <p className="mt-1 text-xs font-bold leading-5 text-ink/50">{reminder.detail}</p>
              </div>
              <Badge tone={reminder.severity === "danger" ? "red" : reminder.severity === "warning" ? "yellow" : "blue"}>{reminder.actionLabel}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="最近会员动作直接来自会员卡账本和操作记录。" title="今日动态" />
        <div className="space-y-2">
          {snapshot.activities.slice(0, 5).map((activity) => (
            <div className="rounded-[20px] bg-paper px-3 py-3" key={activity.id}>
              <p className="text-sm font-black text-ink">{activity.title}</p>
              <p className="mt-1 text-xs font-bold text-ink/50">{activity.detail} · {formatDateMinute(activity.at)}</p>
            </div>
          ))}
        </div>
      </section>

      {primaryMember && primaryTemplate ? (
        <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
          <SectionTitle caption="从卡模板进入开卡流程后，再选择 ID、二维码或通讯录会员。" title="开卡演示">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openSection("cards")}
            >
              {yen(getTemplateTotalAmount(primaryTemplate))} 开卡
            </Button>
          </SectionTitle>
        </section>
      ) : null}
    </>
  );
}

function MembersScreen({ snapshot, setToast }: { snapshot: ShopMemberSnapshot; setToast: (toast: ToastState) => void }) {
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState<ShopMemberSource | "all">("all");
  const [selectedMemberId, setSelectedMemberId] = useState(snapshot.members[0]?.id ?? "");
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const members = useMemo(() => filterShopMembers(snapshot, { keyword, source }), [keyword, snapshot, source]);
  const selectedMember = snapshot.members.find((member) => member.id === selectedMemberId) ?? members[0];
  const primaryTemplate = snapshot.templates.find((template) => template.status === "active");

  const issueToMember = (member: ShopMember) => {
    if (!primaryTemplate) {
      setToast({ tone: "red", message: "暂无可用会员卡模板。" });
      return;
    }

    runAction(setToast, () => {
      issueShopMemberCardRecord({
        memberId: member.id,
        templateId: primaryTemplate.id,
        operatorId,
        paymentMethod: "offline_pos",
        paymentRef: `POS-${Date.now()}`
      });
      return `${member.name} 已开通 ${primaryTemplate.name}。`;
    });
  };

  return (
    <>
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="姓名、手机号、LINE、卡号和标签都可以作为检索入口。" title="会员搜索与筛选" />
        <input
          className="h-12 w-full rounded-full border border-line bg-paper px-4 text-sm font-bold outline-none focus:border-[color:var(--client-primary)]"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="姓名 / 手机号 / LINE / 标签"
          value={keyword}
        />
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
          {(["all", "walk_in", "member_referral", "staff_referral", "line", "legacy_meiyi"] as Array<ShopMemberSource | "all">).map((item) => (
            <button
              className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-black", source === item ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]" : "border-line bg-white text-ink/55")}
              key={item}
              onClick={() => setSource(item)}
              type="button"
            >
              {item === "all" ? "全部来源" : sourceLabels[item]}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="客户不存在时可以先创建会员，然后继续开卡。" title="新建会员" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="h-11 rounded-full border border-line bg-paper px-4 text-sm font-bold outline-none focus:border-[color:var(--client-primary)]"
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="会员姓名"
            value={draftName}
          />
          <input
            className="h-11 rounded-full border border-line bg-paper px-4 text-sm font-bold outline-none focus:border-[color:var(--client-primary)]"
            onChange={(event) => setDraftPhone(event.target.value)}
            placeholder="+81 80-0000-0000"
            value={draftPhone}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => runAction(setToast, () => {
              const next = createShopMemberRecord({
                shopId,
                name: draftName || "新会员",
                phone: draftPhone || `+81 80-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
                operatorId,
                source: "walk_in",
                tags: ["新客"]
              });
              const created = next.members[0];
              setSelectedMemberId(created?.id ?? "");
              setDraftName("");
              setDraftPhone("");
              return `${created?.name ?? "新会员"} 已创建。`;
            })}
          >
            保存会员
          </Button>
          <Button
            onClick={() => runAction(setToast, () => {
              if (!primaryTemplate) {
                throw new Error("暂无可用会员卡模板");
              }
              const next = createShopMemberRecord({
                shopId,
                name: draftName || "新会员",
                phone: draftPhone || `+81 80-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
                operatorId,
                source: "walk_in",
                tags: ["新客", "待跟进"]
              });
              const created = next.members[0];
              if (!created) {
                throw new Error("会员创建失败");
              }
              issueShopMemberCardRecord({
                memberId: created.id,
                templateId: primaryTemplate.id,
                operatorId,
                paymentMethod: "offline_pos",
                paymentRef: `POS-${Date.now()}`
              });
              setSelectedMemberId(created.id);
              setDraftName("");
              setDraftPhone("");
              return `${created.name} 已创建并开通 ${primaryTemplate.name}。`;
            })}
          >
            保存并开卡
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            onIssue={() => issueToMember(member)}
            onSelect={() => setSelectedMemberId(member.id)}
            selected={selectedMember?.id === member.id}
            snapshot={snapshot}
          />
        ))}
      </section>

      {selectedMember ? <MemberDetailPanel member={selectedMember} setToast={setToast} snapshot={snapshot} /> : null}
    </>
  );
}

function TemplateCard({
  template,
  snapshot,
  setToast,
  onIssue
}: {
  template: ShopMemberCardTemplate;
  snapshot: ShopMemberSnapshot;
  setToast: (toast: ToastState) => void;
  onIssue: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TemplateEditDraft>(() => createTemplateEditDraft(template));
  const issuedCount = getTemplateIssuedCount(snapshot, template.id);

  useEffect(() => {
    if (!editing) {
      setDraft(createTemplateEditDraft(template));
    }
  }, [editing, template]);

  const saveTemplate = () => {
    runAction(setToast, () => {
      const principalAmount = parseAmount(draft.principalAmount);
      const bonusAmount = parseAmount(draft.bonusAmount);

      updateShopMemberCardTemplateRecord({
        templateId: template.id,
        operatorId,
        name: draft.name,
        note: draft.note,
        principalAmount,
        bonusAmount
      });
      setEditing(false);

      return `${draft.name.trim()} 已保存。`;
    });
  };

  return (
    <article className="relative rounded-[24px] border border-line bg-white p-4 shadow-panel">
      <button
        aria-label="编辑卡模板"
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-ink/62 transition hover:border-[color:var(--client-primary)] hover:text-[color:var(--client-primary)]"
        onClick={() => setEditing((value) => !value)}
        type="button"
      >
        <AppIcon className="h-4.5 w-4.5" name="edit" />
      </button>

      {editing ? (
        <div className="space-y-3 pr-10">
          <label className="block">
            <span className="mb-1 block text-[11px] font-black text-ink/45">名字</span>
            <input
              className="h-11 w-full rounded-2xl border border-line bg-paper px-3 text-sm font-bold text-ink outline-none focus:border-[color:var(--client-primary)]"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              value={draft.name}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-black text-ink/45">注释</span>
            <textarea
              className="min-h-20 w-full resize-none rounded-2xl border border-line bg-paper px-3 py-2 text-sm font-bold leading-5 text-ink outline-none focus:border-[color:var(--client-primary)]"
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              value={draft.note}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-black text-ink/45">本金</span>
              <input
                className="h-11 w-full rounded-2xl border border-line bg-paper px-3 text-sm font-bold text-ink outline-none focus:border-[color:var(--client-primary)]"
                inputMode="numeric"
                onChange={(event) => setDraft((current) => ({ ...current, principalAmount: event.target.value }))}
                value={draft.principalAmount}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-black text-ink/45">赠送额</span>
              <input
                className="h-11 w-full rounded-2xl border border-line bg-paper px-3 text-sm font-bold text-ink outline-none focus:border-[color:var(--client-primary)]"
                inputMode="numeric"
                onChange={(event) => setDraft((current) => ({ ...current, bonusAmount: event.target.value }))}
                value={draft.bonusAmount}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={() => {
              setDraft(createTemplateEditDraft(template));
              setEditing(false);
            }}>
              取消
            </Button>
            <Button size="sm" onClick={saveTemplate}>
              保存
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 pr-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-black text-ink">{template.name}</h3>
                <Badge tone={template.status === "active" ? "green" : "neutral"}>{template.status === "active" ? "启用" : "停用"}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-ink/50">{getTemplateNote(template)}</p>
            </div>
            <strong className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">{yen(getTemplateTotalAmount(template))}</strong>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <KpiTile label="本金" value={yen(template.principalAmount)} />
            <KpiTile label="赠送" value={yen(template.bonusAmount)} />
            <KpiTile label="已发行" value={`${issuedCount} 张`} />
          </div>
          <Button
            className="mt-3 w-full"
            size="sm"
            variant="secondary"
            onClick={onIssue}
          >
            {yen(getTemplateTotalAmount(template))} 开卡
          </Button>
        </>
      )}
    </article>
  );
}

function IssueCardDialog({
  template,
  snapshot,
  setToast,
  onClose
}: {
  template: ShopMemberCardTemplate;
  snapshot: ShopMemberSnapshot;
  setToast: (toast: ToastState) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<IssueEntryMode>("id");
  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const activeMembers = snapshot.members.filter((member) => !member.deletedAt);
  const normalizedQuery = normalizeSearchText(query);
  const queryMember = findMemberForIssue(snapshot, query);
  const selectedMember = activeMembers.find((member) => member.id === selectedMemberId);
  const targetMember = mode === "contacts" ? selectedMember : queryMember ?? selectedMember;
  const filteredMembers = activeMembers.filter((member) => {
    if (!normalizedQuery) {
      return true;
    }

    return getMemberSearchTarget(member).includes(normalizedQuery);
  });

  const selectMember = (member: ShopMember) => {
    setSelectedMemberId(member.id);
    setQuery(member.needoUserId ?? member.id);
  };

  const simulateQrScan = () => {
    const member = queryMember ?? activeMembers[0];

    if (!member) {
      setToast({ tone: "red", message: "暂无可开卡会员。" });
      return;
    }

    setMode("qr");
    selectMember(member);
  };

  const confirmIssue = () => {
    runAction(setToast, () => {
      if (!targetMember) {
        throw new Error("请先选择开卡会员");
      }

      issueShopMemberCardRecord({
        memberId: targetMember.id,
        templateId: template.id,
        operatorId,
        paymentMethod: template.principalAmount > 0 ? "offline_pos" : "none",
        paymentRef: template.principalAmount > 0 ? `POS-${Date.now()}` : undefined
      });
      onClose();

      return `${targetMember.name} 已开通 ${template.name}。`;
    });
  };

  return (
    <div className="fixed inset-0 z-[88] bg-black/50 px-4 py-6 backdrop-blur-sm" role="presentation">
      <section className="safe-screen-shell mx-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-ink/42">会员开卡</p>
            <h3 className="truncate text-lg font-black text-ink">{template.name}</h3>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-paper text-ink/60" onClick={onClose} type="button">
            <AppIcon className="h-5 w-5" name="close" />
            <span className="sr-only">关闭</span>
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "输入 ID", value: "id" as const },
              { label: "扫二维码", value: "qr" as const },
              { label: "通讯录", value: "contacts" as const }
            ].map((item) => (
              <button
                aria-pressed={mode === item.value}
                className={cn(
                  "h-10 rounded-full border px-2 text-xs font-black transition",
                  mode === item.value ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]" : "border-line bg-paper text-ink/55"
                )}
                key={item.value}
                onClick={() => setMode(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {mode !== "contacts" ? (
            <section className="mt-4 rounded-[24px] bg-paper p-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-black text-ink/45">{mode === "qr" ? "二维码识别结果" : "会员 ID / 手机号"}</span>
                <input
                  className="h-12 w-full rounded-2xl border border-line bg-white px-3 text-sm font-bold text-ink outline-none focus:border-[color:var(--client-primary)]"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedMemberId("");
                  }}
                  placeholder={mode === "qr" ? "扫描后自动填入，也可手动输入" : "输入会员 ID / NeeDo ID / 手机号"}
                  value={query}
                />
              </label>
              {mode === "qr" ? (
                <Button className="mt-3 w-full" size="sm" variant="secondary" onClick={simulateQrScan}>
                  扫描二维码
                </Button>
              ) : null}
              {queryMember ? (
                <button className="mt-3 flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-left" onClick={() => selectMember(queryMember)} type="button">
                  <AvatarImage alt={queryMember.name} className="h-11 w-11 rounded-[16px]" src={queryMember.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-ink">{queryMember.name}</strong>
                    <p className="mt-1 truncate text-xs font-bold text-ink/45">{queryMember.needoUserId ?? queryMember.id} · {queryMember.phoneEncrypted}</p>
                  </div>
                  <Badge tone="green">选择</Badge>
                </button>
              ) : null}
            </section>
          ) : (
            <section className="mt-4">
              <input
                className="h-12 w-full rounded-full border border-line bg-paper px-4 text-sm font-bold text-ink outline-none focus:border-[color:var(--client-primary)]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索通讯录会员"
                value={query}
              />
              <div className="mt-3 space-y-2">
                {filteredMembers.slice(0, 8).map((member) => (
                  <button
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[22px] border p-3 text-left transition",
                      selectedMemberId === member.id ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]" : "border-line bg-paper"
                    )}
                    key={member.id}
                    onClick={() => selectMember(member)}
                    type="button"
                  >
                    <AvatarImage alt={member.name} className="h-11 w-11 rounded-[16px]" src={member.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-ink">{member.name}</strong>
                      <p className="mt-1 truncate text-xs font-bold text-ink/45">{member.needoUserId ?? member.id} · {sourceLabels[member.source]}</p>
                    </div>
                    <Badge tone={selectedMemberId === member.id ? "green" : "neutral"}>{selectedMemberId === member.id ? "已选" : "选择"}</Badge>
                  </button>
                ))}
                {filteredMembers.length === 0 ? <div className="rounded-[22px] bg-paper px-4 py-8 text-center text-sm font-bold text-ink/45">没有匹配的会员。</div> : null}
              </div>
            </section>
          )}

          <section className="mt-4 rounded-[24px] border border-line bg-white p-3">
            <div className="grid grid-cols-3 gap-2">
              <KpiTile label="本金" value={yen(template.principalAmount)} />
              <KpiTile label="赠送" value={yen(template.bonusAmount)} />
              <KpiTile label="总金额" value={yen(getTemplateTotalAmount(template))} />
            </div>
            {targetMember ? (
              <div className="mt-3 rounded-[18px] bg-mint/12 px-3 py-2 text-sm font-black text-[#2f6846]">{targetMember.name} · {targetMember.needoUserId ?? targetMember.id}</div>
            ) : null}
          </section>
        </main>

        <footer className="border-t border-line bg-white px-4 py-3">
          <Button className="w-full" disabled={!targetMember} onClick={confirmIssue}>
            {yen(getTemplateTotalAmount(template))} 开卡
          </Button>
        </footer>
      </section>
    </div>
  );
}

function CardsScreen({ snapshot, setToast }: { snapshot: ShopMemberSnapshot; setToast: (toast: ToastState) => void }) {
  const [filter, setFilter] = useState<"templates" | "issued" | "expiring" | "exception">("issued");
  const [issueTemplateId, setIssueTemplateId] = useState("");
  const issueTemplate = snapshot.templates.find((template) => template.id === issueTemplateId);
  const cards = snapshot.cards.filter((card) => {
    if (filter === "expiring") {
      return card.expireAt <= "2026-05-13" && card.status === "active";
    }

    if (filter === "exception") {
      return card.status === "frozen" || card.status === "refunding" || card.status === "expired";
    }

    return true;
  });

  return (
    <>
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="卡模板、已发行、即将到期和异常卡都按手机端轻量结构展示。" title="会员卡管理" />
        <FeatureSegmentedTabs
          items={[
            { label: "卡模板", value: "templates" },
            { label: "已发行", value: "issued" },
            { label: "即将到期", value: "expiring" },
            { label: "异常卡", value: "exception" }
          ]}
          onChange={setFilter}
          value={filter}
        />
      </section>

      {filter === "templates" ? (
        <section className="space-y-3">
          {snapshot.templates.map((template) => (
            <TemplateCard
              key={template.id}
              onIssue={() => setIssueTemplateId(template.id)}
              setToast={setToast}
              snapshot={snapshot}
              template={template}
            />
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          {cards.map((card) => (
            <CardRow
              card={card}
              key={card.id}
              onFreeze={() => runAction(setToast, () => {
                if (card.status === "frozen") {
                  unfreezeShopMemberCardRecord({ cardId: card.id, operatorId, reason: "店长二次确认解冻" });
                  return `${card.cardNo} 已解冻，并写入 UNFREEZE 流水。`;
                }
                freezeShopMemberCardRecord({ cardId: card.id, operatorId, reason: "店长二次确认冻结" });
                return `${card.cardNo} 已冻结，并写入 FREEZE 流水与操作日志。`;
              })}
              onRefund={card.principalBalance > 0 ? () => runAction(setToast, () => {
                requestShopMemberCardRefundRecord({
                  cardId: card.id,
                  amount: Math.min(3000, card.principalBalance),
                  operatorId,
                  reason: "客户申请退款，等待店长审批"
                });
                return `${card.cardNo} 已提交退款申请，只锁定本金口径。`;
              }) : undefined}
              onTopup={card.cardType === "stored_value" ? () => runAction(setToast, () => {
                topupShopMemberCardRecord({
                  cardId: card.id,
                  principalAmount: 10000,
                  bonusAmount: 1000,
                  operatorId,
                  paymentMethod: "offline_pos",
                  paymentRef: `POS-${Date.now()}`,
                  reason: "会员卡页充值"
                });
                return `${card.cardNo} 已充值 10,000 円，赠送 1,000 円。`;
              }) : undefined}
              snapshot={snapshot}
            />
          ))}
          {cards.length === 0 ? <div className="rounded-[24px] border border-line bg-white px-4 py-8 text-center text-sm font-bold text-ink/45 shadow-panel">当前分类暂无会员卡。</div> : null}
        </section>
      )}

      {issueTemplate ? (
        <IssueCardDialog
          onClose={() => setIssueTemplateId("")}
          setToast={setToast}
          snapshot={snapshot}
          template={issueTemplate}
        />
      ) : null}
    </>
  );
}

function VerifyScreen({ snapshot, setToast }: { snapshot: ShopMemberSnapshot; setToast: (toast: ToastState) => void }) {
  const [keyword, setKeyword] = useState("");
  const activeCards = snapshot.cards.filter((card) => card.status === "active");
  const filteredCards = activeCards.filter((card) => {
    const member = snapshot.members.find((item) => item.id === card.memberId);
    const template = getCardTemplate(snapshot, card);
    const target = [card.cardNo, member?.name, member?.phoneEncrypted, template?.name].filter(Boolean).join(" ").toLowerCase();
    return target.includes(keyword.trim().toLowerCase());
  });
  const [selectedCardId, setSelectedCardId] = useState(filteredCards[0]?.id ?? activeCards[0]?.id ?? "");
  const selectedCard = snapshot.cards.find((card) => card.id === selectedCardId && card.status === "active") ?? filteredCards[0];
  const selectedMember = selectedCard ? snapshot.members.find((member) => member.id === selectedCard.memberId) : undefined;
  const selectedTemplate = selectedCard ? getCardTemplate(snapshot, selectedCard) : undefined;

  return (
    <>
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="扫码后会解析客户、可用卡、可用券和当前预约；V1 这里用卡号/手机号模拟扫码结果。" title="扫码核销" />
        <input
          className="h-12 w-full rounded-full border border-line bg-paper px-4 text-sm font-bold outline-none focus:border-[color:var(--client-primary)]"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="扫描二维码 / 输入会员名 / 卡号"
          value={keyword}
        />
      </section>

      <section className="space-y-3">
        {filteredCards.slice(0, 6).map((card) => (
          <CardRow
            card={card}
            key={card.id}
            onSelect={() => setSelectedCardId(card.id)}
            selected={selectedCard?.id === card.id}
            snapshot={snapshot}
          />
        ))}
      </section>

      {selectedCard && selectedMember && selectedTemplate ? (
        <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
          <SectionTitle caption="核销会先写 CardLedger，再更新卡片冗余余额或剩余次数。" title="确认核销" />
          <div className="rounded-[24px] bg-paper p-4">
            <p className="text-sm font-black text-ink">{selectedMember.name}</p>
            <p className="mt-1 text-xs font-bold text-ink/50">{selectedTemplate.name} · {selectedCard.cardNo}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <KpiTile label="本次扣除" value={selectedCard.cardType === "times" || selectedCard.cardType === "trial" ? "1 次" : yen(Math.min(8000, getCardLedgerTotal(selectedCard)))} />
              <KpiTile label="剩余次数" value={`${selectedCard.remainingTimes} 次`} />
              <KpiTile label="余额" value={yen(getCardLedgerTotal(selectedCard))} />
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            onClick={() => runAction(setToast, () => {
              const isTimes = selectedCard.cardType === "times" || selectedCard.cardType === "trial";
              consumeShopMemberCardRecord({
                cardId: selectedCard.id,
                times: isTimes ? 1 : 0,
                amount: isTimes ? 0 : Math.min(8000, getCardLedgerTotal(selectedCard)),
                operatorId,
                orderId: "manual-verify",
                reason: "扫码核销",
                idempotencyKey: `verify-${selectedCard.id}-${Date.now()}`
              });
              return `核销成功：${selectedMember.name} · ${selectedTemplate.name}。`;
            })}
          >
            确认核销
          </Button>
          <div className="mt-4">
            <SectionTitle caption="核销成功后马上可以看到扣减流水。" title="当前卡流水" />
            <LedgerList cardId={selectedCard.id} snapshot={snapshot} />
          </div>
        </section>
      ) : (
        <div className="rounded-[24px] border border-line bg-white px-4 py-8 text-center text-sm font-bold text-ink/45 shadow-panel">当前没有可核销会员卡。</div>
      )}
    </>
  );
}

function AnalyticsChart({ result, activeKey, onSelect }: { result: ReturnType<typeof getShopMemberAnalytics>; activeKey?: string; onSelect: (key: string) => void }) {
  if (result.items.length === 0) {
    return <div className="rounded-[24px] bg-paper px-4 py-10 text-center text-sm font-bold text-ink/45">当前筛选条件下暂无会员数据。</div>;
  }

  if (result.chartType === "pie") {
    let current = 0;
    const gradient = result.items.map((item) => {
      const start = current;
      current += item.percentage;
      return `${item.color} ${start}% ${current}%`;
    }).join(", ");

    return (
      <div className="grid gap-4 min-[390px]:grid-cols-[150px,minmax(0,1fr)] min-[390px]:items-center">
        <button
          aria-label="会员分析饼图"
          className="mx-auto h-[150px] w-[150px] rounded-full border-[18px] border-white shadow-[0_20px_44px_rgba(0,0,0,0.08)]"
          style={{ background: `conic-gradient(${gradient})` }}
          type="button"
        />
        <div className="space-y-2">
          {result.items.map((item) => (
            <button
              className={cn("flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2 text-left transition", activeKey === item.key ? "bg-[color:var(--client-primary-soft)]" : "bg-paper")}
              key={item.key}
              onClick={() => onSelect(item.key)}
              type="button"
            >
              <span className="min-w-0 text-sm font-black text-ink">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                {item.label}
              </span>
              <span className="shrink-0 text-xs font-black text-ink/55">{item.value} · {item.percentage}%</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...result.items.map((item) => item.value), 1);

  return (
    <div className="space-y-2">
      {result.items.map((item) => (
        <button className="grid w-full grid-cols-[86px,minmax(0,1fr)_52px] items-center gap-2 rounded-[16px] bg-paper px-3 py-2 text-left" key={item.key} onClick={() => onSelect(item.key)} type="button">
          <span className="truncate text-xs font-black text-ink">{item.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-black/[0.06]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(8, (item.value / maxValue) * 100)}%`, background: item.color }} />
          </span>
          <span className="text-right text-xs font-black text-ink/55">{item.value}</span>
        </button>
      ))}
    </div>
  );
}

function AnalyticsScreen({ snapshot }: { snapshot: ShopMemberSnapshot }) {
  const [dimension, setDimension] = useState<ShopMemberAnalyticsDimension>("source");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | undefined>();
  const result = useMemo(() => getShopMemberAnalytics(snapshot, dimension), [dimension, snapshot]);
  const drilldownFilters: ShopMemberListFilters = selectedGroupKey ? { groupKey: selectedGroupKey, dimension } : {};
  const drilldownMembers = selectedGroupKey
    ? filterShopMembers(snapshot).filter((member) => getMemberAnalyticsGroup(snapshot, member, dimension).key === selectedGroupKey)
    : [];

  return (
    <>
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="会员总数、客单价和总消费保留在首屏顶部。" title="会员分析" />
        <div className="grid grid-cols-3 gap-2">
          <KpiTile label="会员总数" value={`${result.summary.memberCount}`} />
          <KpiTile label="客单价" value={yen(result.summary.avgTicket)} />
          <KpiTile label="总消费" value={yen(result.summary.totalSpend)} />
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="图表总数可能与会员总数不同，未知或未填写会单独入组。" title={MEMBER_ANALYTICS_DIMENSIONS.find((item) => item.key === dimension)?.label ?? "图表"} />
        <AnalyticsChart activeKey={selectedGroupKey} onSelect={setSelectedGroupKey} result={result} />
      </section>

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <SectionTitle caption="底部 2x4 维度选择，选中项使用品牌色高亮。" title="维度" />
        <div className="grid grid-cols-4 gap-2">
          {MEMBER_ANALYTICS_DIMENSIONS.map((item) => (
            <button
              className={cn("min-h-[58px] rounded-[18px] border px-1 text-center text-[12px] font-black leading-4 transition", dimension === item.key ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]" : "border-line bg-paper text-ink/60")}
              key={item.key}
              onClick={() => {
                setDimension(item.key);
                setSelectedGroupKey(undefined);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {selectedGroupKey ? (
        <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
          <SectionTitle caption="点击图表分组后，下面会展示对应会员列表。" title="分组会员" />
          <div className="space-y-2">
            {drilldownMembers.slice(0, 8).map((member) => (
              <div className="flex items-center justify-between gap-3 rounded-[18px] bg-paper px-3 py-3" key={member.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-ink">{member.name}</p>
                  <p className="mt-1 truncate text-xs font-bold text-ink/45">{member.tags.slice(0, 3).join(" / ")}</p>
                </div>
                <strong className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">{yen(member.totalSpend)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <span className="hidden" data-no-i18n>{JSON.stringify(drilldownFilters)}</span>
    </>
  );
}

export function ShopMemberCenterPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const snapshot = useShopMemberStore();
  const activeSection = resolveSection(section);
  const [toast, setToast] = useState<ToastState>(FEATURE_SHOP_MEMBER_SYSTEM ? null : { tone: "red", message: "会员系统功能开关未启用。" });

  const openSection = (nextSection: MemberSection) => {
    navigate(sectionPath(nextSection));
  };

  return (
    <MobileShell className="bg-[color:var(--client-bg)]" navItems={merchantNavItems}>
      <MemberCenterHeaderTabs onChange={openSection} value={activeSection} />
      <div className="space-y-4 px-4 pb-32">
        <ToastDialog onClose={() => setToast(null)} toast={toast} />

        {activeSection === "overview" ? <OverviewScreen openSection={openSection} setToast={setToast} snapshot={snapshot} /> : null}
        {activeSection === "members" ? <MembersScreen setToast={setToast} snapshot={snapshot} /> : null}
        {activeSection === "cards" ? <CardsScreen setToast={setToast} snapshot={snapshot} /> : null}
        {activeSection === "verify" ? <VerifyScreen setToast={setToast} snapshot={snapshot} /> : null}
        {activeSection === "analytics" ? <AnalyticsScreen snapshot={snapshot} /> : null}

        <footer className="rounded-[24px] border border-line bg-white px-4 py-4 text-xs font-bold leading-6 text-ink/50 shadow-panel">
          <Link className="font-black text-[color:var(--client-primary)]" to="/shop/member/analytics">会员分析</Link>
          <span> · 店铺卡只记录私域会员卡资产、核销和提醒，不抵扣 Booking / Request / NDP 平台费用。</span>
        </footer>
      </div>
    </MobileShell>
  );
}
