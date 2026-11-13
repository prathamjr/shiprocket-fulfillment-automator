# Troubleshooting: what each problem means and what fixes it

Every lesson here came from a real store running this daily. Read the matching row before improvising.

| What they see (report reason / error) | What it means | Fix |
|---|---|---|
| `product not set up yet (no warehouse mapped)` | A product has no entry in `productPickupMap` / `skuPickupMap`. | Ask which warehouse ships it, add the mapping, `check.mjs config`. Ships next run. Never add a catch-all `*` for multi-warehouse stores. |
| `items ship from different warehouses` | The order mixes products from two warehouses. | Handle by hand: `split-orders.md`. |
| `weight is 0 in Shiprocket` | The store product had no weight, so the order synced with 0 and every courier refuses it. | Set the weight on the product in Shopify (future orders). For orders already in Shiprocket: dashboard → Orders → bulk update by CSV (Order ID + weight + dimensions, leave Package Name blank), or edit each order. |
| `Wallet balance too low` | The wallet ran out mid-run; the run stopped there. | Top up (the message suggests an amount); remaining orders ship on the next run or with `fulfill.mjs --force` now. Keep ₹100-200 spare: bookings fail when the balance is close to zero. |
| `already assigned` / order stuck with "AWB already assigned" but no AWB | A temporary Shiprocket glitch. The engine already retried. | Leave it; the next run retries. If it fails 3 days running, check the order in the dashboard. **Do not** add it to `skipOrders` for this. Some orders get a new phantom AWB on every retry, so don't retry by hand in a loop. |
| `No courier accepted the booking` / `Client-Warehouse is not active` | The courier showed as available but refused (often: that courier's pickup capacity is full, or the 11 AM cut-off passed). | Leave it for the next morning run (which is before cut-off). If it repeats for one pincode, ask whether to allow a lower rating there. |
| `no courier serves <pin> -> <pin>` | Genuinely no courier for that route (or none under the price ceiling). | Tell the owner; they may need to cancel/refund or ship via another method. |
| `address has non-English characters` | Shiprocket rejects any non-English letter in the address. The fix needs the real phone, which Shiprocket hides (`xxxxxxxxxx`). | With Shopify access: read the real phone from the Shopify order, then `POST /v1/external/orders/address/update` with ASCII-only shipping_* fields **including shipping_phone** (omitting it fails), then re-run. Without Shopify: fix the address in the Shiprocket dashboard. |
| `pickup not scheduled: Already in Pickup Queue` | The pickup was already scheduled. | Nothing to do. Note: a scheduled pickup date cannot be changed or cancelled through the API. |
| `Label count mismatch` | Shiprocket returned fewer label pages than asked, even after retries. | Don't print the partial file as complete. Re-download from the Shiprocket dashboard (Orders → select → Download label), or re-request the missing shipments one at a time. |
| Run found 0 orders but Shiprocket shows NEW orders | They are older than `lookbackDays`. | Check those orders (are they really still wanted? often they were cancelled or fulfilled elsewhere), then a one-off `fulfill.mjs --force --lookback=30`. |
| Login fails | Wrong API user password, or the main login used instead of the API user. | Recreate the API user (Settings → API), update `.env`. |
| Nothing happened this morning | The computer was off/asleep/logged out, or it's not a run day. | `node scripts/scheduler.mjs status` shows the last log lines. Run now with `fulfill.mjs --force` if wanted. |
| Same order shipped twice / duplicates in Shiprocket | Someone used "create order" to edit an order, or a clone was made without checking. | Cancel the extra one in the dashboard (before pickup). Never use create-order as an update. |

## Shiprocket API quirks worth knowing
- The orders list silently falls back to ~30 days without a `from` date, and returns an EMPTY list (no error) if the
  date span is wider than about 320 days. Always pass both dates.
- `?search=` matches the full order ID exactly, not part of it.
- Phone numbers in API reads are masked. Never write one back.
- Cancelling an order is not instant: it sits in "CANCELLATION REQUESTED" for a while and can't be re-booked meanwhile.
- The label endpoint drops labels silently on large lists. The engine asks 20 at a time and counts pages.
- Order weight lives on the shipment (`shipments[0].weight`), not the top-level `weight` field.
