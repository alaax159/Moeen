import { integer, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const chatSession = pgTable('chat_session', {
  id: serial('id').primaryKey(),

  userId: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  subjectMedicationId: integer('subject_medication_id'),

  startedAt: timestamp('started_at').notNull().defaultNow(),
});
