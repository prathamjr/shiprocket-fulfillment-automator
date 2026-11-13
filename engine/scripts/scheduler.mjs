#!/usr/bin/env node
/**
 * Turns the daily run on or off on this computer.
 *   node scripts/scheduler.mjs install   schedule fulfill.mjs at config.runTime on config.runDays
 *   node scripts/scheduler.mjs status    is it scheduled? when did it last run?
 *   node scripts/scheduler.mjs remove    stop the daily run
 * macOS: a LaunchAgent. Windows: a Task Scheduler task. Linux: a crontab line.
 * The computer must be on (and logged in) at run time. A Mac that is asleep at
 * run time runs the job when it wakes up.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { ENGINE_DIR, loadConfig } from "../lib/config.mjs";

const cmd = process.argv[2] ?? "status";
const config = loadConfig();
const [hour, minute] = config.runTime.split(":").map(Number);
const DAYNUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const node = process.execPath;
const script = path.join(ENGINE_DIR, "fulfill.mjs");
const logDir = path.join(ENGINE_DIR, "logs");
fs.mkdirSync(logDir, { recursive: true });
const run = (bin, args) => { try { return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return `${e.stdout ?? ""}${e.stderr ?? ""}`; } };

const LABEL = "com.shiprocket-fulfillment-automator.daily";
const TASK = "ShiprocketFulfillmentAutomator";

function lastLog() {
  const f = path.join(logDir, "daily.log");
  if (!fs.existsSync(f)) return "no runs logged yet";
  const lines = fs.readFileSync(f, "utf8").trim().split("\n");
  return lines.slice(-6).join("\n");
}

if (process.platform === "darwin") {
  const plist = path.join(os.homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
  const uid = process.getuid();
  if (cmd === "install") {
    const intervals = config.runDays.map((d) => `    <dict><key>Weekday</key><integer>${DAYNUM[d.slice(0, 3)]}</integer><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>`).join("\n");
    fs.mkdirSync(path.dirname(plist), { recursive: true });
    fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>${script}</string></array>
  <key>WorkingDirectory</key><string>${ENGINE_DIR}</string>
  <key>StartCalendarInterval</key><array>
${intervals}
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${path.dirname(node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>${path.join(logDir, "daily.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, "daily.log")}</string>
</dict></plist>
`);
    run("launchctl", ["bootout", `gui/${uid}`, plist]);
    const r = run("launchctl", ["bootstrap", `gui/${uid}`, plist]);
    console.log(r.trim() ? `launchctl said: ${r.trim()}` : `✓ Scheduled: ${config.runDays.join(", ")} at ${config.runTime} (macOS LaunchAgent ${LABEL})`);
  } else if (cmd === "remove") {
    run("launchctl", ["bootout", `gui/${uid}`, plist]);
    fs.rmSync(plist, { force: true });
    console.log("✓ Daily run removed");
  } else {
    const loaded = run("launchctl", ["print", `gui/${uid}/${LABEL}`]);
    console.log(fs.existsSync(plist) && !/Could not find/.test(loaded) ? `✓ Scheduled (${config.runDays.join(", ")} at ${config.runTime})` : "✗ Not scheduled");
    console.log(`Last log lines:\n${lastLog()}`);
  }
} else if (process.platform === "win32") {
  const days = config.runDays.map((d) => d.slice(0, 3).toUpperCase()).join(",");
  if (cmd === "install") {
    const action = `cmd /c ""${node}" "${script}" >> "${path.join(logDir, "daily.log")}" 2>&1"`;
    const r = run("schtasks", ["/Create", "/TN", TASK, "/SC", "WEEKLY", "/D", days, "/ST", config.runTime, "/TR", action, "/F"]);
    console.log(/SUCCESS/i.test(r) ? `✓ Scheduled: ${days} at ${config.runTime} (Task Scheduler "${TASK}")` : r);
  } else if (cmd === "remove") {
    console.log(run("schtasks", ["/Delete", "/TN", TASK, "/F"]));
  } else {
    console.log(run("schtasks", ["/Query", "/TN", TASK, "/V", "/FO", "LIST"]) || "✗ Not scheduled");
    console.log(`Last log lines:\n${lastLog()}`);
  }
} else {
  const line = `${minute} ${hour} * * ${config.runDays.map((d) => DAYNUM[d.slice(0, 3)]).join(",")} cd "${ENGINE_DIR}" && "${node}" fulfill.mjs >> "${path.join(logDir, "daily.log")}" 2>&1 # shiprocket-fulfillment-automator`;
  const current = run("crontab", ["-l"]).split("\n").filter((l) => l && !l.includes("# shiprocket-fulfillment-automator") && !/no crontab/i.test(l));
  if (cmd === "install" || cmd === "remove") {
    const next = cmd === "install" ? [...current, line] : current;
    const tmp = path.join(os.tmpdir(), "sra-cron");
    fs.writeFileSync(tmp, next.join("\n") + "\n");
    run("crontab", [tmp]);
    console.log(cmd === "install" ? `✓ Scheduled: ${line}` : "✓ Daily run removed");
  } else {
    console.log(run("crontab", ["-l"]).includes("# shiprocket-fulfillment-automator") ? "✓ Scheduled" : "✗ Not scheduled");
    console.log(`Last log lines:\n${lastLog()}`);
  }
}
