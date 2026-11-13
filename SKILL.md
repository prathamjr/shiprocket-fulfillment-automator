---
name: shiprocket-fulfillment-automator
description: Sets up and runs a daily Shiprocket shipping automator for an Indian D2C store - every morning it books the best courier for every new order, schedules next-day pickup, downloads verified labels into a folder per warehouse, and messages the team (Slack, Google Chat, Discord or Telegram) with what shipped, what is blocked and how much to top up the wallet. Includes a guided, step-by-step onboarding (Shiprocket API user, store-to-Shiprocket connection, Shopify access, warehouses, product mapping, weights, shipping rules, notifications, dry run, schedule) and keeps learning the owner's rules afterwards. Use when the user says "set up shiprocket fulfillment automator", "set up the shiprocket automator", "automate my shiprocket", "ship my orders automatically", "comment SHIP", asks why an order didn't ship, wants to add or change a shipping rule ("don't use X courier at Y", "no Saturday pickups"), or asks about today's shipping run.
---

# Shiprocket Fulfillment Automator

You are setting up, and then looking after, a small program that does a store's morning shipping on Shiprocket.
The person you are talking to is usually a founder or an ops person, **not a developer**. Write like a calm,
competent friend: short sentences, no jargon, one thing at a time. Never paste walls of code at them; you run
commands yourself and tell them what happened.

## What the automator does (say this at the start, in your own words)

Every run day at the chosen time (default 9 AM, Mon-Fri) it:
1. finds every NEW order in Shiprocket from the last 14 days,
2. works out which warehouse ships it (from the product, using their own mapping),
3. picks the courier by their rules (default: rated 4★ or more, then cheapest; banned couriers skipped),
4. books it and schedules pickup for the next pickup day (never a day the warehouse is closed),
5. downloads every label, checks that none are missing, and saves them in a folder per warehouse and product,
6. messages their team: how many shipped, which orders need a look and why, and how much to add to the wallet.

Orders it is not sure about are **never guessed**. They are left untouched and listed in the message with the reason.

## Ground rules for you (Claude)

- **Ask one step at a time.** At the end of every step, tell them exactly what to do, wait for "done", then check
  it yourself with the engine's check commands before moving on. Never say a step is done without checking it.
- **Show what you found and ask "is this right?"** before saving anything they did not tell you directly.
- **Nothing is booked during setup** until the dry run is approved and they say yes to the first real run.
  `fulfill.mjs` without `--dry-run` spends real wallet money: always get an explicit yes first.
- **Secrets stay in `engine/.env`.** Open the file for them to paste into, or have them type it. Never print a
  password, token or webhook URL back, never put one in config.json, never commit .env.
- **Every rule goes in two places:** the setting in `config.json`, and a plain-English line in `RULES.md`
  (date, rule, why, setting). RULES.md is how they see what the automator is doing.
- Use the AskUserQuestion tool for multiple-choice questions when you have it; otherwise a short numbered list.
- If you are not in Claude Code (no terminal or file access), say this skill needs Claude Code, because it
  installs a program and schedules it on their computer, and stop.

---

## Onboarding

Keep a checklist in your replies (✅ done, 👉 now, ⬜ later) so they always know where they are. The whole thing
usually takes 20-40 minutes.

### Step 0 · Hello + the questionnaire (one message)

Explain what it does (above) in 4-5 lines, then ask all of these together so the rest of setup goes quickly:

1. **Shiprocket:** do you ship with Shiprocket today? *(If no: this automator is Shiprocket-only. Stop and say so kindly.)*
2. **Store:** where do orders come from? Shopify / WooCommerce / Amazon / other. Do they already appear in
   Shiprocket by themselves, or does someone upload them?
3. **Warehouses:** how many places do orders ship from (your home, an office, a 3PL, a supplier)? Do different
   products ship from different places?
4. **Volume:** roughly how many orders a day?
5. **Computer:** Mac or Windows? Is this laptop on and awake at the time you want it to run? *(If nobody's computer
   is on in the morning, note it. Setup still works and they can run it by asking you.)*
