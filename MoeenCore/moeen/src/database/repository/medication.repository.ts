import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

// Both searches match by substring, so a query like "pan" also hits
// "ATROSPAN". Prefix matches are ordered first so the candidate window is
// never filled with mid-word hits before the real match is reached; the
// service then ranks and trims what comes back.
const SEARCH_CANDIDATE_LIMIT = 50;

@Injectable()
export class MedicationRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  searchMedications(searchTerm: string, limit = SEARCH_CANDIDATE_LIMIT) {
    const contains = `%${searchTerm}%`;
    const startsWith = `${searchTerm}%`;

    return this.db
      .select()
      .from(schema.medication)
      .where(
        and(
          // Rows a patient typed in by hand live in this table as well.
          // They are that patient's own entry, not catalogue data, so they
          // are never offered back as a suggestion to anyone.
          eq(schema.medication.verificationStatus, 'verified'),
          or(
            ilike(schema.medication.brandName, contains),
            ilike(schema.medication.genericName, contains),
          ),
        ),
      )
      .orderBy(
        sql`case when ${schema.medication.brandName} ilike ${startsWith} or ${schema.medication.genericName} ilike ${startsWith} then 0 else 1 end`,
        asc(schema.medication.brandName),
      )
      .limit(limit);
  }

  searchCatalog(searchTerm: string, limit = SEARCH_CANDIDATE_LIMIT) {
    const contains = `%${searchTerm}%`;
    const startsWith = `${searchTerm}%`;

    return this.db
      .select()
      .from(schema.medicationCatalog)
      .where(
        or(
          ilike(schema.medicationCatalog.name, contains),
          ilike(schema.medicationCatalog.normalizedName, contains),
        ),
      )
      .orderBy(
        sql`case when ${schema.medicationCatalog.normalizedName} ilike ${startsWith} then 0 else 1 end`,
        desc(schema.medicationCatalog.isEssential),
        asc(schema.medicationCatalog.name),
      )
      .limit(limit);
  }

  async getForSafetyCheck(medicationId: number) {
    const [medication] = await this.db
      .select({
        id: schema.medication.id,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
        dailyMedId: schema.medication.dailyMedId,
      })
      .from(schema.medication)
      .where(eq(schema.medication.id, medicationId))
      .limit(1);

    return medication ?? null;
  }
}
