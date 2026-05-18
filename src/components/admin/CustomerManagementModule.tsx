import { useState, type ReactNode } from "react";
import { CustomerEntitySyncEditor } from "./EntitySyncEditor";
import { AvatarImage } from "../ui/AvatarImage";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { DataTable } from "../ui/DataTable";
import { Drawer } from "../ui/Drawer";
import { FilterBar } from "../ui/FilterBar";
import { imageBank, orders as allOrders } from "../../data/mock";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { paymentStatusLabel, paymentStatusTone, statusLabel, yen } from "../../lib/utils";
import { CustomerMembershipBadge } from "../../shared/profile-card";
import { resolveCustomerMembership } from "../../shared/profile-card/customerMembership";
import { formatCustomerCreditScore } from "../../shared/profile-card/customerProfileLabels";
import { useEntityStore } from "../../state/entityStore";
import type { Customer, Order } from "../../types/domain";

type CustomerMomentComment = {
  id: string;
  userName: string;
  content: string;
  at: string;
};

type CustomerMomentPost = {
  id: string;
  author: string;
  postedAt: string;
  location: string;
  visibility: "公开" | "仅好友" | "仅自己" | "指定分组";
  content: string;
  images: string[];
  serviceTitle: string;
  likes: number;
  likedUsers: string[];
  comments: CustomerMomentComment[];
};

type SummaryCard = {
  label: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "yellow" | "red" | "neutral";
};

const customerMomentContentSeeds = [
  "今天预约的服务很准时，提前在平台里确认了门禁和付款方式，体验比打电话轻松很多。",
  "银座附近的门店环境很安静，预约前能看到店铺和技师动态，做决定快了很多。",
  "上门保洁做完后发了前后对比照片，浴室和厨房都处理得很细。",
  "临时需要夜间服务，NeeDo 的需求发布功能很好用，几分钟就有人响应。",
  "带宠物的家庭真的需要提前备注，服务人员准备得更充分，也会回传照片。",
  "这次选择线下支付，平台里能保留预约和沟通记录，后续追踪也方便。"
];

const customerMomentCommentSeeds = [
  ["佐藤 美咲", "谢谢信任，下次可以提前保留同一时间段。"],
  ["GINZA Calm Body Lab", "欢迎再次预约，晚间席位建议提前一天确认。"],
  ["NeeDo 客服", "感谢反馈，服务记录已经同步到账户里。"],
  ["Mia Chen", "这家我也收藏了，照片很有参考价值。"],
  ["田中 翔太", "下次如果是自动清扫机型，可以提前发型号照片。"],
  ["林 小雨", "我也觉得动态里的真实照片很有帮助。"]
] as const;

function getCustomerAvatar(customer: Customer) {
  return customer.avatar;
}

function getCustomerMoments(customer: Customer): CustomerMomentPost[] {
  const seed = customer.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const imagePool = [imageBank.cleaning, imageBank.massage, imageBank.salon, imageBank.pet, imageBank.home, imageBank.appliance];

  return Array.from({ length: 3 }, (_, index) => {
    const offset = seed + index;
    const comments = Array.from({ length: 2 + (offset % 3) }, (_, commentIndex): CustomerMomentComment => {
      const commentSeed = customerMomentCommentSeeds[(offset + commentIndex) % customerMomentCommentSeeds.length];

      return {
        id: `${customer.id}-moment-${index + 1}-comment-${commentIndex + 1}`,
        userName: commentSeed[0],
        content: commentSeed[1],
        at: commentIndex === 0 ? "今天 18:10" : `${commentIndex + 2}小时前`
      };
    });

    return {
      id: `${customer.id}-moment-${index + 1}`,
      author: customer.name,
      postedAt: index === 0 ? "今天 17:40" : `${index + (seed % 6)}天前`,
      location: customer.tags.includes("银座") ? "银座" : customer.tags.includes("新宿") ? "新宿" : customer.tags.includes("涩谷") ? "涩谷" : "东京",
      visibility: index === 0 ? "公开" : index === 1 ? "指定分组" : "仅好友",
      content: customerMomentContentSeeds[offset % customerMomentContentSeeds.length],
      images: [
        imagePool[offset % imagePool.length],
        imagePool[(offset + 2) % imagePool.length],
        imagePool[(offset + 4) % imagePool.length]
      ].slice(0, index === 2 ? 2 : 3),
      serviceTitle: customer.tags.includes("按摩") ? "上门肩颈按摩" : customer.tags.includes("保洁") ? "家庭保洁" : customer.tags.includes("宠物") ? "宠物照护" : "到店预约",
      likes: 18 + (offset % 30) + customer.orderCount,
      likedUsers: customerMomentCommentSeeds.slice(0, 3 + (offset % 3)).map((item) => item[0]),
      comments
    };
  });
}

