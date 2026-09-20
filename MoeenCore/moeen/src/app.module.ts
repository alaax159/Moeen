import { BullModule } from '@nestjs/bullmq';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { MedicationsModule } from './medications/medications.module';
import { HealthProfileModule } from './health-profile/health-profile.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { LabelIngestionModule } from './knowledge/label-ingestion/label-ingestion.module';
import { GetExplanationModule } from './guidance/endpoints/get-explanation/get-explanation.module';
import { PostChatMessageModule } from './guidance/endpoints/post-chat-message/post-chat-message.module';
import { GetChatCitationModule } from './guidance/endpoints/get-chat-citation/get-chat-citation.module';
import { EscalationExportModule } from './guidance/endpoints/escalation-export/escalation-export.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { EmergencySupportModule } from './emergency-support/emergency-support.module';
import { queueDashboardMiddlewareFromConfig } from './platform/queue-dashboard.middleware';

@Module({
  imports: [
    UsersModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullBoardModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        route: '/queues',
        adapter: ExpressAdapter,
        middleware: queueDashboardMiddlewareFromConfig(config),
        boardOptions: {
          uiConfig: {
            boardTitle: 'Moeen Notification Queues',
          },
        },
      }),
    }),
    AuthModule,
    DatabaseModule,
    MedicationsModule,
    HealthProfileModule,
    NotificationsModule,
    LabelIngestionModule,
    GetExplanationModule,
    PostChatMessageModule,
    GetChatCitationModule,
    EscalationExportModule,
    PrescriptionsModule,
    EmergencySupportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
