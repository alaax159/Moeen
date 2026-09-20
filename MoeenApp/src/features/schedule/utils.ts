import type { DoseStatus, TodayDose } from './types';

/**
 * Display name for a dose's medication. `brandName`/`genericName` are both
 * nullable (a medication may carry only one); fall back through them, then to a
 * generic label so a card never renders an empty name.
 */
export function doseMedicationName(
  dose: Pick<TodayDose, 'brandName' | 'genericName'>,
): string {
  return (
    dose.brandName?.trim() ||
    dose.genericName?.trim() ||
    'Medication'
  );
}

export function formatScheduleTime(time: string): string {
  const [hoursText, minutesText] = time.split(':');

  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour =
    hours % 12 === 0 ? 12 : hours % 12;

  return `${displayHour}:${minutes
    .toString()
    .padStart(2, '0')} ${period}`;
}

export type DoseBucketKey = 'up-next' | 'completed' | 'missed';

export interface DoseBucket {
  key: DoseBucketKey;
  title: string;
  data: TodayDose[];
}

// Order the schedule reads in: still-actionable doses first (soonest scheduled
// time first), already-handled doses next, missed doses last — a missed morning
// dose should never sit above a dose still coming up later today.
const DOSE_BUCKET: Record<DoseStatus, DoseBucketKey> = {
  upcoming: 'up-next',
  taken: 'completed',
  skipped: 'completed',
  missed: 'missed',
};

const BUCKET_ORDER: { key: DoseBucketKey; title: string }[] = [
  { key: 'up-next', title: 'Up next' },
  { key: 'completed', title: 'Completed' },
  { key: 'missed', title: 'Missed' },
];

/**
 * Partitions today's doses into the three status buckets above, each sorted by
 * scheduled time ascending. Empty buckets are omitted.
 */
export function bucketTodayDoses(doses: TodayDose[]): DoseBucket[] {
  const byKey = new Map<DoseBucketKey, TodayDose[]>();

  doses.forEach((dose) => {
    const key = DOSE_BUCKET[dose.status];
    const existing = byKey.get(key);

    if (existing) {
      existing.push(dose);
    } else {
      byKey.set(key, [dose]);
    }
  });

  return BUCKET_ORDER.flatMap(({ key, title }) => {
    const bucketDoses = byKey.get(key);

    if (!bucketDoses || bucketDoses.length === 0) {
      return [];
    }

    return [
      {
        key,
        title,
        data: [...bucketDoses].sort((a, b) =>
          a.time.localeCompare(b.time),
        ),
      },
    ];
  });
}
