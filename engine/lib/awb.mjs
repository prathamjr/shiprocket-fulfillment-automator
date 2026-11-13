// The ONLY place that books a courier (assigns an AWB).
//
// Shiprocket sometimes answers "AWB is already assigned" for an order that has
// no AWB at all. It is usually temporary: retrying the same courier a couple of
// times a few seconds apart clears most of them. So: retry that one error on
// the same courier, move to the next courier for any other error, and stop at
// once when the wallet is empty. Never retry forever: on rare orders each retry
// creates a new phantom AWB. An order that still fails stays NEW and the next
// daily run picks it up again.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function assignAwbWithRetry(api, srBaseUrl, orderId, courierPool, { retries = 2, delayMs = 15000 } = {}) {
  let lastErr = null;
  for (const courier of courierPool) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      let data;
      try {
        data = await api("POST", `${srBaseUrl}/v1/external/courier/assign/awb`, { oid: orderId, courier_id: courier.id });
      } catch (e) {
        data = e.data ?? { error: e.message };
      }
      const r = data?.response?.data;
      if (r?.awb_code) return { awb: r.awb_code, courier: r.courier_name, shipmentId: r.shipment_id, freight: courier.freight, rating: courier.rating };
      lastErr = JSON.stringify(data).slice(0, 300);
      if (/recharge|insufficient|wallet/i.test(lastErr)) throw new Error(`Wallet balance too low to book: ${lastErr}`);
      if (!lastErr.includes("already assigned")) break;
      if (attempt < retries) await sleep(delayMs);
    }
  }
  throw new Error(`No courier accepted the booking: ${lastErr}`);
}
