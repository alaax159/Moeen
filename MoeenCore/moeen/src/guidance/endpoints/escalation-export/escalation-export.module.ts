import { Module } from '@nestjs/common';

import { EscalationExportController } from './escalation-export.controller';
import { EscalationExportService } from './escalation-export.service';

@Module({
  controllers: [EscalationExportController],
  providers: [EscalationExportService],
})
export class EscalationExportModule {}
