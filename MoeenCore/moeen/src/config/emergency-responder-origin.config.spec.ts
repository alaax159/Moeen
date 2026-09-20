import { parseEmergencyResponderOrigin } from './emergency-responder-origin.config';

describe('parseEmergencyResponderOrigin', () => {
  it.each([undefined, ''])(
    'keeps CORS disabled when configuration is %s',
    (value) => expect(parseEmergencyResponderOrigin(value)).toBeNull(),
  );

  it('normalizes a configured HTTPS origin', () => {
    expect(parseEmergencyResponderOrigin('https://responder.example/')).toBe(
      'https://responder.example',
    );
  });

  it('allows HTTP only for local development', () => {
    expect(parseEmergencyResponderOrigin('http://localhost:8081')).toBe(
      'http://localhost:8081',
    );
  });

  it.each([
    'not-an-origin',
    'http://responder.example',
    'https://user:secret@responder.example',
    'https://responder.example/e',
    'https://responder.example?source=app',
    'https://responder.example#token',
  ])('rejects unsafe configuration %s', (value) => {
    expect(() => parseEmergencyResponderOrigin(value)).toThrow(
      'EMERGENCY_RESPONDER_ORIGIN',
    );
  });
});
