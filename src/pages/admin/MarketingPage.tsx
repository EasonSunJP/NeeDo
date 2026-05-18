import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ChartPanel } from "../../components/admin/ChartPanel";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { campaigns, coupons } from "../../data/mock";
import { percent, yen } from "../../lib/utils";
import type { Campaign, Coupon } from "../../types/domain";

export function MarketingPage() {
  const [campaignRows, setCampaignRows] = useState<Campaign[]>(campaigns);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [campaignDraft, setCampaignDraft] = useState({
    name: "东京夜间按摩复购活动",
    channel: "LINE",
    attribution: "会员券 + 群发消息",
    roi: "2.6",
    status: "draft" as Campaign["status"]
  });

  const createCampaign = () => {
    if (!campaignDraft.name.trim()) {
      return;
    }

    setCampaignRows((current) => [
      {
        id: `camp-${Date.now()}`,
        name: campaignDraft.name,
        channel: campaignDraft.channel,
        attribution: campaignDraft.attribution,
        roi: Number(campaignDraft.roi) || 0,
        status: campaignDraft.status
      },
      ...current
    ]);
    setShowCreateCampaign(false);
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="营销中心"
        description="优惠券、活动、新人券、回流券、限时券、满减券、裂变邀请和渠道归因集中管理。"
        actions={<Button onClick={() => setShowCreateCampaign(true)}>新建活动</Button>}
      >
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["发放量", "24,200", "+18%"],
            ["领取量", "11,520", "+11%"],
            ["核销量", "3,860", "+8%"],
            ["活动 GMV", "¥52.4M", "+24%"]
          ].map(([label, value, change]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-sm text-ink/55">{label}</p>
              <strong className="mt-2 block text-2xl">{value}</strong>
              <Badge className="mt-3" tone="green">{change}</Badge>
            </article>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr,1.1fr]">
          <ChartPanel title="活动 GMV / ROI" caption="支持按渠道、城市、类目和券类型拆解。" />
          <section>
            <h2 className="mb-3 text-lg font-bold">优惠券管理</h2>
            <FilterBar
              actions
              searchPlaceholder="搜索优惠券"
              filters={[
                { label: "券类型", options: [{ label: "新人券", value: "new" }, { label: "回流券", value: "return" }, { label: "限时券", value: "limited" }] },
                { label: "状态", options: [{ label: "投放中", value: "active" }, { label: "暂停", value: "paused" }] },
                { label: "渠道", options: [{ label: "App", value: "app" }, { label: "LINE", value: "line" }] }
              ]}
            />
          </section>
        </div>

        <section className="mt-5">
          <DataTable<Coupon>
            columns={[
              { key: "name", title: "优惠券", render: (row) => row.name },
              { key: "type", title: "类型", render: (row) => row.type },
              { key: "value", title: "面额", render: (row) => row.value },
              { key: "issued", title: "发放量", render: (row) => row.issued },
              { key: "claimed", title: "领取量", render: (row) => row.claimed },
              { key: "redeemed", title: "核销量", render: (row) => row.redeemed },
              { key: "rate", title: "核销率", render: (row) => percent((row.redeemed / row.claimed) * 100) },
              { key: "gmv", title: "GMV", render: (row) => yen(row.gmv) }
            ]}
            footerPlacement="inline"
            rows={coupons}
          />
        </section>

        <section className="mt-5">
          <h2 className="mb-3 text-lg font-bold">渠道活动归因</h2>
          <DataTable<Campaign>
            columns={[
              { key: "name", title: "活动", render: (row) => row.name },
              { key: "channel", title: "渠道", render: (row) => row.channel },
              { key: "attribution", title: "归因", render: (row) => row.attribution },
              { key: "roi", title: "ROI", render: (row) => row.roi },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "active" ? "green" : "yellow"}>{row.status}</Badge> }
            ]}
            footerPlacement="inline"
            rows={campaignRows}
          />
        </section>
      </ModuleShell>

      <Drawer open={showCreateCampaign} title="新建活动" onClose={() => setShowCreateCampaign(false)}>
        <div className="space-y-5">
          <section className="rounded-lg border border-line bg-paper p-4">
            <TitleWithInfo
              as="h3"
              info="创建后会立即出现在渠道活动归因表里，后续可以继续接优惠券、CPS 和 IM 群发。"
              label="活动基础信息说明"
              title="活动基础信息"
              titleClassName="font-black"
              variant="paper"
            />
          </section>
          <div className="grid gap-3">
            {[
              ["name", "活动名称"],
              ["channel", "投放渠道"],
              ["attribution", "归因方式"],
              ["roi", "预计 ROI"]
            ].map(([key, label]) => (
              <label className="block text-sm font-bold text-ink/65" key={key}>
                {label}
                <input
                  className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setCampaignDraft((current) => ({ ...current, [key]: event.target.value }))}
                  value={campaignDraft[key as keyof typeof campaignDraft]}
                />
              </label>
            ))}
            <label className="block text-sm font-bold text-ink/65">
              活动状态
              <select
                className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none focus:border-moss"
                onChange={(event) => setCampaignDraft((current) => ({ ...current, status: event.target.value as Campaign["status"] }))}
                value={campaignDraft.status}
              >
                <option value="draft">草稿</option>
                <option value="active">投放中</option>
                <option value="paused">暂停</option>
                <option value="finished">已结束</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setShowCreateCampaign(false)}>取消</Button>
            <Button disabled={!campaignDraft.name.trim()} onClick={createCampaign}>创建活动</Button>
          </div>
        </div>
      </Drawer>
    </AdminLayout>
  );
}
