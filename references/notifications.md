# Daily message setup

Give the owner only the section for the app they chose. Put the URL or token in `engine/.env`, set
`"notify": {"type": "..."}` in config.json, then run `node check.mjs notify-test` and ask whether it arrived.

## Slack (`"type": "slack"`, `.env`: `SLACK_WEBHOOK_URL`)
1. Go to api.slack.com/apps → **Create New App → From scratch**. Name it "Shipping", then pick the workspace.
2. **Incoming Webhooks** → turn on → **Add New Webhook to Workspace** → pick the channel (e.g. #shipping) → Allow.
3. Copy the URL (starts with `https://hooks.slack.com/services/`) into `.env`.

## Google Chat (`"type": "googlechat"`, `.env`: `GOOGLE_CHAT_WEBHOOK_URL`)
Needs a Google Workspace account (not plain Gmail).
1. Open the space → space name at the top → **Apps & integrations → Webhooks → Add webhook**.
2. Name it "Shipping" → Save → copy the URL (starts with `https://chat.googleapis.com/`) into `.env`.

## Discord (`"type": "discord"`, `.env`: `DISCORD_WEBHOOK_URL`)
1. Channel → ⚙ Edit Channel → **Integrations → Webhooks → New Webhook** → Copy Webhook URL into `.env`.

## Telegram (`"type": "telegram"`, `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
Good for owners who live on their phone (WhatsApp needs a paid Business API, so it is not supported).
1. In Telegram, message **@BotFather** → `/newbot` → pick a name → copy the token into `.env`.
2. Send any message to the new bot (or add it to a group and send a message there).
3. Get the chat id: run `curl -s https://api.telegram.org/bot<TOKEN>/getUpdates` yourself (do not show the token) and
   read `result[].message.chat.id` (group ids are negative). Put it in `.env`.

## Just this computer (`"type": "none"`)
On a Mac a pop-up appears after each run and the labels folder opens. Nothing is sent anywhere.

## What the message says
Shipped count and pickup date · orders needing a look, grouped by reason · label check (X/Y verified) and folder ·
wallet balance with a suggested top-up for the next run. It is sent after every real run that shipped or blocked
something, and also if a run fails completely.
