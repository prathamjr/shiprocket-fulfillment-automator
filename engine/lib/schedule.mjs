// The ONLY place that decides dates: today, whether today is a run day, and
// the next valid pickup day. Every script imports this. Never compute
// "tomorrow" anywhere else: a script with its own naive tomorrow once booked
// 14 real pickups for a Saturday, and a booked pickup date cannot be changed
// through the API afterwards.
const DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function makeSchedule(config) {
  const tz = config.timezone;
  const dateIn = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: tz });
  const weekday = (dateStr) => new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  const allowed = (days) => new Set(days.map((d) => DAY[d.slice(0, 3)]));
  const runDays = allowed(config.runDays);
  const pickupDays = allowed(config.pickupDays);
  const holidays = new Set(config.holidays ?? []);

  const TODAY = dateIn(0);
  const isRunDay = runDays.has(weekday(TODAY)) && !holidays.has(TODAY);

  let offset = 1;
  while (offset < 15 && (!pickupDays.has(weekday(dateIn(offset))) || holidays.has(dateIn(offset)))) offset++;
  const PICKUP_DATE = dateIn(offset);

  return { TODAY, PICKUP_DATE, PICKUP_SKIPPED_DAYS: offset > 1, isRunDay, dateIn };
}

/** Exit quietly on non-run days (weekends, holidays) unless --force is passed. */
export function exitIfNotRunDay(schedule, label, argv = process.argv) {
  if (argv.includes("--force")) return;
  if (!schedule.isRunDay) {
    console.log(`${new Date().toISOString()} ${label}: ${schedule.TODAY} is not a run day (see runDays/holidays in config.json). Nothing to do. Use --force to override.`);
    process.exit(0);
  }
}
