// The ONLY place that decides which pickup location (warehouse) ships an order.
//
// Two rules, both learned from real wrong shipments:
// 1. A product with no mapping NEVER falls back to a default warehouse. It
//    blocks the order. (An un-set-up product once shipped from a warehouse
//    that did not even stock it.) The one exception is an explicit "*" entry
//    that the owner chose on purpose, for single-warehouse stores.
// 2. An order whose items live in different warehouses is never booked whole.
//    One booking = one pickup address, so it would ship everything from one
//    place. These orders are blocked and handled by hand (see references/split-orders.md).

function match(map, value) {
  const v = String(value ?? "").toLowerCase().trim();
  if (!v) return null;
  for (const [pattern, nick] of Object.entries(map ?? {})) {
    if (pattern !== "*" && v.includes(pattern.toLowerCase())) return nick;
  }
  return null;
}

export function pickupForItem(item, config) {
  return match(config.skuPickupMap, item.channel_sku ?? item.sku)
    ?? match(config.productPickupMap, item.name)
    ?? config.productPickupMap?.["*"]
    ?? null;
}

/** Every distinct pickup the order's items need. Contains null if any item is unmapped. */
export function requiredPickups(order, config) {
  return [...new Set((order.products ?? []).map((p) => pickupForItem(p, config)))];
}

/** The single pickup for the order, or null when it must not be booked automatically. */
export function pickupForOrder(order, config) {
  const pickups = requiredPickups(order, config);
  return pickups.length === 1 && pickups[0] !== null ? pickups[0] : null;
}

export function blockReason(order, config) {
  const pickups = requiredPickups(order, config);
  const unmapped = (order.products ?? []).filter((p) => pickupForItem(p, config) === null).map((p) => p.name);
  if (unmapped.length) return `product not set up yet (no warehouse mapped): ${unmapped.join(", ")}`;
  return `items ship from different warehouses (${pickups.join(", ")}): split it by hand`;
}
