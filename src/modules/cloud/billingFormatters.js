export function formatManualPaymentPackage(item = {}) {
  const amount = Number(item.amount_cny || 0);
  const parts = [`${item.title || item.id || "充值套餐"}`];
  if (amount > 0) parts.push(`¥${amount}`);
  if (item.plan) parts.push(`${String(item.plan).toUpperCase()} ${Number(item.duration_days || 0) || ""}天`.trim());
  if (Number(item.credits || 0) > 0) parts.push(`${Number(item.credits).toLocaleString("zh-CN")} 点`);
  return parts.join(" · ");
}

export function formatManualOrderStatus(status) {
  const value = String(status || "pending");
  if (value === "approved") return "已确认";
  if (value === "rejected") return "已拒绝";
  if (value === "cancelled") return "已取消";
  return "待确认";
}

export function formatManualOrderSummary(item = {}) {
  const orderId = item.id ? `订单 ${item.id}` : "订单";
  const packageTitle = item.title || item.package_id || "充值套餐";
  const review = item.review_note ? ` · 审核备注：${item.review_note}` : "";
  return `${formatManualOrderStatus(item.status)} · ${orderId} · ${packageTitle} · ¥${Number(item.amount_cny || 0)} · ${item.created_at || ""}${review}`;
}

export function formatManualPaymentChannel(channel) {
  const value = String(channel || "");
  if (value === "wechat") return "微信";
  if (value === "alipay") return "支付宝";
  if (value === "bank") return "银行转账";
  if (value === "other") return "其他";
  return value || "未知方式";
}

export function formatCreditLedgerDirection(item = {}) {
  return item.direction === "out" ? "扣减" : "入账";
}

export function formatCreditLedgerReason(reason) {
  const value = String(reason || "");
  if (value === "manual_payment_approved") return "人工充值确认";
  if (value === "ai_quota_overage") return "AI 超额调用";
  return value || "额度流水";
}

export function formatCreditLedgerSummary(item = {}) {
  const direction = formatCreditLedgerDirection(item);
  const sign = item.direction === "out" ? "-" : "+";
  const source = item.order_title || formatCreditLedgerReason(item.reason);
  const date = item.created_at || "";
  return `${direction} ${sign}${Number(item.amount || 0).toLocaleString("zh-CN")} 点 · 余额 ${Number(item.balance_after || 0).toLocaleString("zh-CN")} · ${source} · ${date}`;
}
