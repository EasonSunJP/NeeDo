import { useNavigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { merchantNavItems } from "../../components/mobile/navItems";
import { DineFloorWorkspace, DineMenuWorkspace, DineOrderDetailWorkspace, DineOrderWorkspace } from "./merchant-workspaces";

type DineOrderRouteView = "orders" | "kds" | "serve" | "cashier";

function MerchantDineMobileShell({
  activeModule,
  children,
  subtitle,
  title
}: {
  activeModule: "dine_order" | "menu" | "floor_control";
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  const navigate = useNavigate();

  return (
    <MobileShell navItems={merchantNavItems}>
      <MobileFullscreenHeader onBack={() => navigate("/merchant")} subtitle={subtitle} title={title} />
      <div className="space-y-4 px-4 pb-28 pt-4">
        {children}
      </div>
    </MobileShell>
  );
}

export function MerchantDineOrderRoutePage({ view = "orders" }: { view?: DineOrderRouteView }) {
  return (
    <MerchantDineMobileShell activeModule="dine_order" subtitle="店内扫码订单履约中心" title="点单 / オーダー">
      <DineOrderWorkspace activeView={view} hideTopIntro />
    </MerchantDineMobileShell>
  );
}

export function MerchantDineOrderDetailRoutePage() {
  const { orderId } = useParams();

  return (
    <MerchantDineMobileShell activeModule="dine_order" subtitle="接单、出品、上菜、结账" title="点单详情">
      <DineOrderDetailWorkspace orderId={orderId} />
    </MerchantDineMobileShell>
  );
}

export function MerchantDineMenuRoutePage() {
  return (
    <MerchantDineMobileShell activeModule="menu" subtitle="扫码菜单与商品配置中心" title="菜单 / メニュー">
      <DineMenuWorkspace hideTopIntro />
    </MerchantDineMobileShell>
  );
}

export function MerchantDineFloorRoutePage() {
  return (
    <MerchantDineMobileShell activeModule="floor_control" subtitle="桌台、包厢、床位和担当状态" title="场控 / 店内">
      <DineFloorWorkspace hideTopIntro />
    </MerchantDineMobileShell>
  );
}
