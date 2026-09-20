import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResponseValidator } from './response-validator.service';
import { ValidationConfig } from './validation.config';

/**
 * No port symbol yet. The orchestrator's ValidatorPort is Salam's file and
 * still carries its GN-3 placeholder signature — binding to it is GN-3 T2's
 * job, once there is a GuidanceResponse to return.
 */
@Module({
  imports: [ConfigModule],
  providers: [ValidationConfig, ResponseValidator],
  exports: [ResponseValidator],
})
export class ResponseValidatorModule {}
