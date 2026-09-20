import type { WeeklyDoseDay } from "./types";

export function getDoseDayPercentage(day: WeeklyDoseDay): number | null {
  if (day.scheduled <= 0) {
    return null;
  }

  return Math.min(
    100,
    Math.max(0, Math.round((day.taken / day.scheduled) * 100)),
  );
}

export function getWeeklyAdherencePercentage(
  days: readonly WeeklyDoseDay[],
): number | null {
  const totals = days.reduce(
    (summary, day) => ({
      scheduled: summary.scheduled + day.scheduled,
      taken: summary.taken + day.taken,
    }),
    {
      scheduled: 0,
      taken: 0,
    },
  );

  if (totals.scheduled <= 0) {
    return null;
  }

  return Math.min(
    100,
    Math.max(0, Math.round((totals.taken / totals.scheduled) * 100)),
  );
}

export function orderWeeklyDoseDays(
  days: readonly WeeklyDoseDay[],
): WeeklyDoseDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

export function getWeekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  const dateValue = new Date(Date.UTC(year, month - 1, day));

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    dateValue.getUTCDay()
  ];
}
