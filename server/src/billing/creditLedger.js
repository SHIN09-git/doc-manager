export function publicCreditLedger(entry = {}, options = {}) {
  const order = options.orderMap?.get?.(entry.order_id) || null;
  const user = options.userMap?.get?.(entry.user_id) || null;
  return {
    id: entry.id || "",
    organization_id: entry.organization_id || "",
    user_id: entry.user_id || "",
    user_email: user?.email || "",
    order_id: entry.order_id || null,
    usage_id: entry.usage_id || null,
    direction: entry.direction || "",
    amount: Number(entry.amount || 0),
    balance_after: Number(entry.balance_after || 0),
    reason: entry.reason || "",
    created_at: entry.created_at || "",
    order_title: order?.title || "",
    order_amount_cny: order ? Number(order.amount_cny || 0) : null,
    order_status: order?.status || "",
  };
}

export function listPublicCreditLedger(data, options = {}) {
  const organizationId = options.organizationId || "";
  const userId = options.userId || "";
  const isAdmin = Boolean(options.isAdmin);
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  const manualOrders = Array.isArray(data.manual_payment_orders) ? data.manual_payment_orders : [];
  const users = Array.isArray(data.users) ? data.users : [];
  const ledger = Array.isArray(data.credit_ledger) ? data.credit_ledger : [];
  const orderMap = new Map(manualOrders
    .filter((order) => order.organization_id === organizationId)
    .map((order) => [order.id, order]));
  const userMap = new Map(users.map((user) => [user.id, user]));
  return ledger
    .filter((entry) => entry.organization_id === organizationId && (isAdmin || entry.user_id === userId))
    .slice()
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .slice(-limit)
    .map((entry) => publicCreditLedger(entry, { orderMap, userMap }));
}
