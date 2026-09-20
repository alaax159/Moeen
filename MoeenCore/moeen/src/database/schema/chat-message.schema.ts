import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { chatSession } from './chat-session.schema';
import { validationStatusEnum } from './guidance-shared.schema';

export const chatMessageRoleEnum = pgEnum('chat_message_role', [
  'user',
  'assistant',
]);

export const chatRequestStatusEnum = pgEnum('chat_request_status', [
  'processing',
  'completed',
  'failed',
]);

export const chatMessage = pgTable(
  'chat_message',
  {
    id: serial('id').primaryKey(),
    chatSessionId: integer('chat_session_id')
      .notNull()
      .references(() => chatSession.id, { onDelete: 'cascade' }),
    role: chatMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    requestId: varchar('request_id', { length: 64 }),
    requestStatus: chatRequestStatusEnum('request_status'),
    citations: jsonb('citations').$type<string[]>().notNull().default([]),
    validationStatus: validationStatusEnum('validation_status'),
    promptVersion: varchar('prompt_version', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chat_message_request_id_role_idx').on(
      table.requestId,
      table.role,
    ),
  ],
);
