import { describe, expect, it } from "vitest";
import { claimShiftScheduleReminder, getShiftScheduleReminder } from "./shiftScheduleReminder";

describe("claimShiftScheduleReminder", () => {
  it("persists a reminder claim and rejects duplicates", () => {
    const key = "kubika:pos-shift-reminder:test";

    expect(claimShiftScheduleReminder(key)).toBe(true);
    expect(localStorage.getItem(key)).toBeTruthy();
    expect(claimShiftScheduleReminder(key)).toBe(false);
  });
});

describe("getShiftScheduleReminder", () => {
  const weekdays = [1, 2, 3, 4, 5];

  it("warns 15 minutes before a scheduled shift ends", () => {
    const reminder = getShiftScheduleReminder(
      { weekdays, startTime: "08:00", endTime: "17:00" },
      new Date(2026, 10, 4, 16, 45),
    );

    expect(reminder?.status).toBe("upcoming");
    expect(reminder?.minutesRemaining).toBe(15);
  });

  it("shows a due reminder after the scheduled end without closing the shift", () => {
    const reminder = getShiftScheduleReminder(
      { weekdays, startTime: "08:00", endTime: "17:00" },
      new Date(2026, 10, 4, 17, 5),
    );

    expect(reminder?.status).toBe("due");
    expect(reminder?.minutesRemaining).toBe(0);
  });

  it("handles overnight shifts using the weekday the shift started", () => {
    const reminder = getShiftScheduleReminder(
      { weekdays: [2], startTime: "22:00", endTime: "06:00" },
      new Date(2026, 10, 4, 5, 50),
    );

    expect(reminder?.status).toBe("upcoming");
    expect(reminder?.minutesRemaining).toBe(10);
  });

  it("does not remind outside scheduled days or too early", () => {
    const schedule = { weekdays, startTime: "08:00", endTime: "17:00" };
    expect(getShiftScheduleReminder(schedule, new Date(2026, 10, 7, 16, 50))).toBeNull();
    expect(getShiftScheduleReminder(schedule, new Date(2026, 10, 4, 16, 44))).toBeNull();
  });
});
