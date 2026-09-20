export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatScheduleTime(value: string): string {
  return `${value}:00`;
}

export function parsePositiveInteger(value: string): number | null {
  const normalizedValue = value.trim();

  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : null;
}
