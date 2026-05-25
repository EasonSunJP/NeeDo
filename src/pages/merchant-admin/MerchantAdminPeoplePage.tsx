import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { backofficeRealDataApi, mapBackofficeTechnician } from "../../api/backofficeRealData";
import { CustomerManagementModule } from "../../components/admin/CustomerManagementModule";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { TechnicianEntitySyncEditor } from "../../components/admin/EntitySyncEditor";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { TechnicianListModule } from "../../components/admin/TechnicianListModule";
import { TechnicianProfilePanel } from "../../components/admin/TechnicianProfilePanel";
import { Badge } from "../../components/ui/Badge";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { getMerchantAdminDemo } from "../../data/merchantAdmin";
import { useEntityStore } from "../../state/entityStore";
import type { Review, Technician } from "../../types/domain";

type PeopleModule = "staff" | "customers" | "reviews";

function normalizeModule(value: string | null): PeopleModule {
  if (value === "customers" || value === "reviews") {
    return value;
  }

  return "staff";
}

export function MerchantAdminPeoplePage() {
  const { customers, technicians } = useEntityStore();
  const merchantAdminDemo = getMerchantAdminDemo();
  const [searchParams] = useSearchParams();
  const [selectedStaff, setSelectedStaff] = useState<Technician | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [realStaff, setRealStaff] = useState<Technician[]>([]);
  const module = normalizeModule(searchParams.get("module"));
  const getCustomerDisplayName = (name: string) => {
    const customer = customers.find((item) => item.name === name || item.nickname === name);
    return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? name;
  };
  const getTechnicianDisplayName = (name: string) => {
    const technician = technicians.find((item) => item.name === name || item.nickname === name);
    return technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? name;
  };

  useEffect(() => {
    let activeRequest = true;

    backofficeRealDataApi.technicians("merchant-admin").then((response) => {
      if (activeRequest) {
        setRealStaff(response.list.map(mapBackofficeTechnician));
      }
    }).catch(() => {
      if (activeRequest) {
        setRealStaff([]);
      }
    });

    return () => {
      activeRequest = false;
    };
  }, []);

  const config = {
    staff: {
      title: "员工列表",
      description: "与平台运营后台共用同一套员工列表模块，商户侧只展示当前商户可管理的员工数据。",
      content: (
        <TechnicianListModule context="merchant" onSelectTechnician={setSelectedStaff} stores={merchantAdminDemo.stores} technicians={realStaff} />
      )
    },
    customers: {
      title: "用户管理",
      description: "与平台运营后台共用同一套用户管理模块，商户侧只展示当前商户可见的顾客与订单数据。",
      content: (
        <CustomerManagementModule customers={merchantAdminDemo.customers} orderRows={merchantAdminDemo.orders} />
      )
    },
    reviews: {
      title: "评价中心",
      description: "店铺后台只回复本店和本店员工相关的评价，不处理平台其他商家评价。",
      content: (
        <DataTable<Review>
          columns={[
            { key: "customerName", title: "顾客", render: (row) => getCustomerDisplayName(row.customerName) },
            { key: "targetName", title: "评价对象", render: (row) => getTechnicianDisplayName(row.targetName) },
            { key: "rating", title: "星级", render: (row) => `${row.rating} / 5` },
            { key: "tone", title: "情绪", render: (row) => <Badge tone={row.tone === "positive" ? "green" : row.tone === "neutral" ? "yellow" : "red"}>{row.tone}</Badge> },
            { key: "createdAt", title: "时间", render: (row) => row.createdAt },
            { key: "replied", title: "回复", render: (row) => <Badge tone={row.replied ? "green" : "yellow"}>{row.replied ? "已回复" : "待回复"}</Badge> }
          ]}
          onView={setSelectedReview}
          pageSize={10}
          rows={merchantAdminDemo.reviews}
        />
      )
    }
  }[module];

  return (
    <MerchantAdminLayout>
      <ModuleShell description={config.description} title={config.title}>
        {config.content}

        <Drawer onClose={() => setSelectedStaff(null)} open={Boolean(selectedStaff)} title="员工详细信息卡">
          {selectedStaff ? (
            <div className="space-y-5">
              <TechnicianEntitySyncEditor key={selectedStaff.id} technician={selectedStaff} />
              <TechnicianProfilePanel context="merchant" technician={selectedStaff} />
            </div>
          ) : null}
        </Drawer>

        <Drawer onClose={() => setSelectedReview(null)} open={Boolean(selectedReview)} title="评价详情">
          {selectedReview ? (
            <div className="space-y-5">
              <DetailGrid
                items={[
                  { label: "顾客", value: getCustomerDisplayName(selectedReview.customerName) },
                  { label: "评价对象", value: getTechnicianDisplayName(selectedReview.targetName) },
                  { label: "评分", value: `${selectedReview.rating} / 5` },
                  { label: "情绪", value: selectedReview.tone },
                  { label: "时间", value: selectedReview.createdAt },
                  { label: "回复状态", value: selectedReview.replied ? "已回复" : "待回复" }
                ]}
              />
              <article className="rounded-lg border border-line bg-paper p-4">
                <h3 className="font-black">评价内容</h3>
                <p className="mt-3 text-sm leading-6 text-ink/65">{selectedReview.content}</p>
              </article>
            </div>
          ) : null}
        </Drawer>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
