import { Module } from '@nestjs/common';

import { SMS_SENDER_PORT } from './sms-sender-adapter.port';
import { TwilioSmsAdapter } from './sms-sender-adapter.service';

@Module({
  providers: [{ provide: SMS_SENDER_PORT, useClass: TwilioSmsAdapter }],
  exports: [SMS_SENDER_PORT],
})
export class SmsSenderAdapterModule {}