6. **Daily message:** where should the summary go? Slack / Google Chat / Discord / Telegram / just a pop-up on
   this computer. *(WhatsApp isn't supported directly: it needs a paid WhatsApp Business API. Suggest Telegram if they live on their phone.)*
7. **COD:** do you take cash-on-delivery orders, and should those ship automatically too?
8. **Rules you already know:** couriers you never want at a certain warehouse, days with no pickups, box sizes,
   anything the warehouse is fussy about (how labels are grouped, etc.). "None yet" is fine: the automator learns rules over time.

Save their answers in your head for later steps; do not ask again what they already answered.

### Step 1 · Install the engine

1. Check Node.js: `node -v` must be 20 or newer. If missing: Mac → `brew install node` (or the installer from
   nodejs.org); Windows → `winget install OpenJS.NodeJS.LTS`. Have them do it if a password prompt is needed.
2. Copy the engine out of the skill folder so updates to the skill never touch their settings:
   `~/shiprocket-fulfillment-automator/` (Mac/Linux) or `%USERPROFILE%\shiprocket-fulfillment-automator\` (Windows).
   Copy `engine/*` there, then `npm install` inside it. From here on, "the engine folder" means that copy.
3. Create `config.json` from `config.example.json`, set `brandName`, and create `.env` from `.env.example`.
4. **Check:** `npm ls pdf-lib` shows it installed and `node fulfill.mjs --help` prints the usage. (Never run
   `fulfill.mjs` with no flags to "test" it: that is a real run.)

### Step 2 · Connect Shiprocket (API user)

Tell them to do this in the Shiprocket dashboard:
1. **Settings → API → Configure → Create an API User.** (Shiprocket moves menus around; if it looks different,
   search "API" in Settings.)
2. Use an email that is **different from their main Shiprocket login** (Shiprocket requires this; a Gmail alias like
   `name+api@gmail.com` works). Set a password. Shiprocket emails/creates it instantly.
3. Paste the API user's email and password into `.env` (`SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`). Open the file
   for them (`open -e` on Mac, `notepad` on Windows) rather than asking them to send the password in chat. If they
   paste it in chat anyway, write it to .env yourself and do not repeat it.

**Check:** `node check.mjs login` prints "✓ Shiprocket login works". If it fails: wrong password, they used their
main login instead of the API user, or the API user was just created (wait a minute).

*Optional, for chatting with Shiprocket directly:* Shiprocket's official MCP server (github.com/bfrs/shiprocket-mcp)
lets you track orders, check rates and create orders in chat. The automator does not need it. Offer it once, at the end.

### Step 3 · Are store orders reaching Shiprocket?

**Check:** `node check.mjs orders --days=7`.
- Orders listed, with their store's channel name: ✅ the store is connected. Tell them the counts by status.
- Zero orders, or only "CUSTOM": their store is not connected. Walk them through it: Shiprocket →
  **Channels → Add New Channel → Shopify** (or WooCommerce etc.) and follow the prompts. Then turn on
  order sync, and in the channel settings check that **product weight and dimensions sync** too. Wait for them to say
  done, then re-run the check. New orders appear within minutes; old ones may need "Fetch orders" in the channel page.

### Step 4 · Shopify access for Claude (recommended, not required)

The daily run only talks to Shiprocket. Shopify access lets *you* (Claude) do three useful things: read the full
product catalogue and weights during setup, fix addresses that Shiprocket rejects (it hides the customer's phone and the fix
needs it), and check a stuck order against Shopify. Explain this in one or two lines and ask if they want it.

- First check whether you already have Shopify tools (tool names containing "Shopify"). If yes, call a read-only one
  (e.g. shop info) and confirm the store name with them. Done.
- If not: in Claude, go to **Settings → Connectors**, add **Shopify**, and log in to the store. Claude Code picks up
  connectors added to the same claude.ai account; they may need to restart Claude Code. Then re-check.
- Not on Shopify, or they would rather not: skip. Setup works from Shiprocket data alone.

### Step 5 · Warehouses (pickup locations)

**Check:** `node check.mjs pickups`. Show the list as a short table (name, city, pincode) and ask:
"Is this every place you ship from? Which ones are actually in use?" Missing one? Shiprocket → **Settings → Pickup
Addresses → Add**. Re-check after. Note the exact names: config.json must spell them the same way.

### Step 6 · Which product ships from where

**Check:** `node check.mjs products --days=60` (add `--json` if you want to parse it). If you have Shopify access, also
pull the active product list so products with no recent orders are covered too.

- **One warehouse:** say "Everything ships from <name>, right?" and on yes set `"productPickupMap": {"*": "<name>"}`.
  The `*` is a deliberate "everything" choice; explain that new products will also ship from there automatically.
- **Several warehouses:** show a table: product, orders in 60 days, your best guess at the warehouse (from the
  product name or their questionnaire answer). Ask them to correct it. Save as `productPickupMap` with a short,
  distinctive piece of each product name as the key (first match wins, so put more specific keys first). Use
  `skuPickupMap` when product names are too alike.
- **Never add `*` for a multi-warehouse store.** Unmapped products must block, not guess. That is the safety net.

**Check:** `node check.mjs config` shows no "no warehouse" problems.

### Step 7 · Weights and box sizes

Couriers charge, and refuse, by weight. Shiprocket books with the weight **stored on the order**, which comes from the
product weight in the store. `check.mjs products` shows stored weights and flags any product with weight 0.

- For every flagged product: ask the packed weight (product + box), and have them set it on the product in Shopify
  (Products → the product → Shipping → Weight), or do it for them if you have Shopify write access and they say yes.
  Future orders then sync correctly. Orders already sitting in Shiprocket with weight 0 stay blocked; offer to
  list them so they can fix them in bulk (Shiprocket → Orders → Bulk update via CSV, matching by Order ID).
- Optionally record the packed size per product in `productWeights` (`{"<name part>": {"weightKg": 0.5}}`), used for
  courier quotes and as their reference.

### Step 8 · Rules

Read `references/rules.md` (every rule the engine supports, with the question to ask and the config key). Go through
the **core questions** below. Pre-fill answers from the questionnaire and ask only what is still unknown. Save each one to
config.json, add a line to RULES.md, and read the final list back to them.

1. **Run days and time:** default Mon-Fri at 9:00. (Run before the courier's pickup cut-off, usually around 11 AM.)
2. **Pickup days:** which days can couriers collect? Default Mon-Fri. Any holidays coming up?
3. **Courier choice:** minimum rating (default 4★), then **cheapest** or **fastest**? Any courier to never use, either
   everywhere or at one warehouse?
4. **Price ceiling:** never pay more than ₹X for one shipment? (Blocks instead of overpaying.)
5. **COD:** ship COD automatically, yes or no.
6. **Labels:** how does each warehouse want them? One PDF per product (default), one PDF per warehouse, or one PDF for
   everything.
7. Anything else from their list that the engine can't do yet: see "Rules the engine can't express" below.

**Check:** `node check.mjs config`, which must print "config.json looks good" or only problems they have accepted.

### Step 9 · The daily message

Set `notify.type` and the matching value in `.env`. Exact steps for each app are in `references/notifications.md`.
Give them only the one they picked.
**Check:** `node check.mjs notify-test`, then ask "did it arrive?" Do not move on until they say yes.

### Step 10 · Dry run (nothing gets booked)

Run `node fulfill.mjs --dry-run --force`. Present the result as a short summary, not the raw log:
- how many would ship, from which warehouse, with which courier and price (group them),
- every blocked order with its reason in plain words, and what fixes it.
Ask: "Does this look right? Anything you would have done differently?" Every "no, actually..." is a rule: go back to
Step 8 for that rule, then dry-run again. Repeat until they are happy.

### Step 11 · First real run (only with an explicit yes)

Explain: this books couriers and spends wallet money. Check the wallet covers the dry run's total plus ₹200.
On a clear yes: `node fulfill.mjs --force`. Then show what shipped, open the labels folder for them, and confirm the
chat message arrived. If they would rather wait, skip this: the schedule will do it.

### Step 12 · Schedule it

`node scripts/scheduler.mjs install`, then `node scripts/scheduler.mjs status`. Explain plainly:
- it runs on <days> at <time> on this computer; the computer must be on and logged in (a sleeping Mac runs it on wake),
- labels appear in <outputDir>/<date>/, and the message arrives in <chat>,
- to pause: tell Claude "pause the fulfillment automator" (you run `scheduler.mjs remove`).

### Step 13 · Handover

Finish with a short summary: what is set up, their rules (from RULES.md), where labels go, what a normal morning
looks like ("check the message, print the labels, pack, hand over"), and how to change things later: just tell Claude in
plain words, e.g. "from now on, don't use Delhivery from the Jaipur warehouse". Offer the optional Shiprocket MCP (Step 2).

---

## After setup: looking after it

**"Why didn't order X ship?" / the message says some need a look:** open the latest `reports/report_*.csv` in today's
label folder, find the order, and explain the reason in plain words with the fix. Common reasons and fixes are in
`references/troubleshooting.md`. Read it before improvising.

**New rule ("from now on..." / "never..." / "always..."):** map it to a setting from `references/rules.md`, show the
before/after in one line, save it, add a RULES.md line, run `node check.mjs config` and a `--dry-run`, and tell them what
changed in the result. If no setting fits, see the next section.

**Rules the engine can't express:** say so honestly. Offer either (a) the closest existing setting, or (b) a small,
careful change to the engine. If you change code: keep the existing safety rules intact (below), add the rule as a new
config setting with a default that changes nothing, explain it in RULES.md, and dry-run before and after.

**New product or new warehouse:** map it (Step 6) and check its weight (Step 7) before its first order arrives.
Until then its orders are blocked with "product not set up yet". That is intended.

**Orders needing two warehouses:** never booked automatically. Follow `references/split-orders.md` with them, by hand.

**Wallet ran out mid-run:** the run stops cleanly, and the rest stay NEW and go out on the next run. Tell them the amount
to add; they can ask you to run it again now (`node fulfill.mjs --force`) after topping up.

## Safety rules (never break these, even if asked casually; explain why instead)

1. Never book without a warehouse mapping for every item, and never ship a multi-warehouse order whole.
2. Never schedule a pickup on a day the warehouse is closed: always use `lib/schedule.mjs`. A booked pickup date
   **cannot be changed** through the API.
3. Never call Shiprocket's label endpoint with a big list in one go, and never report labels as complete without the page
   count check (`lib/labels.mjs`).
4. Never use Shiprocket's "create order" call to edit an existing order. It creates a duplicate. Edits go through the
   dashboard (bulk CSV update) or the specific update endpoints.
5. Never write a phone number read from Shiprocket back to Shiprocket: reads are masked (`xxxxxxxxxx`). Real phones
   come from the store (Shopify).
6. Never add an order to `skipOrders` because of a temporary error. `skipOrders` is permanent. Temporary failures
   simply stay NEW and the next run retries them.
7. Never run a real (non-dry) run without the owner's go-ahead in this conversation, except via the schedule they set up.
8. Never loosen the courier rating floor, add `*` to a multi-warehouse map, or turn on COD without asking.
