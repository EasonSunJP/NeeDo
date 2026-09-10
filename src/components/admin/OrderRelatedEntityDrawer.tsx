import { useEffect, useState } from "react";
import {
  backofficeRealDataApi,
  type BackofficeCustomerDetailPayload,
  type BackofficeOrderDetailPayload,
  type BackofficeScope,
  type BackofficeServicePayload,
  type BackofficeShopPayload,
  type BackofficeTechnicianDetailPayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { yen } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { DetailGrid } from "./DetailGrid";
import { FormalCustomerDetailPanel, FormalTechnicianDetailPanel } from "./FormalProfileDetailPanels";

export type OrderRelatedEntity = "customer" | "technician" | "shop" | "service" | null;

type RelatedDetail =
  | { type: "customer"; value: BackofficeCustomerDetailPayload }
  | { type: "technician"; value: BackofficeTechnicianDetailPayload }
  | { type: "shop"; value: BackofficeShopPayload }
  | { type: "service"; value: BackofficeServicePayload };

async function findExactIdInPages<T extends { id: number }>(
  id: number,
  loadPage: (page: number) => Promise<{ list: T[]; total: number }>
) {
  const pageSize = 100;
  for (let page = 1; ; page += 1) {
    const response = await loadPage(page);
    const match = response.list.find((item) => item.id === id);
    if (match) return match;
    if (page * pageSize >= response.total || response.list.length === 0) return null;
  }
}

async function findShop(scope: BackofficeScope, order: BackofficeOrderDetailPayload) {
  if (scope === "merchant-admin") {
    const response = await backofficeRealDataApi.merchantShop();
    return response.list.find((shop) => shop.id === order.shopId) ?? null;
  }
  const fastResult = await backofficeRealDataApi.shops(scope, {
    keyword: order.shopName,
    page: 1,
    pageSize: 100
  });
  const match = fastResult.list.find((shop) => shop.id === order.shopId);
  return match ?? findExactIdInPages(
    order.shopId,
    (page) => backofficeRealDataApi.shops(scope, { page, pageSize: 100 })
  );
}

async function findService(scope: BackofficeScope, order: BackofficeOrderDetailPayload) {
  if (!order.serviceId) return null;
  const fastResult = await backofficeRealDataApi.services(scope, {
    keyword: order.serviceName,
    page: 1,
    pageSize: 100
  });
  const match = fastResult.list.find((service) => service.id === order.serviceId);
  return match ?? findExactIdInPages(
    order.serviceId,
    (page) => backofficeRealDataApi.services(scope, { page, pageSize: 100 })
  );
}

function describeRelatedEntityError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return "当前身份没有查看该资料的权限";
    if (error.status === 404) return "资料不存在或已不可见";
  }
  return fallback;
}

export function OrderRelatedEntityDrawer({
  entity,
  onClose,
  order,
  scope
}: {
  entity: OrderRelatedEntity;
  onClose: () => void;
  order: BackofficeOrderDetailPayload | null;
  scope: BackofficeScope;
}) {
  const { language } = useOptionalI18n();
  const [detail, setDetail] = useState<RelatedDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const t = (source: string) => translateText(source, language);

  useEffect(() => {
    let current = true;
    setDetail(null);
    setError("");
    if (!entity || !order) return () => { current = false; };

    const request = entity === "customer"
      ? order.customerProfileId
        ? backofficeRealDataApi.customer(scope, order.customerProfileId)
            .then((value) => ({ type: "customer" as const, value }))
        : Promise.resolve(null)
      : entity === "technician"
        ? order.technicianProfileId
          ? backofficeRealDataApi.technician(scope, order.technicianProfileId)
              .then((value) => ({ type: "technician" as const, value }))
          : Promise.resolve(null)
        : entity === "shop"
          ? findShop(scope, order).then((value) => value ? ({ type: "shop" as const, value }) : null)
          : findService(scope, order).then((value) => value ? ({ type: "service" as const, value }) : null);

    setLoading(true);
    void request.then((value) => {
      if (!current) return;
      if (!value) {
        setError(t("该订单没有可查看的关联资料"));
        return;
      }
      setDetail(value);
    }).catch((cause: unknown) => {
      if (current) setError(t(describeRelatedEntityError(cause, "关联资料读取失败，请重试")));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [entity, language, order, revision, scope]);

  const title = entity === "customer"
    ? "用户详细信息"
    : entity === "technician"
      ? "技师详细信息"
      : entity === "shop"
        ? "店铺详细信息"
        : "服务详细信息";

  return (
    <Drawer
      defaultWidth={900}
      layer="overlay"
      maxWidth={1160}
      onClose={onClose}
      open={Boolean(entity && order)}
      title={t(title)}
      widthStorageKey="needo.ui.drawer.order-related-entity.width"
    >
      {loading ? (
        <p className="rounded-2xl border border-line bg-paper px-5 py-8 text-center text-sm font-black text-ink/55">
          {t("正在读取关联资料...")}
        </p>
      ) : error ? (
        <div className="rounded-2xl border border-coral/30 bg-coral/5 px-5 py-6 text-center" role="alert">
          <p className="text-sm font-black text-coral">{error}</p>
          <Button className="mt-4" onClick={() => setRevision((value) => value + 1)} size="sm" variant="secondary">
            {t("重新加载")}
          </Button>
        </div>
      ) : detail?.type === "customer" ? (
        <FormalCustomerDetailPanel
          detail={detail.value}
          directoryScope={scope === "backoffice" ? "operations" : "merchant"}
        />
      ) : detail?.type === "technician" ? (
        <FormalTechnicianDetailPanel
          detail={detail.value}
          workStatusScope={scope}
        />
      ) : detail?.type === "shop" ? (
        <DetailGrid items={[
          { label: t("店铺名称"), value: detail.value.name },
          { label: t("状态"), value: <Badge tone={detail.value.status === "published" ? "green" : "yellow"}>{detail.value.status}</Badge> },
          { label: t("城市"), value: detail.value.city },
          { label: t("地址"), value: detail.value.address },
          { label: t("联系电话"), value: detail.value.phone ?? t("未设置") },
          { label: t("店主账号"), value: detail.value.ownerEmail ?? t("未绑定") },
          { label: t("店铺介绍"), value: detail.value.description ?? t("未设置") }
        ]} />
      ) : detail?.type === "service" ? (
        <DetailGrid items={[
          { label: t("服务名称"), value: detail.value.name },
          { label: t("所属店铺"), value: order?.shopName ?? t("未设置") },
          { label: t("服务分类"), value: detail.value.categoryName },
          { label: t("服务方式"), value: detail.value.serviceMode === "store" ? t("到店服务") : t("上门服务") },
          { label: t("服务价格"), value: yen(detail.value.priceAmount) },
          { label: t("服务时长"), value: `${detail.value.durationMinutes}${t("分钟")}` },
          { label: t("城市"), value: detail.value.city },
          { label: t("状态"), value: <Badge tone={detail.value.status === "published" ? "green" : "yellow"}>{detail.value.status}</Badge> },
          { label: t("服务介绍"), value: detail.value.description ?? t("未设置") }
        ]} />
      ) : null}
    </Drawer>
  );
}
