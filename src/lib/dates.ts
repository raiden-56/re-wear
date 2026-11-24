// Business dates are Indian Standard Time calendar days, stored as UTC-midnight @db.Date values.

const IST_OFFSET_MIN = 330;

/** YYYY-MM-DD for "today" in IST. */
export function todayIST(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
export const dateToDay = (d: Date) => d.toISOString().slice(0, 10);

/** 0 = Sunday … 6 = Saturday */
export const dayOfWeek = (day: string) => dayToDate(day).getUTCDay();

/** The instant (UTC) at which a given IST day + "HH:MM" occurs. */
export function istInstant(day: string, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(dayToDate(day).getTime() + (h * 60 + m - IST_OFFSET_MIN) * 60_000);
}

export const isValidDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(dayToDate(s).getTime());
