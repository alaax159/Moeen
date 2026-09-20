import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';
import { DRIZZLE } from './database.constants';
import { DatabaseRepository } from './repository/database.repository';
import { MedicationRepository } from './repository/medication.repository';
import { NotificationPreferencesRepository } from './repository/notification-preferences.repository';
import { EmergencyNotificationLogRepository } from './repository/emergency-notification-log.repository';
import { DoseLogRepository } from './repository/dose-log.repository';
import { DoseScheduleRepository } from './repository/dose-schedule.repository';
import { UserMedicationRepository } from './repository/user-medication.repository';
import { UserRepository } from './repository/user.repository';
import { HealthProfileRepository } from './repository/health-profile.repository';
import { MedicationEventsModule } from '../medication-events/medication-events.module';

export { DRIZZLE } from './database.constants';

@Global()
@Module({
  imports: [MedicationEventsModule],
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });

        return drizzle(pool, { schema });
      },
    },

    MedicationRepository,
    NotificationPreferencesRepository,
    EmergencyNotificationLogRepository,
    DoseLogRepository,
    DoseScheduleRepository,
    DatabaseRepository,
    UserMedicationRepository,
    UserRepository,
    HealthProfileRepository,
  ],

  exports: [
    DRIZZLE,
    MedicationRepository,
    NotificationPreferencesRepository,
    EmergencyNotificationLogRepository,
    DoseLogRepository,
    DoseScheduleRepository,
    DatabaseRepository,
    UserMedicationRepository,
    UserRepository,
    HealthProfileRepository,
  ],
})
export class DatabaseModule {}
