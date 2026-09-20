import { parseBearerToken } from './bearer-token';

describe('parseBearerToken', () => {
  it('returns the token from one canonical Bearer header', () => {
    expect(parseBearerToken('Bearer signed-token')).toBe('signed-token');
  });

  it.each([
    undefined,
    '',
    'Basic signed-token',
    'bearer signed-token',
    'Bearer',
    'Bearer ',
    'Bearer  signed-token',
    'Bearer signed-token trailing-data',
    ' Bearer signed-token',
  ])('rejects a malformed or ambiguous header (%s)', (authorization) => {
    expect(parseBearerToken(authorization)).toBeNull();
  });
});
