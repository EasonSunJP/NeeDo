import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenBackButton, MobileFullscreenCloseButton, MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { ServiceFlowSection } from "../../components/mobile/ServiceFlowSection";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { HighlightedTagText } from "../../components/ui/HighlightedTagText";
import { ShareNetworkIconPath } from "../../components/ui/ShareNetworkIcon";
import { services, stores, technicians } from "../../data/mock";
import { useI18n } from "../../i18n/I18nProvider";
import { getForwardContacts, type ForwardContact } from "../../lib/forwardContacts";
import { getMessagePath, type MessageCenterContext } from "../../lib/messageCenter";
import { yen } from "../../lib/utils";
import { CustomerMembershipBadge, SocialProfileMiniCard, buildSocialProfileMiniCardData, type SocialProfileMiniData } from "../../shared/profile-card";
import { resolveCustomerMembership } from "../../shared/profile-card/customerMembership";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import {
  findNeedoPost,
  formatCountdown,
  formatExpiryDate,
  getDemandDetail,
  getExchangeServiceLabel,
  markNeedoPostViewed,
  getNeedoBasePath,
  getNeedoPostCustomerPath,
  getPostLikeCount,
  getPostReplyCount,
  submitNeedoDemandApplication,
  storeForwardedExchange,
  useNeedoDemandApplications,
  useNeedoReverseBookings,
  type ExchangePost
} from "./NeedoExchangePage";

const fullscreenHeaderClassName =
  "";
const needoDetailCardClassName = "rounded-[28px] border border-line bg-white p-4 shadow-panel";
const needoDetailInnerCardClassName = "rounded-[18px] bg-paper p-3";
const needoPriceHighlightClassName = "text-[color:var(--client-primary)]";

function getNeedoBudgetLabel(post: { budget: number; budgetLabel?: string }) {
  return post.budgetLabel ?? yen(post.budget);
}

type NeedoTopActionIconName = "like" | "favorite" | "translate" | "forward";

