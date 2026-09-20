import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DrizzleAuditWriter } from './drizzle-audit-writer.service';
import { AUDIT_HOOK_PORT } from '../orchestrator/audit-hook.port';

@Module({
  imports: [DatabaseModule],
  providers: [{ provide: AUDIT_HOOK_PORT, useClass: DrizzleAuditWriter }],
  exports: [AUDIT_HOOK_PORT],
})
export class AuditWriterModule {}
