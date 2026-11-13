#!/usr/bin/env node
/**
 * Daily Shiprocket Fulfillment Automator. For every NEW order in Shiprocket:
 *   1. work out which pickup location (warehouse) ships it, from config.json
 *   2. rank couriers by your rules (rating floor, cheapest or fastest, banned list)
 *   3. book the courier (assign AWB)
 *   4. schedule pickup on the next valid pickup day
 *   5. download every label, verified page by page, into one folder per day
 *   6. send a summary (shipped, blocked + why, wallet top-up) to your team chat
 *
 *   node fulfill.mjs --dry-run     # read-only: shows exactly what WOULD happen
 *   node fulfill.mjs               # real run (books couriers, spends wallet money)
 *   node fulfill.mjs --force       # run even on a non-run day (weekend/holiday)
 *   node fulfill.mjs --lookback=7  # only look at the last 7 days this time
 */
import fs from "node:fs";
import path from "node:path";
import { ENGINE_DIR, loadConfig, loadEnv } from "./lib/config.mjs";
import { createClient, SR, SERVICEABILITY } from "./lib/shiprocket.mjs";
import { makeSchedule, exitIfNotRunDay } from "./lib/schedule.mjs";
import { pickupForOrder, blockReason } from "./lib/pickup.mjs";
import { rankCouriers } from "./lib/courier.mjs";
import { assignAwbWithRetry } from "./lib/awb.mjs";
import { downloadVerifiedLabels } from "./lib/labels.mjs";
import { sendMessage, desktopAlert, openFolder } from "./lib/notify.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
if (process.argv.includes("--help")) {
  console.log("node fulfill.mjs --dry-run   show what would ship (books nothing)\nnode fulfill.mjs             real run: books couriers, spends wallet money\n  --force       run on a non-run day   --lookback=N   only the last N days");
  process.exit(0);
}
loadEnv();
const config = loadConfig();
const S = makeSchedule(config);
if (!DRY_RUN) exitIfNotRunDay(S, "fulfill.mjs");

