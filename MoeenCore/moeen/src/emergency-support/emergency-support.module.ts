import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';

import { EmergencyAccessAuditRepository } from '../database/repository/emergency-access-audit.repository';
import { EmergencyAccessRepository } from '../database/repository/emergency-access.repository';
import { EmergencyContactRepository } from '../database/repository/emergency-contact.repository';
import { HealthProfileRepository } from '../database/repository/health-profile.repository';
import { SmsSenderAdapterModule } from '../notifications/adapters/sms-sender-adapter/sms-sender-adapter.module';
import { EmergencyContactsController } from './contacts/emergency-contacts.controller';
import { EmergencyContactsService } from './contacts/emergency-contacts.service';
import { EmergencyAccessAuditReconcilerService } from './emergency-access-audit-reconciler.service';
import { EmergencyContactNotificationService } from './emergency-contact-notification.service';
import { EmergencyMedicalCardService } from './emergency-medical-card.service';
import { EmergencySupportController } from './emergency-support.controller';
import { EmergencyAccessService } from './emergency-access.service';
import { PublicEmergencyCardService } from './public-emergency-card.service';
import { PublicEmergencyCorsMiddleware } from './public-emergency-cors.middleware';
import { PublicEmergencyController } from './public-emergency.controller';
import { PublicEmergencyRateLimitGuard } from './public-emergency-rate-limit.guard';
import { PublicEmergencyRateLimiter } from './public-emergency-rate-limiter.service';
import { PublicEmergencySecurityHeadersMiddleware } from './public-emergency-security-headers.middleware';

@Module({
  imports: [SmsSenderAdapterModule],
  controllers: [
    EmergencySupportController,
    EmergencyContactsController,
    PublicEmergencyController,
  ],
  providers: [
    EmergencyMedicalCardService,
    HealthProfileRepository,
    EmergencyContactsService,
    EmergencyContactRepository,
    EmergencyContactNotificationService,
    EmergencyAccessService,
    EmergencyAccessRepository,
    EmergencyAccessAuditRepository,
    EmergencyAccessAuditReconcilerService,
    PublicEmergencyCardService,
    PublicEmergencyCorsMiddleware,
    PublicEmergencyRateLimiter,
    PublicEmergencyRateLimitGuard,
    PublicEmergencySecurityHeadersMiddleware,
  ],
  exports: [EmergencyContactNotificationService],
})
export class EmergencySupportModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        PublicEmergencySecurityHeadersMiddleware,
        PublicEmergencyCorsMiddleware,
      )
      .forRoutes({
        path: 'api/emergency/public/card',
        method: RequestMethod.ALL,
      });
  }
}
