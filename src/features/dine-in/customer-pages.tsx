import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { buildAdminLoginScanRedirect } from "../../auth/adminLogin";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import type { MyQrCodePurpose } from "../../components/mobile/MyQrCodeButton";
import { UnifiedScanSimulator } from "../../components/mobile/UnifiedScanSimulator";
import { Button } from "../../components/ui/Button";
import { cn, yen } from "../../lib/utils";
import { useImStore } from "../im/store";
import { isProfileSearchableForRole } from "../im/role-config";
import { useClientTheme } from "../../theme/ClientThemeProvider";
import { DineInMetricGrid, DineInStatusPill, MenuStockBadge } from "./components";
import { dineInOrderItemStatusLabels, dineInOrderStatusLabels, facilityStatusLabels } from "./labels";
import {
  getDineInOrderItems,
  getDineInSessionBillTotal,
  getDineInSessionOrders,
  getMenuItemMaximumOrderQuantity,
  getMenuItemMinimumOrderQuantity,
  getMenuItemTaxIncludedPriceJpy,
  isMenuItemSpecialOfferActive,
  useDineInStore
} from "./store";
import type { DineInCartLineInput, DineInMenuItem, DineInOrder, DineInState, MenuCategory } from "./types";

function DineInCustomerPageShell({
  action,
  children,
  forceDarkHeader = false,
  subtitle,
  title
}: {
  action?: ReactNode;
  children: ReactNode;
  forceDarkHeader?: boolean;
  subtitle?: string;
  title: string;
}) {
  const navigate = useNavigate();
  const { isNight } = useClientTheme();

  return (
    <MobileShell>
      <MobileFullscreenHeader
        action={action}
        dark={forceDarkHeader || isNight}
        onBack={() => navigate(-1)}
        subtitle={subtitle}
        title={title}
      />
      <div className="space-y-4 px-4 pb-28 pt-4">{children}</div>
    </MobileShell>
  );
}

export function DineInScanPage() {
  const navigate = useNavigate();
  const { actions } = useDineInStore();
  const imStore = useImStore("user");
  const [token, setToken] = useState("qr-table-a08");
  const [error, setError] = useState<string | null>(null);
  const [scannedUserId, setScannedUserId] = useState<string | null>(null);
  const [myQrPurpose, setMyQrPurpose] = useState<MyQrCodePurpose>("friend");
  const activeContactUserIds = useMemo(
    () => new Set(imStore.contacts.filter((contact) => contact.relationStatus === "active" && !contact.isBlocked).map((contact) => contact.targetUserId)),
    [imStore.contacts]
  );
  const availableFriendCandidates = useMemo(() => imStore.users.filter((user) => {
    if (user.id === imStore.currentUserId || user.serviceAccount) {
      return false;
    }

    if (!isProfileSearchableForRole("user", user)) {
      return false;
    }

    return !activeContactUserIds.has(user.id);
  }), [activeContactUserIds, imStore.currentUserId, imStore.users]);
  const scannedUser = scannedUserId
    ? availableFriendCandidates.find((user) => user.id === scannedUserId) ?? null
    : null;

  const resolve = (nextToken: string) => {
    const adminLoginRedirect = buildAdminLoginScanRedirect(nextToken);

    if (adminLoginRedirect) {
      setError(null);
      navigate(adminLoginRedirect);
      return;
    }

    try {
      const resolution = actions.resolveQrToken(nextToken);
      setError(null);
      navigate(resolution.action.url);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "二维码解析失败");
    }
  };

  const simulateFriendScan = () => {
    const candidate = availableFriendCandidates.find((user) => Boolean(user.userIdLabel)) ?? availableFriendCandidates[0] ?? null;

    if (!candidate) {
      return;
    }

    setError(null);
    setScannedUserId(candidate.id);
  };

  const addFriendAndOpen = async (userId: string) => {
    await imStore.addContact(userId, "聊天页添加好友", "通过扫一扫手动添加为好友");
    const conversation = await imStore.ensureDirectConversation(userId);
    navigate(`/messages/${conversation.id}`);
  };

  return (
    <DineInCustomerPageShell forceDarkHeader title="扫一扫">
      <UnifiedScanSimulator
        error={error}
        friendResult={scannedUser ? (
          <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
            <p className="text-xs font-black text-moss">扫码识别结果</p>
            <div className="mt-3 flex items-center gap-3 rounded-[22px] bg-paper p-3">
              <img alt={scannedUser.nickname} className="h-12 w-12 rounded-2xl object-cover" src={scannedUser.avatar} />
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{scannedUser.nickname}</strong>
                <p className="mt-1 truncate text-xs font-bold text-ink/48">{scannedUser.signature ?? scannedUser.region ?? scannedUser.bio ?? scannedUser.userIdLabel}</p>
              </div>
            </div>
            <Button className="mt-4 w-full rounded-2xl" onClick={() => void addFriendAndOpen(scannedUser.id)} size="lg">
              添加好友并开始聊天
            </Button>
          </section>
        ) : undefined}
        friendScanDisabled={availableFriendCandidates.length === 0}
        myQrPurpose={myQrPurpose}
        onMyQrPurposeChange={setMyQrPurpose}
        onResolveToken={resolve}
        onScanFriend={simulateFriendScan}
        onTokenChange={setToken}
        token={token}
      />
    </DineInCustomerPageShell>
  );
}

