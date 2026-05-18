import { useMemo, useState, type ReactNode } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { imageBank } from "../../data/mock";
import { cn } from "../../lib/utils";
import { setProfileCardBackgroundEditEntryEnabled, useProfileCardBackgroundSettings } from "../../state/profileCardBackgroundStore";

type PreviewPortal = "user" | "merchant" | "technician";
type DecorTheme = "light" | "dark";
type DecorTab = "content" | "style";

type DecorComponentId =
  | "carousel"
  | "city-switch"
  | "location-module"
  | "quick-grid"
  | "slider-block"
  | "technician-search"
  | "service-categories"
  | "service-list"
  | "placeholder"
  | "technician-list"
  | "ad-slot"
  | "bottom-nav";

type DecorComponent = {
  id: DecorComponentId;
  title: string;
  icon: string;
  summary: string;
  visible: boolean;
  order: number;
  sectionTitle?: string;
  moreText?: string;
  link?: string;
  rowCount?: "3个" | "4个" | "5个" | "6个";
  count?: number;
  iconShape?: "圆角方形" | "圆形";
  styleMode?: "默认样式" | "镂空样式" | "浅色背景";
  colorMode?: "跟随系统" | "图标配色" | "自定义";
  bannerType?: "单图广告" | "左右广告" | "左一右二";
  listStyle?: "单列展示" | "大图单列" | "双列风格";
  sortMode?: "综合排序" | "距离排序" | "评分排序";
  indicator?: "显示" | "隐藏";
};

const componentLibrary: DecorComponent[] = [
  {
    id: "carousel",
    title: "轮播图",
    icon: "播",
    summary: "首页主轮播与活动主推位",
    visible: true,
    order: 0,
    sectionTitle: "主推轮播",
    moreText: "查看详情",
    link: "/service/cleaning",
    count: 3,
    styleMode: "默认样式",
    colorMode: "图标配色",
    indicator: "显示"
  },
  {
    id: "quick-grid",
    title: "九宫格",
    icon: "宫",
    summary: "快捷功能入口",
    visible: true,
    order: 1,
    sectionTitle: "常用入口",
    rowCount: "4个",
    count: 4,
    iconShape: "圆角方形",
    styleMode: "默认样式",
    colorMode: "图标配色"
  },
  {
    id: "service-categories",
    title: "服务分类",
    icon: "类",
    summary: "首页分类与常用服务",
    visible: true,
    order: 2,
    sectionTitle: "服务分类",
    moreText: "更多服务",
    rowCount: "4个",
    count: 8,
    iconShape: "圆角方形",
    styleMode: "默认样式",
    colorMode: "图标配色"
  },
  {
    id: "technician-list",
    title: "技师列表",
    icon: "技",
    summary: "新人上线、推荐技师滑动列表",
    visible: true,
    order: 3,
    sectionTitle: "新人上线",
    moreText: "全部技师",
    count: 4,
    listStyle: "单列展示",
    sortMode: "综合排序"
  },
  {
    id: "service-list",
    title: "服务列表",
    icon: "服",
    summary: "推荐服务卡片与套餐列表",
    visible: true,
    order: 4,
    sectionTitle: "推荐项目",
    moreText: "更多项目",
    count: 4,
    listStyle: "单列展示",
    sortMode: "综合排序"
  },
  {
    id: "ad-slot",
    title: "广告位",
    icon: "广",
    summary: "专题位、单图广告、双栏广告",
    visible: true,
    order: 5,
    sectionTitle: "广告位",
    bannerType: "单图广告",
    styleMode: "浅色背景"
  },
  {
    id: "city-switch",
    title: "城市切换",
    icon: "城",
    summary: "顶部城市、地区与搜索入口",
    visible: true,
    order: 6,
    sectionTitle: "城市切换",
    styleMode: "浅色背景"
  },
  {
    id: "location-module",
    title: "定位模块",
    icon: "位",
    summary: "当前定位与客服入口",
    visible: true,
    order: 7,
    sectionTitle: "当前位置",
    styleMode: "浅色背景"
  },
  {
    id: "slider-block",
    title: "滑动块",
    icon: "滑",
    summary: "横向滑动的专题位与故事块",
    visible: false,
    order: 8,
    sectionTitle: "活动滑动块",
    count: 3,
    styleMode: "默认样式"
  },
  {
    id: "technician-search",
    title: "技师搜索块",
    icon: "搜",
    summary: "技师搜索与筛选块",
    visible: false,
    order: 9,
    sectionTitle: "技师搜索",
    styleMode: "默认样式"
  },
  {
    id: "placeholder",
    title: "占位空间",
    icon: "占",
    summary: "为未来区块预留空间",
    visible: false,
    order: 10,
    sectionTitle: "占位空间",
    styleMode: "镂空样式"
  },
  {
    id: "bottom-nav",
    title: "底部导航",
    icon: "导",
    summary: "切换三端导航与当前激活页",
    visible: true,
    order: 11,
    sectionTitle: "底部导航",
    styleMode: "默认样式"
  }
];