const sr = createClient({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD });
const { api } = sr;
const outDir = path.join(config.outputDir, S.TODAY);
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- helpers ----------
const slug = (s) => String(s).replace(/[^\w+ -]+/g, "").trim().replace(/\s+/g, "_") || "Labels";
const brandPrefix = new RegExp(`^${config.brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i");
const productKey = (order) => (order.products ?? []).map((p) => String(p.name).replace(brandPrefix, "")).sort().join(" + ");

function labelTarget(pickup, order) {
  const layout = config.labelLayoutByPickup?.[pickup] ?? config.labelLayout;
  if (layout === "single") return { dir: outDir, file: "All_Labels" };
  if (layout === "by-pickup") return { dir: path.join(outDir, slug(pickup)), file: "All_Orders" };
  const key = productKey(order);
  return { dir: path.join(outDir, slug(pickup)), file: key.includes(" + ") ? "Multi_Product_Orders" : slug(key) };
}

function quoteWeight(order, storedWeight) {
  const units = (order.products ?? []).reduce((a, p) => a + (Number(p.quantity) || 1), 0) || 1;
  for (const p of order.products ?? []) {
    for (const [pattern, w] of Object.entries(config.productWeights ?? {})) {
      if (String(p.name).toLowerCase().includes(pattern.toLowerCase())) return w.weightKg * units;
    }
  }
  return Math.max(storedWeight, config.defaultWeightKg * units);
}

// Shiprocket rejects any non-English character in an address.
const ascii = (s) => String(s ?? "").normalize("NFKD").replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-")
  .replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();

async function fixAddressIfNeeded(order) {
  const fields = [order.customer_name, order.customer_address, order.customer_address_2, order.customer_city, order.customer_state];
  if (!fields.some((f) => /[^\x00-\x7F]/.test(String(f ?? "")))) return false;
  if (DRY_RUN) return true;
  const phone = String(order.customer_phone ?? "");
  if (!/^\d{10}$/.test(phone)) {
    // reads come back with a masked phone, and this update needs the real one
    throw new Error("address has non-English characters and Shiprocket needs the real phone to fix it: ask Claude to fix this order (it reads the phone from your store)");
  }
  await api("POST", `${SR}/v1/external/orders/address/update`, {
    order_id: order.id,
    shipping_customer_name: ascii(order.customer_name),
    shipping_address: ascii(order.customer_address),
    shipping_address_2: ascii(order.customer_address_2),
    shipping_city: ascii(order.customer_city),
    shipping_state: ascii(order.customer_state),
    shipping_country: ascii(order.customer_country) || "India",
    shipping_pincode: String(order.customer_pincode ?? ""),
    shipping_email: order.customer_email,
    shipping_phone: phone,
  });
  return true;
}

// ---------- run ----------
const results = [];
const labelQueue = {};
const labelLines = [];
let pagesOk = 0, pagesWanted = 0, labelsVerified = true;

try {
  log(`Shiprocket Fulfillment Automator ${DRY_RUN ? "(DRY RUN: nothing will be booked)" : ""}`);
  await sr.login();
  const pickups = await sr.pickupLocations();

  const lookback = Number((process.argv.find((a) => a.startsWith("--lookback=")) ?? "").split("=")[1]) || config.lookbackDays;
  const orders = await sr.orders({ from: S.dateIn(-lookback), to: S.TODAY, newOnly: true });
  log(`Found ${orders.length} NEW order(s) from the last ${lookback} days`);

  for (const order of orders) {
    const shipment = order.shipments?.[0];
    const isCod = order.cod === 1 || order.cod === true || String(order.payment_method).toLowerCase() === "cod";
    const row = {
      order: `#${order.channel_order_id ?? order.id}`,
      customer: order.customer_name,
      products: (order.products ?? []).map((p) => `${p.name} x${p.quantity}`).join(", "),
      payment: isCod ? "COD" : "PREPAID",
      status: "blocked",
      detail: "",
    };
    results.push(row);

    try {
      if (shipment?.awb) { row.status = "skipped"; row.detail = `already booked (AWB ${shipment.awb})`; continue; }
      if (config.skipOrders.includes(String(order.channel_order_id))) { row.detail = "on the skipOrders list in config.json"; continue; }
      if (isCod && !config.allowCod) { row.detail = "COD order and allowCod is false"; continue; }

      const pickup = pickupForOrder(order, config);
      if (!pickup) { row.detail = blockReason(order, config); continue; }
      const loc = pickups[pickup.toLowerCase()];
      if (!loc) throw new Error(`pickup location "${pickup}" does not exist in Shiprocket (check spelling in config.json)`);

      const storedWeight = Number(shipment?.weight) || 0;
      if (!storedWeight) { row.detail = "weight is 0 in Shiprocket, so every courier will refuse it. Set the product weight in your store (or fix this order in Shiprocket), then it ships on the next run"; continue; }

      const deliveryPin = String(order.customer_pincode ?? "").trim();
      if (!/^\d{6}$/.test(deliveryPin)) throw new Error(`invalid delivery pincode "${deliveryPin}"`);

      const weight = quoteWeight(order, storedWeight);
      const pool = await rankCouriers(api, SERVICEABILITY, config, { pickupPin: loc.pincode, deliveryPin, weight, isCod, pickupNickname: pickup });
      if (!pool.length) throw new Error(config.maxFreightPerOrder ? `no courier under ₹${config.maxFreightPerOrder} serves ${deliveryPin}` : `no courier serves ${loc.pincode} -> ${deliveryPin}`);

      row.pickup = pickup;
      row.courier = `${pool[0].name} (★${pool[0].rating}, ₹${pool[0].freight})`;
      row.freight = pool[0].freight;

      if (String(order.pickup_location ?? "").toLowerCase() !== pickup.toLowerCase() && !DRY_RUN) {
        await api("PATCH", `${SR}/v1/external/orders/address/pickup`, { order_id: [order.id], pickup_location: loc.name });
      }
      if (await fixAddressIfNeeded(order)) row.detail += " [address cleaned to English characters]";

      if (DRY_RUN) {
        row.status = "would ship";
        row.detail = `${pickup} -> ${deliveryPin}, ${weight}kg ${row.payment}, pickup ${S.PICKUP_DATE}` + row.detail;
        continue;
      }

      const booked = await assignAwbWithRetry(api, SR, order.id, pool.slice(0, 6));
      Object.assign(row, { awb: booked.awb, courier: `${booked.courier} (★${booked.rating}, ₹${booked.freight})`, freight: booked.freight });

      try {
        await api("POST", `${SR}/v1/external/courier/generate/pickup`, { oid: order.id, pickup_date: [S.PICKUP_DATE] });
        row.pickupDate = S.PICKUP_DATE;
      } catch (e) {
        row.detail += ` [pickup not scheduled: ${e.message.slice(0, 160)}]`;
      }

      const sid = booked.shipmentId ?? shipment?.id;
      if (sid) {
        const t = labelTarget(pickup, order);
        (labelQueue[`${t.dir}|${t.file}`] ??= { ...t, sids: [] }).sids.push(sid);
        row.label = path.relative(outDir, path.join(t.dir, `${t.file}.pdf`)) || `${t.file}.pdf`;
      } else {
        row.detail += " [no shipment id, label not downloaded]";
      }
      row.status = "shipped";
      log(`${row.order}: ${booked.courier} AWB ${booked.awb}, pickup ${S.PICKUP_DATE}`);
    } catch (e) {
      row.status = "FAILED";
      row.detail = e.message.slice(0, 300);
      log(`${row.order}: FAILED: ${row.detail}`);
      if (/Wallet balance too low/.test(e.message)) {
        log("Wallet is empty: stopping here so the rest stay NEW for the next run.");
        break;
      }
    }
  }

  for (const q of Object.values(labelQueue)) {
    pagesWanted += q.sids.length;
    const name = path.relative(outDir, path.join(q.dir, `${q.file}.pdf`));
    try {
      const { pages } = await downloadVerifiedLabels({ api, srBaseUrl: SR, targetDir: q.dir, fileBaseName: q.file, shipmentIds: q.sids });
      pagesOk += pages;
      labelLines.push(`${name} (${pages}/${q.sids.length} verified)`);
    } catch (e) {
      labelsVerified = false;
      pagesOk += e.pages ?? 0;
      labelLines.push(`MISMATCH ${name}: ${e.message.slice(0, 200)}`);
    }
  }
} catch (e) {
  log(`FATAL: ${e.message}`);
  results.push({ order: "-", status: "FATAL", detail: e.message });
  process.exitCode = 1;
  if (!DRY_RUN) {
    desktopAlert("Shiprocket Fulfillment Automator FAILED", e.message);
    try { await sendMessage(config, `⚠️ *Shiprocket Fulfillment Automator failed before shipping anything*\n${e.message.slice(0, 300)}`); } catch {}
  }
}

