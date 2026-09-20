import {
  boolean,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const medicationCatalogSourceEnum = pgEnum('medication_catalog_source', [
  'palestine_moh',
]);

export const medicationCatalog = pgTable(
  'medication_catalog',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    manufacturer: text('manufacturer'),
    dosageForm: text('dosage_form'),
    source: medicationCatalogSourceEnum('source').notNull(),
    externalId: varchar('external_id', { length: 255 }),
    isEssential: boolean('is_essential').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('medication_catalog_source_external_id_idx').on(
      table.source,
      table.externalId,
    ),
    uniqueIndex('medication_catalog_fallback_identity_idx').on(
      table.normalizedName,
      table.manufacturer,
      table.dosageForm,
    ).where(sql`${table.externalId} is null`),
  ],
);
