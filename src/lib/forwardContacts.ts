import { customers, imageBank, orders, stores, technicians } from "../data/mock";
import {
  getMerchantCustomerConversationId,
  getMerchantTechnicianConversationId,
  getTechnicianCustomerConversationId,
  getTechnicianStaffConversationId,
  getTechnicianStoreConversationId,
  getTechnicianSupportConversationId,
  getUserConversationId,
  type MessageCenterContext
} from "./messageCenter";

export type ForwardContact = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  conversationId: string;
  group: string;
  caption: string;
};

export function getForwardContacts(context: MessageCenterContext): ForwardContact[] {
  if (context === "merchant") {
    const customerContacts = customers.slice(0, 8).map((customer, index) => ({
      id: `merchant-customer-${customer.id}`,
      name: customer.name,
      role: "预约客户",
      avatar: index % 2 === 0 ? imageBank.cafe : imageBank.home,
      conversationId: getMerchantCustomerConversationId(customer.id),
      group: "客人组",
      caption: `${customer.memberLevel} · ${customer.orderCount} 单 · ${customer.tags.slice(0, 2).join("、")}`
    }));
    const staffContacts = technicians.map((technician) => ({
      id: `merchant-tech-${technician.id}`,
      name: technician.name,
      role: "门店技师",
      avatar: technician.avatar,
      conversationId: getMerchantTechnicianConversationId(technician.id),
      group: "同事组",
      caption: `${technician.skills.slice(0, 2).join("、")} · 接单率 ${technician.acceptRate}%`
    }));

    return [
      ...customerContacts,
      ...staffContacts,
      {
        id: "merchant-support",
        name: "NeeDo 客服",
        role: "平台客服",
        avatar: imageBank.home,
        conversationId: "merchant-support",
        group: "平台组",
        caption: "改期、退款、工单升级"
      }
    ];
  }

  if (context === "technician") {
    return [
      {
        id: "technician-customer-current",
        name: orders[0].customerName,
        role: "当前服务用户",
        avatar: imageBank.cafe,
        conversationId: getTechnicianCustomerConversationId(orders[0].customerId),
        group: "客人组",
        caption: `${orders[0].itemName} · ${orders[0].bookedAt}`
      },
      {
        id: "technician-store",
        name: stores[0].name,
        role: "在职门店",
        avatar: stores[0].cover,
        conversationId: getTechnicianStoreConversationId(),
        group: "店铺组",
        caption: "排班、订单和门店通知"
      },
      {
        id: "technician-staff",
        name: technicians[1]?.name ?? "店长 / 排班员",
        role: "同事",
        avatar: technicians[1]?.avatar ?? imageBank.salon,
        conversationId: getTechnicianStaffConversationId(technicians[1]?.id ?? "tech-2"),
        group: "店铺组",
        caption: "日程调整和现场支持"
      },
      {
        id: "technician-support",
        name: "NeeDo 客服",
        role: "平台客服",
        avatar: imageBank.home,
        conversationId: getTechnicianSupportConversationId(),
        group: "平台组",
        caption: "异常订单、客诉和保障"
      }
    ];
  }

  return [
    {
      id: "user-tech",
      name: technicians[0].name,
      role: "担当技师",
      avatar: technicians[0].avatar,
      conversationId: getUserConversationId("technician"),
      group: "个人技师",
      caption: `${technicians[0].skills.slice(0, 2).join("、")} · 接单率 ${technicians[0].acceptRate}%`
    },
    {
      id: "user-store",
      name: stores[0].name,
      role: "预约门店",
      avatar: stores[0].cover,
      conversationId: getUserConversationId("store"),
      group: "店铺组",
      caption: `${stores[0].area} · ${stores[0].nextSlot}`
    },
    {
      id: "user-support",
      name: "NeeDo 客服",
      role: "平台客服",
      avatar: imageBank.cafe,
      conversationId: getUserConversationId("support"),
      group: "服务号",
      caption: "退款、改期、投诉受理"
    },
    {
      id: "user-order",
      name: orders[0].customerName,
      role: "本人订单",
      avatar: imageBank.cafe,
      conversationId: getUserConversationId("customer"),
      group: "订单组",
      caption: `${orders[0].itemName} · ${orders[0].bookedAt}`
    }
  ];
}