export function DineInQrRedirectPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { actions } = useDineInStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("缺少二维码 token");
      return;
    }

    try {
      const resolution = actions.resolveQrToken(token);
      navigate(resolution.action.url, { replace: true });
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "二维码解析失败");
    }
  }, [actions, navigate, token]);

  return (
    <DineInCustomerPageShell subtitle="QR Resolver" title="正在打开">
      <section className="rounded-[28px] border border-line bg-white p-6 text-center shadow-panel">
        <h2 className="text-lg font-black">{error ? "无法打开二维码" : "正在解析二维码"}</h2>
        <p className="mt-2 text-sm leading-6 text-ink/52">{error ?? "请稍候，系统会自动进入对应桌台、包厢或账单。"}</p>
        {error ? <Button className="mt-4" to="/scan" variant="secondary">返回扫码</Button> : null}
      </section>
    </DineInCustomerPageShell>
  );
}

type DineInCustomerOrderTab = "menu" | "ranking" | "confirm" | "history";

const dineInCustomerOrderTabs: Array<{ value: DineInCustomerOrderTab; label: string }> = [
  { value: "menu", label: "菜单" },
  { value: "ranking", label: "排行" },
  { value: "confirm", label: "确认" },
  { value: "history", label: "履历" }
];

function getLocalizedName(text: { zh: string; ja: string }) {
  return text.zh || text.ja;
}

function getTaxIncludedPrice(item: DineInMenuItem) {
  return getMenuItemTaxIncludedPriceJpy(item);
}

function getCartCount(cart: Record<string, number>) {
  return Object.values(cart).reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
}

function createCartLines(cart: Record<string, number>): DineInCartLineInput[] {
  return Object.entries(cart)
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
    .filter((line) => line.quantity > 0);
}

function getCartSubtotal(items: DineInMenuItem[], cart: Record<string, number>) {
  return items.reduce((sum, item) => sum + getTaxIncludedPrice(item) * (cart[item.id] ?? 0), 0);
}

function getItemPopularity(state: DineInState, menuItemId: string) {
  return state.orderItems
    .filter((item) => item.menuItemId === menuItemId && !["CANCELLED", "REFUNDED", "UNAVAILABLE"].includes(item.status))
    .reduce((sum, item) => sum + item.quantity, 0);
}

