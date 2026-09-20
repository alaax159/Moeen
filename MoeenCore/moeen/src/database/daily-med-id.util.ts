/**
 * medication.dailyMedId is stored as `dm/<setid>` (see
 * AddMedicationService.toDailyMedId) — this strips it back to the raw
 * setid DailyMed's API actually expects. Shared by every consumer that
 * needs the real setid rather than duplicating this convention per file.
 */
export function stripDailyMedPrefix(dailyMedId: string): string {
  return dailyMedId.startsWith('dm/') ? dailyMedId.slice(3) : dailyMedId;
}
