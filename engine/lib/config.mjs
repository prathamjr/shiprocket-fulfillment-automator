// Loads config.json + .env from the engine folder and fills in defaults.
// Every script imports this instead of reading the files itself.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = {
  brandName: "My Store",
  timezone: "Asia/Kolkata",
  outputDir: "~/Desktop/shiprocket-labels",
  lookbackDays: 14,
  runDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  pickupDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  holidays: [],
  runTime: "09:00",
  minCourierRating: 4,
  courierPreference: "cheapest",
  maxFreightPerOrder: null,
  allowCod: true,
  defaultWeightKg: 0.5,
  productPickupMap: {},
  skuPickupMap: {},
  productWeights: {},
  bannedCouriers: [],
  bannedCouriersByPickup: {},
  labelLayout: "by-product",
  labelLayoutByPickup: {},
  skipOrders: [],
  notify: { type: "none" },
  wallet: { bufferRupees: 200, estimatedDailyOrders: 20, avgFreightFallback: 80 },
};

export function loadEnv() {
  const p = path.join(ENGINE_DIR, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

export function loadConfig() {
  const p = path.join(ENGINE_DIR, "config.json");
  if (!fs.existsSync(p)) throw new Error(`config.json not found in ${ENGINE_DIR}. Copy config.example.json to config.json first.`);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const config = { ...DEFAULTS, ...raw, wallet: { ...DEFAULTS.wallet, ...(raw.wallet ?? {}) } };
  config.outputDir = config.outputDir.replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? "~");
  return config;
}
