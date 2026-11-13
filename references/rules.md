# Rules the engine understands

Every rule is a setting in `engine/config.json` (in the engine folder you installed, not the skill folder). When the
owner states a rule in plain words, find it here, save the setting, and log it in `RULES.md`.

| Rule (how owners say it) | Question to ask | Setting | Default |
|---|---|---|---|
| "Run every weekday morning" | Which days, what time? | `runDays`, `runTime` (24h, this computer's clock) | Mon-Fri, `"09:00"` |
| "No pickups on Saturday/Sunday" | Which days can couriers collect? | `pickupDays` | Mon-Fri |
| "Warehouse closed on Diwali" | Any dates with no pickups? | `holidays` (`["2026-11-08"]`), which blocks both runs and pickups on those dates | `[]` |
| "Only ship good couriers" | Lowest courier rating you accept? | `minCourierRating` (0-5) | `4` |
| "Cheapest" / "fastest" | Cheapest or fastest among those? | `courierPreference`: `"cheapest"` or `"fastest"` | `"cheapest"` |
| "Never use X" | Never, anywhere? | `bannedCouriers`: name parts, e.g. `["ekart"]` | `[]` |
| "Don't use X from warehouse Y" | Which warehouse? | `bannedCouriersByPickup`: `{"<exact pickup name>": ["x"]}` | `{}` |
| "Never pay more than ₹150" | Max per shipment? | `maxFreightPerOrder` (number or `null`) | `null` |
| "Don't auto-ship COD" | Ship COD automatically? | `allowCod` | `true` |
| "Product A ships from warehouse B" | (Step 6 table) | `productPickupMap` (name part → pickup), `skuPickupMap` (SKU part → pickup) | `{}` |
| "Everything ships from home" | One place only? | `productPickupMap: {"*": "<pickup>"}` (single-warehouse stores only) | none |
| "Box is 500 g" | Packed weight per product? | `productWeights: {"<name part>": {"weightKg": 0.5}}` (quotes only; booking uses the store's weight) | `{}` |
| "Warehouse wants one PDF per product" | How should labels be grouped? | `labelLayout`: `"by-product"`, `"by-pickup"`, `"single"`; per warehouse in `labelLayoutByPickup` | `"by-product"` |
| "Only look at recent orders" | How far back? | `lookbackDays` | `14` |
| "Never touch order 1234" | Why? (only for confirmed-broken orders) | `skipOrders: ["1234"]` (store order IDs, permanent) | `[]` |
| "Keep enough in the wallet" | Buffer above the estimate? | `wallet.bufferRupees`, `wallet.estimatedDailyOrders`, `wallet.avgFreightFallback` | 200 / 20 / 80 |
| "Where do labels go" | Folder? | `outputDir` | `~/Desktop/shiprocket-labels` |

Notes:
- Map keys match **part of** the product name, lowercase-insensitive, and the first match wins. Put specific keys
  ("neck cooling fan") before general ones ("fan"). After any map change, run `node check.mjs config`.
- Pickup names must match Shiprocket exactly (`node check.mjs pickups`).
- `lookbackDays` is a safety limit: Shiprocket often keeps old orders in NEW that were cancelled or fulfilled
  elsewhere. A wide window would ship them. Widen it only for a one-off (`--lookback=30`) after checking those orders.
- `runTime` should be before the courier pickup cut-off (often 11 AM). Bookings made after it can be refused with
  "Client-Warehouse is not active" or pushed a day.

## Rules owners often ask for that need an engine change

Say so honestly and offer to build it carefully (new config key, default = no change, dry-run before/after):
- prefer a specific courier for a warehouse ("always Delhivery from Surat when available"),
- different rules for heavy parcels (e.g. surface couriers above 2 kg),
- holding orders for a fraud/RTO check before shipping,
- splitting multi-warehouse orders automatically (deliberately manual today; see split-orders.md),
- sending labels to the warehouse automatically (email, Google Drive, WhatsApp).
