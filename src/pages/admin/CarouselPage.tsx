import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useEntityStore } from "../../state/entityStore";
import {
  carouselImageOptions,
  carouselSceneLabels,
  carouselSceneLimits,
  createCarouselSlide,
  resetCarouselScene,
  saveCarouselScene,
  useCarouselStore,
  type CarouselSceneId,
  type CarouselSlideDraft
} from "../../state/homeCarouselStore";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getTodayToken() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTimeToken() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function getDraftStatus(slide: CarouselSlideDraft) {
  if (!slide.enabled) {
    return "disabled" as const;
  }

  const dateToken = getTodayToken();
  const timeToken = getTimeToken();

  if (dateToken < slide.startDate || (dateToken === slide.startDate && timeToken < slide.startTime)) {
    return "upcoming" as const;
  }

  if (dateToken > slide.endDate || (dateToken === slide.endDate && timeToken > slide.endTime)) {
    return "expired" as const;
  }

  return "active" as const;
}

function statusTone(status: "active" | "upcoming" | "expired" | "disabled") {
  if (status === "active") {
    return "green" as const;
  }

  if (status === "upcoming") {
    return "blue" as const;
  }

  if (status === "expired") {
    return "red" as const;
  }

  return "neutral" as const;
}

function statusLabel(status: "active" | "upcoming" | "expired" | "disabled") {
  if (status === "active") {
    return "当前生效";
  }

  if (status === "upcoming") {
    return "等待生效";
  }

  if (status === "expired") {
    return "已过期";
  }

  return "未启用";
}

const timelineTargetLabels: Record<"timeline-search" | "timeline-compose" | "timeline-notifications", string> = {
  "timeline-search": "动态搜索页",
  "timeline-compose": "发布动态页",
  "timeline-notifications": "动态通知页"
};

const sceneDescriptions: Record<CarouselSceneId, string> = {
  home: "首页轮播支持后台自由增减，前台最多显示 10 张，保存后用户首页立即同步。",
  timeline: "动态页顶部轮播支持后台自由增减，用户端 / 商户端 / 技师端动态页共用这组配置，最多 10 张。"
};

