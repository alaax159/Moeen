import { parseTrustProxyHops } from './trust-proxy.config';

describe('parseTrustProxyHops', () => {
  it.each([undefined, '', '0'])(
    'defaults %s to direct-client IP handling',
    (value) => expect(parseTrustProxyHops(value)).toBe(0),
  );

  it('accepts an explicit safe proxy hop count', () => {
    expect(parseTrustProxyHops('2')).toBe(2);
  });

  it.each(['true', '-1', '1.5', '11', 'client-ip'])('rejects %s', (value) => {
    expect(() => parseTrustProxyHops(value)).toThrow('TRUST_PROXY_HOPS');
  });
});