function getCustomerOrders(customer: Customer, orderRows: Order[]) {
  return orderRows
    .filter((order) => order.customerId === customer.id || order.customerName === customer.name)
    .sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
}

function getMemberLevelClass(level: string) {
  const membership = resolveCustomerMembership(level);

  if (membership.kind === "black") {
    return "border-[#111827] bg-[#111827] text-white";
  }

  if (membership.kind === "diamond") {
    return "border-[#b9c7d8] bg-[#eef4fb] text-[#3d536d]";
  }

  if (membership.kind === "gold") {
    return "border-[#d8aa35] bg-[#fff1bd] text-[#7a5400]";
  }

  return "border-[#b8bdc7] bg-[#f3f5f8] text-[#586170]";
}

function getMemberLevelLabel(level: string) {
  return resolveCustomerMembership(level).label;
}

function MemberLevelBadge({ level }: { level: string }) {
  const membership = resolveCustomerMembership(level);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${getMemberLevelClass(level)}`}>
      {membership.kind ? <CustomerMembershipBadge className="h-4 w-4" imageClassName="h-4 w-4" level={level} showFallback={false} /> : null}
      {getMemberLevelLabel(level)}
    </span>
  );
}

function getCustomerCreditBadgeTone(customer: Customer): "green" | "yellow" | "red" | "blue" | "neutral" {
  if (customer.activeScore >= 90) {
    return "green";
  }

  if (customer.activeScore >= 75) {
    return "blue";
  }

  if (customer.activeScore >= 60) {
    return "yellow";
  }

  return "red";
}

function getCustomerRiskLabel(risk: Customer["churnRisk"]) {
  if (risk === "high") {
    return "高流失风险";
  }

  if (risk === "medium") {
    return "中流失风险";
  }

  return "稳定用户";
}

function getCustomerRiskTone(risk: Customer["churnRisk"]): "green" | "yellow" | "red" {
  if (risk === "high") {
    return "red";
  }

  if (risk === "medium") {
    return "yellow";
  }

  return "green";
}

function getSummaryCards(customers: Customer[]): SummaryCard[] {
  const totalCustomers = customers.length;
  const averageActiveScore = totalCustomers > 0 ? Math.round(customers.reduce((sum, customer) => sum + customer.activeScore, 0) / totalCustomers) : 0;
  const memberCustomers = customers.filter((customer) => {
    return Boolean(resolveCustomerMembership(customer.memberLevel).kind);
  });
  const highValueCustomers = customers.filter((customer) => customer.ltv >= 120000 || memberCustomers.includes(customer));
  const atRiskCustomers = customers.filter((customer) => customer.churnRisk !== "low");
  const highRiskCustomers = customers.filter((customer) => customer.churnRisk === "high");
  const reachableCustomers = customers.filter((customer) => customer.activeScore >= 75 || Boolean(customer.nextBookingAt));
  const upcomingCustomers = customers.filter((customer) => Boolean(customer.nextBookingAt));

  return [
    { label: "用户总数", value: totalCustomers.toLocaleString("en-US"), hint: `平均活跃 ${averageActiveScore}`, tone: "blue" },
    { label: "高价值用户", value: highValueCustomers.length.toLocaleString("en-US"), hint: `会员用户 ${memberCustomers.length}`, tone: "green" },
    { label: "流失预警", value: atRiskCustomers.length.toLocaleString("en-US"), hint: `高风险 ${highRiskCustomers.length}`, tone: highRiskCustomers.length > 0 ? "red" : "yellow" },
    { label: "本周触达", value: reachableCustomers.length.toLocaleString("en-US"), hint: `已预约 ${upcomingCustomers.length}`, tone: "yellow" }
  ];
}

function InfoTile({
  hint,
  label,
  value
}: {
  hint: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
      <span className="text-xs font-black text-ink/45">{label}</span>
      <strong className="mt-1 block truncate text-base text-ink">{value}</strong>
      <span className="mt-1 block text-[11px] font-semibold text-ink/45">{hint}</span>
    </div>
  );
}

function DetailList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="mt-4 overflow-hidden rounded-lg border border-line">
      {items.map((item) => (
        <div className="grid gap-2 border-b border-line px-3 py-2.5 last:border-b-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]" key={item.label}>
          <dt className="text-xs font-black text-ink/45">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm font-bold leading-5 text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CustomerTags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink/65" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function CustomerProfile({
  customer,
  orderRows
}: {
  customer: Customer;
  orderRows: Order[];
}) {
  const { stores, technicians } = useEntityStore();
  const { language } = useI18n();
  const customerOrders = getCustomerOrders(customer, orderRows);
  const upcomingOrders = customerOrders.filter((order) => ["pending", "unpaid", "confirmed", "scheduled", "inService"].includes(order.status));
  const moments = getCustomerMoments(customer);
  const momentLikes = moments.reduce((sum, post) => sum + post.likes, 0);
  const momentComments = moments.reduce((sum, post) => sum + post.comments.length, 0);
  const totalOrderAmount = customerOrders.reduce((sum, order) => sum + order.amount, 0);
  const displayName = customer.nickname ? `${customer.nickname} / ${customer.name}` : customer.name;
  const basicItems: Array<{ label: string; value: ReactNode }> = [
    { label: "手机", value: customer.phone },
    ...(customer.accountUsername ? [{ label: "联动账号", value: `测试账号 ${customer.accountUsername}` }] : []),
    ...(customer.age ? [{ label: "年龄", value: customer.age }] : []),
    ...(customer.height ? [{ label: "身高", value: customer.height }] : []),
    ...(customer.languages?.length ? [{ label: "语言能力", value: customer.languages.join(" / ") }] : []),
    { label: "积分 / 优惠券", value: `${customer.points?.toLocaleString("en-US") ?? "—"} / ${customer.couponCount ?? 0} 张` },
    { label: "实际订单记录", value: `${customerOrders.length} 条` },
    { label: "累计记录金额", value: yen(totalOrderAmount) }
  ];
  const getPaymentStatusLabel = (status: Order["paymentStatus"]) => translateText(paymentStatusLabel(status), language);
  const getProviderDisplayName = (order: Order) => {
    if (order.storeName) {
      const store = stores.find((item) => item.name === order.storeName);
      return `门店：${store?.name ?? order.storeName}`;
    }

    if (order.technicianName) {
      const technician = technicians.find((item) => item.name === order.technicianName || item.nickname === order.technicianName);
      const displayName = technician ? (technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name) : order.technicianName;
      return `技师：${displayName}`;
    }

    return "待分配";
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <img alt={customer.name} className="avatar-shape h-24 w-24 shrink-0 object-cover" src={getCustomerAvatar(customer)} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <MemberLevelBadge level={customer.memberLevel} />
                {customer.accountUsername ? <Badge tone="blue">测试账号 {customer.accountUsername}</Badge> : null}
                <Badge tone={getCustomerCreditBadgeTone(customer)}>信用度 {formatCustomerCreditScore(customer, { withMax: true })}</Badge>
                <Badge tone={getCustomerRiskTone(customer.churnRisk)}>{getCustomerRiskLabel(customer.churnRisk)}</Badge>
              </div>
              <h3 className="mt-3 truncate text-2xl font-black text-ink">{displayName}</h3>
              <p className="mt-2 text-sm font-semibold text-ink/55">ID {customer.systemId}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoTile hint="累计价值" label="LTV" value={yen(customer.ltv)} />
            <InfoTile hint="平台记录" label="订单次数" value={`${customer.orderCount} 单`} />
            <InfoTile hint="最近一次下单" label="最近消费" value={customer.lastOrderAt} />
            <InfoTile hint="下一次安排" label="下次预约" value={customer.nextBookingAt ?? "未预约"} />
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-line bg-white p-4">
          <h4 className="font-black text-ink">账户资料</h4>
          <DetailList items={basicItems} />
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-black text-ink">用户画像</h4>
            <Badge tone={getCustomerCreditBadgeTone(customer)}>活跃 {customer.activeScore}</Badge>
          </div>
          <p className="mt-4 rounded-lg border border-line bg-paper px-3 py-2.5 text-sm font-semibold leading-6 text-ink/70">
            {customer.bio || "暂无自我介绍。"}
          </p>
          <div className="mt-3">
            <CustomerTags tags={customer.tags} />
          </div>
        </section>
      </div>

      <details className="group rounded-lg border border-line bg-white p-4">
        <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-md outline-none [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-black text-ink">编辑共享资料</span>
            <span className="mt-1 block text-xs font-semibold text-ink/55">需要改姓名、手机、会员、标签或介绍时再展开，避免详情页重复展示同一批信息。</span>
          </span>
          <span className="shrink-0 rounded-full border border-line bg-paper px-3 py-1 text-xs font-black text-ink/55">展开 / 收起</span>
        </summary>
        <div className="mt-4 border-t border-line pt-4">
          <CustomerEntitySyncEditor key={customer.id} customer={customer} embedded />
        </div>
      </details>

      <section className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-black">预约情况</h4>
            <p className="mt-1 text-sm text-ink/55">展示用户历史预约、未来安排、支付方式和备注。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              ["全部", customerOrders.length],
              ["待履约", upcomingOrders.length],
              ["金额", yen(totalOrderAmount)]
            ].map(([label, value]) => (
              <span className="rounded-lg bg-paper px-3 py-2" key={label}>
                <strong className="block text-base text-ink">{value}</strong>
                <span className="text-ink/45">{label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {customerOrders.slice(0, 6).map((order) => (
            <article className="rounded-lg border border-line bg-paper p-3" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={order.status === "completed" ? "green" : order.status === "cancelled" || order.status === "refunded" ? "red" : "yellow"}>
                      {statusLabel(order.status)}
                    </Badge>
                    <Badge tone={paymentStatusTone(order.paymentStatus)}>
                      {getPaymentStatusLabel(order.paymentStatus)}
                    </Badge>
                    <span className="text-xs font-bold text-ink/45">{order.bookedAt} · {order.area}</span>
                  </div>
                  <h5 className="mt-2 font-black">{order.itemName}</h5>
                  <p className="mt-1 text-sm text-ink/55">{getProviderDisplayName(order)}</p>
                  {order.remark ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-ink/60">备注：{order.remark}</p> : null}
                </div>
                <strong className="text-lg text-moss">{yen(order.amount)}</strong>
              </div>
            </article>
          ))}
          {customerOrders.length === 0 ? <div className="rounded-lg bg-paper p-4 text-sm text-ink/55">暂无预约记录。</div> : null}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-black">动态投稿</h4>
            <p className="mt-1 text-sm text-ink/55">查看用户在动态里发布的内容，以及点赞和留言反馈。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              ["投稿", moments.length],
              ["点赞", momentLikes],
              ["留言", momentComments]
            ].map(([label, value]) => (
              <span className="rounded-lg bg-paper px-3 py-2" key={label}>
                <strong className="block text-base text-ink">{value}</strong>
                <span className="text-ink/45">{label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {moments.map((post) => (
            <article className="rounded-lg border border-line bg-paper p-4" key={post.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="green">展示中</Badge>
                    <Badge tone="neutral">{post.visibility}</Badge>
                    <span className="text-xs font-bold text-ink/45">{post.postedAt} · {post.location}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink/75">{post.content}</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2 text-right text-xs shadow-soft">
                  <p className="font-black text-moss">{post.serviceTitle}</p>
                  <p className="mt-1 text-ink/55">关联体验</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {post.images.map((image, index) => (
                  <img alt={`${post.author}动态图片${index + 1}`} className="h-24 w-full rounded-lg object-cover" key={`${post.id}-${image}`} src={image} />
                ))}
              </div>

              <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black text-ink">点赞 {post.likes}</p>
                  <p className="text-xs text-ink/50">{post.likedUsers.join("、")}</p>
                </div>
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  {post.comments.map((comment) => (
                    <div className="rounded-lg bg-paper px-3 py-2" key={comment.id}>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-ink">{comment.userName}</strong>
                        <span className="text-xs text-ink/40">{comment.at}</span>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-ink/65">{comment.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

    </div>
  );
}

function CustomerDetailActions({ customer }: { customer: Customer }) {
  const actions = ["打标签", "发优惠券", "发送营销消息", "创建预约", "查看历史订单", "导出用户资料"];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 truncate text-xs font-black text-ink/55">
        {customer.nickname ? `${customer.nickname} / ${customer.name}` : customer.name}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {actions.map((action) => (
          <Button className="h-9 rounded-md px-4 text-sm" key={action} size="sm" variant="secondary">
            {action}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CustomerManagementModule({
  customers,
  orderRows = allOrders
}: {
  customers: Customer[];
  orderRows?: Order[];
}) {
  const [selected, setSelected] = useState<Customer | null>(null);
  const summaryCards = getSummaryCards(customers);

  const renderTags = (customer: Customer) => {
    const visibleTags = customer.tags.slice(0, 3);
    const hiddenCount = Math.max(0, customer.tags.length - visibleTags.length);

    return (
      <div className="flex max-w-[260px] flex-wrap items-center gap-1.5">
        {visibleTags.map((tag) => (
          <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink/65" key={tag}>
            {tag}
          </span>
        ))}
        {hiddenCount > 0 && (
          <button
            aria-label={`查看 ${customer.name} 的用户详细信息卡`}
            className="focus-ring inline-grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-xs font-black text-ink/55 hover:border-moss hover:text-moss"
            onClick={() => setSelected(customer)}
            type="button"
          >
            ...
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={card.label}>
            <p className="text-sm text-ink/55">{card.label}</p>
            <strong className="mt-2 block text-2xl">{card.value}</strong>
            <Badge className="mt-3" tone={card.tone}>{card.hint}</Badge>
          </article>
        ))}
      </section>

      <div className="mt-5">
        <FilterBar
          searchPlaceholder="搜索用户姓名、手机号、标签"
          filters={[
            { label: "会员种类", options: [{ label: "黄金会员", value: "gold" }, { label: "钻石会员", value: "diamond" }, { label: "黑卡会员", value: "black" }] },
            { label: "流失风险", options: [{ label: "低", value: "low" }, { label: "中", value: "medium" }, { label: "高", value: "high" }] },
            { label: "活跃评分", options: [{ label: "80+", value: "80" }, { label: "60+", value: "60" }] }
          ]}
        />
      </div>

      <div className="mt-4">
        <DataTable<Customer>
          columns={[
            {
              key: "name",
              title: "用户",
              render: (row) => (
                <button className="focus-ring flex items-center gap-3 text-left" onClick={() => setSelected(row)} type="button">
                  <AvatarImage alt={row.name} className="h-10 w-10 ring-2 ring-white shadow-soft" src={getCustomerAvatar(row)} />
                  <span className="min-w-0">
                    <span className="block truncate font-black text-moss hover:underline">{row.nickname ? `${row.nickname} / ${row.name}` : row.name}</span>
                    <span className="mt-1 block truncate text-xs font-bold text-ink/45">
                      ID {row.systemId} · {row.accountUsername ? `测试账号 ${row.accountUsername} · ` : ""}{row.phone}
                    </span>
                  </span>
                </button>
              )
            },
            { key: "level", title: "种类", render: (row) => <MemberLevelBadge level={row.memberLevel} /> },
            { key: "tags", title: "标签", render: renderTags, width: "280px" },
            { key: "ltv", title: "LTV", render: (row) => yen(row.ltv) },
            { key: "orders", title: "订单次数", render: (row) => row.orderCount },
            { key: "last", title: "最近消费", render: (row) => row.lastOrderAt },
            { key: "score", title: "活跃评分", render: (row) => row.activeScore },
            { key: "risk", title: "流失预警", render: (row) => <Badge tone={row.churnRisk === "high" ? "red" : row.churnRisk === "medium" ? "yellow" : "green"}>{row.churnRisk}</Badge> }
          ]}
          onView={setSelected}
          rows={customers}
        />
      </div>

      <Drawer
        footer={selected ? <CustomerDetailActions customer={selected} /> : null}
        onClose={() => setSelected(null)}
        open={Boolean(selected)}
        title="用户详细信息卡"
      >
        {selected ? <CustomerProfile customer={selected} orderRows={orderRows} /> : null}
      </Drawer>
    </>
  );
}
