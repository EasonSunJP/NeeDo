import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { SegmentedTabs } from "../../components/client-ui/AppScaffold";
import { ImageGalleryManager } from "../../components/ui/ImageGalleryManager";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { merchantAdminDemo } from "../../data/merchantAdmin";
import { readImageFileAsDataUrl } from "../../lib/imageUpload";
import {
  detectStorePresentationIndustry,
  getStorePresentationConfig,
  normalizeStorePresentationConfig
} from "../../lib/storePresentation";
import { updateStoreEntity, useEntityStore } from "../../state/entityStore";
import { useProfileCardBackgroundSettings } from "../../state/profileCardBackgroundStore";
import type { Store, StorePresentationConfig } from "../../types/domain";

const merchantTagPool = ["深夜营业", "女性友好", "到店主力", "上门服务", "可预约", "多语言", "企业合作", "高复购"];

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split(/\n|,|，|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createStoreDraft(store: Store) {
  const industry = detectStorePresentationIndustry(store);

  return {
    cover: store.cover,
    gallery: [...store.gallery].slice(0, 5),
    name: store.name,
    area: store.area,
    address: store.address,
    businessHours: store.businessHours,
    nextSlot: store.nextSlot,
    priceLabel: store.priceLabel,
    rankLabel: store.rankLabel,
    description: store.description,
    tags: [...store.tags],
    mode: store.mode,
    presentation: getStorePresentationConfig(store, industry)
  };
}

export function MerchantAdminSettingsPage() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { stores, technicians } = useEntityStore();
  const profileCardBackgroundSettings = useProfileCardBackgroundSettings();
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const focus = searchParams.get("focus");
  const focusModule = searchParams.get("module");
  const availableTags = useMemo(() => Array.from(new Set([...merchantTagPool, ...store.tags])), [store.tags]);
  const [draft, setDraft] = useState(() => createStoreDraft(store));
  const updatePresentationDraft = <Key extends keyof StorePresentationConfig>(key: Key, value: StorePresentationConfig[Key]) => {
    setDraft((current) => ({ ...current, presentation: { ...current.presentation, [key]: value } }));
  };

  useEffect(() => {
    setDraft(createStoreDraft(store));
  }, [
    store.id,
    store.cover,
    store.gallery,
    store.name,
    store.area,
    store.address,
    store.businessHours,
    store.nextSlot,
    store.priceLabel,
    store.rankLabel,
    store.description,
    store.tags,
    store.mode,
    store.presentation
  ]);
  const handleCoverUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const nextCover = await readImageFileAsDataUrl(file);
    setDraft((current) => ({ ...current, cover: nextCover }));
    event.target.value = "";
  };

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="门店设置"
        description="PC 后台现在可以直接维护店铺展示内容，和商户手机端改的是同一份门店资料。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setDraft(createStoreDraft(store))}
            >
              还原当前内容
            </Button>
            <Button
              onClick={() =>
                updateStoreEntity(store.id, {
                  cover: draft.cover,
                  gallery: draft.gallery.slice(0, 5),
                  name: draft.name,
                  area: draft.area,
                  address: draft.address,
                  businessHours: draft.businessHours,
                  nextSlot: draft.nextSlot,
                  priceLabel: draft.priceLabel,
                  rankLabel: draft.rankLabel,
                  description: draft.description,
                  tags: draft.tags,
                  mode: draft.mode,
                  presentation: normalizeStorePresentationConfig(draft.presentation, detectStorePresentationIndustry({ tags: draft.tags }))
                })
              }
            >
              保存到前台
            </Button>
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[1fr,0.9fr]">
          <section className="space-y-4">
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="这里看到的就是商户手机端【服务展示】里正在使用的资料结构。"
                  label="门店展示预览说明"
                  title="门店展示预览"
                  titleClassName="font-black"
                  variant="paper"
                />
                <Badge tone="green">已同步前台</Badge>
              </div>
              <div className="mt-4 overflow-hidden rounded-[28px] border border-line bg-paper">
                <img alt={draft.name} className="h-56 w-full object-cover" src={draft.gallery[0] ?? draft.cover} />
                <div className="space-y-3 p-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">{draft.rankLabel}</p>
                    <h3 className="mt-2 text-[28px] font-black">{draft.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink/65">{draft.presentation.subtitle}</p>
                    <p className="mt-2 text-sm text-ink/60">{draft.address}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["服务区域", draft.area],
                      ["最近车站", draft.presentation.station],
                      ["营业时间", draft.businessHours],
                      ["最近可约", draft.nextSlot],
                      ["价格说明", draft.priceLabel]
                    ].map(([label, value]) => (
                      <div className="rounded-[18px] bg-white p-3" key={label}>
                        <p className="text-xs font-bold text-ink/45">{label}</p>
                        <strong className="mt-1 block text-sm">{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className={`rounded-lg border border-line bg-white p-4 shadow-panel ${focus === "gallery" ? "ring-2 ring-moss/25" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="顶部轮播、缩略图和环境图都从这里统一维护。"
                  label="图片内容说明"
                  title="图片内容"
                  titleClassName="font-black"
                  variant="paper"
                />
                <Badge tone="blue">图片</Badge>
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-3">
                  <input accept="image/*" className="hidden" onChange={handleCoverUpload} ref={coverInputRef} type="file" />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-ink">封面图片</p>
                    <p className="mt-1 text-xs text-ink/50">从本地上传新封面，不需要填写图片链接。</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => coverInputRef.current?.click()}>
                    上传封面
                  </Button>
                </div>

                <ImageGalleryManager
                  coverHint="最多 5 张，发布后商户手机端和用户端店铺详情都会同步刷新。"
                  description="PC 后台和商户手机端共用同一份店铺轮播数据。"
                  images={draft.gallery}
                  label="店铺轮播图"
                  maxImages={5}
                  onChange={(images) => setDraft((current) => ({ ...current, gallery: images.slice(0, 5) }))}
                />

                {profileCardBackgroundSettings.editEntryEnabled ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-ink">简易信息卡背景</p>
                      <p className="mt-1 text-xs leading-5 text-ink/50">入口由运营后台开放；当前背景仍按 UI 主题使用系统分配图。</p>
                    </div>
                    <Button disabled size="sm" variant="secondary">
                      背景编辑待接入
                    </Button>
                  </div>
                ) : null}
              </div>
            </article>

            <article className={`rounded-lg border border-line bg-white p-4 shadow-panel ${focus === "basic" ? "ring-2 ring-moss/25" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="门店名称、地址、营业时间和经营方式会同步到所有服务展示信息卡。"
                  label="基础资料说明"
                  title="基础资料"
                  titleClassName="font-black"
                  variant="paper"
                />
                <Badge tone="green">资料</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "店铺名称", key: "name" },
                  { label: "服务区域", key: "area" },
                  { label: "门店地址", key: "address" },
                  { label: "营业时间", key: "businessHours" }
                ].map((field) => (
                  <label className="block" key={field.key}>
                    <span className="mb-2 block text-xs font-bold text-ink/50">{field.label}</span>
                    <input
                      className="h-10 w-full rounded-lg border border-line bg-paper px-3 outline-none"
                      onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                      value={draft[field.key as keyof typeof draft] as string}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <span className="mb-2 block text-xs font-bold text-ink/50">经营方式</span>
                <SegmentedTabs
                  items={[
                    { label: "上门服务", value: "home" },
                    { label: "到店服务", value: "store" }
                  ]}
                  onChange={(value) => setDraft((current) => ({ ...current, mode: value as Store["mode"] }))}
                  value={draft.mode}
                />
              </div>
            </article>

            <article className={`rounded-lg border border-line bg-white p-4 shadow-panel ${focus === "presentation" ? "ring-2 ring-moss/25" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="角标、最近可约、价格和介绍文案会同步到服务展示里的图片与信息卡。"
                  label="展示信息说明"
                  title="展示信息"
                  titleClassName="font-black"
                  variant="paper"
                />
                <Badge tone="yellow">展示字段</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "首页角标", key: "rankLabel" },
                  { label: "最近可约", key: "nextSlot" },
                  { label: "价格说明", key: "priceLabel" }
                ].map((field) => (
                  <label className="block" key={field.key}>
                    <span className="mb-2 block text-xs font-bold text-ink/50">{field.label}</span>
                    <input
                      className="h-10 w-full rounded-lg border border-line bg-paper px-3 outline-none"
                      onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                      value={draft[field.key as keyof typeof draft] as string}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-ink/50">前台首屏说明</span>
                  <textarea
                    className="min-h-[96px] w-full rounded-[18px] border border-line bg-paper px-4 py-3 outline-none"
                    onChange={(event) => updatePresentationDraft("subtitle", event.target.value)}
                    value={draft.presentation.subtitle}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold text-ink/50">最近车站</span>
                    <input
                      className="h-10 w-full rounded-lg border border-line bg-paper px-3 outline-none"
                      onChange={(event) => updatePresentationDraft("station", event.target.value)}
                      value={draft.presentation.station}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold text-ink/50">距离说明</span>
                    <input
                      className="h-10 w-full rounded-lg border border-line bg-paper px-3 outline-none"
                      onChange={(event) => updatePresentationDraft("distance", event.target.value)}
                      value={draft.presentation.distance}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-ink/50">交通说明</span>
                  <textarea
                    className="min-h-[90px] w-full rounded-[18px] border border-line bg-paper px-4 py-3 outline-none"
                    onChange={(event) => updatePresentationDraft("access", event.target.value)}
                    value={draft.presentation.access}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-ink/50">到店提示</span>
                  <textarea
                    className="min-h-[90px] w-full rounded-[18px] border border-line bg-paper px-4 py-3 outline-none"
                    onChange={(event) => updatePresentationDraft("routeGuide", event.target.value)}
                    value={draft.presentation.routeGuide}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold text-ink/50">支付方式</span>
                    <textarea
                      className="min-h-[96px] w-full rounded-[18px] border border-line bg-paper px-4 py-3 outline-none"
                      onChange={(event) => updatePresentationDraft("paymentMethods", textToList(event.target.value))}
                      value={listToText(draft.presentation.paymentMethods)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold text-ink/50">设备 / 服务标记</span>
                    <textarea
                      className="min-h-[96px] w-full rounded-[18px] border border-line bg-paper px-4 py-3 outline-none"
                      onChange={(event) => updatePresentationDraft("equipment", textToList(event.target.value))}
                      value={listToText(draft.presentation.equipment)}
                    />
                  </label>
                </div>
              </div>
              <div className="mt-4">
                <span className="mb-2 block text-xs font-bold text-ink/50">店铺标签</span>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => {
                    const active = draft.tags.includes(tag);

                    return (
                      <button
                        className={`rounded-full px-3 py-2 text-xs font-black ${
                          active ? "bg-moss text-white" : "bg-paper text-ink"
                        }`}
                        key={tag}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag]
                          }))
                        }
                        type="button"
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-bold text-ink/50">店铺介绍</span>
                <textarea
                  className="min-h-[160px] w-full rounded-[24px] border border-line bg-paper px-4 py-3 outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  value={draft.description}
                />
              </label>
            </article>

            <article className={`rounded-lg border border-line bg-white p-4 shadow-panel ${focusModule === "documents" ? "ring-2 ring-moss/25" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="这里只管理本店的营业执照、保险和店员资质扫描件。"
                  label="资质文件说明"
                  title="资质文件"
                  titleClassName="font-black"
                  variant="paper"
                />
                <Badge tone="yellow">{merchantAdminDemo.merchant.documents.length} 份</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {merchantAdminDemo.merchant.documents.map((document) => (
                  <span className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-black text-ink" key={document}>
                    {document}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button to="/merchant/settings/verification">上传新文件</Button>
                <Button to="/merchant/settings/verification" variant="secondary">查看审核状态</Button>
              </div>
            </article>
          </section>

          <aside className="space-y-4">
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="font-black">结算与收款</h2>
              <div className="mt-3 space-y-2">
                {[
                  ["结算周期", merchantAdminDemo.merchant.settlementCycle],
                  ["平台佣金", `${merchantAdminDemo.merchant.commissionRate}%`],
                  ["最近可结算", "T+7 自动生成"],
                  ["收款状态", "正常"]
                ].map(([label, value]) => (
                  <div className="flex items-center justify-between rounded-lg bg-paper px-3 py-3" key={label}>
                    <span className="text-sm text-ink/55">{label}</span>
                    <strong className="text-sm">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button to="/merchant-admin/finance">查看结算页</Button>
                <Button to="/merchant/settings/account" variant="secondary">绑定收款账户</Button>
              </div>
            </article>

            <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="font-black">管理员与权限</h2>
              <div className="mt-3 space-y-2">
                {[
                  ["当前角色", "店长 / 商家管理员"],
                  ["可管理门店", `${merchantAdminDemo.stores.length} 家`],
                  ["可管理员工", `${technicians.length} 人`],
                  ["权限模式", "店铺专属后台"]
                ].map(([label, value]) => (
                  <div className="flex items-center justify-between rounded-lg bg-paper px-3 py-3" key={label}>
                    <span className="text-sm text-ink/55">{label}</span>
                    <strong className="text-sm">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary">邀请管理员</Button>
                <Button variant="secondary">查看操作日志</Button>
              </div>
            </article>
          </aside>
        </div>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
