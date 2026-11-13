// The ONLY place that picks couriers. Returns a ranked list, not one courier:
// the preferred tier (rating >= minCourierRating) first, then lower-rated
// couriers as a fallback. A courier can show as serviceable in the quote and
// still refuse the booking, and when that happens the order needs somewhere
// else to go. Callers pass the whole list to assignAwbWithRetry().
export async function rankCouriers(api, serviceabilityBaseUrl, config, { pickupPin, deliveryPin, weight, isCod, pickupNickname }) {
  const url = `${serviceabilityBaseUrl}/courier/ratingserviceability?pickup_postcode=${pickupPin}&delivery_postcode=${deliveryPin}&weight=${weight}&cod=${isCod ? 1 : 0}`;
  const data = await api("GET", url);

  const perPickup = Object.entries(config.bannedCouriersByPickup ?? {})
    .filter(([nick]) => nick.toLowerCase() === String(pickupNickname ?? "").toLowerCase())
    .flatMap(([, list]) => list);
  const banned = [...(config.bannedCouriers ?? []), ...perPickup].map((b) => b.toLowerCase());

  let pool = (data?.data?.available_courier_companies ?? [])
    .map((c) => ({
      id: c.courier_company_id,
      name: c.courier_name,
      rating: Number(c.rating ?? 0),
      freight: Number(c.freight_charge ?? c.rate ?? Infinity),
      days: Number(c.estimated_delivery_days ?? 99),
    }))
    .filter((c) => !banned.some((b) => c.name.toLowerCase().includes(b)));

  if (config.maxFreightPerOrder) pool = pool.filter((c) => c.freight <= config.maxFreightPerOrder);

  const order = config.courierPreference === "fastest"
    ? (a, b) => a.days - b.days || a.freight - b.freight
    : (a, b) => a.freight - b.freight || b.rating - a.rating;
  const rated = pool.filter((c) => c.rating >= config.minCourierRating).sort(order);
  const fallback = pool.filter((c) => c.rating < config.minCourierRating).sort((a, b) => b.rating - a.rating || a.freight - b.freight);
  return [...rated, ...fallback];
}