export function CarouselPage() {
  const { stores, technicians } = useEntityStore();
  const { scenes, revision } = useCarouselStore();
  const [activeScene, setActiveScene] = useState<CarouselSceneId>("home");
  const [drafts, setDrafts] = useState<Record<CarouselSceneId, CarouselSlideDraft[]>>(() => clone(scenes));
  const [saveMessage, setSaveMessage] = useState<Record<CarouselSceneId, string>>({
    home: "尚未保存新的首页轮播配置",
    timeline: "尚未保存新的动态轮播配置"
  });

  useEffect(() => {
    setDrafts(clone(scenes));
  }, [revision, scenes]);

  const currentDrafts = drafts[activeScene] ?? [];
  const currentSlides = useMemo(
    () =>
      currentDrafts.map((slide) => ({
        ...slide,
        status: getDraftStatus(slide)
      })),
    [currentDrafts]
  );
  const activeCount = currentSlides.filter((slide) => slide.status === "active").length;
  const upcomingCount = currentSlides.filter((slide) => slide.status === "upcoming").length;
  const disabledCount = currentSlides.filter((slide) => slide.status === "disabled" || slide.status === "expired").length;
  const remainingCount = Math.max(carouselSceneLimits[activeScene] - currentDrafts.length, 0);

  const updateSceneDrafts = (updater: (current: CarouselSlideDraft[]) => CarouselSlideDraft[]) => {
    setDrafts((current) => ({
      ...current,
      [activeScene]: updater(current[activeScene] ?? [])
    }));
  };

  const updateDraft = (slideId: string, patch: Partial<CarouselSlideDraft>) => {
    updateSceneDrafts((current) => current.map((slide) => (slide.id === slideId ? { ...slide, ...patch } : slide)));
  };

  const addSlide = () => {
    updateSceneDrafts((current) => {
      if (current.length >= carouselSceneLimits[activeScene]) {
        return current;
      }

      return [...current, createCarouselSlide(activeScene, current.length + 1)];
    });
  };

  const removeSlide = (slideId: string) => {
    updateSceneDrafts((current) => current.filter((slide) => slide.id !== slideId));
  };

  const restoreDefaults = () => {
    resetCarouselScene(activeScene);
    setSaveMessage((current) => ({
      ...current,
      [activeScene]: `${carouselSceneLabels[activeScene]}已恢复默认配置。`
    }));
  };

  const saveDrafts = () => {
    saveCarouselScene(activeScene, currentDrafts);
    setSaveMessage((current) => ({
      ...current,
      [activeScene]: `${carouselSceneLabels[activeScene]}已保存，前台会立即读取新配置。`
    }));
  };

  const targetLabel = (slide: CarouselSlideDraft) => {
    if (slide.target.type === "store") {
      const target = slide.target as { id: string };
      return stores.find((item) => item.id === target.id)?.name ?? "门店详情";
    }

    if (slide.target.type === "technician") {
      const target = slide.target as { id: string };
      return technicians.find((item) => item.id === target.id)?.name ?? "技师详情";
    }

    return timelineTargetLabels[slide.target.type as keyof typeof timelineTargetLabels];
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="轮播图"
        description="平台首页轮播和动态轮播都改成可自由增减的列表制，两个场景分别维护，单组最多 10 张。"
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={restoreDefaults}>
              恢复当前分组默认值
            </Button>
            <Button onClick={saveDrafts}>保存当前分组</Button>
          </div>
        )}
      >
        <section className="flex flex-wrap gap-2">
          {(["home", "timeline"] as CarouselSceneId[]).map((sceneId) => (
            <button
              className={`rounded-full px-4 py-2 text-sm font-black transition ${
                activeScene === sceneId ? "bg-moss text-white shadow-panel" : "bg-paper text-ink"
              }`}
              key={sceneId}
              onClick={() => setActiveScene(sceneId)}
              type="button"
            >
              {carouselSceneLabels[sceneId]}
            </button>
          ))}
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          {[
            ["当前生效", `${activeCount} / ${currentDrafts.length}`, "当前时间窗口内会展示的轮播图数量"],
            ["待生效", `${upcomingCount}`, "已经配置时间窗口，但还没到开始时间"],
            ["未启用/过期", `${disabledCount}`, "手动关闭或已经过期的轮播图"],
            ["剩余可加", `${remainingCount}`, saveMessage[activeScene]]
          ].map(([label, value, caption]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-xs font-bold text-ink/50">{label}</p>
              <strong className="mt-2 block text-xl leading-7">{value}</strong>
              <p className="mt-2 text-xs leading-5 text-ink/55">{caption}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info={sceneDescriptions[activeScene]}
              label={`${carouselSceneLabels[activeScene]}说明`}
              title={carouselSceneLabels[activeScene]}
              titleClassName="text-lg font-black"
              variant="paper"
            />

            <Button disabled={currentDrafts.length >= carouselSceneLimits[activeScene]} onClick={addSlide} variant="secondary">
              新增一张轮播图
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {currentSlides.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-5 text-sm text-ink/55">
                当前分组暂时没有轮播图，点击右上角新增即可开始配置。
              </div>
            ) : null}

            {currentSlides.map((slide, index) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={slide.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone="yellow">第 {index + 1} 张</Badge>
                      <Badge tone={statusTone(slide.status)}>{statusLabel(slide.status)}</Badge>
                    </div>
                    <h3 className="mt-3 text-lg font-black">{slide.title}</h3>
                    <p className="mt-1 text-sm text-ink/55">跳转到 {targetLabel(slide)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-2 text-xs font-black text-ink">
                      <input
                        checked={slide.enabled}
                        onChange={(event) => updateDraft(slide.id, { enabled: event.target.checked })}
                        type="checkbox"
                      />
                      启用
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => removeSlide(slide.id)}>
                      删除
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[280px,1fr]">
                  <div className="overflow-hidden rounded-lg bg-[#121212] text-white shadow-soft">
                    <div className="relative h-52">
                      <img alt={slide.title} className="absolute inset-0 h-full w-full object-cover opacity-80" src={slide.image} />
                      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent" />
                      <div className="relative flex h-full flex-col justify-end p-4">
                        <span className="inline-flex w-fit rounded-md bg-[#7c4c38] px-3 py-1 text-xs font-black text-[#ffc2a8]">{slide.badge}</span>
                        <h4 className="mt-3 text-2xl font-black leading-tight">{slide.title}</h4>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/75">{slide.caption}</p>
                        <span className="mt-4 inline-flex w-fit rounded-full bg-[#e5be6d] px-4 py-2 text-xs font-black text-black">{slide.cta}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">角标</span>
                      <input
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { badge: event.target.value })}
                        value={slide.badge}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">按钮文案</span>
                      <input
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { cta: event.target.value })}
                        value={slide.cta}
                      />
                    </label>
                    <label className="grid gap-1 md:col-span-2">
                      <span className="text-xs font-bold text-ink/50">主标题</span>
                      <input
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { title: event.target.value })}
                        value={slide.title}
                      />
                    </label>
                    <label className="grid gap-1 md:col-span-2">
                      <span className="text-xs font-bold text-ink/50">说明文案</span>
                      <textarea
                        className="min-h-[84px] rounded-lg border border-line bg-paper px-3 py-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { caption: event.target.value })}
                        value={slide.caption}
                      />
                    </label>
                    <label className="grid gap-1 md:col-span-2">
                      <span className="text-xs font-bold text-ink/50">图片素材</span>
                      <select
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { image: event.target.value })}
                        value={slide.image}
                      >
                        {carouselImageOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {activeScene === "home" ? (
                      <>
                        <label className="grid gap-1">
                          <span className="text-xs font-bold text-ink/50">跳转对象</span>
                          <select
                            className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                            onChange={(event) =>
                              updateDraft(slide.id, {
                                target: {
                                  type: event.target.value === "technician" ? "technician" : "store",
                                  id:
                                    event.target.value === "technician"
                                      ? technicians[0]?.id ?? (slide.target.type === "technician" ? slide.target.id : "")
                                      : stores[0]?.id ?? (slide.target.type === "store" ? slide.target.id : "")
                                }
                              })
                            }
                            value={slide.target.type === "technician" ? "technician" : "store"}
                          >
                            <option value="store">门店详情</option>
                            <option value="technician">技师详情</option>
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-bold text-ink/50">跳转目标</span>
                          <select
                            className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                            onChange={(event) =>
                              updateDraft(slide.id, {
                                target: {
                                  type: slide.target.type === "technician" ? "technician" : "store",
                                  id: event.target.value
                                }
                              })
                            }
                            value={slide.target.type === "store" || slide.target.type === "technician" ? slide.target.id : ""}
                          >
                            {(slide.target.type === "technician" ? technicians : stores).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <label className="grid gap-1 md:col-span-2">
                        <span className="text-xs font-bold text-ink/50">跳转位置</span>
                        <select
                          className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                          onChange={(event) =>
                            updateDraft(slide.id, {
                              target: {
                                type: event.target.value as "timeline-search" | "timeline-compose" | "timeline-notifications"
                              }
                            })
                          }
                          value={slide.target.type}
                        >
                          {Object.entries(timelineTargetLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">开始日期</span>
                      <input
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { startDate: event.target.value })}
                        type="date"
                        value={slide.startDate}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">结束日期</span>
                      <input
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { endDate: event.target.value })}
                        type="date"
                        value={slide.endDate}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">开始时间</span>
                      <input
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { startTime: event.target.value })}
                        type="time"
                        value={slide.startTime}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">结束时间</span>
                      <input
                        className="h-10 rounded-lg border border-line bg-paper px-3 outline-none"
                        onChange={(event) => updateDraft(slide.id, { endTime: event.target.value })}
                        type="time"
                        value={slide.endTime}
                      />
                    </label>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
