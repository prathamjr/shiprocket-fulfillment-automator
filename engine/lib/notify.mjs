// Sends the daily summary to wherever the team reads messages.
// Webhook URLs and bot tokens live in .env, never in config.json.
import { execFile } from "node:child_process";

export async function sendMessage(config, text) {
  const type = config.notify?.type ?? "none";
  const env = process.env;
  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${type} returned HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  };
  switch (type) {
    case "slack":
      return post(need(env.SLACK_WEBHOOK_URL, "SLACK_WEBHOOK_URL"), { text });
    case "googlechat":
      return post(need(env.GOOGLE_CHAT_WEBHOOK_URL, "GOOGLE_CHAT_WEBHOOK_URL"), { text });
    case "discord":
      return post(need(env.DISCORD_WEBHOOK_URL, "DISCORD_WEBHOOK_URL"), { content: text.replace(/\*/g, "**").slice(0, 1990) });
    case "telegram":
      return post(`https://api.telegram.org/bot${need(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN")}/sendMessage`, {
        chat_id: need(env.TELEGRAM_CHAT_ID, "TELEGRAM_CHAT_ID"),
        text: text.replace(/\*/g, ""),
      });
    case "none":
      return;
    default:
      throw new Error(`Unknown notify.type "${type}" (use slack, googlechat, discord, telegram or none)`);
  }
}

function need(v, name) {
  if (!v) throw new Error(`${name} missing in engine/.env`);
  return v;
}

/** A pop-up on this computer (macOS only; silently skipped elsewhere). */
export function desktopAlert(title, message) {
  if (process.platform !== "darwin") return;
  const safe = (s) => String(s).replace(/"/g, "'").slice(0, 180);
  execFile("osascript", ["-e", `display notification "${safe(message)}" with title "${safe(title)}"`], () => {});
}

export function openFolder(dir) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(cmd, [dir], () => {});
}
