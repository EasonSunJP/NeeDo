import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ImageGalleryManager } from "../../components/ui/ImageGalleryManager";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import {
  detectStorePresentationIndustry,
  getDefaultStorePresentationConfig,
  getStorePresentationConfig,
  normalizeStorePresentationConfig
} from "../../lib/storePresentation";
import { cn } from "../../lib/utils";
import {
  getDefaultStoreUiDecoration,
  getStoreUiDecoration,
  normalizeStoreUiDecoration
} from "../../lib/storeUiDecoration";
import { updateStoreEntity, useEntityStore } from "../../state/entityStore";
import type { Store, StoreCardDecorationConfig, StoreDecorationBlockConfig, StoreOfferConfig, StorePresentationConfig } from "../../types/domain";
import { StoreDetailExperience } from "../user/StoreDetailPage";

function normalizeModule(value: string | null) {
  return value === "cards" ? "cards" : "page";
}

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split(/\n|,|，|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const offerTextFields: Array<{ label: string; key: keyof StoreOfferConfig }> = [
  { label: "标题", key: "title" },
  { label: "利益点", key: "benefit" },
  { label: "利用条件", key: "conditions" },
  { label: "适用范围", key: "applicable" },
  { label: "有效期", key: "validUntil" },
  { label: "叠加规则", key: "stackingRule" }
];

type PublishStatus = {
  tone: "idle" | "dirty" | "success" | "error";
  message: string;
};

type PreviewEditorMode = "gallery" | "basic" | "presentation" | null;
const previewEditorTabs = [
  { label: "轮播图", mode: "gallery" },
  { label: "店铺资料", mode: "basic" },
  { label: "前台文字", mode: "presentation" }
] as const;
type StoreBasicDraft = Pick<Store, "address" | "businessHours" | "name" | "nextSlot" | "priceLabel" | "rankLabel" | "tags">;

function createBasicDraft(store: Store): StoreBasicDraft {
  return {
    address: store.address,
    businessHours: store.businessHours,
    name: store.name,
    nextSlot: store.nextSlot,
    priceLabel: store.priceLabel,
    rankLabel: store.rankLabel,
    tags: [...store.tags]
  };
}

export function MerchantAdminDesignPage() {
  const { session } = useAuth();
  const { stores } = useEntityStore();
  const [searchParams] = useSearchParams();
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const storeIndustry = useMemo(() => detectStorePresentationIndustry(store), [store?.tags]);
  const storeUiDecoration = useMemo(() => getStoreUiDecoration(store), [store?.uiDecoration]);
  const storePresentation = useMemo(() => getStorePresentationConfig(store, storeIndustry), [store?.presentation, storeIndustry]);
  const [blocks, setBlocks] = useState(() => storeUiDecoration.blocks);
  const [cards, setCards] = useState(() => storeUiDecoration.cards);
  const [basicDraft, setBasicDraft] = useState<StoreBasicDraft>(() => createBasicDraft(store));
  const [presentationDraft, setPresentationDraft] = useState<StorePresentationConfig>(() => storePresentation);
  const [previewEditorMode, setPreviewEditorMode] = useState<PreviewEditorMode>(null);
  const [selectedBlockId, setSelectedBlockId] = useState(storeUiDecoration.blocks[0].id);
  const [selectedCardId, setSelectedCardId] = useState(storeUiDecoration.cards[0].id);
  const [galleryDraft, setGalleryDraft] = useState<string[]>(() => [...(store?.gallery ?? [])].slice(0, 5));
  const [publishStatus, setPublishStatus] = useState<PublishStatus>({ tone: "idle", message: "" });
  const module = normalizeModule(searchParams.get("module"));
  const selectedBlock = useMemo(() => blocks.find((block) => block.id === selectedBlockId) ?? blocks[0], [blocks, selectedBlockId]);
  const selectedCard = useMemo(() => cards.find((card) => card.id === selectedCardId) ?? cards[0], [cards, selectedCardId]);
  const previewStore = useMemo<Store>(
    () => ({
      ...store,
      ...basicDraft,
      tags: [...basicDraft.tags],
      gallery: galleryDraft.slice(0, 5),
      presentation: normalizeStorePresentationConfig(presentationDraft, storeIndustry),
      uiDecoration: normalizeStoreUiDecoration({
        blocks,
        cards
      })
    }),
    [basicDraft, blocks, cards, galleryDraft, presentationDraft, store, storeIndustry]
  );
  const markDirty = () => setPublishStatus({ tone: "dirty", message: "有未发布修改，发布后才会同步到前台。" });
  const updateBasicDraft = <Key extends keyof StoreBasicDraft>(key: Key, value: StoreBasicDraft[Key]) => {
    markDirty();
    setBasicDraft((current) => ({ ...current, [key]: value }));
  };
  const updatePresentationDraft = <Key extends keyof StorePresentationConfig>(key: Key, value: StorePresentationConfig[Key]) => {
    markDirty();
    setPresentationDraft((current) => ({ ...current, [key]: value }));
  };
  const updateOfferDraft = <Key extends keyof StoreOfferConfig>(offerIndex: number, key: Key, value: StoreOfferConfig[Key]) => {
    markDirty();
    setPresentationDraft((current) => ({
      ...current,
      offers: current.offers.map((offer, index) => (index === offerIndex ? { ...offer, [key]: value } : offer))
    }));
  };
  const updateSelectedBlock = <Key extends keyof StoreDecorationBlockConfig>(key: Key, value: StoreDecorationBlockConfig[Key]) => {
    markDirty();
    setBlocks((current) => current.map((block) => (block.id === selectedBlock.id ? { ...block, [key]: value } : block)));
  };
  const moveBlock = (blockId: StoreDecorationBlockConfig["id"], direction: -1 | 1) => {
    markDirty();
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === blockId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };
  const publishToStore = () => {
    if (!store) {
      setPublishStatus({ tone: "error", message: "当前没有可发布的店铺。" });
      return;
    }

    const persisted = updateStoreEntity(store.id, {
      ...basicDraft,
      tags: [...basicDraft.tags],
      gallery: galleryDraft.slice(0, 5),
      presentation: normalizeStorePresentationConfig(presentationDraft, storeIndustry),
      uiDecoration: normalizeStoreUiDecoration({
        blocks,
        cards
      })
    });

    setPublishStatus(
      persisted
        ? { tone: "success", message: "已发布到本店，用户端和商户手机端会读取同一份内容。" }
        : { tone: "error", message: "已应用到当前页面，但本地保存失败。请换更小图片后再发布。" }
    );
  };

  useEffect(() => {
    setBasicDraft(createBasicDraft(store));
    setGalleryDraft([...(store?.gallery ?? [])].slice(0, 5));
    setBlocks(storeUiDecoration.blocks);
    setCards(storeUiDecoration.cards);
    setPresentationDraft(storePresentation);
  }, [store, store?.gallery, storePresentation, storeUiDecoration]);

  const previewInlineEditor = previewEditorMode ? (
    <div className="merchant-live-preview-editor mb-3 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-primary)_26%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] p-3 shadow-[0_18px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm text-[color:var(--client-text)]">
            直接编辑前台内容
          </strong>
          <div className="flex flex-wrap gap-1.5">
            {previewEditorTabs.map((item) => (
              <button
                aria-label={`切换到${item.label}编辑`}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-black transition",
                  previewEditorMode === item.mode
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b]"
                    : "border-[color:var(--client-line)] bg-[color:var(--client-bg)] text-[color:var(--client-muted)]"
                )}
                key={item.mode}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPreviewEditorMode(item.mode);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPreviewEditorMode(item.mode);
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <button className="rounded-full border border-[color:var(--client-line)] px-3 py-1.5 text-xs font-black text-[color:var(--client-muted)]" onClick={() => setPreviewEditorMode(null)} type="button">
          收起
        </button>
      </div>

      {previewEditorMode === "gallery" ? (
        <ImageGalleryManager
          className="text-[color:var(--client-text)]"
          coverHint="这里改的是当前预览里的轮播图顺序，发布后会同步到用户端和商户手机端。"
          description="通过预览中的编辑按钮打开，不需要去右侧面板找图片入口。"
          images={galleryDraft}
          label="店铺轮播图"
          maxImages={5}
          onChange={(images) => {
            markDirty();
            setGalleryDraft(images.slice(0, 5));
          }}
        />
      ) : null}

      {previewEditorMode === "basic" ? (
        <div className="grid gap-3 text-sm">
          {[
            { label: "店铺名称", key: "name" },
            { label: "首页角标", key: "rankLabel" },
            { label: "店铺地址", key: "address" },
            { label: "营业时间", key: "businessHours" },
            { label: "最近可约", key: "nextSlot" },
            { label: "价格说明", key: "priceLabel" }
          ].map((field) => (
            <label className="grid gap-1" key={field.key}>
              <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
              <input
                className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                onChange={(event) => updateBasicDraft(field.key as keyof StoreBasicDraft, event.target.value as never)}
                value={basicDraft[field.key as keyof StoreBasicDraft] as string}
              />
            </label>
          ))}
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">店铺标签</span>
            <textarea
              className="min-h-[82px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updateBasicDraft("tags", textToList(event.target.value))}
              value={listToText(basicDraft.tags)}
            />
          </label>
        </div>
      ) : null}

      {previewEditorMode === "presentation" ? (
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">首屏说明</span>
            <textarea
              className="min-h-[84px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updatePresentationDraft("subtitle", event.target.value)}
              value={presentationDraft.subtitle}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-[color:var(--client-muted)]">最近车站</span>
              <input
                className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                onChange={(event) => updatePresentationDraft("station", event.target.value)}
                value={presentationDraft.station}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-[color:var(--client-muted)]">距离说明</span>
              <input
                className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                onChange={(event) => updatePresentationDraft("distance", event.target.value)}
                value={presentationDraft.distance}
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">交通说明</span>
            <textarea
              className="min-h-[72px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updatePresentationDraft("access", event.target.value)}
              value={presentationDraft.access}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">到店提示</span>
            <textarea
              className="min-h-[72px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updatePresentationDraft("routeGuide", event.target.value)}
              value={presentationDraft.routeGuide}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">停车 / 补充说明</span>
            <input
              className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updatePresentationDraft("parking", event.target.value)}
              value={presentationDraft.parking}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { label: "环境标签", key: "seatLabel" },
              { label: "菜单标签", key: "menuLabel" },
              { label: "人数标签", key: "peopleLabel" }
            ] as const).map((field) => (
              <label className="grid gap-1" key={field.key}>
                <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
                <input
                  className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                  onChange={(event) => updatePresentationDraft(field.key, event.target.value)}
                  value={presentationDraft[field.key]}
                />
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { label: "支付方式", key: "paymentMethods", value: presentationDraft.paymentMethods },
              { label: "设备 / 服务标记", key: "equipment", value: presentationDraft.equipment }
            ] as const).map((field) => (
              <label className="grid gap-1" key={field.key}>
                <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
                <textarea
                  className="min-h-[86px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
                  onChange={(event) => updatePresentationDraft(field.key, textToList(event.target.value))}
                  value={listToText(field.value)}
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">环境筛选标签</span>
            <textarea
              className="min-h-[72px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updatePresentationDraft("seatFilters", textToList(event.target.value))}
              value={listToText(presentationDraft.seatFilters)}
            />
          </label>
          <div className="grid gap-3">
            {presentationDraft.offers.map((offer, index) => (
              <div className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] p-3" key={offer.id}>
                <div className="mb-2 text-xs font-black text-[color:var(--client-text)]">情报 {index + 1}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {offerTextFields.map((field) => (
                    <label className="grid gap-1" key={field.key}>
                      <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
                      <input
                        className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                        onChange={(event) => updateOfferDraft(index, field.key, event.target.value)}
                        value={offer[field.key]}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title={module === "cards" ? "信息卡装修" : "店铺 UI 装修"}
        description={module === "cards" ? "保存后会写入本店的 UI 装修配置，店铺卡、套餐卡和员工卡会从同一份店铺状态读取。" : "这里只装修你自己店铺详情页的展示结构，保存后用户端和商户手机端会读取同一份配置。"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const defaults = getDefaultStoreUiDecoration();
                setBlocks(defaults.blocks);
                setCards(defaults.cards);
                setPresentationDraft(getDefaultStorePresentationConfig(storeIndustry));
                setGalleryDraft([...(store?.gallery ?? [])].slice(0, 5));
                setPublishStatus({ tone: "dirty", message: "已恢复推荐配置，发布后会覆盖前台展示。" });
              }}
            >
              恢复推荐
            </Button>
            <Button onClick={publishToStore}>
              发布到本店
            </Button>
            {publishStatus.tone !== "idle" ? (
              <span
                aria-live="polite"
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full border px-3 text-xs font-black",
                  publishStatus.tone === "success" && "border-moss/30 bg-mint/15 text-moss",
                  publishStatus.tone === "dirty" && "border-lemon/40 bg-lemon/20 text-[#795b00]",
                  publishStatus.tone === "error" && "border-coral/30 bg-coral/10 text-coral"
                )}
              >
                {publishStatus.message}
              </span>
            ) : null}
          </div>
        }
      >
        {module === "page" ? (
          <div className="grid gap-5">
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info={`当前只针对 ${store?.name ?? "当前店铺"} 生效。`}
                  label="详情页预览说明"
                  title="详情页预览"
                  titleClassName="font-black"
                  variant="paper"
                />
                <Badge tone="green">本店专属</Badge>
              </div>
              <div className="merchant-design-preview mt-4 overflow-hidden rounded-[28px] border border-line">
                <div className="merchant-phone-preview-workspace">
                  <div className="merchant-phone-preview-controls client-shell client-theme-night client-theme-black-gold">
                    <div className="merchant-live-preview-editor rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-primary)_22%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,transparent)] p-3 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
                      <div className="grid gap-2">
                        <strong className="text-xs font-black text-[color:var(--client-text)]">预览内编辑</strong>
                        <div className="flex w-full min-w-0 flex-wrap gap-1.5">
                          {blocks.map((block, index) => (
                            <button
                              className={cn(
                                "min-h-8 min-w-0 basis-[calc(50%-3px)] whitespace-normal rounded-full border px-2.5 py-1 text-left text-[11px] font-black leading-4 transition sm:basis-auto",
                                selectedBlockId === block.id
                                  ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b]"
                                  : "border-[color:var(--client-line)] bg-[color:var(--client-bg)] text-[color:var(--client-muted)]"
                              )}
                              key={block.id}
                              onClick={() => setSelectedBlockId(block.id)}
                              type="button"
                            >
                              {index + 1}. {block.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {previewEditorTabs.map((item) => (
                          <button
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-black transition",
                              previewEditorMode === item.mode
                                ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b]"
                                : "border-[color:var(--client-line)] bg-[color:var(--client-bg)] text-[color:var(--client-text)]"
                            )}
                            key={item.mode}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setPreviewEditorMode(item.mode);
                            }}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setPreviewEditorMode(item.mode);
                            }}
                            type="button"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 grid gap-2">
                        <label className="grid gap-1">
                          <span className="text-[11px] font-black text-[color:var(--client-muted)]">模块名称</span>
                          <input
                            className="h-9 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-xs font-bold text-[color:var(--client-text)] outline-none"
                            onChange={(event) => updateSelectedBlock("name", event.target.value)}
                            value={selectedBlock.name}
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-black text-[color:var(--client-muted)]">展示样式</span>
                          <select
                            className="h-9 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-xs font-bold text-[color:var(--client-text)] outline-none"
                            onChange={(event) => updateSelectedBlock("style", event.target.value as StoreDecorationBlockConfig["style"])}
                            value={selectedBlock.style}
                          >
                            {["横滑", "图文", "菜单", "照片墙"].map((style) => (
                              <option key={style} value={style}>{style}</option>
                            ))}
                          </select>
                        </label>
                        <div className="flex flex-wrap items-end gap-2">
                          <button className="h-9 rounded-full border border-[color:var(--client-line)] px-3 text-xs font-black text-[color:var(--client-text)]" onClick={() => moveBlock(selectedBlock.id, -1)} type="button">
                            上移
                          </button>
                          <button className="h-9 rounded-full border border-[color:var(--client-line)] px-3 text-xs font-black text-[color:var(--client-text)]" onClick={() => moveBlock(selectedBlock.id, 1)} type="button">
                            下移
                          </button>
                          <button
                            className="h-9 rounded-full border border-[color:var(--client-line)] px-3 text-xs font-black text-[color:var(--client-text)]"
                            onClick={() => updateSelectedBlock("visible", !selectedBlock.visible)}
                            type="button"
                          >
                            {selectedBlock.visible ? "隐藏模块" : "显示模块"}
                          </button>
                        </div>
                      </div>
                    </div>
                    {previewInlineEditor}
                  </div>
                  <div className="merchant-phone-preview-stage">
                    <div className="merchant-phone-preview-device-frame">
                      <div className="merchant-phone-preview-device">
                        <div className="merchant-live-preview-frame merchant-phone-preview-screen client-shell client-theme-night client-theme-black-gold px-4 py-4">
                          <StoreDetailExperience embedded onEditFocus={setPreviewEditorMode} scope="merchant" store={previewStore} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1fr,360px]">
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="点击左侧卡片类型，再在右侧调整它的展示规则。"
                  label="信息卡预览说明"
                  title="信息卡预览"
                  titleClassName="font-black"
                  variant="paper"
                />
                <Badge tone="blue">店铺卡专用</Badge>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {cards.map((card) => (
                  <button
                    className={cn("overflow-hidden rounded-lg border-2 bg-white text-left shadow-panel transition", selectedCard.id === card.id ? "border-moss" : "border-line")}
                    key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    type="button"
                  >
                    <img alt={card.name} className="w-full object-cover" src={galleryDraft[0] ?? store?.cover ?? ""} style={{ height: `${card.coverHeight}px` }} />
                    <div className="p-4">
                      <h3 className="font-black">{card.name}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-black", card.tagStyle === "实心" ? "bg-moss text-white" : "border border-line bg-white text-ink")}>
                          {card.tagStyle}
                        </span>
                        <span className="text-xs text-ink/45">{card.cta}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                <h2 className="font-black">卡片设置</h2>
                <div className="mt-3 grid gap-3 text-sm">
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-ink/50">按钮文案</span>
                    <input className="h-10 rounded-lg border border-line bg-paper px-3 outline-none" onChange={(event) => setCards((current) => current.map((card) => card.id === selectedCard.id ? { ...card, cta: event.target.value } : card))} value={selectedCard.cta} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-ink/50">封面高度</span>
                    <select className="h-10 rounded-lg border border-line bg-paper px-3 outline-none" onChange={(event) => setCards((current) => current.map((card) => card.id === selectedCard.id ? { ...card, coverHeight: event.target.value } : card))} value={selectedCard.coverHeight}>
                      {["140", "180", "220"].map((height) => (
                        <option key={height} value={height}>{height}px</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-ink/50">标签样式</span>
                    <select className="h-10 rounded-lg border border-line bg-paper px-3 outline-none" onChange={(event) => setCards((current) => current.map((card) => card.id === selectedCard.id ? { ...card, tagStyle: event.target.value as StoreCardDecorationConfig["tagStyle"] } : card))} value={selectedCard.tagStyle}>
                      {["实心", "描边"].map((style) => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            </aside>
          </div>
        )}
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
