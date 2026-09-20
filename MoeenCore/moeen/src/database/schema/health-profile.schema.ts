import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const genderEnum = pgEnum('gender', ['male', 'female']);

export const bloodTypeEnum = pgEnum('blood_type', [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
]);

export const healthKnowledgeStatusEnum = pgEnum('health_knowledge_status', [
  'unknown',
  'none_known',
  'has_records',
]);

export const healthProfile = pgTable(
  'health_profiles',
  {
    id: serial('id').primaryKey(),

    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    dateOfBirth: date('date_of_birth'),
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    heightCm: numeric('height_cm', { precision: 5, scale: 2 }),
    gender: genderEnum('gender'),
    bloodType: bloodTypeEnum('blood_type'),
    // @deprecated stale after first edit via emergency_contact table (Manage Emergency Contacts) — see AB#4198
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
    doctorName: varchar('doctor_name', { length: 100 }),
    doctorPhone: varchar('doctor_phone', { length: 20 }),

    allergyKnowledgeStatus: healthKnowledgeStatusEnum(
      'allergy_knowledge_status',
    )
      .notNull()
      .default('unknown'),

    conditionKnowledgeStatus: healthKnowledgeStatusEnum(
      'condition_knowledge_status',
    )
      .notNull()
      .default('unknown'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('health_profiles_user_id_idx').on(table.userId)],
);
