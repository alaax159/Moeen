import { createHash, timingSafeEqual } from 'node:crypto';

export interface BasicCredentials {
  username: string;
  password: string;
}

/**
 * The shortest password an operational surface may be opened with. These
 * surfaces sit outside Firebase auth and are reachable by anyone who can
 * resolve the host, so the credential is the only thing in front of them.
 */
export const MINIMUM_PASSWORD_LENGTH = 16;

export function parseBasicCredentials(
  authorization: string | undefined,
): BasicCredentials | null {
  const match = authorization
    ? /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(authorization)
    : null;
  if (!match) return null;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator <= 0) return null;

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/**
 * Compares both halves in constant time, and always compares both, so neither
 * the outcome nor the duration reveals which half was wrong.
 */
export function matchesCredentials(
  supplied: BasicCredentials | null,
  expected: BasicCredentials,
): boolean {
  const usernameMatches = timingSafeEqual(
    digest(supplied?.username ?? ''),
    digest(expected.username),
  );
  const passwordMatches = timingSafeEqual(
    digest(supplied?.password ?? ''),
    digest(expected.password),
  );

  return supplied !== null && usernameMatches && passwordMatches;
}

/**
 * Fails startup rather than serving a surface with a missing or weak
 * credential — an operational surface that cannot be protected must not be
 * enabled at all.
 */
export function requireCredentials(
  username: string | undefined,
  password: string | undefined,
  variableNames: string,
): BasicCredentials {
  const trimmedUsername = username?.trim();

  if (!trimmedUsername || !password) {
    throw new Error(`${variableNames} are required when it is enabled`);
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `The password must contain at least ${MINIMUM_PASSWORD_LENGTH} characters`,
    );
  }

  return { username: trimmedUsername, password };
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
