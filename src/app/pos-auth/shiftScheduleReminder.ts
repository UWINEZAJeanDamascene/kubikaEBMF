export interface PosShiftSchedule {
  weekdays: number[];
  startTime: string;
  endTime: string;
}

export interface PosShiftScheduleReminder {
  key: string;
  status: "upcoming" | "due";
  minutesRemaining: number;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const REMINDER_LEAD_MINUTES = 15;
const MAX_OVERDUE_HOURS = 12;
const sentReminderKeys = new Set<string>();

function getCurrentScheduledWindow(
  schedule: PosShiftSchedule | null | undefined,
  now: Date,
): { start: Date; end: Date } | null {
  if (!schedule
    || !Array.isArray(schedule.weekdays)
    || schedule.weekdays.length === 0
    || !TIME_PATTERN.test(schedule.startTime)
    || !TIME_PATTERN.test(schedule.endTime)
    || schedule.startTime === schedule.endTime
    || schedule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;

  const candidates: Array<{ start: Date; end: Date }> = [];
  for (const dayOffset of [-1, 0]) {
    const start = new Date(now);
    start.setDate(start.getDate() + dayOffset);
    if (!schedule.weekdays.includes(start.getDay())) continue;
    setClock(start, schedule.startTime);
    const end = setClock(new Date(start), schedule.endTime);
    if (end <= start) end.setDate(end.getDate() + 1);
    if (start <= now) candidates.push({ start, end });
  }

  return candidates.sort((left, right) => right.start.getTime() - left.start.getTime())[0] ?? null;
}

export function isShiftScheduleEnded(
  schedule: PosShiftSchedule | null | undefined,
  now: Date,
): boolean {
  const current = getCurrentScheduledWindow(schedule, now);
  return current !== null && now >= current.end;
}

export function claimShiftScheduleReminder(storageKey: string): boolean {
  if (sentReminderKeys.has(storageKey)) return false;
  try {
    if (localStorage.getItem(storageKey)) {
      sentReminderKeys.add(storageKey);
      return false;
    }
    localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    sentReminderKeys.add(storageKey);
    return true;
  }
  sentReminderKeys.add(storageKey);
  return true;
}

function setClock(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function getShiftScheduleReminder(
  schedule: PosShiftSchedule | null | undefined,
  now: Date,
): PosShiftScheduleReminder | null {
  const current = getCurrentScheduledWindow(schedule, now);
  if (!current || now.getTime() - current.end.getTime() > MAX_OVERDUE_HOURS * 60 * 60 * 1000) return null;

  const minutesRemaining = Math.ceil((current.end.getTime() - now.getTime()) / 60_000);
  if (minutesRemaining > REMINDER_LEAD_MINUTES) return null;
  return {
    key: `${current.start.getFullYear()}-${current.start.getMonth()}-${current.start.getDate()}-${current.end.getTime()}`,
    status: minutesRemaining > 0 ? "upcoming" : "due",
    minutesRemaining: Math.max(0, minutesRemaining),
  };
}
