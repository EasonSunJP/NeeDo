import type { Customer } from "../../types/domain";

const customerCreditReviewCountOverrides: Record<string, number> = {
  "cus-1": 28,
  "cus-2": 9,
  "cus-3": 41
};

export function getCustomerCreditScore(customer: Customer) {
  return Number(Math.max(0, Math.min(5, customer.activeScore / 20)).toFixed(1));
}

export function formatCustomerCreditScore(customer: Customer, options: { withMax?: boolean } = {}) {
  const score = getCustomerCreditScore(customer).toFixed(1);
  return options.withMax ? `${score} /5` : score;
}

export function getCustomerCreditReviewCount(customer: Customer) {
  return customerCreditReviewCountOverrides[customer.id] ?? Math.max(0, Math.round(customer.orderCount * 0.72));
}

export function formatCustomerCreditReviewCount(customer: Customer) {
  const count = getCustomerCreditReviewCount(customer);
  return count > 0 ? `${count}人评价` : "暂无评价";
}

export function formatCustomerGenderLabel(gender?: Customer["gender"]) {
  if (gender === "female") {
    return "女";
  }

  if (gender === "male") {
    return "男";
  }

  if (gender === "private") {
    return "不公开";
  }

  return "未公开";
}
