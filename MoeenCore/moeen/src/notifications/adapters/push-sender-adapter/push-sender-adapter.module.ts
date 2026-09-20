import { Module } from '@nestjs/common';
import { ExpoPushSenderAdapter } from './push-sender-adapter.service';
import { PUSH_SENDER_PORT } from './push-sender-adapter.port';

@Module({
  providers: [{ provide: PUSH_SENDER_PORT, useClass: ExpoPushSenderAdapter }],
  exports: [PUSH_SENDER_PORT],
})
export class PushSenderAdapterModule {}