const portalOptions: Array<{ id: PreviewPortal; label: string; nav: string[] }> = [
  { id: "user", label: "用户端", nav: ["首页", "动态", "预约", "NeeDo", "通讯录", "聊天", "我的"] },
  { id: "merchant", label: "商户端", nav: ["首页", "日程", "动态", "NeeDo", "通讯录", "聊天", "我的"] },
  { id: "technician", label: "技师端", nav: ["首页", "日程", "动态", "NeeDo", "通讯录", "聊天", "我的"] }
];

const themeOptions: Array<{ id: DecorTheme; label: string }> = [
  { id: "light", label: "白绿" },
  { id: "dark", label: "黑金" }
];

const basicComponentOrder: DecorComponentId[] = [
  "ad-slot",
  "city-switch",
  "location-module",
  "quick-grid",
  "slider-block",
  "technician-search",
  "service-categories",
  "service-list",
  "placeholder",
  "carousel",
  "technician-list",
  "bottom-nav"
];

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-bold text-ink/45">{children}</span>;
}

function SectionBlock({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-block h-5 w-1 rounded-full bg-sky" />
        <h3 className="text-sm font-black">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SettingField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

function PillOptions({
  value,
  options,
  onChange
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-bold transition",
            value === option ? "border-sky bg-sky/10 text-sky" : "border-line bg-paper text-ink/70 hover:border-sky/35"
          )}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function GlyphCard({
  component,
  selected,
  onClick
}: {
  component: DecorComponent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-2xl border p-4 text-left transition",
        selected ? "border-sky bg-sky/8 shadow-[0_14px_34px_rgba(47,117,255,0.12)]" : "border-line bg-paper hover:border-sky/30"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="grid gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#4da2ff]/12 text-lg font-black text-sky shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
          {component.icon}
        </div>
        <div>
          <p className="text-sm font-black">{component.title}</p>
          <p className="mt-1 text-xs leading-5 text-ink/52">{component.summary}</p>
        </div>
      </div>
    </button>
  );
}

function PhoneFrame({
  theme,
  children
}: {
  theme: DecorTheme;
  children: ReactNode;
}) {
  return (
    <div className="relative mx-auto w-[372px] rounded-[52px] border-[10px] border-[#dbe3ee] bg-[#eef3fa] p-3 shadow-[0_30px_90px_rgba(26,34,56,0.18)]">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 h-8 w-44 -translate-x-1/2 rounded-full bg-[#dbe3ee]" />
      <div className="pointer-events-none absolute left-1/2 top-[23px] z-20 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/90" />
      <div className="pointer-events-none absolute right-5 top-6 z-20 h-2.5 w-2.5 rounded-full bg-white/85" />
      <div
        className={cn(
          "overflow-hidden rounded-[38px] border border-black/5",
          theme === "dark" ? "bg-[#0f0d08]" : "bg-[#f7f7f2]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function PreviewWrapper({
  selected,
  hidden,
  onClick,
  children
}: {
  selected: boolean;
  hidden?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "relative w-full text-left transition",
        selected && "outline outline-2 outline-offset-2 outline-sky",
        hidden && "opacity-35 grayscale"
      )}
      onClick={onClick}
      type="button"
    >
      {hidden && <div className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-sm font-black text-white">已隐藏</div>}
      {children}
    </button>
  );
}

function PreviewTitle({
  title,
  action,
  theme
}: {
  title: string;
  action?: string;
  theme: DecorTheme;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-lg font-black">{title}</h3>
      {action ? <span className={cn("text-sm font-black", theme === "dark" ? "text-[#f0c680]" : "text-[#24a067]")}>{action}</span> : null}
    </div>
  );
}

function DecorationPreview({
  components,
  selectedId,
  onSelect,
  portal,
  theme
}: {
  components: DecorComponent[];
  selectedId: DecorComponentId;
  onSelect: (id: DecorComponentId) => void;
  portal: PreviewPortal;
  theme: DecorTheme;
}) {
  const visible = components.filter((component) => component.visible).sort((left, right) => left.order - right.order);
  const navItems = portalOptions.find((option) => option.id === portal)?.nav ?? portalOptions[0].nav;
  const dark = theme === "dark";
  const themeFrame = dark ? "bg-[#0f0d08] text-[#f5eddc]" : "bg-[#f7f7f2] text-[#1f2a23]";
  const sectionCard = dark ? "border-[#4d4025] bg-[#17120c]" : "border-[#d7dfd6] bg-white";
  const accentBg = dark ? "bg-[#f0c680]" : "bg-[#24a067]";
  const accentText = dark ? "text-[#171108]" : "text-white";
  const accentSoft = dark ? "bg-[#2a2114] text-[#f0c680]" : "bg-[#e9f5ee] text-[#24a067]";
  const mutedText = dark ? "text-[#ccbfa4]" : "text-[#63736c]";

  return (
    <div className={cn("relative h-[800px] overflow-hidden", themeFrame)}>
      <div className={cn("h-full overflow-y-auto px-4 pb-32 pt-16", themeFrame)}>
        {visible.map((component) => {
          if (component.id === "bottom-nav") {
            return null;
          }

          if (component.id === "carousel") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("overflow-hidden rounded-[24px] border", sectionCard)}>
                  <div className="grid min-h-[232px] grid-cols-[1.05fr,0.95fr]">
                    <div className={cn("p-5", dark ? "bg-[#17120c]" : "bg-white")}>
                      <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-black", accentBg, accentText)}>即时上门</span>
                      <h3 className="mt-4 text-[35px] font-black leading-[1.02]">{dark ? "最快 45 分钟到达" : "最短 45 分钟到着"}</h3>
                      <p className={cn("mt-3 text-sm leading-6", mutedText)}>保洁、按摩、回收、宠物服务已经覆盖东京主要区域。</p>
                      <span className={cn("mt-5 inline-flex rounded-full px-4 py-2 text-sm font-black", accentBg, accentText)}>{component.moreText ?? "查看详情"}</span>
                    </div>
                    <img
                      alt="轮播图"
                      className="h-full w-full object-cover"
                      src={imageBank.cleaning}
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 py-3">
                    {[0, 1, 2].map((index) => (
                      <span
                        className={cn(
                          component.indicator === "隐藏" ? "hidden" : "block",
                          index === 0 ? cn("h-2.5 w-8 rounded-full", accentBg) : dark ? "h-2.5 w-2.5 rounded-full bg-white/20" : "h-2.5 w-2.5 rounded-full bg-[#c5d3c8]"
                        )}
                        key={index}
                      />
                    ))}
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "quick-grid") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border p-4", sectionCard)}>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      ["商户入驻", "驻"],
                      ["我的收藏", "藏"],
                      ["意见反馈", "意"],
                      ["我的订单", "单"]
                    ].map(([label, glyph]) => (
                      <div className="grid justify-items-center gap-2" key={label}>
                        <div className={cn("grid h-16 w-16 place-items-center rounded-[18px]", accentSoft)}>
                          <span className="text-xl font-black">{glyph}</span>
                        </div>
                        <span className="text-center text-xs font-bold leading-5">{label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "service-categories") {
            const categories = ["家政保洁", "上门按摩", "上门回收", "宠物相关", "商务", "餐饮预约", "导游", "其他"].slice(
              0,
              component.count ?? 8
            );
            const cols = component.rowCount === "3个" ? "grid-cols-3" : component.rowCount === "5个" ? "grid-cols-5" : component.rowCount === "6个" ? "grid-cols-6" : "grid-cols-4";

            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border p-4", sectionCard)}>
                  <PreviewTitle action={component.moreText} theme={theme} title={component.sectionTitle ?? "服务分类"} />
                  <div className={cn("grid gap-4", cols)}>
                    {categories.map((label) => (
                      <div className="grid justify-items-center gap-2" key={label}>
                        <div
                          className={cn(
                            "grid h-14 w-14 place-items-center text-lg font-black",
                            component.iconShape === "圆形" ? "rounded-full" : "rounded-[18px]",
                            accentSoft
                          )}
                        >
                          {label.slice(0, 1)}
                        </div>
                        <span className="text-center text-xs font-bold leading-4">{label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "technician-list") {
            const technicians = [
              ["测试技师", "已服务 1 单", "/images/generated/profiles/profile-04.jpg"],
              ["语轩", "已服务 984 单", "/images/generated/profiles/profile-05.jpg"],
              ["测试", "已服务 38 单", "/images/generated/profiles/profile-06.jpg"],
              ["梦琪", "已服务 167 单", "/images/generated/profiles/profile-07.jpg"]
            ].slice(0, component.count ?? 4);

            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border p-4", sectionCard)}>
                  <PreviewTitle action={component.moreText} theme={theme} title={component.sectionTitle ?? "技师列表"} />
                  <div className="grid grid-cols-3 gap-3">
                    {technicians.map(([name, count, avatar]) => (
                      <article className={cn("rounded-[18px] p-3", dark ? "bg-[#231c11]" : "bg-[#f7faf7]")} key={name}>
                        <img alt={name} className="avatar-shape h-16 w-16 object-cover" src={avatar} />
                        <h4 className="mt-3 text-sm font-black">{name}</h4>
                        <p className={cn("mt-1 text-xs", mutedText)}>{count}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "service-list") {
            const services = [
              ["雅雅按摩", "失眠调理", "¥ 298", "80 分钟", imageBank.massage],
              ["全身推拿", "全身放松", "¥ 168", "70 分钟", imageBank.massageAlt],
              ["空调分解清洗", "拍照验收", "¥ 198", "90 分钟", imageBank.appliance]
            ].slice(0, component.count ?? 3);

            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border p-4", sectionCard)}>
                  <PreviewTitle action={component.moreText} theme={theme} title={component.sectionTitle ?? "服务列表"} />
                  <div className="space-y-3">
                    {services.map(([name, subtitle, price, duration, image]) => (
                      <article className={cn("grid grid-cols-[88px,1fr,92px] gap-3 rounded-[18px] p-3", dark ? "bg-[#231c11]" : "bg-[#f7faf7]")} key={name}>
                        <img alt={name} className="h-[88px] w-[88px] rounded-[18px] object-cover" src={image} />
                        <div>
                          <p className="text-sm font-black">{name}</p>
                          <p className={cn("mt-1 text-xs", mutedText)}>{subtitle}</p>
                          <p className={cn("mt-3 text-lg font-black", dark ? "text-[#ff9a7c]" : "text-[#ff6f59]")}>{price}</p>
                        </div>
                        <div className="flex flex-col items-end justify-between">
                          <span className={cn("text-xs font-bold", mutedText)}>超 16 人选择</span>
                          <span className={cn("text-xs font-black", dark ? "text-[#8de3a1]" : "text-[#24a067]")}>{duration}</span>
                          <span className={cn("rounded-full px-3 py-2 text-xs font-black", accentBg, accentText)}>选择技师</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "ad-slot") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border p-4", sectionCard)}>
                  <div className={cn("min-h-[150px] rounded-[20px] border-2 border-dashed p-5", dark ? "border-[#4d4025] bg-[#211a11]" : "border-[#d1dbd2] bg-[#f8faf7]")}>
                    <p className="text-sm font-black">{component.bannerType ?? "单图广告"}</p>
                    <p className={cn("mt-2 text-xs leading-5", mutedText)}>支持主图、跳转链接、圆角、外边距和显示时间配置。</p>
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "city-switch") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border px-4 py-3", dark ? "border-[#4d4025] bg-[#17120c]" : "border-[#d1dbd2] bg-[#eef8f0]")}>
                  <div className="flex items-center justify-end gap-1 text-sm font-bold">
                    <span>全国</span>
                    <span>▼</span>
                    <span className={cn("ml-2", mutedText)}>搜索</span>
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "location-module") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-3 rounded-[24px] border px-4 py-4", dark ? "border-[#4d4025] bg-[#17120c]" : "border-[#d1dbd2] bg-[#eef8f0]")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={cn("grid h-8 w-8 place-items-center rounded-[14px]", accentSoft)}>位</span>
                      <div>
                        <p className="text-sm font-black">未知</p>
                      </div>
                    </div>
                    <span className={cn("grid h-8 w-8 place-items-center rounded-[14px]", dark ? "bg-[#241d12] text-[#d2c2a8]" : "bg-white text-[#61746a]")}>客</span>
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "slider-block") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border p-4", sectionCard)}>
                  <PreviewTitle theme={theme} title={component.sectionTitle ?? "滑动块"} />
                  <div className="flex gap-3 overflow-hidden">
                    {[1, 2, 3].map((index) => (
                      <div className={cn("min-h-[120px] min-w-[220px] rounded-[18px] border p-4", dark ? "border-[#4d4025] bg-[#231c11]" : "border-[#d1dbd2] bg-[#f8faf7]")} key={index}>
                        <p className="text-sm font-black">滑动内容 {index}</p>
                        <p className={cn("mt-2 text-xs leading-5", mutedText)}>可用于故事流、活动区、专题推荐和门店精选。</p>
                      </div>
                    ))}
                  </div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "technician-search") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border p-4", sectionCard)}>
                  <div className={cn("rounded-full border px-4 py-3 text-sm font-bold", dark ? "border-[#4d4025] bg-[#120f09]" : "border-[#d1dbd2] bg-[#f8faf7]")}>搜索技师 / 区域 / 条件</div>
                </section>
              </PreviewWrapper>
            );
          }

          if (component.id === "placeholder") {
            return (
              <PreviewWrapper hidden={!component.visible} key={component.id} onClick={() => onSelect(component.id)} selected={selectedId === component.id}>
                <section className={cn("mt-4 rounded-[24px] border-2 border-dashed p-4", dark ? "border-[#4d4025] bg-[#17120c]" : "border-[#d1dbd2] bg-white")}>
                  <div className={cn("grid min-h-[132px] place-items-center rounded-[18px]", dark ? "bg-[#120f09] text-[#8e7c5a]" : "bg-[#f7faf7] text-[#7b8d81]")}>占位空间</div>
                </section>
              </PreviewWrapper>
            );
          }

          return null;
        })}
      </div>

      {components.find((component) => component.id === "bottom-nav" && component.visible) ? (
        <PreviewWrapper hidden={false} onClick={() => onSelect("bottom-nav")} selected={selectedId === "bottom-nav"}>
          <div className={cn("absolute inset-x-0 bottom-0 border-t px-5 pb-7 pt-3", dark ? "border-[#3a311d] bg-[#100d08]" : "border-[#dce3d8] bg-white")}>
            <div className={cn("grid gap-2", navItems.length === 7 ? "grid-cols-7" : "grid-cols-5")}>
              {navItems.map((item, index) => {
                const isNeedo = item === "NeeDo";
                const active = isNeedo || index === 0;
                return (
                  <div className="grid justify-items-center gap-1" key={item}>
                    {isNeedo ? (
                      <div className={cn("grid h-16 w-16 place-items-center rounded-full text-sm font-black", accentBg, accentText)}>NeeDo</div>
                    ) : (
                      <div className={cn("grid h-9 w-9 place-items-center rounded-[14px] text-sm font-black", active ? accentSoft : dark ? "bg-[#231c11] text-[#ccbfa4]" : "bg-[#eff7f1] text-[#7c8a82]")}>
                        {item.slice(0, 1)}
                      </div>
                    )}
                    <span className={cn("text-[11px] font-bold", active ? (dark ? "text-[#f0c680]" : "text-[#24a067]") : mutedText)}>{item}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </PreviewWrapper>
      ) : null}
    </div>
  );
}

function renderContentTab(component: DecorComponent, update: (patch: Partial<DecorComponent>) => void) {
  switch (component.id) {
    case "carousel":
      return (
        <div className="space-y-5">
          <SectionBlock title="展示设置">
            <SettingField label="组件状态">
              <PillOptions onChange={(value) => update({ visible: value === "显示" })} options={["显示", "隐藏"]} value={component.visible ? "显示" : "隐藏"} />
            </SettingField>
            <SettingField label="指示器">
              <PillOptions onChange={(value) => update({ indicator: value as DecorComponent["indicator"] })} options={["显示", "隐藏"]} value={component.indicator ?? "显示"} />
            </SettingField>
            <SettingField label="自动切换">
              <PillOptions onChange={() => undefined} options={["开启", "关闭"]} value="开启" />
            </SettingField>
          </SectionBlock>
          <SectionBlock title="轮播内容">
            {[1, 2, 3].map((item) => (
              <div className="rounded-2xl border border-line bg-paper p-4" key={item}>
                <div className="grid gap-3">
                  <SettingField label={`轮播图片 ${item}`}>
                    <input
                      className="h-11 rounded-xl border border-line bg-white px-3 outline-none"
                      defaultValue={[imageBank.cleaning, imageBank.massage, imageBank.appliance][item - 1] ?? imageBank.cleaning}
                    />
                  </SettingField>
                  <SettingField label="轮播标题">
                    <input className="h-11 rounded-xl border border-line bg-white px-3 outline-none" defaultValue={item === 1 ? "即时上门主推" : `轮播标题 ${item}`} />
                  </SettingField>
                  <SettingField label="轮播链接">
                    <input className="h-11 rounded-xl border border-line bg-white px-3 outline-none" defaultValue={component.link ?? "/service"} />
                  </SettingField>
                </div>
              </div>
            ))}
            <Button variant="secondary">添加轮播</Button>
          </SectionBlock>
        </div>
      );
    case "quick-grid":
      return (
        <div className="space-y-5">
          <SectionBlock title="内容设置">
            <SettingField label="展示数量">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ count: Number(event.target.value) || 0 })}
                type="number"
                value={component.count ?? 4}
              />
            </SettingField>
            <SettingField label="每行显示">
              <PillOptions onChange={(value) => update({ rowCount: value as DecorComponent["rowCount"] })} options={["3个", "4个", "5个", "6个"]} value={component.rowCount ?? "4个"} />
            </SettingField>
            <SettingField label="图标形状">
              <PillOptions onChange={(value) => update({ iconShape: value as DecorComponent["iconShape"] })} options={["圆角方形", "圆形"]} value={component.iconShape ?? "圆角方形"} />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "service-categories":
      return (
        <div className="space-y-5">
          <SectionBlock title="基础设置">
            <SettingField label="组件状态">
              <PillOptions onChange={(value) => update({ visible: value === "显示" })} options={["显示", "隐藏"]} value={component.visible ? "显示" : "隐藏"} />
            </SettingField>
            <SettingField label="分类内容">
              <PillOptions onChange={() => undefined} options={["全部", "按摩", "陪玩"]} value="全部" />
            </SettingField>
            <SettingField label="显示数量">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ count: Number(event.target.value) || 0 })}
                type="number"
                value={component.count ?? 8}
              />
            </SettingField>
          </SectionBlock>
          <SectionBlock title="样式预设">
            <SettingField label="每行显示">
              <PillOptions onChange={(value) => update({ rowCount: value as DecorComponent["rowCount"] })} options={["3个", "4个", "5个", "6个"]} value={component.rowCount ?? "4个"} />
            </SettingField>
            <SettingField label="图标形状">
              <PillOptions onChange={(value) => update({ iconShape: value as DecorComponent["iconShape"] })} options={["圆角方形", "圆形"]} value={component.iconShape ?? "圆角方形"} />
            </SettingField>
            <SettingField label="颜色方案">
              <PillOptions onChange={(value) => update({ colorMode: value as DecorComponent["colorMode"] })} options={["跟随系统", "图标配色", "自定义"]} value={component.colorMode ?? "图标配色"} />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "service-list":
      return (
        <div className="space-y-5">
          <SectionBlock title="标题设置">
            <SettingField label="标题内容">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ sectionTitle: event.target.value })}
                value={component.sectionTitle ?? ""}
              />
            </SettingField>
            <SettingField label="更多按钮">
              <PillOptions onChange={() => undefined} options={["显示", "隐藏"]} value="显示" />
            </SettingField>
            <SettingField label="更多文字">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ moreText: event.target.value })}
                value={component.moreText ?? ""}
              />
            </SettingField>
          </SectionBlock>
          <SectionBlock title="展示设置">
            <SettingField label="列表风格">
              <PillOptions onChange={(value) => update({ listStyle: value as DecorComponent["listStyle"] })} options={["单列展示", "大图单列", "双列风格"]} value={component.listStyle ?? "单列展示"} />
            </SettingField>
            <SettingField label="数据类型">
              <PillOptions onChange={() => undefined} options={["默认数据", "指定分类"]} value="指定分类" />
            </SettingField>
            <SettingField label="显示数量">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ count: Number(event.target.value) || 0 })}
                type="number"
                value={component.count ?? 4}
              />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "technician-list":
      return (
        <div className="space-y-5">
          <SectionBlock title="标题设置">
            <SettingField label="标题内容">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ sectionTitle: event.target.value })}
                value={component.sectionTitle ?? ""}
              />
            </SettingField>
            <SettingField label="更多文字">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ moreText: event.target.value })}
                value={component.moreText ?? ""}
              />
            </SettingField>
          </SectionBlock>
          <SectionBlock title="展示设置">
            <SettingField label="列表风格">
              <PillOptions onChange={(value) => update({ listStyle: value as DecorComponent["listStyle"] })} options={["单列展示", "大图单列", "双列风格"]} value={component.listStyle ?? "单列展示"} />
            </SettingField>
            <SettingField label="排序方式">
              <PillOptions onChange={(value) => update({ sortMode: value as DecorComponent["sortMode"] })} options={["综合排序", "距离排序", "评分排序"]} value={component.sortMode ?? "综合排序"} />
            </SettingField>
            <SettingField label="显示数量">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ count: Number(event.target.value) || 0 })}
                type="number"
                value={component.count ?? 4}
              />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "ad-slot":
      return (
        <div className="space-y-5">
          <SectionBlock title="广告设置">
            <SettingField label="广告类型">
              <PillOptions onChange={(value) => update({ bannerType: value as DecorComponent["bannerType"] })} options={["单图广告", "左右广告", "左一右二"]} value={component.bannerType ?? "单图广告"} />
            </SettingField>
            <SettingField label="广告图片">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="上传广告图片" />
            </SettingField>
            <SettingField label="广告链接">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="/campaign/hero" />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "city-switch":
      return (
        <div className="space-y-5">
          <SectionBlock title="标题设置">
            <SettingField label="标题内容">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="全国" />
            </SettingField>
            <SettingField label="搜索按钮">
              <PillOptions onChange={() => undefined} options={["显示", "隐藏"]} value="显示" />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "location-module":
      return (
        <div className="space-y-5">
          <SectionBlock title="城市定位">
            <SettingField label="图标颜色">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
            </SettingField>
            <SettingField label="文字颜色">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
            </SettingField>
          </SectionBlock>
          <SectionBlock title="右部功能区">
            <SettingField label="图标颜色">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
            </SettingField>
            <SettingField label="图标大小">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "slider-block":
      return (
        <div className="space-y-5">
          <SectionBlock title="滑动块内容">
            <SettingField label="显示数量">
              <input
                className="h-11 rounded-xl border border-line bg-paper px-3 outline-none"
                onChange={(event) => update({ count: Number(event.target.value) || 0 })}
                type="number"
                value={component.count ?? 3}
              />
            </SettingField>
            <SettingField label="更多链接">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="/campaign" />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "technician-search":
      return (
        <div className="space-y-5">
          <SectionBlock title="搜索块设置">
            <SettingField label="占位文字">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="搜索技师 / 区域 / 技能" />
            </SettingField>
            <SettingField label="显示按钮">
              <PillOptions onChange={() => undefined} options={["显示", "隐藏"]} value="显示" />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "placeholder":
      return (
        <div className="space-y-5">
          <SectionBlock title="占位设置">
            <SettingField label="组件状态">
              <PillOptions onChange={(value) => update({ visible: value === "显示" })} options={["显示", "隐藏"]} value={component.visible ? "显示" : "隐藏"} />
            </SettingField>
            <SettingField label="占位说明">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="预留未来模块" />
            </SettingField>
          </SectionBlock>
        </div>
      );
    case "bottom-nav":
      return (
        <div className="space-y-5">
          <SectionBlock title="底部导航">
            <SettingField label="当前预览端口">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="跟随左侧切换" />
            </SettingField>
            <SettingField label="高亮页签">
              <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="首页 / 日程 / NeeDo" />
            </SettingField>
          </SectionBlock>
        </div>
      );
    default:
      return null;
  }
}

function renderStyleTab(component: DecorComponent, update: (patch: Partial<DecorComponent>) => void) {
  return (
    <div className="space-y-5">
      <SectionBlock title="样式设置">
        <SettingField label="图标样式">
          <PillOptions onChange={(value) => update({ styleMode: value as DecorComponent["styleMode"] })} options={["默认样式", "镂空样式", "浅色背景"]} value={component.styleMode ?? "默认样式"} />
        </SettingField>
        <SettingField label="颜色方案">
          <PillOptions onChange={(value) => update({ colorMode: value as DecorComponent["colorMode"] })} options={["跟随系统", "图标配色", "自定义"]} value={component.colorMode ?? "跟随系统"} />
        </SettingField>
        <SettingField label="图标形状">
          <PillOptions onChange={(value) => update({ iconShape: value as DecorComponent["iconShape"] })} options={["圆角方形", "圆形"]} value={component.iconShape ?? "圆角方形"} />
        </SettingField>
      </SectionBlock>
      <SectionBlock title="边距与圆角">
        <div className="grid grid-cols-2 gap-3">
          <SettingField label="上边距">
            <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
          </SettingField>
          <SettingField label="下边距">
            <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
          </SettingField>
          <SettingField label="左边距">
            <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
          </SettingField>
          <SettingField label="右边距">
            <input className="h-11 rounded-xl border border-line bg-paper px-3 outline-none" defaultValue="默认" />
          </SettingField>
        </div>
      </SectionBlock>
    </div>
  );
}

export function DecorationPage() {
  const [portal, setPortal] = useState<PreviewPortal>("user");
  const [theme, setTheme] = useState<DecorTheme>("light");
  const [tab, setTab] = useState<DecorTab>("content");
  const [selectedId, setSelectedId] = useState<DecorComponentId>("carousel");
  const [components, setComponents] = useState<DecorComponent[]>(componentLibrary);
  const profileCardBackgroundSettings = useProfileCardBackgroundSettings();

  const selected = useMemo(
    () => components.find((component) => component.id === selectedId) ?? components[0],
    [components, selectedId]
  );
  const ordered = useMemo(() => [...components].sort((left, right) => left.order - right.order), [components]);
  const visibleCount = components.filter((component) => component.visible).length;

  const updateComponent = (id: DecorComponentId, patch: Partial<DecorComponent>) => {
    setComponents((current) => current.map((component) => (component.id === id ? { ...component, ...patch } : component)));
  };

  const moveSelected = (direction: "up" | "down") => {
    setComponents((current) => {
      const sorted = [...current].sort((left, right) => left.order - right.order);
      const index = sorted.findIndex((component) => component.id === selectedId);
      if (index < 0) {
        return current;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sorted.length) {
        return current;
      }
      const next = [...sorted];
      const oldOrder = next[index].order;
      next[index] = { ...next[index], order: next[targetIndex].order };
      next[targetIndex] = { ...next[targetIndex], order: oldOrder };
      return next;
    });
  };

  const duplicateSelected = () => {
    setComponents((current) => {
      const source = current.find((component) => component.id === selectedId);
      if (!source) {
        return current;
      }

      const duplicateId = `${source.id}-${Date.now()}` as DecorComponentId;
      return [
        ...current,
        {
          ...source,
          id: duplicateId,
          title: `${source.title}副本`,
          order: current.length
        }
      ];
    });
  };

  const resetLayout = () => {
    setComponents(componentLibrary);
    setPortal("user");
    setTheme("light");
    setSelectedId("carousel");
    setTab("content");
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="装修中心"
        description="左侧选择基础组件，中间实时查看手机模拟器，右侧配置内容与样式。手机模拟器套用我们自己的前端 UI，不再沿用旧的外部设计。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">{visibleCount} 个组件已启用</Badge>
            <Badge tone={theme === "dark" ? "yellow" : "green"}>{theme === "dark" ? "黑金主题" : "白绿主题"}</Badge>
            <Button variant="secondary" onClick={resetLayout}>
              恢复默认
            </Button>
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[300px,minmax(0,1fr),430px]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-white p-5 shadow-panel">
              <h2 className="text-xl font-black">基础组件</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {basicComponentOrder.map((id) => {
                  const component = components.find((item) => item.id === id);
                  if (!component) {
                    return null;
                  }
                  return <GlyphCard component={component} key={id} onClick={() => setSelectedId(component.id)} selected={selectedId === component.id} />;
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-white p-5 shadow-panel">
              <h2 className="text-base font-black">前端下方导航切换</h2>
              <div className="mt-4 grid gap-2">
                {portalOptions.map((option) => (
                  <button
                    className={cn(
                      "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                      portal === option.id ? "border-sky bg-sky/8 text-sky" : "border-line bg-paper text-ink"
                    )}
                    key={option.id}
                    onClick={() => setPortal(option.id)}
                    type="button"
                  >
                    <span className="font-black">{option.label}</span>
                    <span className="text-xs font-bold text-ink/45">{option.nav.join(" / ")}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-2xl bg-paper p-4">
                <p className="text-xs font-bold text-ink/45">手机主题切换</p>
                <div className="mt-3 flex gap-2">
                  {themeOptions.map((option) => (
                    <button
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-black transition",
                        theme === option.id ? "border-sky bg-sky/8 text-sky" : "border-line bg-white text-ink/70"
                      )}
                      key={option.id}
                      onClick={() => setTheme(option.id)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </aside>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-panel">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <TitleWithInfo
                as="h2"
                info="中间预览永远套用我们自己的前端 UI，组件被选中后会用蓝框高亮。"
                label="手机模拟器说明"
                title="手机模拟器"
                titleClassName="text-xl font-black"
                variant="paper"
              />
              <div className="flex items-center gap-2">
                <Badge tone="green">{portalOptions.find((item) => item.id === portal)?.label}</Badge>
                <Badge tone="blue">{selected.title}</Badge>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr,74px]">
              <PhoneFrame theme={theme}>
                <DecorationPreview components={ordered} onSelect={setSelectedId} portal={portal} selectedId={selectedId} theme={theme} />
              </PhoneFrame>

              <div className="flex flex-col items-center gap-3 self-center rounded-[22px] bg-[#4da2ff] px-3 py-4 text-white shadow-[0_18px_40px_rgba(45,133,255,0.22)]">
                {[
                  { label: selected.visible ? "隐藏" : "显示", icon: selected.visible ? "眼" : "藏", action: () => updateComponent(selected.id, { visible: !selected.visible }) },
                  { label: "复制", icon: "叠", action: duplicateSelected },
                  { label: "上移", icon: "↑", action: () => moveSelected("up") },
                  { label: "下移", icon: "↓", action: () => moveSelected("down") }
                ].map((item) => (
                  <button className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-base font-black transition hover:bg-white/20" key={item.label} onClick={item.action} title={item.label} type="button">
                    {item.icon}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-line bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <TitleWithInfo
                as="h2"
                info={selected.summary}
                label={`${selected.title}说明`}
                title={selected.title}
                titleClassName="text-xl font-black"
                variant="paper"
              />
              <div className="inline-flex rounded-2xl bg-paper p-1">
                {(["content", "style"] as DecorTab[]).map((item) => (
                  <button
                    className={cn("rounded-xl px-4 py-2 text-sm font-black transition", tab === item ? "bg-sky text-white" : "text-ink/55")}
                    key={item}
                    onClick={() => setTab(item)}
                    type="button"
                  >
                    {item === "content" ? "内容" : "样式"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 max-h-[780px] overflow-y-auto pr-1">
              <div className="space-y-5">
                {tab === "content" ? renderContentTab(selected, (patch) => updateComponent(selected.id, patch)) : renderStyleTab(selected, (patch) => updateComponent(selected.id, patch))}
                <SectionBlock title="简易信息卡背景">
                  <SettingField label="编辑入口">
                    <PillOptions
                      onChange={(value) => setProfileCardBackgroundEditEntryEnabled(value === "开启")}
                      options={["开启", "关闭"]}
                      value={profileCardBackgroundSettings.editEntryEnabled ? "开启" : "关闭"}
                    />
                  </SettingField>
                  <p className="text-xs leading-5 text-ink/50">控制自己的设定和店铺后台里的背景编辑入口；简易信息卡本体不显示编辑按钮。</p>
                </SectionBlock>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button>保存</Button>
            </div>
          </aside>
        </div>
      </ModuleShell>
    </AdminLayout>
  );
}
