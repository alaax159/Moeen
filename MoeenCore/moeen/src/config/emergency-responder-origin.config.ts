const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function parseEmergencyResponderOrigin(
  value: string | undefined,
): string | null {
  if (value === undefined || value === '') return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EMERGENCY_RESPONDER_ORIGIN must be a valid origin');
  }

  const isSecure = url.protocol === 'https:';
  const isLocalHttp =
    url.protocol === 'http:' && LOCAL_DEVELOPMENT_HOSTS.has(url.hostname);
  if (
    (!isSecure && !isLocalHttp) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      'EMERGENCY_RESPONDER_ORIGIN must be an HTTPS origin (HTTP localhost is allowed)',
    );
  }

  return url.origin;
}
