import { Injectable, Optional } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

import { PushMessageInput, PushSendResult, PushSenderPort } from './push-sender-adapter.port';

@Injectable()
export class ExpoPushSenderAdapter implements PushSenderPort {
  // No Expo provider is registered anywhere, so @Optional() lets Nest resolve
  // this to undefined instead of throwing, and the default then constructs a
  // real client. Tests construct `new ExpoPushSenderAdapter(fakeExpoClient)`
  // directly, the same way SafetyResultAdapter is constructed with a fake repo.
  constructor(@Optional() private readonly expoClient: Expo = new Expo()) {}

  async send(message: PushMessageInput): Promise<PushSendResult[]> {
    const validTokens: string[] = [];
    const invalidResults: PushSendResult[] = [];

    for (const token of message.tokens) {
      if (Expo.isExpoPushToken(token)) {
        validTokens.push(token);
      } else {
        invalidResults.push({
          token,
          status: 'error',
          message: 'Invalid Expo push token',
          errorCode: 'InvalidToken',
        });
      }
    }

    let tickets: ExpoPushTicket[] = [];

    if (validTokens.length > 0) {
      const messages: ExpoPushMessage[] = validTokens.map((token) => ({
        to: token,
        title: message.title,
        body: message.body,
        categoryId: message.categoryId,
        data: message.data,
      }));

      tickets = await this.expoClient.sendPushNotificationsAsync(messages);
    }

    // Expo's ticket array is positionally aligned to the messages actually
    // sent (valid tokens only), not tagged with the token itself — zip by
    // index to reconstruct the association, then merge with the pre-built
    // invalid-token results, keyed back onto the original token so the
    // output preserves message.tokens' order.
    const resultByToken = new Map<string, PushSendResult>();

    for (const result of invalidResults) {
      resultByToken.set(result.token, result);
    }

    validTokens.forEach((token, index) => {
      const ticket = tickets[index];
      resultByToken.set(token, this.toResult(token, ticket));
    });

    return message.tokens.map((token) => resultByToken.get(token)!);
  }

  private toResult(token: string, ticket: ExpoPushTicket): PushSendResult {
    if (ticket.status === 'ok') {
      return { token, status: 'ok', ticketId: ticket.id };
    }

    return {
      token,
      status: 'error',
      message: ticket.message,
      errorCode: ticket.details?.error,
    };
  }
}
