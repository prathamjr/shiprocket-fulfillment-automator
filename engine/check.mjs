#!/usr/bin/env node
/**
 * Read-only checks used during setup and whenever something looks off.
 * Nothing here books, edits or cancels anything.
 *
 *   node check.mjs login        can we log in to Shiprocket with .env?
 *   node check.mjs orders       are store orders arriving in Shiprocket? (last 7 days, by status)
 *   node check.mjs pickups      pickup locations set up in Shiprocket
 *   node check.mjs products     every product in recent orders, with count, stored weight, mapped warehouse
 *   node check.mjs config       is config.json valid and does every recent product have a warehouse?
 *   node check.mjs notify-test  send a test message to the configured chat
 *   node check.mjs all          everything above except notify-test
 *   add --json for machine-readable output, --days=N to change the window
 */
import { loadConfig, loadEnv } from "./lib/config.mjs";
import { createClient } from "./lib/shiprocket.mjs";
import { makeSchedule } from "./lib/schedule.mjs";
import { pickupForItem } from "./lib/pickup.mjs";
import { sendMessage } from "./lib/notify.mjs";

const cmd = process.argv[2] ?? "all";
const JSON_OUT = process.argv.includes("--json");
const days = Number((process.argv.find((a) => a.startsWith("--days=")) ?? "").split("=")[1]) || null;
loadEnv();

let config = null;
try { config = loadConfig(); } catch (e) { if (!["login", "orders", "pickups", "products"].includes(cmd)) { console.error(e.message); process.exit(1); } }
const S = makeSchedule(config ?? { timezone: "Asia/Kolkata", runDays: [], pickupDays: ["Mon"] });
const sr = createClient({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD });
const out = {};
const say = (...a) => { if (!JSON_OUT) console.log(...a); };

const STATUS = { 1: "NEW", 2: "INVOICED", 3: "READY TO SHIP", 4: "PICKUP SCHEDULED", 5: "CANCELED", 6: "SHIPPED", 7: "DELIVERED" };

async function login() {
  await sr.login();
  out.login = "ok";
  say("✓ Shiprocket login works");
}

async function orders() {
  const list = await sr.orders({ from: S.dateIn(-(days ?? 7)), to: S.TODAY, maxPages: 10 });
  const byStatus = {}, byChannel = {};
  for (const o of list) {
    const st = o.status ?? STATUS[o.status_code] ?? String(o.status_code);
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    const ch = o.channel_name ?? o.channel ?? "unknown";
    byChannel[ch] = (byChannel[ch] ?? 0) + 1;
  }
  out.orders = { days: days ?? 7, total: list.length, byStatus, byChannel, newest: list[0]?.created_at ?? null };
  say(`Orders in Shiprocket, last ${days ?? 7} days: ${list.length}${list.length >= 500 ? "+ (stopped counting at 500)" : ""}`);
  say(`  by status:  ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(", ") || "-"}`);
  say(`  by channel: ${Object.entries(byChannel).map(([k, v]) => `${k} ${v}`).join(", ") || "-"}`);
  say(`  newest: ${list[0]?.created_at ?? "none"}`);
  if (!list.length) say("  ✗ No orders at all. Your store is probably not connected to Shiprocket yet.");
}

async function pickups() {
  const p = await sr.pickupLocations();
  out.pickups = Object.values(p);
  say(`Pickup locations in Shiprocket (${out.pickups.length}):`);
  for (const l of out.pickups) say(`  "${l.name}"  ${l.city ?? ""} ${l.pincode}`);
}

async function products() {
  const list = await sr.orders({ from: S.dateIn(-(days ?? 60)), to: S.TODAY, maxPages: 20 });
  const map = {};
  for (const o of list) {
    const w = Number(o.shipments?.[0]?.weight) || 0;
    for (const p of o.products ?? []) {
      const k = String(p.name).trim();
      const e = (map[k] ??= { name: k, sku: p.channel_sku ?? p.sku ?? "", orders: 0, zeroWeightOrders: 0, weights: new Set(), warehouse: null });
      e.orders++;
      if (!w) e.zeroWeightOrders++;
      else if ((o.products ?? []).length === 1) e.weights.add(w);
      if (config) e.warehouse = pickupForItem(p, config);
    }
  }
  out.products = Object.values(map).sort((a, b) => b.orders - a.orders).map((e) => ({ ...e, weights: [...e.weights].sort() }));
  say(`Products in orders from the last ${days ?? 60} days (${out.products.length}):`);
  for (const e of out.products) {
    say(`  ${String(e.orders).padStart(4)}×  ${e.name}${e.sku ? `  [${e.sku}]` : ""}`);
    say(`         stored weight: ${e.weights.length ? e.weights.join(" / ") + " kg" : "-"}${e.zeroWeightOrders ? `  ⚠ ${e.zeroWeightOrders} order(s) with weight 0` : ""}${config ? `  → ${e.warehouse ?? "NOT MAPPED"}` : ""}`);
  }
}

async function checkConfig() {
  const problems = [];
  const p = await sr.pickupLocations();
  const used = new Set([...Object.values(config.productPickupMap), ...Object.values(config.skuPickupMap)]);
  for (const nick of used) if (!p[String(nick).toLowerCase()]) problems.push(`warehouse "${nick}" in config.json does not exist in Shiprocket`);
  for (const nick of Object.keys(config.bannedCouriersByPickup)) if (!p[nick.toLowerCase()]) problems.push(`bannedCouriersByPickup names "${nick}", which is not a Shiprocket pickup location`);
  if (!["cheapest", "fastest"].includes(config.courierPreference)) problems.push(`courierPreference must be "cheapest" or "fastest"`);
  if (!out.products) await products();
  const unmapped = out.products.filter((e) => !e.warehouse);
  if (unmapped.length) problems.push(`${unmapped.length} recent product(s) have no warehouse: ${unmapped.map((e) => e.name).join("; ")}`);
  const zero = out.products.filter((e) => e.zeroWeightOrders);
  if (zero.length) problems.push(`weight 0 in Shiprocket for: ${zero.map((e) => e.name).join("; ")} (these orders get blocked until fixed)`);
  out.config = { ok: !problems.length, problems, nextPickupDate: S.PICKUP_DATE, todayIsRunDay: S.isRunDay };
  say(problems.length ? `\nConfig problems:\n  ✗ ${problems.join("\n  ✗ ")}` : "\n✓ config.json looks good");
  say(`  today ${S.TODAY} is ${S.isRunDay ? "" : "NOT "}a run day; next pickup date would be ${S.PICKUP_DATE}`);
}

try {
  if (cmd === "notify-test") {
    await sendMessage(config, `✅ *${config.brandName}*: Shiprocket Fulfillment Automator is connected. The daily summary will arrive here.`);
    out.notify = "sent";
    say(`✓ test message sent via ${config.notify.type}`);
  } else {
    await login();
    if (["orders", "all"].includes(cmd)) await orders();
    if (["pickups", "all"].includes(cmd)) await pickups();
    if (cmd === "products" || (cmd === "all" && !config)) await products();
    if (["config", "all"].includes(cmd) && config) await checkConfig();
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 1));
} catch (e) {
  if (JSON_OUT) console.log(JSON.stringify({ ...out, error: e.message }));
  else console.error(`✗ ${e.message}`);
  process.exit(1);
}
