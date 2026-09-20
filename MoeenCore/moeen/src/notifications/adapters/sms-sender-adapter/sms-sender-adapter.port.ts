/**
 * errorCode carries the provider's own error code (e.g. Twilio's numeric code
 * as a string) without leaking the SDK's types past this port. 'NotConfigured'
 * is used when no credentials are set, so a caller can tell "not wired up" from
 * "the send failed".
 */
export type SmsSendResult =
  | { phoneNumber: string; status: 'ok'; messageId: string }
  | {
      phoneNumber: string;
      status: 'error';
      message: string;
      errorCode?: string;
    };

export interface SmsSenderPort {
  /** One result per call, keyed back to the number that was passed in. */
  send(phoneNumber: string, message: string): Promise<SmsSendResult>;
}

export const SMS_SENDER_PORT = Symbol('SMS_SENDER_PORT');
