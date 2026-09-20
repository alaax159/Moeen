import { Logger } from '@nestjs/common';

import {
  TwilioMessagingClient,
  TwilioSmsAdapter,
} from './sms-sender-adapter.service';

const FROM = '+15550001111';
const TO = '+15557654321';

function buildAdapter(
  create: jest.Mock = jest.fn().mockResolvedValue({ sid: 'SM123' }),
) {
  const client: TwilioMessagingClient = { messages: { create } };
  return { adapter: new TwilioSmsAdapter(client), create };
}

describe('TwilioSmsAdapter', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.TWILIO_FROM_NUMBER = FROM;
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    errorSpy.mockRestore();
  });

  it('sends via the configured from-number and returns the message SID', async () => {
    const { adapter, create } = buildAdapter(
      jest.fn().mockResolvedValue({ sid: 'SMabc' }),
    );

    const result = await adapter.send(TO, 'Moeen safety alert');

    expect(create).toHaveBeenCalledWith({
      to: TO,
      from: FROM,
      body: 'Moeen safety alert',
    });
    expect(result).toEqual({
      phoneNumber: TO,
      status: 'ok',
      messageId: 'SMabc',
    });
  });

  it('returns an error result carrying the provider code when the send throws', async () => {
    const { adapter } = buildAdapter(
      jest.fn().mockRejectedValue(
        Object.assign(new Error('The "To" number is not valid'), {
          code: 21211,
        }),
      ),
    );

    const result = await adapter.send(TO, 'body');

    expect(result).toEqual({
      phoneNumber: TO,
      status: 'error',
      message: 'The "To" number is not valid',
      errorCode: '21211',
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = String(errorSpy.mock.calls[0][0]);

    expect(loggedMessage).toContain('provider code 21211');
    expect(loggedMessage).not.toContain(TO);
    expect(loggedMessage).not.toContain('The "To" number is not valid');
  });

  it('returns NotConfigured without calling Twilio when no client is available', async () => {
    // No injected client, and TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN unset.
    const adapter = new TwilioSmsAdapter();

    const result = await adapter.send(TO, 'body');

    expect(result).toEqual({
      phoneNumber: TO,
      status: 'error',
      message: 'Twilio is not configured',
      errorCode: 'NotConfigured',
    });
  });

  it('returns NotConfigured when a client exists but no from-number is set', async () => {
    delete process.env.TWILIO_FROM_NUMBER;
    const { adapter, create } = buildAdapter();

    const result = await adapter.send(TO, 'body');

    expect(result.status).toBe('error');
    expect((result as { errorCode?: string }).errorCode).toBe('NotConfigured');
    expect(create).not.toHaveBeenCalled();
  });
});