// ---------- reports ----------
const shipped = results.filter((r) => r.status === "shipped").length;
const blocked = results.filter((r) => ["blocked", "FAILED", "FATAL"].includes(r.status));
const wouldShip = results.filter((r) => r.status === "would ship").length;

const stamp = new Date().toLocaleTimeString("en-GB", { timeZone: config.timezone }).replace(/:/g, "");
const reportsDir = path.join(outDir, "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(reportsDir, `${DRY_RUN ? "dryrun" : "report"}_${stamp}.csv`), [
  ["Order", "Status", "Customer", "Items", "Payment", "Pickup", "Courier", "AWB", "Pickup date", "Label", "Reason / note"].map(esc).join(","),
  ...results.map((r) => [r.order, r.status, r.customer, r.products, r.payment, r.pickup, r.courier, r.awb, r.pickupDate, r.label, r.detail].map(esc).join(",")),
].join("\n"));

console.log(`\n${DRY_RUN ? "DRY RUN " : ""}${S.TODAY}: ${DRY_RUN ? `${wouldShip} would ship` : `${shipped} shipped`}, ${blocked.length} blocked/failed, ${results.length} NEW orders looked at`);
for (const r of results) console.log(`  ${r.order.padEnd(14)} ${r.status.padEnd(10)} ${r.courier ?? ""} ${r.detail ?? ""}`.trimEnd());
if (labelLines.length) console.log(`\nLabels (${pagesOk}/${pagesWanted} pages verified):\n  ${labelLines.join("\n  ")}`);
console.log(`\nReport: ${reportsDir}`);

