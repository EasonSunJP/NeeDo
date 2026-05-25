import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { backofficeRealDataApi, mapBackofficeMerchant, mapBackofficeStore } from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { StoreEntitySyncEditor } from "../../components/admin/EntitySyncEditor";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { HorizontalScrollArea } from "../../components/ui/HorizontalScrollArea";
import { Tabs } from "../../components/ui/Tabs";
import { serviceCategories, services } from "../../data/mock";
import { yen } from "../../lib/utils";
import type { Merchant, ServiceCategory, ServiceItem, Store } from "../../types/domain";

const tabs = ["店铺列表", "店铺分类", "入驻审核", "服务项目", "营业配置", "图片标签"];

const categoryPalette = ["#39c27f", "#f58b50", "#4b7cff", "#e85f72", "#9a6cff", "#24a8b8", "#d9a32f", "#59687a"];

function isStoreRow(value: Merchant | Store | ServiceItem | ServiceCategory): value is Store {
  return "merchantId" in value && "openStatus" in value;
}

export function MerchantsPage() {
  const [searchParams] = useSearchParams();
  const [active, setActive] = useState(searchParams.get("module") === "categories" ? "店铺分类" : "店铺列表");
  const [selected, setSelected] = useState<Merchant | Store | ServiceItem | ServiceCategory | null>(null);
  const [categoryRows, setCategoryRows] = useState(serviceCategories);
  const [realStores, setRealStores] = useState<Store[]>([]);
  const [realMerchants, setRealMerchants] = useState<Merchant[]>([]);

  useEffect(() => {
    if (searchParams.get("module") === "categories") {
      setActive("店铺分类");
    }
  }, [searchParams]);

  useEffect(() => {
    let activeRequest = true;

    backofficeRealDataApi.shops("backoffice").then((response) => {
      if (activeRequest) {
        setRealStores(response.list.map(mapBackofficeStore));
        setRealMerchants(response.list.map(mapBackofficeMerchant));
      }
    }).catch(() => {
      if (activeRequest) {
        setRealStores([]);
        setRealMerchants([]);
      }
    });

    return () => {
      activeRequest = false;
    };
  }, []);

  const addCategory = () => {
    setCategoryRows((current) => [
      {
        id: `category-${Date.now()}`,
        name: "新增分类",
        icon: "新",
        mode: "both",
        hot: false
      },
      ...current
    ]);
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="店铺与商家管理"
        description="覆盖多门店资料、营业时间、服务区域、图片、项目菜单、标签、状态开关、入驻资质审核与服务上下架。"
        actions={<Button>新增商家</Button>}
      >
        <Tabs active={active} items={tabs} onChange={setActive} />
        <div className="mt-4">
          <FilterBar
            actions
            searchPlaceholder="搜索商家、门店、类目、区域"
            filters={[
              { label: "城市", options: [{ label: "东京", value: "tokyo" }, { label: "大阪", value: "osaka" }] },
              { label: "状态", options: [{ label: "营业中", value: "open" }, { label: "待审核", value: "pending" }] },
              { label: "类目", options: serviceCategories.map((item) => ({ label: item.name, value: item.id })) }
            ]}
          />
        </div>

        {active === "店铺列表" && (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {realStores.map((store) => (
              <article className="overflow-hidden rounded-lg border border-line bg-white shadow-panel" key={store.id}>
                <div className="grid gap-0 md:grid-cols-[220px,1fr]">
                  <img alt={store.name} className="h-full min-h-[230px] w-full object-cover" src={store.cover} />
                  <div className="flex min-w-0 flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-moss">{store.area} · {store.businessHours}</p>
                        <h2 className="mt-1 truncate text-xl font-black">{store.name}</h2>
                        <p className="mt-1 text-xs font-bold text-ink/45">ID {store.systemId}</p>
                        {store.accountUsername ? <p className="mt-1 text-xs font-bold text-coral">测试账号 {store.accountUsername}</p> : null}
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/55">{store.description}</p>
                      </div>
                      <Badge tone={store.openStatus === "open" ? "green" : "yellow"}>{store.openStatus}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        ["评分", store.rating],
                        ["评论", store.reviewCount],
                        ["价格", store.priceLabel]
                      ].map(([label, value]) => (
                        <div className="rounded-lg bg-paper p-3" key={label}>
                          <p className="text-[11px] font-bold text-ink/45">{label}</p>
                          <strong className="mt-1 block truncate text-sm">{value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {store.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      <Button size="sm" onClick={() => setSelected(store)}>查看详情</Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelected(store)}>编辑资料</Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelected(store)}>营业设置</Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {active === "店铺分类" && (
          <section className="mt-4 space-y-5">
            <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-3 text-sm font-bold text-ink/65">
                  输入查询
                  <span className="flex h-10 w-[260px] items-center rounded-lg border border-line bg-paper px-3">
                    <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="请输入搜索内容" />
                    <span className="text-xs text-ink/35">0 / 10</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 text-sm font-bold text-ink/65">
                  分类状态
                  <select className="h-10 rounded-lg border border-line bg-paper px-3 outline-none">
                    <option>全部</option>
                    <option>启用</option>
                    <option>禁用</option>
                  </select>
                </label>
                <Button size="sm">搜索</Button>
                <Button size="sm" variant="secondary">重置</Button>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <Button onClick={addCategory}>添加分类</Button>
              <HorizontalScrollArea ariaLabel="店铺分类表格横向滚动区域" className="mt-5">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead className="bg-paper text-xs font-bold text-ink/55">
                    <tr>
                      <th className="border-b border-line px-4 py-3">ID</th>
                      <th className="border-b border-line px-4 py-3">分类名称</th>
                      <th className="border-b border-line px-4 py-3">分类图标</th>
                      <th className="border-b border-line px-4 py-3">分类状态</th>
                      <th className="border-b border-line px-4 py-3">排序编号</th>
                      <th className="border-b border-line px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((category, index) => (
                      <tr className="border-b border-line last:border-b-0" key={category.id}>
                        <td className="px-4 py-4 text-ink/65">{index + 1}</td>
                        <td className="px-4 py-4 font-bold">{category.name}</td>
                        <td className="px-4 py-4">
                          <span
                            className="grid h-10 w-10 place-items-center rounded-lg text-sm font-black text-white shadow-panel"
                            style={{ background: categoryPalette[index % categoryPalette.length] }}
                          >
                            {category.icon}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={category.hot ? "green" : "neutral"}>{category.hot ? "启用" : "启用"}</Badge>
                        </td>
                        <td className="px-4 py-4 font-bold">{index + 1}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setSelected(category)}>编辑</Button>
                            <Button size="sm" variant="ghost" onClick={() => setCategoryRows((current) => current.filter((item) => item.id !== category.id))}>
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HorizontalScrollArea>
            </div>
          </section>
        )}

        {active === "入驻审核" && (
          <div className="mt-4">
            <DataTable<Merchant>
              columns={[
                { key: "name", title: "商家名称", render: (row) => row.name },
                { key: "city", title: "地区申请", render: (row) => row.city },
                { key: "categories", title: "服务类目申请", render: (row) => row.categories.join("、") },
                { key: "documents", title: "营业资质", render: (row) => row.documents.join("、") },
                { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "pending" ? "yellow" : "green"}>{row.status}</Badge> }
              ]}
              footerPlacement="inline"
                rows={realMerchants}
              onView={setSelected}
            />
          </div>
        )}

        {active === "服务项目" && (
          <div className="mt-4 grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
            <DataTable<ServiceItem>
              columns={[
                { key: "name", title: "服务项目", render: (row) => row.name },
                { key: "mode", title: "模式", render: (row) => row.mode },
                { key: "price", title: "价格", render: (row) => yen(row.priceFrom) },
                { key: "duration", title: "套餐", render: (row) => `${row.packages.length} 个` },
                { key: "areas", title: "可售区域", render: (row) => row.serviceAreas.join("、") },
                { key: "status", title: "上下架", render: () => <Badge tone="green">上架</Badge> }
              ]}
              footerPlacement="inline"
              rows={services}
              onView={setSelected}
            />
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="font-bold">服务类目</h2>
              <div className="mt-3 grid gap-2">
                <DataTable<ServiceCategory>
                  columns={[
                    { key: "name", title: "类目", render: (row) => row.name },
                    { key: "mode", title: "模式", render: (row) => row.mode },
                    { key: "hot", title: "运营", render: (row) => <Badge tone={row.hot ? "red" : "neutral"}>{row.hot ? "热门" : "常规"}</Badge> }
                  ]}
                  footerPlacement="inline"
                  rows={serviceCategories}
                  pageSize={6}
                />
              </div>
            </section>
          </div>
        )}

        {active === "营业配置" && (
          <section className="mt-4 grid gap-3 md:grid-cols-3">
            {realStores.map((store) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={store.id}>
                <h2 className="font-bold">{store.name}</h2>
                <p className="mt-2 text-sm text-ink/60">营业时间：{store.businessHours}</p>
                <p className="mt-1 text-sm text-ink/60">服务区域：{store.area} 周边 5km</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary">编辑时间</Button>
                  <Button size="sm" variant="secondary">配置区域</Button>
                  <Button size="sm" variant="secondary">状态开关</Button>
                </div>
              </article>
            ))}
          </section>
        )}

        {active === "图片标签" && (
          <section className="mt-4 grid gap-4 md:grid-cols-2">
            {realStores.map((store) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={store.id}>
                <img alt={store.name} className="h-40 w-full rounded-lg object-cover" src={store.cover} />
                <h2 className="mt-3 font-bold">{store.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {store.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
                <Button className="mt-3" size="sm" variant="secondary">管理图片与标签</Button>
              </article>
            ))}
          </section>
        )}
      </ModuleShell>

      <Drawer open={Boolean(selected)} title="商家 / 门店详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            {isStoreRow(selected) ? <StoreEntitySyncEditor key={selected.id} store={selected} /> : null}
            <DetailGrid
              items={[
                ...(("systemId" in selected && selected.systemId)
                  ? [{ label: "系统ID", value: selected.systemId }]
                  : []),
                ...(("accountUsername" in selected && selected.accountUsername)
                  ? [{ label: "联动账号", value: selected.accountUsername }]
                  : []),
                ...Object.entries(selected)
                  .filter(([label]) => !["accountUsername", "systemId"].includes(label))
                  .slice(0, 12)
                  .map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join("、") : String(value) }))
              ]}
            />
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {["编辑资料", "审核通过", "审核拒绝", "服务区域", "项目菜单", "状态开关", "审核记录"].map((action) => (
            <Button key={action} size="sm" variant={action === "审核拒绝" ? "danger" : "secondary"} onClick={() => selected && isStoreRow(selected) && setSelected(selected)}>
              {action}
            </Button>
          ))}
        </div>
      </Drawer>
    </AdminLayout>
  );
}
