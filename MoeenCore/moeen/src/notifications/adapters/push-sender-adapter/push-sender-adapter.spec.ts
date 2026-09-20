import { Expo, ExpoPushTicket } from 'expo-server-sdk';
import { ExpoPushSenderAdapter } from './push-sender-adapter.service';

const TOKEN_A = 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]';
const TOKEN_B = 'ExponentPushToken[BBBBBBBBBBBBBBBBBBBBBB]';

function buildAdapter(sendResult: ExpoPushTicket[]) {
  const expoClient = {
    sendPushNotificationsAsync: jest.fn().mockResolvedValue(sendResult),
  };

  return {
    adapter: new ExpoPushSenderAdapter(expoClient as unknown as Expo),
    expoClient,
  };
}

describe('ExpoPushSenderAdapter', () => {
  it('returns ok results in the same order as the input tokens', async () => {
    const { adapter, expoClient } = buildAdapter([
      { status: 'ok', id: 'ticket-a' },
      { status: 'ok', id: 'ticket-b' },
    ]);

    const results = await adapter.send({
      tokens: [TOKEN_A, TOKEN_B],
      title: 'Medication reminder',
      body: 'Time to take your medication',
    });

    expect(results).toEqual([
      { token: TOKEN_A, status: 'ok', ticketId: 'ticket-a' },
      { token: TOKEN_B, status: 'ok', ticketId: 'ticket-b' },
    ]);
    expect(expoClient.sendPushNotificationsAsync).toHaveBeenCalledWith([
      expect.objectContaining({ to: TOKEN_A }),
      expect.objectContaining({ to: TOKEN_B }),
    ]);
  });

  it('associates each ticket with its own token, not by coincidental order', async () => {
    // Deliberately non-trivial: token B's ticket (index 0) is the error,
    // token A's ticket (index 1) is ok — proves per-token association isn't
    // just "first result goes to first token" by accident.
    const { adapter } = buildAdapter([
      {
        status: 'error',
        message: 'device not registered',
        details: { error: 'DeviceNotRegistered' },
      },
      { status: 'ok', id: 'ticket-a' },
    ]);

    const results = await adapter.send({
      tokens: [TOKEN_B, TOKEN_A],
      title: 't',
      body: 'b',
    });

    expect(results).toEqual([
      {
        token: TOKEN_B,
        status: 'error',
        message: 'device not registered',
        errorCode: 'DeviceNotRegistered',
      },
      { token: TOKEN_A, status: 'ok', ticketId: 'ticket-a' },
    ]);
  });

  it('rejects a malformed token locally without sending it to Expo, while still sending the valid one', async () => {
    const { adapter, expoClient } = buildAdapter([
      { status: 'ok', id: 'ticket-a' },
    ]);

    const results = await adapter.send({
      tokens: ['not-a-real-token', TOKEN_A],
      title: 't',
      body: 'b',
    });

    expect(results).toEqual([
      {
        token: 'not-a-real-token',
        status: 'error',
        message: 'Invalid Expo push token',
        errorCode: 'InvalidToken',
      },
      { token: TOKEN_A, status: 'ok', ticketId: 'ticket-a' },
    ]);
    expect(expoClient.sendPushNotificationsAsync).toHaveBeenCalledWith([
      expect.objectContaining({ to: TOKEN_A }),
    ]);
  });

  it('returns an empty array and never calls Expo when given zero tokens', async () => {
    const { adapter, expoClient } = buildAdapter([]);

    const results = await adapter.send({ tokens: [], title: 't', body: 'b' });

    expect(results).toEqual([]);
    expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });
});
