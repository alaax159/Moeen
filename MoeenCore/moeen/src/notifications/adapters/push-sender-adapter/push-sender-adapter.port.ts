export type PushMessageInput = {
  tokens: string[];
  title: string;
  body: string;
  categoryId?: string;
  data?: Record<string, unknown>;
};

/** errorCode carries Expo's details.error value (e.g. 'DeviceNotRegistered') without leaking expo-server-sdk types past this port. */
export type PushSendResult =
  | { token: string; status: 'ok'; ticketId: string }
  | { token: string; status: 'error'; message: string; errorCode?: string };

export interface PushSenderPort {
  /** Result array is always the same length and order as tokens in. */
  send(message: PushMessageInput): Promise<PushSendResult[]>;
}

export const PUSH_SENDER_PORT = Symbol('PUSH_SENDER_PORT');
