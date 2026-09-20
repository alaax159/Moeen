import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const allergyConcept = pgTable(
  'allergy_concepts',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    externalId: varchar('external_id', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('allergy_concepts_name_idx').on(table.name),
    uniqueIndex('allergy_concepts_external_id_idx').on(table.externalId),
  ],
);

export const userAllergy = pgTable(
  'user_allergies',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    allergyConceptId: integer('allergy_concept_id')
      .notNull()
      .references(() => allergyConcept.id, { onDelete: 'restrict' }),
    reaction: varchar('reaction', { length: 255 }),
    severity: varchar('severity', { length: 50 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_allergies_user_concept_idx').on(
      table.userId,
      table.allergyConceptId,
    ),
  ],
);

export const chronicConditionConcept = pgTable(
  'chronic_condition_concepts',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    externalId: varchar('external_id', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chronic_condition_concepts_name_idx').on(table.name),
    uniqueIndex('chronic_condition_concepts_external_id_idx').on(
      table.externalId,
    ),
  ],
);

export const userChronicCondition = pgTable(
  'user_chronic_conditions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    conditionConceptId: integer('condition_concept_id')
      .notNull()
      .references(() => chronicConditionConcept.id, { onDelete: 'restrict' }),
    diagnosisDate: date('diagnosis_date'),
    notes: varchar('notes', { length: 1000 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_conditions_user_concept_idx').on(
      table.userId,
      table.conditionConceptId,
    ),
  ],
);