function DineInCustomerHeader({
  activeCategoryId,
  activeTab,
  categories,
  facilityLabel,
  onCategoryChange,
  onClose,
  statusLabel
}: {
  activeCategoryId?: string;
  activeTab: DineInCustomerOrderTab;
  categories: MenuCategory[];
  facilityLabel: string;
  onCategoryChange: (categoryId: string) => void;
  onClose: () => void;
  statusLabel: string;
}) {
  const activeTabLabel = dineInCustomerOrderTabs.find((tab) => tab.value === activeTab)?.label ?? "菜单";

  return (
    <header className="safe-header-top fixed inset-x-0 top-0 z-50 border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] text-[color:var(--client-text)] shadow-[0_14px_34px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)] backdrop-blur-2xl">
      <div className="mx-auto flex min-h-16 w-full max-w-[880px] items-center gap-3 px-4 pb-3">
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-black uppercase text-[color:var(--client-muted)]">{activeTabLabel}</p>
          <h1 className="mt-0.5 truncate text-2xl font-black leading-tight">{facilityLabel}</h1>
          <p className="mt-0.5 truncate text-xs font-bold text-[color:var(--client-muted)]">{statusLabel}</p>
        </div>
        <button
          aria-label="关闭"
          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] text-[color:var(--client-text)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-shadow)_14%,transparent)]"
          onClick={onClose}
          type="button"
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
          </svg>
        </button>
      </div>
      {activeTab === "menu" && categories.length > 0 ? (
        <nav className="mx-auto flex w-full max-w-[880px] gap-1 overflow-x-auto px-4 pb-3 scrollbar-none" data-scroll-drag-ignore="true">
          {categories.map((category) => {
            const active = category.id === activeCategoryId;

            return (
              <button
                aria-pressed={active}
                className={cn(
                  "focus-ring h-11 shrink-0 rounded-[18px] border px-4 text-sm font-black transition",
                  active
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                    : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-muted)]"
                )}
                key={category.id}
                onClick={() => onCategoryChange(category.id)}
                type="button"
              >
                {getLocalizedName(category.name)}
              </button>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}

function DineInQuantityControl({
  disabled = false,
  itemName,
  onDecrement,
  onIncrement,
  quantity
}: {
  disabled?: boolean;
  itemName: string;
  onDecrement: () => void;
  onIncrement: () => void;
  quantity: number;
}) {
  return (
    <div className="grid grid-cols-[36px,34px,36px] items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-1">
      <button
        aria-label={`减少${itemName}`}
        className="focus-ring grid h-8 w-8 place-items-center rounded-full text-lg font-black text-[color:var(--client-muted)] disabled:opacity-30"
        disabled={disabled || quantity <= 0}
        onClick={onDecrement}
        type="button"
      >
        -
      </button>
      <span className="text-center text-sm font-black tabular-nums text-[color:var(--client-text)]">{quantity}</span>
      <button
        aria-label={`增加${itemName}`}
        className="focus-ring grid h-8 w-8 place-items-center rounded-full bg-[color:var(--client-primary)] text-lg font-black leading-none text-[color:var(--pin-badge-glyph)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_28%,transparent)] disabled:opacity-40"
        disabled={disabled}
        onClick={onIncrement}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function DineInCustomerMenuRow({
  item,
  onDecrement,
  onIncrement,
  quantity,
  rank
}: {
  item: DineInMenuItem;
  onDecrement: () => void;
  onIncrement: () => void;
  quantity: number;
  rank?: number;
}) {
  const itemName = getLocalizedName(item.name);
  const disabled = item.stockStatus === "SOLD_OUT";
  const hasSpecialOffer = isMenuItemSpecialOfferActive(item);
  const minimumOrderQuantity = getMenuItemMinimumOrderQuantity(item);
  const maximumOrderQuantity = getMenuItemMaximumOrderQuantity(item);

  return (
    <article className="grid grid-cols-[112px,1fr] gap-3 border-b border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-3 py-3 last:border-b-0">
      <div className="relative h-24 overflow-hidden rounded-[14px] bg-[color:var(--client-surface)]">
        <img alt={itemName} className="h-full w-full object-cover" src={item.imageUrl} />
        {rank ? (
          <span className="absolute left-2 top-2 rounded-full bg-black/68 px-2 py-0.5 text-[11px] font-black text-white">No.{rank}</span>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-base font-black leading-6 text-[color:var(--client-text)]">{itemName}</h3>
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">{getLocalizedName(item.description)}</p>
          </div>
          <MenuStockBadge value={item.stockStatus} />
        </div>
        <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
          <div className="min-w-[98px]">
            {hasSpecialOffer ? (
              <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-black text-[#d64242]">
                <span className="text-[color:var(--client-muted)] line-through">{yen(item.basePriceJpy)}</span>
                <span className="animate-pulse rounded-full bg-[#d64242]/10 px-1.5 py-0.5">{item.specialOffer?.label ?? "特价"}</span>
              </p>
            ) : null}
            <p className="whitespace-nowrap text-[17px] font-black text-[#d64242]">
              {yen(getTaxIncludedPrice(item))}
              <span className="ml-1 text-[11px] text-[color:var(--client-text)]">(税込)</span>
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-[color:var(--client-muted)]">
              {item.productionArea === "BAR" ? "吧台" : item.productionArea === "KITCHEN" ? "厨房" : "服务"}
              {minimumOrderQuantity > 1 ? ` · ${minimumOrderQuantity} 个起售` : ""}
              {maximumOrderQuantity ? ` · 最多 ${maximumOrderQuantity} 个` : ""}
            </p>
          </div>
          <DineInQuantityControl
            disabled={disabled}
            itemName={itemName}
            onDecrement={onDecrement}
            onIncrement={onIncrement}
            quantity={quantity}
          />
        </div>
      </div>
    </article>
  );
}

function DineInFloatingCartButton({
  count,
  onClick,
  total
}: {
  count: number;
  onClick: () => void;
  total: number;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <button
      aria-label={`查看购物车，${count} 件`}
      className="focus-ring fixed bottom-[calc(env(safe-area-inset-bottom)+5.9rem)] right-4 z-50 grid h-16 w-16 place-items-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_20px_48px_color-mix(in_srgb,var(--client-primary)_38%,transparent)]"
      onClick={onClick}
      type="button"
    >
      <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 24 24">
        <path d="M5 6h2l1.5 9h8.8l1.6-6.5H8.1M10 19.5h.1M17 19.5h.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
      <span className="absolute -right-1 -top-1 grid h-7 min-w-7 place-items-center rounded-full bg-[#ff5b5b] px-2 text-xs font-black text-white">{count}</span>
      <span className="sr-only">{yen(total)}</span>
    </button>
  );
}

function DineInBottomOrderNav({
  activeTab,
  cartCount,
  onChange
}: {
  activeTab: DineInCustomerOrderTab;
  cartCount: number;
  onChange: (tab: DineInCustomerOrderTab) => void;
}) {
  return (
    <nav className="safe-nav-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] px-3 pt-2">
      <div className="grid grid-cols-4 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-1.5 text-[color:var(--client-text)] shadow-[0_18px_50px_color-mix(in_srgb,var(--client-shadow)_22%,transparent)] backdrop-blur-2xl">
        {dineInCustomerOrderTabs.map((tab) => {
          const active = activeTab === tab.value;

          return (
            <button
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring relative min-h-[52px] rounded-[18px] px-2 text-[12px] font-black transition",
                active ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)]" : "text-[color:var(--client-muted)]"
              )}
              key={tab.value}
              onClick={() => onChange(tab.value)}
              type="button"
            >
              {tab.label}
              {tab.value === "confirm" && cartCount > 0 ? (
                <span className="absolute right-2 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ff5b5b] px-1 text-[10px] text-white">{cartCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function DineInCustomerMenuPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { state, actions } = useDineInStore();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<DineInCustomerOrderTab>("menu");
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>();
  const [lastSubmittedOrderId, setLastSubmittedOrderId] = useState<string | null>(null);
  const session = state.diningSessions.find((item) => item.id === sessionId);
  const facility = session ? state.facilityUnits.find((unit) => unit.id === session.facilityUnitId) : undefined;
  const availableMenus = useMemo(() => {
    if (!facility) {
      return [];
    }

    return state.menus.filter((menu) => menu.active && (!menu.facilityTypeScope || menu.facilityTypeScope.includes(facility.type)));
  }, [facility, state.menus]);
  const visibleItems = useMemo(() => {
    const menuIds = new Set(availableMenus.map((menu) => menu.id));

    return state.menuItems.filter((item) =>
      item.active &&
      menuIds.has(item.menuId) &&
      (!facility || !item.facilityTypeScope || item.facilityTypeScope.includes(facility.type))
    );
  }, [availableMenus, facility, state.menuItems]);
  const visibleCategories = useMemo(() => {
    const menuIds = new Set(availableMenus.map((menu) => menu.id));
    const itemCategoryIds = new Set(visibleItems.map((item) => item.categoryId));

    return state.menuCategories
      .filter((category) => menuIds.has(category.menuId) && itemCategoryIds.has(category.id))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }, [availableMenus, state.menuCategories, visibleItems]);
  const cartLines = useMemo(() => createCartLines(cart), [cart]);
  const cartCount = useMemo(() => getCartCount(cart), [cart]);
  const cartSubtotal = useMemo(() => getCartSubtotal(visibleItems, cart), [cart, visibleItems]);
  const facilityFee = facility?.metadata?.facilityFeeJpy ?? 0;
  const serviceFee = Math.round(cartSubtotal * 0.1);
  const confirmationTotal = cartSubtotal + serviceFee + facilityFee;
  const activeCategory = visibleCategories.find((category) => category.id === activeCategoryId) ?? visibleCategories[0];
  const menuItemsForActiveCategory = activeCategory
    ? visibleItems.filter((item) => item.categoryId === activeCategory.id)
    : visibleItems;
  const rankedItems = useMemo(
    () => [...visibleItems].sort((left, right) => {
      const popularityDelta = getItemPopularity(state, right.id) - getItemPopularity(state, left.id);

      if (popularityDelta !== 0) {
        return popularityDelta;
      }

      return getTaxIncludedPrice(right) - getTaxIncludedPrice(left);
    }),
    [state, visibleItems]
  );
  const sessionOrders = useMemo(
    () => session ? getDineInSessionOrders(state, session.id) : [],
    [session, state]
  );

  useEffect(() => {
    if (!activeCategoryId && visibleCategories[0]) {
      setActiveCategoryId(visibleCategories[0].id);
      return;
    }

    if (activeCategoryId && visibleCategories.length > 0 && !visibleCategories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(visibleCategories[0].id);
    }
  }, [activeCategoryId, visibleCategories]);

  const increaseItem = (itemId: string) => {
    const item = visibleItems.find((candidate) => candidate.id === itemId);

    if (!item || item.stockStatus === "SOLD_OUT") {
      return;
    }

    setCart((current) => {
      const currentQuantity = current[itemId] ?? 0;
      const minimumOrderQuantity = getMenuItemMinimumOrderQuantity(item);
      const maximumOrderQuantity = getMenuItemMaximumOrderQuantity(item);
      const nextQuantity = currentQuantity > 0 ? currentQuantity + 1 : minimumOrderQuantity;

      return { ...current, [itemId]: maximumOrderQuantity ? Math.min(maximumOrderQuantity, nextQuantity) : nextQuantity };
    });
  };

  const decreaseItem = (itemId: string) => {
    setCart((current) => {
      const item = visibleItems.find((candidate) => candidate.id === itemId);
      const currentQuantity = current[itemId] ?? 0;
      const minimumOrderQuantity = item ? getMenuItemMinimumOrderQuantity(item) : 1;
      const nextQuantity = currentQuantity <= minimumOrderQuantity ? 0 : currentQuantity - 1;
      const next = { ...current };

      if (nextQuantity > 0) {
        next[itemId] = nextQuantity;
      } else {
        delete next[itemId];
      }

      return next;
    });
  };

  const submitOrder = () => {
    if (!session || cartLines.length === 0) {
      return;
    }

    const order = actions.createOrder(session.id, cartLines satisfies DineInCartLineInput[]);
    setCart({});
    setLastSubmittedOrderId(order.id);
    setActiveTab("history");
  };

  if (!session || !facility) {
    return (
      <DineInCustomerPageShell title="店内菜单">
        <section className="rounded-[28px] border border-line bg-white p-6 text-center shadow-panel">
          <h2 className="text-lg font-black">会话不存在</h2>
          <p className="mt-2 text-sm leading-6 text-ink/52">请重新扫码进入店内点单。</p>
          <Button className="mt-4" to="/scan">去扫码</Button>
        </section>
      </DineInCustomerPageShell>
    );
  }

  const renderItemRows = (items: DineInMenuItem[], options: { ranking?: boolean } = {}) => (
    <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
      {items.length > 0 ? (
        items.map((item, index) => (
          <DineInCustomerMenuRow
            item={item}
            key={item.id}
            onDecrement={() => decreaseItem(item.id)}
            onIncrement={() => increaseItem(item.id)}
            quantity={cart[item.id] ?? 0}
            rank={options.ranking ? index + 1 : undefined}
          />
        ))
      ) : (
        <div className="px-4 py-12 text-center text-sm font-bold text-[color:var(--client-muted)]">当前分类暂无可点餐项目</div>
      )}
    </section>
  );

  const renderConfirm = () => {
    if (cartLines.length === 0) {
      return (
        <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 py-12 text-center shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
          <h2 className="text-xl font-black">还没有选择菜品</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">先回到菜单或排行，点击加号加入购物车。</p>
          <Button className="mt-5 rounded-2xl" onClick={() => setActiveTab("menu")}>去点餐</Button>
        </section>
      );
    }

    return (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
          {cartLines.map((line) => {
            const item = visibleItems.find((candidate) => candidate.id === line.menuItemId);

            if (!item) {
              return null;
            }

            const itemName = getLocalizedName(item.name);

            return (
              <div className="flex items-center gap-3 border-b border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] px-4 py-3 last:border-b-0" key={line.menuItemId}>
                <img alt={itemName} className="h-16 w-16 shrink-0 rounded-[14px] object-cover" src={item.imageUrl} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-black text-[color:var(--client-text)]">{itemName}</h3>
                  {isMenuItemSpecialOfferActive(item) ? (
                    <p className="mt-1 text-[11px] font-black text-[#d64242]">
                      <span className="mr-1 text-[color:var(--client-muted)] line-through">{yen(item.basePriceJpy)}</span>
                      {item.specialOffer?.label ?? "特价"}
                    </p>
                  ) : null}
                  <p className="mt-1 whitespace-nowrap text-sm font-black text-[#d64242]">
                    {yen(getTaxIncludedPrice(item))}
                    <span className="ml-1 text-[11px] text-[color:var(--client-text)]">(税込)</span>
                  </p>
                </div>
                <DineInQuantityControl
                  itemName={itemName}
                  onDecrement={() => decreaseItem(item.id)}
                  onIncrement={() => increaseItem(item.id)}
                  quantity={line.quantity}
                />
              </div>
            );
          })}
        </section>
        <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] p-4 shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
          <div className="space-y-2 text-sm font-bold text-[color:var(--client-muted)]">
            <div className="flex justify-between gap-3"><span>商品小计（税込）</span><strong className="text-[color:var(--client-text)]">{yen(cartSubtotal)}</strong></div>
            <div className="flex justify-between gap-3"><span>服务费</span><strong className="text-[color:var(--client-text)]">{yen(serviceFee)}</strong></div>
            {facilityFee > 0 ? <div className="flex justify-between gap-3"><span>席位费</span><strong className="text-[color:var(--client-text)]">{yen(facilityFee)}</strong></div> : null}
          </div>
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] pt-4">
            <div>
              <p className="text-xs font-black text-[color:var(--client-muted)]">确认金额</p>
              <strong className="text-2xl font-black text-[color:var(--client-text)]">{yen(confirmationTotal)}</strong>
            </div>
            <Button className="rounded-2xl" onClick={submitOrder} size="lg">确认下单</Button>
          </div>
        </section>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="space-y-3">
      {sessionOrders.length > 0 ? (
        sessionOrders.map((order: DineInOrder) => {
          const items = getDineInOrderItems(state, order.id);
          const isLatest = order.id === lastSubmittedOrderId;

          return (
            <Link
              className={cn(
                "block rounded-[24px] border bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] p-4 shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)] transition",
                isLatest ? "border-[color:var(--client-primary)]" : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]"
              )}
              key={order.id}
              to={`/dine/orders/${order.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black uppercase text-[color:var(--client-muted)]">{order.orderNo}</p>
                  <h3 className="mt-1 text-lg font-black text-[color:var(--client-text)]">{dineInOrderStatusLabels[order.status]}</h3>
                  <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{new Date(order.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <strong className="shrink-0 text-lg font-black text-[color:var(--client-text)]">{yen(order.totalJpy)}</strong>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {items.map((item) => (
                  <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-bg)_72%,transparent)] px-2.5 py-1 text-xs font-bold text-[color:var(--client-muted)]" key={item.id}>
                    {item.nameSnapshot} x{item.quantity}
                  </span>
                ))}
              </div>
            </Link>
          );
        })
      ) : (
        <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-5 py-12 text-center shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
          <h2 className="text-xl font-black">还没有点单履历</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">确认下单后，履历会显示本桌所有订单。</p>
        </section>
      )}
    </div>
  );

  return (
    <MobileShell className="!pb-0" navItems={[]} showTopEdgeMask={false}>
      <div className="min-h-[100dvh] bg-[color:var(--client-bg)] text-[color:var(--client-text)]">
        <DineInCustomerHeader
          activeCategoryId={activeCategory?.id}
          activeTab={activeTab}
          categories={visibleCategories}
          facilityLabel={facility.label}
          onCategoryChange={(categoryId) => {
            setActiveCategoryId(categoryId);
            setActiveTab("menu");
          }}
          onClose={() => navigate("/scan")}
          statusLabel={`${facilityStatusLabels[facility.status]} · ${availableMenus.map((menu) => getLocalizedName(menu.name)).join(" / ")}`}
        />
        <main className={cn("mx-auto w-full max-w-[880px] px-4 pb-[calc(env(safe-area-inset-bottom)+6.25rem)]", activeTab === "menu" ? "pt-[calc(env(safe-area-inset-top)+9.75rem)]" : "pt-[calc(env(safe-area-inset-top)+6.7rem)]")}>
          {activeTab === "menu" ? (
            <div className="space-y-3">
              {activeCategory ? (
                <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-4 py-3">
                  <h2 className="text-xl font-black">{getLocalizedName(activeCategory.name)}</h2>
                  <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">价格均以税込显示，可用加减按钮一次选择多个同一菜品。</p>
                </div>
              ) : null}
              {renderItemRows(menuItemsForActiveCategory)}
            </div>
          ) : activeTab === "ranking" ? (
            <div className="space-y-3">
              <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-4 py-3">
                <h2 className="text-xl font-black">点单排行</h2>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">根据本店历史点单数量排序。</p>
              </div>
              {renderItemRows(rankedItems, { ranking: true })}
            </div>
          ) : activeTab === "confirm" ? (
            renderConfirm()
          ) : (
            renderHistory()
          )}
        </main>
        {activeTab !== "confirm" ? (
          <DineInFloatingCartButton count={cartCount} onClick={() => setActiveTab("confirm")} total={confirmationTotal} />
        ) : null}
        <DineInBottomOrderNav activeTab={activeTab} cartCount={cartCount} onChange={setActiveTab} />
      </div>
    </MobileShell>
  );
}

export function DineInOrderProgressPage() {
  const { orderId } = useParams();
  const { state } = useDineInStore();
  const order = state.orders.find((item) => item.id === orderId);
  const items = order ? getDineInOrderItems(state, order.id) : [];
  const facility = order ? state.facilityUnits.find((unit) => unit.id === order.facilityUnitId) : undefined;

  if (!order) {
    return (
      <DineInCustomerPageShell title="点单进度">
        <section className="rounded-[28px] border border-line bg-white p-6 text-center shadow-panel">
          <h2 className="text-lg font-black">订单不存在</h2>
          <Button className="mt-4" to="/scan">重新扫码</Button>
        </section>
      </DineInCustomerPageShell>
    );
  }

  return (
    <DineInCustomerPageShell subtitle={facility?.label} title="点单进度">
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-ink/35">{order.orderNo}</p>
            <h2 className="mt-1 text-xl font-black">{dineInOrderStatusLabels[order.status]}</h2>
          </div>
          <DineInStatusPill>{yen(order.totalJpy)}</DineInStatusPill>
        </div>
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-3 py-3" key={item.id}>
              <div>
                <strong className="text-sm">{item.nameSnapshot} x{item.quantity}</strong>
                <p className="mt-1 text-xs text-ink/45">{item.optionsSnapshot.join(" / ") || "无规格"}</p>
              </div>
              <DineInStatusPill>{dineInOrderItemStatusLabels[item.status]}</DineInStatusPill>
            </div>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <Button to={`/dine/${order.sessionId}/menu`} variant="secondary">继续加单</Button>
        <Button to={`/dine/${order.sessionId}/bill`}>查看账单</Button>
      </div>
    </DineInCustomerPageShell>
  );
}

export function DineInBillPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { state, actions } = useDineInStore();
  const session = state.diningSessions.find((item) => item.id === sessionId);
  const facility = session ? state.facilityUnits.find((unit) => unit.id === session.facilityUnitId) : undefined;
  const orders = session ? getDineInSessionOrders(state, session.id) : [];
  const total = session ? getDineInSessionBillTotal(state, session.id) : 0;
  const pendingPayment = session ? state.payments.find((payment) => payment.sessionId === session.id && payment.status !== "CONFIRMED") : undefined;

  const requestCheckout = () => {
    if (!session) {
      return;
    }

    actions.requestCheckout(session.id, "CASH");
  };

  if (!session) {
    return (
      <DineInCustomerPageShell title="账单">
        <section className="rounded-[28px] border border-line bg-white p-6 text-center shadow-panel">
          <h2 className="text-lg font-black">会话不存在</h2>
          <Button className="mt-4" to="/scan">重新扫码</Button>
        </section>
      </DineInCustomerPageShell>
    );
  }

  return (
    <DineInCustomerPageShell subtitle={facility?.label} title="账单">
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <DineInMetricGrid items={[["点单数", `${orders.length} 单`], ["状态", facility ? facilityStatusLabels[facility.status] : "未知"], ["合计", yen(total)], ["支付", pendingPayment ? "待确认" : "未发起"]]} />
        <div className="mt-4 space-y-3">
          {orders.map((order) => (
            <Link className="block rounded-2xl bg-paper px-3 py-3" key={order.id} to={`/dine/orders/${order.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-ink/45">{order.orderNo}</p>
                  <strong className="text-sm">{dineInOrderStatusLabels[order.status]}</strong>
                </div>
                <strong>{yen(order.totalJpy)}</strong>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <Button className="w-full rounded-2xl" disabled={orders.length === 0} onClick={requestCheckout} size="lg">
        发起线下结账
      </Button>
      {pendingPayment ? (
        <section className="rounded-[24px] bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-700">
          已生成线下支付记录，等待商户端收银确认。确认后会出现评价入口。
        </section>
      ) : null}
      {state.reviewIntents.find((intent) => intent.sessionId === session.id && intent.status === "OPEN") ? (
        <Button className="w-full rounded-2xl" onClick={() => navigate(`/reviews/new?intent_id=${state.reviewIntents.find((intent) => intent.sessionId === session.id && intent.status === "OPEN")?.id}`)} variant="secondary">
          去评价
        </Button>
      ) : null}
    </DineInCustomerPageShell>
  );
}

export function DineInReviewPage() {
  const [searchParams] = useSearchParams();
  const { state } = useDineInStore();
  const intentId = searchParams.get("intent_id");
  const intent = state.reviewIntents.find((item) => item.id === intentId);

  return (
    <DineInCustomerPageShell subtitle="支付完成后自动生成" title="评价">
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-panel">
        <h2 className="text-xl font-black">{intent ? "本次体验评价" : "评价入口未生成"}</h2>
        <p className="mt-2 text-sm leading-6 text-ink/52">
          {intent ? "可评价店铺、单品、服务员、担当技师和本次会话，后续会同步到聊天 ReviewCard。" : "请先完成收款确认，再从账单页进入评价。"}
        </p>
        {intent ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {intent.targets.map((target) => (
              <button className="rounded-2xl border border-line bg-paper px-3 py-3 text-sm font-black" key={target} type="button">
                {target}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </DineInCustomerPageShell>
  );
}

export function DineInItemDetailPage() {
  const { itemId } = useParams();
  const { state } = useDineInStore();
  const item = state.menuItems.find((candidate) => candidate.id === itemId);

  if (!item) {
    return (
      <DineInCustomerPageShell title="商品详情">
        <section className="rounded-[28px] border border-line bg-white p-6 text-center shadow-panel">商品不存在</section>
      </DineInCustomerPageShell>
    );
  }

  return (
    <DineInCustomerPageShell subtitle={item.name.ja} title={item.name.zh}>
      <img alt={item.name.zh} className="h-64 w-full rounded-[28px] object-cover shadow-panel" src={item.imageUrl} />
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{item.name.zh}</h2>
            <p className="mt-2 text-sm leading-6 text-ink/52">{item.description.zh}</p>
          </div>
          <MenuStockBadge value={item.stockStatus} />
        </div>
        <div className="mt-4">
          {isMenuItemSpecialOfferActive(item) ? (
            <p className="text-sm font-black text-[#d64242]">
              <span className="mr-2 text-ink/35 line-through">{yen(item.basePriceJpy)}</span>
              {item.specialOffer?.label ?? "特价"}
            </p>
          ) : null}
          <strong className="block text-2xl">{yen(getTaxIncludedPrice(item))}<span className="ml-1 text-xs">(税込)</span></strong>
          {getMenuItemMinimumOrderQuantity(item) > 1 ? (
            <p className="mt-1 text-xs font-bold text-ink/45">{getMenuItemMinimumOrderQuantity(item)} 个起售</p>
          ) : null}
          {getMenuItemMaximumOrderQuantity(item) ? (
            <p className="mt-1 text-xs font-bold text-ink/45">最多 {getMenuItemMaximumOrderQuantity(item)} 个</p>
          ) : null}
        </div>
      </section>
    </DineInCustomerPageShell>
  );
}
