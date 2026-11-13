# Shiprocket Fulfillment Automator

**Your morning shipping, done before you open your laptop.**

Every morning it takes every new order in Shiprocket, books the best courier by *your* rules, schedules pickup for
the next working day, downloads every label (checked, none missing) into a folder per warehouse, and messages your team:

```
📦 My Store shipping: Thu, Nov 13

43 shipped · pickup tomorrow (2026-11-14)
2 need a look:
  • 1 × product not set up yet (no warehouse mapped)
  • 1 × weight is 0 in Shiprocket

✅ Labels: 43/43 verified
💰 Wallet ₹3,140 · keep ₹4,000 for the next run (top up ~₹860)
```

Your team's job becomes: **download the labels, pack, hand over.**

It's a skill for **Claude Code** (Anthropic's AI assistant). Claude sets it up with you step by step, in plain
English, no coding. Then it keeps learning your rules: tell it *"never use courier X from the Jaipur warehouse"* or
*"no pickups on Saturdays"* and that's a rule from tomorrow on.

---

## What you need

- A **Shiprocket** account with your store connected (Shopify, WooCommerce, etc.)
- **Claude Code**, on a Pro or Max plan: the desktop app (Code tab) or the terminal. [Get it here](https://claude.com/claude-code).
- A Mac or Windows computer that's on in the morning (it runs on your computer, your data stays with you)
- 20-40 minutes for setup

## Install (one line)

Open Claude Code and paste:

```
Install the skill from https://github.com/prathamjr/shiprocket-fulfillment-automator into ~/.claude/skills and set up my Shiprocket Fulfillment Automator
```

Or in a terminal:

```bash
git clone https://github.com/prathamjr/shiprocket-fulfillment-automator ~/.claude/skills/shiprocket-fulfillment-automator
```

then open Claude Code and say **"set up my Shiprocket Fulfillment Automator"**.

## How setup goes

Claude asks you a few questions first (warehouses, couriers you hate, where you want the daily message), then goes
one step at a time. Each step, it tells you exactly what to click, you say "done", and it checks before moving on:

1. Install the engine on your computer
2. Connect Shiprocket (a separate API login, so your main password is never used)
3. Check your store's orders are reaching Shiprocket
4. *(Optional)* Let Claude see your Shopify store, for product weights and fixing addresses
5. Confirm your warehouses
6. Which product ships from which warehouse
7. Fix missing weights (the #1 reason couriers refuse orders)
8. Your rules: pickup days, courier rating, cheapest vs fastest, banned couriers, COD, price ceiling, label layout
9. Your daily message: Slack, Google Chat, Discord or Telegram
10. **Dry run:** see exactly what it *would* ship. Nothing is booked.
11. First real run, only when you say yes
12. Schedule it for every morning

## What it will never do

- **Guess.** An order with a product it doesn't know, a missing weight, or items from two warehouses is left alone
  and listed in the message with the reason and the fix.
- **Book a pickup on a day your warehouse is closed.** Pickup dates can't be changed once booked, so this is checked
  in one place.
- **Say labels are ready when some are missing.** Shiprocket sometimes drops labels on big batches without an error;
  every PDF's pages are counted.
- **Spend money without you.** Setup only books after you approve a dry run. After that, only the schedule you set runs it.
- **Send your data anywhere.** It talks to Shiprocket and your chat app, nothing else. Passwords stay in a file on your computer.

## Built from a real store

This runs the shipping for a D2C brand doing hundreds of orders a day across multiple warehouses. Every safety rule in
it exists because something went wrong once: labels lost in big batches, Saturday pickups, a product shipped from a
warehouse that didn't stock it. You get the version with those lessons built in.

## Files

```
SKILL.md                    the onboarding Claude follows
engine/fulfill.mjs          the daily run (--dry-run to preview)
engine/check.mjs            read-only checks used during setup
engine/scripts/scheduler.mjs  turns the morning run on/off (Mac, Windows, Linux)
engine/config.example.json  every rule, with safe defaults
references/                 rules list, chat setup, troubleshooting, split orders
```

Not affiliated with Shiprocket. Use at your own risk: it books real shipments with real money. Start with the dry run.

MIT licensed.