if (DRY_RUN) process.exit(process.exitCode ?? 0);

// ---------- history + wallet + message ----------
const historyPath = path.join(ENGINE_DIR, "run-history.json");
let history = [];
try { history = JSON.parse(fs.readFileSync(historyPath, "utf8")); } catch {}
const freightToday = results.reduce((a, r) => a + (r.status === "shipped" ? Number(r.freight) || 0 : 0), 0);
const today = history.find((h) => h.date === S.TODAY);
if (today) { today.shipped += shipped; today.freight += freightToday; } else history.push({ date: S.TODAY, shipped, freight: freightToday });
history = history.slice(-30);
fs.writeFileSync(historyPath, JSON.stringify(history, null, 1));

if (results.length) {
  openFolder(outDir);
  desktopAlert("Shiprocket Fulfillment Automator", `${shipped} shipped, ${blocked.length} need a look`);
}

if (shipped > 0 || blocked.length > 0) {
  const recent = history.filter((h) => h.date !== S.TODAY && h.shipped > 0).slice(-5);
  const perDay = recent.length ? recent.reduce((a, h) => a + h.shipped, 0) / recent.length : config.wallet.estimatedDailyOrders;
  const perOrder = recent.length ? recent.reduce((a, h) => a + h.freight, 0) / recent.reduce((a, h) => a + h.shipped, 0) : config.wallet.avgFreightFallback;
  const carryover = blocked.reduce((a, r) => a + (r.status === "FAILED" && r.freight ? Number(r.freight) : 0), 0);
  const suggested = Math.ceil((carryover + perDay * perOrder + config.wallet.bufferRupees) / 100) * 100;
  let balance = null;
  try { balance = await sr.walletBalance(); } catch {}

  const reasons = {};
  for (const r of blocked) reasons[r.detail.split(":")[0]] = (reasons[r.detail.split(":")[0]] ?? 0) + 1;
  const dateLabel = new Date().toLocaleDateString("en-US", { timeZone: config.timezone, weekday: "short", month: "short", day: "numeric" });
  const text = [
    `📦 *${config.brandName} shipping: ${dateLabel}*`,
    ``,
    `*${shipped} shipped* · pickup ${S.PICKUP_SKIPPED_DAYS ? `on ${S.PICKUP_DATE} (next pickup day)` : `tomorrow (${S.PICKUP_DATE})`}`,
    blocked.length ? `*${blocked.length} need a look:*\n${Object.entries(reasons).map(([k, n]) => `  • ${n} × ${k}`).join("\n")}` : `*0 need a look*`,
    ``,
    pagesWanted ? (labelsVerified ? `✅ Labels: ${pagesOk}/${pagesWanted} verified` : `⚠️ Labels: only ${pagesOk}/${pagesWanted} found, check before printing`) : null,
    pagesWanted ? `🏷️ ${outDir}` : null,
    balance != null
      ? `💰 Wallet ₹${balance.toFixed(0)} · keep ₹${suggested} for the next run${suggested > balance ? ` (*top up ~₹${suggested - Math.floor(balance)}*)` : " (enough)"}`
      : `💰 Couldn't read the wallet balance, check it in Shiprocket`,
  ].filter((l) => l !== null).join("\n");
  try { await sendMessage(config, text); } catch (e) { log(`Message not sent: ${e.message}`); }
}
