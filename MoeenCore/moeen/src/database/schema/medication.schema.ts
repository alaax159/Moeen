import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { medicationCatalog } from './medication-catalog.schema';

export const verificationSourceEnum = pgEnum('verification_source', [
  'palestine_moh',
  'dailymed',
  'rxnorm',
  'manual',
]);

export const medicationVerificationStatusEnum = pgEnum(
  'medication_verification_status',
  ['verified', 'unresolved'],
);

export const verificationStatusEnum = pgEnum('verification_status', [
  'verified',
  'non-verified',
]);

export const medication = pgTable(
  'medication',
  {
    id: serial('id').primaryKey(),

    brandName: text('brand_name'),

    genericName: text('generic_name'),
    medicationCatalogId: integer('medication_catalog_id').references(
      () => medicationCatalog.id,
      { onDelete: 'restrict' },
    ),

    verificationSource: verificationSourceEnum('verification_source'),

    verificationStatus: medicationVerificationStatusEnum('verification_status')
      .notNull()
      .default('unresolved'),

    verified: verificationStatusEnum('verified')
      .notNull()
      .default('non-verified'),

    dailyMedId: varchar('dailymed_id', { length: 255 }),

    rxcui: varchar('rxcui', { length: 64 }),

    description: varchar('description', { length: 1000 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('medication_dailymed_id_idx').on(table.dailyMedId),
    uniqueIndex('medication_catalog_id_idx').on(table.medicationCatalogId),
  ],
);
