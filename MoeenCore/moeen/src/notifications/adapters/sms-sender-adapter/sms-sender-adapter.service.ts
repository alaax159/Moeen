import { Injectable, Logger, Optional } from '@nestjs/common';
import twilio from 'twilio';

import { SmsSendResult, SmsSenderPort } from './sms-sender-adapter.port';

/**
 * The slice of the Twilio client this adapter uses. Keeping it to an interface
 * means no `twilio` types cross the port, and tests pass a plain fake — the
 * same approach as ExpoPushSenderAdapter with its Expo client.
 */
export interface TwilioMessagingClient {
  messages: {
    create(params: {
      to: string;
      from: string;
      body: string;
    }): Promise<{ sid: string }>;
  };
}

@Injectable()
export class TwilioSmsAdapter implements SmsSenderPort {
  private readonly logger = new Logger(TwilioSmsAdapter.name);
  private readonly client: TwilioMessagingClient | null;
  private readonly fromNumber: string;

  // Mirrors ExpoPushSenderAdapter's @Optional() default-client constructor, with
  // one difference: `new Expo()` is safe with no config, but `twilio(sid, token)`
  // throws when the SID is missing. So the default is guarded — with no creds the
  // client is null and every send() returns a 'NotConfigured' error result rather
  // than the app failing to boot. Tests construct `new TwilioSmsAdapter(fake)`.
  constructor(@Optional() client?: TwilioMessagingClient) {
    this.fromNumber = process.env.TWILIO_FROM_NUMBER ?? '';
    this.client = client ?? TwilioSmsAdapter.createDefaultClient();
  }

  private static createDefaultClient(): TwilioMessagingClient | null {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return null;
    }

    return twilio(accountSid, authToken);
  }

  async send(phoneNumber: string, message: string): Promise<SmsSendResult> {
    if (!this.client || !this.fromNumber) {
      return {
        phoneNumber,
        status: 'error',
        message: 'Twilio is not configured',
        errorCode: 'NotConfigured',
      };
    }

    try {
      const sent = await this.client.messages.create({
        to: phoneNumber,
        from: this.fromNumber,
        body: message,
      });

      return { phoneNumber, status: 'ok', messageId: sent.sid };
    } catch (error) {
      // Per-call catch, not a rethrow: a caller sending to several contacts
      // gets one result per number and one bad number never aborts the batch.
      const code = (error as { code?: string | number }).code;
      const description =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `SMS send failed${code ? ` (provider code ${code})` : ''}`,
      );

      return {
        phoneNumber,
        status: 'error',
        message: description,
        errorCode: code === undefined ? undefined : String(code),
      };
    }
  }
}