function NeedoTopActionIcon({ name }: { name: NeedoTopActionIconName }) {
  if (name === "like") {
    return (
      <path
        d="M12 19.2s-6.8-4.3-8.6-8.3C2 7.8 4 5.2 7 5.2c1.8 0 3.2.8 5 2.9 1.8-2.1 3.2-2.9 5-2.9 3 0 5 2.6 3.6 5.7-1.8 4-8.6 8.3-8.6 8.3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    );
  }

  if (name === "favorite") {
    return <path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6-4.9 2.6.9-5.3-4-3.9 5.5-.8L12 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />;
  }

  if (name === "translate") {
    return (
      <>
        <path d="M5 6.5h9M8 6.5c0 5-1.6 8.4-4 11M9.5 11c1 2.3 2.7 4.6 5.2 6.6M13.5 6.5h5.5M17 4v15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </>
    );
  }

  return <ShareNetworkIconPath />;
}

function NeedoTopActionButton({
  active = false,
  label,
  name,
  onClick
}: {
  active?: boolean;
  label: string;
  name: NeedoTopActionIconName;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={[
        floatingHeaderControlButtonClassName,
        "text-[color:var(--client-muted)] hover:-translate-y-0.5",
        active ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]" : ""
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      title={label}
      type="button"
    >
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <NeedoTopActionIcon name={name} />
      </svg>
      <span className="sr-only">{label}</span>
    </button>
  );
}

function NeedoDetailHero({
  post,
  booked,
  applied,
  onPreview
}: {
  post: ExchangePost;
  booked: boolean;
  applied: boolean;
  onPreview: () => void;
}) {
  return (
    <button
      aria-label="放大头图"
      className="focus-ring relative h-[204px] w-full overflow-hidden rounded-[28px] bg-ink text-left text-white shadow-soft"
      onClick={onPreview}
      type="button"
    >
      <img alt={post.title} className="absolute inset-0 h-full w-full object-cover opacity-45" src={post.image} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/30 to-ink" />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone={post.type === "demand" ? "yellow" : "green"}>{post.type === "demand" ? "需求" : "情报"}</Badge>
            {booked ? <Badge tone="green">已预约</Badge> : applied ? <Badge tone="blue">应募中</Badge> : null}
          </div>
        </div>
        <div className="min-h-0">
          <h1 className="overflow-hidden text-[26px] font-black leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{post.title}</h1>
        </div>
      </div>
    </button>
  );
}

const needoCheckoutCategoryMatchers = [
  { categoryId: "massage", pattern: /肩颈|睡眠|足部|按摩|理疗|放松|护理/ },
  { categoryId: "beauty", pattern: /美甲|美睫/ },
  { categoryId: "cleaning", pattern: /保洁|清洁|家政/ },
  { categoryId: "appliance", pattern: /空调|清洗|家电/ },
  { categoryId: "dining", pattern: /居酒屋|餐饮|座位|包间|聚会/ },
  { categoryId: "pet", pattern: /宠物|遛狗|猫/ },
  { categoryId: "recycle", pattern: /回收|废弃|家具|纸箱/ },
  { categoryId: "moving", pattern: /搬家|搬运|转运/ },
  { categoryId: "guide", pattern: /导游|陪同|讲解|行程/ },
  { categoryId: "business", pattern: /商务|接待|企业/ },
  { categoryId: "sports", pattern: /运动|健身|拉伸|陪练/ },
  { categoryId: "tutor", pattern: /家教|教师|辅导/ },
  { categoryId: "legal", pattern: /法律|合同|法务/ },
  { categoryId: "renovation", pattern: /装修|翻新|安装|施工/ },
  { categoryId: "property", pattern: /不动产|看房|租住/ }
] as const;

function resolveNeedoCheckoutService(post: ExchangePost) {
  const serviceHint = getExchangeServiceLabel(post);
  const haystack = `${serviceHint} ${post.title} ${post.detail} ${post.tags.join(" ")}`;
  const matchedCategory = needoCheckoutCategoryMatchers.find((entry) => entry.pattern.test(haystack))?.categoryId;
  const exactNameMatch = services.find((service) => haystack.includes(service.name));

  if (exactNameMatch) {
    return exactNameMatch;
  }

  if (matchedCategory) {
    return services.find((service) => service.categoryId === matchedCategory) ?? services[0];
  }

  return services[0];
}

function resolveNeedoCheckoutStore(post: ExchangePost) {
  const byAuthor = stores.find((store) => store.name === post.author);

  if (byAuthor) {
    return byAuthor;
  }

  if (!post.role.includes("店铺")) {
    return undefined;
  }

  return stores.find(
    (store) =>
      post.area.includes(store.area) ||
      post.title.includes(store.area) ||
      post.detail.includes(store.area) ||
      store.tags.some((tag) => post.title.includes(tag) || post.detail.includes(tag) || post.tags.includes(tag))
  );
}

function resolveNeedoCheckoutTechnician(post: ExchangePost) {
  const byAuthor = technicians.find((technician) => technician.name === post.author || technician.nickname === post.author);

  if (byAuthor) {
    return byAuthor;
  }

  return undefined;
}

function resolveNeedoCheckoutPackageId(post: ExchangePost, service: (typeof services)[number]) {
  if (service.packages.length === 0) {
    return undefined;
  }

  return service.packages.reduce((closest, current) => {
    if (!closest) {
      return current;
    }

    return Math.abs(current.price - post.budget) < Math.abs(closest.price - post.budget) ? current : closest;
  }, service.packages[0])?.id;
}

function buildNeedoCheckoutHref(post: ExchangePost, context: MessageCenterContext = "user") {
  const service = resolveNeedoCheckoutService(post);
  const store = resolveNeedoCheckoutStore(post);
  const technician = store ? undefined : resolveNeedoCheckoutTechnician(post);
  const packageId = resolveNeedoCheckoutPackageId(post, service);
  const searchParams = new URLSearchParams();

  if (packageId) {
    searchParams.set("package", packageId);
  }

  if (post.time.trim()) {
    searchParams.set("time", post.time);
  }

  if (store) {
    searchParams.set("store", store.id);
  }

  if (technician) {
    searchParams.set("technician", technician.id);
  }

  searchParams.set("needoPostId", post.id);
  searchParams.set("needoContext", context);

  const query = searchParams.toString();
  return `/checkout/${service.id}${query ? `?${query}` : ""}`;
}

function buildNeedoCustomerMiniProfile(post: ExchangePost, detail: ReturnType<typeof getDemandDetail>): SocialProfileMiniData {
  const membership = resolveCustomerMembership(detail.customer.memberLevel);

  return {
    id: `${post.id}-customer`,
    entityType: "user",
    displayName: detail.customer.name,
    avatar: detail.customer.avatar,
    coverImage: detail.customer.avatar,
    headline: detail.customer.note,
    genderLabel: "性别未公开",
    regionLabel: post.area.split(/[·/]/)[0]?.trim() || "东京",
    primaryLabel: membership.label,
    membershipKind: membership.kind,
    kycVerified: true,
    levelLabel: `Lv.${Math.max(1, Math.min(100, Math.round(detail.customer.completedOrders)))}`,
    scoreLabel: "信用度",
    scoreValue: `${Math.max(0, Math.min(5, detail.customer.rating)).toFixed(1)}/5`,
    followerCount: Math.max(12, detail.customer.reviewCount * 2),
    followingCount: Math.max(8, Math.round(detail.customer.completedOrders / 2)),
    actionLabel: "关注"
  };
}

function resolveNeedoMiniProfile(post: ExchangePost, detail: ReturnType<typeof getDemandDetail>, context: MessageCenterContext) {
  if (post.type === "reverse") {
    const matchedStore = stores.find((store) => store.name === post.author);

    if (matchedStore) {
      return {
        data: buildSocialProfileMiniCardData(matchedStore, { actionLabel: "关注中" }),
        detailTo: getScopedProfileDetailPath(context, "shop", matchedStore.id)
      };
    }

    const matchedTechnician = technicians.find((technician) => technician.name === post.author || technician.nickname === post.author);

    if (matchedTechnician) {
      return {
        data: buildSocialProfileMiniCardData(matchedTechnician, { actionLabel: "关注" }),
        detailTo: getScopedProfileDetailPath(context, "technician", matchedTechnician.id)
      };
    }
  }

  return {
    data: buildNeedoCustomerMiniProfile(post, detail),
    detailTo: getNeedoPostCustomerPath(context, post.id)
  };
}

function useNeedoBack(context: MessageCenterContext) {
  const navigate = useNavigate();

  return () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(getNeedoBasePath(context), { replace: true });
  };
}

function NeedoPostDetailContent({ context }: { context: MessageCenterContext }) {
  const navigate = useNavigate();
  const closePage = useNeedoBack(context);
  const { language } = useI18n();
  const { postId } = useParams();
  const post = useMemo(() => findNeedoPost(context, postId), [context, postId]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [sharePost, setSharePost] = useState<ExchangePost | null>(null);
  const [sharedContact, setSharedContact] = useState<ForwardContact | null>(null);
  const [applicationFeedbackOpen, setApplicationFeedbackOpen] = useState(false);
  const [heroPreviewOpen, setHeroPreviewOpen] = useState(false);
  const forwardContacts = getForwardContacts(context);
  const appliedDemandPostIds = useNeedoDemandApplications(context);
  const bookedReversePostIds = useNeedoReverseBookings(context);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setApplicationFeedbackOpen(false);
    setHeroPreviewOpen(false);
  }, [postId]);

  useEffect(() => {
    if (!postId) {
      return;
    }

    markNeedoPostViewed(context, postId);
  }, [context, postId]);

  if (!post) {
    return (
      <MobileFullscreenPage>
        <MobileFullscreenHeader className={fullscreenHeaderClassName} onBack={closePage} title="NeeDo 详情" />
        <main className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <h1 className="text-xl font-black">内容不存在或已失效</h1>
            <p className="mt-2 text-sm leading-6 text-ink/55">这条需求或情报暂时无法打开，返回 NeeDo 列表后可以继续浏览其他内容。</p>
          </div>
        </main>
      </MobileFullscreenPage>
    );
  }

  const detail = getDemandDetail(post);
  const miniProfile = resolveNeedoMiniProfile(post, detail, context);
  const relatedService = resolveNeedoCheckoutService(post);
  const remainingMs = new Date(post.expiresAt).getTime() - nowMs;
  const countdownLabel = formatCountdown(remainingMs, language);
  const applied = post.type === "demand" && appliedDemandPostIds.includes(post.id);
  const booked = post.type === "reverse" && bookedReversePostIds.includes(post.id);
  const commentCount = getPostReplyCount(post);
  const checkoutHref = context === "user" && post.type === "reverse" ? buildNeedoCheckoutHref(post, context) : null;
  const statusHint = post.type === "demand" ? "提交完成，请等待用户判断。若对方确认，平台会继续推进后续流程。" : "预约已提交，请等待对方确认。若对方通过，平台会继续推进后续流程。";
  const pendingLabel = post.type === "demand" ? "等待判断" : "等待确认";
  const feedbackTitle = post.type === "demand" ? "提交完成" : "预约已提交";
  const expiryText = {
    zh: `${post.type === "demand" ? "需求" : "情报"}有效至 ${formatExpiryDate(post.expiresAt, language)}`,
    "zh-Hant": `${post.type === "demand" ? "需求" : "情報"}有效至 ${formatExpiryDate(post.expiresAt, language)}`,
    ja: `掲載終了 ${formatExpiryDate(post.expiresAt, language)}`,
    en: `Valid until ${formatExpiryDate(post.expiresAt, language)}`,
    ko: `${post.type === "demand" ? "요청" : "정보"} 마감 ${formatExpiryDate(post.expiresAt, language)}`
  }[language];
  const paymentCaption = post.type === "demand"
    ? detail.paymentStatus
    : detail.prepaidAmount > 0
      ? "商铺设置了预约定金，预约时预付，尾款到场支付。"
      : "商铺未设置预约定金，到场后按活动价格支付。";
  const paymentBadgeLabel = post.type === "demand"
    ? detail.paymentLabel
    : detail.prepaidAmount > 0
      ? "需预付定金"
      : "无需预付";
  const paymentRows = [
    { label: post.type === "demand" ? "预算" : "价格", value: getNeedoBudgetLabel(post), highlight: true },
    { label: post.type === "demand" ? "已预付" : "需预付", value: yen(detail.prepaidAmount), highlight: false },
    { label: "到场支付", value: yen(detail.cashAmount), highlight: false }
  ];

  const forwardExchangePost = (contact: ForwardContact) => {
    storeForwardedExchange(context, post, contact);
    setSharedContact(contact);
  };

  const handleDemandSubmit = () => {
    if (remainingMs <= 0) {
      return;
    }

    if (post.type === "reverse") {
      if (checkoutHref) {
        navigate(checkoutHref);
      }

      return;
    }

    submitNeedoDemandApplication(context, post.id);
    setApplicationFeedbackOpen(true);
  };

  return (
    <MobileFullscreenPage>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-10 h-[var(--client-sticky-tab-single-spacer)] border-b border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-bg)]"
      />
      <div className="pointer-events-none absolute inset-x-0 safe-floating-top z-[90] px-4">
        <MobileFullscreenBackButton className="pointer-events-auto" onBack={closePage} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 safe-floating-top z-[90] flex justify-end px-4">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <NeedoTopActionButton active={liked} label={`点赞 ${getPostLikeCount(post) + (liked ? 1 : 0)}`} name="like" onClick={() => setLiked((current) => !current)} />
          <NeedoTopActionButton active={favorited} label="收藏" name="favorite" onClick={() => setFavorited((current) => !current)} />
          <NeedoTopActionButton active={translated} label="翻译" name="translate" onClick={() => setTranslated((current) => !current)} />
          <NeedoTopActionButton
            label="转发"
            name="forward"
            onClick={() => {
              setSharePost(post);
              setSharedContact(null);
            }}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 safe-header-top px-4 pb-3 text-[color:var(--client-text)]">
        <div className="min-w-0 pl-[56px] pr-[212px]">
          <div className="truncate text-base font-black">{post.type === "demand" ? "需求详情" : "情报详情"}</div>
          <p className="mt-0.5 truncate text-[11px] font-bold leading-5 text-ink/45">{`${post.time} · ${post.area}`}</p>
        </div>
      </div>
      <main className="scrollbar-none relative z-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-[var(--client-sticky-tab-single-spacer)]">
        <NeedoDetailHero
          applied={applied}
          booked={booked}
          onPreview={() => setHeroPreviewOpen(true)}
          post={post}
        />

        <section className={needoDetailCardClassName}>
          <div>
            <p className="text-[11px] font-black text-ink/45">介绍</p>
            <HighlightedTagText className="mt-2 block text-sm font-semibold leading-6 text-ink/68" tagClassName="text-[color:var(--client-primary)]" text={post.detail} />
          </div>
          <div className="mt-3 rounded-[18px] bg-paper px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black text-ink/45">期限</p>
              <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-primary)]">
                {countdownLabel}
              </span>
            </div>
            <p className="mt-2 text-[13px] font-black text-ink/70">{expiryText}</p>
          </div>
        </section>

        {post.type === "demand" && applied ? (
          <section className="rounded-[28px] border border-sky/30 bg-sky/10 p-4 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#245a80]">当前状态</p>
                <h2 className="mt-1 text-lg font-black text-ink">应募中</h2>
                <p className="mt-2 text-sm leading-6 text-ink/65">{statusHint}</p>
              </div>
              <Badge tone="blue">{pendingLabel}</Badge>
            </div>
          </section>
        ) : null}

        <section className={needoDetailCardClassName}>
          <SectionTitle caption={paymentCaption} title="支付信息">
            <Badge tone={detail.prepaidAmount > 0 ? "green" : "yellow"}>{paymentBadgeLabel}</Badge>
          </SectionTitle>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {paymentRows.map((row) => (
              <div className={needoDetailInnerCardClassName} key={row.label}>
                <p className="text-[11px] font-bold text-ink/45">{row.label}</p>
                <strong className={row.highlight ? `mt-1 block text-[18px] font-black leading-none ${needoPriceHighlightClassName}` : "mt-1 block text-sm"}>{row.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <ServiceFlowSection flow={relatedService.flow} />

        <SocialProfileMiniCard data={miniProfile.data} detailTo={miniProfile.detailTo} />

        <section className={needoDetailCardClassName}>
          <h2 className="font-black">服务要求</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span className="rounded-[18px] bg-paper px-3 py-2 text-xs font-bold text-ink/60" key={tag}>{tag}</span>
            ))}
          </div>
          <div className="mt-3 rounded-[18px] bg-paper p-3 text-xs leading-5 text-ink/55">
            <strong className="text-ink">安全提示：</strong>
            抢单前请确认人数、到达方式、酒店登记、现金尾款和特殊要求。平台内沟通会自动归档到订单。
          </div>
        </section>

        <section className={needoDetailCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">评论</h2>
            <Badge tone="green">{commentCount} 条</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {detail.reviews.map((review) => (
              <article className={needoDetailInnerCardClassName} key={review.id}>
                <div className="flex gap-3">
                  <AvatarImage alt={review.commenterName} className="h-10 w-10" src={review.commenterAvatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="truncate text-sm">{review.commenterName}</strong>
                      <span className="shrink-0 text-xs text-ink/45">{review.date}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink/60">{review.content}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <ClientEdgeMask className="z-10" edge="bottom" mode="absolute" />
      <footer className="absolute inset-x-0 bottom-0 z-20 grid grid-cols-[1fr,auto] items-center gap-3 border-t border-transparent bg-transparent px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-4">
        <div>
          <p className="text-xs font-bold text-ink/45">{post.type === "demand" ? "预计收入" : "价格"}</p>
          <strong className={`text-xl ${needoPriceHighlightClassName}`}>{getNeedoBudgetLabel(post)}</strong>
        </div>
        <Button
          className="min-w-[150px]"
          disabled={remainingMs <= 0 || (post.type === "reverse" && (!checkoutHref || booked))}
          onClick={handleDemandSubmit}
          variant={applied || booked ? "secondary" : "primary"}
        >
          {remainingMs <= 0
            ? { zh: "已过期", "zh-Hant": "已過期", ja: "掲載終了", en: "Expired", ko: "만료됨" }[language]
            : post.type === "demand"
              ? applied
                ? "应募中"
                : "提交抢单"
              : booked
                ? "已预约"
                : "立即预约"}
        </Button>
      </footer>

      {heroPreviewOpen ? (
        <div className="fixed inset-0 z-[96] bg-black/90 px-4 py-6">
          <button aria-label="关闭头图预览" className="absolute inset-0" onClick={() => setHeroPreviewOpen(false)} type="button" />
          <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] z-[97]">
            <MobileFullscreenCloseButton className="border-white/25 bg-black/40 text-white" label="关闭大图" onClose={() => setHeroPreviewOpen(false)} />
          </div>
          <div className="pointer-events-none relative z-[96] mx-auto flex h-full w-full max-w-[480px] items-center justify-center">
            <img alt={post.title} className="max-h-full w-full rounded-[28px] object-contain shadow-soft" src={post.image} />
          </div>
        </div>
      ) : null}

      {applicationFeedbackOpen ? (
        <div
          className="fixed inset-0 z-[68] bg-black/58 px-4 py-6 backdrop-blur-[8px]"
          onClick={() => setApplicationFeedbackOpen(false)}
        >
          <div className="mx-auto flex h-full w-full max-w-[480px] items-center">
            <section
              className="w-full rounded-[28px] border border-white/8 bg-[#161616] p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.48)]"
              onClick={(event) => event.stopPropagation()}
            >
              <Badge tone="blue">应募中</Badge>
              <h2 className="mt-3 text-2xl font-black text-white">{feedbackTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-white/78">{statusHint}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button
                  className="border-white/12 bg-white/8 text-white hover:bg-white/12"
                  onClick={() => setApplicationFeedbackOpen(false)}
                  variant="secondary"
                >
                  继续查看
                </Button>
                <Button
                  className="shadow-[0_12px_28px_rgba(178,255,0,0.24)]"
                  onClick={() => {
                    setApplicationFeedbackOpen(false);
                    closePage();
                  }}
                >
                  返回 NeeDo
                </Button>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {sharePost ? (
        <div className="fixed inset-0 z-[70] bg-[color:var(--client-bg)] text-[color:var(--client-text)]">
          <div className="mx-auto flex h-full w-full max-w-[480px] flex-col bg-[color:var(--client-bg)] shadow-soft">
            <MobileFullscreenHeader className={fullscreenHeaderClassName} onClose={() => setSharePost(null)} title="转发 NeeDo 卡片" />
            <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <section className="rounded-[28px] bg-white p-4 shadow-panel">
                <Badge tone={sharePost.type === "demand" ? "yellow" : "green"}>{sharePost.type === "demand" ? "需求" : "情报"}</Badge>
                <h3 className="mt-2 text-lg font-black">{sharePost.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/60">{sharePost.time} · {sharePost.area} · {yen(sharePost.budget)}</p>
              </section>
              <section className="rounded-[28px] bg-white p-4 shadow-panel">
                <h3 className="font-black">选择通讯录联系人</h3>
                <div className="mt-3 space-y-2">
                  {forwardContacts.map((contact) => (
                    <button
                      className="flex w-full items-center gap-3 rounded-[20px] bg-paper p-3 text-left"
                      key={contact.conversationId}
                      onClick={() => forwardExchangePost(contact)}
                      type="button"
                    >
                      <AvatarImage alt={contact.name} className="h-12 w-12" src={contact.avatar} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{contact.name}</strong>
                        <span className="mt-1 block text-xs text-ink/50">{contact.role}</span>
                      </span>
                      <span className="text-lg font-black text-ink/30">›</span>
                    </button>
                  ))}
                </div>
              </section>
              {sharedContact ? (
                <section className="rounded-[28px] bg-lemon p-4 text-black shadow-panel">
                  <h3 className="font-black">已通过聊天发送</h3>
                  <p className="mt-2 text-sm leading-6 text-black/70">已发送给 {sharedContact.name}，进入聊天页可以查看刚转发的 NeeDo 卡片。</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button onClick={() => setSharePost(null)} variant="secondary">继续浏览</Button>
                    <Link
                      className="focus-ring inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-white"
                      to={getMessagePath(context, sharedContact.conversationId)}
                    >
                      去聊天查看
                    </Link>
                  </div>
                </section>
              ) : null}
            </main>
          </div>
        </div>
      ) : null}
    </MobileFullscreenPage>
  );
}

function NeedoCustomerDetailContent({ context }: { context: MessageCenterContext }) {
  const closePage = useNeedoBack(context);
  const { postId } = useParams();
  const post = useMemo(() => findNeedoPost(context, postId), [context, postId]);

  useEffect(() => {
    if (!postId) {
      return;
    }

    markNeedoPostViewed(context, postId);
  }, [context, postId]);

  if (!post) {
    return (
      <MobileFullscreenPage>
        <MobileFullscreenHeader className={fullscreenHeaderClassName} onBack={closePage} title="客人资料" />
        <main className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <h1 className="text-xl font-black">资料不存在</h1>
            <p className="mt-2 text-sm leading-6 text-ink/55">当前无法读取这位客人的资料，请返回上一页后重新打开。</p>
          </div>
        </main>
      </MobileFullscreenPage>
    );
  }

  const detail = getDemandDetail(post);

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
        className={fullscreenHeaderClassName}
        onBack={closePage}
        subtitle={`ID：${detail.customer.systemId}`}
        title="客人资料"
      />
      <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="rounded-[28px] bg-ink p-4 text-white shadow-soft">
          <div className="flex gap-3">
            <img alt={detail.customer.name} className="avatar-shape h-20 w-20 object-cover" src={detail.customer.avatar} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-mint">客人资料</p>
              <h1 className="mt-1 truncate text-2xl font-black">{detail.customer.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/65">
                <CustomerMembershipBadge
                  className="-my-1 h-8 w-8"
                  fallbackClassName="font-bold text-white/65"
                  imageClassName="h-8 w-8"
                  level={detail.customer.memberLevel}
                />
                <span>★ {detail.customer.rating}</span>
                <span>· {detail.customer.completedOrders} 单完成</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <h2 className="font-black">详细资料</h2>
          <div className="mt-3 space-y-2 text-sm">
            {[
              ["用户ID", detail.customer.systemId],
              ["历史完成", `${detail.customer.completedOrders} 单`],
              ["爽约率", detail.customer.noShowRate],
              ["语言偏好", detail.customer.languages],
              ["评价数量", `${detail.customer.reviewCount} 条`]
            ].map(([label, value]) => (
              <div className="flex items-center justify-between rounded-lg bg-paper px-3 py-3" key={label}>
                <span className="text-ink/55">{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-paper p-3 text-xs leading-5 text-ink/55">{detail.customer.note}</p>
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">客人动态</h2>
            <Badge tone="green">可浏览</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {detail.moments.map((moment) => (
              <article className="rounded-lg bg-paper p-3" key={moment.id}>
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{moment.title}</strong>
                  <span className="text-xs text-ink/45">{moment.date}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink/60">{moment.content}</p>
                <div className="mt-2 flex gap-2 text-[11px] font-bold text-moss">
                  <span>点赞 18</span>
                  <span>回复 4</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </MobileFullscreenPage>
  );
}

export function NeedoPostDetailRoutePage({ context = "user" }: { context?: MessageCenterContext }) {
  return (
    <MobileShell navItems={[]}>
      <NeedoPostDetailContent context={context} />
    </MobileShell>
  );
}

export function NeedoPostCustomerRoutePage({ context = "user" }: { context?: MessageCenterContext }) {
  return (
    <MobileShell navItems={[]}>
      <NeedoCustomerDetailContent context={context} />
    </MobileShell>
  );
}
