import { useMemo, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { operationTimeline } from "../../data/mock";
import { cn } from "../../lib/utils";

type OperationTimelineItem = (typeof operationTimeline)[number];

const statusMeta: Record<string, { label: string; tone: BadgeTone }> = {
  done: { label: "已完成", tone: "green" },
  processing: { label: "处理中", tone: "yellow" },
  watching: { label: "观察中", tone: "red" }
};

const priorityTone: Record<string, BadgeTone> = {
  P1: "red",
  P2: "yellow",
  P3: "neutral"
};

function getUniqueOptions(items: OperationTimelineItem[], key: "city" | "category" | "priority") {
  return Array.from(new Set(items.map((item) => item[key]))).filter(Boolean);
}

function getDateLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${month}/${day}`;
}

function matchesTimelineSearch(item: OperationTimelineItem, query: string) {
  if (!query) {
    return true;
  }

  const source = [
    item.at,
    item.title,
    item.owner,
    item.city,
    item.category,
    item.priority,
    item.impact,
    item.detail,
    statusMeta[item.status]?.label ?? item.status
  ].join(" ");

  return source.toLowerCase().includes(query.toLowerCase());
}

export function OperationTimelinePage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [city, setCity] = useState("all");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [date, setDate] = useState("all");

  const sortedTimeline = useMemo(
    () => [...operationTimeline].sort((left, right) => right.at.localeCompare(left.at)),
    []
  );
  const cityOptions = useMemo(() => getUniqueOptions(sortedTimeline, "city"), [sortedTimeline]);
  const categoryOptions = useMemo(() => getUniqueOptions(sortedTimeline, "category"), [sortedTimeline]);
  const priorityOptions = useMemo(() => getUniqueOptions(sortedTimeline, "priority"), [sortedTimeline]);
  const dateOptions = useMemo(() => Array.from(new Set(sortedTimeline.map((item) => item.at.slice(0, 10)))), [sortedTimeline]);
  const filteredTimeline = useMemo(
    () =>
      sortedTimeline.filter((item) => {
        if (!matchesTimelineSearch(item, query.trim())) {
          return false;
        }
        if (status !== "all" && item.status !== status) {
          return false;
        }
        if (city !== "all" && item.city !== city) {
          return false;
        }
        if (category !== "all" && item.category !== category) {
          return false;
        }
        if (priority !== "all" && item.priority !== priority) {
          return false;
        }
        if (date !== "all" && item.at.slice(0, 10) !== date) {
          return false;
        }

        return true;
      }),
    [category, city, date, priority, query, sortedTimeline, status]
  );
  const activeCount = sortedTimeline.filter((item) => item.status !== "done").length;
  const latestItem = sortedTimeline[0];
  const filteredDoneCount = filteredTimeline.filter((item) => item.status === "done").length;
  const filteredActiveCount = filteredTimeline.length - filteredDoneCount;

  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setCity("all");
    setCategory("all");
    setPriority("all");
    setDate("all");
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="运营时间线"
        description="把平台运营动作、异常观察、城市跟进和复盘记录集中成独立工作台，支持关键词与多维筛选。"
        actions={<Button to="/admin" variant="secondary">返回数据大盘</Button>}
      >
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <p className="text-sm font-bold text-ink/55">全部记录</p>
            <strong className="mt-2 block text-2xl font-black">{sortedTimeline.length}</strong>
            <p className="mt-2 text-xs font-semibold text-ink/45">当前筛选 {filteredTimeline.length} 条</p>
          </article>
          <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <p className="text-sm font-bold text-ink/55">待跟进</p>
            <strong className="mt-2 block text-2xl font-black">{activeCount}</strong>
            <p className="mt-2 text-xs font-semibold text-ink/45">处理中 / 观察中</p>
          </article>
          <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <p className="text-sm font-bold text-ink/55">覆盖城市</p>
            <strong className="mt-2 block text-2xl font-black">{cityOptions.length}</strong>
            <p className="mt-2 text-xs font-semibold text-ink/45">{cityOptions.join(" / ")}</p>
          </article>
          <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <p className="text-sm font-bold text-ink/55">最新动作</p>
            <strong className="mt-2 line-clamp-1 block text-lg font-black">{latestItem?.title ?? "-"}</strong>
            <p className="mt-2 text-xs font-semibold text-ink/45">{latestItem?.at ?? "-"}</p>
          </article>
        </section>

        <section className="rounded-lg border border-line bg-white p-3 shadow-panel">
          <div className="grid gap-3 xl:grid-cols-[minmax(220px,1.4fr),repeat(5,minmax(128px,0.72fr)),auto]">
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm">
              <span className="shrink-0 text-ink/45">⌕</span>
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink/40"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、负责人、城市、影响"
                value={query}
              />
            </label>
            <select className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none" onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="all">全部状态</option>
              {Object.entries(statusMeta).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <select className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none" onChange={(event) => setCity(event.target.value)} value={city}>
              <option value="all">全部城市</option>
              {cityOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none" onChange={(event) => setCategory(event.target.value)} value={category}>
              <option value="all">全部类型</option>
              {categoryOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none" onChange={(event) => setPriority(event.target.value)} value={priority}>
              <option value="all">全部优先级</option>
              {priorityOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none" onChange={(event) => setDate(event.target.value)} value={date}>
              <option value="all">全部日期</option>
              {dateOptions.map((item) => (
                <option key={item} value={item}>{getDateLabel(item)}</option>
              ))}
            </select>
            <Button className="h-10 whitespace-nowrap rounded-lg" onClick={resetFilters} variant="secondary">
              重置
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-lg font-black">时间线记录</h2>
              <p className="mt-1 text-sm text-ink/50">已完成 {filteredDoneCount} 条，待跟进 {filteredActiveCount} 条</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">已完成</Badge>
              <Badge tone="yellow">处理中</Badge>
              <Badge tone="red">观察中</Badge>
            </div>
          </div>

          {filteredTimeline.length > 0 ? (
            <div className="operation-timeline-list">
              {filteredTimeline.map((item) => {
                const [datePart, timePart] = item.at.split(" ");
                const meta = statusMeta[item.status] ?? { label: item.status, tone: "neutral" as BadgeTone };

                return (
                  <article className="operation-timeline-row grid gap-4 px-4 py-4 lg:grid-cols-[208px,minmax(0,1fr),220px] lg:items-start" key={`${item.at}-${item.title}`}>
                    <div className="flex min-w-0 items-center gap-3 lg:block">
                      <div className="grid h-10 w-[5.5rem] shrink-0 place-items-center rounded-lg bg-moss/10 px-3 text-sm font-black tabular-nums text-moss lg:mb-3">
                        {timePart}
                      </div>
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-sm font-black tabular-nums text-ink">{datePart}</p>
                        <Badge className="mt-2" tone="blue">{item.city}</Badge>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start gap-2">
                        <h3 className="min-w-0 text-lg font-black leading-7 text-ink">{item.title}</h3>
                        <Badge tone="neutral">{item.category}</Badge>
                        <Badge tone={priorityTone[item.priority] ?? "neutral"}>{item.priority}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink/60">{item.detail}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-ink/45">
                        <span className="rounded-md bg-paper px-2 py-1">{item.owner}</span>
                        <span className="rounded-md bg-paper px-2 py-1">{item.impact}</span>
                      </div>
                    </div>

                    <div className={cn("flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-3 lg:block", item.status !== "done" && "bg-lemon/15")}>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <p className="text-right text-xs font-bold leading-5 text-ink/45 lg:mt-3 lg:text-left">
                        {item.status === "done" ? "已归档，可用于复盘" : "需要继续跟进"}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-12 text-center">
              <h3 className="text-lg font-black">没有匹配的运营记录</h3>
              <p className="mt-2 text-sm text-ink/50">换一个关键词或减少筛选条件后再查看。</p>
            </div>
          )}
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
