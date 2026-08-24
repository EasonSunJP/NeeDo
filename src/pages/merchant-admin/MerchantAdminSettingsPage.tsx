import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeShopPayload,
  type MerchantShopUpdateInput
} from "../../api/backofficeRealData";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

type ShopDraft = {
  name: string;
  description: string;
  city: string;
  address: string;
  phone: string;
};

const emptyDraft: ShopDraft = {
  name: "",
  description: "",
  city: "",
  address: "",
  phone: ""
};

const inputClassName = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss";

const unavailableCapabilities = [
  {
    title: "图片与轮播尚未启用",
    description: "需要媒体文件表、对象存储、上传策略、删除审计和前台读取合同后才能开放。"
  },
  {
    title: "营业时段尚未启用",
    description: "需要带时区的 OpeningHours 数据模型、例外日期和店铺范围写 API 后才能开放。"
  },
  {
    title: "证照与展示装修尚未启用",
    description: "需要文件审核状态、版本记录以及店铺展示配置表，当前不会保存到浏览器。"
  },
  {
    title: "地图、导航与 eKYC 尚未启用",
    description: "这些能力依赖外部付费服务与生产密钥；接入前不会显示可点击的假操作。"
  }
];

function createDraft(shop: BackofficeShopPayload): ShopDraft {
  return {
    name: shop.name,
    description: shop.description ?? "",
    city: shop.city,
    address: shop.address,
    phone: shop.phone ?? ""
  };
}

function toUpdateInput(draft: ShopDraft): MerchantShopUpdateInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    city: draft.city.trim(),
    address: draft.address.trim(),
    phone: draft.phone.trim() || null
  };
}

export function MerchantAdminSettingsPage() {
  const [searchParams] = useSearchParams();
  const [shop, setShop] = useState<BackofficeShopPayload | null>(null);
  const [draft, setDraft] = useState<ShopDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const page = await backofficeRealDataApi.merchantShop();
      const currentShop = page.list[0] ?? null;
      setShop(currentShop);
      setDraft(currentShop ? createDraft(currentShop) : emptyDraft);
    } catch (loadError) {
      setShop(null);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasRequiredFields = useMemo(
    () => Boolean(draft.name.trim() && draft.city.trim() && draft.address.trim()),
    [draft.address, draft.city, draft.name]
  );
  const isDirty = useMemo(
    () => Boolean(shop && JSON.stringify(createDraft(shop)) !== JSON.stringify(draft)),
    [draft, shop]
  );

  const save = async () => {
    if (!shop || !hasRequiredFields || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await backofficeRealDataApi.updateMerchantShop(toUpdateInput(draft));
      setShop(updated);
      setDraft(createDraft(updated));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!shop) return;
    setDraft(createDraft(shop));
    setError("");
    setSaved(false);
  };

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="门店设置"
        description="维护当前登录店铺已进入正式数据库合同的基础资料。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button disabled={!isDirty || saving} onClick={reset} variant="secondary">还原未保存修改</Button>
            <Button disabled={!shop || !hasRequiredFields || !isDirty || saving} onClick={() => void save()}>
              {saving ? "正在保存..." : "保存基础资料"}
            </Button>
          </div>
        }
      >
        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{error}</span>
            <Button onClick={() => void load()} size="sm" variant="secondary">重新加载店铺资料</Button>
          </div>
        ) : null}

        {saved ? (
          <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
            店铺基础资料已保存并写入数据库
          </p>
        ) : null}

        {loading ? (
          <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/55 shadow-panel">
            正在读取当前店铺正式资料...
          </p>
        ) : null}

        {!loading && !error && !shop ? (
          <div className="rounded-lg border border-line bg-white p-6 shadow-panel">
            <h2 className="text-lg font-black text-ink">当前身份没有可管理的店铺</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/55">请检查当前活动身份是否为有效店铺身份，或联系运营人员完成店铺绑定。</p>
            <Button className="mt-4" onClick={() => void load()} variant="secondary">重新加载店铺资料</Button>
          </div>
        ) : null}

        {shop ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className={`rounded-lg border border-line bg-white p-5 shadow-panel ${searchParams.get("focus") === "basic" ? "ring-2 ring-moss/25" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-ink">正式基础资料</h2>
                  <p className="mt-1 text-sm font-bold text-ink/50">保存后直接写入当前店铺记录，并生成审计日志。</p>
                </div>
                <Badge tone={shop.status === "published" ? "green" : "yellow"}>{shop.status}</Badge>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black">店铺名称</span>
                  <input className={inputClassName} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required value={draft.name} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">城市</span>
                  <input className={inputClassName} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} required value={draft.city} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-black">门店地址</span>
                  <input className={inputClassName} maxLength={255} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} required value={draft.address} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">联系电话</span>
                  <input className={inputClassName} maxLength={32} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} type="tel" value={draft.phone} />
                  <span className="mt-1 block text-xs font-bold text-ink/45">留空表示不公开；填写时至少 5 个字符。</span>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-black">店铺简介</span>
                  <textarea className="min-h-[150px] w-full rounded-lg border border-line bg-paper px-3 py-3 text-sm font-bold outline-none focus:border-moss" maxLength={5000} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} />
                  <span className="mt-1 block text-right text-xs font-bold text-ink/45">{draft.description.length} / 5000</span>
                </label>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
                <h2 className="font-black text-ink">数据库记录</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    ["店铺 ID", shop.id],
                    ["负责人邮箱", shop.ownerEmail ?? "未设置"],
                    ["平台推荐", shop.isRecommended ? "是" : "否"],
                    ["创建时间", new Date(shop.createdAt).toLocaleString("ja-JP")]
                  ].map(([label, value]) => (
                    <div className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0" key={label}>
                      <dt className="font-bold text-ink/45">{label}</dt>
                      <dd className="max-w-[210px] break-words text-right font-black text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <div className="flex flex-wrap gap-2">
                <Button to="/merchant-admin/orders" variant="secondary">查看正式订单</Button>
                <Button to="/merchant-admin/people?module=staff" variant="secondary">查看本店技师</Button>
              </div>
            </aside>
          </div>
        ) : null}

        <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-ink">尚未进入正式数据合同的设置</h2>
              <p className="mt-1 text-sm font-bold text-ink/50">完成对应表、接口、权限和审计后再逐项开放。</p>
            </div>
            <Badge tone="yellow">明确禁用</Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {unavailableCapabilities.map((capability) => (
              <article className="rounded-lg border border-line bg-paper p-4" key={capability.title}>
                <h3 className="text-sm font-black text-ink">{capability.title}</h3>
                <p className="mt-2 text-xs font-bold leading-6 text-ink/55">{capability.description}</p>
              </article>
            ))}
          </div>
        </section>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
